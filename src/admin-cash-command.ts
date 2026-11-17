import { newRequestId } from './command-id.ts';

// A-01: an admin's remittance or adjustment is saved before it is sent, so a lost reply survives an app restart and is
// settled by the admin's own command receipt or by resending the same request id; never by guessing.
export type CashKind = 'remittance' | 'adjustment';
export type CashCommand = { type: 'admin_cash'; schemaVersion: 1; actorId: number; requestId: string; driverId: number;
  kind: CashKind; amountCents: number; note: string };
export type CashEntry = { id: number; reference?: string | null };
export type CashIO = { read: () => Promise<unknown>; write: (command: CashCommand | null) => Promise<void>;
  receipt: (command: CashCommand) => Promise<{ entry: CashEntry | null }>; send: (command: CashCommand) => Promise<CashEntry> };
export type CashOutcome = { state: 'empty' } | { state: 'recorded'; command: CashCommand; entry: CashEntry }
  | { state: 'refused'; command: CashCommand; error: unknown } | { state: 'unconfirmed'; command: CashCommand; error?: unknown };

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const id = (n: unknown) => Number.isSafeInteger(n) && (n as number) > 0;
// A failed clear leaves a settled command saved; the next recovery reads its receipt and clears it, so it is never resent blind.
const clear = (io: CashIO) => io.write(null).catch(() => undefined);

/** The saved cash command of this admin, or null. Another record type or another admin's record is not this one. */
export function readCashCommand(raw: unknown, actorId: number): CashCommand | null {
  const c = raw as CashCommand | null;
  if (!c || typeof c !== 'object' || c.type !== 'admin_cash' || c.actorId !== actorId) return null;
  if (c.schemaVersion !== 1 || !uuid.test(String(c.requestId)) || !id(c.driverId) || !['remittance', 'adjustment'].includes(c.kind)
    || !Number.isSafeInteger(c.amountCents) || c.amountCents === 0 || typeof c.note !== 'string' || c.note.length > 500) throw new Error('invalid_pending_command');
  return c;
}

export const newCashCommand = (actorId: number, driverId: number, kind: CashKind, amountCents: number, note: string, requestId = newRequestId()): CashCommand =>
  ({ type: 'admin_cash', schemaVersion: 1, actorId, requestId, driverId, kind, amountCents, note });

export const cashCommandBody = (c: CashCommand) => c.kind === 'remittance'
  ? { driverId: c.driverId, amountCents: c.amountCents, note: c.note, requestId: c.requestId }
  : { driverId: c.driverId, amountCents: c.amountCents, reason: c.note, requestId: c.requestId };

/** Only a refusal of the request itself proves nothing was recorded under this id: the server replays a saved entry
 *  before it checks the balance. 401/403/408/429 and 5xx say nothing about an earlier attempt. */
export const refusedForGood = (error: unknown) => [400, 404, 409].includes((error as { status?: number } | null)?.status ?? 0);

/** Save, then send. Recorded or refused-for-good clears the saved command; anything else keeps it unconfirmed. */
export async function sendCashCommand(io: CashIO, command: CashCommand): Promise<CashOutcome> {
  await io.write(command); // before the request: a reply lost after this point is still recoverable
  try {
    const entry = await io.send(command);
    await clear(io);
    return { state: 'recorded', command, entry };
  } catch (error) {
    if (!refusedForGood(error)) return { state: 'unconfirmed', command, error };
    await clear(io);
    return { state: 'refused', command, error };
  }
}

/** After a restart: the admin's own command receipt settles a saved command; no receipt keeps it unconfirmed. */
export async function recoverCashCommand(io: CashIO, actorId: number): Promise<CashOutcome> {
  const command = readCashCommand(await io.read(), actorId);
  if (!command) return { state: 'empty' };
  try {
    const { entry } = await io.receipt(command);
    if (!entry) return { state: 'unconfirmed', command }; // a point-in-time read, never proof the first send cannot land
    await clear(io);
    return { state: 'recorded', command, entry };
  } catch (error) { return { state: 'unconfirmed', command, error }; }
}
