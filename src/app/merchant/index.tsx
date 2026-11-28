import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ApiError, api, useApi } from '../../api';
import { MerchantControls, MerchantHours, MerchantStatement, merchantStatus, useMerchantStatement } from '../../merchant-settings';
import { ProfileButton } from '../../profile-switch';
import { cities, isOpen, licenceExpiryFromText, shopCategories, statusFlow, type Merchant, type Order, type Point, type ShopCategory } from '../../model';
import { registerNativePush } from '../../native-push';
import PinSheet from '../../pin-sheet';
import { useSession } from '../../session';
import { useCountdown } from '../../shop-ui';
import { Badge, Button, Card, Choices, Empty, ErrorText, Field, fill, Header, ListGroup, ListRow, Loading, Press, Row, Screen, Section, Stat, Txt, useCopy } from '../../ui';
import { useTheme } from '../../theme-context';

export default function MerchantHome() {
  const { c, err, language } = useCopy();
  const { me } = useSession();
  const shopProfile = me?.accountProfile?.mode === 'shop';
  const mine = useApi<{ merchant: Merchant | null }>('/merchant');
  const merchant = mine.data?.merchant;
  const working = !!merchant && merchant.status !== 'pending';
  useEffect(() => { if (working) void registerNativePush(language, 'always'); }, [working, language]);
  const inbox = useApi<{ merchant: Merchant; orders: Order[] }>(working ? '/merchant/orders' : null, 10_000);
  const statement = useMerchantStatement(working && !shopProfile);

  if (!mine.data) return <Screen><Header title={c.merchantMode} back={!shopProfile} /><Loading failed={!!mine.error} onRetry={mine.reload} /></Screen>;
  if (!merchant) return <Apply onDone={mine.reload} />;
  if (merchant.status === 'pending') return <Screen onRefresh={mine.reload}>
    <Header title={merchant.name} back={!shopProfile} />
    <Empty icon="hourglass-outline" title={c.merchantPending} body={shopProfile ? c.merchantDraftCatalogue : c.merchantPendingBody} />
  </Screen>;

  const orders = inbox.data?.orders ?? [];
  const open = orders.filter(isOpen);
  const fresh = open.filter(order => order.status === 'requested' && !order.shop?.state);
  const ordered = [...fresh, ...open.filter(order => !fresh.includes(order)), ...orders.filter(order => !isOpen(order))];
  const freshLabel = fresh.length === 1 ? c.merchantNewOrder : fill(c.merchantNewOrders, { n: fresh.length });

  return <Screen onRefresh={() => Promise.all([mine.reload(), inbox.reload(), statement.reload()])}>
    <Header title={merchant.name} back={!shopProfile} subtitle={merchantStatus(merchant, c)} right={shopProfile ? <ProfileButton /> : undefined} />
    {fresh.length > 0 && <Button title={freshLabel} icon="receipt-outline" onPress={() => router.push(`/merchant/order/${fresh[0].id}`)} />}
    {!shopProfile && <>
      <Stat label={c.merchantOpenOrders} value={String(open.length)} />
      <MerchantControls merchant={merchant} reload={mine.reload} />
      <ListGroup><ListRow icon="pricetags-outline" label={c.merchantCatalogue} onPress={() => router.push('/merchant/catalogue')} /></ListGroup>
    </>}
    <Section title={c.merchantInbox} />
    {!!inbox.error && inbox.data && <ErrorText>{err(inbox.error)}</ErrorText>}
    {!inbox.data ? <Loading failed={!!inbox.error} onRetry={inbox.reload} />
      : ordered.length === 0 ? <Empty icon="file-tray-outline" title={c.merchantNoOrders} />
      : ordered.map(order => <InboxRow key={order.id} order={order} />)}
    {!shopProfile && <>
      <MerchantHours merchant={merchant} reload={mine.reload} />
      <MerchantStatement {...statement} />
    </>}
  </Screen>;
}

function InboxRow({ order }: { order: Order }) {
  const { tones } = useTheme();
  const { c, money } = useCopy();
  const s = order.shop!;
  const clock = useCountdown(order.status === 'requested' && !s.state ? s.acceptDeadline : null, c.merchantAcceptLeft);
  const step = order.status === 'cancelled' ? (s.cancelReason ? c[`shopCancel_${s.cancelReason}`] : c.cancelled)
    : order.status === 'completed' ? c.completed : order.status === 'returning' ? c.merchantReturning : s.state ? c[`merchantState_${s.state}`] : c.merchantStateNew;
  return <Press onPress={() => router.push(`/merchant/order/${order.id}`)} accessibilityLabel={`W-${String(order.id).padStart(5, '0')}, ${step}, ${money(s.goodsAgorot / 100)}`}>
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="label">{`W-${String(order.id).padStart(5, '0')}`}</Txt>
        <Badge label={step} tone={!s.state && order.status === 'requested' ? tones.warn : statusFlow.includes(order.status) ? tones.olive : tones.muted} />
      </Row>
      <Txt variant="caption" style={{ marginTop: 4 }}>{fill(c.merchantLines, { n: s.lines.filter(l => !l.removed).length, r: money(s.goodsAgorot / 100) })}</Txt>
      {!s.state && order.status === 'requested' && <Txt variant="caption" style={{ marginTop: 2 }}>{clock.left === 0 ? c.shopAcceptExpired : fill(c.merchantAcceptTimer, { t: clock.text })}</Txt>}
    </Card>
  </Press>;
}

/** ACC-06: shop name, category, pin, phone, trade licence and its expiry. An admin approves it (MER-08). */
function Apply({ onDone }: { onDone: () => void }) {
  const { c, language, err } = useCopy();
  const { me, switchMode } = useSession();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ShopCategory>('grocery');
  const [town, setTown] = useState<(typeof cities)[number]['id']>('tulkarm');
  const [point, setPoint] = useState<Point | null>(null);
  const [picking, setPicking] = useState(false);
  const [phone, setPhone] = useState(me?.user.phone ?? '');
  const [licence, setLicence] = useState('');
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [today] = useState(() => Date.now());
  const expiresAt = licenceExpiryFromText(expiry);
  const reason = name.trim().length < 2 ? c.merchantNameNeeded : !point ? c.shopPinNeeded : licence.trim().length < 2 ? c.merchantLicenceNeeded
    : !(expiresAt > today) ? c.merchantExpiryNeeded : '';
  async function apply() {
    setBusy(true); setError('');
    try {
      try {
        await api('/merchant/apply', { name: name.trim(), category, city: town, point, phone, licenceNo: licence.trim(), licenceExpiresAt: expiresAt });
      } catch (error) {
        if (!me?.accountProfile || !(error instanceof ApiError && error.message === 'merchant_exists')) throw error;
      }
      if (me?.accountProfile) await switchMode('shop');
      onDone();
    }
    catch (e) { setError(err(e)); }
    finally { setBusy(false); }
  }
  const centre = cities.find(x => x.id === town)!;
  return <Screen footer={<Button title={c.merchantApply} loading={busy} disabled={!!reason} reason={reason || undefined} onPress={apply} />}>
    <Header title={c.merchantApplyTitle} back />
    <Txt style={{ marginBottom: 8 }}>{c.merchantApplyBody}</Txt>
    <Field label={c.merchantName} value={name} onChangeText={setName} maxLength={80} />
    <Txt variant="label">{c.merchantCategory}</Txt>
    <Choices label={c.merchantCategory} value={category} onChange={setCategory} items={shopCategories.map(k => ({ key: k, label: c[`shopCat_${k}`] }))} />
    <Txt variant="label" style={{ marginTop: 8 }}>{c.merchantTown}</Txt>
    <Choices label={c.merchantTown} value={town} onChange={t => { setTown(t); setPoint(null); }} items={cities.slice(0, 13).map(x => ({ key: x.id, label: x[language] }))} />
    <Button title={point ? c.shopPinChange : c.merchantPinSet} variant={point ? 'outline' : 'soft'} icon="storefront-outline" onPress={() => setPicking(true)} />
    <Field label={c.merchantPhone} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
    <Field label={c.merchantLicence} value={licence} onChangeText={setLicence} maxLength={60} />
    <Field label={c.merchantExpiry} value={expiry} onChangeText={setExpiry} placeholder="20271231" keyboardType="number-pad" maxLength={10} />
    <ErrorText>{error}</ErrorText>
    {picking && <PinSheet title={c.merchantPinSet} start={point ?? centre} onClose={() => setPicking(false)} onConfirm={p => { setPoint(p); setPicking(false); }} />}
  </Screen>;
}
