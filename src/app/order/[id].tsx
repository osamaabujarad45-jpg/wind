import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { css, cubicBezier, ZoomIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { api, useApi } from '../../api';
import { activeStatuses, city, commissionOn, orderCode, statusFlow, type Order, type Point } from '../../model';
import { serviceMeta, useFormat } from '../../parts';
import RouteMap from '../../route-map';
import { useSession } from '../../session';
import { Appear, Badge, Button, Card, confirm, ErrorText, Field, fill, haptic, Header, Loading, palette, Pulse, Row, Screen, Txt, useCopy } from '../../ui';

const DONE = ZoomIn.duration(300);

function openMaps(point: Point) {
  const q = `${point.latitude},${point.longitude}`;
  Linking.openURL(Platform.select({ ios: `maps:0,0?q=${q}`, android: `geo:0,0?q=${q}`, default: `https://www.google.com/maps/search/?api=1&query=${q}` }));
}

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const { c, language, money, err, rtl } = useCopy();
  const { time } = useFormat();
  const { data: order, error, reload, setData } = useApi<Order>(`/orders/${id}`, 4000);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [code, setCode] = useState('');

  if (!order || !me) return <Screen><Header title={c.orders} back />{error ? <ErrorText>{err(error)}</ErrorText> : <Loading />}</Screen>;

  const role = me.user.role;
  const isCustomer = role === 'customer', isDriver = role === 'driver', isAdmin = role === 'admin';
  const mine = isDriver && order.driverId === me.user.id;
  const from = city(order.pickupCity), to = city(order.dropoffCity);
  const pickup = order.pickupPoint ?? from;
  const step = statusFlow.indexOf(order.status);
  const live = order.status === 'searching' || activeStatuses.includes(order.status);
  const rate = me.plan === 'pro' ? me.settings.proCommission : me.settings.commission;

  async function act(key: string, path: string, body: object = {}, after?: () => void) {
    setBusy(key);
    setActionError('');
    try {
      const next = await api<Order | { ok: true }>(path, body);
      haptic.success();
      if ('id' in next) setData(next);
      after?.();
    } catch (e) {
      haptic.error();
      setActionError(err(e));
    }
    setBusy(null);
  }

  return <Screen onRefresh={reload}>
    <Header title={orderCode(order.id)} back right={<Badge label={c[order.status]} status={order.status} />} />

    {order.status === 'completed' && <Animated.View entering={DONE} style={styles.done}>
      <Ionicons name="checkmark-circle" size={52} color={palette.olive} />
      <Txt variant="h2" center>{c.completed}</Txt>
    </Animated.View>}

    {order.status !== 'cancelled' && order.status !== 'completed' && <Appear>
      <Card>
        <Row gap={10} style={{ marginBottom: 12 }}>
          {live && <Pulse color={serviceMeta[order.service].color} size={10} />}
          <Txt variant="h2" style={{ flex: 1 }}>{c[order.status]}</Txt>
        </Row>
        <View style={styles.track}>
          <Animated.View style={[motion.fill, rtl ? { right: 0 } : { left: 0 }, { width: `${Math.max(step, 0) / (statusFlow.length - 1) * 100}%` }]} />
        </View>
        <View style={{ gap: 10, marginTop: 14 }}>
          {statusFlow.map((s, i) => <Row key={s} gap={10}>
            <View style={[styles.stepDot, i <= step && { backgroundColor: palette.olive }]}>
              {i < step && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
            </View>
            <Txt style={[{ flex: 1 }, i <= step ? { color: palette.ink, fontWeight: '800' } : null]}>{c[s]}</Txt>
          </Row>)}
        </View>
      </Card>
    </Appear>}

    {isCustomer && order.handoverCode && live && <Appear index={1}>
      <Card tone="clay">
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Txt variant="title">{c.handoverCode}</Txt>
            <Txt variant="caption">{c.handoverHint}</Txt>
          </View>
          <Text style={styles.code} accessibilityLabel={order.handoverCode.split('').join(' ')}>{order.handoverCode}</Text>
        </Row>
      </Card>
    </Appear>}

    <Appear index={2}>
      <View style={styles.map}>
        <RouteMap pickup={pickup} dropoff={to} pickupTitle={from[language]} dropoffTitle={to[language]}
          driver={order.driverLocation} driverTitle={order.driverName} />
        {order.driverLocation && <Row gap={8} style={{ padding: 12 }}>
          <Pulse color={palette.blue} />
          <Txt variant="caption" style={{ flex: 1 }}>{fill(c.liveDriver, { s: order.driverLocation.ageSeconds })}</Txt>
        </Row>}
      </View>
    </Appear>

    {(order.driverName && (isCustomer || isAdmin)) || ((mine || isAdmin) && order.contact) ? <Appear index={3}>
      <Card>
        {order.driverName && (isCustomer || isAdmin) && <Person icon="car-sport-outline" title={c.driver} name={order.driverName}
          sub={order.driverVehicle ? c[order.driverVehicle] : undefined} phone={order.driverPhone} />}
        {(mine || isAdmin) && order.contact && <Person icon="person-outline" title={c.customer} name={order.customerName ?? ''} phone={order.contact} />}
      </Card>
    </Appear> : null}

    <Appear index={4}>
      <Card>
        <Detail label={c.from} value={`${from[language]} · ${order.pickupNote}`} />
        <Detail label={c.to} value={`${to[language]} · ${order.dropoffNote}`} />
        {!!order.detail && <Detail label={c.details} value={order.detail} />}
        <Detail label={order.service === 'ride' ? c.passengers : c.size} value={order.service === 'ride' ? order.option : c[order.option as 'small']} />
        {order.loadingHelp && <Detail label={c.loadingHelp} value={c.yes} />}
        <Detail label={c.mode} value={order.shared ? c.shared : c.private} />
        <Detail label={c.total} value={`${money(order.price)} · ${c.cashNote}`} />
        {isDriver && <Detail label={c.youEarn} value={money(order.price - (order.commission ?? commissionOn(order.price, rate)))} strong />}
        {isAdmin && order.commission != null && <Detail label={c.commission} value={money(order.commission)} strong />}
        <Detail label="🕒" value={time(order.createdAt)} />
      </Card>
    </Appear>

    <ErrorText>{actionError}</ErrorText>

    <View style={{ gap: 10 }}>
      {isDriver && order.status === 'searching' && <Button title={c.accept} icon="checkmark-circle-outline" loading={busy === 'accept'}
        onPress={() => act('accept', `/jobs/${order.id}/accept`)} />}

      {mine && activeStatuses.includes(order.status) && <>
        {order.status === 'in_transit' && order.service !== 'ride' &&
          <Field label={c.codeFromCustomer} value={code} onChangeText={setCode} keyboardType="phone-pad" placeholder="0000" />}
        <Button title={c[`advance_${order.status}` as 'advance_assigned']} icon="arrow-forward-circle-outline" loading={busy === 'advance'}
          onPress={() => act('advance', `/orders/${order.id}/advance`, { code })} />
        <Button title={c.navigate} icon="map-outline" variant="soft" onPress={() => openMaps(order.status === 'in_transit' ? to : pickup)} />
        {order.status === 'assigned' && <Button title={c.release} variant="ghost" loading={busy === 'release'}
          onPress={() => confirm(c.releaseConfirm, () => act('release', `/orders/${order.id}/release`, {}, () => router.back()), c.release, c.no)} />}
      </>}

      {isCustomer && order.status === 'completed' && <RateDriver order={order} onRate={rating => act('rate', `/orders/${order.id}/rate`, { rating })} />}

      {((isCustomer && ['searching', 'assigned'].includes(order.status)) || (isAdmin && live)) &&
        <Button title={c.cancelOrder} variant="danger" icon="close-circle-outline" loading={busy === 'cancel'}
          onPress={() => confirm(c.cancelConfirm, () => act('cancel', `/orders/${order.id}/cancel`), c.cancelOrder, c.no)} />}
    </View>
  </Screen>;
}

function Person({ icon, title, name, sub, phone }: { icon: 'person-outline' | 'car-sport-outline'; title: string; name: string; sub?: string; phone?: string | null }) {
  const { c } = useCopy();
  return <Row gap={12} style={{ paddingVertical: 6 }}>
    <View style={styles.avatar}><Ionicons name={icon} size={20} color={palette.blue} /></View>
    <View style={{ flex: 1 }}>
      <Txt variant="caption">{title}{sub ? ` · ${sub}` : ''}</Txt>
      <Txt variant="title">{name}</Txt>
    </View>
    {phone && <Pressable accessibilityRole="button" accessibilityLabel={`${c.call} ${name}`} onPress={() => Linking.openURL(`tel:${phone}`)} style={styles.call}>
      <Ionicons name="call" size={18} color="#FFFFFF" />
    </Pressable>}
  </Row>;
}

function Detail({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <Row style={styles.detail} gap={12}>
    <Txt variant="caption" style={{ width: 96 }}>{label}</Txt>
    <Txt variant={strong ? 'title' : 'body'} style={[{ flex: 1 }, strong ? { color: palette.olive } : { color: palette.ink }]}>{value}</Txt>
  </Row>;
}

function RateDriver({ order, onRate }: { order: Order; onRate: (rating: number) => void }) {
  const { c } = useCopy();
  return <Card tone="olive">
    <Txt variant="title" center>{order.rating ? c.thanks : c.rateDriver}</Txt>
    <Row gap={6} style={{ justifyContent: 'center', marginTop: 10 }}>
      {[1, 2, 3, 4, 5].map(n => <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n}/5`} disabled={!!order.rating}
        onPress={() => onRate(n)} hitSlop={6}>
        <Ionicons name={n <= (order.rating ?? 0) ? 'star' : 'star-outline'} size={32} color={palette.clay} />
      </Pressable>)}
    </Row>
  </Card>;
}

// Absolutely positioned, childless: animating width here doesn't re-layout siblings.
const motion = css.create({
  fill: { position: 'absolute', top: 0, bottom: 0, backgroundColor: palette.olive, borderRadius: 3,
    transitionProperty: 'width', transitionDuration: '400ms', transitionTimingFunction: cubicBezier(0.77, 0, 0.175, 1) },
});

const styles = StyleSheet.create({
  done: { alignItems: 'center', gap: 6, marginBottom: 16 },
  track: { height: 6, borderRadius: 3, backgroundColor: palette.muted, overflow: 'hidden' },
  stepDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  code: { fontSize: 32, fontWeight: '900', color: palette.clay, letterSpacing: 6 },
  map: { borderRadius: 20, overflow: 'hidden', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, marginBottom: 14 },
  avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.bluePale, alignItems: 'center', justifyContent: 'center' },
  call: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.olive, alignItems: 'center', justifyContent: 'center' },
  detail: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line, alignItems: 'flex-start' },
});
