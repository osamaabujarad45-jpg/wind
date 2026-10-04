// Trip / order screen, Uber pattern: map on top, one status line with a progress bar, the driver card
// with a call button, the handover code, then the route and receipt details. Same screen for all roles.
import { useCallback, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useReducedMotion, ZoomIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, ApiError, useApi } from '../../api';
import { newRequestId } from '../../booking';
import { useDriverWork } from '../../driver-work';
import { activeStatuses, city, commissionOn, orderCode, statusFlow, type Order, type Point } from '../../model';
import { RouteLine, ServiceIcon, serviceMeta, useFormat } from '../../parts';
import { locationState } from '../../location-state';
import RouteMap from '../../route-map';
import { useSession } from '../../session';
import {
  Appear, Avatar, Badge, Button, Card, confirm, ErrorText, Field, fill, haptic, Header, IconButton, Loading, palette, Pulse, Radar, Row, Screen, Tip, Txt, useCopy,
} from '../../ui';

const DONE = ZoomIn.duration(300);
const steps = statusFlow.slice(1); // assigned → completed

function openMaps(point: Point | null, place: string, landmark: string) {
  const q = encodeURIComponent(point ? `${point.latitude},${point.longitude}` : `${landmark}, ${place}, فلسطين`);
  return Linking.openURL(Platform.select({ ios: `maps:0,0?q=${q}`, android: `geo:0,0?q=${q}`, default: `https://www.google.com/maps/search/?api=1&query=${q}` }));
}

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const work = useDriverWork();
  const { c, language, money, err, row } = useCopy();
  const { time } = useFormat();
  const { data: order, error, reload, setData } = useApi<Order>(`/orders/${id}`, 4000);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [code, setCode] = useState('');
  const [advanceLocked, setAdvanceLocked] = useState<string | null>(null);
  const advanceAttempt = useRef<{ orderId: number; body: { requestId: string; expectedStatus: string; code: string } } | null>(null);
  const [proofReset, setProofReset] = useState({ id, reason: '', done: false });
  const [now, setNow] = useState(Date.now);
  const reduced = useReducedMotion();
  useFocusEffect(useCallback(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []));

  if (!order || !me) return <Screen><Header title={c.orders} back />{error ? <ErrorText>{err(error)}</ErrorText> : <Loading />}</Screen>;

  const role = me.user.role;
  const isCustomer = role === 'customer', isDriver = role === 'driver', isAdmin = role === 'admin';
  const mine = isDriver && order.driverId === me.user.id;
  const from = city(order.pickupCity), to = city(order.dropoffCity);
  const pickup = order.pickupPoint ?? from;
  const step = steps.indexOf(order.status);
  const live = order.status === 'searching' || activeStatuses.includes(order.status);
  const rate = me.plan === 'pro' ? me.settings.proCommission : me.settings.commission;
  const resetReason = proofReset.id === id ? proofReset.reason : '';

  async function act(key: string, path: string, body: object = {}, after?: () => void) {
    if (!order || busy || key === 'accept' && (!work.known || work.order)) return;
    setBusy(key);
    setActionError('');
    try {
      if (key === 'accept' && !await work.prepareTracking()) {
        setActionError(c.locationOff);
        return;
      }
      if (key === 'advance') {
        setAdvanceLocked(order.status);
        if (advanceAttempt.current?.orderId !== order.id || advanceAttempt.current.body.expectedStatus !== order.status)
          advanceAttempt.current = { orderId: order.id, body: { requestId: newRequestId(), expectedStatus: order.status, code } };
        body = advanceAttempt.current.body;
      }
      const next = await api<Order | { ok: true }>(path, body);
      if (key === 'advance') { advanceAttempt.current = null; setAdvanceLocked(null); }
      haptic.success();
      if ('id' in next) {
        setData(next);
        if (isDriver) work.update(next);
      } else if (mine && key === 'release') work.update(null);
      after?.();
    } catch (e) {
      if (key === 'advance' && e instanceof ApiError && e.status && e.status < 500 && ![401, 408, 429].includes(e.status)
        && e.message !== 'idempotency_conflict') { advanceAttempt.current = null; setAdvanceLocked(null); }
      haptic.error();
      setActionError(err(e));
    } finally { setBusy(null); }
  }

  const location = locationState(order.driverLocation, now);
  const age = location?.ageSeconds ?? 0;

  return <Screen onRefresh={reload}>
    <Header title={orderCode(order.id)} subtitle={`${c[order.service]} · ${order.shared ? c.shared : c.private}`} back
      right={<Badge label={c[order.status]} status={order.status} />} />
    {error && <ErrorText>{c.updatesPaused}</ErrorText>}

    {order.status === 'completed' && <Animated.View entering={reduced ? undefined : DONE}>
      <Card tone="olive" style={{ paddingVertical: 12 }}>
        <Row gap={10}>
          <Ionicons name="checkmark-circle" size={26} color={palette.olive} />
          <View style={{ flex: 1 }}>
            <Txt variant="title">{c.completed}</Txt>
            <Txt variant="caption">{time(order.updatedAt)}</Txt>
          </View>
        </Row>
      </Card>
    </Animated.View>}

    {/* Status stays visible even if native entering animations are interrupted. */}
    {order.status === 'searching' && <Card style={{ alignItems: 'center', paddingVertical: 18 }}>
      <Radar color={serviceMeta[order.service].color} size={110}>
        <ServiceIcon service={order.service} size={48} />
      </Radar>
      <Txt variant="h2" center style={{ marginTop: 4 }}>{c.findingTitle}</Txt>
      <Txt center variant="caption" style={{ marginTop: 4, maxWidth: 300 }}>{c.findingBody}</Txt>
    </Card>}

    <Appear index={1}>
      <View style={styles.map}>
        <RouteMap pickup={pickup} dropoff={to} pickupTitle={from[language]} dropoffTitle={to[language]}
          driver={order.driverLocation} driverTitle={order.driverName} />
        {live && order.driverId && <Row gap={8} style={{ paddingHorizontal: 12, paddingVertical: 9 }}>
          <Ionicons name={!location || location.stale || error ? 'time-outline' : 'locate-outline'} size={16} color={location?.stale || error ? palette.clayInk : palette.blue} />
          <Txt variant="caption" style={{ flex: 1 }}>{location
            ? fill(location.stale || error ? c.lastDriver : c.liveDriver, { s: age < 60 ? fill(c.agoSeconds, { n: age }) : fill(c.agoMinutes, { n: Math.floor(age / 60) }) })
            : c.noDriverLocation}</Txt>
        </Row>}
      </View>
    </Appear>

    {activeStatuses.includes(order.status) && <Appear index={2}>
      <Card>
        <Row gap={8} style={{ marginBottom: 10 }}>
          <Pulse color={serviceMeta[order.service].color} size={8} />
          <Txt variant="h2" style={{ flex: 1 }}>{c[order.status]}</Txt>
        </Row>
        <View style={[styles.progress, { flexDirection: row }]} accessibilityRole="progressbar" accessibilityLabel={c.tripProgress}
          accessibilityValue={{ min: 0, max: steps.length, now: step + 1 }}>
          {steps.map((s, i) => <View key={s} style={[styles.segment, i <= step && { backgroundColor: palette.olive }]} />)}
        </View>
        <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
          <Txt variant="micro">{c.pickup}</Txt>
          <Txt variant="micro">{c.dropoff}</Txt>
        </Row>
        <Txt variant="caption" style={{ marginTop: 10 }}>{c[`${mine ? 'driver_' : ''}${order.service === 'ride' ? 'ride_' : ''}next_${order.status}` as 'next_assigned']}</Txt>
      </Card>
    </Appear>}

    {order.driverName && (isCustomer || isAdmin) ? <Appear index={3}>
      <Card>
        <Person title={c.yourDriver} name={order.driverName} phone={order.driverPhone}
          sub={order.driverVehicle ? c[order.driverVehicle] : undefined} />
      </Card>
    </Appear> : null}

    {(mine || isAdmin) && order.contact ? <Appear index={3}>
      <Card>
        <Person title={c.customer} name={order.customerName ?? ''} phone={order.contact} />
        {order.pickupContact && order.pickupContact !== order.contact && <View style={styles.divider}>
          <Person title={c.pickupContact} name={order.pickupContact} phone={order.pickupContact} />
        </View>}
      </Card>
    </Appear> : null}

    {isCustomer && order.handoverCode && live && <Appear index={4}>
      <Card tone="clay">
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ flexGrow: 1, flexBasis: 150, gap: 2 }}>
            <Txt variant="title">{c.handoverCode}</Txt>
            <Txt variant="caption">{c.handoverHint}</Txt>
          </View>
          <View style={[styles.code, { flexDirection: 'row' }]} accessible accessibilityLabel={`${c.handoverCode} ${order.handoverCode.split('').join(' ')}`}>
            {order.handoverCode.split('').map((d, i) => <Text key={i} style={styles.digit}>{d}</Text>)}
          </View>
        </Row>
      </Card>
      <Tip id="order-code" icon="key-outline" title={c.tipCodeTitle} body={c.tipCodeBody} tone="clay" />
    </Appear>}

    <Appear index={5}>
      <Card>
        <RouteLine from={from[language]} to={to[language]} fromNote={order.pickupNote} toNote={order.dropoffNote} />
        <View style={styles.divider}>
          {!!order.detail && <Detail label={c.details} value={order.detail} />}
          <Detail label={order.service === 'ride' ? c.passengers : c.size} value={order.service === 'ride' ? order.option : c[order.option as 'small']} />
          {order.loadingHelp && <Detail label={c.loadingHelp} value={c.yes} />}
          <Detail label={c.payWith} value={c.cash} />
          <Detail label={c.issued} value={time(order.createdAt)} />
          <Detail label={c.total} value={money(order.price)} strong />
          {isDriver && <Detail label={c.youEarn} value={money(order.price - (order.commission ?? commissionOn(order.price, rate)))} strong />}
          {isAdmin && order.commission != null && <Detail label={c.commission} value={money(order.commission)} />}
        </View>
      </Card>
    </Appear>

    <ErrorText>{actionError}</ErrorText>

    {isAdmin && order.status === 'in_transit' && order.service !== 'ride' && <Card>
      <Txt variant="title">{c.proofResetTitle}</Txt>
      <Txt variant="caption" style={{ marginTop: 4, marginBottom: 12 }}>{c.proofResetHint}</Txt>
      <Field label={c.proofResetReason} value={resetReason} maxLength={500} disabled={!!busy}
        onChangeText={reason => setProofReset({ id, reason, done: false })} />
      <Button title={c.proofResetAction} variant="outline" icon="refresh-outline" loading={busy === 'proof-reset'}
        disabled={!!busy || resetReason.trim().length < 5}
        onPress={() => confirm(c.proofResetConfirm, () => act('proof-reset', `/admin/orders/${order.id}/proof-reset`,
          { reason: resetReason.trim() }, () => setProofReset({ id, reason: '', done: true })), c.yes, c.no)} />
      {proofReset.id === id && proofReset.done && <View accessibilityLiveRegion="polite" style={{ marginTop: 10 }}>
        <Txt variant="caption" style={{ color: palette.olive }}>{c.proofResetDone}</Txt>
      </View>}
    </Card>}

    <View style={{ gap: 8 }}>
      {isDriver && order.status === 'searching' && <Button title={c.accept} icon="checkmark-circle-outline" loading={busy === 'accept'} disabled={!!busy || !work.known || !!work.order}
        onPress={() => act('accept', `/jobs/${order.id}/accept`)} />}

      {mine && activeStatuses.includes(order.status) && <>
        {order.status === 'in_transit' && order.service !== 'ride' &&
          <Field label={c.codeFromCustomer} icon="key-outline" value={code} onChangeText={setCode} keyboardType="phone-pad" placeholder="0000"
            disabled={!!busy || advanceLocked === order.status} />}
        <Button title={c[order.status === 'in_transit' && order.service === 'ride' ? 'advance_in_transit_ride' : `advance_${order.status}` as 'advance_assigned']}
          icon="arrow-forward-circle-outline" loading={busy === 'advance'} disabled={!!busy}
          onPress={() => act('advance', `/orders/${order.id}/advance`, { code })} />
        <Button title={c.navigate} icon="navigate-outline" variant="soft" onPress={() => {
          const dropoff = order.status === 'in_transit';
          openMaps(dropoff ? null : order.pickupPoint, (dropoff ? to : from)[language], dropoff ? order.dropoffNote : order.pickupNote)
            .catch(() => setActionError(c.mapUnavailable));
        }} />
        {(order.status === 'in_transit' || !order.pickupPoint) && <Txt center variant="caption">{c.navigateLandmark}</Txt>}
        {order.status === 'assigned' && <Button title={c.release} variant="ghost" size="sm" loading={busy === 'release'}
          onPress={() => confirm(c.releaseConfirm, () => act('release', `/orders/${order.id}/release`, {}, () => router.back()), c.release, c.no)} />}
      </>}

      {order.status === 'completed' && (isCustomer || mine || isAdmin) &&
        <Button title={c.viewReceipt} icon="receipt-outline" variant="outline" onPress={() => router.push(`/receipt/${order.id}`)} />}

      {isCustomer && order.status === 'completed' && <RateDriver order={order} onRate={rating => act('rate', `/orders/${order.id}/rate`, { rating })} />}

      {((isCustomer || isAdmin) && ['searching', 'assigned'].includes(order.status)) &&
        <Button title={c.cancelOrder} variant="danger" size="sm" icon="close-circle-outline" loading={busy === 'cancel'}
          onPress={() => confirm(c.cancelConfirm, () => act('cancel', `/orders/${order.id}/cancel`), c.cancelOrder, c.no)} />}
      <Button title={c.help} variant="ghost" icon="help-circle-outline" onPress={() => router.push({ pathname: '/help', params: { order: orderCode(order.id) } })} />
    </View>
  </Screen>;
}

function Person({ title, name, sub, phone }: { title: string; name: string; sub?: string; phone?: string | null }) {
  const { c } = useCopy();
  return <Row gap={12}>
    <Avatar name={name} size={44} />
    <View style={{ flex: 1 }}>
      <Txt variant="micro">{title}</Txt>
      <Txt variant="title" numberOfLines={1}>{name}</Txt>
      {!!sub && <Txt variant="caption">{sub}</Txt>}
    </View>
    {phone && <IconButton icon="call" tone="forest" label={`${c.call} ${name}`} onPress={() => Linking.openURL(`tel:${phone}`)} />}
  </Row>;
}

// Label at the start, value pushed to the far end: reads like a receipt line.
function Detail({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { rtl } = useCopy();
  return <Row style={styles.detail} gap={12}>
    <Txt variant="caption">{label}</Txt>
    <Txt variant={strong ? 'title' : 'body'} numberOfLines={3} style={{ flex: 1, color: palette.ink, textAlign: rtl ? 'left' : 'right' }}>{value}</Txt>
  </Row>;
}

function RateDriver({ order, onRate }: { order: Order; onRate: (rating: number) => void }) {
  const { c } = useCopy();
  return <Card tone="olive" style={{ marginTop: 4 }}>
    <Txt variant="title" center>{order.rating ? c.thanks : c.rateDriver}</Txt>
    <Row gap={4} style={{ justifyContent: 'center', marginTop: 8 }}>
      {[1, 2, 3, 4, 5].map(n => <IconStar key={n} n={n} on={n <= (order.rating ?? 0)} disabled={!!order.rating} onPress={() => onRate(n)} />)}
    </Row>
  </Card>;
}

function IconStar({ n, on, disabled, onPress }: { n: number; on: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${n}/5`} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name={on ? 'star' : 'star-outline'} size={28} color={palette.clay} />
  </Pressable>;
}

const styles = StyleSheet.create({
  map: { borderRadius: 16, overflow: 'hidden', backgroundColor: palette.card, marginBottom: 12 },
  progress: { gap: 4 },
  segment: { flex: 1, height: 5, borderRadius: 3, backgroundColor: palette.muted },
  divider: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.hair },
  code: { gap: 4 },
  digit: { width: 30, height: 40, borderRadius: 8, backgroundColor: palette.card, textAlign: 'center', lineHeight: 40, fontSize: 22, fontWeight: '900', color: palette.clayInk, overflow: 'hidden' },
  detail: { paddingVertical: 6, alignItems: 'flex-start', justifyContent: 'space-between' },
});
