// One shop order, for the shop (MER-01, MER-03, DLV-04..08, DLV-13): accept with preparation minutes or decline with a reason,
// start preparing, record each weighed line's actual weight, substitute or remove a missing item (the customer's choice decides
// whether they are asked), record the packing, then mark ready and show the pickup code to the captain, large and digit by digit.
import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api, useApi } from '../../../api';
import { isolate, merchantRejects, type MerchantItem, type Order, type ShopLine } from '../../../model';
import { qtyLabel, ShopLines, useCountdown } from '../../../shop-ui';
import { Button, Card, Choices, confirm, ErrorText, Field, fill, Header, Loading, palette, Row, Screen, Section, Stepper, Txt, useCopy } from '../../../ui';

export default function MerchantOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, language, money, rtl, err } = useCopy();
  const { data: order, error, reload, setData } = useApi<Order>(`/orders/${Number(id)}`, 10_000);
  const catalogue = useApi<{ items: MerchantItem[] }>('/merchant/catalogue');
  const [prep, setPrep] = useState(20);
  const [reject, setReject] = useState<(typeof merchantRejects)[number] | null>(null); // never pre-selected: the reason decides DLV-23 money
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [grams, setGrams] = useState('');
  const [substitute, setSubstitute] = useState<string>('');
  const [packing, setPacking] = useState<{ sealed: boolean; lineIds: number[] }[]>([{ sealed: true, lineIds: [] }]);
  const clock = useCountdown(order?.status === 'requested' && order.shop && !order.shop.state ? order.shop.acceptDeadline : null, c.shopAcceptLeft);
  if (!order?.shop) return <Screen><Header title={c.merchantMode} back /><Loading failed={!!error} onRetry={reload} /></Screen>;
  const s = order.shop;
  const live = s.lines.filter(l => !l.removed);
  async function act(key: string, path: string, body: object = {}) {
    if (busy) return;
    setBusy(key); setActionError('');
    try { setData(await api<Order>(path, body)); setEditing(null); setGrams(''); setSubstitute(''); }
    catch (e) { setActionError(err(e)); }
    finally { setBusy(''); }
  }
  const code = `W-${String(order.id).padStart(5, '0')}`;
  const name = (l: Pick<ShopLine, 'nameAr' | 'nameEn'>) => language === 'ar' ? l.nameAr : l.nameEn;
  const missingWeight = live.filter(l => l.byWeight && l.finalAgorot == null);
  const packingOk = packing.length > 0 && (packing.some(p => p.sealed) || live.every(l => packing.some(p => !p.sealed && p.lineIds.includes(l.id))));
  const readyReason = s.change ? c.err_change_pending : missingWeight.length ? fill(c.merchantWeighFirst, { items: missingWeight.map(name).join('، ') }) : !packingOk ? c.err_packing_required : '';
  const step = order.status === 'cancelled' ? (s.cancelReason ? c[`shopCancel_${s.cancelReason}`] : c.cancelled)
    : order.status === 'returning' ? c.merchantReturning : s.state ? c[`merchantState_${s.state}`] : c.merchantStateNew;
  return <Screen onRefresh={reload}>
    <Header title={code} back subtitle={step} />
    {!s.state && order.status === 'requested' && <Card tone="clay">
      <Txt variant="label">{c.merchantStateNew}</Txt>
      <Txt>{clock.left === 0 ? c.shopAcceptExpired : fill(c.shopAcceptTimer, { t: clock.text })}</Txt>
      <Txt variant="label" style={{ marginTop: 8 }}>{c.merchantPrepMinutes}</Txt>
      <Stepper value={prep} min={5} max={120} label={c.merchantPrepMinutes} onChange={n => setPrep(Math.round(n / 5) * 5 || 5)} />
      <Button title={c.merchantAccept} icon="checkmark" loading={busy === 'accept'} disabled={clock.left === 0} reason={clock.left === 0 ? c.shopAcceptExpired : undefined} onPress={() => act('accept', `/merchant/orders/${order.id}/accept`, { prepMinutes: prep })} />
      {!s.acceptExtended && <Button title={c.shopAddTime} variant="ghost" loading={busy === 'extend'} onPress={() => act('extend', `/merchant/orders/${order.id}/extend`)} />}
      <Txt variant="label" style={{ marginTop: 8 }}>{c.merchantRejectWhy}</Txt>
      <Choices label={c.merchantRejectWhy} value={reject ?? ''} onChange={k => setReject(k || null)} items={merchantRejects.map(k => ({ key: k, label: c[`merchantReject_${k}`] }))} />
      <Button title={c.merchantReject} variant="danger" loading={busy === 'reject'} disabled={!reject} reason={reject ? undefined : c.merchantRejectChoose}
        onPress={() => reject && confirm(c.merchantRejectConfirm, () => act('reject', `/merchant/orders/${order.id}/reject`, { reason: reject }), c.merchantReject, c.cancel)} />
    </Card>}
    {s.state === 'accepted' && <Button title={c.merchantStartPreparing} icon="construct-outline" loading={busy === 'prep'} onPress={() => act('prep', `/merchant/orders/${order.id}/preparing`)} />}
    {s.handoverException && s.state === 'preparing' && <Card tone="clay"><Txt>{fill(c.merchantFixHandover, { problem: c[`handover_${s.handoverException}`] })}</Txt></Card>}
    {s.change && <Card tone="muted"><Txt>{c.merchantWaitingCustomer}</Txt></Card>}
    <Card>
      <Section title={c.shopItems} />
      {live.map(l => <View key={l.id} style={{ borderTopWidth: 1, borderTopColor: palette.line, paddingVertical: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt style={{ flex: 1 }}>{`${rtl ? '\u200f' : '\u200e'}${isolate(name(l))} ${qtyLabel(l.qtyMilli, l.byWeight, c)} · ${c[`shopPolicy_${l.policy}`]}`}</Txt>
          <Txt style={{ writingDirection: 'ltr' }}>{money((l.finalAgorot ?? l.estimateAgorot) / 100)}</Txt>
        </Row>
        {s.state === 'preparing' && !s.change && editing !== l.id && <Button title={c.merchantEditLine} size="sm" variant="ghost" label={fill(c.merchantEditLineOf, { item: name(l) })} onPress={() => setEditing(l.id)} />}
        {editing === l.id && <View style={{ marginTop: 6 }}>
          {l.byWeight && <>
            <Field label={fill(c.merchantActualWeight, { item: name(l) })} value={grams} onChangeText={t => setGrams(t.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" />
            <Button title={c.merchantSaveWeight} size="sm" disabled={!grams} loading={busy === `w${l.id}`} onPress={() => act(`w${l.id}`, `/merchant/orders/${order.id}/lines/${l.id}`, { weightGrams: Number(grams) })} />
          </>}
          {l.policy !== 'remove' && <>
            <Txt variant="label" style={{ marginTop: 6 }}>{c.merchantSubstitute}</Txt>
            <Choices label={c.merchantSubstitute} value={substitute} onChange={setSubstitute}
              items={(catalogue.data?.items ?? []).filter(i => i.available && i.id !== l.itemId).map(i => ({ key: String(i.id), label: `${name(i)} ${money(i.priceAgorot / 100)}` }))} />
            <Button title={l.policy === 'ask_first' ? c.merchantAskCustomer : c.merchantSubstituteSave} size="sm" disabled={!substitute} loading={busy === `s${l.id}`}
              onPress={() => act(`s${l.id}`, `/merchant/orders/${order.id}/lines/${l.id}`, { substituteItemId: Number(substitute) })} />
          </>}
          <Button title={c.merchantRemoveLine} size="sm" variant="danger" loading={busy === `r${l.id}`}
            onPress={() => confirm(fill(c.merchantRemoveConfirm, { item: name(l) }), () => act(`r${l.id}`, `/merchant/orders/${order.id}/lines/${l.id}`, { remove: true }), c.merchantRemoveLine, c.cancel)} />
          <Button title={c.cancel} size="sm" variant="ghost" onPress={() => setEditing(null)} />
        </View>}
      </View>)}
      <View style={{ marginTop: 8 }}><ShopLines order={order} totalsOnly /></View>
    </Card>
    {s.state === 'preparing' && <Card>
      <Section title={c.merchantPacking} />
      <Txt variant="caption">{c.merchantPackingHint}</Txt>
      {packing.map((p, i) => <View key={i} style={{ marginTop: 8 }}>
        <Choices label={fill(c.merchantPackageN, { n: i + 1 })} value={p.sealed ? 'sealed' : 'open'}
          onChange={k => setPacking(packing.map((x, j) => j === i ? { sealed: k === 'sealed', lineIds: k === 'sealed' ? [] : x.lineIds } : x))}
          items={[{ key: 'sealed', label: fill(c.merchantSealed, { n: i + 1 }) }, { key: 'open', label: fill(c.merchantOpenBag, { n: i + 1 }) }]} />
        {!p.sealed && live.map(l => <Button key={l.id} size="sm" variant={p.lineIds.includes(l.id) ? 'soft' : 'ghost'} icon={p.lineIds.includes(l.id) ? 'checkbox-outline' : 'square-outline'}
          title={name(l)} onPress={() => setPacking(packing.map((x, j) => j === i ? { ...x, lineIds: x.lineIds.includes(l.id) ? x.lineIds.filter(y => y !== l.id) : [...x.lineIds, l.id] } : x))} />)}
      </View>)}
      <Row style={{ marginTop: 8, marginBottom: 16 }}>{/* clear of the primary below: the two touched */}
        <Button title={c.merchantAddPackage} size="sm" variant="outline" onPress={() => setPacking([...packing, { sealed: true, lineIds: [] }])} />
        {packing.length > 1 && <Button title={c.merchantRemovePackage} size="sm" variant="ghost" onPress={() => setPacking(packing.slice(0, -1))} />}
      </Row>
      <Button title={c.merchantReady} icon="bag-check-outline" loading={busy === 'ready'} disabled={!!readyReason} reason={readyReason || undefined}
        onPress={() => act('ready', `/merchant/orders/${order.id}/ready`, { packages: packing })} />
    </Card>}
    {s.pickupCode && (s.state === 'ready' || order.status === 'at_pickup') && <Card tone="olive">
      <Txt variant="label">{c.merchantShowCode}</Txt>
      <Txt variant="h1" selectable accessibilityLabel={fill(c.merchantCodeSpoken, { code: s.pickupCode.split('').join(' ') })} style={{ writingDirection: 'ltr', letterSpacing: 8, textAlign: 'center' }}>{s.pickupCode}</Txt>
    </Card>}
    {s.returnCode && <Card tone="clay">
      <Txt variant="label">{c.merchantReturnCode}</Txt>
      <Txt variant="h1" selectable accessibilityLabel={fill(c.merchantCodeSpoken, { code: s.returnCode.split('').join(' ') })} style={{ writingDirection: 'ltr', letterSpacing: 8, textAlign: 'center' }}>{s.returnCode}</Txt>
    </Card>}
    {['completed', 'returned'].includes(order.status) && s.customerRatingByMerchant == null && <RateCustomer order={order} onDone={setData} />}
    <ErrorText>{actionError}</ErrorText>
  </Screen>;
}

function RateCustomer({ order, onDone }: { order: Order; onDone: (o: Order) => void }) {
  const { c, err } = useCopy();
  const [error, setError] = useState('');
  return <Card>
    <Txt variant="label">{c.merchantRateCustomer}</Txt>
    <Row style={{ marginTop: 4, flexWrap: 'wrap' }}>{[1, 2, 3, 4, 5].map(n => <Button key={n} size="sm" variant="ghost" title={String(n)} label={fill(c.shopStars, { n })}
      onPress={async () => { try { onDone(await api<Order>(`/orders/${order.id}/shop/rate`, { rating: n })); } catch (e) { setError(err(e)); } }} />)}</Row>
    <ErrorText>{error}</ErrorText>
  </Card>;
}
