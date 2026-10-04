import { useState } from 'react';
import { View } from 'react-native';
import { api, useApi } from '../../api';
import { useFormat } from '../../parts';
import { Appear, Button, Card, Empty, ErrorText, Field, fill, haptic, Header, Loading, Row, Screen, Txt, useCopy } from '../../ui';

type Balance = { driverId: number; name: string; phone: string; owedCents: number; pendingCents: number; lastRemittanceAt: number | null };

// Cashier view: every driver's cash balance, highest debt first. Handovers wait for the driver's confirmation.
export default function AdminCash() {
  const { c, money, err } = useCopy();
  const { date } = useFormat();
  const { data, error, reload } = useApi<Balance[]>('/admin/cash', 15_000);
  const [open, setOpen] = useState<{ id: number; kind: 'remittance' | 'adjustment'; amount: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  // Shekels in the form, integer agorot on the wire.
  const cents = (text: string) => Math.round(Number(text.replace(',', '.')) * 100);

  async function submit() {
    if (!open || busy) return;
    setBusy(true); setFailure(''); setMessage('');
    try {
      const entry = await api<{ reference: string | null }>(`/admin/cash/${open.kind}`, open.kind === 'remittance'
        ? { driverId: open.id, amountCents: cents(open.amount), note: open.note.trim() }
        : { driverId: open.id, amountCents: cents(open.amount), reason: open.note.trim() });
      haptic.success();
      if (entry.reference) setMessage(fill(c.cashRecorded, { r: entry.reference }));
      setOpen(null); reload();
    } catch (e) { setFailure(err(e)); } finally { setBusy(false); }
  }

  return <Screen onRefresh={reload}>
    <Header title={c.cashTab} />
    <Txt variant="caption" style={{ marginBottom: 12 }}>{c.cashOwedHint}</Txt>
    <ErrorText>{failure || (error && err(error))}</ErrorText>
    {!!message && <View accessibilityLiveRegion="polite"><Txt variant="caption" style={{ marginBottom: 10 }}>{message}</Txt></View>}
    {!data ? <Loading /> : data.length === 0 ? <Empty icon="cash-outline" title={c.cashNoDrivers} />
      : data.map((row, i) => <Appear key={row.driverId} index={i}>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="title">{row.name}</Txt>
              <Txt variant="caption" selectable>{row.phone}</Txt>
              {row.lastRemittanceAt != null && <Txt variant="micro">{fill(c.cashLast, { d: date(row.lastRemittanceAt) })}</Txt>}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Txt variant="h2">{money(row.owedCents / 100)}</Txt>
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
              onPress={submit} />
            <Button title={c.cancel} variant="ghost" size="sm" disabled={busy} onPress={() => setOpen(null)} />
          </View> : <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <Button title={c.cashRecord} size="sm" icon="cash-outline" disabled={row.owedCents - row.pendingCents <= 0}
              onPress={() => { setMessage(''); setOpen({ id: row.driverId, kind: 'remittance', amount: String((row.owedCents - row.pendingCents) / 100), note: '' }); }} />
            <Button title={c.cashAdjust} size="sm" variant="outline" onPress={() => { setMessage(''); setOpen({ id: row.driverId, kind: 'adjustment', amount: '', note: '' }); }} />
          </Row>}
        </Card>
      </Appear>)}
  </Screen>;
}
