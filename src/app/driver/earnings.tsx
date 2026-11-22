import { useState } from 'react';
import { View } from 'react-native';
import { api, useApi } from '../../api';
import { type CashBalance, cashLines } from '../../cash-lines';
import { PlanCard, useFormat } from '../../parts';
import { Badge, Button, Card, confirm, ErrorText, fill, haptic, Header, Loading, Row, Screen, Txt, useCopy } from '../../ui';
import { useTheme } from '../../theme-context';

type Bucket = { jobs: number; gross: number; commission: number; net: number; earnedNet?: number; tripPayCents?: number };
type CashEntry = { id: number; kind: 'remittance' | 'adjustment'; amountCents: number; note: string; source?: 'trip_pay' | 'pickup_pay' | 'payout';
  status: 'pending' | 'confirmed' | 'disputed'; reference: string | null; createdAt: number };
type Cash = CashBalance & { pendingCents: number; capCents?: number; exposureCents?: number; entries: CashEntry[] };
const entryTone = { pending: 'warn', confirmed: 'olive', disputed: 'error' } as const;

export default function Earnings() {
  const { c, money, err } = useCopy();
  const { data, error, reload } = useApi<{ today: Bucket; week: Bucket; all: Bucket }>('/driver/earnings');
  return <Screen onRefresh={reload}>
    <Header title={c.earnings} />
    <Txt variant="caption" style={{ marginBottom: 12 }}>{c.earningsNote}</Txt>
    <ErrorText>{error && err(error)}</ErrorText>
    {!data ? <Loading failed={!!error} onRetry={reload} /> :
      ([[c.today, data.today], [c.week, data.week], [c.allTime, data.all]] as const).map(([title, bucket]) => {
        const lines: [string, number][] = [
          [c.gross, bucket.gross],
          [c.commission, -bucket.commission],
          [c.tripPay, (bucket.tripPayCents ?? 0) / 100],
          [c.earnedPay, bucket.earnedNet ?? bucket.net],
        ];
        return <Card key={title}>
          <Txt variant="title">{title}</Txt>
          <Txt variant="micro" style={{ marginTop: 2, marginBottom: 8 }}>{fill(c.tripsCount, { n: bucket.jobs })}</Txt>
          {lines.map(([label, value]) => <Row key={label} gap={8} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
            <Txt style={{ flex: 1 }}>{label}</Txt>
            <Txt variant="title">{money(value)}</Txt>
          </Row>)}
        </Card>;
      })}
    <CashCard />
    <View style={{ marginTop: 4 }}><PlanCard /></View>
  </Screen>;
}

// What the driver owes Wind in cash, and the cashier's handovers waiting for the driver's confirmation.
function CashCard() {
  const { tones } = useTheme();
  const { c, money, err } = useCopy();
  const { time } = useFormat();
  const { data, error, reload } = useApi<Cash>('/driver/cash', 15_000); // a handover recorded at the cashier shows up while the driver waits
  const [busy, setBusy] = useState<number | null>(null);
  const [failure, setFailure] = useState('');
  const [shown, setShown] = useState(10); // the ledger is longer than the screen: it grows on request
  if (!data) return null;
  const lines = cashLines(c, data);
  async function decide(entry: CashEntry, decision: 'confirm' | 'dispute') {
    setBusy(entry.id); setFailure('');
    try { await api(`/driver/cash/${entry.id}/confirm`, { decision }); haptic.success(); reload(); }
    catch (e) { setFailure(err(e)); } finally { setBusy(null); }
  }
  return <Card tone={data.owedCents > 0 ? 'warn' : 'card'}>
    <Txt variant="micro">{c.cashSettlement}</Txt>
    <Row style={{ justifyContent: 'space-between' }}>
      <Txt variant="title">{data.owedCents < 0 ? c.windOwesYou : c.cashOwed}</Txt>
      <Txt variant="h2">{money(Math.abs(data.owedCents) / 100)}</Txt>
    </Row>
    {lines.length > 0 && <Txt variant="caption" style={{ marginTop: 4, marginBottom: 4 }}>{c.cashBreakdownHint}</Txt>}
    {lines.map(([label, cents]) => <Row key={label} gap={8} style={{ justifyContent: 'space-between', paddingVertical: 2 }}>
      <Txt style={{ flex: 1 }}>{label}</Txt>
      <Txt>{money(cents / 100)}</Txt>
    </Row>)}
    {data.pendingCents > 0 && <Txt variant="caption" style={{ marginTop: 4 }}>{`${c.cashPendingTotal}: ${money(data.pendingCents / 100)}`}</Txt>}
    {data.capCents !== undefined && data.exposureCents !== undefined && (data.capCents - data.exposureCents > 0
      ? <Txt variant="label" style={{ marginTop: 8 }}>{`${c.cashCapLeft}: ${money((data.capCents - data.exposureCents) / 100)}`}</Txt>
      : <Txt variant="title" style={{ marginTop: 8, color: tones.error.fg }}>{c.cashCapReached}</Txt>)}
    <ErrorText>{failure || (error && err(error))}</ErrorText>{/* a failed poll keeps the last balance: say so */}
    {data.entries.filter(e => e.status === 'pending').map(entry => <View key={entry.id} style={{ marginTop: 12, gap: 8 }}>
      <Txt variant="title">{`${c.cashPending}: ${money(entry.amountCents / 100)} · ${entry.reference}`}</Txt>
      <Button title={c.cashConfirm} icon="checkmark-circle-outline" loading={busy === entry.id} disabled={busy !== null} reason={c.wait_busy} onPress={() => decide(entry, 'confirm')} />
      <Button title={c.cashDispute} variant="ghost" size="sm" disabled={busy !== null} reason={c.wait_busy}
        onPress={() => confirm(c.cashDisputeConfirm, () => decide(entry, 'dispute'), c.cashDispute, c.no)} />
    </View>)}
    {data.entries.length > 0 && <Txt variant="title" style={{ marginTop: 14, marginBottom: 4 }}>{c.cashEntries}</Txt>}
    {data.entries.slice(0, shown).map(entry => {
      const note = entry.source === 'trip_pay' ? c.tripPayEntry
        : entry.source === 'pickup_pay' ? c.pickupTripPayEntry
        : entry.source === 'payout' ? c.officePayoutEntry : entry.note;
      return <Row key={entry.id} gap={8} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
        <View style={{ flex: 1 }}>
          <Txt>{entry.reference ? `${c[`entry_${entry.kind}`]} · ${entry.reference}` : c[`entry_${entry.kind}`]}</Txt>
          <Txt variant="micro">{note ? `${time(entry.createdAt)} · ${note}` : time(entry.createdAt)}</Txt>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Txt variant="title">{money((entry.kind === 'remittance' ? -entry.amountCents : entry.amountCents) / 100)}</Txt>
          <Badge label={entry.status === 'pending' ? c.cashAwaitingYou : c[`entry_${entry.status}`]} tone={tones[entryTone[entry.status]]} />
        </View>
      </Row>;
    })}
    {data.entries.length > shown && <Button title={c.showMore} variant="ghost" size="sm" onPress={() => setShown(n => n + 20)} />}
  </Card>;
}
