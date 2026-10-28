// Real HTTP processes sharing one synthetic SQLite database: no in-memory mutex can decide the winner.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startApiProcess } from './support/api-process.mjs';

const path = join(mkdtempSync(join(tmpdir(), 'wind-process-claims-')), 'synthetic.db');
const first = await startApiProcess({ DB_PATH: path });
let second;
try {
  const inspect = new DatabaseSync(path);
  inspect.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000');
  const now = Date.now();
  const actors = [];
  const user = inspect.prepare('INSERT INTO users(phone,name,password,role,status,vehicle,created_at,phone_verified_at,approved_at) VALUES(?,?,?,?,?,?,?,?,?)');
  const session = inspect.prepare('INSERT INTO sessions(token_hash,user_id,created_at) VALUES(?,?,?)');
  for (let index = 0; index <= 100; index++) {
    const role = index === 0 ? 'customer' : 'driver';
    const id = Number(user.run(`059${String(7_000_000 + index)}`, `Synthetic ${role} ${index}`, '', role, 'active',
      role === 'driver' ? 'car' : null, now, now, now).lastInsertRowid);
    const token = randomBytes(32).toString('hex');
    session.run(createHash('sha256').update(token).digest('hex'), id, now);
    actors.push({ id, token });
  }
  const booking = inspect.prepare(`INSERT INTO orders(customer_id,service,shared,pickup_city,dropoff_city,pickup_note,dropoff_note,contact,
    detail,option,loading_help,price,status,created_at,updated_at) VALUES(?,?,0,'ramallah','bireh','Synthetic pickup','Synthetic destination',
    '0597000000','Synthetic trip',?,0,20,'searching',?,?)`);
  const book = (service = 'ride') => Number(booking.run(actors[0].id, service, service === 'ride' ? '1' : 'small', now, now).lastInsertRowid);
  const orderId = book();
  const otherId = book();
  second = await startApiProcess({ DB_PATH: path });
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
  const claimed = inspect.prepare('SELECT driver_id,status FROM orders WHERE id=?').get(orderId);
  assert.equal(claimed.status, 'assigned');
  const winner = actors.find(actor => actor.id === claimed.driver_id);
  assert.ok(winner);
  assert.equal((await accept(otherId, winner, second)).status, 409, 'an exclusively committed driver cannot claim a second ride');
  assert.equal(inspect.prepare('SELECT driver_id,status FROM orders WHERE id=?').get(otherId).status, 'searching');
  const available = actors.slice(1).filter(actor => actor !== winner);
  const rides = [book(), book()];
  const exclusive = await Promise.all(rides.map((id, index) => accept(id, available[0], servers[index])));
  assert.equal(exclusive.filter(result => result.status === 200).length, 1, 'one driver racing for two rides gets one commitment');
  const mixedOrders = [book(), book('parcel')];
  const mixed = await Promise.all(mixedOrders.map((id, index) => accept(id, available[1], servers[index])));
  assert.equal(mixed.filter(result => result.status === 200).length, 1, 'ride-versus-parcel race cannot create mixed work');
  const parcels = [book('parcel'), book('parcel')];
  const batch = await Promise.all(parcels.map((id, index) => accept(id, available[2], servers[index])));
  assert.equal(batch.filter(result => result.status === 200).length, 2, 'courier batches retain distinct multi-parcel behavior');
  assert.deepEqual(inspect.prepare('PRAGMA foreign_key_check').all(), []);
  inspect.close();
  console.log('Cross-process claims: 100 contenders/one winner; exclusive and mixed-mode races safe; parcel batching preserved across two HTTP servers');
} finally {
  await Promise.all([first.stop(), second?.stop()]);
}
