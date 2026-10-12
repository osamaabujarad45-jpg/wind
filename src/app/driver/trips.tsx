import { View } from 'react-native';
import { router } from 'expo-router';
import { useApi } from '../../api';
import { activeStatuses, city, runSheet, type Order } from '../../model';
import { OrderRow } from '../../parts';
import { Button, Empty, ErrorText, fill, Header, Loading, palette, Screen, Txt, useCopy } from '../../ui';

export default function Trips() {
  const { c, err, language } = useCopy();
  const { data, error, reload } = useApi<Order[]>('/orders', 10_000);
  const active = (data ?? []).filter(o => activeStatuses.includes(o.status));
  const lastTrip = (data ?? []).filter(o => o.status === 'completed').sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const past = (data ?? []).filter(o => !activeStatuses.includes(o.status) && o.id !== lastTrip?.id);
  return <Screen onRefresh={reload}>
    <Header title={c.trips} />
    <ErrorText>{error && err(error)}</ErrorText>
    {!data ? <Loading /> : data.length === 0
      ? <Empty icon="navigate-outline" title={c.noTrips} body={c.noTripsDesc} action={<Button title={c.jobs} onPress={() => router.navigate('/driver')} />} />
      : <>
        {active.length > 0 && <Txt variant="h2" style={{ marginBottom: 12 }}>{c.activeTrips}</Txt>}
        {/* Run sheet (SPEC-run-sheet.md): pickups, then deliveries by city (biggest first), then returns.
            One trip needs no sheet: "deliver in X · 1" only repeated its card's route and status. */}
        {runSheet(active).map(group => <View key={`${group.stage}:${group.city}`} style={{ marginBottom: 4 }}>
          {active.length > 1 && <Txt variant="label" style={{ marginBottom: 8, color: palette.secondary }}>{fill(c[group.stage === 'pickup' ? 'runPickup' : group.stage === 'deliver' ? 'runDeliver' : 'runReturn'],
            { city: city(group.city)[language], n: group.orders.length })}</Txt>}
          {group.orders.map(order => <OrderRow key={order.id} order={order} index={Math.min(active.indexOf(order), 8)} />)}
        </View>)}
        {lastTrip && <>
          <Txt variant="h2" style={{ marginVertical: 12 }}>{c.lastTrip}</Txt>
          <OrderRow order={lastTrip} index={active.length} />
        </>}
        {past.length > 0 && <Txt variant="h2" style={{ marginVertical: 12 }}>{c.history}</Txt>}
        {past.map((order, i) => <OrderRow key={order.id} order={order} index={i + active.length + (lastTrip ? 1 : 0)} />)}
      </>}
  </Screen>;
}
