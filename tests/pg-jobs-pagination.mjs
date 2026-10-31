// The actual HTTP endpoint and cursor predicate against an isolated PostgreSQL schema.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freshPostgres, connectionString } from './pg-support.mjs';
import { startApiProcess } from './support/api-process.mjs';
import { apiCaller } from './support/api.mjs';
import { defaultSettings, quote } from '../src/model.ts';

const { schema, database } = await freshPostgres('jobspages');
let api;
try {
  const now = Date.now(), token = randomBytes(32).toString('hex');
  const customer = await database.run(`INSERT INTO users(phone,name,password,role,status,created_at,phone_verified_at)
    VALUES('0599700201','Synthetic customer','','customer','active',?,?)`, now, now);
  const driver = await database.run(`INSERT INTO users(phone,name,password,role,status,vehicle,created_at,phone_verified_at,approved_at)
    VALUES('0599700202','Synthetic driver','','driver','active','car',?,?,?)`, now, now, now);
  await database.run('INSERT INTO sessions(token_hash,user_id,created_at) VALUES(?,?,?)',
    createHash('sha256').update(token).digest('hex'), driver.lastInsertRowid, now);
  await database.run(`INSERT INTO orders(customer_id,service,shared,pickup_city,dropoff_city,pickup_note,dropoff_note,contact,detail,option,loading_help,price,status,created_at,updated_at)
    SELECT ?,'parcel',0,'ramallah','nablus','Shop','Home','0599700201','Box','small',0,20,'searching',?,? FROM generate_series(1,120)`, customer.lastInsertRowid, now, now);
  const rows = await database.all("SELECT id FROM orders WHERE status='searching' ORDER BY id");
  await database.run('UPDATE orders SET scheduled_for=? WHERE id=?', now, rows[19].id);
  await database.run('INSERT INTO order_releases(order_id,driver_id,released_at) VALUES(?,?,?)', rows[53].id, driver.lastInsertRowid, now);
  api = await startApiProcess({ DB_PATH: join(mkdtempSync(join(tmpdir(), 'wind-pg-jobs-')), 'unused.db'), WIND_DATABASE_URL: connectionString,
    WIND_POSTGRES_TEST_ONLY: '1', WIND_POSTGRES_TEST_SCHEMA: schema });
  const call = apiCaller(() => api.base);
  const legacy = await call('/jobs', { token });
  assert.equal(legacy.length, 50);
  const first = await call('/jobs?page=1', { token });
  assert.equal(first.version, 1);
  assert.equal(first.jobs.at(-1).scheduledFor, now);
  assert.equal(first.nextCursor, `${now}:${rows[19].id}`);
  const pages = [first];
  while (pages.at(-1).nextCursor && pages.length < 10)
    pages.push(await call(`/jobs?page=1&after=${encodeURIComponent(pages.at(-1).nextCursor)}`, { token }));
  const expected = rows.map(row => Number(row.id)).filter(id => id !== Number(rows[53].id));
  assert.equal(pages.length, 6);
  assert.deepEqual(pages.flatMap(page => page.jobs).map(job => job.id), expected);
  assert.equal(pages.at(-1).nextCursor, null);
  // T21: concurrent creates cannot slip past the per-customer searching cap on PostgreSQL — the advisory
  // lock and the count share each create's transaction, so exactly the cap of N concurrent posts succeed.
  const capToken = randomBytes(32).toString('hex');
  const capCustomer = await database.run(`INSERT INTO users(phone,name,password,role,status,created_at,phone_verified_at)
    VALUES('0599700203','Capped customer','','customer','active',?,?)`, now, now);
  await database.run('INSERT INTO sessions(token_hash,user_id,created_at) VALUES(?,?,?)',
    createHash('sha256').update(capToken).digest('hex'), capCustomer.lastInsertRowid, now);
  const capInput = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599700203', detail: 'Box' };
  const capPrice = quote(defaultSettings, capInput);
  const attempts = await Promise.all(Array.from({ length: 9 }, () =>
    call('/orders', { token: capToken, body: { ...capInput, quotedPrice: capPrice } }).then(order => order.id, error => error)));
  const created = attempts.filter(value => typeof value === 'number');
  const refused = attempts.filter(value => typeof value !== 'number');
  assert.equal(created.length, 5, `exactly the cap of searching orders is created: ${created.length}`);
  assert.ok(refused.every(error => error.message.includes('too_many_searching')), `the rest carry the cap code: ${refused.map(error => error.message.slice(0, 60)).join(' | ')}`);
  console.log('PostgreSQL driver job pages: real HTTP, six pages, scheduled boundary, release filter and the concurrent searching cap passed');
} finally {
  await api?.stop();
  await database.close();
}
