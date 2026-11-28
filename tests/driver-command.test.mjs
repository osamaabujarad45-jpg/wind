import assert from 'node:assert/strict';
import * as driverCommands from '../src/driver-command.ts';
import { copy } from '../src/copy.ts';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const { advanceRequest, earlierOutcome, newDriverCommand, otherOrderNotice, readDriverCommand, driverCommandBody, resumeDriverCommand, settleOtherOrder } = driverCommands;
// The saved command is shared between tabs, so the whole recovery runs under its own lock (not the session's: a 401 inside takes that one).
const recovery = readFileSync(new URL('../src/driver-recovery.ts', import.meta.url), 'utf8');
assert.match(recovery, /storage\.exclusive\(async[\s\S]*'wind\.driver\.command'\)/);
// Only a confirmed command may claim it went through: a refusal did not, and a conflict is unknown.
assert.equal(otherOrderNotice('applied'), 'driver_command_other_done');
for (const state of ['rejected', 'conflict']) assert.equal(otherOrderNotice(state), 'driver_command_other_unconfirmed', state);
for (const language of ['ar', 'en']) for (const state of ['applied', 'rejected'])
  assert.ok(copy[language][`err_${otherOrderNotice(state)}`]?.trim(), `${language} ${state} has a message`);
{ // A command saved for parcel A must not block parcel B when A can no longer be settled from its own screen: reassigned, the courier cannot open A at all.
  const a = { id: 5, driverId: 9, status: 'in_transit', assignedAt: 100, recovery: { schemaVersion: 1, version: 7, assignmentEpoch: 2 } };
  const pending = newDriverCommand(9, a, 'advance', { code: '1234' }, 1000, 60_000);
  const rig = (receiptState = 'unknown', send = async () => ({ id: 5, status: 'completed' })) => {
    const io = { stored: structuredClone(pending), sends: 0, read: async () => io.stored, write: async c => { io.stored = c; }, valid: () => true,
      receipt: async c => ({ schemaVersion: 1, orderId: c.orderId, requestId: c.requestId, state: receiptState }),
      send: async c => { io.sends++; return send(c); } };
    return io;
  };
  const gone = status => async () => { throw Object.assign(new Error('not_found'), { status }); };
  for (const status of [403, 404]) {
    const io = rig();
    assert.deepEqual(await settleOtherOrder(io, 9, pending, gone(status)), { state: 'empty' }, `A answers ${status}: it is no longer this courier's`);
    assert.equal(io.stored, null, 'the dead command stops blocking other parcels');
    assert.equal(io.sends, 0);
  }
  { const io = rig();
    assert.deepEqual(await settleOtherOrder(io, 9, pending, async () => ({ ...a, driverId: 77 })), { state: 'empty' }, 'reassigned to another driver');
    assert.equal(io.stored, null); assert.equal(io.sends, 0); }
  { const io = rig();
    assert.deepEqual(await settleOtherOrder(io, 9, pending, async () => { throw new Error('network'); }), { state: 'other_order', orderId: 5 }, 'offline proves nothing: keep it');
    assert.deepEqual(io.stored, pending); }
  { const io = rig('applied');
    assert.deepEqual(await settleOtherOrder(io, 9, pending, async () => a), { state: 'applied', error: undefined, httpStatus: undefined }, 'A had already committed');
    assert.equal(io.stored, null); assert.equal(io.sends, 0, 'a committed receipt is never sent again'); }
  { const io = rig();
    const settled = await settleOtherOrder(io, 9, pending, async () => a);
    assert.equal(settled.state, 'applied', 'still pending and still valid: the same request is replayed');
    assert.equal(io.sends, 1); assert.equal(io.stored, null);
    assert.ok(!('order' in settled), "A's order must not be handed to B's screen"); }
  { const io = rig('unknown', async () => { throw new Error('network'); });
    assert.deepEqual(await settleOtherOrder(io, 9, pending, async () => a), { state: 'other_order', orderId: 5 }, 'a lost reply stays unconfirmed');
    assert.deepEqual(io.stored, pending, 'and keeps its identity'); }
  { const io = rig('unknown', async () => { throw Object.assign(new Error('wrong_code'), { status: 400 }); });
    io.read = async () => pending; // as in driver-recovery.ts: read returns the command it captured, whatever write stored since
    assert.deepEqual(await settleOtherOrder(io, 9, pending, async () => a), { state: 'rejected' }, 'a definite refusal settles A');
    assert.equal(io.stored, null); }
  { const io = rig('unknown', async () => { throw Object.assign(new Error('idempotency_conflict'), { status: 409 }); });
    assert.deepEqual(await settleOtherOrder(io, 9, pending, async () => a), { state: 'other_order', orderId: 5 }, 'not definite: the same refusal rule as resume keeps it');
    assert.deepEqual(io.stored, pending); }
  { const io = rig();
    assert.equal((await settleOtherOrder(io, 9, pending, async () => ({ ...a, status: 'completed' }))).state, 'conflict', "A moved on, so this command can't apply");
    assert.equal(io.stored, null, 'and it is dropped, as it is on A'); assert.equal(io.sends, 0); }
}
// A command saved for another order was never settled: saying "your earlier action was processed first" would be false, and it needs its own message.
assert.equal(earlierOutcome({ state: 'other_order', orderId: 4 }, true).state, 'other_order');
assert.deepEqual(earlierOutcome({ state: 'applied' }, true), { state: 'previous', previous: { state: 'applied' } });
assert.deepEqual(earlierOutcome({ state: 'rejected' }, true), { state: 'previous', previous: { state: 'rejected' } });
assert.deepEqual(earlierOutcome({ state: 'applied' }, false), { state: 'applied' }, 'the requested action reports as itself');
for (const language of ['ar', 'en']) for (const key of ['err_driver_command_other_order', 'err_driver_command_pending', 'err_driver_command_previous'])
  assert.ok(copy[language][key]?.trim(), `${language} ${key}`);
const order = { id: 5, driverId: 9, status: 'in_transit', assignedAt: 100, recovery: { schemaVersion: 1, version: 7, assignmentEpoch: 2 } };
const command = newDriverCommand(9, order, 'advance', { code: '1234' }, 1000, 60_000);
// D-7: "The rider has no code" survives a restart as its own payload, never beside a code and never on an exception.
const noCodeCommand = newDriverCommand(9, order, 'advance', { noCode: true }, 1000, 60_000);
assert.equal(driverCommandBody(noCodeCommand).noCode, true);
assert.throws(() => readDriverCommand({ ...noCodeCommand, payload: { noCode: true, code: '1234' } }), /invalid_pending_command/);
assert.throws(() => readDriverCommand({ ...noCodeCommand, payload: { noCode: false } }), /invalid_pending_command/);
assert.throws(() => readDriverCommand({ ...noCodeCommand, action: 'exception', payload: { noCode: true, reason: 'absent', note: '' } }), /invalid_pending_command/);
const noCodeProof = { expectedStatus: 'in_transit', code: '', noCode: true };
const noCodeAttempt = advanceRequest(null, 5, noCodeProof, () => 'id-1');
assert.equal(noCodeAttempt.body.noCode, true);
assert.notEqual(advanceRequest(noCodeAttempt, 5, { expectedStatus: 'in_transit', code: '' }, () => 'id-2').body.requestId, 'id-1', 'a code attempt is a new request');
assert.equal(advanceRequest(noCodeAttempt, 5, { ...noCodeProof, expectedProofVersion: 8 }, () => 'after-pause').body.requestId, 'after-pause');
{
  const resumed = { ...order, recovery: { ...order.recovery, version: 8 }, proofVersion: 4 };
  const writes = [], requests = [];
  const dependencies = {
    './api': { ApiError: Error, api: async (path, body) => {
      requests.push({ path, body });
      if (path.includes('?')) return resumed;
      if (path.includes('/actions/')) return { orderId: order.id, requestId: path.split('/').at(-1), schemaVersion: 1, state: 'unknown' };
      return { ...resumed, status: 'completed' };
    } },
    './api-client': { apiSessionRevision: () => 1, serverOffset: () => 0 },
    './driver-command': driverCommands,
    './recovery-storage': { recoveryStorage: { read: async () => null, write: async (_key, value) => { writes.push(value); } } },
    './runtime-config': { effectiveRuntime: () => ({ values: { commandMaxAgeMs: 60_000 } }) },
    './storage': { storage: { exclusive: work => work() } },
  };
  const exports = {};
  runInNewContext(ts.transpileModule(recovery, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => dependencies[name] });
  await assert.rejects(exports.recoverDriverAction(9, order, 'advance', { noCode: true }), /order_changed/);
  assert.equal(requests.length, 1, 'the old confirmation may read the current order');
  assert.equal(writes.length, 0, 'but it cannot save an intent using the current revision');
  assert.equal((await exports.recoverDriverAction(9, resumed, 'advance', { noCode: true })).state, 'applied');
  assert.equal(writes[0].expectedProofVersion, 4);
  assert.equal(requests.at(-1).body.expectedProofVersion, 4);
}
let saved = structuredClone(command), sends = 0, valid = true;
const receipt = state => ({ schemaVersion: 1, orderId: 5, requestId: command.requestId, state });
const io = { read: async () => saved, write: async c => { saved = c; }, valid: () => valid,
  receipt: async () => receipt('unknown'), send: async c => { sends++; assert.deepEqual(c, command); throw new Error('network'); } };
await assert.rejects(resumeDriverCommand(io, 9, order), /network/);
assert.deepEqual(saved, command, 'lost acknowledgement retains exact identity, payload and assignment');
const restarted = structuredClone(saved);
saved = restarted;
io.receipt = async () => receipt('applied');
assert.equal((await resumeDriverCommand(io, 9, order)).state, 'applied');
assert.equal(sends, 1, 'a committed receipt never sends a second proof attempt');
assert.equal(saved, null);
saved = structuredClone(command); io.receipt = async () => ({ ...receipt('rejected'), error: 'wrong_code', httpStatus: 400 });
assert.equal((await resumeDriverCommand(io, 9, order)).error, 'wrong_code'); assert.equal(saved, null);
saved = structuredClone(command); io.receipt = async () => receipt('unknown');
assert.equal((await resumeDriverCommand(io, 9, { ...order, assignedAt: 200 })).state, 'conflict');
assert.equal((await resumeDriverCommand(io, 9, { ...order, recovery: { ...order.recovery, assignmentEpoch: 3 } })).state, 'conflict');
assert.equal((await resumeDriverCommand(io, 9, { ...order, status: 'completed' })).state, 'conflict');
assert.equal((await resumeDriverCommand(io, 10, order)).state, 'other_order');
valid = false; await assert.rejects(resumeDriverCommand(io, 9, order), /session_changed/);
valid = true; io.receipt = async () => ({ ...receipt('applied'), requestId: 'another' });
await assert.rejects(resumeDriverCommand(io, 9, order), /invalid_response/);
assert.equal(driverCommandBody(command).requestId, command.requestId);
assert.equal(driverCommandBody(command).expectedAssignmentEpoch, 2);
const boardingCommand = newDriverCommand(9, { ...order, journey: { boarding: { pinRevision: 3 } } }, 'advance', {code:'1234'}, 1000, 60_000);
assert.equal(driverCommandBody(boardingCommand).expectedPinRevision,3,'protected proof intent binds to the reviewed challenge');
assert.throws(() => readDriverCommand({ ...command, payload: { code: 'not-a-pin' } }));
assert.throws(() => readDriverCommand({ ...command, expiresAt: command.createdAt }));
// A11 door cash on a saved command: only a completing advance carries it, the amount is a whole number, and a reason needs an amount and a listed name.
assert.equal(readDriverCommand({ ...command, payload: { code: '1234', collectedCents: 4000, varianceReason: 'PARTIAL_PAYMENT' } }).payload.varianceReason, 'PARTIAL_PAYMENT');
assert.equal(readDriverCommand({ ...command, payload: { code: '1234', collectedCents: 4900 } }).payload.collectedCents, 4900, 'an exact amount takes no reason');
for (const payload of [{ varianceReason: 'PARTIAL_PAYMENT' }, { collectedCents: 1.5 }, { collectedCents: 4000, varianceReason: 'tip' }])
  assert.throws(() => readDriverCommand({ ...command, payload: { code: '1234', ...payload } }), /invalid_pending_command/, JSON.stringify(payload));
assert.equal(readDriverCommand({ ...command, action: 'exception', payload: { reason: 'absent', note: '' } }).action, 'exception', 'an exception with no cash stays valid');
// SHIP-17: a saved pickup refusal keeps its sub-reason and sends it; a refusal without one, or a sub-reason on another reason, is refused.
const refusal = readDriverCommand({ ...command, action: 'exception', payload: { reason: 'captain_refused_pickup', detail: 'damaged_parcel', note: '' } });
assert.equal(driverCommandBody(refusal).detail, 'damaged_parcel');
for (const payload of [{ reason: 'captain_refused_pickup', note: '' }, { reason: 'captain_refused_pickup', detail: 'smells', note: '' }, { reason: 'absent', detail: 'damaged_parcel', note: '' }])
  assert.throws(() => readDriverCommand({ ...command, action: 'exception', payload }), /invalid_pending_command/, JSON.stringify(payload));
for (const reason of ['rescheduled', 'access_blocked', 'damaged'])
  assert.equal(readDriverCommand({ ...command, action: 'exception', payload: { reason, note: '' } }).payload.reason, reason, `queued ${reason} stays valid`);
assert.throws(() => readDriverCommand({ ...command, action: 'exception', payload: { reason: 'lost_in_space', note: '' } }), /invalid_pending_command/);
assert.throws(() => readDriverCommand({ ...command, action: 'exception', payload: { reason: 'absent', note: '', collectedCents: 4000 } }), /invalid_pending_command/, 'cash never rides on an exception');
const proof = { expectedStatus: 'at_pickup', code: '1234', expectedPinRevision: 1 };
const held = advanceRequest(null, 5, proof, () => 'first');
assert.equal(advanceRequest(held, 5, { ...proof }, () => 'second'), held, 'a lost acknowledgement replays the same advance');
assert.equal(advanceRequest(held, 5, { ...proof, expectedPinRevision: 2 }, () => 'second').body.requestId, 'second', 'a rotated PIN is a new advance');
assert.equal(advanceRequest(held, 5, { ...proof, code: '5678' }, () => 'second').body.code, '5678', 'a retyped code is sent, not the held one');
// A11: a corrected amount or reason is a new advance, so a lost acknowledgement never replays the old cash figure.
const cashProof = { expectedStatus: 'in_transit', code: '1234', collectedCents: 4900 };
const exactHeld = advanceRequest(null, 5, cashProof, () => 'exact');
assert.equal(advanceRequest(exactHeld, 5, { ...cashProof }, () => 'second'), exactHeld, 'the same amount replays the same advance');
assert.equal(advanceRequest(exactHeld, 5, { ...cashProof, collectedCents: 4000, varianceReason: 'PARTIAL_PAYMENT' }, () => 'amount').body.requestId, 'amount', 'a corrected amount is a new advance');
const shortHeld = advanceRequest(null, 5, { ...cashProof, collectedCents: 4000, varianceReason: 'PARTIAL_PAYMENT' }, () => 'short');
assert.equal(advanceRequest(shortHeld, 5, { ...cashProof, collectedCents: 4000, varianceReason: 'PARTIAL_PAYMENT' }, () => 'second'), shortHeld, 'the same short payment replays');
assert.equal(advanceRequest(shortHeld, 5, { ...cashProof, collectedCents: 4000, varianceReason: 'APPROVED_DISCOUNT' }, () => 'reason').body.requestId, 'reason', 'a changed reason alone is a new advance');
assert.equal(advanceRequest(shortHeld, 5, { ...cashProof, collectedCents: 4000 }, () => 'cleared').body.requestId, 'cleared', 'a cleared reason is a new advance');
console.log('Driver command process replacement, exact replay, proof-once receipts, assignment fences, session invalidation and screen advance replay passed');
