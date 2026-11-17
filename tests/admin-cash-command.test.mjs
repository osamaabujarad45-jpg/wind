import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cashCommandBody, newCashCommand, readCashCommand, recoverCashCommand, refusedForGood, sendCashCommand } from '../src/admin-cash-command.ts';

// A-01: a remittance whose reply is lost survives an app restart and is settled only by the admin's own command receipt
// or a definite refusal; never shown as recorded or failed by guess.
const command = newCashCommand(7, 42, 'remittance', 1250, 'Office handover', '0b8f6a52-6c1e-4f7a-9d2b-3e4f5a6b7c8d');
const rig = ({ receipt = async () => ({ entry: null }), send = async () => ({ id: 99, reference: 'R-99' }) } = {}) => {
  const io = { stored: null, sends: 0, writes: [], read: async () => io.stored,
    write: async c => { io.writes.push(c && c.requestId); io.stored = c; }, receipt, send: async c => { io.sends++; return send(c); } };
  return io;
};
const failing = status => async () => { throw Object.assign(new Error('x'), { status }); };

{ // The command is saved before the request leaves, so a reply lost mid-flight is still on disk.
  const io = rig({ send: async () => { assert.equal(io.stored?.requestId, command.requestId, 'saved before send'); return { id: 99, reference: 'R-99' }; } });
  assert.deepEqual(await sendCashCommand(io, command), { state: 'recorded', command, entry: { id: 99, reference: 'R-99' } });
  assert.equal(io.stored, null, 'a recorded entry clears the saved command');
}
for (const status of [undefined, 0, 500, 502, 401, 403, 408, 429]) { // lost reply, server error, or a session problem: nothing is known
  const io = rig({ send: failing(status) });
  assert.equal((await sendCashCommand(io, command)).state, 'unconfirmed', String(status));
  assert.equal(io.stored?.requestId, command.requestId, `${status} keeps the command for a same-id resend`);
}
for (const status of [400, 404, 409]) { // the server refused this request id: nothing was recorded under it
  const io = rig({ send: failing(status) });
  assert.equal((await sendCashCommand(io, command)).state, 'refused', String(status));
  assert.equal(io.stored, null);
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
  }
  assert.throws(() => readCashCommand({ ...command, amountCents: 0 }, 7), /invalid_pending_command/);
  assert.throws(() => readCashCommand({ ...command, requestId: 'nope' }, 7), /invalid_pending_command/);
}
// The body is the same one the form sent: an adjustment names its reason, a remittance its note.
assert.deepEqual(cashCommandBody(command), { driverId: 42, amountCents: 1250, note: 'Office handover', requestId: command.requestId });
assert.deepEqual(cashCommandBody({ ...command, kind: 'adjustment' }), { driverId: 42, amountCents: 1250, reason: 'Office handover', requestId: command.requestId });

// The screen saves through the encrypted recovery store and recovers when it opens; an unconfirmed form cannot be dismissed.
const screen = readFileSync(new URL('../src/app/admin/cash.tsx', import.meta.url), 'utf8');
assert.match(screen, /sendCashCommand\(/);
assert.match(screen, /recoverCashCommand\(/);
assert.match(screen, /recoveryStorage\.(read|write)\('command'/);
assert.match(screen, /!open\.uncertain && <Button title=\{c\.cancel\}/);
console.log('PASS: admin cash commands survive a lost reply and a restart, settled only by a command receipt or a definite refusal');
