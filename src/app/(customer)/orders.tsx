import { router } from 'expo-router';
import { View } from 'react-native';
import { MoreOrders, OrderRow, useOrders } from '../../parts';
import { services } from '../../model';
import { useSession } from '../../session';
import { Button, Empty, ErrorText, Header, Loading, Screen, useCopy } from '../../ui';

export default function Orders() {
  const { c, err } = useCopy();
  const { me } = useSession();
  const { data, error, reload, retry, retrying, more } = useOrders('/orders', 10_000);
  const enabledServices = me?.capabilities?.enabledServices ?? ['parcel'];
  return <Screen onRefresh={reload}>
    <Header title={c.orders} />
    <ErrorText>{error && (data ? c.updatesPaused : err(error))}</ErrorText>
    {!!error && !!data && <View style={{ marginBottom: 12 }}><Button title={c.retry} icon="refresh" variant="outline" loading={retrying} onPress={retry} /></View>}
    {!data ? <Loading failed={!!error} onRetry={retry} busy={retrying} /> : data.length === 0
      ? <Empty icon="receipt-outline" title={c.noOrders} body={c.noOrdersDesc} action={<View style={{ gap: 8, width: '100%' }}>
        {enabledServices.length ? services.filter(service => enabledServices.includes(service)).map(service => <Button key={service} title={`${c.request} ${c[service]}`} icon="add"
          onPress={() => router.push({ pathname: '/book', params: { service } })} />) : <Button title={c.help} icon="help-circle-outline" onPress={() => router.push('/help')} />}
      </View>} />
      : <>{data.map((order, i) => <OrderRow key={order.id} order={order} index={i} />)}<MoreOrders more={more} /></>}
  </Screen>;
}
