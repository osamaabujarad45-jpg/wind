import { router } from 'expo-router';
import { useApi } from '../../api';
import type { Order } from '../../model';
import { OrderRow } from '../../parts';
import { Button, Empty, ErrorText, Header, Loading, Screen, Tip, useCopy } from '../../ui';

export default function Orders() {
  const { c, err } = useCopy();
  const { data, error, reload } = useApi<Order[]>('/orders', 10_000);
  return <Screen onRefresh={reload}>
    <Header title={c.orders} />
    <ErrorText>{error && err(error)}</ErrorText>
    {!!data?.length && <Tip id="orders-list" icon="receipt-outline" title={c.tipOrdersTitle} body={c.tipOrdersBody} />}
    {!data ? <Loading /> : data.length === 0
      ? <Empty icon="receipt-outline" title={c.noOrders} body={c.noOrdersDesc} action={<Button title={c.home} onPress={() => router.navigate('/')} />} />
      : data.map((order, i) => <OrderRow key={order.id} order={order} index={i} />)}
  </Screen>;
}
