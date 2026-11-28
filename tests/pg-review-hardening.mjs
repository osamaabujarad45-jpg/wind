import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { FakePaymentsProvider } from '../server/domain/payments.ts';
import { freshPostgres, selectRuntime } from './pg-support.mjs';
import { apiCaller } from './support/api.mjs';

const { schema, database } = await freshPostgres('review126');
selectRuntime(schema);
Object.assign(process.env, { WIND_PAYMENTS_TEST_ONLY: '1', WIND_PROFILE_SWITCHING: '0', WIND_ENABLED_SERVICES: 'parcel',
  WIND_IDENTITY_MODE: '', WIND_CONTACT_VERIFICATION_REQUIRED: 'false' });
const { server, persistence, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const call = apiCaller(() => base);
const post = async (path, token, body) => {
  const response = await fetch(base + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  return { status: response.status, body: await response.json() };
};
let phone = 599765000;
const account = async (role = 'customer') => {
  const { lastInsertRowid: id } = await database.run("INSERT INTO users(phone,name,password,role,status,vehicle,created_at) VALUES(?,'Review fixture','synthetic',?,'active',?,?)",
    `0${phone++}`, role, role === 'driver' ? 'car' : null, Date.now());
  const token = randomBytes(32).toString('hex'), hash = createHash('sha256').update(token).digest('hex');
  await database.run('INSERT INTO sessions(token_hash,user_id,created_at,last_seen_at) VALUES(?,?,?,?)', hash, id, Date.now(), Date.now());
  return { id, token, hash };
};
const barrier = () => ({ reached: Promise.withResolvers(), resume: Promise.withResolvers() });
const atBarrier = ({ reached }, request) => Promise.race([
  reached.promise, request.then(response => { throw new Error(`Request missed its barrier: ${response.status}`); }),
]);
const failures = [];
const check = async (label, work) => {
  try { await work(); } catch (error) { failures.push(new Error(label, { cause: error })); }
};
try {
  const admin = await account('admin'), support = await account('admin'), customer = await account();
  const book = () => call('/orders', { token: customer.token, body: {
    service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    contact: '0599765099', detail: 'Synthetic parcel', pickupNote: 'Synthetic pickup', dropoffNote: 'Synthetic dropoff',
  } });
  const grant = staffRole => call(`/admin/staff/${support.id}/role`, { token: admin.token, body: { staffRole, purpose: 'Synthetic authority check' } });
  await grant('support');

  await check('Payment reservation locks the order, and cancellation can complete during provider I/O', async () => {
    const order = await book();
    const { price_minor: amountMinor } = await database.one('SELECT price_minor FROM orders WHERE id=?', order.id);
    const path = `/orders/${order.id}/payments`;
    const cancel = () => post(`/orders/${order.id}/cancel`, customer.token, {});
    const insert = barrier();
    const one = persistence.one, providerCreate = FakePaymentsProvider.prototype.create;
    let lockCode, cancellation, providerInTransaction, providerCalls = 0;
    persistence.one = async function(sql, ...params) {
      if (sql.startsWith('INSERT INTO payment_intents(') && params[2] === order.id) {
        insert.reached.resolve();
        await insert.resume.promise;
      }
      return one.call(this, sql, ...params);
    };
    FakePaymentsProvider.prototype.create = async function(...args) {
      providerCalls++;
      providerInTransaction = persistence.inTransaction;
      if (lockCode === '55P03') cancellation = await cancel();
      return providerCreate.apply(this, args);
    };
    const payment = post(path, customer.token, { amountMinor });
    try {
      await atBarrier(insert, payment);
      try { await database.one('SELECT id FROM orders WHERE id=? FOR UPDATE NOWAIT', order.id); }
      catch (error) { lockCode = error.code; }
      if (!lockCode) cancellation = await cancel();
    } finally {
      insert.resume.resolve();
      try { await payment; }
      finally { persistence.one = one; FakePaymentsProvider.prototype.create = providerCreate; }
    }
    assert.equal(cancellation?.status, 200, JSON.stringify(cancellation));
    assert.equal((await payment).status, 200);
    assert.deepEqual({ lockCode, providerInTransaction, providerCalls }, { lockCode: '55P03', providerInTransaction: false, providerCalls: 1 });
    const alreadyCancelled = await book();
    await call(`/orders/${alreadyCancelled.id}/cancel`, { token: customer.token, body: {} });
    assert.deepEqual(await post(`/orders/${alreadyCancelled.id}/payments`, customer.token, { amountMinor }),
      { status: 409, body: { error: 'order_not_payable' } });
    assert.equal(await database.one('SELECT id FROM payment_intents WHERE order_id=?', alreadyCancelled.id), undefined);
  });

  await check('Support demotion during password reset', async () => {
    const victim = await account();
    const write = barrier(), execute = persistence.exec;
    persistence.exec = async function(command) {
      if (command === 'BEGIN') {
        persistence.exec = execute;
        write.reached.resolve();
        await write.resume.promise;
      }
      return execute.call(this, command);
    };
    const reset = post(`/admin/users/${victim.id}/password`, support.token, { attestation: 'Checked synthetic recovery evidence' });
    let response;
    try {
      await atBarrier(write, reset);
      await grant('dispatcher');
    } finally {
      write.resume.resolve();
      persistence.exec = execute;
      response = await reset;
      await grant('support');
    }
    assert.equal(response.status, 403, 'current authority must be read after the hash and inside the write transaction');
    assert.equal(response.body.error, 'forbidden');
    assert.ok(await database.one('SELECT 1 FROM sessions WHERE token_hash=?', victim.hash));
    assert.equal((await database.one('SELECT password FROM users WHERE id=?', victim.id)).password, 'synthetic');
  });

  await check('Demoted support cannot replay a proof reset', async () => {
    const order = await book();
    const driver = await account('driver');
    await database.run("UPDATE orders SET status='in_transit',driver_id=?,assigned_at=? WHERE id=?", driver.id, Date.now(), order.id);
    const { version } = await database.one('SELECT version FROM orders WHERE id=?', order.id);
    const path = `/admin/orders/${order.id}/proof-reset`;
    const body = { commandId: randomUUID(), expectedVersion: version, payload: { reason: 'Synthetic recovery proof' } };
    assert.deepEqual(await post(path, support.token, body), { status: 200, body: { ok: true } });
    assert.deepEqual(await post(path, support.token, body), { status: 200, body: { ok: true } });
    await grant('dispatcher');
    assert.deepEqual(await post(path, support.token, body), { status: 403, body: { error: 'forbidden' } });
    assert.equal((await database.one("SELECT count(*) AS n FROM security_events WHERE order_id=? AND action='PROOF_RESET'", order.id)).n, 1);
  });
  if (failures.length) throw new AggregateError(failures, 'PostgreSQL review regressions');
  console.log('PostgreSQL payment reservation and support authority regressions passed');
} finally {
  await shutdown();
  await database.run(`DROP SCHEMA "${schema}" CASCADE`);
  await database.close();
}
