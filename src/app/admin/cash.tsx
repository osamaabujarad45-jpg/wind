import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { api, apiSessionRevision, useApi } from '../../api';
import { cashCommandBody, cashCommandKey, formAfter, legacyCashCommandKey, parseCashSlot, readCashCommand, newCashCommand, recoverCashCommand, sendCashCommand, type CashCommand, type CashEntry, type CashIO, type CashKind, type CashOutcome } from '../../admin-cash-command';
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
  const [resolving, setResolving] = useState<{ id: number; decision: 'confirm' | 'dispute'; reason: string; evidenceRef: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const list = useRef<ScrollView>(null);
  const fail = (message: string) => { setFailure(message); list.current?.scrollTo({ y: 0 }); };
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

  const recorded = (entry: CashEntry) => setMessage(entry.reference ? fill(entry.reference.startsWith('P-') ? c.cashPayoutRecorded : c.cashRecorded, { r: entry.reference }) : c.cashAdjustRecorded);
  // After a restart the saved form comes back locked until this admin's command receipt or a same-id resend settles it.
  // The installed build's slot first (its pending command is settled by its own receipt), then this build's. One locked
  // form at a time; whenever a restored form settles (or a send meets another pending command) the slots are drained
  // again, so a second saved command is never left without a form (Sol R10-M1).
  // Each recovery run belongs to one signed-in admin: a run started for another one never touches this screen (Haiku r9 L1).
  const generation = useRef(0);
  // This device could not keep a refused entry's state: no more cash entries on this screen (Sol R14-M1; deploy.md).
  const storageBroken = useRef(false);
  const [storageFailed, setStorageFailed] = useState(false);
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
        // A device storage failure stops entries on this screen whatever the session, next to any verdict (Sol R16-L1, R18-M2/M3).
        if (generation.current === run && outcome.stop) { stopEntries(); fail(err('cash_storage_failed')); }
        if (!live.current || outcome.state === 'empty') continue;
        if (outcome.state === 'recorded') { setFailure(''); recorded(outcome.entry); reload(); reloadPending(); continue; }
        // The marker of a refusal just shown keeps that refusal's own reason on screen (Sol R17-L3).
        if (outcome.state === 'refused' && outcome.command.requestId === quiet) continue;
        if (outcome.state === 'refused') { if (!outcome.stop) fail(err(outcome.error)); continue; } // an installed build's unknowable entry: enter it again
        const { command } = outcome;
        setOpen({ id: command.driverId, kind: command.kind, amount: String(command.amountCents / 100), note: command.note, requestId: command.requestId, uncertain: true, origin: command, legacy });
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
    setBusy(true); setFailure(''); setMessage('');
    const run = generation.current, session = apiSessionRevision();
    const alive = () => generation.current === run && apiSessionRevision() === session;
    try {
      // A fresh entry first looks at the installed build's slot: a record left there by an interrupted drain is settled
      // before anything new is saved or posted (Sol R16-M2). This build's own slot is checked inside the send.
      // Absent, saved (or unreadable bytes, which recovery clears), or a storage read failure, which stops entries (Sol R17-M1).
      const legacyState = await cashIO(actorId, true).read().then(raw => { try { return readCashCommand(raw, actorId) ? 'held' : 'absent'; } catch { return 'held'; } },
        e => e instanceof Error && e.message === 'invalid_pending_command' ? 'held' : 'failed');
      if (!open.uncertain && !open.legacy && legacyState === 'failed') { if (alive()) { stopEntries(); fail(err('cash_storage_failed')); } return; }
      if (!open.uncertain && !open.legacy && legacyState === 'held') {
        if (!alive()) return;
        // The typed form closes: it may repeat the entry being settled, and it never posts after that settlement. The
        // cashier opens a new form once the saved entry is shown (Sol R18-M4, Haiku r16 L1).
        setOpen(null); setMessage(c.cashSettledFirst);
        setRecovering(true);
        if (!(await recover(actorId, run, session)) && !storageBroken.current) setFailure(''); // nothing to act on: no pending warning (Sol R18-L1)
        return;
      }
      const outcome: CashOutcome = await sendCashCommand(cashIO(actorId, !!open.legacy), open.origin ?? newCashCommand(actorId, open.id, open.kind, cents(open.amount), open.note.trim(), open.requestId), !!open.uncertain, alive);
      // This device's own facts apply to this screen whatever the session (Sol R15-M2): a storage failure stops entries and
      // shows its warning, and a closed form stays closed. Everything else waits for a live session.
      if (generation.current === run) {
        if (outcome.stop) { stopEntries(); fail(err('cash_storage_failed')); }
        setOpen(o => formAfter(o, outcome));
      }
      if (!alive()) return; // another admin signed in meanwhile: nothing else of this send belongs on their screen
      if (outcome.state === 'recorded') { haptic.success(); recorded(outcome.entry); }
      else if (outcome.state !== 'empty' && !outcome.stop) fail(err(outcome.error));
      reload(); reloadPending();
      // A restored form's settlement, or a refusal whose record stays in the slot, drains the slots before the next entry:
      // the other slot may hold a command, and a marked refusal is settled now, not on the next form (Sol R15-L1).
      const kept = outcome.state === 'refused' && outcome.kept;
      if ((open.origin || kept) && outcome.state !== 'unconfirmed' && !storageBroken.current) { setRecovering(true); await recover(actorId, run, session, open.requestId); }
    } catch (e) {
      if (!alive()) return; // a failure of another session's work is not shown on this one (Sol R14-M2)
      fail(err(e instanceof Error && e.message === 'cash_command_pending' ? e.message : e)); // not saved, so nothing was sent
      if (e instanceof Error && e.message === 'cash_command_pending' && alive()) { setRecovering(true); await recover(actorId, run, session); } // show the command that holds the slot
    } finally { inFlight.current = false; setBusy(false); }
  }

  // T25: the resolution is deliberate (a confirmation dialog), names a reason and an optional evidence
  // reference, and the server's CAS makes a double tap or a racing driver decision refuse, never repeat.
  async function resolveEntry() {
    if (!resolving || busy) return;
    setBusy(true); setFailure(''); setMessage('');
    try {
      await api(`/admin/cash/${resolving.id}/resolve`, { decision: resolving.decision, reason: resolving.reason.trim(), evidenceRef: resolving.evidenceRef.trim() || undefined });
      haptic.success();
      setMessage(c.cashResolved);
      setResolving(null); reload(); reloadPending();
    } catch (e) { fail(err(e)); } finally { setBusy(false); }
  }

  // A new entry would replace the one form and the one saved command: wait for the lookup, the send, or the unconfirmed entry.
  const blocked = busy || recovering || !!open?.uncertain || storageFailed;
  const blockedReason = storageFailed ? c.err_cash_storage_failed : open?.uncertain ? c.err_cash_command_pending : c.wait_busy;

  return <Screen onRefresh={() => { setMessage(''); reloadPending(); return reload(); }} scrollRef={list}>
    <Header title={c.cashTab} />
    <Txt variant="caption" style={{ marginBottom: 12 }}>{c.cashOwedHint}</Txt>
    <ErrorText>{failure || (error && err(error))}</ErrorText>
    {!!message && <View accessibilityLiveRegion="polite"><Txt variant="caption" style={{ marginBottom: 10 }}>{message}</Txt></View>}
    {/* A saved entry for a captain no longer on the list (an account deleted meanwhile) still needs its Retry: without it
        every new entry stays blocked (Sol R11-H1). The same-id resend settles it: replay, or a refusal that closes it. */}
    {open?.uncertain && data && !data.some(row => row.driverId === open.id) && <Card style={{ marginBottom: 12 }}>
      <Txt variant="title">{fill(c.cashPendingElsewhere, { a: money(cents(open.amount) / 100) })}</Txt>
      {!!open.note && <Txt variant="caption">{open.note}</Txt>}
      <Txt variant="caption" style={{ marginTop: 8 }}>{open.origin?.refused ? c.cashRefusedCheck : c.cashUncertain}</Txt>
      <Button title={open.origin?.refused ? c.cashCheckRecord : c.cashRetrySame} icon="refresh" variant="soft" loading={busy} disabled={busy || storageFailed} reason={storageFailed ? c.err_cash_storage_failed : c.wait_busy} onPress={() => void submit()} />
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
              onChangeText={note => setOpen({ ...open, note })} disabled={busy || !!open.uncertain} />
            {!open.uncertain && <Button title={open.kind === 'payout' ? c.cashPayDriver : open.kind === 'remittance' ? c.cashRecord : c.cashAdjust} icon="checkmark-done-outline" loading={busy}
              disabled={busy || storageFailed || !!amountProblem(open.kind, open.amount, row) || (open.kind !== 'remittance' && open.note.trim().length < 5)}
              reason={busy ? c.wait_busy : storageFailed ? c.err_cash_storage_failed : amountProblem(open.kind, open.amount, row) ?? c.reason_min5}
              onPress={() => confirm(fill(open.kind === 'payout' ? c.cashReviewPayout : open.kind === 'remittance' ? c.cashReviewRecord : c.cashReviewAdjust, { a: money(cents(open.amount) / 100), n: row.name }),
                () => void submit(), open.kind === 'payout' ? c.cashPayDriver : open.kind === 'remittance' ? c.cashRecord : c.cashAdjust, c.cancel)} />}
            {open.uncertain && <>
              {/* The balance already counts this entry's own pending copy, so the same-id resend is the one way to settle it. */}
              <Txt variant="caption" style={{ marginTop: 8 }}>{open.origin?.refused ? c.cashRefusedCheck : c.cashUncertain}</Txt>
              <Button title={open.origin?.refused ? c.cashCheckRecord : c.cashRetrySame} icon="refresh" variant="soft" loading={busy} disabled={busy || storageFailed} reason={storageFailed ? c.err_cash_storage_failed : c.wait_busy} onPress={() => void submit()} />
            </>}
            {/* An unconfirmed entry is never dismissed: only its receipt or a same-id resend settles it. */}
            {!open.uncertain && <Button title={c.cancel} variant="ghost" size="sm" disabled={busy} reason={c.wait_busy} onPress={() => setOpen(null)} />}
          </View> : <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Button title={c.cashRecord} size="sm" icon="cash-outline" disabled={blocked || row.owedCents - row.pendingCents <= 0} reason={blocked ? blockedReason : c.cash_none_owed}
              onPress={() => { setMessage(''); setOpen({ id: row.driverId, kind: 'remittance', amount: String((row.owedCents - row.pendingCents) / 100), note: '', requestId: newRequestId() }); }} />
            {row.owedCents < 0 && <Button title={c.cashPayDriver} size="sm" icon="wallet-outline" variant="soft" disabled={blocked || row.pendingCents > 0} reason={blocked ? blockedReason : c.err_remittance_pending}
              onPress={() => { setMessage(''); setOpen({ id: row.driverId, kind: 'payout', amount: String(-row.owedCents / 100), note: c.cashPayoutNote, requestId: newRequestId() }); }} />}
            <Button title={c.cashAdjust} size="sm" variant="outline" disabled={blocked} reason={blockedReason} onPress={() => { setMessage(''); setOpen({ id: row.driverId, kind: 'adjustment', amount: '', note: '', requestId: newRequestId() }); }} />
          </Row>}
        </Card>
      </Appear>)}
      {resolving && <Card>
        {/* Which decision, for whom and how much: a dispute and a confirmation must not look alike. */}
        <Txt variant="title">{resolving.decision === 'confirm' ? c.cashMarkConfirmed : c.cashMarkDisputed}</Txt>
        {(() => { const target = pending?.find(entry => entry.id === resolving.id);
          // The screen's direction leads, the name is isolated: an Arabic name first would flip an English line (A53 walk).
          return target && <Txt variant="caption" style={{ marginBottom: 8 }}>{`${rtl ? '\u200f' : '\u200e'}${isolate(target.userName)} · ${money(target.amountCents / 100)}${target.reference ? ` · ${ltr(target.reference)}` : ''}`}</Txt>; })()}
        <Field label={c.cashResolutionReason} value={resolving.reason} maxLength={500} disabled={busy} onChangeText={reason => setResolving({ ...resolving, reason })} />
        <Field label={c.cashEvidence} value={resolving.evidenceRef} maxLength={200} disabled={busy} onChangeText={evidenceRef => setResolving({ ...resolving, evidenceRef })} />
        <Row gap={8} style={{ marginTop: 10 }}>
          <Button title={c.cashResolveSave} icon="checkmark-done-outline" loading={busy} disabled={busy || resolving.reason.trim().length < 5}
            reason={busy ? c.wait_busy : c.reason_min5} onPress={() => confirm(c.cashResolveConfirm, () => void resolveEntry(), c.cashResolveSave, c.cancel)} />
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
              <Button title={c.cashMarkConfirmed} size="sm" variant="soft" disabled={busy} reason={c.wait_busy}
                onPress={() => { setMessage(''); setFailure(''); setResolving({ id: entry.id, decision: 'confirm', reason: '', evidenceRef: '' }); }} />
              <Button title={c.cashMarkDisputed} size="sm" variant="outline" disabled={busy} reason={c.wait_busy}
                onPress={() => { setMessage(''); setFailure(''); setResolving({ id: entry.id, decision: 'dispute', reason: '', evidenceRef: '' }); }} />
            </Row>
          </Card>
        </Appear>)}
      </>}
  </Screen>;
}
