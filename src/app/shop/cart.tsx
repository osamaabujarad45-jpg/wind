// Cart and checkout (DLV-02..05, BOOK-02/03): one shop; a substitution choice per line; the agreed limit for weighed goods;
// goods, delivery fee and service fee as their own lines; cash named as the method; the drop-off pin and a landmark note.
// The place button says why it is disabled (A11Y-07), and a failed place keeps the cart (A11Y-14).
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, ApiError, errorCode, storage } from '../../api';
import { apiSessionRevision } from '../../api-client';
import { pendingOutcome } from '../../booking';
import { basketIdentity, newShopCheckout, readShopCheckout, shopCheckoutKey, type ShopCheckout } from '../../shop-checkout';
import { city, goodsCapFor, shopPolicies, type Order, type Point, type ShopPolicy } from '../../model';
import PinSheet from '../../pin-sheet';
import { useSession } from '../../session';
import { cartGoods, clearCart, setPolicy, setQuantity, storedCart, useCart } from '../../shop-cart';
import { QtyControl } from '../../shop-ui';
import { Button, Card, Choices, Empty, ErrorText, Field, fill, Header, palette, Row, Screen, Section, Txt, useCopy } from '../../ui';

const limits = [0, 0.1, 0.2] as const;

export default function ShopCart() {
  const { c, language, money } = useCopy();
  const { me } = useSession();
  const { changes } = useLocalSearchParams<{ changes?: string }>();
  const cart = useCart();
  const [limit, setLimit] = useState<(typeof limits)[number]>(0.1);
  const [point, setPoint] = useState<Point | null>(null);
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState('');
  const [contact, setContact] = useState(me?.user.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = me?.user.role === 'customer' ? shopCheckoutKey(me.user.id) : null;
  const [pending, setPending] = useState<ShopCheckout | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const placing = useRef(false);
  const visible = useRef(false);
  const finish = useCallback(async (command: ShopCheckout, orderId: number, current: () => boolean) => {
    if (!key || !current()) return;
    const contents = await storedCart(); // the persisted basket, not this tab's copy (review M2)
    if (!current()) return;
    if (contents && basketIdentity(contents) === command.basket) await clearCart(true);
    if (!current()) return;
    await storage.set(key, null, true);
    if (current() && visible.current) router.replace(`/order/${orderId}`);
  }, [key]);
  const check = useCallback(async (focused: () => boolean = () => true) => {
    if (!key) return;
    const revision = apiSessionRevision(), current = () => focused() && revision === apiSessionRevision();
    try { await storage.exclusive(async () => {
      if (!current()) return;
      let command: ShopCheckout | null;
      try { command = readShopCheckout(await storage.get(key, true)); }
      catch { if (current()) setError(c.bookingStorageError); return; }
      if (!current()) return;
      setLoadedKey(key); setPending(command);
      if (!command) return;
      try {
        const answer = pendingOutcome(await api<unknown>(`/orders/commands/${command.requestId}`), command);
        if (!current()) return;
        if (answer.state === 'present') await finish(command, answer.orderId, current);
        if (answer.state === 'absent') {
          await storage.set(key, null, true);
          if (current()) { setPending(null); setError(''); }
        }
      } catch { /* Keep the command until an authoritative receipt can be read. */ }
    }, key); } catch { if (current()) setError(c.bookingStorageError); }
  }, [key, finish, c.bookingStorageError]);
  useFocusEffect(useCallback(() => {
    let focused = true;
    visible.current = true;
    const run = () => { if (!placing.current) void check(() => focused); };
    run();
    const timer = setInterval(run, 15_000);
    return () => { visible.current = false; focused = false; clearInterval(timer); };
  }, [check]));
  if (!key || loadedKey !== key || pending) return <Screen>
    <Header title={c.shopCart} back />
    {loadedKey === key && pending && <Card><Section title={c.bookingPending} /><Txt>{c.bookingRecoveryWait}</Txt></Card>}
    <ErrorText>{error}</ErrorText>
    {key && <Button title={c.retry} variant="soft" disabled={busy} onPress={() => { void check(() => visible.current); }} />}
    {key && <Button title={c.orders} variant="ghost" onPress={() => router.replace('/(customer)/orders')} />}
  </Screen>;
  if (!cart) return <Screen><Header title={c.shopCart} back /><Empty icon="basket-outline" title={c.shopCartEmpty} action={<Button title={c.shopBrowse} onPress={() => router.replace('/shop')} />} /></Screen>;
  const goods = cartGoods(cart);
  const short = Math.max(0, cart.minOrderAgorot - goods);
  const fees = cart.deliveryFeeAgorot + cart.serviceFeeAgorot;
  const cap = goodsCapFor(goods, limit);
  const weighed = cart.lines.some(l => l.byWeight);
  const reason = short > 0 ? fill(c.shopBelowMinimum, { r: money(short / 100) }) : !point ? c.shopPinNeeded : note.trim().length < 3 ? c.shopNoteNeeded : '';
  const shopInfo = { merchantId: cart.merchantId, merchantName: cart.merchantName, city: cart.city, minOrderAgorot: cart.minOrderAgorot,
    deliveryFeeAgorot: cart.deliveryFeeAgorot, serviceFeeAgorot: cart.serviceFeeAgorot };
  async function place() {
    if (!key || !cart || placing.current || reason) return;
    const revision = apiSessionRevision(), current = () => revision === apiSessionRevision();
    placing.current = true;
    setBusy(true); setError('');
    try {
      await storage.exclusive(async () => {
        if (!current()) return;
        const saved = readShopCheckout(await storage.get(key, true));
        if (!current()) return;
        if (saved) { setPending(saved); return; }
        const command = newShopCheckout(cart);
        await storage.set(key, JSON.stringify(command), true);
        if (!current()) return;
        setPending(command);
        let order: Order;
        try {
          order = await api<Order>('/orders', { service: 'shop', merchantId: cart.merchantId,
            requestId: command.requestId, commandExpiresAt: command.commandExpiresAt, expectedGoodsAgorot: goods, agreeLimit: limit,
            lines: cart.lines.map(l => ({ itemId: l.itemId, qtyMilli: l.qtyMilli, policy: l.policy })),
            dropoffCity: cart.city, dropoffPoint: point, dropoffNote: note.trim(), contact });
        } catch (e) {
          if (!current()) return;
          const code = errorCode(e);
          if (e instanceof ApiError && e.status && e.status < 500 && ![401, 408, 426, 429].includes(e.status) && code !== 'idempotency_conflict') {
            await storage.set(key, null, true);
            if (current()) setPending(null);
          }
          if (current()) setError(c[`err_${code}` as keyof typeof c] ?? c.err_generic);
          return;
        }
        await finish(command, order.id, current);
      }, key);
    } catch { if (current()) setError(c.bookingStorageError); }
    finally { placing.current = false; setBusy(false); }
  }
  const footer = <Button title={fill(c.shopPlace, { r: money((goods + fees) / 100) })} icon="checkmark" loading={busy} disabled={!!reason} reason={reason || undefined} onPress={place} />;
  return <Screen footer={footer}>
    <Header title={c.shopCart} back subtitle={cart.merchantName} />
    {!!changes && <Card tone="warn"><Txt variant="label">{c.shopAgainChanged}</Txt><Txt style={{ marginTop: 4 }}>{changes}</Txt></Card>}
    <Card>
      <Section title={c.shopItems} />
      {cart.lines.map(l => {
        const name = language === 'ar' ? l.nameAr : l.nameEn;
        return <View key={l.itemId}>
          <Row style={{ justifyContent: 'space-between', paddingTop: 10 }}>
            <Txt style={{ flex: 1 }}>{name}{l.byWeight ? ` · ${c.shopEstimateShort}` : ''}</Txt>
            <QtyControl item={l} qtyMilli={l.qtyMilli} name={name} onChange={q => setQuantity(shopInfo, { id: l.itemId, section: '', nameAr: l.nameAr, nameEn: l.nameEn, priceAgorot: l.unitAgorot, byWeight: l.byWeight, available: true }, q)} />
          </Row>
          <Txt variant="caption" style={{ marginTop: 4 }}>{fill(c.shopIfMissing, { item: name })}</Txt>
          <Choices label={fill(c.shopIfMissing, { item: name })} value={l.policy} onChange={(p: ShopPolicy) => setPolicy(l.itemId, p)}
            items={shopPolicies.map(p => ({ key: p, label: c[`shopPolicy_${p}`] }))} />
        </View>;
      })}
    </Card>
    {weighed && <Card>
      <Section title={c.shopAgreedTitle} />
      <Txt variant="caption">{c.shopAgreedHint}</Txt>
      <Choices label={c.shopAgreedTitle} value={String(limit) as never} onChange={(k: string) => setLimit(Number(k) as (typeof limits)[number])}
        items={limits.map(l => ({ key: String(l), label: l === 0 ? c.shopAgreedExact : fill(c.shopAgreedUpTo, { p: Math.round(l * 100) }) }))} />
      <Txt variant="caption" style={{ marginTop: 4 }}>{fill(c.shopAgreedLimit, { r: money(cap / 100) })}</Txt>
    </Card>}
    <Card>
      <Section title={c.shopDeliverTo} />
      <Txt variant="caption">{fill(c.shopSameTown, { town: city(cart.city as never)[language] })}</Txt>
      <Button title={point ? c.shopPinChange : c.shopPinSet} variant={point ? 'outline' : 'soft'} icon="location-outline" onPress={() => setPicking(true)} />
      <Field label={c.shopLandmark} value={note} onChangeText={setNote} placeholder={c.landmarkHint} maxLength={200} />
      <Field label={c.contactPhone} value={contact} onChangeText={setContact} keyboardType="phone-pad" autoComplete="tel" />
    </Card>
    <Card>
      <Row style={{ justifyContent: 'space-between' }}><Txt>{c.shopGoodsEstimate}</Txt><Txt style={{ writingDirection: 'ltr' }}>{money(goods / 100)}</Txt></Row>
      <Row style={{ justifyContent: 'space-between' }}><Txt>{c.shopDeliveryFeeLine}</Txt><Txt style={{ writingDirection: 'ltr' }}>{money(cart.deliveryFeeAgorot / 100)}</Txt></Row>
      {cart.serviceFeeAgorot > 0 && <Row style={{ justifyContent: 'space-between' }}><Txt>{c.shopServiceFee}</Txt><Txt style={{ writingDirection: 'ltr' }}>{money(cart.serviceFeeAgorot / 100)}</Txt></Row>}
      <Row style={{ justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: palette.line, marginTop: 6, paddingTop: 6 }}>
        <Txt variant="label">{c.shopCashAtDoor}</Txt><Txt variant="label" style={{ writingDirection: 'ltr' }}>{money((goods + fees) / 100)}</Txt></Row>
      <Txt variant="caption" style={{ marginTop: 6 }}>{c.shopCashOnly}</Txt>
    </Card>
    <ErrorText>{error}</ErrorText>
    {picking && <PinSheet title={c.shopPinSet} hint={c.shopPinHint} start={point ?? city(cart.city as never)} onClose={() => setPicking(false)}
      onConfirm={p => { setPoint(p); setPicking(false); }} />}
  </Screen>;
}
