import { newRequestId } from './command-id.ts';

// A-01: an admin's remittance or adjustment is saved before it is sent, so a lost reply survives an app restart and a
// forced sign-out, and is settled by the admin's own command receipt or by resending the same request id; never by guessing.
export type CashKind = 'remittance' | 'adjustment' | 'payout';
// schemaVersion 2 (this build): a positive 'adjustment' is a charge and a payout is its own kind. Version 1 is the installed
// build's record, whose Pay driver also saved a positive 'adjustment': its intent is unknowable (Sol R8-H1).
// `refused`: the server refused it for good but the slot could not be cleared; it is then settled by receipt only (Sol R12-M2).
export type CashCommand = { type: 'admin_cash'; schemaVersion: 1 | 2; refused?: true; actorId: number; requestId: string; driverId: number;
  kind: CashKind; amountCents: number; note: string };
export type CashEntry = { id: number; kind?: CashKind; reference?: string | null; amountCents?: number; note?: string; source?: string };
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

/** The account's own slot (like a pending booking): it outlives the session token, so a forced sign-out keeps it.
 *  Schema 2 has its own slot: an installed bundle reads only the legacy one and clears a record it cannot parse, which
 *  would erase this build's pending request id (Sol R9-H2), and a rolled-back bundle never sees it either (Haiku r7 L-5). */
export const cashCommandKey = (actorId: number) => `adminCash.v2.${actorId}`;
/** The installed build's slot, read so its pending command is settled by its own receipt. This build never creates a
 *  record there; it only re-saves or clears the installed build's own record while settling it. */
export const legacyCashCommandKey = (actorId: number) => `adminCash.${actorId}`;
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
  if ((c.schemaVersion !== 1 && c.schemaVersion !== 2) || !uuid.test(String(c.requestId)) || !id(c.driverId) || !['remittance', 'adjustment', 'payout'].includes(c.kind)
    || !Number.isSafeInteger(c.amountCents) || c.amountCents === 0 || typeof c.note !== 'string' || c.note.length > 500) throw new Error('invalid_pending_command');
  return c;
}

export const newCashCommand = (actorId: number, driverId: number, kind: CashKind, amountCents: number, note: string, requestId = newRequestId()): CashCommand =>
  ({ type: 'admin_cash', schemaVersion: 2, actorId, requestId, driverId, kind, amountCents, note });

/** An installed build's saved positive adjustment: a payout or a charge, nobody can tell. It is never resent under either
 *  meaning; only its own receipt settles it, and without one the cashier checks the balance and enters it again. */
export const ambiguousLegacy = (c: CashCommand) => c.schemaVersion === 1 && c.kind === 'adjustment' && c.amountCents > 0;
const ambiguous = 'cash_command_ambiguous';
/** Does a receipt hold this exact request? A receipt names its kind, amount and note (and a payout its source), so the
 *  same id under another meaning is a conflict, never a success (Sol R10-L1, Haiku r8 N2). `undefined`: a minimal receipt
 *  (older server) says only that the id exists, which settles nothing (Sol R11-L1). The captain is not in the receipt:
 *  request ids are random per form and the server's replay compares the captain, so a same-id receipt for another
 *  captain cannot arise from this client. */
export function receiptMatches(entry: CashEntry, command: CashCommand): boolean | undefined {
  if (entry.amountCents === undefined) return undefined;
  const kind = command.kind === 'payout' ? 'adjustment' : command.kind;
  return entry.kind === kind && entry.amountCents === command.amountCents && (entry.note ?? '') === command.note
    && (entry.source === 'payout') === (command.kind === 'payout');
}
const conflict = 'idempotency_conflict';
const settledElsewhere = 'cash_command_settled';
/** Settle a command by its receipt alone, never by sending it. Used for an installed build's command whose meaning is
 *  unknowable (any receipt settles it), and for a retry whose slot no longer holds it: another tab or window already
 *  settled it, so resending could book it twice (Haiku r9 M1). No receipt: refused for good, check the balance. */
async function settleByReceipt(io: CashIO, command: CashCommand, alive: () => boolean = () => true): Promise<CashOutcome> {
  const legacy = ambiguousLegacy(command);
  try {
    if (!alive()) return { state: 'empty' };
    const { entry } = await io.receipt(command);
    if (!alive()) return { state: 'empty' }; // another admin signed in meanwhile: that receipt answered for them, not for this slot
    // An installed build's adjustment is a payout or a charge: either meaning settles it, but amount, kind and note must
    // match, and a receipt naming only its id settles nothing (Sol R12-L1, Haiku r10 N1).
    const match = !entry ? false : legacy
      ? (entry.amountCents === undefined ? undefined : entry.kind === 'adjustment' && entry.amountCents === command.amountCents && (entry.note ?? '') === command.note)
      : receiptMatches(entry, command);
    if (entry && match === undefined) return { state: 'unconfirmed', command };
    // Clear only this command: another tab may have settled it and a different command may hold the slot now.
    const now = await io.read().then(raw => readCashCommand(raw, command.actorId)).catch(() => null);
    if (now?.requestId === command.requestId) await clear(io);
    if (entry) return match ? { state: 'recorded', command, entry } : { state: 'refused', command, error: conflict };
    return { state: 'refused', command, error: legacy ? ambiguous : settledElsewhere };
  } catch (error) { return { state: 'unconfirmed', command, error }; }
}

export function cashCommandBody({ kind, driverId, amountCents, note, requestId }: CashCommand) {
  const body = { driverId, amountCents, requestId };
  if (kind === 'remittance') return { ...body, note };
  if (kind === 'payout') return { ...body, reason: note, intent: 'payout', source: 'payout' };
  return { ...body, reason: note, ...(amountCents > 0 && { intent: 'charge' }) };
}

/** Only a refusal of the request itself proves nothing was recorded under this id: the server replays a saved entry
 *  before it checks the balance. 401/403/408/429 and 5xx say nothing about an earlier attempt. */
export const refusedForGood = (error: unknown) => [400, 404, 409].includes(status(error));

/** Save, then send. Recorded or refused-for-good clears the saved command; anything else keeps it unconfirmed.
 *  A different command still unconfirmed is never overwritten: it must be settled first. `retry`: the command comes
 *  from a restored, uncertain form, so it is resent only while its slot still holds it. */
export function sendCashCommand(io: CashIO, command: CashCommand, retry = false): Promise<CashOutcome> {
  return locked(io, async () => {
    const saved = readCashCommand(await io.read(), command.actorId);
    if (saved && saved.requestId !== command.requestId) throw new Error('cash_command_pending');
    // An installed build's positive adjustment is never sent under either meaning (Sol R9-H1), and a retry whose slot
    // was cleared elsewhere is never sent again (Haiku r9 M1): both are settled by their receipt alone.
    if (ambiguousLegacy(command) || (saved && (ambiguousLegacy(saved) || saved.refused)) || (retry && !saved)) return settleByReceipt(io, saved ?? command);
    await io.write(command); // before the request: a reply lost after this point is still recoverable
    try {
      const entry = await io.send(command);
      await clear(io);
      return { state: 'recorded', command, entry };
    } catch (error) {
      if (!refusedForGood(error)) return { state: 'unconfirmed', command, error };
      // The server said this id holds another request: that is the answer, whatever a receipt shows (Sol R10-L1).
      if (status(error) === 409 && (error as Error).message !== conflict) { // another 409: only its receipt can tell
        try {
          const { entry } = await io.receipt(command);
          const match = entry ? receiptMatches(entry, command) : false;
          if (entry && match === undefined) return { state: 'unconfirmed', command, error };
          if (entry && !match) { await clear(io); return { state: 'refused', command, error: conflict }; }
          if (entry) { await clear(io); return { state: 'recorded', command, entry }; }
        } catch { return { state: 'unconfirmed', command, error }; }
      }
      // A refusal whose slot could not be cleared is marked refused, so a restart or a Retry settles it by receipt only and
      // never sends it again (Sol R12-M2). If even that write fails, storage is broken: it stays unconfirmed.
      if (!(await io.write(null).then(() => true, () => false))) {
        if (await io.write({ ...command, refused: true }).then(() => true, () => false)) return { state: 'refused', command, error };
        return { state: 'unconfirmed', command, error };
      }
      return { state: 'refused', command, error };
    }
  });
}

/** After a restart: the admin's own command receipt settles a saved command; no receipt keeps it unconfirmed.
 *  An unreadable record cannot be resent, so it is dropped; a storage read failure is thrown and keeps it. */
export function recoverCashCommand(io: CashIO, actorId: number, alive: () => boolean = () => true): Promise<CashOutcome> {
  return locked(io, async () => {
    let command: CashCommand | null;
    try { command = readCashCommand(await io.read(), actorId); }
    catch (error) {
      if ((error as Error).message !== 'invalid_pending_command') throw error;
      await clear(io);
      return { state: 'empty' };
    }
    if (!command) return { state: 'empty' };
    if (ambiguousLegacy(command) || command.refused) return settleByReceipt(io, command, alive);
    try {
      // A recovery started for another admin stops before its lookup and before touching the slot (Sol R12-L2).
      if (!alive()) return { state: 'empty' };
      const { entry } = await io.receipt(command);
      if (!alive()) return { state: 'empty' };
      if (!entry) return { state: 'unconfirmed', command }; // a point-in-time read, never proof the first send cannot land
      const match = receiptMatches(entry, command);
      if (match === undefined) return { state: 'unconfirmed', command };
      await clear(io);
      return match ? { state: 'recorded', command, entry } : { state: 'refused', command, error: conflict };
    } catch (error) { return { state: 'unconfirmed', command, error }; }
  });
}

/** The open form after an outcome. Only the form that was sent changes; a form opened meanwhile for another driver keeps
 *  its input. Recorded closes it, unconfirmed locks it, refused unlocks it (nothing was recorded under this id). */
export function formAfter<F extends { requestId: string; uncertain?: boolean; origin?: unknown }>(form: F | null, outcome: CashOutcome): F | null {
  if (!form || outcome.state === 'empty' || form.requestId !== outcome.command.requestId) return form;
  // An installed build's unknowable entry closes too: the cashier enters a payout or a charge afresh, never this form again.
  // So does a refused restored form: it sends only its saved record, so an edit would not be what is sent (Sol R10-H1).
  if (outcome.state === 'recorded' || (outcome.state === 'refused' && (outcome.error === ambiguous || form.origin))) return null;
  return { ...form, uncertain: outcome.state === 'unconfirmed' };
}
