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
for (const status of [undefined, 0, 500, 502, 401, 408, 429]) { // lost reply, server error, or a session problem: nothing is known
  const io = rig({ send: failing(status) });
  assert.equal((await sendCashCommand(io, command)).state, 'unconfirmed', String(status));
  assert.equal(io.stored?.requestId, command.requestId, `${status} keeps the command for a same-id resend`);
}
{ // Haiku r23 F1: a 403 (no finance duty) is settled by the receipt: none means refused and the slot clears; an entry from an
  // earlier send means recorded; a failed lookup stays unconfirmed.
  const none = rig({ send: failing(403) });
  assert.equal((await sendCashCommand(none, command)).state, 'refused');
  assert.deepEqual([none.receipts, none.stored], [1, null]);
  const entry = { id: 5, reference: 'R-5', kind: 'remittance', amountCents: 1250, note: 'Office handover' };
  const booked = rig({ send: failing(403), receipt: async () => ({ entry }) });
  assert.equal((await sendCashCommand(booked, command)).state, 'recorded');
  const unknown = rig({ send: failing(403), receipt: async () => { throw new Error('network'); } });
  assert.equal((await sendCashCommand(unknown, command)).state, 'unconfirmed');
  assert.equal(unknown.stored?.requestId, command.requestId);
}
{ // Sol R26-M1: the first send's reply is lost and the cashier's finance duty is removed. The Retry gets 403 and no receipt yet
  // (the first write may still commit): the key stays. When the receipt appears, the next Retry settles it as recorded.
  let receipt = null;
  const io = rig({ send: failing(403), receipt: async () => ({ entry: receipt }) });
  io.stored = command;
  const miss = await sendCashCommand(io, command, true);
  assert.equal(miss.state, 'unconfirmed');
  assert.equal(io.stored?.requestId, command.requestId, 'the key survives a receipt miss on Retry');
  receipt = { id: 5, reference: 'R-5', kind: 'remittance', amountCents: 1250, note: 'Office handover' };
  assert.equal((await sendCashCommand(io, command, true)).state, 'recorded');
  assert.equal(io.stored, null, 'cleared only once the receipt is found');
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
  const neither = rig({ send: failing(400) }); neither.write = async c => { if (c === null || c?.refused) throw new Error('disk'); neither.stored = c; };
  const neitherOutcome = await sendCashCommand(neither, command); // Sol R18-M2: the refusal stays the verdict; `stop` rides along
  assert.deepEqual([neitherOutcome.state, neitherOutcome.error.status, neitherOutcome.kept, neitherOutcome.stop], ['refused', 400, true, true]);
  // Sol R14-L1 / M1, Haiku r12 F1/F2: a refusal whose record stays in the slot (marked, or storage broken) is `kept`, and
  // its form closes even on a first send: a new entry gets a new request id, and an edit is never settled as the old one.
  const kept = rig({ send: failing(400) }); kept.write = async c => { if (c === null) throw new Error('disk'); kept.stored = c; };
  const keptOutcome = await sendCashCommand(kept, command);
  assert.equal(keptOutcome.kept, true);
  assert.equal(formAfter({ requestId: command.requestId, amount: '12.5' }, keptOutcome), null);
  const brokenRig = rig({ send: failing(400) }); brokenRig.write = async c => { if (c === null || c?.refused) throw new Error('disk'); brokenRig.stored = c; };
  const brokenOutcome = await sendCashCommand(brokenRig, command);
  assert.deepEqual([brokenOutcome.stop, brokenOutcome.kept, formAfter({ requestId: command.requestId }, brokenOutcome)], [true, true, null]);
  // Sol R14-M2: a 409 whose admin session changed before the receipt lookup makes no lookup and leaves the slot alone.
  let live = true;
  const late = rig({ send: async () => { live = false; throw Object.assign(new Error('remittance_pending'), { status: 409 }); } });
  assert.deepEqual([(await sendCashCommand(late, command, false, () => live)).state, late.receipts, late.stored?.requestId], ['empty', 0, command.requestId]);
  // Haiku r13 N1: a definitive refusal clears this admin's own slot even when the session changed during the POST, so it
  // never comes back as resendable after the next sign-in.
  let on = true;
  const signedOut = rig({ send: async () => { on = false; throw Object.assign(new Error('invalid_amount'), { status: 400 }); } });
  const superseded400 = await sendCashCommand(signedOut, command, false, () => on);
  assert.deepEqual([superseded400.state, signedOut.stored], ['refused', null]);
  // Sol R15-L1: a record that a receipt settlement cannot clear is a storage failure, not a loop on every new entry.
  const stuckMarker = rig(); stuckMarker.stored = { ...command, refused: true };
  stuckMarker.write = async c => { if (c === null) throw new Error('disk'); stuckMarker.stored = c; };
  const settledStuck = await recoverCashCommand(stuckMarker, 7);
  assert.deepEqual([settledStuck.state, settledStuck.error, settledStuck.kept, settledStuck.stop], ['refused', 'cash_command_settled', true, true]);
  // Sol R15-L2: liveness lost during the receipt lookup leaves the slot alone (checked after the await, not only before).
  let still = true;
  const midLookup = rig({ receipt: async () => { still = false; return { entry: null }; } }); midLookup.stored = { ...command, refused: true };
  assert.deepEqual([(await recoverCashCommand(midLookup, 7, () => still)).state, midLookup.stored?.requestId], ['empty', command.requestId]);
  // Sol R16-M1: the API client turns a reply that arrives after a session change into session_changed (401) but keeps what
  // the server said: a served 400 or 404 still settles this admin's own slot for good; a served 409 needs a receipt.
  const late400 = rig({ send: async () => { throw Object.assign(new Error('session_changed'), { status: 401, servedStatus: 400 }); } });
  assert.deepEqual([(await sendCashCommand(late400, command)).state, late400.stored], ['refused', null]);
  const late409 = rig({ send: async () => { throw Object.assign(new Error('session_changed'), { status: 401, servedStatus: 409 }); } });
  assert.deepEqual([(await sendCashCommand(late409, command)).state, late409.stored?.requestId], ['unconfirmed', command.requestId]);
  // Sol R16-L2: a mismatching receipt after a 409 spends the id through the same final refusal (closes, kept if not cleared).
  const mismatch = rig({ send: failing(409), receipt: async () => ({ entry: { id: 3, kind: 'remittance', amountCents: 99, note: 'x' } }) });
  mismatch.write = async c => { if (c === null) throw new Error('disk'); mismatch.stored = c; };
  const mismatchOutcome = await sendCashCommand(mismatch, command);
  assert.deepEqual([mismatchOutcome.error, mismatchOutcome.kept, formAfter({ requestId: command.requestId }, mismatchOutcome)], ['idempotency_conflict', true, null]);
  // Sol R16-L1: a slot that cannot be read after the receipt lookup is a storage stop, not a quiet settlement.
  let reads = 0;
  const unreadable = rig(); unreadable.stored = { ...command, refused: true };
  unreadable.read = async () => { if (++reads > 1) throw new Error('disk'); return unreadable.stored; };
  const unreadableOutcome = await recoverCashCommand(unreadable, 7);
  assert.deepEqual([unreadableOutcome.error, unreadableOutcome.kept, unreadableOutcome.stop], ['cash_command_settled', true, true]);
  // Sol R17-M2: a late refusal never touches a newer command that the slot holds now.
  const newer = newCashCommand(7, 42, 'remittance', 700, 'Next handover', '3b8f6a52-6c1e-4f7a-9d2b-3e4f5a6b7c8d');
  const lateOld = rig({ send: async () => { lateOld.stored = newer; throw Object.assign(new Error('invalid_amount'), { status: 400 }); } });
  assert.deepEqual([(await sendCashCommand(lateOld, command)).state, lateOld.stored], ['refused', newer]);
  // Haiku r15 F1: a matched receipt keeps its verdict when the record cannot be cleared; the stop rides along.
  const matched = { id: 9, kind: 'remittance', amountCents: 1250, note: 'Office handover' };
  const stuckRecorded = rig({ receipt: async () => ({ entry: matched }) }); stuckRecorded.stored = { ...command, refused: true };
  stuckRecorded.write = async c => { if (c === null) throw new Error('disk'); stuckRecorded.stored = c; };
  const verdict = await recoverCashCommand(stuckRecorded, 7);
  assert.deepEqual([verdict.state, verdict.stop], ['recorded', true]);
  // Sol R17-L1: a known conflict closes its form, cleared or not.
  assert.equal(formAfter({ requestId: command.requestId, amount: '12.5' }, { state: 'refused', command, error: 'idempotency_conflict' }), null);
  // Sol R18-M1 / Haiku r16 L2: a recorded reply clears only while the slot holds the command; a newer one stays.
  const replayed = rig({ send: async () => { replayed.stored = newer; return { id: 5, reference: 'R-5' }; } });
  assert.deepEqual([(await sendCashCommand(replayed, command)).state, replayed.stored], ['recorded', newer]);
  // ... and a recorded reply whose clear fails stays recorded, with `stop`.
  const okStuck = rig(); okStuck.write = async c => { if (c === null) throw new Error('disk'); okStuck.stored = c; };
  const okStuckOutcome = await sendCashCommand(okStuck, command);
  assert.deepEqual([okStuckOutcome.state, okStuckOutcome.stop, okStuck.stored?.requestId], ['recorded', true, command.requestId]);
  // Sol R18-M1: a slot whose read fails is never marked: ownership is unknown.
  let failReads = false;
  const blind = rig({ send: async () => { failReads = true; throw Object.assign(new Error('invalid_amount'), { status: 400 }); } });
  blind.read = async () => { if (failReads) throw new Error('disk'); return blind.stored; };
  blind.stored = null;
  const blindOutcome = await sendCashCommand(blind, command);
  assert.deepEqual([blindOutcome.stop, blind.stored?.refused], [true, undefined]);
  // Sol R18-M3 / Haiku r16 L3: a storage read failure in recovery or a send stops entries; unreadable bytes are dropped.
  const readFails = rig(); readFails.read = async () => { throw new Error('disk'); };
  assert.deepEqual(await recoverCashCommand(readFails, 7), { state: 'empty', stop: true });
  assert.deepEqual([(await sendCashCommand(readFails, command)).stop, readFails.sends], [true, 0]);
  const garbage = rig(); garbage.read = async () => { throw new Error('invalid_pending_command'); };
  assert.deepEqual(await recoverCashCommand(garbage, 7), { state: 'empty' });
  const garbageStuck = rig(); garbageStuck.read = async () => { throw new Error('invalid_pending_command'); }; garbageStuck.write = async () => { throw new Error('disk'); };
  assert.deepEqual(await recoverCashCommand(garbageStuck, 7), { state: 'empty', stop: true });
  // Haiku r17 N7a: recovery and 409 receipts whose clear fails keep their verdict with `stop`; a settled conflict whose delete
  // fails stops entries even when its mark works (Sol R19-M2).
  const failClear = r => { r.write = async c => { if (c === null) throw new Error('disk'); r.stored = c; }; return r; };
  const recMatch = failClear(rig({ receipt: async () => ({ entry: matched }) })); recMatch.stored = command;
  assert.deepEqual([(await recoverCashCommand(recMatch, 7)).state, (await recoverCashCommand(failClear(Object.assign(rig({ receipt: async () => ({ entry: matched }) }), { stored: command })), 7)).stop], ['recorded', true]);
  const recConflict = failClear(rig({ receipt: async () => ({ entry: { ...matched, amountCents: 1 } }) })); recConflict.stored = command;
  const conflictOutcome = await recoverCashCommand(recConflict, 7);
  assert.deepEqual([conflictOutcome.error, conflictOutcome.kept, conflictOutcome.stop, recConflict.stored?.refused], ['idempotency_conflict', true, true, true]);
  const match409 = failClear(rig({ send: failing(409), receipt: async () => ({ entry: matched }) }));
  const match409Outcome = await sendCashCommand(match409, command);
  assert.deepEqual([match409Outcome.state, match409Outcome.stop], ['recorded', true]);
  // Haiku r17 N5: unreadable bytes found while cleaning up are dropped, as everywhere.
  let garbled = true;
  const dropAtCleanup = rig({ send: async () => { garbled = true; throw Object.assign(new Error('invalid_amount'), { status: 400 }); } });
  dropAtCleanup.read = async () => { if (garbled && dropAtCleanup.sends) throw new Error('invalid_pending_command'); return dropAtCleanup.stored; };
  garbled = false;
  const dropped = await sendCashCommand(dropAtCleanup, command);
  assert.deepEqual([dropped.state, dropped.stop, dropAtCleanup.stored], ['refused', undefined, null]);
  // Sol R20-M1: corrupt bytes that cannot be dropped leave ownership unknown: no marker is written over them, entries stop.
  const corruptStuck = rig({ send: async () => { corruptStuck.corrupt = true; throw Object.assign(new Error('invalid_amount'), { status: 400 }); } });
  corruptStuck.read = async () => { if (corruptStuck.corrupt) throw new Error('invalid_pending_command'); return corruptStuck.stored; };
  corruptStuck.write = async c => { if (c === null && corruptStuck.corrupt) throw new Error('disk'); corruptStuck.stored = c; };
  const corruptOutcome = await sendCashCommand(corruptStuck, command);
  assert.deepEqual([corruptOutcome.state, corruptOutcome.stop, corruptStuck.stored?.refused], ['refused', true, undefined]);
  // Haiku r18 N-A: a retry whose slot now holds another command is settled by its own receipt; the other command stays.
  const otherHeld = rig({ receipt: async () => ({ entry: matched }) }); otherHeld.stored = newer;
  const settledOwn = await sendCashCommand(otherHeld, command, true);
  assert.deepEqual([settledOwn.state, otherHeld.sends, otherHeld.stored], ['recorded', 0, newer]);
  // Haiku r18 N-B: the server's own idempotency_conflict closes its form like any known conflict.
  const serverConflict = rig({ send: async () => { throw Object.assign(new Error('idempotency_conflict'), { status: 409 }); } });
  const serverConflictOutcome = await sendCashCommand(serverConflict, command);
  assert.deepEqual([serverConflictOutcome.error, formAfter({ requestId: command.requestId, amount: '12.5' }, serverConflictOutcome)], ['idempotency_conflict', null]);
  // Sol R20-L2: one recovery call gives both the verdict and the stop.
  const oneCall = failClear(rig({ receipt: async () => ({ entry: matched }) })); oneCall.stored = command;
  const oneCallOutcome = await recoverCashCommand(oneCall, 7);
  assert.deepEqual([oneCallOutcome.state, oneCallOutcome.stop], ['recorded', true]);
  // Sol R21-L1: a matched receipt whose reread fails keeps its verdict and stops entries.
  let rereads = 0;
  const failedReread = rig({ receipt: async () => ({ entry: matched }) }); failedReread.stored = command;
  failedReread.read = async () => { if (++rereads > 1) throw new Error('disk'); return failedReread.stored; };
  const failedRereadOutcome = await recoverCashCommand(failedReread, 7);
  assert.deepEqual([failedRereadOutcome.state, failedRereadOutcome.stop, failedReread.stored], ['recorded', true, command]);
  // Sol R21-L1: a session that ends during the 409 receipt lookup leaves the slot alone and shows nothing.
  let during409 = true;
  const lookup409 = rig({ send: failing(409), receipt: async () => { during409 = false; return { entry: matched }; } });
  assert.deepEqual([(await sendCashCommand(lookup409, command, false, () => during409)).state, lookup409.stored?.requestId], ['empty', command.requestId]);
  // Sol R21-L1: a session that ends while the save completes sends nothing; the saved record waits for its own admin.
  let duringSave = true;
  const saving = rig(); saving.write = async c => { saving.stored = c; duringSave = false; };
  assert.deepEqual([(await sendCashCommand(saving, command, false, () => duringSave)).state, saving.sends, saving.stored?.requestId], ['empty', 0, command.requestId]);
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
  // An unreadable cash record cannot be resent and is dropped; a storage read failure keeps the record and stops entries.
  const corrupt = rig(); corrupt.stored = { ...command, amountCents: 0 };
  assert.deepEqual(await recoverCashCommand(corrupt, 7), { state: 'empty' });
  assert.equal(corrupt.stored, null);
  const garbled = rig(); garbled.read = async () => parseCashSlot('{"type":"admin_cash",'); garbled.stored = command;
  assert.deepEqual(await recoverCashCommand(garbled, 7), { state: 'empty' });
  assert.equal(garbled.stored, null, 'unparseable bytes in the slot are dropped like a broken record');
  const unreadable = rig(); unreadable.stored = command; unreadable.read = async () => { throw new Error('storage_unavailable'); };
  assert.deepEqual(await recoverCashCommand(unreadable, 7), { state: 'empty', stop: true });
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
for (const language of ['ar', 'en']) for (const key of ['cashAdjustRecorded', 'err_cash_command_ambiguous', 'err_captain_pay_schema_required', 'err_invalid_request_id'])
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
// Sol R14-M1: a storage failure stops cash entry on this screen. Sol R16-M2: a fresh entry first settles the installed build's slot.
assert.match(screen, /if \(!open\.uncertain && !open\.legacy && legacyState === 'held'\)/);
// Sol R17-M1: a storage failure reading the installed build's slot stops entries instead of reading as empty.
assert.match(screen, /if \(!open\.uncertain && !open\.legacy && legacyState === 'failed'\) \{ if \(alive\(\)\) stopEntries\(\); return; \}/);
// Sol R17-L2: Confirm and Retry honour the storage stop.
assert.match(screen, /disabled=\{busy \|\| storageFailed \|\| !!amountProblem/);
assert.match(screen, /disabled=\{busy \|\| storageFailed\} reason=\{storageFailed \? \(lockless \? c\.err_cash_browser_unsupported : c\.err_cash_storage_failed\) : c\.wait_busy\}/);
assert.match(screen, /const blocked = busy \|\| recovering \|\| !!open\?\.uncertain \|\| storageFailed;/);
// Sol R15-M1: a cancelled drain only stops blocking; it is never restarted on its own (a restart could ask as another admin).
assert.match(screen, /finally \{ if \(generation\.current === run\) setRecovering\(false\); \}/);
assert.doesNotMatch(screen, /then\(\(\) => recover\(id, run, apiSessionRevision\(\)\)\)/);
// Sol R15-M2: a storage failure stops entries on this screen before the session check, and a pending confirmation honours it.
assert.match(screen, /if \(generation\.current === run\) \{\n\s+if \(outcome\.stop\) stopEntries\(\);/);
// Sol R19-M3 / Haiku r17 N1-N3: the storage stop has a banner of its own; verdict messages keep theirs.
assert.match(screen, /\{storageFailed && <ErrorText>\{lockless \? c\.err_cash_browser_unsupported : c\.err_cash_storage_failed\}<\/ErrorText>\}/);
assert.doesNotMatch(screen, /fail\(err\('cash_storage_failed'\)\)/);
// Sol R19-M5: a saved entry in this build's slot closes the typed draft too. Sol R19-M1: no cash entry without Web Locks.
assert.match(screen, /if \(e instanceof Error && e\.message === 'cash_command_pending'\) \{\n\s+if \(!open\.uncertain\) \{ setOpen\(null\);/);
// Sol R20-M2: a later recorded receipt never clears an earlier slot's instruction; Haiku r18 N-A: an open uncertain form is kept.
// (Sol R20-M2 / R23-L2: a receipt never erases an earlier instruction; tests/admin-review.test.mjs drains a legacy refusal
// followed by a current receipt and asserts both lines.)
assert.match(screen, /setOpen\(o => o\?\.uncertain && o\.requestId !== command\.requestId \? o/);
assert.match(screen, /const lockless = Platform\.OS === 'web' && !/);
// Sol R18-M4 / Haiku r16 L1: settling a saved installed-build entry closes the typed fresh form and says why.
assert.match(screen, /setOpen\(null\); note\(c\.cashSettledFirst\);/);
// Sol R21-M1/M2, Haiku r19 N19-1/N19-2: notices are added within one action, drained entries name their captain, and every
// settled uncertain form drains the other slot. The behaviour is exercised in tests/admin-review.test.mjs.
assert.match(screen, /const fail = \(notice: Notice\) => \{ setMessage\(drop\(notice\)\); setFailure\(add\(notice\)\);/);
// Sol R25-M1: a verdict replaces its entry's line in the other channel too (behaviour in tests/admin-review.test.mjs).
assert.match(screen, /const note = \(notice: Notice\) => \{ setFailure\(drop\(notice\)\); setMessage\(add\(notice\)\); \};/);
// Opus R24: one line per entry (L1), the list error beside kept lines (L2), verdicts re-read in the current language (L3),
// a restored entry's check named and kept (L5).
assert.match(screen, /line\.requestId !== notice\.requestId\), notice\]/);
assert.match(screen, /\[lines\(failure\), error && err\(error\)\]\.filter\(Boolean\)/);
assert.match(screen, /notice\.entry \? receiptText\(notice\.entry\) : cashErr\(notice\.error\)/);
// Sol R25-L1: an in-place uncertain form's verdict is named too.
assert.match(screen, /const named = !!\(open\.origin \|\| open\.uncertain\);/);
assert.match(screen, /fail\(named \? about\(outcome\.command, \{ error: outcome\.error \}\) : cashErr\(outcome\.error, false\)\)/);
assert.match(screen, /if \(\(open\.uncertain \|\| kept\) && outcome\.state !== 'unconfirmed'/);
// Haiku r20 N20-4 / r21 N21-6: a resolution adds its notice, and no handover is resolved while a recovery may add one.
assert.match(screen, /note\(c\.cashResolved\);/);
assert.equal((screen.match(/disabled=\{busy \|\| recovering\} reason=\{c\.wait_busy\}/g) ?? []).length, 2);
// Haiku r21 N21-1: a new action keeps every captain's drained line; refresh never clears the failure channel.
assert.match(screen, /setBusy\(true\); setFailure\(drained\); setMessage\(drained\);/);
// Sol R26-L3: refresh keeps every keyed receipt and instruction (a disputed receipt's check is not in the refreshed lists).
assert.match(screen, /onRefresh=\{\(\) => \{ setMessage\(drained\); reloadPending\(\);/);
// Haiku r22 F1-F4: every new-action reset keeps drained lines in both channels: submit and resolve, both Mark presses,
// and the three form openers; the live list wins over the captured name; the harness keeps an unloaded list unloaded.
assert.equal((screen.match(/setBusy\(true\); setFailure\(drained\); setMessage\(drained\);/g) ?? []).length, 2);
assert.equal((screen.match(/onPress=\{\(\) => \{ setMessage\(drained\); setFailure\(drained\); setResolving\(/g) ?? []).length, 2);
assert.equal((screen.match(/onPress=\{\(\) => \{ setMessage\(drained\); setFailure\(drained\); setOpen\(/g) ?? []).length, 3);
assert.doesNotMatch(screen, /set(Message|Failure)\(\[\]\)(?!; reloadPending)/);
assert.match(screen, /data\?\.find\(candidate => candidate\.driverId === notice\.driverId\) \?\? \(notice\.name/);
assert.match(readFileSync(new URL('./admin-review.test.mjs', import.meta.url), 'utf8'), /path in data \? data\[path\] : \[\]/);
for (const language of ['ar', 'en']) assert.equal(copy[language].err_cash_command_pending, undefined, `${language}: the resend instruction is gone (Haiku r19 N19-4, r20 N20-6)`);
// Sol R18-L1: a marked refusal is checked, not resent.
assert.match(screen, /title=\{open\.origin && \(open\.origin\.refused \|\| ambiguousLegacy\(open\.origin\)\) \? c\.cashCheckRecord : c\.cashRetrySame\}/);
assert.match(screen, /inFlight\.current \|\| storageBroken\.current\) return;/);
// Sol R11-H1: a saved entry for a captain no longer on the list keeps its Retry, so new entries are never blocked for good.
assert.match(screen, /open\?\.uncertain && data && !data\.some\(row => row\.driverId === open\.id\)/);
assert.equal(parseCashSlot(null), null);
assert.deepEqual(parseCashSlot(JSON.stringify(command)), command);
assert.match(screen, /setOpen\(o => formAfter\(o, outcome\)\)/);
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

// Sol R27-L3: the receipt wording itself, independent of the screen: point in time, no actor, no promised list, and the
// dispute instruction; a 403 explains finance duty and the same-receipt retry.
for (const key of ['cashRecorded', 'cashRecordedConfirmed', 'cashRecordedDisputed']) {
  assert.match(copy.en[key], /When checked/, `en.${key} is point in time`);
  assert.match(copy.ar[key], /عند التحقق/, `ar.${key} is point in time`);
  assert.doesNotMatch(copy.en[key], /driver confirm|by the driver|Handovers waiting/, `en.${key} names no actor or list`);
  assert.doesNotMatch(copy.ar[key], /أكّده السائق|بانتظار السائق/, `ar.${key} names no actor or list`);
}
assert.match(copy.en.cashRecordedDisputed, /driver and the office/);
assert.match(copy.ar.cashRecordedDisputed, /السائق والمكتب/);
assert.match(copy.en.cashFinanceRequired, /finance duty[\s\S]*same receipt/);
assert.match(copy.ar.cashFinanceRequired, /صلاحية المالية[\s\S]*الإيصال نفسه/);
// Haiku r25 M1: a refused first send (or a Mark decision) saved nothing, and says so.
assert.match(copy.en.cashFinanceRefused, /Nothing was recorded/);
assert.match(copy.ar.cashFinanceRefused, /لم يُسجَّل شيء/);
assert.match(copy.en.cashFinanceRequired, /another account or device/);
