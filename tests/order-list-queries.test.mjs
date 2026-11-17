// T43.2: GET /api/orders costs a fixed number of queries per page, not a few more per order row, and the
// batched list carries exactly what the single-order read shows. pg-order-list-queries.mjs reruns this on PostgreSQL.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-order-queries-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { shutdown, server, persistence } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
const pg = persistence.backend === 'postgres';

// Every statement reaches the database through query(); count those issued while one request runs.
const query = persistence.query.bind(persistence);
let statements = [];
persistence.query = (sql, params) => { statements.push(sql); return query(sql, params); };
async function measure(token) {
  statements = [];
  const orders = await call('/orders', { token });
  return { orders, queries: statements.length, sql: statements };
}

try {
  const now = Date.now(), run = (sql, ...args) => persistence.run(sql, ...args);
  let phones = 0;
  const actor = async role => {
    const id = Number((await run('INSERT INTO users(phone,name,password,role,status,vehicle,created_at,approved_at) VALUES(?,?,?,?,?,?,?,?)',
      `05991200${String(++phones).padStart(2, '0')}`, `Query ${role} ${phones}`, '', role, 'active', role === 'driver' ? 'van' : null, now, now)).lastInsertRowid);
    const token = randomBytes(32).toString('hex');
    await run('INSERT INTO sessions(token_hash,user_id,created_at,last_seen_at) VALUES(?,?,?,?)', createHash('sha256').update(token).digest('hex'), id, now, now);
    return { id, token };
  };
  const order = async (customer, driver, status, recommended = null) => Number((await run(`INSERT INTO orders(customer_id,driver_id,service,shared,pickup_city,dropoff_city,
    pickup_note,dropoff_note,contact,detail,option,loading_help,price,commission,status,handover_code,created_at,updated_at,completed_at,assigned_at,recommended_price)
    VALUES(?,?,'parcel',0,'ramallah','nablus','Gate','Door','0599000000','Box','small',0,20,3,?,'1234',?,?,?,?,?)`,
    customer, driver, status, now, now, status === 'completed' ? now : null, driver ? now : null, recommended)).lastInsertRowid);
  const free = await actor('driver'), admin = await actor('admin');
  // Two identical boards, one five times larger: open work of every kind, offers, safety reports and history.
  const board = async size => {
    const customer = await actor('customer'), driver = await actor('driver');
    for (let i = 0; i < size; i++) {
      const moving = await order(customer.id, driver.id, 'in_transit');
      await run(`INSERT INTO safety_incidents(order_id,reporter_id,reporter_role,kind,status,created_at) VALUES(?,?,'customer','other','resolved',?)`, moving, customer.id, now);
      await run(`INSERT INTO safety_incidents(order_id,reporter_id,reporter_role,kind,status,created_at) VALUES(?,?,'customer','harassment','open',?)`, moving, customer.id, now);
      const searching = await order(customer.id, null, 'searching', 25);
      await run('INSERT INTO order_offers(order_id,driver_id,price,created_at) VALUES(?,?,?,?)', searching, free.id, 22 + i, now);
      await order(customer.id, driver.id, 'completed');
      if (pg) {
        await run(`INSERT INTO dispatch_rounds(id,order_id,round_number,state,close_reason,started_at,deadline_at,closed_at) VALUES(?,?,1,'exhausted','no_driver',?,?,?)`,
          randomUUID(), searching, now - 9, now - 5, now - 5);
        await run(`INSERT INTO dispatch_rounds(id,order_id,round_number,state,started_at,deadline_at) VALUES(?,?,2,'open',?,?)`, randomUUID(), searching, now, now + 60_000);
        await run(`INSERT INTO ride_lifecycle(order_id,driver_id,assignment_epoch,boarding_code,boarding_required,created_at,updated_at) VALUES(?,?,0,'1234',1,?,?)`,
          moving, driver.id, now, now);
        await run('INSERT INTO ride_boarding_attempts(order_id,assignment_epoch,failures) VALUES(?,0,?)', moving, i);
        await run(`INSERT INTO order_declared_scope(order_id,service,item_count,length_mm,width_mm,height_mm,mass_grams,volume_cm3,declared_value_minor,created_at,updated_at)
          VALUES(?,'parcel',1,100,100,100,500,1000,0,?,?)`, moving, now, now);
      }
    }
    return { customer, driver };
  };
  const small = await board(2), large = await board(10);

  for (const [who, a, b] of [['customer', small.customer, large.customer], ['driver', small.driver, large.driver]]) {
    const few = await measure(a.token), many = await measure(b.token);
    assert.ok(many.orders.length > few.orders.length, `${who}: the larger board returns more rows`);
    assert.equal(many.queries, few.queries, `${who}: ${few.orders.length} rows took ${few.queries} queries but ${many.orders.length} took ${many.queries}\n${many.sql.join('\n')}`);
    console.log(`${persistence.backend} ${who}: ${few.orders.length} rows / ${few.queries} queries; ${many.orders.length} rows / ${many.queries} queries`);
    // The batched list and the per-order read agree on every summary they share.
    for (const listed of many.orders) {
      const single = await call(`/orders/${listed.id}`, { token: b.token });
      for (const key of ['dispatch', 'ride', 'declaredScope', 'destinationChange', 'safetyReport', 'offers'])
        assert.deepEqual(listed[key], single[key], `${who} order ${listed.id} ${key}`);
    }
  }
  const customerOrders = (await measure(large.customer.token)).orders;
  assert.ok(customerOrders.some(o => o.offers?.length && o.safetyReport === null) && customerOrders.some(o => o.safetyReport?.kind === 'harassment'),
    'fixtures reach the offer and safety-report summaries');
  if (pg) assert.ok(customerOrders.some(o => o.dispatch?.state === 'open') && customerOrders.some(o => o.ride?.boardingRequired) && customerOrders.some(o => o.declaredScope),
    'fixtures reach the dispatch, ride and declared-scope summaries');
  const adminPage = await measure(admin.token);
  assert.equal(adminPage.orders.length, 36, 'admin sees both boards');
  console.log(`${persistence.backend} admin: ${adminPage.orders.length} rows / ${adminPage.queries} queries`);
  console.log('PASS order list query count is per page, not per row, and matches the single-order read');
} finally {
  persistence.query = query;
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
