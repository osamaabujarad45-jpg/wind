import { router } from 'expo-router';
import { MoreOrders, OrderRow, useOrders } from '../../parts';
import { Button, Empty, ErrorText, Header, Loading, Screen, useCopy } from '../../ui';

export default function Orders() {
  const { c, err } = useCopy();
  const { data, error, reload, more } = useOrders('/orders', 10_000);
  return <Screen onRefresh={reload}>
    <Header title={c.orders} />
    <ErrorText>{error && err(error)}</ErrorText>
    {!data ? <Loading /> : data.length === 0
      ? <Empty icon="receipt-outline" title={c.noOrders} body={c.noOrdersDesc} action={<Button title={c.home} onPress={() => router.navigate('/')} />} />
      : <>{data.map((order, i) => <OrderRow key={order.id} order={order} index={i} />)}<MoreOrders more={more} /></>}
  </Screen>;
}
