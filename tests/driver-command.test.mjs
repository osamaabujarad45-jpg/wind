import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as commandModule from '../src/driver-command.ts';
import { newDriverCommand, readDriverCommand, driverCommandBody, resumeDriverCommand } from '../src/driver-command.ts';
const order = { id: 5, driverId: 9, status: 'in_transit', assignedAt: 100, recovery: { schemaVersion: 1, version: 7, assignmentEpoch: 2 } };
const command = newDriverCommand(9, order, 'advance', { code: '1234' }, 1000, 60_000);
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
{
  // recoverDriverAction owns the one saved outbox slot. A restored command answers only the tap that created it:
  // a driver who taps something else (another PIN, another action) must never be told the OLD command was the NEW tap.
  class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const onScreen = { id: 5, driverId: 9, status: 'in_transit', assignedAt: 100, recovery: { schemaVersion: 1, version: 7, assignmentEpoch: 2 } };
  const recovery = savedCommand => {
    const sent = []; let stored = savedCommand;
    const modules = {
      './api': { ApiError, api: async (path, body) => {
        if (body === undefined && path.includes('/actions/')) return { schemaVersion: 1, orderId: 5, requestId: path.split('/').pop(), state: 'unknown' };
        if (body === undefined) return structuredClone(onScreen); // a fresh authorized snapshot for a new intent
        sent.push({ path, body }); return { ...onScreen, status: 'completed' };
      } },
      './api-client': { apiSessionRevision: () => 0, serverOffset: () => 0 }, './driver-command': commandModule,
      './recovery-storage': { recoveryStorage: { read: async () => stored, write: async (_key, value) => { stored = value; } } },
      './runtime-config': { effectiveRuntime: () => ({ values: { commandMaxAgeMs: 60_000 } }) },
    };
    const file = 'driver-recovery.ts', context = { exports: {}, process: { env: {} }, Date,
      require: name => { assert.ok(name in modules, `missing stub ${name}`); return modules[name]; } };
    runInNewContext(ts.transpileModule(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'),
      { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context, { filename: file });
    return { sent, recover: context.exports.recoverDriverAction };
  };
  const tap = async (fixture, action, payload) => fixture.recover(9, onScreen, action, payload).then(result => ({ result }), error => ({ error }));

  const differentPin = recovery(structuredClone(command)); // saved: advance with PIN 1234 whose acknowledgement was lost
  const pin = await tap(differentPin, 'advance', { code: '5678' });
  if (pin.result?.state === 'applied') assert.equal(differentPin.sent.at(-1).body.code, '5678',
    'a result for a tap with another PIN must not be the restored command that carried the old PIN');

  const differentAction = recovery(structuredClone(command)); // saved: advance; the driver now reports an exception
  const exception = await tap(differentAction, 'exception', { reason: 'absent', note: '' });
  if (exception.result?.state === 'applied') assert.equal(differentAction.sent.at(-1).path, '/orders/5/exception',
    'a result for a new exception tap must not be the restored advance command');

  const sameTap = recovery(structuredClone(command)); // retrying the very same tap still resumes the exact saved identity
  const retry = await tap(sameTap, 'advance', { code: '1234' });
  assert.equal(retry.result?.state, 'applied', 'the same action and PIN resume the saved command');
  assert.equal(sameTap.sent.length, 1); assert.equal(sameTap.sent[0].body.requestId, command.requestId);
}
console.log('Driver command process replacement, exact replay, proof-once receipts, assignment fences and session invalidation passed');
