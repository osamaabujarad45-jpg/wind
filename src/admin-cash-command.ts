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
// `stop`: the verdict stands, but this device could not clear the record: the screen stops taking cash entries.
export type CashOutcome = { state: 'empty' } | { state: 'recorded'; command: CashCommand; entry: CashEntry; stop?: true }
  // `kept`: refused, but the slot still holds the record (marked refused, or storage would not change it at all).
  | { state: 'refused'; command: CashCommand; error: unknown; kept?: true; stop?: true } | { state: 'unconfirmed'; command: CashCommand; error?: unknown };

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
 *  same id under another meaning is a conflict, never a success (Sol R10-L1, Haiku r8 N2). `undefined`: a receipt missing
 *  its amount, kind or note (an older or degraded server) settles nothing, and the record stays (Sol R11-L1, R13-L2). The captain is not in the receipt:
 *  request ids are random per form and the server's replay compares the captain, so a same-id receipt for another
 *  captain cannot arise from this client. */
export function receiptMatches(entry: CashEntry, command: CashCommand): boolean | undefined {
  if (entry.amountCents === undefined || entry.kind === undefined || entry.note === undefined) return undefined;
  const kind = command.kind === 'payout' ? 'adjustment' : command.kind;
  return entry.kind === kind && entry.amountCents === command.amountCents && (entry.note ?? '') === command.note
    && (entry.source === 'payout') === (command.kind === 'payout');
}
const conflict = 'idempotency_conflict';
const settledElsewhere = 'cash_command_settled';
const storageFailed = 'cash_storage_failed';
/** Settle a command by its receipt alone, never by sending it: an installed build's adjustment (intent unknowable), a
 *  record marked refused, and any uncertain form's Retry whose slot no longer holds it (another tab or window settled it,
 *  so resending could book it twice; Haiku r9 M1). A complete matching receipt records it, a complete mismatch is a
 *  conflict, an incomplete receipt settles nothing, and no receipt is a refusal for good (check the balance). A storage
 *  failure while clearing never replaces that verdict: it adds `stop` (Haiku r15 F1). */
async function settleByReceipt(io: CashIO, command: CashCommand, alive: () => boolean = () => true): Promise<CashOutcome> {
  const legacy = ambiguousLegacy(command);
  try {
    if (!alive()) return { state: 'empty' };
    const { entry } = await io.receipt(command);
    if (!alive()) return { state: 'empty' }; // another admin signed in meanwhile: that receipt answered for them, not for this slot
    // An installed build's adjustment is a payout or a charge: either meaning settles it, but amount, kind and note must
    // match. A receipt missing any of them settles nothing and leaves the record as it is (Sol R12-L1, R13-L2).
    const match = !entry ? false : legacy
      ? (entry.amountCents === undefined || entry.kind === undefined || entry.note === undefined ? undefined
        : entry.kind === 'adjustment' && entry.amountCents === command.amountCents && (entry.note ?? '') === command.note)
      : receiptMatches(entry, command);
    if (entry && match === undefined) return { state: 'unconfirmed', command };
    const cleared = await clearIfHeld(io, command, alive);
    if (cleared === 'superseded') return { state: 'empty' }; // superseded during the read: the slot is left alone (Haiku r11 L-2)
    const stop = cleared === 'failed' ? { stop: true as const, kept: true as const } : {};
    if (entry) return match ? { state: 'recorded', command, entry, ...(stop.stop && { stop: true }) } : { state: 'refused', command, error: conflict, ...stop };
    // No receipt: refused for good; if the record could not be cleared, the storage failure is the answer (Sol R15-L1).
    return { state: 'refused', command, error: stop.stop ? storageFailed : legacy ? ambiguous : settledElsewhere, ...stop };
  } catch (error) { return { state: 'unconfirmed', command, error }; }
}
/** Clear the slot only while it still holds this command (another tab, screen or late reply may have put a newer one
 *  there; Sol R17-M2). 'failed': it could not be read or cleared, so the record may still be there. */
async function clearIfHeld(io: CashIO, command: CashCommand, alive: () => boolean = () => true): Promise<'cleared' | 'absent' | 'failed' | 'superseded'> {
  let now: CashCommand | null;
  try { now = readCashCommand(await io.read(), command.actorId); }
  catch (error) { if ((error as Error).message !== 'invalid_pending_command') return 'failed'; now = null; }
  if (!alive()) return 'superseded';
  if (now?.requestId !== command.requestId) return 'absent';
  return await io.write(null).then(() => 'cleared' as const, () => 'failed' as const);
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
/** A refusal the server gave even though the reply arrived after the session changed: the request is settled for good,
 *  and this admin's own slot must say so (Sol R16-M1). A 409 still needs a receipt, which needs that admin's session. */
const servedRefusal = (error: unknown) => {
  const served = (error as { message?: string; servedStatus?: number } | null);
  return served?.message === 'session_changed' && (served.servedStatus === 400 || served.servedStatus === 404);
};
/** The end of a command refused for good: its slot is cleared; if that fails it is marked refused (a restart or Retry
 *  then settles it by receipt only); if that fails too, this device cannot keep the refusal and the screen stops taking
 *  cash entries (`cash_storage_failed`). The record stays in the slot in the last two cases (`kept`). */
async function finalRefusal(io: CashIO, command: CashCommand, error: unknown): Promise<CashOutcome> {
  const cleared = await clearIfHeld(io, command);
  // 'absent': the slot holds another command now (a late reply; Sol R17-M2) or nothing: it is left exactly as it is.
  if (cleared === 'cleared' || cleared === 'absent') return { state: 'refused', command, error };
  if (await io.write({ ...command, refused: true }).then(() => true, () => false)) return { state: 'refused', command, error, kept: true };
  return { state: 'refused', command, error: storageFailed, kept: true, stop: true };
}

/** Save, then send. A recorded reply clears the saved command (if that clear fails, the record stays and recovery settles
 *  it by its receipt). A refusal for good settles it through `finalRefusal` (cleared, else marked refused, else a storage
 *  stop). Anything else keeps it unconfirmed. A different command still unconfirmed is never overwritten: it must be
 *  settled first. `retry`: the command comes from an uncertain form (restored, or a lost reply in this tab), so it is
 *  resent only while its slot still holds it. `alive`: false once another admin's session replaced the one this send
 *  started under; then nothing is sent and no receipt is looked up, but a definitive refusal still settles this admin's
 *  own slot (device state). */
export function sendCashCommand(io: CashIO, command: CashCommand, retry = false, alive: () => boolean = () => true): Promise<CashOutcome> {
  return locked(io, async () => {
    const saved = readCashCommand(await io.read(), command.actorId);
    // A send started for one signed-in admin never goes out under another's session (Haiku r11 N-M1).
    if (!alive()) return { state: 'empty' };
    if (saved && saved.requestId !== command.requestId) throw new Error('cash_command_pending');
    // An installed build's positive adjustment is never sent under either meaning (Sol R9-H1), and a retry whose slot
    // was cleared elsewhere is never sent again (Haiku r9 M1): both are settled by their receipt alone.
    if (ambiguousLegacy(command) || (saved && (ambiguousLegacy(saved) || saved.refused)) || (retry && !saved)) return settleByReceipt(io, saved ?? command, alive);
    await io.write(command); // before the request: a reply lost after this point is still recoverable
    if (!alive()) return { state: 'empty' };
    try {
      const entry = await io.send(command);
      await clear(io);
      return { state: 'recorded', command, entry };
    } catch (error) {
      if (servedRefusal(error)) return finalRefusal(io, command, error);
      if (!refusedForGood(error)) return { state: 'unconfirmed', command, error };
      // The server said this id holds another request: that is the answer, whatever a receipt shows (Sol R10-L1).
      if (status(error) === 409 && (error as Error).message !== conflict) { // another 409: only its receipt can tell
        try {
          if (!alive()) return { state: 'empty' }; // the lookup would ask as the replacement admin (Sol R14-M2)
          const { entry } = await io.receipt(command);
          if (!alive()) return { state: 'empty' };
          const match = entry ? receiptMatches(entry, command) : false;
          if (entry && match === undefined) return { state: 'unconfirmed', command, error };
          if (entry && !match) return finalRefusal(io, command, conflict); // its id is spent: the form closes either way (Sol R16-L2)
          if (entry) { await clear(io); return { state: 'recorded', command, entry }; }
        } catch { return { state: 'unconfirmed', command, error }; }
      }
      // The refusal is final whoever is signed in now: this admin's own slot is settled either way, so it never comes back as
      // resendable (Sol R12-M2, R13-M2, R14-M1, Haiku r13 N1). Only receipt lookups need this admin's session.
      return finalRefusal(io, command, error);
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
      if (alive()) await clear(io);
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
 *  its input. Recorded closes it and unconfirmed locks it. A refusal closes it when the form was uncertain or restored,
 *  when its record stays in the slot (`kept`), or when it was an installed build's ambiguous entry; only a clean refusal
 *  of a first send unlocks it for editing (nothing was recorded under this id). */
export function formAfter<F extends { requestId: string; uncertain?: boolean; origin?: unknown }>(form: F | null, outcome: CashOutcome): F | null {
  if (!form || outcome.state === 'empty' || form.requestId !== outcome.command.requestId) return form;
  // An installed build's unknowable entry closes too: the cashier enters a payout or a charge afresh, never this form again.
  // So does any refused form that was uncertain (restored, or a lost reply in this tab), and any refusal whose record stays
  // in the slot (`kept`): its request id is spent, and a deliberate new entry starts from the balance row with a new one
  // (Sol R10-H1, R13-M1, R14-L1, Haiku r11 N-M2, r12 F1/F2). Only a clean first-send refusal stays open for editing.
  // A known conflict closes too: its request id belongs to another request (Sol R17-L1).
  if (outcome.state === 'recorded' || (outcome.state === 'refused' && (outcome.error === ambiguous || outcome.error === conflict
    || outcome.kept || form.origin || form.uncertain))) return null;
  return { ...form, uncertain: outcome.state === 'unconfirmed' };
}
