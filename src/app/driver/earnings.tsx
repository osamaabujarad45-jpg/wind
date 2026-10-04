import { useState } from 'react';
import { View } from 'react-native';
import { api, useApi } from '../../api';
import { PlanCard, useFormat } from '../../parts';
import { Badge, Button, Card, confirm, ErrorText, fill, haptic, Header, Loading, Row, Screen, Stat, tones, Txt, useCopy } from '../../ui';

type Bucket = { jobs: number; gross: number; commission: number; net: number };
type CashEntry = { id: number; kind: 'remittance' | 'adjustment'; amountCents: number; note: string;
  status: 'pending' | 'confirmed' | 'disputed'; reference: string | null; createdAt: number };
type Cash = { owedCents: number; pendingCents: number; discountsCents: number; entries: CashEntry[] };
const entryTone = { pending: tones.clay, confirmed: tones.olive, disputed: tones.error };

export default function Earnings() {
  const { c, money, err } = useCopy();
  const { data, error, reload } = useApi<{ today: Bucket; week: Bucket; all: Bucket }>('/driver/earnings');
  return <Screen onRefresh={reload}>
    <Header title={c.earnings} />
    <Txt variant="caption" style={{ marginBottom: 12 }}>{c.earningsNote}</Txt>
    <ErrorText>{error && err(error)}</ErrorText>
    {!data ? <Loading /> : <>
      <Row gap={10} style={{ flexWrap: 'wrap', marginBottom: 14 }}>
        <Stat index={0} tone="olive" label={`${c.today} · ${fill(c.tripsCount, { n: data.today.jobs })}`} value={money(data.today.net)} />
        <Stat index={1} label={`${c.week} · ${fill(c.tripsCount, { n: data.week.jobs })}`} value={money(data.week.net)} />
      </Row>
      <Card>
        <Txt variant="title" style={{ marginBottom: 8 }}>{c.allTime} · {fill(c.tripsCount, { n: data.all.jobs })}</Txt>
        {([[c.gross, data.all.gross], [c.commission, -data.all.commission], [c.net, data.all.net]] as const).map(([label, value]) =>
          <Row key={label} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
            <Txt>{label}</Txt>
            <Txt variant="title">{money(value)}</Txt>
          </Row>)}
      </Card>
    </>}
    <CashCard />
    <View style={{ marginTop: 4 }}><PlanCard /></View>
  </Screen>;
}

// What the driver owes Wind in cash, and the cashier's handovers waiting for the driver's confirmation.
function CashCard() {
  const { c, money, err } = useCopy();
  const { time } = useFormat();
  const { data, reload } = useApi<Cash>('/driver/cash', 15_000); // a handover recorded at the cashier shows up while the driver waits
  const [busy, setBusy] = useState<number | null>(null);
  const [failure, setFailure] = useState('');
  if (!data) return null;
  async function decide(entry: CashEntry, decision: 'confirm' | 'dispute') {
    setBusy(entry.id); setFailure('');
    try { await api(`/driver/cash/${entry.id}/confirm`, { decision }); haptic.success(); reload(); }
    catch (e) { setFailure(err(e)); } finally { setBusy(null); }
  }
  return <Card tone={data.owedCents > 0 ? 'clay' : 'card'}>
    <Row style={{ justifyContent: 'space-between' }}>
      <Txt variant="title">{data.owedCents < 0 ? c.windOwesYou : c.cashOwed}</Txt>
      <Txt variant="h2">{money(Math.abs(data.owedCents) / 100)}</Txt>
    </Row>
    <Txt variant="caption" style={{ marginTop: 4 }}>{c.cashOwedHint}</Txt>
    {data.discountsCents > 0 && <Txt variant="label" style={{ marginTop: 4 }}>{`${c.promoCredits}: ${money(-data.discountsCents / 100)}`}</Txt>}
    <ErrorText>{failure}</ErrorText>
    {data.entries.filter(e => e.status === 'pending').map(entry => <View key={entry.id} style={{ marginTop: 12, gap: 8 }}>
      <Txt variant="title">{`${c.cashPending}: ${money(entry.amountCents / 100)} · ${entry.reference}`}</Txt>
      <Button title={c.cashConfirm} icon="checkmark-circle-outline" loading={busy === entry.id} disabled={busy !== null} onPress={() => decide(entry, 'confirm')} />
      <Button title={c.cashDispute} variant="ghost" size="sm" disabled={busy !== null}
        onPress={() => confirm(c.cashDisputeConfirm, () => decide(entry, 'dispute'), c.cashDispute, c.no)} />
    </View>)}
    {data.entries.length > 0 && <Txt variant="title" style={{ marginTop: 14, marginBottom: 4 }}>{c.cashEntries}</Txt>}
    {data.entries.slice(0, 10).map(entry => <Row key={entry.id} gap={8} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
      <View style={{ flex: 1 }}>
        <Txt>{entry.reference ? `${c[`entry_${entry.kind}`]} · ${entry.reference}` : c[`entry_${entry.kind}`]}</Txt>
        <Txt variant="micro">{entry.note ? `${time(entry.createdAt)} · ${entry.note}` : time(entry.createdAt)}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Txt variant="title">{money((entry.kind === 'remittance' ? -entry.amountCents : entry.amountCents) / 100)}</Txt>
        <Badge label={entry.status === 'pending' ? c.cashAwaitingYou : c[`entry_${entry.status}`]} tone={entryTone[entry.status]} />
      </View>
    </Row>)}
  </Card>;
}
