// Shop delivery pieces shared by the order screen, the cart and merchant mode. Prices and codes stay left-to-right in Arabic;
// every timer is announced in words (A11Y-08) and every state names its actor (DLV-09).
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from './api';
import { handoverExceptions, hhmm, isolate, latinDigits, ltr, minorFromText, type Merchant, type MerchantItem, type Order, type ShopLine, type ShopPolicy } from './model';
import { currentCart, replaceCart } from './shop-cart';
import { newRequestId } from './booking';
import { Button, Card, Choices, confirm, ErrorText, Field, fill, haptic, maxScale, palette, Row, Section, Txt, useCopy } from './ui';

const WEIGHT_STEP = 250; // grams

/** Today's opening hours in words, or null when the shop keeps none (the list and the closed shop's page). */
// ponytail: the device's weekday; the pilot town and its customers share one time zone.
export function todayHours(m: Pick<Merchant, 'hours' | 'open'>, c: Record<string, string>) {
  if (!m.hours.length) return null;
  const ranges = m.hours.filter(h => h.weekday === new Date().getDay()).map(h => ltr(`${hhmm(h.openMinute)}–${hhmm(h.closeMinute)}`)); // ltr: RTL would read the range backwards
  // An open shop with no range today is in last night's overnight range, so it never says "Closed today".
  return ranges.length ? fill(c.shopHoursToday, { h: ranges.join('، ') }) : m.open ? null : c.shopClosedToday;
}

/** "1.5 kg" or "× 2", in the reader's language. */
export function qtyLabel(qtyMilli: number, byWeight: boolean, c: Record<string, string>) {
  return byWeight ? fill(c.shopKg, { n: (qtyMilli / 1000).toFixed(qtyMilli % 1000 ? (qtyMilli % 100 ? 2 : 1) : 0) }) : fill(c.shopTimes, { n: qtyMilli / 1000 });
}

export function QtyControl({ item, qtyMilli, name, onChange }: { item: Pick<MerchantItem, 'byWeight'>; qtyMilli: number; name: string; onChange: (q: number) => void }) {
  const { c, row } = useCopy();
  const step = item.byWeight ? WEIGHT_STEP : 1000, max = item.byWeight ? 50_000 : 99_000, min = item.byWeight ? 250 : 1000;
  const shown = qtyLabel(qtyMilli, item.byWeight, c);
  useEffect(() => { if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(`${name}: ${shown}`); }, [name, shown]);
  const key = (d: number, icon: 'remove' | 'add' | 'trash-outline', label: string, disabled = false) =>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${name}`} disabled={disabled} accessibilityState={{ disabled }}
      onPress={() => { haptic.tap(); onChange(qtyMilli + d < min ? 0 : Math.min(max, qtyMilli + d)); }}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: palette.muted }}>
      <Ionicons name={icon} size={18} color={disabled ? palette.faint : palette.ink} />
    </Pressable>;
  return <View style={{ flexDirection: row, alignItems: 'center', gap: 6 }}>
    {key(-step, qtyMilli - step < min ? 'trash-outline' : 'remove', qtyMilli - step < min ? c.shopRemove : c.stepperDecrease)}
    <Text maxFontSizeMultiplier={maxScale} accessibilityLabel={`${name} ${shown}`} style={{ minWidth: 64, textAlign: 'center', fontWeight: '600', color: palette.ink, writingDirection: 'ltr' }}>{shown}</Text>
    {key(step, 'add', c.stepperIncrease, qtyMilli + step > max)}
  </View>;
}

/** Remaining minutes and seconds, announced once a minute and at 60 s and 15 s (A11Y-08). */
export function useCountdown(until: number | null, label: string, expired?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!until) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [until]);
  const left = until ? Math.max(0, Math.round((until - now) / 1000)) : 0;
  useEffect(() => {
    if (!until || Platform.OS === 'web') return;
    if (left > 0 && (left % 60 === 0 || left === 15)) AccessibilityInfo.announceForAccessibility(`${label} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    else if (left === 0 && expired) AccessibilityInfo.announceForAccessibility(expired); // A11Y-08: say the timer acted, once
  }, [left, until, label, expired]);
  return { left, text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` };
}

const lineName = (l: Pick<ShopLine, 'nameAr' | 'nameEn'>, language: string) => language === 'ar' ? l.nameAr : l.nameEn;

/** The basket with each line's price, estimate or final, and the money lines (DLV-03): goods, delivery fee, service fee, cash at the door. */
export function ShopLines({ order, totalsOnly = false }: { order: Order; totalsOnly?: boolean }) {
  const { c, language, money, rtl } = useCopy();
  const s = order.shop!;
  return <>
    {!totalsOnly && s.lines.filter(l => !l.removed).map(l => <Row key={l.id} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
      <Txt style={{ flex: 1 }}>{`${rtl ? '\u200f' : '\u200e'}${isolate(lineName(l, language))} ${qtyLabel(l.qtyMilli, l.byWeight, c)}`}{l.substituteFor ? ` · ${c.shopSubstitute}` : ''}</Txt>
      <Txt style={{ writingDirection: 'ltr' }}>{`${money((l.finalAgorot ?? l.estimateAgorot) / 100)}${l.byWeight && l.finalAgorot == null ? ` ${c.shopEstimateShort}` : ''}`}</Txt>
    </Row>)}
    {!totalsOnly && s.lines.some(l => l.removed && !s.lines.some(x => x.substituteFor === l.id)) &&
      <Txt variant="caption" style={{ marginTop: 4 }}>{fill(c.shopRemovedLines, { items: s.lines.filter(l => l.removed && !s.lines.some(x => x.substituteFor === l.id)).map(l => lineName(l, language)).join('، ') })}</Txt>}
    <View style={{ borderTopWidth: 1, borderTopColor: palette.line, marginTop: 8, paddingTop: 8, gap: 4 }}>
      <Money label={c.shopGoods} value={money(s.goodsAgorot / 100)} />
      <Money label={c.shopDeliveryFeeLine} value={money(s.deliveryFeeAgorot / 100)} />
      {s.serviceFeeAgorot > 0 && <Money label={c.shopServiceFee} value={money(s.serviceFeeAgorot / 100)} />}
      <Money label={c.shopCashAtDoor} value={money(s.cashAgorot / 100)} strong />
      {s.state !== 'handed_over' && order.status !== 'completed' && <Txt variant="caption">{fill(c.shopAgreedLimit, { r: money(s.goodsCapAgorot / 100) })}</Txt>}
    </View>
  </>;
}
function Money({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <Row style={{ justifyContent: 'space-between' }}>
    <Txt variant={strong ? 'label' : 'body'}>{label}</Txt>
    <Txt variant={strong ? 'label' : 'body'} style={{ writingDirection: 'ltr' }}>{value}</Txt>
  </Row>;
}

/** The customer's part of a shop order: the actor-named step, the consent card, cancel while free, rating and order again. */
export function ShopCustomerPanel({ order, onChange }: { order: Order; onChange: (o: Order) => void }) {
  const { c, language, money, err } = useCopy();
  const s = order.shop!;
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const consent = useCountdown(s.change?.expiresAt ?? null, c.shopConsentLeft, c.shopConsentExpired);
  async function act(key: string, path: string, body: object = {}) {
    if (busy) return;
    setBusy(key); setError('');
    try { onChange(await api<Order>(path, body)); haptic.success(); }
    catch (e) { setError(err(e)); }
    finally { setBusy(''); }
  }
  async function again() {
    setBusy('again'); setError('');
    try {
      const r = await api<{ merchant: { id: number; name: string; city: string; minOrderAgorot: number; deliveryFeeAgorot: number; serviceFeeAgorot: number };
        lines: { itemId: number; qtyMilli: number; policy: ShopPolicy }[]; changes: { itemId: number; nameAr: string; nameEn: string; kind: string; toAgorot: number | null }[] }>(`/orders/${order.id}/shop/again`, {});
      const items = await api<{ items: MerchantItem[] }>(`/shop/merchants/${r.merchant.id}`);
      const rebuilt = { merchantId: r.merchant.id, merchantName: r.merchant.name, city: r.merchant.city, minOrderAgorot: r.merchant.minOrderAgorot,
        deliveryFeeAgorot: r.merchant.deliveryFeeAgorot, serviceFeeAgorot: r.merchant.serviceFeeAgorot,
        lines: r.lines.flatMap(l => { const i = items.items.find(x => x.id === l.itemId); return i ? [{ itemId: i.id, nameAr: i.nameAr, nameEn: i.nameEn, unitAgorot: i.priceAgorot, byWeight: i.byWeight, qtyMilli: l.qtyMilli, policy: l.policy }] : []; }) };
      const openCart = () => {
        replaceCart(rebuilt);
        router.push({ pathname: '/shop/cart', params: r.changes.length ? { changes: r.changes.map(x => `${language === 'ar' ? x.nameAr : x.nameEn}: ${x.kind === 'unavailable' ? c.shopNowUnavailable : money((x.toAgorot ?? 0) / 100)}`).join('\n') } : {} });
      };
      if (!rebuilt.lines.length) { setError(c.shopNoItems); return; }
      const existing = await currentCart();
      if (existing) confirm(fill(c.shopReplaceCart, { shop: existing.merchantName }), openCart, c.shopClearYes, c.cancel);
      else openCart();
    } catch (e) { setError(err(e)); }
    finally { setBusy(''); }
  }
  // After a failed delivery (DLV-20) the order status says where the goods are, not the last shop step.
  const step = order.status === 'cancelled' ? (s.cancelReason ? c[`shopCancel_${s.cancelReason}`] : c.cancelled)
    : order.status === 'on_hold' || order.status === 'returning' || order.status === 'returned' ? c[order.status]
    : !s.state ? c.shop_requested : order.status === 'completed' ? c.completed : c[`shop_${s.state}`];
  return <Card>
    <Section title={s.merchantName} />
    <Txt variant="label" accessibilityLabel={step} style={{ marginBottom: 6 }}>{step}</Txt>
    {!s.state && order.status === 'requested' && <AcceptClock until={s.acceptDeadline} />}
    {s.change && <Card tone="clay" style={{ marginTop: 8 }}>
      <Txt variant="label" header>{c.shopConsentTitle}</Txt>
      <Txt style={{ marginTop: 4 }}>{s.change.kind === 'weight'
        ? fill(c.shopConsentWeight, { item: lineName(s.change, language), from: money(s.change.fromAgorot / 100), to: money(s.change.toAgorot / 100) })
        : fill(c.shopConsentSub, { item: lineName(s.change, language), to: money(s.change.toAgorot / 100) })}</Txt>
      <Txt style={{ marginTop: 4 }}>{fill(c.shopConsentTotal, { r: money(s.change.goodsAfterAgorot / 100) })}</Txt>
      <Txt variant="caption" style={{ marginTop: 4 }}>{consent.left === 0 ? c.shopConsentExpired : fill(c.shopConsentTimer, { t: consent.text })}</Txt>
      <Row style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <Button title={c.shopApprove} loading={busy === 'approve'} disabled={consent.left === 0} reason={consent.left === 0 ? c.shopConsentExpired : undefined} onPress={() => act('approve', `/orders/${order.id}/shop/consent`, { changeId: s.change!.id, decision: 'approve' })} />
        <Button title={c.shopDecline} variant="outline" loading={busy === 'decline'} disabled={consent.left === 0} onPress={() => act('decline', `/orders/${order.id}/shop/consent`, { changeId: s.change!.id, decision: 'decline' })} />
        {!s.change.extended && consent.left > 0 && <Button title={c.shopAddTime} variant="ghost" loading={busy === 'extend'} onPress={() => act('extend', `/orders/${order.id}/shop/consent`, { changeId: s.change!.id, extend: true })} />}
      </Row>
    </Card>}
    <View style={{ marginTop: 8 }}><ShopLines order={order} /></View>
    {s.canCancel && <Button title={c.cancelOrder} variant="danger" loading={busy === 'cancel'}
      onPress={() => confirm(c.shopCancelFree, () => act('cancel', `/orders/${order.id}/cancel`), c.cancelOrder, c.keepOrder)} />}
    {!s.canCancel && s.state === 'accepted' && <Txt variant="caption" style={{ marginTop: 6 }}>{c.shopCancelSupport}</Txt>}
    {order.status === 'completed' && s.merchantRating == null && <View style={{ marginTop: 8 }}>
      <Txt variant="label">{fill(c.shopRateMerchant, { shop: s.merchantName })}</Txt>
      <Row style={{ marginTop: 4 }}>{[1, 2, 3, 4, 5].map(n => <Pressable key={n} accessibilityRole="button" accessibilityLabel={fill(c.shopStars, { n })}
        onPress={() => act('rate', `/orders/${order.id}/shop/rate`, { rating: n })} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="star-outline" size={24} color={palette.olive} /></Pressable>)}</Row>
    </View>}
    {['completed', 'cancelled', 'returned'].includes(order.status) && <Button title={c.shopOrderAgain} variant="soft" icon="refresh" loading={busy === 'again'} onPress={again} />}
    <ErrorText>{error}</ErrorText>
  </Card>;
}

function AcceptClock({ until }: { until: number }) {
  const { c } = useCopy();
  const t = useCountdown(until, c.shopAcceptLeft, c.shopAcceptExpired);
  return <Txt variant="caption">{t.left === 0 ? c.shopAcceptExpired : fill(c.shopAcceptTimer, { t: t.text })}</Txt>;
}

/** The captain at the shop (DLV-13): check the packages and bags, then enter the shop's code, or report what is wrong. */
export function ShopHandover({ order, onChange }: { order: Order; onChange: (o: Order) => void }) {
  const { c, language, err } = useCopy();
  const s = order.shop!;
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<(typeof handoverExceptions)[number]>('missing_item');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // One request id per distinct attempt: a lost acknowledgement replays it instead of applying the handover twice.
  const attempt = useRef<{ key: string; id: string } | null>(null);
  async function send(check: { result: 'ok' } | { result: 'exception'; exception: string }) {
    if (busy) return;
    setBusy(check.result); setError('');
    try {
      const key = JSON.stringify([order.id, check, check.result === 'ok' ? latinDigits(code) : '']);
      if (attempt.current?.key !== key) attempt.current = { key, id: newRequestId() };
      onChange(await api<Order>(`/orders/${order.id}/shop/handover`, { expectedStatus: 'at_pickup', requestId: attempt.current.id, check,
        ...(check.result === 'ok' && { code: latinDigits(code) }) }));
      attempt.current = null;
      haptic.success();
    } catch (e) { setError(err(e)); }
    finally { setBusy(''); }
  }
  if (s.state !== 'ready') return <Card tone="muted"><Txt>{s.handoverException ? fill(c.shopWaitFix, { problem: c[`handover_${s.handoverException}`] }) : c.shopWaitReady}</Txt></Card>;
  const packages = s.packages ?? [];
  return <Card>
    <Section title={c.shopCollectTitle} />
    <Txt>{fill(c.shopPackages, { n: packages.length, sealed: packages.filter(p => p.sealed).length })}</Txt>
    {packages.filter(p => !p.sealed).map(p => <Txt key={p.no} variant="caption" style={{ marginTop: 2 }}>{fill(c.shopOpenBag, { n: p.no,
      items: s.lines.filter(l => p.lineIds.includes(l.id)).map(l => lineName(l, language)).join('، ') })}</Txt>)}
    <Field label={c.shopPickupCode} value={code} onChangeText={t => setCode(latinDigits(t).replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" maxLength={4} />
    <Button title={c.shopCollected} icon="checkmark" loading={busy === 'ok'} disabled={code.length !== 4} reason={code.length !== 4 ? c.shopCodeNeeded : undefined}
      onPress={() => send({ result: 'ok' })} />
    <Txt variant="label" style={{ marginTop: 12 }}>{c.shopProblem}</Txt>
    <Choices label={c.shopProblem} value={problem} onChange={setProblem} items={handoverExceptions.map(k => ({ key: k, label: c[`handover_${k}`] }))} />
    <Button title={c.shopReportProblem} variant="outline" loading={busy === 'exception'} onPress={() => send({ result: 'exception', exception: problem })} />
    <ErrorText>{error}</ErrorText>
  </Card>;
}

/** Sealed packages are recorded intact or broken at each delivery attempt, before the code (DLV-14). */
export function SealToggles({ order, value, onChange }: { order: Order; value: Record<number, boolean>; onChange: (v: Record<number, boolean>) => void }) {
  const { c } = useCopy();
  const sealed = (order.shop?.packages ?? []).filter(p => p.sealed);
  if (!sealed.length) return null;
  return <View style={{ marginVertical: 8 }}>
    <Txt variant="label">{c.shopSealsTitle}</Txt>
    {sealed.map(p => <View key={p.no} style={{ marginTop: 6 }}>
      <Choices label={fill(c.shopSealOf, { n: p.no })} value={(value[p.no] === undefined ? '' : value[p.no] ? 'intact' : 'broken') as 'intact'}
        onChange={k => onChange({ ...value, [p.no]: k === 'intact' })} items={[{ key: 'intact', label: fill(c.shopSealIntact, { n: p.no }) }, { key: 'broken', label: fill(c.shopSealBroken, { n: p.no }) }]} />
    </View>)}
  </View>;
}
export const sealsBody = (order: Order, value: Record<number, boolean>) =>
  (order.shop?.packages ?? []).filter(p => p.sealed).map(p => ({ no: p.no, intact: value[p.no] === true }));
/** Every sealed package has been marked intact or broken by the captain. */
export const sealsReady = (order: Order, value: Record<number, boolean>) => (order.shop?.packages ?? []).filter(p => p.sealed).every(p => typeof value[p.no] === 'boolean');

/** Support's shop actions on one order (DLV-13, DLV-22, DLV-23, DLV-25): a typed cancel with a note, the fault result,
 * unsellable credit, a refund, and the audited pickup-code reset. The server enforces when each is allowed. */
export function ShopAdminPanel({ order, onChange }: { order: Order; onChange: (o: Order) => void }) {
  const { c, language, err } = useCopy();
  const s = order.shop!;
  const [reason, setReason] = useState<string>('operational');
  const [note, setNote] = useState('');
  const [fault, setFault] = useState<'merchant' | 'wind' | 'none'>('wind');
  const [line, setLine] = useState<string>(String(s.lines.find(l => !l.removed)?.id ?? ''));
  const [refund, setRefund] = useState('');
  const [refundId, setRefundId] = useState(newRequestId); // one id per refund, so a retry after a lost response pays once
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  async function act(key: string, path: string, body: object) {
    if (busy) return;
    setBusy(key); setError('');
    try { onChange(await api<Order>(path, body)); setNote(''); if (key === 'refund') { setRefund(''); setRefundId(newRequestId()); } }
    catch (e) { setError(err(e)); }
    finally { setBusy(''); }
  }
  const noteOk = note.trim().length >= 5;
  const refundMinor = minorFromText(refund), refundOk = refundMinor > 0;
  // The reasons the server allows at this stage (DLV-23), so support is never offered a cancel it will refuse.
  const cancels = (['customer_via_support_accepted', 'no_captain', 'operational', 'merchant_request', 'handover_exception_unresolved'] as const).filter(k =>
    k === 'customer_via_support_accepted' ? s.state === 'accepted'
    : k === 'no_captain' ? ['accepted', 'preparing', 'ready', 'awaiting_approval'].includes(s.state ?? '') && ['requested', 'searching'].includes(order.status)
    : k === 'handover_exception_unresolved' ? !!s.handoverOverdue
    : k === 'merchant_request' ? ['preparing', 'awaiting_approval', 'ready'].includes(s.state ?? '')
    : true);
  const before = ['requested', 'searching', 'assigned', 'at_pickup'].includes(order.status) && s.state !== 'handed_over';
  const after = ['returned', 'cancelled', 'completed', 'on_hold'].includes(order.status);
  return <Card>
    <Section title={c.adminShopActions} />
    <Txt variant="caption">{`${c.shopPickupCode}: ${s.pickupCode ?? '—'}`}</Txt>
    <Field label={c.adminNote} value={note} onChangeText={setNote} multiline maxLength={500} />
    {before && <>
      <Txt variant="label">{c.adminShopCancelWhy}</Txt>
      <Choices label={c.adminShopCancelWhy} value={cancels.some(k => k === reason) ? reason : 'operational'} onChange={setReason}
        items={cancels.map(k => ({ key: k, label: c[`adminCancel_${k}`] }))} />
      <Button title={c.adminShopCancel} variant="danger" size="sm" disabled={!noteOk} reason={noteOk ? undefined : c.adminNoteNeeded} loading={busy === 'cancel'}
        onPress={() => act('cancel', `/admin/orders/${order.id}/shop/cancel`, { reason: cancels.some(k => k === reason) ? reason : 'operational', note: note.trim() })} />
      <Button title={c.adminShopResetPickup} variant="outline" size="sm" disabled={!noteOk} loading={busy === 'reset'}
        onPress={() => act('reset', `/admin/orders/${order.id}/shop/reset-pickup`, { reason: note.trim() })} />
      {/* DLV-13: past the shop's minutes, support removes the line at fault (DLV-06 re-runs) or cancels above. */}
      {s.handoverOverdue && <>
        <Txt variant="label">{c.adminShopHandoverOverdue}</Txt>
        <Choices label={c.adminShopRemoveLine} value={line} onChange={setLine} items={s.lines.filter(l => !l.removed).map(l => ({ key: String(l.id), label: lineName(l, language) }))} />
        <Button title={c.adminShopRemoveLine} size="sm" variant="outline" disabled={!line || !noteOk} reason={noteOk ? undefined : c.adminNoteNeeded} loading={busy === 'remove'}
          onPress={() => act('remove', `/admin/orders/${order.id}/shop/lines/${line}/remove`, { exceptionAt: s.handoverExceptionAt, note: note.trim() })} />
      </>}
    </>}
    {after && <>
      <Txt variant="label">{s.fault ? fill(c.adminShopFaultIs, { f: c[`adminFault_${s.fault}`] }) : c.adminShopFault}</Txt>
      {!s.fault && <>
        <Choices label={c.adminShopFault} value={fault} onChange={setFault} items={(['merchant', 'wind', 'none'] as const).map(k => ({ key: k, label: c[`adminFault_${k}`] }))} />
        <Button title={c.adminShopRecordFault} size="sm" disabled={!noteOk} loading={busy === 'fault'} onPress={() => act('fault', `/admin/orders/${order.id}/shop/fault`, { result: fault, note: note.trim() })} />
      </>}
      {s.fault && s.fault !== 'merchant' && order.status !== 'completed' && <>
        <Choices label={c.adminShopUnsellable} value={line} onChange={setLine} items={s.lines.filter(l => !l.removed).map(l => ({ key: String(l.id), label: lineName(l, language) }))} />
        <Button title={c.adminShopUnsellable} size="sm" variant="outline" disabled={!noteOk || !line} loading={busy === 'unsellable'}
          onPress={() => act('unsellable', `/admin/orders/${order.id}/shop/unsellable`, { lineId: Number(line), note: note.trim() })} />
      </>}
      {s.fault && s.fault !== 'none' && order.status === 'completed' && <>
        <Field label={c.adminShopRefund} value={refund} onChangeText={setRefund} keyboardType="decimal-pad" />
        <Button title={c.adminShopRecordRefund} size="sm" variant="outline" disabled={!noteOk || !refundOk}
          reason={!noteOk ? c.adminNoteNeeded : refund && !refundOk ? c.err_invalid_amount : undefined} loading={busy === 'refund'}
          onPress={() => act('refund', `/admin/orders/${order.id}/shop/refund`, { amountAgorot: refundMinor, reason: note.trim(), requestId: refundId })} />
      </>}
    </>}
    <ErrorText>{error}</ErrorText>
  </Card>;
}
