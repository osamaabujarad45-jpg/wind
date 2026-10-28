import {freshPostgres,connectionString} from './pg-support.mjs';
// Real HTTP processes sharing one synthetic PostgreSQL database: no in-memory mutex can decide the winner.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApiProcess } from './support/api-process.mjs';

const path = join(mkdtempSync(join(tmpdir(), 'wind-process-claims-')), 'synthetic.db');
const {schema,database:inspect}=await freshPostgres('claims');
const storage={DB_PATH:path,WIND_DATABASE_URL:connectionString,WIND_POSTGRES_TEST_ONLY:'1',WIND_POSTGRES_TEST_SCHEMA:schema};
const first=await startApiProcess(storage);
let second;
try {

  const now = Date.now();
  const actors = [];
  const user = {run: async (...p)=>inspect.run('INSERT INTO users(phone,name,password,role,status,vehicle,created_at,phone_verified_at,approved_at) VALUES(?,?,?,?,?,?,?,?,?)',...p)};
  const session = {run: async (...p)=>inspect.run('INSERT INTO sessions(token_hash,user_id,created_at) VALUES(?,?,?)',...p)};
  for (let index = 0; index <= 100; index++) {
    const role = index === 0 ? 'customer' : 'driver';
    const id = Number((await user.run(`059${String(7_000_000 + index)}`, `Synthetic ${role} ${index}`, '', role, 'active',
      role === 'driver' ? 'car' : null, now, now, now)).lastInsertRowid);
    const token = randomBytes(32).toString('hex');
    await session.run(createHash('sha256').update(token).digest('hex'), id, now);
    actors.push({ id, token });
  }
  const bookingSql = `INSERT INTO orders(customer_id,service,shared,pickup_city,dropoff_city,pickup_note,dropoff_note,contact,
    detail,option,loading_help,price,status,created_at,updated_at) VALUES(?,?,0,'ramallah','bireh','Synthetic pickup','Synthetic destination',
    '0597000000','Synthetic trip',?,0,20,'searching',?,?)`;
  const book = async (service='ride') => Number((await inspect.run(bookingSql,actors[0].id,service,service==='ride'?'1':'small',now,now)).lastInsertRowid);
  const orderId = await book();
  const otherId = await book();
  second = await startApiProcess(storage);
  const servers = [first, second];
  async function accept(id, actor, target) {
    const response = await fetch(`${target.base}/jobs/${id}/accept`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actor.token}` }, body: '{}' });
    return { status: response.status, body: await response.json() };
  }
  const results = await Promise.all(actors.slice(1).map((actor, index) => accept(orderId, actor, servers[index % 2])));
  const outcomes = results.reduce((counts, result) => {
    const key = `${result.status}:${result.body.error ?? 'assigned'}`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  assert.equal(results.filter(result => result.status === 200).length, 1,
    `100 contenders must produce exactly one assignment: ${JSON.stringify(outcomes)}`);
  // A driver arriving after assignment receives the existing privacy-preserving 404 view.
  for (const result of results) assert.ok([200, 404, 409, 503].includes(result.status), JSON.stringify(result));
  const claimed = (await inspect.one('SELECT driver_id,status FROM orders WHERE id=?',orderId));
  assert.equal(claimed.status, 'assigned');
  const winner = actors.find(actor => actor.id === claimed.driver_id);
  assert.ok(winner);
  assert.equal((await accept(otherId, winner, second)).status, 409, 'an exclusively committed driver cannot claim a second ride');
  assert.equal((await inspect.one('SELECT driver_id,status FROM orders WHERE id=?',otherId)).status, 'searching');
  const available = actors.slice(1).filter(actor => actor !== winner);
  const rides = [await book(), await book()];
  const exclusive = await Promise.all(rides.map((id, index) => accept(id, available[0], servers[index])));
  assert.equal(exclusive.filter(result => result.status === 200).length, 1, 'one driver racing for two rides gets one commitment');
  const mixedOrders = [await book(), await book('parcel')];
  const mixed = await Promise.all(mixedOrders.map((id, index) => accept(id, available[1], servers[index])));
  assert.equal(mixed.filter(result => result.status === 200).length, 1, 'ride-versus-parcel race cannot create mixed work');
  const parcels = [await book('parcel'), await book('parcel')];
  const batch = await Promise.all(parcels.map((id, index) => accept(id, available[2], servers[index])));
  assert.equal(batch.filter(result => result.status === 200).length, 2, 'courier batches retain distinct multi-parcel behavior');

  await assert.rejects(inspect.run("UPDATE orders SET driver_id=?,status='assigned' WHERE id=?",winner.id,otherId),/incompatible active driver commitment/,
    'direct SQL also enforces exclusive commitments');
  // Keep the legacy count guard until measured WP05 capacity exists; reserve the last slot under the driver/run lock.
  const courier=available[3];
  await inspect.run(`INSERT INTO orders(customer_id,driver_id,service,shared,pickup_city,dropoff_city,pickup_note,dropoff_note,contact,
    detail,option,loading_help,price,status,created_at,updated_at)
    SELECT ?,?,'parcel',0,'ramallah','bireh','Synthetic','Synthetic','0597000000','Synthetic','small',0,20,'assigned',?,? FROM generate_series(1,199)`,actors[0].id,courier.id,now,now);
  const lastSlots=[await book('parcel'),await book('parcel')];
  const capacity=await Promise.all(lastSlots.map((id,index)=>accept(id,courier,servers[index])));
  assert.equal(capacity.filter(r=>r.status===200).length,1,'last parcel slot cannot be double-reserved');
  assert.equal((await inspect.one("SELECT count(*) count FROM orders WHERE driver_id=? AND status='assigned'",courier.id)).count,200);

  console.log('Cross-process claims: 100 contenders/one winner; exclusive/mixed-mode guards; multi-parcel batching and last-of-200 capacity race across two PostgreSQL HTTP servers passed');
} finally {
  await Promise.all([first.stop(), second?.stop()]);
  await inspect.close();
}
