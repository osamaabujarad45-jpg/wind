import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cashCommandBody, cashCommandKey, formAfter, newCashCommand, parseCashSlot, readCashCommand, recoverCashCommand, refusedForGood, sendCashCommand } from '../src/admin-cash-command.ts';
import { copy } from '../src/copy.ts';

// A-01: a remittance whose reply is lost survives an app restart and a forced sign-out, and is settled only by the admin's
// own command receipt or a definite refusal; never shown as recorded or failed by guess.
const command = newCashCommand(7, 42, 'remittance', 1250, 'Office handover', '0b8f6a52-6c1e-4f7a-9d2b-3e4f5a6b7c8d');
const rig = ({ receipt = async () => ({ entry: null }), send = async () => ({ id: 99, reference: 'R-99' }) } = {}) => {
  const io = { stored: null, sends: 0, receipts: 0, locks: 0, read: async () => io.stored,
    write: async c => { io.stored = c; }, receipt: async c => { io.receipts++; return receipt(c); }, send: async c => { io.sends++; return send(c); },
    exclusive: async run => { io.locks++; return run(); } };
  return io;
};
const failing = status => async () => { throw Object.assign(new Error('x'), { status }); };

{ // The command is saved before the request leaves, under the cross-tab lock, so a reply lost mid-flight is still on disk.
  const io = rig({ send: async () => { assert.equal(io.stored?.requestId, command.requestId, 'saved before send'); return { id: 99, reference: 'R-99' }; } });
  assert.deepEqual(await sendCashCommand(io, command), { state: 'recorded', command, entry: { id: 99, reference: 'R-99' } });
  assert.equal(io.stored, null, 'a recorded entry clears the saved command');
  assert.equal(io.locks, 1);
}
for (const status of [undefined, 0, 500, 502, 401, 403, 408, 429]) { // lost reply, server error, or a session problem: nothing is known
  const io = rig({ send: failing(status) });
  assert.equal((await sendCashCommand(io, command)).state, 'unconfirmed', String(status));
  assert.equal(io.stored?.requestId, command.requestId, `${status} keeps the command for a same-id resend`);
}
for (const status of [400, 404]) { // the server refused this request id before any replay could exist: nothing was recorded
  const io = rig({ send: failing(status) });
  assert.equal((await sendCashCommand(io, command)).state, 'refused', String(status));
  assert.equal(io.stored, null);
}
{ // 409 may be this admin's own entry with other fields: the receipt decides, and only an empty receipt means refused.
  const own = rig({ send: failing(409), receipt: async () => ({ entry: { id: 5, reference: 'R-5' } }) });
  assert.equal((await sendCashCommand(own, command)).state, 'recorded');
  const other = rig({ send: failing(409) });
  assert.equal((await sendCashCommand(other, command)).state, 'refused');
  assert.equal(other.stored, null);
  const unknown = rig({ send: failing(409), receipt: failing(503) });
  assert.equal((await sendCashCommand(unknown, command)).state, 'unconfirmed');
  assert.equal(unknown.stored?.requestId, command.requestId);
}
{ // A different command still unconfirmed is never overwritten by a new one.
  const io = rig(); io.stored = command;
  const next = newCashCommand(7, 43, 'adjustment', 500, 'Fuel advance');
  await assert.rejects(sendCashCommand(io, next), /cash_command_pending/);
  assert.equal(io.stored, command);
  assert.equal(io.sends, 0);
  assert.equal((await sendCashCommand(io, command)).state, 'recorded', 'the same command may be resent');
}
assert.equal(refusedForGood(null), false);

{ // Restart with a saved command whose first send committed: the receipt names the entry and nothing is sent again.
  const io = rig({ receipt: async c => { assert.equal(c.requestId, command.requestId); return { entry: { id: 99, reference: 'R-99' } }; } });
  io.stored = command;
  assert.deepEqual(await recoverCashCommand(io, 7), { state: 'recorded', command, entry: { id: 99, reference: 'R-99' } });
  assert.equal(io.sends, 0, 'recovery never records again');
  assert.equal(io.stored, null);
}
{ // No receipt yet, or the lookup fails: still unconfirmed, still saved, amount stays the same.
  for (const receipt of [async () => ({ entry: null }), failing(503), failing(undefined)]) {
    const io = rig({ receipt }); io.stored = command;
    const outcome = await recoverCashCommand(io, 7);
    assert.equal(outcome.state, 'unconfirmed');
    assert.equal(outcome.command.amountCents, 1250);
    assert.equal(io.stored, command);
    assert.equal(io.sends, 0);
  }
}
{ // A record that is not this admin's cash command is not recovered here (another admin, a driver command, nothing).
  for (const stored of [null, { ...command, actorId: 8 }, { schemaVersion: 1, actorId: 7, orderId: 5, action: 'advance' }]) {
    const io = rig(); io.stored = stored;
    assert.deepEqual(await recoverCashCommand(io, 7), { state: 'empty' });
    assert.equal(io.stored, stored, 'someone else\'s record is left alone');
  }
  // An unreadable cash record cannot be resent and is dropped; a storage read failure keeps the record and is reported.
  const corrupt = rig(); corrupt.stored = { ...command, amountCents: 0 };
  assert.deepEqual(await recoverCashCommand(corrupt, 7), { state: 'empty' });
  assert.equal(corrupt.stored, null);
  const garbled = rig(); garbled.read = async () => parseCashSlot('{"type":"admin_cash",'); garbled.stored = command;
  assert.deepEqual(await recoverCashCommand(garbled, 7), { state: 'empty' });
  assert.equal(garbled.stored, null, 'unparseable bytes in the slot are dropped like a broken record');
  const unreadable = rig(); unreadable.stored = command; unreadable.read = async () => { throw new Error('storage_unavailable'); };
  await assert.rejects(recoverCashCommand(unreadable, 7), /storage_unavailable/);
  assert.equal(unreadable.stored, command);
  assert.throws(() => readCashCommand({ ...command, requestId: 'nope' }, 7), /invalid_pending_command/);
}
{ // Only the form that was sent changes: recorded closes it, unconfirmed locks it, refused unlocks it; another form keeps its input.
  const form = { id: 42, kind: 'remittance', amount: '12.5', note: 'Office handover', requestId: command.requestId, uncertain: true };
  const other = { id: 43, kind: 'adjustment', amount: '3', note: 'typed', requestId: 'f'.repeat(8) + '-0000-4000-8000-' + '0'.repeat(12) };
  assert.equal(formAfter(form, { state: 'recorded', command, entry: { id: 1 } }), null);
  assert.equal(formAfter({ ...form, uncertain: false }, { state: 'unconfirmed', command }).uncertain, true);
  assert.equal(formAfter(form, { state: 'refused', command, error: {} }).uncertain, false, 'a refused resend is editable again');
  for (const state of ['recorded', 'unconfirmed', 'refused']) assert.equal(formAfter(other, { state, command, entry: { id: 1 } }), other, state);
  assert.equal(formAfter(null, { state: 'recorded', command, entry: { id: 1 } }), null);
}
// The body is the same one the form sent: an adjustment names its reason, a remittance its note.
assert.deepEqual(cashCommandBody(command), { driverId: 42, amountCents: 1250, note: 'Office handover', requestId: command.requestId });
assert.deepEqual(cashCommandBody({ ...command, kind: 'adjustment' }), { driverId: 42, amountCents: 1250, reason: 'Office handover', requestId: command.requestId, intent: 'charge' });
assert.deepEqual(cashCommandBody({ ...command, kind: 'payout' }), { driverId: 42, amountCents: 1250, reason: 'Office handover', requestId: command.requestId, intent: 'payout', source: 'payout' });
assert.equal(cashCommandKey(7), 'adminCash.7');
for (const language of ['ar', 'en']) for (const key of ['cashAdjustRecorded', 'err_cash_command_pending', 'err_admin_update_required', 'err_captain_pay_schema_required', 'err_invalid_request_id'])
  assert.ok(copy[language][key]?.trim(), `${language} ${key}`);

// The screen keeps the command in the admin's own secure slot (not the token-scoped recovery store a forced sign-out wipes),
// recovers when it opens, changes only the sent form, and blocks a new entry while one is unconfirmed.
const screen = readFileSync(new URL('../src/app/admin/cash.tsx', import.meta.url), 'utf8');
assert.match(screen, /storage\.(get|set)\(cashCommandKey\(actorId\)/);
assert.doesNotMatch(screen, /recoveryStorage/);
assert.match(screen, /read: async \(\) => parseCashSlot\(await storage\.get\(cashCommandKey\(actorId\), true\)\)/);
assert.equal(parseCashSlot(null), null);
assert.deepEqual(parseCashSlot(JSON.stringify(command)), command);
assert.match(screen, /setOpen\(o => formAfter\(o, outcome\)\)/);
assert.match(screen, /const blocked = busy \|\| recovering \|\| !!open\?\.uncertain/);
assert.match(screen, /!open\.uncertain && <Button title=\{c\.cancel\}/);
// A53 walk 18 Nov: resolving a waiting handover is an action (Confirm/Dispute handover), not a status word, and the form
// names its decision, driver and amount; the save button is not a question.
assert.doesNotMatch(screen, /title=\{c\.entry_(confirmed|disputed)\}/);
assert.match(screen, /resolving\.decision === 'confirm' \? c\.cashMarkConfirmed : c\.cashMarkDisputed/);
assert.match(screen, /<Button title=\{c\.cashResolveSave\}/);
for (const language of ['ar', 'en']) for (const key of ['cashMarkConfirmed', 'cashMarkDisputed', 'cashResolveSave', 'dashboardTab'])
  assert.ok(copy[language][key]?.trim(), `${language} ${key}`);
// A forced sign-out never clears the account's slot: session.tsx forgets only token-scoped records.
assert.doesNotMatch(readFileSync(new URL('../src/session.tsx', import.meta.url), 'utf8'), /adminCash/);
console.log('PASS: admin cash commands survive a lost reply, a restart and a sign-out, settled only by a command receipt or a definite refusal');
