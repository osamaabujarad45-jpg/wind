// Operations for shops (MER-07, MER-08, MER-09, ADM-05): approve an application, set the shop's minimum, fees and commission,
// renew the licence, pause, read the statement and record a payout with its reference. Payouts never exceed what Wind has
// received in cash for that shop's orders (the server's payable amount).
import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { api, useApi } from '../../api';
import { newRequestId } from '../../booking';
import { city, minorFromText, orderCode, type Merchant, type Order } from '../../model';
import { Badge, Button, Card, Empty, ErrorText, Field, fill, Header, Loading, Press, Row, Screen, Section, tones, Txt, useCopy } from '../../ui';

type AdminMerchant = Merchant & { balanceAgorot: number; payableAgorot: number };

export default function AdminMerchants() {
  const { c } = useCopy();
  const { data, error, reload } = useApi<{ merchants: AdminMerchant[] }>('/admin/merchants', 30_000);
  // DLV-12, DLV-13, DLV-22: the server's attention list (no captain, handover problem, locked pickup code, fault missing after two days).
  const attention = useApi<{ orders: Order[] }>('/admin/shop/attention', 30_000);
  const why = (o: Order) => o.shop?.handoverException && o.status === 'at_pickup' ? c.adminAttn_handover : o.status === 'searching' ? c.adminAttn_no_captain
    : o.status === 'on_hold' || o.status === 'returned' ? c.adminAttn_fault : c.adminAttn_locked;
  if (!data) return <Screen><Header title={c.adminShops} /><Loading failed={!!error} onRetry={reload} /></Screen>;
  return <Screen onRefresh={reload}>
    <Header title={c.adminShops} />
    {!!attention.data?.orders.length && <>
      <Section title={c.adminShopAttention} />
      {/* the reason gets its own line: in a one-line row it truncated the order number */}
      {attention.data.orders.map(o => <Press key={o.id} onPress={() => router.push(`/order/${o.id}`)} accessibilityLabel={[orderCode(o.id), o.shop?.merchantName, why(o)].filter(Boolean).join('، ')}>
        <Card tone="warn">
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label" style={{ writingDirection: 'ltr' }}>{orderCode(o.id)}</Txt>
            <Txt variant="caption" style={{ flex: 1, marginHorizontal: 8 }} numberOfLines={1}>{o.shop?.merchantName}</Txt>
          </Row>
          <Txt style={{ marginTop: 4 }}>{why(o)}</Txt>
        </Card>
      </Press>)}
    </>}
    {!data.merchants.length && <Empty icon="storefront-outline" title={c.adminNoShops} />}
    {data.merchants.map(m => <MerchantCard key={m.id} merchant={m} onChange={reload} />)}
  </Screen>;
}

function MerchantCard({ merchant: m, onChange }: { merchant: AdminMerchant; onChange: () => void }) {
  const { c, language, money, err } = useCopy();
  const [open, setOpen] = useState(m.status === 'pending');
  const [min, setMin] = useState(String(m.minOrderAgorot / 100));
  const [fee, setFee] = useState(String(m.deliveryFeeAgorot / 100));
  const [service, setService] = useState(String(m.serviceFeeAgorot / 100));
  const [commission, setCommission] = useState(String((m.commissionBps ?? 0) / 100));
  const [expiry, setExpiry] = useState(m.licenceExpiresAt ? new Date(m.licenceExpiresAt).toISOString().slice(0, 10) : '');
  const [payout, setPayout] = useState('');
  const [reference, setReference] = useState('');
  const [payoutId, setPayoutId] = useState(newRequestId);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [today] = useState(() => Date.now());
  async function save(key: string, body: object) {
    setBusy(key); setError('');
    try { await api(key === 'payout' ? `/admin/merchants/${m.id}/payout` : `/admin/merchants/${m.id}`, body); if (key === 'payout') { setPayout(''); setReference(''); setPayoutId(newRequestId()); } onChange(); }
    catch (e) { setError(err(e)); }
    finally { setBusy(''); }
  }
  const terms = () => {
    const values = { minOrderAgorot: minorFromText(min), deliveryFeeAgorot: minorFromText(fee), serviceFeeAgorot: minorFromText(service), commissionBps: Math.round(Number(commission) * 100) };
    const expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? Date.parse(`${expiry}T00:00:00Z`) : NaN;
    return Object.values(values).every(v => Number.isSafeInteger(v) && v >= 0) && expiresAt > today ? { ...values, licenceExpiresAt: expiresAt } : null;
  };
  const payoutAgorot = minorFromText(payout);
  const statusTone = m.status === 'active' ? tones.olive : m.status === 'pending' ? tones.warn : tones.muted;
  return <Card>
    <Row style={{ justifyContent: 'space-between' }}>
      <Txt variant="title" style={{ flex: 1 }}>{m.name}</Txt>
      <Badge label={c[`merchantStatus_${m.status}`]} tone={statusTone} />
    </Row>
    <Txt variant="caption">{`${c[`shopCat_${m.category}`]} · ${city(m.city)[language]} · ${m.ownerPhone ?? ''} · ${m.licenceNo ?? ''}`}</Txt>
    <Txt variant="caption">{fill(c.adminShopMoney, { b: money(m.balanceAgorot / 100), p: money(m.payableAgorot / 100) })}</Txt>
    <Button title={open ? c.hide : c.manage} size="sm" variant="ghost" onPress={() => setOpen(!open)} />
    {open && <View>
      <Section title={c.adminShopTerms} />
      <Field label={c.adminShopMin} value={min} onChangeText={setMin} keyboardType="decimal-pad" />
      <Field label={c.adminShopFee} value={fee} onChangeText={setFee} keyboardType="decimal-pad" />
      <Field label={c.adminShopService} value={service} onChangeText={setService} keyboardType="decimal-pad" />
      <Field label={c.adminShopCommission} value={commission} onChangeText={setCommission} keyboardType="decimal-pad" />
      <Field label={c.merchantExpiry} value={expiry} onChangeText={setExpiry} placeholder="2027-12-31" maxLength={10} />
      <Row style={{ flexWrap: 'wrap' }}>
        {m.status === 'pending' && <Button title={c.adminShopApprove} loading={busy === 'approve'} disabled={!terms()} reason={terms() ? undefined : c.adminShopTermsNeeded}
          onPress={() => save('approve', { status: 'active', ...terms() })} />}
        {m.status !== 'pending' && <Button title={c.save} loading={busy === 'save'} disabled={!terms()} reason={terms() ? undefined : c.adminShopTermsNeeded}
          onPress={() => save('save', { ...terms() })} />}
        {m.status === 'active' && <Button title={c.adminShopPause} variant="outline" loading={busy === 'pause'} onPress={() => save('pause', { status: 'paused' })} />}
        {m.status === 'paused' && <Button title={c.adminShopActivate} variant="soft" loading={busy === 'activate'} disabled={!terms()} reason={terms() ? undefined : c.adminShopTermsNeeded}
          onPress={() => save('activate', { status: 'active', ...terms() })} />}
      </Row>
      {m.status !== 'pending' && <>
        <Section title={c.adminShopPayout} />
        <Txt variant="caption">{fill(c.adminShopPayable, { r: money(m.payableAgorot / 100) })}</Txt>
        <Field label={c.amount} value={payout} onChangeText={setPayout} keyboardType="decimal-pad" />
        <Field label={c.adminShopReference} value={reference} onChangeText={setReference} maxLength={80} />
        <Button title={c.adminShopRecordPayout} loading={busy === 'payout'} disabled={!(payoutAgorot >= 1) || reference.trim().length < 2}
          onPress={() => save('payout', { amountAgorot: payoutAgorot, reference: reference.trim(), requestId: payoutId })} />
      </>}
    </View>}
    <ErrorText>{error}</ErrorText>
  </Card>;
}
