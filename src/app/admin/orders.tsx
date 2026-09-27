import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useApi } from '../../api';
import type { Order, OrderStatus } from '../../model';
import { OrderRow } from '../../parts';
import { Empty, ErrorText, FilterChips, Header, Loading, Screen, useCopy } from '../../ui';

const filters: ('all' | OrderStatus)[] = ['all', 'searching', 'assigned', 'at_pickup', 'in_transit', 'completed', 'cancelled'];

export default function AdminOrders() {
  const { c, err } = useCopy();
  const [status, setStatus] = useState<'all' | OrderStatus>('all');
  const { data, error, reload } = useApi<Order[]>(status === 'all' ? '/orders' : `/orders?status=${status}`, 15_000);
  return <Screen onRefresh={reload}>
    <Header title={c.allOrders} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }}>
      <FilterChips items={filters.map(key => ({ key, label: key === 'all' ? c.all : c[key] }))} value={status} onChange={setStatus} />
    </ScrollView>
    <ErrorText>{error && err(error)}</ErrorText>
    {!data ? <Loading /> : data.length === 0
      ? <Empty icon="receipt-outline" title={c.nothingHere} />
      : data.map((order, i) => <OrderRow key={order.id} order={order} index={i} />)}
  </Screen>;
}
