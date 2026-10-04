import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { api, useApi } from '../../api';
import { ltr, orderCode, type Order, type OrderStatus } from '../../model';
import { OrderRow } from '../../parts';
import { Button, Card, Empty, ErrorText, Field, FilterChips, Header, Loading, Screen, Txt, useCopy } from '../../ui';

type Filter = 'all' | 'disputes' | OrderStatus;
const filters: Filter[] = ['all', 'on_hold', 'disputes', 'searching', 'assigned', 'at_pickup', 'in_transit', 'returning', 'completed', 'returned', 'cancelled'];
type DisputeRow = { id: number; orderId: number; reason: string; status: 'open' | 'resolved'; resolution: string | null; customerName: string };

export default function AdminOrders() {
  const { c, err } = useCopy();
  const [status, setStatus] = useState<Filter>('all');
  const { data, error, reload } = useApi<Order[]>(status === 'disputes' ? null : status === 'all' ? '/orders' : `/orders?status=${status}`, 15_000);
  return <Screen onRefresh={reload}>
    <Header title={c.allOrders} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }}>
      <FilterChips items={filters.map(key => ({ key, label: key === 'all' ? c.all : c[key] }))} value={status} onChange={setStatus} />
    </ScrollView>
    {status === 'disputes' ? <Disputes /> : <>
      <ErrorText>{error && err(error)}</ErrorText>
      {!data ? <Loading /> : data.length === 0
        ? <Empty icon="receipt-outline" title={c.nothingHere} />
        : data.map((order, i) => <OrderRow key={order.id} order={order} index={i} />)}
    </>}
  </Screen>;
}

function Disputes() {
  const { c, err } = useCopy();
  const { data, error, reload } = useApi<DisputeRow[]>('/admin/disputes', 15_000);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [failure, setFailure] = useState('');
  const open = (data ?? []).filter(d => d.status === 'open');
  async function resolve(id: number) {
    setBusy(id);
    setFailure('');
    try {
      await api(`/admin/disputes/${id}/resolve`, { resolution: drafts[id].trim() });
      reload();
    } catch (e) { setFailure(err(e)); } finally { setBusy(null); }
  }
  return <>
    <ErrorText>{(error && err(error)) || failure}</ErrorText>
    {!data ? <Loading /> : open.length === 0 ? <Empty icon="flag-outline" title={c.noDisputes} /> : open.map(d => <Card key={d.id}>
      <Button title={`${ltr(orderCode(d.orderId))} · ${d.customerName}`} variant="ghost" size="sm" icon="receipt-outline"
        onPress={() => router.push(`/order/${d.orderId}`)} />
      <Txt variant="body" style={{ marginBottom: 10 }}>{d.reason}</Txt>
      <Field label={c.resolution} value={drafts[d.id] ?? ''} multiline maxLength={1000} disabled={busy !== null}
        onChangeText={text => setDrafts(v => ({ ...v, [d.id]: text }))} />
      <View>
        <Button title={c.resolveDispute} variant="outline" icon="checkmark-done-outline" loading={busy === d.id}
          disabled={busy !== null || (drafts[d.id] ?? '').trim().length < 5} onPress={() => resolve(d.id)} />
      </View>
    </Card>)}
  </>;
}
