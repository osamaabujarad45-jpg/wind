import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cashCommandBody, cashCommandKey, formAfter, legacyCashCommandKey, newCashCommand, receiptMatches, parseCashSlot, readCashCommand, recoverCashCommand, refusedForGood, sendCashCommand } from '../src/admin-cash-command.ts';
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
{ // Haiku r7 L-4 / Sol R10-L1: a receipt for the same id under another kind, amount, note or payout meaning is a conflict.
  const entry = { id: 5, reference: 'R-5', kind: 'remittance', amountCents: 1250, note: 'Office handover' };
  const io = rig({ send: failing(409), receipt: async () => ({ entry: { ...entry, note: 'Another note' } }) });
  assert.deepEqual(await sendCashCommand(io, command), { state: 'refused', command, error: 'idempotency_conflict' });
  const same = rig({ send: failing(409), receipt: async () => ({ entry }) });
  assert.equal((await sendCashCommand(same, command)).state, 'recorded');
  // The server's explicit conflict stands, whatever a receipt shows.
  const explicit = rig({ send: async () => { throw Object.assign(new Error('idempotency_conflict'), { status: 409 }); }, receipt: async () => ({ entry }) });
  assert.equal((await sendCashCommand(explicit, command)).state, 'refused');
  assert.equal(explicit.receipts, 0);
  const payout = newCashCommand(7, 42, 'payout', 1250, 'Cash balance paid to the captain');
  assert.equal(receiptMatches({ id: 6, kind: 'adjustment', amountCents: 1250, note: payout.note }, payout), false, 'a charge is not this payout');
  assert.equal(receiptMatches({ id: 6, kind: 'adjustment', amountCents: 1250, note: payout.note, source: 'payout' }, payout), true);
  // Recovery after a restart checks the receipt the same way.
  const cold = rig({ receipt: async () => ({ entry: { ...entry, amountCents: 999 } }) }); cold.stored = command;
  assert.deepEqual(await recoverCashCommand(cold, 7), { state: 'refused', command, error: 'idempotency_conflict' });
}
{ // Haiku r9 M1: a retry from a restored form whose slot another tab already settled and cleared is never sent again.
  const gone = rig(); gone.stored = null;
  const stale = await sendCashCommand(gone, command, true);
  assert.deepEqual([stale.state, stale.error, gone.sends, gone.stored], ['refused', 'cash_command_settled', 0, null]);
  const booked = rig({ receipt: async () => ({ entry: { id: 9, reference: 'R-9', kind: 'remittance', amountCents: 1250, note: 'Office handover' } }) });
  booked.stored = null;
  assert.equal((await sendCashCommand(booked, command, true)).state, 'recorded');
  assert.equal(booked.sends, 0);
  // While its slot still holds it, a retry is the same-id resend as before.
  const held = rig(); held.stored = command;
  assert.equal((await sendCashCommand(held, command, true)).state, 'recorded');
  assert.equal(held.sends, 1);
  // Sol R11-L1: a receipt that says only that the id exists settles nothing.
  const thin = rig({ receipt: async () => ({ entry: { id: 9, reference: 'R-9' } }) }); thin.stored = command;
  assert.equal((await recoverCashCommand(thin, 7)).state, 'unconfirmed');
  assert.equal(thin.stored, command);
  // Sol R12-M2: a refusal whose slot cannot be cleared is marked refused; a restart and a Retry settle it by receipt only.
  const stuck = rig({ send: failing(400) }); stuck.write = async c => { if (c === null) throw new Error('disk'); stuck.stored = c; };
  assert.equal((await sendCashCommand(stuck, command)).state, 'refused');
  assert.equal(stuck.stored.refused, true);
  assert.equal(stuck.sends, 1);
  const afterRestart = rig(); afterRestart.stored = stuck.stored;
  assert.deepEqual([(await recoverCashCommand(afterRestart, 7)).state, afterRestart.sends], ['refused', 0]);
  const retried = rig(); retried.stored = stuck.stored;
  assert.deepEqual([(await sendCashCommand(retried, command, true)).state, retried.sends], ['refused', 0]);
  // Sol R12-M1 / Haiku r10 M1: a fresh form's Retry after a lost reply is a retry too (its slot was cleared elsewhere).
  const fresh = rig(); fresh.stored = null;
  assert.deepEqual([(await sendCashCommand(fresh, command, true)).error, fresh.sends], ['cash_command_settled', 0]);
  // Sol R13-M2: when neither the clear nor the marker can be written, it is a storage failure, never a resendable entry.
  const broken = rig({ send: failing(400) }); broken.write = async c => { if (c === null || c.refused) throw new Error('disk'); broken.stored = c; };
  assert.deepEqual([(await sendCashCommand(broken, command)).state, (await sendCashCommand(rig({ send: failing(400) }), command)).state], ['refused', 'refused']);
  assert.equal((await sendCashCommand(Object.assign(rig({ send: failing(400) }), { write: async c => { if (c === null || c?.refused) throw new Error('disk'); } }), command)).error, 'cash_storage_failed');
  // Haiku r11 N-M1: a send whose admin session changed before it went out is not sent.
  const switched = rig();
  assert.deepEqual([(await sendCashCommand(switched, command, false, () => false)).state, switched.sends], ['empty', 0]);
  // Sol R13-L2: a receipt missing its kind or note settles nothing, for a current or an installed record.
  assert.equal(receiptMatches({ id: 1, amountCents: 1250, note: 'Office handover' }, command), undefined);
  assert.equal(receiptMatches({ id: 1, kind: 'remittance', amountCents: 1250 }, command), undefined);
  // Sol R12-L2: a recovery that another admin's sign-in superseded stops before its lookup and leaves the slot alone.
  const superseded = rig(); superseded.stored = command;
  assert.deepEqual(await recoverCashCommand(superseded, 7, () => false), { state: 'empty' });
  assert.deepEqual([superseded.receipts, superseded.stored], [0, command]);
}
for (const language of ['ar', 'en']) for (const key of ['err_cash_command_settled', 'cashPendingElsewhere', 'err_cash_storage_failed']) assert.ok(copy[language][key]?.trim(), `${language} ${key}`);
{ // Sol R10-H1: a refused restored form closes. It would only ever send its saved record, so an edit could not be what is sent.
  const restored = { requestId: command.requestId, uncertain: true, origin: command, legacy: true };
  assert.equal(formAfter(restored, { state: 'refused', command, error: 'invalid_amount' }), null);
  assert.deepEqual(formAfter(restored, { state: 'unconfirmed', command }), restored, 'still uncertain: kept with its record');
}
{ // 409 may be this admin's own entry with other fields: the receipt decides, and only an empty receipt means refused.
  const own = rig({ send: failing(409), receipt: async () => ({ entry: { id: 5, reference: 'R-5', kind: 'remittance', amountCents: 1250, note: 'Office handover' } }) });
  assert.equal((await sendCashCommand(own, command)).state, 'recorded');
  const thin = rig({ send: failing(409), receipt: async () => ({ entry: { id: 5, reference: 'R-5' } }) }); // only the id: settles nothing
  assert.equal((await sendCashCommand(thin, command)).state, 'unconfirmed');
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
  const full = { id: 99, reference: 'R-99', kind: 'remittance', amountCents: 1250, note: 'Office handover' }; // a receipt names what it holds
  const io = rig({ receipt: async c => { assert.equal(c.requestId, command.requestId); return { entry: full }; } });
  io.stored = command;
  assert.deepEqual(await recoverCashCommand(io, 7), { state: 'recorded', command, entry: full });
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
{ // Only the form that was sent changes: recorded closes it, unconfirmed locks it, a refused first send unlocks it, a refused
  // uncertain form closes (its request id is spent); another form keeps its input.
  const form = { id: 42, kind: 'remittance', amount: '12.5', note: 'Office handover', requestId: command.requestId, uncertain: true };
  const other = { id: 43, kind: 'adjustment', amount: '3', note: 'typed', requestId: 'f'.repeat(8) + '-0000-4000-8000-' + '0'.repeat(12) };
  assert.equal(formAfter(form, { state: 'recorded', command, entry: { id: 1 } }), null);
  assert.equal(formAfter({ ...form, uncertain: false }, { state: 'unconfirmed', command }).uncertain, true);
  assert.equal(formAfter({ ...form, uncertain: false }, { state: 'refused', command, error: {} }).uncertain, false, 'a refused first send is editable again');
  // Sol R13-M1 / Haiku r11 N-M2: an uncertain form refused (settled elsewhere, or any refusal) closes: never Record again under its id.
  assert.equal(formAfter(form, { state: 'refused', command, error: 'cash_command_settled' }), null);
  assert.equal(formAfter(form, { state: 'refused', command, error: {} }), null);
  for (const state of ['recorded', 'unconfirmed', 'refused']) assert.equal(formAfter(other, { state, command, entry: { id: 1 } }), other, state);
  assert.equal(formAfter(null, { state: 'recorded', command, entry: { id: 1 } }), null);
}
// The body is the same one the form sent: an adjustment names its reason, a remittance its note.
assert.deepEqual(cashCommandBody(command), { driverId: 42, amountCents: 1250, note: 'Office handover', requestId: command.requestId });
assert.deepEqual(cashCommandBody({ ...command, kind: 'adjustment' }), { driverId: 42, amountCents: 1250, reason: 'Office handover', requestId: command.requestId, intent: 'charge' });
assert.deepEqual(cashCommandBody({ ...command, kind: 'payout' }), { driverId: 42, amountCents: 1250, reason: 'Office handover', requestId: command.requestId, intent: 'payout', source: 'payout' });
assert.equal(cashCommandKey(7), 'adminCash.v2.7'); // its own slot: an installed bundle reads and clears only adminCash.7 (Sol R9-H2)
assert.equal(legacyCashCommandKey(7), 'adminCash.7');

// Sol R8-H1: the installed build saved its Pay driver as a positive 'adjustment' (schema 1). This build would send that as a
// charge, so it is never sent: its receipt settles it, no receipt refuses it for good (enter it again), an unreadable receipt
// keeps it unconfirmed. A retry from the restored form (same request id) takes the same path.
{
  const legacy = { ...newCashCommand(7, 42, 'adjustment', 2000, 'Promo credits paid to the driver in cash', '1b8f6a52-6c1e-4f7a-9d2b-3e4f5a6b7c8d'), schemaVersion: 1 };
  assert.equal(newCashCommand(7, 42, 'adjustment', 2000, 'x').schemaVersion, 2);
  const none = rig(); none.stored = legacy;
  assert.deepEqual(await recoverCashCommand(none, 7), { state: 'refused', command: legacy, error: 'cash_command_ambiguous' });
  assert.equal(none.sends, 0); assert.equal(none.stored, null);
  // Its receipt settles it under either meaning, when amount, kind and note match (Sol R12-L1).
  const booked = rig({ receipt: async () => ({ entry: { id: 8, reference: 'P-8', kind: 'adjustment', amountCents: 2000, note: legacy.note, source: 'payout' } }) }); booked.stored = legacy;
  assert.equal((await recoverCashCommand(booked, 7)).state, 'recorded');
  const noNote = rig({ receipt: async () => ({ entry: { id: 8, kind: 'adjustment', amountCents: 2000 } }) }); noNote.stored = legacy;
  assert.deepEqual([(await recoverCashCommand(noNote, 7)).state, noNote.stored], ['unconfirmed', legacy], 'a receipt missing its note settles nothing');
  const thinLegacy = rig({ receipt: async () => ({ entry: { id: 8, reference: 'P-8' } }) }); thinLegacy.stored = legacy;
  assert.deepEqual([(await recoverCashCommand(thinLegacy, 7)).state, thinLegacy.stored], ['unconfirmed', legacy], 'a receipt naming only its id settles nothing');
  const otherAmount = rig({ receipt: async () => ({ entry: { id: 8, kind: 'adjustment', amountCents: 999, note: legacy.note } }) }); otherAmount.stored = legacy;
  assert.equal((await recoverCashCommand(otherAmount, 7)).error, 'idempotency_conflict');
  const unknown = rig({ receipt: failing(503) }); unknown.stored = legacy;
  assert.equal((await recoverCashCommand(unknown, 7)).state, 'unconfirmed');
  assert.equal(unknown.stored, legacy, 'kept for the next receipt lookup');
  const retry = rig(); retry.stored = legacy; // the restored form resubmits as this build's command with the same id
  const outcome = await sendCashCommand(retry, newCashCommand(7, 42, 'adjustment', 2000, legacy.note, legacy.requestId));
  assert.deepEqual([outcome.state, outcome.error, retry.sends, retry.stored], ['refused', 'cash_command_ambiguous', 0, null]);
  assert.equal(formAfter({ requestId: legacy.requestId, uncertain: true }, outcome), null, 'its form closes: never resubmitted as a charge');
  // Sol R9-H1: another tab settled it and cleared the slot; this tab's Retry submits the restored record (schema 1).
  const cleared = rig(); cleared.stored = null;
  const late = await sendCashCommand(cleared, legacy);
  assert.deepEqual([late.state, late.error, cleared.sends, cleared.stored], ['refused', 'cash_command_ambiguous', 0, null]);
  // ... and when a different command took the slot meanwhile, it is kept, not cleared by this settlement.
  const other = newCashCommand(7, 42, 'remittance', 500, 'Office handover', '2b8f6a52-6c1e-4f7a-9d2b-3e4f5a6b7c8d');
  const busy = rig(); busy.stored = other;
  await assert.rejects(sendCashCommand(busy, legacy), /cash_command_pending/);
  assert.equal(busy.stored, other);
  // Schema 1 remittances, negative adjustments and this build's charges are unambiguous and go through as before.
  const remit = rig(); remit.stored = { ...command, schemaVersion: 1 };
  assert.equal((await sendCashCommand(remit, { ...command, schemaVersion: 1 })).state, 'recorded');
  assert.equal(remit.sends, 1);
}
for (const language of ['ar', 'en']) for (const key of ['cashAdjustRecorded', 'err_cash_command_pending', 'err_cash_command_ambiguous', 'err_captain_pay_schema_required', 'err_invalid_request_id'])
  assert.ok(copy[language][key]?.trim(), `${language} ${key}`);

// The screen keeps the command in the admin's own secure slot (not the token-scoped recovery store a forced sign-out wipes),
// recovers when it opens, changes only the sent form, and blocks a new entry while one is unconfirmed.
const screen = readFileSync(new URL('../src/app/admin/cash.tsx', import.meta.url), 'utf8');
assert.match(screen, /storage\.(get|set)\(\(legacy \? legacyCashCommandKey : cashCommandKey\)\(actorId\)/);
assert.doesNotMatch(screen, /recoveryStorage/);
assert.match(screen, /read: async \(\) => parseCashSlot\(await storage\.get\(\(legacy \? legacyCashCommandKey : cashCommandKey\)\(actorId\), true\)\)/);
// A retry resends the restored record itself, from its own slot, never one rebuilt from the form (Sol R9-H1).
assert.match(screen, /sendCashCommand\(cashIO\(actorId, !!open\.legacy\), open\.origin \?\? newCashCommand\(/);
assert.match(screen, /, !!open\.uncertain, alive\);/); // every uncertain form's send is a retry, fresh or restored (Sol R12-M1, Haiku r10 M1)
// Haiku r11 N-M1 / Sol R13-L1: a send and its follow-on drain stop if another admin's session replaced theirs.
assert.match(screen, /const alive = \(\) => generation\.current === run && apiSessionRevision\(\) === session;/);
assert.match(screen, /await recover\(actorId, run, session\)/);
// Sol R11-H1: a saved entry for a captain no longer on the list keeps its Retry, so new entries are never blocked for good.
assert.match(screen, /open\?\.uncertain && data && !data\.some\(row => row\.driverId === open\.id\)/);
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
