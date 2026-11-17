import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { api, useApi } from '../../api';
import { cashCommandBody, cashCommandKey, formAfter, newCashCommand, recoverCashCommand, sendCashCommand, type CashEntry, type CashIO, type CashOutcome } from '../../admin-cash-command';
import { newRequestId } from '../../booking';
import { minorFromText } from '../../model';
import { useFormat } from '../../parts';
import { useSession } from '../../session';
import { storage } from '../../storage';
import { Appear, Badge, Button, Card, confirm, Empty, ErrorText, Field, fill, haptic, Header, Loading, Row, Screen, tones, Txt, useCopy } from '../../ui';

type Balance = { driverId: number; name: string; phone: string; owedCents: number; pendingCents: number; lastRemittanceAt: number | null };
// A-01: the form is saved in the admin's own secure slot before it is sent (it outlives a forced sign-out, like a pending
// booking) and settled after a restart by this admin's command receipt or a same-id resend.
const cashIO = (actorId: number): CashIO => ({
  read: async () => { const raw = await storage.get(cashCommandKey(actorId), true); return raw ? JSON.parse(raw) : null; },
  write: async command => { await storage.set(cashCommandKey(actorId), command && JSON.stringify(command), true); },
  receipt: command => api<{ entry: CashEntry | null }>(`/admin/cash/commands/${command.requestId}`),
  send: command => api<CashEntry>(`/admin/cash/${command.kind}`, cashCommandBody(command)),
  exclusive: run => storage.exclusive(run, 'wind.admin.cash'),
});
type Form = { id: number; kind: 'remittance' | 'adjustment'; amount: string; note: string; requestId: string; uncertain?: boolean };
type PendingEntry = { id: number; amountCents: number; createdAt: number; userName: string; userPhone: string; userStatus: string };

// Cashier view: every driver's cash balance, highest debt first. Handovers wait for the driver's confirmation;
// one a driver cannot confirm (blocked, gone, dispute deadlock) is resolved here with a recorded reason (T25).
export default function AdminCash() {
  const { c, money, err } = useCopy();
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
  const amountProblem = (kind: 'remittance' | 'adjustment', text: string, room: number) => {
    const value = cents(text);
    if (Number.isNaN(value)) return c.cash_amount_format;
    if (value === 0) return c.cash_amount_needed;
    if (kind === 'remittance' && (value < 0 || value > room)) return c.err_invalid_amount;
    if (kind === 'adjustment' && value < 0) return c.err_approval_required; // forgiving debt needs a second finance approver
    return null;
  };

  const recorded = (entry: CashEntry) => setMessage(entry.reference ? fill(c.cashRecorded, { r: entry.reference }) : c.cashAdjustRecorded);
  // After a restart the saved form comes back locked until this admin's command receipt or a same-id resend settles it.
  useEffect(() => {
    if (!actorId) return;
    let live = true;
    recoverCashCommand(cashIO(actorId), actorId).then(outcome => {
      if (!live || outcome.state === 'empty') return;
      if (outcome.state === 'recorded') { recorded(outcome.entry); reload(); reloadPending(); return; }
      const { command } = outcome;
      setOpen({ id: command.driverId, kind: command.kind, amount: String(command.amountCents / 100), note: command.note, requestId: command.requestId, uncertain: true });
    }).catch(e => { if (live) fail(err(e)); }) // the saved command stays on the device for the next attempt
      .finally(() => { if (live) setRecovering(false); });
    return () => { live = false; };
  }, [actorId]); // eslint-disable-line react-hooks/exhaustive-deps -- once per signed-in admin, not per copy/reload identity

  async function submit() {
    if (!open || !actorId || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setFailure(''); setMessage('');
    try {
      const outcome: CashOutcome = await sendCashCommand(cashIO(actorId), newCashCommand(actorId, open.id, open.kind, cents(open.amount), open.note.trim(), open.requestId));
      if (outcome.state === 'recorded') { haptic.success(); recorded(outcome.entry); }
      else if (outcome.state !== 'empty') fail(err(outcome.error));
      setOpen(o => formAfter(o, outcome)); // only the form that was sent changes
      reload(); reloadPending();
    } catch (e) { fail(err(e instanceof Error && e.message === 'cash_command_pending' ? e.message : e)); } // not saved, so nothing was sent
    finally { inFlight.current = false; setBusy(false); }
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
  const blocked = busy || recovering || !!open?.uncertain;
  const blockedReason = open?.uncertain ? c.err_cash_command_pending : c.wait_busy;

  return <Screen onRefresh={() => { setMessage(''); reloadPending(); return reload(); }} scrollRef={list}>
    <Header title={c.cashTab} />
    <Txt variant="caption" style={{ marginBottom: 12 }}>{c.cashOwedHint}</Txt>
    <ErrorText>{failure || (error && err(error))}</ErrorText>
    {!!message && <View accessibilityLiveRegion="polite"><Txt variant="caption" style={{ marginBottom: 10 }}>{message}</Txt></View>}
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
            {!open.uncertain && <Button title={open.kind === 'remittance' ? c.cashRecord : c.cashAdjust} icon="checkmark-done-outline" loading={busy}
              disabled={busy || !!amountProblem(open.kind, open.amount, row.owedCents - row.pendingCents) || (open.kind === 'adjustment' && open.note.trim().length < 5)}
              reason={busy ? c.wait_busy : amountProblem(open.kind, open.amount, row.owedCents - row.pendingCents) ?? c.reason_min5}
              onPress={() => confirm(fill(open.kind === 'remittance' ? c.cashReviewRecord : c.cashReviewAdjust, { a: money(cents(open.amount) / 100), n: row.name }),
                () => void submit(), open.kind === 'remittance' ? c.cashRecord : c.cashAdjust, c.cancel)} />}
            {open.uncertain && <>
              {/* The balance already counts this entry's own pending copy, so the same-id resend is the one way to settle it. */}
              <Txt variant="caption" style={{ marginTop: 8 }}>{c.cashUncertain}</Txt>
              <Button title={c.cashRetrySame} icon="refresh" variant="soft" loading={busy} disabled={busy} reason={c.wait_busy} onPress={() => void submit()} />
            </>}
            {/* An unconfirmed entry is never dismissed: only its receipt or a same-id resend settles it. */}
            {!open.uncertain && <Button title={c.cancel} variant="ghost" size="sm" disabled={busy} reason={c.wait_busy} onPress={() => setOpen(null)} />}
          </View> : <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Button title={c.cashRecord} size="sm" icon="cash-outline" disabled={blocked || row.owedCents - row.pendingCents <= 0} reason={blocked ? blockedReason : c.cash_none_owed}
              onPress={() => { setMessage(''); setOpen({ id: row.driverId, kind: 'remittance', amount: String((row.owedCents - row.pendingCents) / 100), note: '', requestId: newRequestId() }); }} />
            {row.owedCents - row.pendingCents < 0 && <Button title={c.cashPayDriver} size="sm" icon="wallet-outline" variant="soft" disabled={blocked} reason={blockedReason}
              onPress={() => { setMessage(''); setOpen({ id: row.driverId, kind: 'adjustment', amount: String((row.pendingCents - row.owedCents) / 100), note: c.cashPayoutNote, requestId: newRequestId() }); }} />}
            <Button title={c.cashAdjust} size="sm" variant="outline" disabled={blocked} reason={blockedReason} onPress={() => { setMessage(''); setOpen({ id: row.driverId, kind: 'adjustment', amount: '', note: '', requestId: newRequestId() }); }} />
          </Row>}
        </Card>
      </Appear>)}
      {resolving && <Card>
        <Txt variant="title">{c.cashResolve}</Txt>
        <Field label={c.cashResolutionReason} value={resolving.reason} maxLength={500} disabled={busy} onChangeText={reason => setResolving({ ...resolving, reason })} />
        <Field label={c.cashEvidence} value={resolving.evidenceRef} maxLength={200} disabled={busy} onChangeText={evidenceRef => setResolving({ ...resolving, evidenceRef })} />
        <Row gap={8} style={{ marginTop: 10 }}>
          <Button title={c.cashResolveConfirm} icon="checkmark-done-outline" loading={busy} disabled={busy || resolving.reason.trim().length < 5}
            reason={busy ? c.wait_busy : c.reason_min5} onPress={() => confirm(c.cashResolveConfirm, () => void resolveEntry(), c.cashResolve, c.cancel)} />
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
                <Row gap={8}>
                  <Button title={c.entry_confirmed} size="sm" variant="soft" disabled={busy} reason={c.wait_busy}
                    onPress={() => { setMessage(''); setFailure(''); setResolving({ id: entry.id, decision: 'confirm', reason: '', evidenceRef: '' }); }} />
                  <Button title={c.entry_disputed} size="sm" variant="outline" disabled={busy} reason={c.wait_busy}
                    onPress={() => { setMessage(''); setFailure(''); setResolving({ id: entry.id, decision: 'dispute', reason: '', evidenceRef: '' }); }} />
                </Row>
              </View>
            </Row>
          </Card>
        </Appear>)}
      </>}
  </Screen>;
}
