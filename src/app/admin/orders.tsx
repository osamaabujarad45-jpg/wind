import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, useApi } from '../../api';
import { ltr, orderCode, type Order, type OrderStatus, type SafetyKind } from '../../model';
import { OrderRow, useFormat } from '../../parts';
import { Button, Card, Empty, ErrorText, Field, FilterChips, Header, Loading, Screen, Txt, useCopy } from '../../ui';

type Filter = 'all' | 'disputes' | 'safety' | OrderStatus;
const filters: Filter[] = ['all', 'safety', 'on_hold', 'disputes', 'searching', 'assigned', 'at_pickup', 'in_transit', 'returning', 'completed', 'returned', 'cancelled'];
type DisputeRow = { id: number; orderId: number; reason: string; status: 'open' | 'resolved'; resolution: string | null; customerName: string };

export default function AdminOrders() {
  const { c, err } = useCopy();
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const [status, setStatus] = useState<Filter>(filter === 'safety' ? 'safety' : 'all');
  const { data, error, reload } = useApi<Order[]>(status === 'disputes' || status === 'safety' ? null : status === 'all' ? '/orders' : `/orders?status=${status}`, 15_000);
  return <Screen onRefresh={reload}>
    <Header title={c.allOrders} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }}>
      <FilterChips items={filters.map(key => ({ key, label: key === 'all' ? c.all : key === 'safety' ? c.safety : c[key] }))} value={status} onChange={setStatus} />
    </ScrollView>
    {status === 'safety' ? <Incidents /> : status === 'disputes' ? <Disputes /> : <>
      <ErrorText>{error && err(error)}</ErrorText>
      {!data ? <Loading /> : data.length === 0
        ? <Empty icon="receipt-outline" title={c.nothingHere} />
        : data.map((order, i) => <OrderRow key={order.id} order={order} index={i} />)}
    </>}
  </Screen>;
}

type IncidentRow = { id: number; orderId: number; kind: SafetyKind; note: string; status: 'open' | 'resolved'; reporterRole: 'customer' | 'driver';
  reporterName: string; reporterPhone: string; customerName: string; customerPhone: string; orderContact: string; driverName: string | null; driverPhone: string | null;
  latitude: number | null; longitude: number | null; createdAt: number };

function Incidents() {
  const { c, err } = useCopy();
  const { time } = useFormat();
  const { data, error, reload } = useApi<IncidentRow[]>('/admin/incidents', 10_000);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [failure, setFailure] = useState('');
  const open = (data ?? []).filter(d => d.status === 'open');
  async function resolve(id: number) {
    setBusy(id); setFailure('');
    try { await api(`/admin/incidents/${id}/resolve`, { resolution: drafts[id].trim() }); reload(); }
    catch (e) { setFailure(err(e)); } finally { setBusy(null); }
  }
  const call = (phone: string) => () => { Linking.openURL(`tel:${phone}`).catch(() => setFailure(c.callUnavailable)); };
  return <>
    <ErrorText>{(error && err(error)) || failure}</ErrorText>
    {!data ? <Loading /> : open.length === 0 ? <Empty icon="shield-checkmark-outline" title={c.noIncidents} /> : open.map(d => <Card key={d.id} tone="clay">
      <Txt variant="title">{`${c[`safety_${d.kind}`]} · ${time(d.createdAt)}`}</Txt>
      <Txt variant="caption" style={{ marginBottom: 6 }}>{`${c.reporter}: ${c[d.reporterRole]} · ${d.reporterName}`}</Txt>
      {!!d.note && <Txt variant="body" style={{ marginBottom: 8 }}>{d.note}</Txt>}
      <View style={{ gap: 6, marginBottom: 10 }}>
        <Button title={`${c.call} ${c.customer} · ${d.customerName}`} trailing={ltr(d.customerPhone)} icon="call-outline" variant="soft" size="sm" onPress={call(d.customerPhone)} />
        {d.orderContact && d.orderContact !== d.customerPhone && <Button title={`${c.call} · ${c.contact}`} trailing={ltr(d.orderContact)} icon="call-outline" variant="soft" size="sm" onPress={call(d.orderContact)} />}
        {d.driverPhone && <Button title={`${c.call} ${c.driver} · ${d.driverName}`} trailing={ltr(d.driverPhone)} icon="call-outline" variant="soft" size="sm" onPress={call(d.driverPhone)} />}
        {d.latitude != null && <Button title={c.openLocation} icon="location-outline" variant="ghost" size="sm"
          onPress={() => { Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}`).catch(() => undefined); }} />}
        <Button title={ltr(orderCode(d.orderId))} variant="ghost" size="sm" icon="receipt-outline" onPress={() => router.push(`/order/${d.orderId}`)} />
      </View>
      <Field label={c.resolution} value={drafts[d.id] ?? ''} multiline maxLength={1000} disabled={busy !== null}
        onChangeText={text => setDrafts(v => ({ ...v, [d.id]: text }))} />
      <Txt variant="caption" style={{ marginBottom: 8 }}>{c.resolutionVisible}</Txt>
      <Button title={c.resolveDispute} variant="outline" icon="checkmark-done-outline" loading={busy === d.id}
        disabled={busy !== null || (drafts[d.id] ?? '').trim().length < 5} onPress={() => resolve(d.id)} />
    </Card>)}
  </>;
}

// Blank = no credit; whole shekels 1–50 (Arabic-Indic digits allowed); undefined = invalid.
function creditOf(text = '') {
  const t = text.trim().replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : undefined;
}

function Disputes() {
  const { c, err, money } = useCopy();
  const { data, error, reload } = useApi<DisputeRow[]>('/admin/disputes', 15_000);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [credits, setCredits] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [failure, setFailure] = useState('');
  const open = (data ?? []).filter(d => d.status === 'open');
  async function resolve(id: number) {
    setBusy(id);
    setFailure('');
    try {
      const credit = creditOf(credits[id]);
      await api(`/admin/disputes/${id}/resolve`, { resolution: drafts[id].trim(), ...(credit != null && { creditShekels: credit }) });
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
      <Field label={c.creditField} value={credits[d.id] ?? ''} keyboardType="number-pad" maxLength={2} disabled={busy !== null}
        error={creditOf(credits[d.id]) === undefined ? c.creditInvalid : undefined} onChangeText={text => setCredits(v => ({ ...v, [d.id]: text }))} />
      <Txt variant="caption" style={{ marginTop: -6, marginBottom: 10 }}>{c.creditHint}</Txt>
      <View>
        <Button title={creditOf(credits[d.id]) ? `${c.resolveDispute} + ${money(creditOf(credits[d.id])!)}` : c.resolveDispute} variant="outline" icon="checkmark-done-outline" loading={busy === d.id}
          disabled={busy !== null || (drafts[d.id] ?? '').trim().length < 5 || creditOf(credits[d.id]) === undefined} onPress={() => resolve(d.id)} />
      </View>
    </Card>)}
  </>;
}
