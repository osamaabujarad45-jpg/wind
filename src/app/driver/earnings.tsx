import { View } from 'react-native';
import { useApi } from '../../api';
import { PlanCard } from '../../parts';
import { Card, ErrorText, fill, Header, Loading, Row, Screen, Stat, Txt, useCopy } from '../../ui';

type Bucket = { jobs: number; gross: number; commission: number; net: number };

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
    <View style={{ marginTop: 4 }}><PlanCard /></View>
  </Screen>;
}
