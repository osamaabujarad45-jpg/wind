import { useState } from 'react';
import { View } from 'react-native';
import { api, useApi } from '../../api';
import { newRequestId } from '../../booking';
import { typedNumber } from '../../model';
import { useFormat } from '../../parts';
import { Appear, Badge, Button, Card, confirm, Empty, ErrorText, Field, fill, haptic, Header, Loading, Row, Screen, tones, Txt, useCopy } from '../../ui';

type Balance = { driverId: number; name: string; phone: string; owedCents: number; pendingCents: number; lastRemittanceAt: number | null };
type PendingEntry = { id: number; amountCents: number; createdAt: number; userName: string; userPhone: string; userStatus: string };

// Cashier view: every driver's cash balance, highest debt first. Handovers wait for the driver's confirmation;
// one a driver cannot confirm (blocked, gone, dispute deadlock) is resolved here with a recorded reason (T25).
export default function AdminCash() {
  const { c, money, err } = useCopy();
  const { date } = useFormat();
  const { data, error, reload } = useApi<Balance[]>('/admin/cash', 15_000);
  const { data: pending, reload: reloadPending } = useApi<PendingEntry[]>('/admin/cash/pending', 15_000);
  const [open, setOpen] = useState<{ id: number; kind: 'remittance' | 'adjustment'; amount: string; note: string; requestId: string } | null>(null);
  const [resolving, setResolving] = useState<{ id: number; decision: 'confirm' | 'dispute'; reason: string; evidenceRef: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  // Shekels in the form, integer agorot on the wire.
  const cents = (text: string) => Math.round(typedNumber(text) * 100);

  async function submit() {
    if (!open || busy) return;
    setBusy(true); setFailure(''); setMessage('');
    try {
      const entry = await api<{ reference: string | null }>(`/admin/cash/${open.kind}`, open.kind === 'remittance'
        ? { driverId: open.id, amountCents: cents(open.amount), note: open.note.trim(), requestId: open.requestId }
        : { driverId: open.id, amountCents: cents(open.amount), reason: open.note.trim(), requestId: open.requestId });
      haptic.success();
      if (entry.reference) setMessage(fill(c.cashRecorded, { r: entry.reference }));
      setOpen(null); reload(); reloadPending();
    } catch (e) { setFailure(err(e)); } finally { setBusy(false); }
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
    } catch (e) { setFailure(err(e)); } finally { setBusy(false); }
  }

  return <Screen onRefresh={reload}>
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
            <Field label={open.kind === 'remittance' ? c.cashAmount : c.cashAdjustAmount} value={open.amount} keyboardType="decimal-pad" disabled={busy}
              onChangeText={amount => setOpen({ ...open, amount })} />
            <Field label={open.kind === 'remittance' ? c.problemNote : c.cashReason} value={open.note} maxLength={open.kind === 'remittance' ? 200 : 500} disabled={busy}
              onChangeText={note => setOpen({ ...open, note })} />
            <Button title={open.kind === 'remittance' ? c.cashRecord : c.cashAdjust} icon="checkmark-done-outline" loading={busy}
              disabled={busy || !Number.isFinite(cents(open.amount)) || cents(open.amount) === 0 || (open.kind === 'adjustment' && open.note.trim().length < 5)}
              reason={busy ? c.wait_busy : open.kind === 'adjustment' && open.note.trim().length < 5 ? c.reason_min5 : c.cash_amount_needed}
              onPress={submit} />
            <Button title={c.cancel} variant="ghost" size="sm" disabled={busy} reason={c.wait_busy} onPress={() => setOpen(null)} />
          </View> : <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <Button title={c.cashRecord} size="sm" icon="cash-outline" disabled={row.owedCents - row.pendingCents <= 0} reason={c.cash_none_owed}
              onPress={() => { setMessage(''); setOpen({ id: row.driverId, kind: 'remittance', amount: String((row.owedCents - row.pendingCents) / 100), note: '', requestId: newRequestId() }); }} />
            {row.owedCents - row.pendingCents < 0 && <Button title={c.cashPayDriver} size="sm" icon="wallet-outline" variant="soft"
              onPress={() => { setMessage(''); setOpen({ id: row.driverId, kind: 'adjustment', amount: String((row.pendingCents - row.owedCents) / 100), note: c.cashPayoutNote, requestId: newRequestId() }); }} />}
            <Button title={c.cashAdjust} size="sm" variant="outline" onPress={() => { setMessage(''); setOpen({ id: row.driverId, kind: 'adjustment', amount: '', note: '', requestId: newRequestId() }); }} />
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
