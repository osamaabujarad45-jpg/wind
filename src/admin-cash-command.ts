import { newRequestId } from './command-id.ts';

// A-01: an admin's remittance or adjustment is saved before it is sent, so a lost reply survives an app restart and a
// forced sign-out, and is settled by the admin's own command receipt or by resending the same request id; never by guessing.
export type CashKind = 'remittance' | 'adjustment' | 'payout';
export type CashCommand = { type: 'admin_cash'; schemaVersion: 1; actorId: number; requestId: string; driverId: number;
  kind: CashKind; amountCents: number; note: string };
export type CashEntry = { id: number; kind?: CashKind; reference?: string | null };
export type CashIO = { read: () => Promise<unknown>; write: (command: CashCommand | null) => Promise<void>;
  receipt: (command: CashCommand) => Promise<{ entry: CashEntry | null }>; send: (command: CashCommand) => Promise<CashEntry>;
  /** One command at a time across tabs: without it a second tab overwrites a saved unconfirmed command. */
  exclusive?: <T>(run: () => Promise<T>) => Promise<T> };
export type CashOutcome = { state: 'empty' } | { state: 'recorded'; command: CashCommand; entry: CashEntry }
  | { state: 'refused'; command: CashCommand; error: unknown } | { state: 'unconfirmed'; command: CashCommand; error?: unknown };

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const id = (n: unknown) => Number.isSafeInteger(n) && (n as number) > 0;
const status = (error: unknown) => (error as { status?: number } | null)?.status ?? 0;
// A failed clear leaves a settled command saved; the next recovery reads its receipt and clears it, so it is never resent blind.
const clear = (io: CashIO) => io.write(null).catch(() => undefined);
const locked = <T>(io: CashIO, run: () => Promise<T>) => io.exclusive ? io.exclusive(run) : run();

/** The account's own slot (like a pending booking): it outlives the session token, so a forced sign-out keeps it. */
export const cashCommandKey = (actorId: number) => `adminCash.${actorId}`;
/** The admin's slot as stored. Unparseable bytes are a broken cash record: dropped like one, not an error on every visit
 *  (no request id survives them, so nothing could be resent or looked up). */
export function parseCashSlot(raw: string | null): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { throw new Error('invalid_pending_command'); }
}

/** The saved cash command of this admin, or null. Another record type or another admin's record is not this one. */
export function readCashCommand(raw: unknown, actorId: number): CashCommand | null {
  const c = raw as CashCommand | null;
  if (!c || typeof c !== 'object' || c.type !== 'admin_cash' || c.actorId !== actorId) return null;
  if (c.schemaVersion !== 1 || !uuid.test(String(c.requestId)) || !id(c.driverId) || !['remittance', 'adjustment', 'payout'].includes(c.kind)
    || !Number.isSafeInteger(c.amountCents) || c.amountCents === 0 || typeof c.note !== 'string' || c.note.length > 500) throw new Error('invalid_pending_command');
  return c;
}

export const newCashCommand = (actorId: number, driverId: number, kind: CashKind, amountCents: number, note: string, requestId = newRequestId()): CashCommand =>
  ({ type: 'admin_cash', schemaVersion: 1, actorId, requestId, driverId, kind, amountCents, note });

export const cashCommandBody = (c: CashCommand) => c.kind === 'remittance'
  ? { driverId: c.driverId, amountCents: c.amountCents, note: c.note, requestId: c.requestId }
  : { driverId: c.driverId, amountCents: c.amountCents, reason: c.note, requestId: c.requestId, ...(c.kind === 'payout' && { source: 'payout' }) };

/** Only a refusal of the request itself proves nothing was recorded under this id: the server replays a saved entry
 *  before it checks the balance. 401/403/408/429 and 5xx say nothing about an earlier attempt. */
export const refusedForGood = (error: unknown) => [400, 404, 409].includes(status(error));

/** Save, then send. Recorded or refused-for-good clears the saved command; anything else keeps it unconfirmed.
 *  A different command still unconfirmed is never overwritten: it must be settled first. */
export function sendCashCommand(io: CashIO, command: CashCommand): Promise<CashOutcome> {
  return locked(io, async () => {
    const saved = readCashCommand(await io.read(), command.actorId);
    if (saved && saved.requestId !== command.requestId) throw new Error('cash_command_pending');
    await io.write(command); // before the request: a reply lost after this point is still recoverable
    try {
      const entry = await io.send(command);
      await clear(io);
      return { state: 'recorded', command, entry };
    } catch (error) {
      if (!refusedForGood(error)) return { state: 'unconfirmed', command, error };
      if (status(error) === 409) { // 409 can also mean this admin's own entry exists: only its receipt can tell
        try {
          const { entry } = await io.receipt(command);
          if (entry) { await clear(io); return { state: 'recorded', command, entry }; }
        } catch { return { state: 'unconfirmed', command, error }; }
      }
      await clear(io);
      return { state: 'refused', command, error };
    }
  });
}

/** After a restart: the admin's own command receipt settles a saved command; no receipt keeps it unconfirmed.
 *  An unreadable record cannot be resent, so it is dropped; a storage read failure is thrown and keeps it. */
export function recoverCashCommand(io: CashIO, actorId: number): Promise<CashOutcome> {
  return locked(io, async () => {
    let command: CashCommand | null;
    try { command = readCashCommand(await io.read(), actorId); }
    catch (error) {
      if ((error as Error).message !== 'invalid_pending_command') throw error;
      await clear(io);
      return { state: 'empty' };
    }
    if (!command) return { state: 'empty' };
    try {
      const { entry } = await io.receipt(command);
      if (!entry) return { state: 'unconfirmed', command }; // a point-in-time read, never proof the first send cannot land
      await clear(io);
      return { state: 'recorded', command, entry };
    } catch (error) { return { state: 'unconfirmed', command, error }; }
  });
}

/** The open form after an outcome. Only the form that was sent changes; a form opened meanwhile for another driver keeps
 *  its input. Recorded closes it, unconfirmed locks it, refused unlocks it (nothing was recorded under this id). */
export function formAfter<F extends { requestId: string; uncertain?: boolean }>(form: F | null, outcome: CashOutcome): F | null {
  if (!form || outcome.state === 'empty' || form.requestId !== outcome.command.requestId) return form;
  if (outcome.state === 'recorded') return null;
  return { ...form, uncertain: outcome.state === 'unconfirmed' };
}
