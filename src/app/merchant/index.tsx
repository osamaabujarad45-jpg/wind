// Merchant mode (MER-01, MER-02, MER-04, MER-05): the same account and app, opened from Account. A shop applies here (ACC-06),
// waits for approval, then works its inbox: new orders say so in words (not a sound alone), with the accept clock.
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, useApi } from '../../api';
import { cities, hhmm, minuteFromText, shopCategories, statusFlow, type Merchant, type Order, type Point, type ShopCategory } from '../../model';
import { registerNativePush } from '../../native-push';
import PinSheet from '../../pin-sheet';
import { useSession } from '../../session';
import { useCountdown } from '../../shop-ui';
import { Badge, Button, Card, Choices, Empty, ErrorText, Field, fill, Header, ListGroup, ListRow, Loading, palette, Press, Row, Screen, Section, Stat, tones, Txt, useCopy } from '../../ui';

type Statement = { balanceAgorot: number; payableAgorot: number; entries: { id: number; orderId: number | null; kind: string; amountAgorot: number; note: string; reference: string | null; createdAt: number }[] };

export default function MerchantHome() {
  const { c, money, rtl, err, language } = useCopy();
  const mine = useApi<{ merchant: Merchant | null }>('/merchant');
  const merchant = mine.data?.merchant;
  // A working shop is asked for notifications here: new orders are its work (customers are asked after their first order).
  const working = !!merchant && merchant.status !== 'pending';
  useEffect(() => { if (working) void registerNativePush(language, true); }, [working, language]);
  const inbox = useApi<{ merchant: Merchant; orders: Order[] }>(merchant && merchant.status !== 'pending' ? '/merchant/orders' : null, 10_000);
  const statement = useApi<Statement>(merchant && merchant.status !== 'pending' ? '/merchant/statement' : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hoursSaved, setHoursSaved] = useState(false); // kept here: the hours card remounts when the saved hours come back
  if (!mine.data) return <Screen><Header title={c.merchantMode} back /><Loading failed={!!mine.error} onRetry={mine.reload} /></Screen>;
  if (!merchant) return <Apply onDone={mine.reload} />;
  if (merchant.status === 'pending') return <Screen onRefresh={mine.reload}><Header title={merchant.name} back />
    <Empty icon="hourglass-outline" title={c.merchantPending} body={c.merchantPendingBody} /></Screen>;
  const orders = inbox.data?.orders ?? [];
  const open = orders.filter(o => ['requested', 'searching', 'assigned', 'at_pickup', 'returning'].includes(o.status));
  const fresh = open.filter(o => o.status === 'requested' && !o.shop?.state);
  async function pause(paused: boolean) {
    setBusy(true); setError('');
    try { await api('/merchant/settings', { paused }); await mine.reload(); }
    catch (e) { setError(err(e)); }
    finally { setBusy(false); }
  }
  return <Screen onRefresh={async () => { await mine.reload(); await inbox.reload(); await statement.reload(); }}>
    <Header title={merchant.name} back subtitle={merchant.status === 'paused' ? c.merchantLicencePaused : merchant.pausedNew ? c.merchantPausedNew : merchant.open ? c.shopOpen : c.shopClosed} />
    {/* The banner opens the first new order: it named the work but led nowhere (design review 17 Nov). */}
    {fresh.length > 0 && <Press onPress={() => router.push(`/merchant/order/${fresh[0].id}`)} accessibilityLabel={fill(c.merchantNewOrders, { n: fresh.length })}>
      <Card tone="clay"><Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="label" style={{ flex: 1 }}>{fill(c.merchantNewOrders, { n: fresh.length })}</Txt>
        <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={palette.clayInk} />
      </Row></Card>
    </Press>}
    <Row style={{ flexWrap: 'wrap' }}>
      <Stat label={c.merchantOpenOrders} value={String(open.length)} />
      <Stat label={c.merchantBalance} value={money((statement.data?.balanceAgorot ?? 0) / 100)} index={1} detail={fill(c.merchantPayable, { r: money((statement.data?.payableAgorot ?? 0) / 100) })} />
    </Row>
    <Button title={merchant.pausedNew ? c.merchantResume : c.merchantPause} variant={merchant.pausedNew ? 'primary' : 'outline'} loading={busy} onPress={() => pause(!merchant.pausedNew)} />
    <Txt variant="caption" style={{ marginTop: 4 }}>{c.merchantPauseHint}</Txt>
    <ErrorText>{error}</ErrorText>
    <ListGroup>
      <ListRow icon="pricetags-outline" label={c.merchantCatalogue} onPress={() => router.push('/merchant/catalogue')} />
    </ListGroup>
    <Section title={c.merchantInbox} />
    {!orders.length && <Empty icon="file-tray-outline" title={c.merchantNoOrders} />}
    {/* orders waiting on the shop come first; the rest keep the server's order */}
    {[...fresh, ...orders.filter(o => !fresh.includes(o))].map(o => <InboxRow key={o.id} order={o} />)}
    {/* a setting touched rarely: below the inbox, which is the shop's main work */}
    <Hours key={JSON.stringify(merchant.hours)} merchant={merchant} saved={hoursSaved} onSaved={done => { setHoursSaved(done); if (done) mine.reload(); }} />
    {!!statement.data?.entries.length && <Card>
      <Section title={c.merchantStatement} />
      {statement.data.entries.slice(0, 20).map(e => <Row key={e.id} style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
        <Txt variant="caption" style={{ flex: 1 }}>{`${(c as Record<string, string>)[`ledger_${e.kind}`] ?? e.kind}${e.orderId ? ` · W-${String(e.orderId).padStart(5, '0')}` : ''}${e.reference ? ` · ${e.reference}` : ''}`}</Txt>
        <Txt variant="caption" style={{ writingDirection: 'ltr' }}>{money(e.amountAgorot / 100)}</Txt>
      </Row>)}
    </Card>}
  </Screen>;
}

/** MER-02 / DLV-01: one opening range for every day (the pilot's need); empty means open whenever not paused. */
function Hours({ merchant, saved, onSaved }: { merchant: Merchant; saved: boolean; onSaved: (done: boolean) => void }) {
  const { c, err } = useCopy();
  const first = merchant.hours[0];
  // The editor writes one range for every day; hours stored per day (by support) are replaced on save, and it says so.
  const uniform = !merchant.hours.length || (merchant.hours.length === 7 && new Set(merchant.hours.map(h => h.weekday)).size === 7
    && merchant.hours.every(h => h.openMinute === first.openMinute && h.closeMinute === first.closeMinute));
  const [opens, setOpens] = useState(first ? hhmm(first.openMinute) : '');
  const [closes, setCloses] = useState(first ? hhmm(first.closeMinute) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = minuteFromText(opens), close = minuteFromText(closes);
  const empty = !opens.trim() && !closes.trim();
  const ok = empty || (open < 1440 && close >= 0 && open !== close);
  async function save() {
    setBusy(true); setError(''); onSaved(false);
    try {
      await api('/merchant/settings', { hours: empty ? [] : [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, openMinute: open, closeMinute: close })) });
      onSaved(true);
      if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(c.saved);
    } catch (e) { setError(err(e)); }
    finally { setBusy(false); }
  }
  const edit = (set: (text: string) => void) => (text: string) => { set(text); if (saved) onSaved(false); };
  return <Card>
    <Section title={c.merchantHours} />
    {/* decimal-pad has no colon on Android, so 8.30 is read as 08:30 */}
    <Field label={c.merchantOpens} value={opens} onChangeText={edit(setOpens)} keyboardType="decimal-pad" maxLength={5} />
    {/* Go saves: on a phone the keyboard covers the button below (Android and web; iOS's decimal pad has no Go key) */}
    <Field label={c.merchantCloses} value={closes} onChangeText={edit(setCloses)} keyboardType="decimal-pad" maxLength={5} onSubmitEditing={ok && !busy ? save : undefined} />
    <Txt variant="caption">{c.merchantHoursHint}</Txt>
    {!uniform && <Txt variant="caption" style={{ marginTop: 4 }}>{c.merchantHoursReplace}</Txt>}
    <Button title={c.merchantSaveHours} size="sm" variant="outline" loading={busy} disabled={!ok} reason={ok ? undefined : c.merchantHoursBad} onPress={save} />
    {saved && <Txt variant="caption" center style={{ marginTop: 6 }}>{c.saved}</Txt>}
    <ErrorText>{error}</ErrorText>
  </Card>;
}

function InboxRow({ order }: { order: Order }) {
  const { c, money } = useCopy();
  const s = order.shop!;
  const clock = useCountdown(order.status === 'requested' && !s.state ? s.acceptDeadline : null, c.shopAcceptLeft);
  const step = order.status === 'cancelled' ? (s.cancelReason ? c[`shopCancel_${s.cancelReason}`] : c.cancelled)
    : order.status === 'completed' ? c.completed : order.status === 'returning' ? c.merchantReturning : s.state ? c[`merchantState_${s.state}`] : c.merchantStateNew;
  return <Press onPress={() => router.push(`/merchant/order/${order.id}`)} accessibilityLabel={`W-${String(order.id).padStart(5, '0')}, ${step}, ${money(s.goodsAgorot / 100)}`}>
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="label">{`W-${String(order.id).padStart(5, '0')}`}</Txt>
        <Badge label={step} tone={!s.state && order.status === 'requested' ? tones.clay : statusFlow.includes(order.status) ? tones.olive : tones.muted} />
      </Row>
      <Txt variant="caption" style={{ marginTop: 4 }}>{fill(c.merchantLines, { n: s.lines.filter(l => !l.removed).length, r: money(s.goodsAgorot / 100) })}</Txt>
      {!s.state && order.status === 'requested' && <Txt variant="caption" style={{ marginTop: 2 }}>{clock.left === 0 ? c.shopAcceptExpired : fill(c.shopAcceptTimer, { t: clock.text })}</Txt>}
    </Card>
  </Press>;
}

/** ACC-06: shop name, category, pin, phone, trade licence and its expiry. An admin approves it (MER-08). */
function Apply({ onDone }: { onDone: () => void }) {
  const { c, language, err } = useCopy();
  const { me } = useSession();
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
  const expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? Date.parse(`${expiry}T00:00:00Z`) : NaN;
  const reason = name.trim().length < 2 ? c.merchantNameNeeded : !point ? c.shopPinNeeded : licence.trim().length < 2 ? c.merchantLicenceNeeded
    : !(expiresAt > today) ? c.merchantExpiryNeeded : '';
  async function apply() {
    setBusy(true); setError('');
    try { await api('/merchant/apply', { name: name.trim(), category, city: town, point, phone, licenceNo: licence.trim(), licenceExpiresAt: expiresAt }); onDone(); }
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
    <Field label={c.merchantExpiry} value={expiry} onChangeText={setExpiry} placeholder="2027-12-31" keyboardType="number-pad" maxLength={10} />
    <ErrorText>{error}</ErrorText>
    {picking && <PinSheet title={c.merchantPinSet} start={point ?? centre} onClose={() => setPicking(false)} onConfirm={p => { setPoint(p); setPicking(false); }} />}
  </Screen>;
}
