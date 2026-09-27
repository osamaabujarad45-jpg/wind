import { router } from 'expo-router';
import { useApi } from '../../api';
import { activeStatuses, type Order } from '../../model';
import { OrderRow } from '../../parts';
import { Button, Empty, ErrorText, Header, Loading, Screen, Txt, useCopy } from '../../ui';

export default function Trips() {
  const { c, err } = useCopy();
  const { data, error, reload } = useApi<Order[]>('/orders', 10_000);
  const active = (data ?? []).filter(o => activeStatuses.includes(o.status));
  const past = (data ?? []).filter(o => !activeStatuses.includes(o.status));
  return <Screen onRefresh={reload}>
    <Header title={c.trips} />
    <ErrorText>{error && err(error)}</ErrorText>
    {!data ? <Loading /> : data.length === 0
      ? <Empty icon="navigate-outline" title={c.noTrips} body={c.noTripsDesc} action={<Button title={c.jobs} onPress={() => router.navigate('/driver')} />} />
      : <>
        {active.length > 0 && <Txt variant="h2" style={{ marginBottom: 12 }}>{c.activeTrips}</Txt>}
        {active.map((order, i) => <OrderRow key={order.id} order={order} index={i} />)}
        {past.length > 0 && <Txt variant="h2" style={{ marginVertical: 12 }}>{c.history}</Txt>}
        {past.map((order, i) => <OrderRow key={order.id} order={order} index={i + active.length} />)}
      </>}
  </Screen>;
}
