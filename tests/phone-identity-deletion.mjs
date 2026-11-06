import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './phone-identity-support.mjs';

const f = await fixture('phone_deletion');
const { db, call, admin, customer, account, map, verify, issue, delivered } = f;
const count = async (sql, ...values) => Number((await db.one(`SELECT count(*) n FROM ${sql}`, ...values)).n);
// The whole stored row as text: a new column holding the number cannot slip past this.
const holdsNumber = async national => {
  const found = [];
  for (const table of ['phone_profiles', 'phone_mappings', 'phone_aliases', 'phone_challenges'])
    if (await count(`${table} t WHERE to_jsonb(t)::text LIKE ?`, `%${national}%`)) found.push(table);
  return found;
};
try {
  const phone = customer.phone, national = phone.slice(1), group = `+970${national}`, alias = `+972${national}`;
  await verify(customer);
  assert.deepEqual(await holdsNumber(national), ['phone_profiles', 'phone_mappings', 'phone_aliases', 'phone_challenges'], 'enrollment stores the number the scrub must find');
  const auditBefore = await count('phone_audit WHERE user_id=?', customer.user.id);
  await f.age(group);
  const deviceId = randomUUID();
  const open = await call('/auth/phone/recovery/challenges', { body: { commandId: randomUUID(), deviceId, phone: alias, countryContext: 'PS' } });
  const sms = await delivered(open);
  assert.ok(sms, 'recovery was really open when the account went');

  await call('/me/delete', { token: customer.token, body: { password: 'Synthetic-password' } });

  assert.deepEqual(await holdsNumber(national), [], 'no phone table keeps the deleted number');
  assert.equal((await db.one('SELECT phone FROM users WHERE id=?', customer.user.id)).phone, `deleted-${customer.user.id}`);
  assert.ok(await count('phone_audit WHERE user_id=?', customer.user.id) > auditBefore, 'the audit trail survives');
  assert.equal(await count("phone_audit WHERE user_id=? AND action='account_deleted'", customer.user.id), 1);
  await call('/auth/phone/recovery/verify', { body: { commandId: randomUUID(), deviceId, challengeId: open.challengeId, purpose: 'recovery', code: sms.code, password: 'Synthetic-new-password' }, expect: 400 });
  for (const identifier of [phone, alias]) await call('/auth/login', { body: { identifier, password: 'Synthetic-password' }, expect: 401 });

  // The number can belong to someone new, and login by either prefix reaches only them.
  const back = await account({ phone });
  assert.notEqual(back.user.id, customer.user.id);
  await verify(back);
  assert.equal((await call('/auth/login', { body: { identifier: alias, password: 'Synthetic-password' } })).user.id, back.user.id);
  assert.equal((await db.one('SELECT user_id FROM phone_mappings WHERE canonical_group=?', group)).user_id, back.user.id);

  // An administrator's deletion scrubs the same way, and a reviewed-only number is freed too.
  const reviewed = await account();
  await map(reviewed);
  await call(`/admin/users/${reviewed.user.id}`, { token: admin.token, method: 'DELETE' });
  assert.deepEqual(await holdsNumber(reviewed.phone.slice(1)), []);

  // Another account's mapping is not touched: only the deleted account's rows go.
  const other = await account();
  await verify(other);
  const stranger = await account();
  await call('/me/delete', { token: stranger.token, body: { password: 'Synthetic-password' } });
  assert.equal(await count('phone_mappings WHERE user_id=?', other.user.id), 1);
  assert.equal((await call('/auth/login', { body: { identifier: `+972${other.phone.slice(1)}`, password: 'Synthetic-password' } })).user.id, other.user.id);

  // A code never handed to the provider gives back the budget it reserved; one already requested may have cost money and keeps it.
  const owner = await account(), sentAlready = await account();
  await verify(owner); await verify(sentAlready);
  await f.age(`+970${owner.phone.slice(1)}`); await f.age(`+970${sentAlready.phone.slice(1)}`);
  const reserved = async () => { const b = await db.one('SELECT sum(reserved_messages) m, sum(reserved_minor) c FROM phone_provider_budget'); return [Number(b.m), Number(b.c)]; };
  const unsent = await issue(owner), requested = await issue(sentAlready);
  await delivered(unsent); await delivered(requested);
  await db.run("UPDATE phone_challenges SET delivery_state='prepared' WHERE id=?::uuid", unsent.challengeId);
  await db.run("UPDATE phone_challenges SET delivery_state='requested' WHERE id=?::uuid", requested.challengeId);
  const before = await reserved();
  await call('/me/delete', { token: owner.token, body: { password: 'Synthetic-password' } });
  assert.deepEqual(await reserved(), [before[0] - 1, before[1] - 10], 'the unsent reservation returns exactly once');
  await call('/me/delete', { token: sentAlready.token, body: { password: 'Synthetic-password' } });
  assert.deepEqual(await reserved(), [before[0] - 1, before[1] - 10], 'a requested send may have been paid for');

  // The audit never changes, so a number cannot be written into it in the first place.
  for (const typed of [{ reason: 'Caller on 0599123456 confirmed' }, { reason: 'Caller on ٠٥٩٩١٢٣٤٥٦ confirmed' }, { reason: 'Caller on 059 912-3456 confirmed' }, { evidenceRef: 'ticket:0599123456' }]) {
    const candidate = await account();
    const national = candidate.phone.replace(/^0/, '');
    assert.equal((await call('/admin/phone/mappings', { token: admin.token, expect: 400, body: { userId: candidate.user.id, phone: candidate.phone, countryContext: 'PS', routingPhone: candidate.phone, state: 'reviewed', expectedVersion: 0, reason: 'Reviewed by support', evidenceRef: 'synthetic:wp06:mapping', ...typed } })).error, 'invalid_input', national);
  }

  // Deletion takes the phone command lock before the account row, in the same order as every phone command.
  const racer = await account();
  await map(racer);
  const [deleted] = await Promise.all([
    call('/me/delete', { token: racer.token, body: { password: 'Synthetic-password' } }),
    issue(racer).catch(error => error),
  ]);
  assert.deepEqual(deleted, { ok: true });
  assert.deepEqual(await holdsNumber(racer.phone.slice(1)), [], 'a command racing deletion leaves no number behind');
  console.log('Phone deletion: no stored number after self or admin deletion, audit kept, open recovery dead, number enrolls again, other accounts untouched, no lock inversion');
} finally { await f.close(); }
