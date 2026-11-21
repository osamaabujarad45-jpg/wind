import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { api, apiSessionRevision, useApi } from '../../api';
import { ambiguousLegacy, cashCommandBody, cashCommandKey, formAfter, legacyCashCommandKey, parseCashSlot, readCashCommand, newCashCommand, recoverCashCommand, sendCashCommand, type CashCommand, type CashEntry, type CashIO, type CashKind, type CashOutcome } from '../../admin-cash-command';
import { newRequestId } from '../../booking';
import { isolate, ltr, minorFromText } from '../../model';
import { useFormat } from '../../parts';
import { useSession } from '../../session';
import { storage } from '../../storage';
import { Appear, Badge, Button, Card, confirm, Empty, ErrorText, Field, fill, haptic, Header, Loading, Row, Screen, tones, Txt, useCopy } from '../../ui';

type Balance = { driverId: number; name: string; phone: string; owedCents: number; pendingCents: number; lastRemittanceAt: number | null };
// A-01: the form is saved in the admin's own secure slot before it is sent (it outlives a forced sign-out, like a pending
// booking) and settled after a restart by this admin's command receipt or a same-id resend.
const cashIO = (actorId: number, legacy = false): CashIO => ({
  read: async () => parseCashSlot(await storage.get((legacy ? legacyCashCommandKey : cashCommandKey)(actorId), true)),
  write: async command => { await storage.set((legacy ? legacyCashCommandKey : cashCommandKey)(actorId), command && JSON.stringify(command), true); },
  receipt: command => api<{ entry: CashEntry | null }>(`/admin/cash/commands/${command.requestId}`),
  send: command => api<CashEntry>(`/admin/cash/${command.kind === 'payout' ? 'adjustment' : command.kind}`, cashCommandBody(command)),
  exclusive: run => storage.exclusive(run, 'wind.admin.cash'),
});
// A restored form keeps the saved command itself (`origin`) and its slot (`legacy`): a retry resends exactly that record,
// never one rebuilt from the form under this build's meaning (Sol R9-H1).
type Form = { id: number; kind: CashKind; amount: string; note: string; requestId: string; uncertain?: boolean; origin?: CashCommand; legacy?: boolean };
// A notice line: plain text about the current action, or an entry a drain settled. The latter is named at render time from
// the balance list, so a drain that finishes before the list loads still names its captain once it does (Haiku r20 N20-1),
// and keeps the name and phone the list showed when it settled, for a captain who has since left the list (Haiku r21 N21-2).
// The verdict is kept, not its sentence, so a language switch re-reads it (Opus R24-L3); one line per entry (R24-L1).
type Notice = string | { driverId: number; amountCents: number; requestId: string; name?: string; phone?: string; error?: unknown; entry?: CashEntry };
type PendingEntry = { id: number; amountCents: number; createdAt: number; userName: string; userPhone: string; userStatus: string; reference?: string | null };

// Cashier view: every driver's cash balance, highest debt first. Handovers wait for the driver's confirmation;
// one a driver cannot confirm (blocked, gone, dispute deadlock) is resolved here with a recorded reason (T25).
export default function AdminCash() {
  const { c, money, err, rtl } = useCopy();
  const { date } = useFormat();
  const { me } = useSession();
  const actorId = me?.user.id;
  const { data, error, reload } = useApi<Balance[]>('/admin/cash', 15_000);
  const { data: pending, reload: reloadPending } = useApi<PendingEntry[]>('/admin/cash/pending', 15_000);
  // `uncertain`: the last send failed, so the server may already hold it (A-01: a lost acknowledgement). The same request id
  // replays that entry instead of booking it twice; an edit makes it a new entry with a new id.
  const [open, setOpen] = useState<Form | null>(null);
  const [recovering, setRecovering] = useState(true); // no new entry until a saved one has been looked up
  const [resolving, setResolving] = useState<{ id: number; decision: 'confirm' | 'dispute'; reason: string; evidenceRef: string; entry: PendingEntry } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Notice[]>([]);
  const [failure, setFailure] = useState<Notice[]>([]);
  const list = useRef<ScrollView>(null);
  // One action (a send and its drain, or a recovery) can settle several entries: each notice is its own line, added and never
  // replaced or merged, so no captain's receipt or instruction is lost to the next one (Sol R21-M1, R21-M2, Haiku r19 N19-2,
  // r20 N20-3). The reset rules (Sol R22-L1, Haiku r21 N21-1, N21-3): a new action (submit, resolve, a Mark press, opening a
  // form) clears the lines about the previous action and keeps every captain's drained line, so a "check this balance"
  // instruction stays until the screen closes. Pull-to-refresh clears only the unkeyed lines (the closed-form note): a keyed
  // receipt or instruction stays, as the refreshed lists may not show it (Sol R26-L3).
  const drained = (shown: Notice[]) => shown.filter(notice => typeof notice !== 'string');
  // An entry settled again (a marked record met by the next entry) replaces its own earlier line, never doubles it (Opus R24-L1).
  const add = (notice: Notice) => (shown: Notice[]) => [...shown.filter(line => typeof line === 'string' || typeof notice === 'string' || line.requestId !== notice.requestId), notice];
  // One line per entry across both channels: a verdict replaces that entry's earlier line in the other channel too, so a
  // Retry that records after a failed attempt shows the receipt alone, and a refresh cannot bring the failure back (Sol R25-M1).
  const drop = (notice: Notice) => (shown: Notice[]) => typeof notice === 'string' ? shown : shown.filter(line => typeof line === 'string' || line.requestId !== notice.requestId);
  const fail = (notice: Notice) => { setMessage(drop(notice)); setFailure(add(notice)); list.current?.scrollTo({ y: 0 }); };
  const note = (notice: Notice) => { setFailure(drop(notice)); setMessage(add(notice)); };
  // The screen's direction leads and the name is isolated, as on the handover rows (A53 walk; Haiku r20 N20-2).
  const lines = (notices: Notice[]) => notices.map(notice => {
    if (typeof notice === 'string') return notice;
    // The phone tells two captains with one name apart; a captain not on the list (not loaded yet, or gone) is named by
    // account number, so every line names whose balance to check (Sol R22-M1, R22-M2).
    const row = data?.find(candidate => candidate.driverId === notice.driverId) ?? (notice.name && notice.phone ? notice as { name: string; phone: string } : undefined);
    const who = row ? `${isolate(row.name)} · ${ltr(row.phone)}` : `#${notice.driverId}`;
    return `${rtl ? '\u200f' : '\u200e'}${who} · ${money(notice.amountCents / 100)}: ${notice.entry ? receiptText(notice.entry) : cashErr(notice.error)}`;
  }).join('\n');
  // Shekels in the form, exact integer agorot on the wire (no float rounding: a third decimal is refused, not rounded).
  const cents = minorFromText;
  const inFlight = useRef(false); // a confirm built in an earlier render sees a stale `busy`: this one is current
  // Why the amount cannot be recorded, or null. The server stays authoritative; this only spares a confirm that would fail.
  const amountProblem = (kind: CashKind, text: string, { owedCents, pendingCents }: Balance) => {
    const value = cents(text);
    if (Number.isNaN(value)) return c.cash_amount_format;
    if (value === 0) return c.cash_amount_needed;
    if (kind === 'remittance' && (value < 0 || value > owedCents - pendingCents)) return c.err_invalid_amount;
    if (kind === 'payout' && pendingCents > 0) return c.err_remittance_pending;
    if (kind === 'payout' && (value < 0 || value > -owedCents)) return c.err_invalid_amount;
    if (kind === 'adjustment' && value < 0) return c.err_approval_required; // forgiving debt needs a second finance approver
    return null;
  };

  // A handover is read with its status when checked, whoever decided it (driver or office), and nothing promises where it will be
  // listed: a disputed one asks for a check with the driver and the office (Sol R25-M2, R26-L1).
  const receiptText = (entry: CashEntry) => !entry.reference ? c.cashAdjustRecorded
    : fill(entry.reference.startsWith('P-') ? c.cashPayoutRecorded : entry.status === 'confirmed' ? c.cashRecordedConfirmed
      : entry.status === 'disputed' ? c.cashRecordedDisputed : c.cashRecorded, { r: ltr(entry.reference) }); // R-/P- read left to right in Arabic (Haiku r23 F4)
  // A 403 means this account lacks finance duty. A Retry keeps its saved receipt number (the first send may still land), so the
  // cashier learns the one safe way out instead of a bare refusal (Sol R27-M1).
  // kept: the entry is still saved (an uncertain Retry). A refused first send, or a Mark decision, saved nothing (Haiku r25 M1).
  const cashErr = (e: unknown, kept = true) => (e as { status?: number } | null)?.status === 403 ? (kept ? c.cashFinanceRequired : c.cashFinanceRefused) : err(e);
  const recorded = (entry: CashEntry) => note(receiptText(entry));
  // An entry settled by a drain names its captain and amount: it may not be the one the cashier just asked about (Sol R21-M1).
  const rows = useRef(data);
  useEffect(() => { rows.current = data; }, [data]);
  const about = (command: CashCommand, verdict: { entry: CashEntry } | { error: unknown }): Notice => {
    const row = rows.current?.find(candidate => candidate.driverId === command.driverId);
    return { driverId: command.driverId, amountCents: command.amountCents, requestId: command.requestId, ...verdict, ...(row && { name: row.name, phone: row.phone }) };
  };
  // After a restart the saved form comes back locked until this admin's command receipt or a same-id resend settles it.
  // The installed build's slot first (its pending command is settled by its own receipt), then this build's. One locked
  // form at a time; whenever a restored form settles (or a send meets another pending command) the slots are drained
  // again, so a second saved command is never left without a form (Sol R10-M1).
  // Each recovery run belongs to one signed-in admin: a run started for another one never touches this screen (Haiku r9 L1).
  const generation = useRef(0);
  // This device could not keep a refused entry's state: no more cash entries on this screen (Sol R14-M1; deploy.md).
  const storageBroken = useRef(false);
  // A browser without Web Locks cannot keep two tabs from settling one saved entry each (Sol R19-M1): no cash entry there.
  const lockless = Platform.OS === 'web' && !(globalThis.navigator as unknown as { locks?: unknown } | undefined)?.locks;
  const [storageFailedState, setStorageFailed] = useState(false);
  const storageFailed = storageFailedState || lockless;
  const stopEntries = () => { storageBroken.current = true; setStorageFailed(true); };
  // A run is alive while its effect generation and the API session it started under are current: a sign-in switches the
  // token before React re-renders, so the generation alone is not enough (Sol R13-L1, Haiku r11 N-M1). Liveness gates
  // receipt lookups and screen messages; this admin's own slot is device state and is settled whatever the session.
  // Returns true when it restored a saved form (`recovering` is already true: the initial state, or set by the caller).
  async function recover(id: number, run = generation.current, session = apiSessionRevision(), quiet?: string): Promise<boolean> {
    const live = { get current() { return generation.current === run && apiSessionRevision() === session; } };
    try {
      for (const legacy of [true, false]) {
        if (!live.current) return false; // superseded: stop before the next lookup
        const outcome = await recoverCashCommand(cashIO(id, legacy), id, () => live.current);
        // A device storage failure stops entries on this screen whatever the session, next to any verdict; its warning is a
        // banner of its own, so no message replaces it (Sol R16-L1, R18-M2/M3, R19-M3).
        if (generation.current === run && outcome.stop) stopEntries();
        if (!live.current || outcome.state === 'empty') continue;
        // A recorded receipt sits next to any instruction an earlier slot left (check the balance, a conflict): it never clears it (Sol R20-M2).
        if (outcome.state === 'recorded') { note(about(outcome.command, { entry: outcome.entry })); reload(); reloadPending(); continue; }
        // The marker of a refusal just shown keeps that refusal's own reason on screen (Sol R17-L3).
        if (outcome.state === 'refused' && outcome.command.requestId === quiet) continue;
        if (outcome.state === 'refused') { fail(about(outcome.command, { error: outcome.error })); continue; } // its own reason, next to any storage banner
        const { command } = outcome;
        // An uncertain form already open for another entry is never replaced: its own Retry settles it first (Haiku r18 N-A).
        setOpen(o => o?.uncertain && o.requestId !== command.requestId ? o
          : { id: command.driverId, kind: command.kind, amount: String(command.amountCents / 100), note: command.note, requestId: command.requestId, uncertain: true, origin: command, legacy });
        return true;
      }
    } catch (e) { if (live.current) fail(err(e)); } // the saved command stays on the device for the next attempt
    // A run cancelled by a new session stops blocking this screen (Sol R14-M3) and is never restarted on its own: a
    // restart could ask as a replacement admin (Sol R15-M1). A record it left in the slot surfaces on the next entry,
    // through cash_command_pending and a drain under that entry's own session.
    finally { if (generation.current === run) setRecovering(false); }
    return false;
  }
  useEffect(() => {
    const run = ++generation.current;
    const session = apiSessionRevision();
    if (actorId) void Promise.resolve().then(() => recover(actorId, run, session)); // from a callback, as the lookup itself is: no state set in the effect body
    return () => { generation.current++; }; // eslint-disable-line react-hooks/exhaustive-deps -- the bump is the point: it ends the run above
  }, [actorId]); // eslint-disable-line react-hooks/exhaustive-deps -- once per signed-in admin, not per copy/reload identity

  async function submit() {
    if (!open || !actorId || inFlight.current || storageBroken.current) return; // a pending confirmation honours the stop too
    inFlight.current = true;
    setBusy(true); setFailure(drained); setMessage(drained);
    const run = generation.current, session = apiSessionRevision();
    const alive = () => generation.current === run && apiSessionRevision() === session;
    try {
      // A fresh entry first looks at the installed build's slot: a record left there by an interrupted drain is settled
      // before anything new is saved or posted (Sol R16-M2). This build's own slot is checked inside the send.
      // Absent, saved (or unreadable bytes, which recovery clears), or a storage read failure, which stops entries (Sol R17-M1).
      const legacyState = await cashIO(actorId, true).read().then(raw => { try { return readCashCommand(raw, actorId) ? 'held' : 'absent'; } catch { return 'held'; } },
        e => e instanceof Error && e.message === 'invalid_pending_command' ? 'held' : 'failed');
      if (!open.uncertain && !open.legacy && legacyState === 'failed') { if (alive()) stopEntries(); return; } // the storage banner says it
      if (!open.uncertain && !open.legacy && legacyState === 'held') {
        if (!alive()) return;
        // The typed form closes: it may repeat the entry being settled, and it never posts after that settlement. Recovery
        // then shows its own outcome (recorded, refused with its instruction, or the restored form) (Sol R18-M4, R19-M4).
        setOpen(null); note(c.cashSettledFirst);
        setRecovering(true);
        await recover(actorId, run, session);
        return;
      }
      const outcome: CashOutcome = await sendCashCommand(cashIO(actorId, !!open.legacy), open.origin ?? newCashCommand(actorId, open.id, open.kind, cents(open.amount), open.note.trim(), open.requestId), !!open.uncertain, alive);
      // This device's own facts apply to this screen whatever the session (Sol R15-M2): a storage failure stops entries and
      // shows its warning, and a closed form stays closed. Everything else waits for a live session.
      if (generation.current === run) {
        if (outcome.stop) stopEntries(); // the banner says it; the verdict below keeps its own message (Haiku r17 N3)
        setOpen(o => formAfter(o, outcome));
      }
      if (!alive()) return; // another admin signed in meanwhile: nothing else of this send belongs on their screen
      // An uncertain entry's check (restored, or in place after a lost reply) can end with its form closed: its line names the
      // captain and stays like a drained one (Opus R24-L5, Sol R25-L1). A fresh form's verdict is about the form in hand.
      const named = !!(open.origin || open.uncertain);
      if (outcome.state === 'recorded') { haptic.success(); if (named) note(about(outcome.command, { entry: outcome.entry })); else recorded(outcome.entry); }
      else if (outcome.state !== 'empty') fail(named ? about(outcome.command, { error: outcome.error }) : cashErr(outcome.error, false));
      reload(); reloadPending();
      // An uncertain form's settlement (restored or in place), or a refusal whose record stays in the slot, drains the slots
      // before the next entry: the other slot may hold a command another tab saved meanwhile, and a marked refusal is settled
      // now, not on the next form (Sol R15-L1, R21-M1, Haiku r19 N19-1).
      const kept = outcome.state === 'refused' && outcome.kept;
      if ((open.uncertain || kept) && outcome.state !== 'unconfirmed' && !storageBroken.current) { setRecovering(true); await recover(actorId, run, session, open.requestId); }
    } catch (e) {
      if (!alive()) return; // a failure of another session's work is not shown on this one (Sol R14-M2)
      // A saved entry holds this build's slot: the typed draft closes before it is shown, as with the installed build's slot,
      // so it can never post after that entry settles; recovery then says what comes next (Sol R19-M5, R20-L1). An uncertain
      // form is never dismissed: its own Retry settles it by receipt (Haiku r18 N-A).
      if (e instanceof Error && e.message === 'cash_command_pending') {
        if (!open.uncertain) { setOpen(null); note(c.cashSettledFirst); }
        setRecovering(true); await recover(actorId, run, session);
      } else fail(err(e)); // not saved, so nothing was sent
    } finally { inFlight.current = false; setBusy(false); }
  }

  // T25: the resolution is deliberate (a confirmation dialog), names a reason and an optional evidence
  // reference, and the server's CAS makes a double tap or a racing driver decision refuse, never repeat.
  async function resolveEntry() {
    if (!resolving || busy) return;
    setBusy(true); setFailure(drained); setMessage(drained);
    try {
      await api(`/admin/cash/${resolving.id}/resolve`, { decision: resolving.decision, reason: resolving.reason.trim(), evidenceRef: resolving.evidenceRef.trim() || undefined });
      haptic.success();
      note(c.cashResolved); // added: a receipt the mount recovery just showed stays (Haiku r20 N20-4)
      setResolving(null); reload(); reloadPending();
    } catch (e) { fail(cashErr(e, false)); } finally { setBusy(false); }
  }

  // A new entry would replace the one form and the one saved command: wait for the lookup, the send, or the unconfirmed entry.
  const blocked = busy || recovering || !!open?.uncertain || storageFailed;
  const blockedReason = storageFailed ? (lockless ? c.err_cash_browser_unsupported : c.err_cash_storage_failed) : open?.uncertain ? c.cashSettleFirst : c.wait_busy;

  // The Mark card keeps the handover it was opened for (name, phone, amount, reference), kept from the press and formatted in the current language: the waiting list is
  // bounded and polled, so a still-pending entry can drop out of it. The server's compare-and-set decides, and the confirmation
  // names the decision and whose handover it is (Haiku r23 F6, Sol R26-L2).
  const markWho = (entry: PendingEntry) => `${rtl ? '\u200f' : '\u200e'}${isolate(entry.userName)} · ${ltr(entry.userPhone)} · ${money(entry.amountCents / 100)}${entry.reference ? ` · ${ltr(entry.reference)}` : ''}`;
  return <Screen onRefresh={() => { setMessage(drained); reloadPending(); return reload(); }} scrollRef={list}>
    <Header title={c.cashTab} />
    <Txt variant="caption" style={{ marginBottom: 12 }}>{c.cashOwedHint}</Txt>
    {storageFailed && <ErrorText>{lockless ? c.err_cash_browser_unsupported : c.err_cash_storage_failed}</ErrorText>}
    {/* the balance list's own error shows beside any kept instruction, never hidden by it (Opus R24-L2) */}
    <ErrorText>{[lines(failure), error && err(error)].filter(Boolean).join('\n')}</ErrorText>
    {message.length > 0 && <View accessibilityLiveRegion="polite"><Txt variant="caption" style={{ marginBottom: 10 }}>{lines(message)}</Txt></View>}
    {/* A saved entry for a captain no longer on the list (an account deleted meanwhile) still needs its Retry: without it
        every new entry stays blocked (Sol R11-H1). The same-id resend settles it: replay, or a refusal that closes it. */}
    {open?.uncertain && data && !data.some(row => row.driverId === open.id) && <Card style={{ marginBottom: 12 }}>
      <Txt variant="title">{fill(c.cashPendingElsewhere, { a: money(cents(open.amount) / 100) })}</Txt>
      {!!open.note && <Txt variant="caption">{open.note}</Txt>}
      <Txt variant="caption" style={{ marginTop: 8 }}>{open.origin?.refused ? c.cashRefusedCheck : open.origin && ambiguousLegacy(open.origin) ? c.cashAmbiguousCheck : c.cashUncertain}</Txt>
      <Button title={open.origin && (open.origin.refused || ambiguousLegacy(open.origin)) ? c.cashCheckRecord : c.cashRetrySame} icon="refresh" variant="soft" loading={busy} disabled={busy || storageFailed} reason={storageFailed ? (lockless ? c.err_cash_browser_unsupported : c.err_cash_storage_failed) : c.wait_busy} onPress={() => void submit()} />
    </Card>}
    {!data ? <Loading failed={!!error} onRetry={reload} /> : data.length === 0 ? <Empty icon="cash-outline" title={c.cashNoDrivers} />
      : data.map((row, i) => <Appear key={row.driverId} index={i}>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="title">{row.name}</Txt>
              <Txt variant="caption" selectable>{row.phone}</Txt>
              {row.lastRemittanceAt != null && <Txt variant="micro">{fill(c.cashLast, { d: date(row.lastRemittanceAt) })}</Txt>}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {row.owedCents < 0 && <Txt variant="micro">{c.cashWindOwes}</Txt>}
              <Txt variant="h2">{money(Math.abs(row.owedCents) / 100)}</Txt>
              {row.pendingCents > 0 && <Txt variant="micro">{`${c.entry_pending}: ${money(row.pendingCents / 100)}`}</Txt>}
            </View>
          </Row>
          {open?.id === row.driverId ? <View style={{ marginTop: 12 }}>
            <Field label={open.kind === 'remittance' ? c.cashAmount : c.cashAdjustAmount} value={open.amount} keyboardType="decimal-pad"
              onChangeText={amount => setOpen({ ...open, amount })} disabled={busy || !!open.uncertain} />
            <Field label={open.kind === 'remittance' ? c.problemNote : c.cashReason} value={open.note} maxLength={open.kind === 'remittance' ? 200 : 500}
              onChangeText={text => setOpen({ ...open, note: text })} disabled={busy || !!open.uncertain} />
            {!open.uncertain && <Button title={open.kind === 'payout' ? c.cashPayDriver : open.kind === 'remittance' ? c.cashRecord : c.cashAdjust} icon="checkmark-done-outline" loading={busy}
              disabled={busy || storageFailed || !!amountProblem(open.kind, open.amount, row) || (open.kind !== 'remittance' && open.note.trim().length < 5)}
              reason={busy ? c.wait_busy : storageFailed ? (lockless ? c.err_cash_browser_unsupported : c.err_cash_storage_failed) : amountProblem(open.kind, open.amount, row) ?? c.reason_min5}
              onPress={() => confirm(fill(open.kind === 'payout' ? c.cashReviewPayout : open.kind === 'remittance' ? c.cashReviewRecord : c.cashReviewAdjust, { a: money(cents(open.amount) / 100), n: row.name }),
                () => void submit(), open.kind === 'payout' ? c.cashPayDriver : open.kind === 'remittance' ? c.cashRecord : c.cashAdjust, c.cancel)} />}
            {open.uncertain && <>
              {/* The balance already counts this entry's own pending copy, so the same-id resend is the one way to settle it. */}
              <Txt variant="caption" style={{ marginTop: 8 }}>{open.origin?.refused ? c.cashRefusedCheck : open.origin && ambiguousLegacy(open.origin) ? c.cashAmbiguousCheck : c.cashUncertain}</Txt>
              <Button title={open.origin && (open.origin.refused || ambiguousLegacy(open.origin)) ? c.cashCheckRecord : c.cashRetrySame} icon="refresh" variant="soft" loading={busy} disabled={busy || storageFailed} reason={storageFailed ? (lockless ? c.err_cash_browser_unsupported : c.err_cash_storage_failed) : c.wait_busy} onPress={() => void submit()} />
            </>}
            {/* An unconfirmed entry is never dismissed: only its receipt or a same-id resend settles it. */}
            {!open.uncertain && <Button title={c.cancel} variant="ghost" size="sm" disabled={busy} reason={c.wait_busy} onPress={() => setOpen(null)} />}
          </View> : <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Button title={c.cashRecord} size="sm" icon="cash-outline" disabled={blocked || row.owedCents - row.pendingCents <= 0} reason={blocked ? blockedReason : c.cash_none_owed}
              onPress={() => { setMessage(drained); setFailure(drained); setOpen({ id: row.driverId, kind: 'remittance', amount: String((row.owedCents - row.pendingCents) / 100), note: '', requestId: newRequestId() }); }} />
            {row.owedCents < 0 && <Button title={c.cashPayDriver} size="sm" icon="wallet-outline" variant="soft" disabled={blocked || row.pendingCents > 0} reason={blocked ? blockedReason : c.err_remittance_pending}
              onPress={() => { setMessage(drained); setFailure(drained); setOpen({ id: row.driverId, kind: 'payout', amount: String(-row.owedCents / 100), note: c.cashPayoutNote, requestId: newRequestId() }); }} />}
            <Button title={c.cashAdjust} size="sm" variant="outline" disabled={blocked} reason={blockedReason} onPress={() => { setMessage(drained); setFailure(drained); setOpen({ id: row.driverId, kind: 'adjustment', amount: '', note: '', requestId: newRequestId() }); }} />
          </Row>}
        </Card>
      </Appear>)}
      {resolving && <Card>
        {/* Which decision, for whom and how much: a dispute and a confirmation must not look alike. */}
        <Txt variant="title">{resolving.decision === 'confirm' ? c.cashMarkConfirmed : c.cashMarkDisputed}</Txt>
        {/* captured at the Mark press; the screen's direction leads and the name is isolated (A53 walk) */}
        <Txt variant="caption" style={{ marginBottom: 8 }}>{markWho(resolving.entry)}</Txt>
        <Field label={c.cashResolutionReason} value={resolving.reason} maxLength={500} disabled={busy} onChangeText={reason => setResolving({ ...resolving, reason })} />
        <Field label={c.cashEvidence} value={resolving.evidenceRef} maxLength={200} disabled={busy} onChangeText={evidenceRef => setResolving({ ...resolving, evidenceRef })} />
        <Row gap={8} style={{ marginTop: 10 }}>
          <Button title={c.cashResolveSave} icon="checkmark-done-outline" loading={busy} disabled={busy || resolving.reason.trim().length < 5}
            reason={busy ? c.wait_busy : c.reason_min5}
            onPress={() => confirm(`${c.cashResolveConfirm}\n${resolving.decision === 'confirm' ? c.cashMarkConfirmed : c.cashMarkDisputed}\n${markWho(resolving.entry)}`, () => void resolveEntry(), c.cashResolveSave, c.cancel)} />
          <Button title={c.cancel} variant="ghost" size="sm" disabled={busy} reason={c.wait_busy} onPress={() => setResolving(null)} />
        </Row>
      </Card>}
      {!!pending?.length && <>
        <Txt variant="h2" style={{ marginTop: 16, marginBottom: 8 }}>{c.cashPendingTitle}</Txt>
        {pending.map(entry => <Appear key={entry.id} index={entry.id}>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="title">{entry.userName}</Txt>
                <Txt variant="caption" selectable>{entry.userPhone}</Txt>
                <Txt variant="micro">{date(entry.createdAt)}</Txt>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Txt variant="h2">{money(entry.amountCents / 100)}</Txt>
                {entry.userStatus !== 'active' && <Badge label={c[entry.userStatus as 'blocked' | 'pending']} tone={tones.muted} />}
              </View>
            </Row>
            {/* Actions, not statuses: the entry is still waiting until one of these is saved. */}
            <Row gap={8} style={{ marginTop: 10, flexWrap: 'wrap' }}>
              <Button title={c.cashMarkConfirmed} size="sm" variant="soft" disabled={busy || recovering} reason={c.wait_busy}
                onPress={() => { setMessage(drained); setFailure(drained); setResolving({ id: entry.id, decision: 'confirm', reason: '', evidenceRef: '', entry }); }} />
              <Button title={c.cashMarkDisputed} size="sm" variant="outline" disabled={busy || recovering} reason={c.wait_busy}
                onPress={() => { setMessage(drained); setFailure(drained); setResolving({ id: entry.id, decision: 'dispute', reason: '', evidenceRef: '', entry }); }} />
            </Row>
          </Card>
        </Appear>)}
      </>}
  </Screen>;
}
