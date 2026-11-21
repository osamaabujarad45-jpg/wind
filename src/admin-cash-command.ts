import { newRequestId } from './command-id.ts';

// A-01: an admin's remittance or adjustment is saved before it is sent, so a lost reply survives an app restart and a
// forced sign-out, and is settled by the admin's own command receipt or by resending the same request id; never by guessing.
export type CashKind = 'remittance' | 'adjustment' | 'payout';
// schemaVersion 2 (this build): a positive 'adjustment' is a charge and a payout is its own kind. Version 1 is the installed
// build's record, whose Pay driver also saved a positive 'adjustment': its intent is unknowable (Sol R8-H1).
// `refused`: the server refused it for good but the slot could not be cleared; it is then settled by receipt only (Sol R12-M2).
export type CashCommand = { type: 'admin_cash'; schemaVersion: 1 | 2; refused?: true; actorId: number; requestId: string; driverId: number;
  kind: CashKind; amountCents: number; note: string };
// `status` is the server's as of the reply: a recovered handover may already be confirmed or disputed (Sol R25-M2).
export type CashEntry = { id: number; kind?: CashKind; reference?: string | null; amountCents?: number; note?: string; source?: string;
  status?: string };
export type CashIO = { read: () => Promise<unknown>; write: (command: CashCommand | null) => Promise<void>;
  receipt: (command: CashCommand) => Promise<{ entry: CashEntry | null }>; send: (command: CashCommand) => Promise<CashEntry>;
  /** One command at a time across tabs: without it a second tab overwrites a saved unconfirmed command. */
  exclusive?: <T>(run: () => Promise<T>) => Promise<T> };
// `stop`: the verdict stands, but this device could not clear the record: the screen stops taking cash entries.
export type CashOutcome = { state: 'empty'; stop?: true } | { state: 'recorded'; command: CashCommand; entry: CashEntry; stop?: true }
  // `kept`: refused, but the slot still holds the record (marked refused, or storage would not change it at all).
  | { state: 'refused'; command: CashCommand; error: unknown; kept?: true; stop?: true } | { state: 'unconfirmed'; command: CashCommand; error?: unknown; stop?: true };

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const id = (n: unknown) => Number.isSafeInteger(n) && (n as number) > 0;
const status = (error: unknown) => (error as { status?: number } | null)?.status ?? 0;
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
/** The installed build's adjustment is a payout or a charge: either meaning settles it, but amount, kind and note must
 *  match, and a receipt missing any of them settles nothing (Sol R12-L1, R13-L2). */
const legacyMatch = (entry: CashEntry, command: CashCommand) =>
  entry.amountCents === undefined || entry.kind === undefined || entry.note === undefined ? undefined
    : entry.kind === 'adjustment' && entry.amountCents === command.amountCents && (entry.note ?? '') === command.note;

// ---- The three rules (Sol R17/R18). Every path below goes through these two routines. ----
// 1. A slot is written only while it holds the command in hand (`clearIfHeld`); a refusal is marked only when that was
//    verified. 2. A receipt verdict is never replaced by storage trouble: `stop` rides along and the screen stops taking
//    cash entries. 3. A slot read has three outcomes: absent, held (or unreadable bytes, which are cleared), or a storage
//    failure (`stop`).

/** Clear the slot only while it still holds this command: another tab, screen or late reply may have saved a newer one
 *  (Sol R17-M2, R18-M1). 'unreadable': storage would not read it, so ownership is unknown and nothing is written;
 *  'failed': it is this command and the delete failed. This admin's own slot is device state: no session is needed. */
async function clearIfHeld(io: CashIO, command: CashCommand): Promise<'cleared' | 'absent' | 'unreadable' | 'failed'> {
  let now: CashCommand | null;
  try { now = readCashCommand(await io.read(), command.actorId); }
  catch (error) {
    if ((error as Error | undefined)?.message !== 'invalid_pending_command') return 'unreadable';
    // Unreadable bytes carry no request id anyone could own: dropped here as everywhere (rule 3; Haiku r17 N5). If they
    // cannot be dropped, ownership stays unknown: 'unreadable', so nothing is marked over them (Sol R20-M1).
    return io.write(null).then(() => 'absent' as const, () => 'unreadable' as const);
  }
  if (now?.requestId !== command.requestId) return 'absent';
  return io.write(null).then(() => 'cleared' as const, () => 'failed' as const);
}
/** The end of a command refused for good. Cleared (or no longer held): done. Held but not deletable: marked refused, so a
 *  restart or Retry settles it by receipt only; a record already marked that still cannot be deleted, or a mark that fails,
 *  stops entries instead of meeting the same record on every new one (Sol R15-L1). Ownership unknown: nothing is
 *  written and entries stop (Sol R18-M1). In every stopped case the refusal itself stays the verdict (Sol R18-M2). */
async function finalRefusal(io: CashIO, command: CashCommand, error: unknown, settling = false): Promise<CashOutcome> {
  const cleared = await clearIfHeld(io, command);
  if (cleared === 'cleared' || cleared === 'absent') return { state: 'refused', command, error };
  // A refusal of a fresh send whose delete failed is marked and drained next; a settlement (a receipt already decided it)
  // whose delete failed stops entries even when the mark works (Sol R19-M2).
  if (cleared === 'failed' && !command.refused && await io.write({ ...command, refused: true }).then(() => true, () => false))
    return settling ? { state: 'refused', command, error, kept: true, stop: true } : { state: 'refused', command, error, kept: true };
  return { state: 'refused', command, error, kept: true, stop: true };
}
/** A complete receipt decides: a match is recorded, a mismatch is a conflict that spends the id. Cleanup never changes
 *  that verdict: a failed cleanup adds `stop` (and `kept` when the record stays marked) (Sol R18-M2, R19-M2). */
async function withReceipt(io: CashIO, command: CashCommand, entry: CashEntry, match: boolean): Promise<CashOutcome> {
  if (!match) return finalRefusal(io, command, conflict, true);
  const cleared = await clearIfHeld(io, command);
  return cleared === 'failed' || cleared === 'unreadable' ? { state: 'recorded', command, entry, stop: true } : { state: 'recorded', command, entry };
}
/** Settle a command by its receipt alone, never by sending it: an installed build's adjustment (intent unknowable), a
 *  record marked refused, and any uncertain form's Retry whose slot no longer holds it (another tab or window settled it,
 *  so resending could book it twice; Haiku r9 M1). No receipt is a refusal for good (check the balance). */
async function settleByReceipt(io: CashIO, command: CashCommand, alive: () => boolean = () => true): Promise<CashOutcome> {
  const legacy = ambiguousLegacy(command);
  try {
    if (!alive()) return { state: 'empty' };
    const { entry } = await io.receipt(command);
    if (!alive()) return { state: 'empty' }; // another admin signed in meanwhile: that receipt answered for them
    if (!entry) return finalRefusal(io, command, legacy ? ambiguous : settledElsewhere);
    const match = legacy ? legacyMatch(entry, command) : receiptMatches(entry, command);
    return match === undefined ? { state: 'unconfirmed', command } : withReceipt(io, command, entry, match);
  } catch (error) { return { state: 'unconfirmed', command, error }; }
}
/** Read this admin's slot: the record, null, or a storage failure. Unreadable bytes are dropped (no request id survives
 *  them); if they cannot be dropped, that is a storage failure too (Sol R18-M3). */
async function readSlot(io: CashIO, actorId: number): Promise<CashCommand | null | 'stop'> {
  try { return readCashCommand(await io.read(), actorId); }
  catch (error) {
    if ((error as Error | undefined)?.message !== 'invalid_pending_command') return 'stop';
    return io.write(null).then(() => null, () => 'stop' as const);
  }
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

/** Save, then send. A recorded reply clears the saved command while it is still held; a refusal for good ends it through
 *  `finalRefusal`; anything else keeps it unconfirmed. A different command still unconfirmed is never overwritten: it must
 *  be settled first. `retry`: the command comes from an uncertain form (restored, or a lost reply in this tab), so it is
 *  resent only while its slot still holds it. `alive`: false once another admin's session replaced the one this send
 *  started under; then nothing is sent and no receipt is looked up, but a definitive refusal still settles this admin's
 *  own slot (device state). A slot that cannot be read or saved stops entries (`stop`); nothing is sent then. */
export function sendCashCommand(io: CashIO, command: CashCommand, retry = false, alive: () => boolean = () => true): Promise<CashOutcome> {
  return locked(io, async () => {
    const saved = await readSlot(io, command.actorId);
    if (saved === 'stop') return { state: 'empty', stop: true };
    // A send started for one signed-in admin never goes out under another's session (Haiku r11 N-M1).
    if (!alive()) return { state: 'empty' };
    // A retry whose slot no longer holds it (cleared elsewhere, or now holding another command) is never sent again: it is
    // settled by its own receipt, and the other command is left alone (Haiku r9 M1, r18 N-A).
    if (retry && saved?.requestId !== command.requestId) return settleByReceipt(io, command, alive);
    if (saved && saved.requestId !== command.requestId) throw new Error('cash_command_pending');
    // An installed build's positive adjustment is never sent under either meaning (Sol R9-H1), nor a record marked refused.
    if (ambiguousLegacy(command) || (saved && (ambiguousLegacy(saved) || saved.refused))) return settleByReceipt(io, saved ?? command, alive);
    // Saved before the request, so a reply lost after this point is still recoverable; unsaved means unsent.
    if (!(await io.write(command).then(() => true, () => false))) return { state: 'empty', stop: true };
    if (!alive()) return { state: 'empty' };
    try {
      const entry = await io.send(command);
      const cleared = await clearIfHeld(io, command);
      return cleared === 'failed' || cleared === 'unreadable' ? { state: 'recorded', command, entry, stop: true } : { state: 'recorded', command, entry };
    } catch (error) {
      if (servedRefusal(error)) return finalRefusal(io, command, error);
      // A 403 (this admin lacks finance duty, or lost it) is refused before any write; but a same-id resend after the duty was
      // removed may still have an entry from its first send. Its receipt decides, as for an unexplained 409, so the form never
      // stays locked as "may be recorded" with nothing booked (Haiku r23 F1).
      const forbidden = status(error) === 403;
      if (!refusedForGood(error) && !forbidden) return { state: 'unconfirmed', command, error };
      // The server said this id holds another request: that is the answer, whatever a receipt shows (Sol R10-L1).
      if (forbidden || (status(error) === 409 && (error as Error).message !== conflict)) { // only its receipt can tell
        try {
          if (!alive()) return { state: 'empty' }; // the lookup would ask as the replacement admin (Sol R14-M2)
          const { entry } = await io.receipt(command);
          if (!alive()) return { state: 'empty' };
          const match = entry ? receiptMatches(entry, command) : false;
          if (entry && match === undefined) return { state: 'unconfirmed', command, error };
          if (entry) return withReceipt(io, command, entry, match === true);
          // A Retry follows an attempt whose write may still be running: "no receipt" is a point-in-time read, so the key stays
          // and the form keeps saying finance duty is needed to retry; only a first send is refused outright (Sol R26-M1).
          if (forbidden && retry) return { state: 'unconfirmed', command, error };
        } catch { return { state: 'unconfirmed', command, error }; }
      }
      // The refusal is final whoever is signed in now: this admin's own slot is settled either way, so it never comes back as
      // resendable (Sol R12-M2, R13-M2, R14-M1, Haiku r13 N1). Only receipt lookups need this admin's session. The server's
      // own idempotency_conflict is reported as the conflict verdict, so its form closes like any known conflict (Haiku r18 N-B).
      return finalRefusal(io, command, status(error) === 409 && (error as Error).message === conflict ? conflict : error);
    }
  });
}

/** After a restart: the admin's own command receipt settles a saved command; no receipt keeps it unconfirmed. A record that
 *  cannot be read is dropped; a storage failure stops entries (Sol R18-M3). */
export function recoverCashCommand(io: CashIO, actorId: number, alive: () => boolean = () => true): Promise<CashOutcome> {
  return locked(io, async () => {
    const command = await readSlot(io, actorId);
    if (command === 'stop') return { state: 'empty', stop: true };
    if (!command) return { state: 'empty' };
    if (ambiguousLegacy(command) || command.refused) return settleByReceipt(io, command, alive);
    try {
      // A recovery started for another admin stops before its lookup and before touching the slot (Sol R12-L2).
      if (!alive()) return { state: 'empty' };
      const { entry } = await io.receipt(command);
      if (!alive()) return { state: 'empty' };
      if (!entry) return { state: 'unconfirmed', command }; // a point-in-time read, never proof the first send cannot land
      const match = receiptMatches(entry, command);
      return match === undefined ? { state: 'unconfirmed', command } : withReceipt(io, command, entry, match);
    } catch (error) { return { state: 'unconfirmed', command, error }; }
  });
}

/** The open form after an outcome. Only the form that was sent changes; a form opened meanwhile for another driver keeps
 *  its input. Recorded closes it and unconfirmed locks it. A refusal closes it when the form was uncertain or restored,
 *  when its record stays in the slot (`kept`), when it is a known `idempotency_conflict` (the id belongs to another
 *  request), or when it was an installed build's ambiguous entry; only another clean refusal of a first send unlocks it
 *  for editing (nothing was recorded under this id). */
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
