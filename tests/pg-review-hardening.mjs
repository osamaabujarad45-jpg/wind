import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { FakePaymentsProvider } from '../server/domain/payments.ts';
import { freshPostgres, selectRuntime } from './pg-support.mjs';
import { apiCaller } from './support/api.mjs';

const { schema, database } = await freshPostgres('review126');
selectRuntime(schema);
Object.assign(process.env, { WIND_PAYMENTS_TEST_ONLY: '1', WIND_PROFILE_SWITCHING: '0', WIND_ENABLED_SERVICES: 'parcel',
  WIND_IDENTITY_MODE: '', WIND_CONTACT_VERIFICATION_REQUIRED: 'false' });
const { server, persistence, promote, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const call = apiCaller(() => base);
const request = async (path, token, body, method = 'POST') => {
  const response = await fetch(base + path, { method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  return { status: response.status, body: await response.json() };
};
const post = request;
let phone = 599765000;
const account = async (role = 'customer') => {
  const number = `0${phone++}`;
  const { lastInsertRowid: id } = await database.run("INSERT INTO users(phone,name,password,role,status,vehicle,created_at) VALUES(?,'Review fixture','synthetic',?,'active',?,?)",
    number, role, role === 'driver' ? 'car' : null, Date.now());
  const token = randomBytes(32).toString('hex'), hash = createHash('sha256').update(token).digest('hex');
  await database.run('INSERT INTO sessions(token_hash,user_id,created_at,last_seen_at) VALUES(?,?,?,?)', hash, id, Date.now(), Date.now());
  return { id, token, hash, phone: number };
};
const barrier = () => ({ reached: Promise.withResolvers(), resume: Promise.withResolvers() });
const atBarrier = ({ reached }, request) => Promise.race([
  reached.promise, request.then(response => { throw new Error(`Request missed its barrier: ${response.status}`); }),
]);
function pauseQuery(method, matches, gate = barrier()) {
  const original = persistence[method];
  persistence[method] = async function(sql, ...params) {
    if (matches(sql, params)) {
      gate.reached.resolve();
      await gate.resume.promise;
    }
    return original.call(this, sql, ...params);
  };
  return { ...gate, restore: () => { persistence[method] = original; } };
}
function pauseResetTarget(id) {
  const gate = barrier();
  const read = pauseQuery('one', (sql, params) =>
    sql.startsWith('SELECT * FROM users WHERE id = ? AND role') && sql.endsWith('FOR NO KEY UPDATE') && params[0] === id, gate);
  // The previous code goes straight to the update. Catch either path to run this test against both revisions.
  const write = pauseQuery('run', (sql, params) => sql.startsWith('UPDATE users SET password = ? WHERE id = ?') && params[1] === id, gate);
  return { ...gate, restore: () => { write.restore(); read.restore(); } };
}
const failures = [];
const check = async (label, work) => {
  try { await work(); } catch (error) { failures.push(new Error(label, { cause: error })); }
};
try {
  const admin = await account('admin'), support = await account('admin'), customer = await account();
  const book = (owner = customer) => call('/orders', { token: owner.token, body: {
    service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    contact: '0599765099', detail: 'Synthetic parcel', pickupNote: 'Synthetic pickup', dropoffNote: 'Synthetic dropoff',
  } });
  const grant = staffRole => call(`/admin/staff/${support.id}/role`, { token: admin.token, body: { staffRole, purpose: 'Synthetic authority check' } });
  const resetFor = (victim, actor = support) => post(`/admin/users/${victim.id}/password`, actor.token, { attestation: 'Checked synthetic recovery evidence' });
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

  await check('Payment reservation waits on the deleting user before locking their completed order', async () => {
    const owner = await account(), driver = await account('driver');
    const order = await book(owner);
    await database.run("UPDATE orders SET status='completed',driver_id=?,assigned_at=?,completed_at=? WHERE id=?", driver.id, Date.now(), Date.now(), order.id);
    const { price_minor: amountMinor } = await database.one('SELECT price_minor FROM orders WHERE id=?', order.id);
    const scrub = pauseQuery('run', (sql, params) => sql.startsWith("UPDATE orders SET contact = ''") && params[0] === owner.id);
    const reserve = pauseQuery('one', (sql, params) =>
      (sql.startsWith('SELECT id FROM users WHERE id=?') && sql.endsWith('FOR KEY SHARE') && params[0] === owner.id)
      || (sql.startsWith('INSERT INTO payment_intents(') && params[2] === order.id));
    const deletion = request(`/admin/users/${owner.id}`, admin.token, undefined, 'DELETE');
    let payment;
    try {
      await atBarrier(scrub, deletion);
      payment = post(`/orders/${order.id}/payments`, owner.token, { amountMinor });
      await atBarrier(reserve, payment);
      // The deletion holds the user. Its next lock (the order) must still be free while payment tries to reserve.
      assert.equal((await database.one('SELECT id FROM orders WHERE id=? FOR UPDATE NOWAIT', order.id)).id, order.id);
      scrub.resume.resolve();
      const deleted = await deletion;
      assert.equal(deleted.status, 200, JSON.stringify(deleted));
    } finally {
      scrub.resume.resolve(); reserve.resume.resolve();
      await Promise.allSettled([deletion, payment]);
      scrub.restore(); reserve.restore();
    }
    assert.deepEqual(await payment, { status: 401, body: { error: 'unauthorized' } });
    assert.equal(await database.one('SELECT id FROM payment_intents WHERE order_id=?', order.id), undefined);
  });

  await check('Staff authority admits the concurrent edit audit but excludes demotion', async () => {
    const victim = await account();
    const editAudit = pauseQuery('run', (sql, params) => sql.includes("'USER_UPDATED'") && params[0] === support.id);
    const resetTarget = pauseResetTarget(victim.id);
    const edit = post(`/admin/users/${victim.id}`, support.token, { name: 'Edited review fixture' });
    let reset;
    try {
      await atBarrier(editAudit, edit);
      reset = resetFor(victim);
      await atBarrier(resetTarget, reset);
      // The reset has locked support and still needs the target. The edit holds the target and needs this FK lock.
      assert.equal((await database.one('SELECT id FROM users WHERE id=? FOR KEY SHARE NOWAIT', support.id)).id, support.id);
      await assert.rejects(database.one('SELECT id FROM users WHERE id=? FOR NO KEY UPDATE NOWAIT', support.id), { code: '55P03' });
      editAudit.resume.resolve();
      const edited = await edit;
      assert.equal(edited.status, 200, JSON.stringify(edited));
    } finally {
      editAudit.resume.resolve(); resetTarget.resume.resolve();
      await Promise.allSettled([edit, reset]);
      resetTarget.restore(); editAudit.restore();
    }
    assert.equal((await reset).status, 200);
    assert.equal((await database.one("SELECT count(*) AS n FROM security_events WHERE actor_id=? AND action='USER_UPDATED'", support.id)).n, 1);
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
    const reset = resetFor(victim);
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

  for (const promoted of [true, false]) await check(`Support reset refuses ${promoted ? 'a newly promoted target' : 'a signed-out caller'}`, async () => {
    const victim = await account(), caller = await account('admin');
    const resetTarget = pauseResetTarget(victim.id);
    const reset = resetFor(victim, caller);
    try {
      await atBarrier(resetTarget, reset);
      if (promoted) await promote(victim.phone);
      else await call('/auth/logout', { token: caller.token, body: {} });
    } finally {
      resetTarget.resume.resolve();
      await Promise.allSettled([reset]);
      resetTarget.restore();
    }
    assert.deepEqual(await reset, promoted ? { status: 404, body: { error: 'not_found' } } : { status: 401, body: { error: 'unauthorized' } });
    assert.equal((await database.one('SELECT password FROM users WHERE id=?', victim.id)).password, 'synthetic');
    if (!promoted) assert.ok(await database.one('SELECT 1 FROM sessions WHERE token_hash=?', victim.hash));
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

  await check('Proof-reset replay rechecks the session after locking staff authority', async () => {
    await grant('support');
    const order = await book(), driver = await account('driver');
    await database.run("UPDATE orders SET status='in_transit',driver_id=?,assigned_at=? WHERE id=?", driver.id, Date.now(), order.id);
    const { version } = await database.one('SELECT version FROM orders WHERE id=?', order.id);
    const path = `/admin/orders/${order.id}/proof-reset`;
    const body = { commandId: randomUUID(), expectedVersion: version, payload: { reason: 'Synthetic recovery proof' } };
    assert.deepEqual(await post(path, support.token, body), { status: 200, body: { ok: true } });
    const staff = pauseQuery('one', (sql, params) => sql.startsWith('SELECT role,status,staff_role FROM users WHERE id=? FOR ') && params[0] === support.id);
    const replay = post(path, support.token, body);
    try {
      await atBarrier(staff, replay);
      await call('/auth/logout', { token: support.token, body: {} });
    } finally {
      staff.resume.resolve();
      await Promise.allSettled([replay]);
      staff.restore();
    }
    assert.deepEqual(await replay, { status: 401, body: { error: 'unauthorized' } });
    assert.equal((await database.one("SELECT count(*) AS n FROM security_events WHERE order_id=? AND action='PROOF_RESET'", order.id)).n, 1);
  });
  if (failures.length) throw new AggregateError(failures, 'PostgreSQL review regressions');
  console.log('PostgreSQL payment reservation and support authority regressions passed');
} finally {
  await shutdown();
  await database.run(`DROP SCHEMA "${schema}" CASCADE`);
  await database.close();
}
