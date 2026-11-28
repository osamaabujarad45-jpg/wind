// Cart and checkout (DLV-02..05, BOOK-02/03): one shop; a substitution choice per line; the agreed limit for weighed goods;
// goods, delivery fee and service fee as their own lines; cash named as the method; the drop-off pin and a landmark note.
// The place button says why it is disabled (A11Y-07), and a failed place keeps the cart (A11Y-14).
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, ApiError, errorCode, storage, useApi } from '../../api';
import { apiSessionRevision, serverOffset } from '../../api-client';
import { pendingOutcome } from '../../booking';
import { basketIdentity, newShopCheckout, readShopCheckout, readShopDelivery, shopCheckoutBody, shopCheckoutKey, shopCheckoutLimits as limits, type ShopCheckout, type ShopDelivery } from '../../shop-checkout';
import { city, crowKm, goodsCapFor, isCity, isolate, normalizePhone, SERVICE_KM, shopPolicies, type CityId, type Merchant, type MerchantItem, type Order, type Places, type Point, type ShopPolicy } from '../../model';
import { readHomeDestination, shopAddressForOrder } from '../../personal-services';
import PinSheet from '../../pin-sheet';
import { recoveryStorage } from '../../recovery-storage';
import { useSession } from '../../session';
import { cartGoods, clearCart, refreshCart, setPolicy, setQuantity, storedCart, useCart } from '../../shop-cart';
import { QtyControl } from '../../shop-ui';
import { Button, Card, Choices, Empty, ErrorText, Field, fill, Header, Row, Screen, Section, Txt, useCopy } from '../../ui';
import { useTheme } from '../../theme-context';

const deliveryRecoveryMs = 60 * 60_000;
type CheckoutRecoveryAction = 'retry' | { reenterFor: string };
type DeliveryAddress = { point: Point | null; note: string };
type AccountDelivery = { accountId: number | null; address: DeliveryAddress };

export default function ShopCart() {
  const { palette } = useTheme();
  const { c, err, language, money } = useCopy();
  const { me } = useSession();
  const { changes, destinationOrder } = useLocalSearchParams<{ changes?: string; destinationOrder?: string }>();
  const cart = useCart();
  const accountId = me?.user.role === 'customer' ? me.user.id : null;
  const [shortcut] = useState(() => {
    const address = accountId !== null && destinationOrder ? readHomeDestination(accountId, `shop:${destinationOrder}`) : null;
    return address ? { accountId, destinationOrder, address } : null;
  });
  // Freeze the Home selection when this cart opens. Edits and recovered delivery details take precedence.
  const remembered = shortcut?.accountId === accountId && shortcut.destinationOrder === destinationOrder ? shortcut.address : null;
  const exactPath = accountId !== null && !remembered && destinationOrder && /^[1-9]\d{0,14}$/.test(destinationOrder)
    ? `/orders/${destinationOrder}` : null;
  const { data: selectedOrder, error: selectedError, reload: reloadSelectedOrder } = useApi<Order>(exactPath);
  const selectedAddress = remembered ?? shopAddressForOrder(selectedOrder, accountId);
  const preferred = selectedAddress?.point && selectedAddress.city === cart?.city && crowKm(city(selectedAddress.city), selectedAddress.point) <= SERVICE_KM
    ? selectedAddress : null;
  const [edit, setEdit] = useState<AccountDelivery | null>(null);
  const deliveryAddress = edit?.accountId === accountId ? edit.address : null;
  const setDeliveryAddress = useCallback((address: DeliveryAddress) => setEdit({ accountId, address }), [accountId]);
  const { point, note } = deliveryAddress ?? preferred ?? { point: null, note: '' };
  const [limit, setLimit] = useState<(typeof limits)[number]>(0.1);
  const [pinSelection, setPinSelection] = useState<AccountDelivery | null>(null);
  const pinAddress = pinSelection?.accountId === accountId ? pinSelection.address : null;
  const retrySelection = selectedError && !['not_found', 'forbidden', 'unauthorized', 'session_changed'].includes(selectedError);
  const defaultContact = me?.user.phone ?? '';
  const [contact, setContact] = useState(defaultContact);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cartNeedsRefresh, setCartNeedsRefresh] = useState(false);
  const key = accountId !== null ? shopCheckoutKey(accountId) : null;
  const [pending, setPending] = useState<ShopCheckout | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [reenterRequestId, setReenterRequestId] = useState<string | null>(null);
  const placing = useRef(false);
  const visible = useRef(false);
  const clearCheckout = useCallback(async (current: () => boolean, keepDraft = false) => {
    if (!key || !current()) return;
    await storage.set(key, null, true);
    if (!keepDraft && current()) await recoveryStorage.write('shop-checkout', null, 1).catch(() => {}); // encrypted and expiring even if removal fails
  }, [key]);
  const finish = useCallback(async (command: ShopCheckout, orderId: number, current: () => boolean) => {
    if (!key || !current()) return;
    const contents = await storedCart(true); // the persisted basket, not this tab's copy (review M2)
    if (!current()) return;
    if (contents && basketIdentity(contents) === command.basket) await clearCart(true);
    if (!current()) return;
    await clearCheckout(current);
    if (current() && visible.current) router.replace(`/order/${orderId}`);
  }, [key, clearCheckout]);
  const send = useCallback(async (command: ShopCheckout, delivery: ShopDelivery, current: () => boolean, recovering = false) => {
    if (!key || !current()) return;
    let order: Order;
    try { order = await api<Order>('/orders', shopCheckoutBody(command, delivery)); }
    catch (e) {
      if (!current()) return;
      const code = errorCode(e);
      // A new attempt's definitive refusal can release the form. Once the outcome is uncertain,
      // a retry can fail while the first POST is still in flight. Only the receipt check releases it.
      if (!recovering && e instanceof ApiError && e.status && e.status < 500 && ![401, 408, 426, 429].includes(e.status)
        && code !== 'idempotency_conflict' && code !== 'booking_command_expired') {
        await clearCheckout(current);
        if (current()) {
          setPending(null);
          setCartNeedsRefresh(code === 'price_changed' || code === 'unavailable_item');
        }
      }
      if (current()) setError(c[`err_${code}` as keyof typeof c] ?? c.err_generic);
      return;
    }
    await finish(command, order.id, current);
  }, [key, c, clearCheckout, finish]);
  const check = useCallback(async (focused: () => boolean, action?: CheckoutRecoveryAction) => {
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
      let answer: ReturnType<typeof pendingOutcome> = { state: 'unknown' };
      try {
        answer = pendingOutcome(await api<unknown>(`/orders/commands/${command.requestId}`), command);
      } catch { /* Keep the command until an authoritative receipt can be read. */ }
      if (!current()) return;
      if (answer.state !== 'absent') setReenterRequestId(null);
      if (answer.state === 'present') { await finish(command, answer.orderId, current); return; }
      if (answer.state === 'unknown' && (action !== 'retry' || Date.now() + serverOffset() >= command.commandExpiresAt)) return;
      // A confirmed-absent command older than the draft lifetime can release the form even if the ciphertext will not open.
      const draftExpired = answer.state === 'absent' && Date.now() + serverOffset() >= command.commandExpiresAt + deliveryRecoveryMs;
      const reenter = answer.state === 'absent' && typeof action === 'object' && action.reenterFor === command.requestId;
      let keepDraft = false;
      const savedDelivery = draftExpired ? null : await recoveryStorage.read('shop-checkout').catch((error: unknown) => {
        // The recovery store removes expired or invalid envelopes. Other read failures can be retried.
        if (error instanceof Error && error.message === 'recovery_record_unavailable') return null;
        // Re-entry can release a confirmed-absent command while leaving temporarily unreadable data until expiry.
        if (reenter) { keepDraft = true; return null; }
        if (current() && answer.state === 'absent') setReenterRequestId(command.requestId);
        throw error;
      });
      const delivery = readShopDelivery(savedDelivery, command.requestId);
      if (!current()) return;
      if (answer.state === 'absent') {
        const contents = delivery ? await storedCart(true) : null;
        if (!current()) return;
        const restored = delivery && contents && basketIdentity(contents) === command.basket ? delivery : null;
        await clearCheckout(current, keepDraft);
        if (!current()) return;
        setPending(null);
        setReenterRequestId(null);
        setDeliveryAddress({ point: restored?.dropoffPoint ?? null, note: restored?.dropoffNote ?? '' });
        setContact(restored?.contact ?? defaultContact); setLimit(restored?.agreeLimit ?? 0.1);
        setError(restored ? '' : c.shopRecoveryReenter);
      } else if (delivery && Date.now() + serverOffset() < command.commandExpiresAt) {
        setError('');
        await send(command, delivery, current, true);
      }
    }, key); } catch { if (current()) setError(c.bookingStorageError); }
  }, [key, clearCheckout, finish, send, defaultContact, setDeliveryAddress, c.bookingStorageError, c.shopRecoveryReenter]);
  useFocusEffect(useCallback(() => {
    let focused = true;
    visible.current = true;
    const run = () => { if (!placing.current) void check(() => focused); };
    run();
    const timer = setInterval(run, 15_000);
    return () => { visible.current = false; focused = false; clearInterval(timer); };
  }, [check]));
  function recoverCheckout(action: CheckoutRecoveryAction) {
    if (placing.current) return;
    placing.current = true;
    setBusy(true);
    void check(() => visible.current, action).finally(() => { placing.current = false; setBusy(false); });
  }
  const canReenterDelivery = loadedKey === key && pending && reenterRequestId === pending.requestId;
  if (!key || loadedKey !== key || pending) return <Screen>
    <Header title={c.shopCart} back />
    {loadedKey === key && pending && <Card><Section title={c.bookingPending} /><Txt>{canReenterDelivery ? c.shopRecoveryReenter : c.bookingRecoveryWait}</Txt></Card>}
    <ErrorText>{error}</ErrorText>
    {key && <Button title={c.retry} variant="soft" disabled={busy} onPress={() => recoverCheckout('retry')} />}
    {key && pending && canReenterDelivery &&
      <Button title={c.shopReenterDelivery} variant="ghost" disabled={busy} onPress={() => recoverCheckout({ reenterFor: pending.requestId })} />}
    {key && <Button title={c.orders} variant="ghost" onPress={() => router.replace('/(customer)/orders')} />}
  </Screen>;
  if (!cart) return <Screen><Header title={c.shopCart} back /><Empty icon="basket-outline" title={c.shopCartEmpty}
    body={error || undefined}
    action={<Button title={c.shopBrowse} onPress={() => router.replace({ pathname: '/shop', params: { destinationOrder } })} />} /></Screen>;
  const goods = cartGoods(cart);
  const short = Math.max(0, cart.minOrderAgorot - goods);
  const fees = cart.deliveryFeeAgorot + cart.serviceFeeAgorot;
  const cap = goodsCapFor(goods, limit);
  const weighed = cart.lines.some(l => l.byWeight);
  const deliveryContact = normalizePhone(contact);
  const reason = short > 0 ? fill(c.shopBelowMinimum, { r: money(short / 100) }) : !point ? c.shopPinNeeded
    : note.trim().length < 3 ? c.shopNoteNeeded : !deliveryContact ? c.err_invalid_phone : '';
  const shopInfo = { merchantId: cart.merchantId, merchantName: cart.merchantName, city: cart.city, minOrderAgorot: cart.minOrderAgorot,
    deliveryFeeAgorot: cart.deliveryFeeAgorot, serviceFeeAgorot: cart.serviceFeeAgorot };
  async function reviewCart() {
    if (!cart || placing.current) return;
    const revision = apiSessionRevision(), current = () => revision === apiSessionRevision();
    placing.current = true;
    setBusy(true);
    try {
      const latest = await api<{ merchant: Merchant; items: MerchantItem[] }>(`/shop/merchants/${cart.merchantId}`);
      if (!await refreshCart(latest.merchant, latest.items, current) || !current()) return;
      setCartNeedsRefresh(false);
      setError(c.shopCartReviewUpdated);
    } catch (e) { if (current()) setError(err(e)); }
    finally { placing.current = false; setBusy(false); }
  }
  async function place() {
    if (!key || !cart || !point || !deliveryContact || placing.current || reason) return;
    const dropoffCity = cart.city;
    if (!isCity(dropoffCity)) return;
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
        const delivery: ShopDelivery = { requestId: command.requestId, expectedGoodsAgorot: goods, agreeLimit: limit,
          expectedDeliveryFeeAgorot: cart.deliveryFeeAgorot, expectedServiceFeeAgorot: cart.serviceFeeAgorot,
          dropoffCity, dropoffPoint: point, dropoffNote: note.trim(), contact: deliveryContact };
        await recoveryStorage.write('shop-checkout', delivery, deliveryRecoveryMs);
        if (!current()) return;
        await storage.set(key, JSON.stringify(command), true);
        if (!current()) return;
        setPending(command);
        await send(command, delivery, current);
      }, key);
    } catch { if (current()) setError(c.bookingStorageError); }
    finally { placing.current = false; setBusy(false); }
  }
  const footer = cartNeedsRefresh
    ? <Button title={c.shopCartReview} loading={busy} onPress={reviewCart} />
    : <Button title={fill(c.shopPlace, { r: money((goods + fees) / 100) })} icon="checkmark" loading={busy} disabled={!!reason} reason={reason || undefined} onPress={place} />;
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
      {!!destinationOrder && !preferred && !deliveryAddress && (retrySelection ? <>
        <ErrorText>{err(selectedError)}</ErrorText>
        <Button title={c.retry} variant="ghost" onPress={() => void reloadSelectedOrder()} />
      </> : (!exactPath || selectedOrder || selectedError) && <Txt variant="caption">{c.placeUnavailable}</Txt>)}
      {!destinationOrder && !point && !note && isCity(cart.city) && <ShopAddressSuggestion key={key} town={cart.city} onSelect={setDeliveryAddress} />}
      <Button title={point ? c.shopPinChange : c.shopPinSet} variant={point ? 'outline' : 'soft'} icon="location-outline"
        onPress={() => setPinSelection({ accountId, address: { point, note } })} />
      <Field label={c.shopLandmark} value={note} onChangeText={nextNote => setDeliveryAddress({ point, note: nextNote })} placeholder={c.landmarkHint} maxLength={200} />
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
    {pinAddress && <PinSheet title={c.shopPinSet} hint={c.shopPinHint} start={pinAddress.point ?? city(cart.city as never)} onClose={() => setPinSelection(null)}
      onConfirm={p => { setDeliveryAddress({ point: p, note: pinAddress.note }); setPinSelection(null); }} />}
  </Screen>;
}

function ShopAddressSuggestion({ town, onSelect }: { town: CityId; onSelect: (address: { point: Point; note: string }) => void }) {
  const { c } = useCopy();
  const { data } = useApi<Places>(`/me/places?shopDelivery=1&town=${town}`);
  const address = data?.shopDelivery;
  // the margin keeps it from touching the map-pin button below
  return address ? <View style={{ marginVertical: 8 }}><Button title={fill(c.shopUseLastAddress, { address: isolate(address.note) })} variant="outline"
    icon="time-outline" onPress={() => onSelect(address)} /></View> : null;
}
