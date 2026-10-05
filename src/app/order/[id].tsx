// Trip / order screen, Uber pattern: map on top, one status line with a progress bar, the driver card
// with a call button, the handover code, then the route and receipt details. Same screen for all roles.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Animated, { useReducedMotion, ZoomIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, API_URL, ApiError, useApi } from '../../api';
import { newRequestId } from '../../booking';
import { useDriverWork } from '../../driver-work';
import { activeStatuses, city, commissionOn, exceptionReasons, finishedStatuses, orderCode, safetyKinds, statusFlow, type ExceptionReason, type Order, type Point, type SafetyKind } from '../../model';
import { RouteLine, ServiceIcon, serviceMeta, useFormat } from '../../parts';
import { locationState } from '../../location-state';
import RouteMap from '../../route-map';
import { useRoad } from '../../road';
import { useSession } from '../../session';
import {
  Appear, Avatar, Badge, Button, Card, confirm, ErrorText, Field, FilterChips, fill, haptic, Header, IconButton, Loading, palette, Press, Pulse, Radar, Row, Screen, Tip, Txt, useCopy,
} from '../../ui';

const DONE = ZoomIn.duration(300);
const steps = statusFlow.slice(1); // assigned → completed

// Exact pins open turn-by-turn directions; without one, a search for the landmark is the best we can do.
function openMaps(point: Point | null, place: string, landmark: string) {
  if (point) {
    const at = `${point.latitude},${point.longitude}`;
    if (Platform.OS === 'android') return Linking.openURL(`google.navigation:q=${at}`).catch(() => Linking.openURL(`geo:${at}?q=${at}`));
    return Linking.openURL(Platform.select({ ios: `maps:?daddr=${at}&dirflg=d`, default: `https://www.google.com/maps/dir/?api=1&destination=${at}` }));
  }
  const q = encodeURIComponent(`${landmark}, ${place}, فلسطين`);
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
  const [problem, setProblem] = useState<{ reason: ExceptionReason; note: string }>({ reason: 'absent', note: '' });
  const problemAttempt = useRef<{ orderId: number; requestId: string } | null>(null);
  const [decision, setDecision] = useState({ id, reason: '' });
  const [dispute, setDispute] = useState({ id, reason: '' });
  const [sharedUrl, setSharedUrl] = useState<{ id: string; url: string } | null>(null);
  const [now, setNow] = useState(Date.now);
  const reduced = useReducedMotion();
  const { road, eta } = useRoad(order);
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
  const pickup = order.pickupPoint ?? from, dropoff = order.dropoffPoint ?? to;
  // A held or returning item is still past pickup; the bar does not move backwards.
  const step = steps.indexOf(['on_hold', 'returning'].includes(order.status) ? 'in_transit' : order.status);
  const live = order.status === 'searching' || activeStatuses.includes(order.status);
  const rate = me.plan === 'pro' ? me.settings.proCommission : me.settings.commission;
  const resetReason = proofReset.id === id ? proofReset.reason : '';
  const decisionReason = decision.id === id ? decision.reason : '';
  const disputeReason = dispute.id === id ? dispute.reason : '';
  const needsCode = (order.status === 'in_transit' && order.service !== 'ride') || order.status === 'returning';
  const canDispute = isCustomer && finishedStatuses.includes(order.status) && now - order.updatedAt <= 7 * 86_400_000;

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
      if (key === 'problem') { // one request id per order, so a lost acknowledgement replays instead of failing
        if (problemAttempt.current?.orderId !== order.id) problemAttempt.current = { orderId: order.id, requestId: newRequestId() };
        body = { ...body, requestId: problemAttempt.current.requestId, expectedStatus: 'in_transit' };
      }
      const next = await api<Order | { ok: true }>(path, body);
      if (key === 'advance') { advanceAttempt.current = null; setAdvanceLocked(null); }
      if (key === 'problem') problemAttempt.current = null;
      haptic.success();
      if ('id' in next) {
        setData(next);
        if (isDriver) work.update(next);
      } else if (mine && key === 'release') work.update(null);
      after?.();
    } catch (e) {
      if (key === 'advance' && e instanceof ApiError && e.status && e.status < 500 && ![401, 408, 429].includes(e.status)
        && e.message !== 'idempotency_conflict') { advanceAttempt.current = null; setAdvanceLocked(null); }
      if (key === 'problem' && e instanceof ApiError && e.status && e.status < 500 && ![401, 408, 429].includes(e.status)) problemAttempt.current = null;
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
    {order.status === 'searching' && order.scheduledFor && now < order.scheduledFor - 30 * 60_000 && <Card tone="olive">
      <Row gap={10}>
        <Ionicons name="calendar-outline" size={24} color={palette.olive} />
        <View style={{ flex: 1 }}>
          <Txt variant="title">{fill(c.scheduledFor, { t: time(order.scheduledFor) })}</Txt>
          <Txt variant="caption">{c.scheduledHint}</Txt>
        </View>
      </Row>
    </Card>}
    {order.status === 'searching' && !(order.scheduledFor && now < order.scheduledFor - 30 * 60_000) && <Card style={{ alignItems: 'center', paddingVertical: 18 }}>
      <Radar color={serviceMeta[order.service].color} size={110}>
        <ServiceIcon service={order.service} size={48} />
      </Radar>
      <Txt variant="h2" center style={{ marginTop: 4 }}>{c.findingTitle}</Txt>
      <Txt center variant="caption" style={{ marginTop: 4, maxWidth: 300 }}>{c.findingBody}</Txt>
    </Card>}

    <Appear index={1}>
      <View style={styles.map}>
        <RouteMap pickup={pickup} dropoff={dropoff} focus={['assigned', 'at_pickup', 'returning'].includes(order.status) ? 'pickup' : 'dropoff'} pickupTitle={from[language]} dropoffTitle={to[language]}
          driver={order.driverLocation} driverTitle={order.driverName} road={road} />
        {live && order.driverId && <Row gap={8} style={{ paddingHorizontal: 12, paddingVertical: 9 }}>
          <Ionicons name={!location || location.stale || error ? 'time-outline' : 'locate-outline'} size={16} color={location?.stale || error ? palette.clayInk : palette.blue} />
          <Txt variant="caption" style={{ flex: 1 }}>{location
            ? fill(location.stale || error ? c.lastDriver : c.liveDriver, { s: age < 60 ? fill(c.agoSeconds, { n: age }) : fill(c.agoMinutes, { n: Math.floor(age / 60) }) })
            : c.noDriverLocation}</Txt>
        </Row>}
        {live && eta && location && !location.stale && !error && <Row gap={8} style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
          <Ionicons name="time" size={16} color={palette.olive} />
          <Txt variant="title" style={{ flex: 1 }}>{fill(['assigned', 'at_pickup', 'returning'].includes(order.status) ? c.etaToPickup : c.etaToDropoff, { lo: eta[0], hi: eta[1] })}</Txt>
        </Row>}
      </View>
    </Appear>

    {order.scheduledFor && (order.status === 'assigned' || order.status === 'at_pickup') && <Card tone="olive" style={{ paddingVertical: 10 }}>
      <Row gap={8}><Ionicons name="calendar-outline" size={18} color={palette.olive} /><Txt variant="title">{fill(c.pickupAt, { t: time(order.scheduledFor) })}</Txt></Row>
    </Card>}
    {order.status === 'searching' && order.scheduledFor && now >= order.scheduledFor - 30 * 60_000 && <Txt variant="caption" center>{fill(c.pickupAt, { t: time(order.scheduledFor) })}</Txt>}
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
        {order.safetyHold && order.safetyReport?.status !== 'open' && <View accessibilityLiveRegion="polite">
          <Row gap={6} style={{ marginTop: 6 }}>
            <Ionicons name="shield-outline" size={16} color={palette.clayInk} />
            <Txt variant="caption" style={{ flex: 1, color: palette.clayInk }}>{c.safetyPaused}</Txt>
          </Row>
        </View>}
        {order.exceptionReason && ['on_hold', 'returning'].includes(order.status) &&
          <Txt variant="caption" style={{ marginTop: 4, color: palette.clayInk }}>{`${c.exceptionTitle}: ${c[`reason_${order.exceptionReason}`]}`}</Txt>}
      </Card>
    </Appear>}

    {(isCustomer || mine) && activeStatuses.includes(order.status) && <View style={{ marginBottom: 12 }}><Safety order={order} onChange={setData} /></View>}

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

    {(isAdmin || ((isCustomer || mine) && (activeStatuses.includes(order.status) || (order.driverId && now - order.updatedAt <= 86_400_000)))) && order.driverId &&
      <Chat orderId={order.id} canWrite={(isCustomer || mine) && activeStatuses.includes(order.status)} live={activeStatuses.includes(order.status)} />}

    {isCustomer && order.handoverCode && live && order.status !== 'returning' && <Appear index={4}>
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

    {isCustomer && order.returnCode && <Appear index={4}>
      <Card tone="clay">
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ flexGrow: 1, flexBasis: 150, gap: 2 }}>
            <Txt variant="title">{c.returnCode}</Txt>
            <Txt variant="caption">{c.returnHint}</Txt>
          </View>
          <View style={[styles.code, { flexDirection: 'row' }]} accessible accessibilityLabel={`${c.returnCode} ${order.returnCode.split('').join(' ')}`}>
            {order.returnCode.split('').map((d, i) => <Text key={i} style={styles.digit}>{d}</Text>)}
          </View>
        </Row>
      </Card>
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
          <Detail label={order.discount > 0 ? c.fare : c.total} value={money(order.price)} strong={!order.discount} />
          {order.discount > 0 && <Detail label={c.promoDiscount} value={money(-order.discount)} />}
          {order.discount > 0 && !isAdmin && <Detail label={isDriver ? c.cashToCollect : c.youPayCash} value={money(order.price - order.discount)} strong />}
          {isDriver && <Detail label={c.youEarn} value={money(order.price - (order.commission ?? commissionOn(order.price, rate)))} strong />}
          {isAdmin && order.commission != null && <Detail label={c.commission} value={money(order.commission)} />}
        </View>
      </Card>
    </Appear>

    <ErrorText>{actionError}</ErrorText>

    {isAdmin && order.status === 'on_hold' && <Card tone="clay">
      <Txt variant="title">{c.exceptionTitle}</Txt>
      <Txt variant="caption" style={{ marginTop: 4, marginBottom: 12 }}>{c.resolveConfirm}</Txt>
      <Field label={c.proofResetReason} value={decisionReason} maxLength={500} disabled={!!busy}
        onChangeText={reason => setDecision({ id, reason })} />
      <View style={{ gap: 8 }}>
        {(['reattempt', 'return'] as const).map(action => <Button key={action} title={action === 'reattempt' ? c.reattempt : c.returnToSender}
          variant={action === 'reattempt' ? 'primary' : 'outline'} icon={action === 'reattempt' ? 'refresh-outline' : 'return-up-back-outline'}
          loading={busy === action} disabled={!!busy || decisionReason.trim().length < 5}
          onPress={() => confirm(c.resolveConfirm, () => act(action, `/admin/orders/${order.id}/resolve`,
            { action, reason: decisionReason.trim() }, () => setDecision({ id, reason: '' })), c.yes, c.no)} />)}
      </View>
    </Card>}

    {isAdmin && order.status === 'returning' && <Card tone="clay">
      <Txt variant="title">{c.confirmReturn}</Txt>
      <Txt variant="caption" style={{ marginTop: 4, marginBottom: 12 }}>{c.confirmReturnHint}</Txt>
      <Field label={c.proofResetReason} value={decisionReason} maxLength={500} disabled={!!busy}
        onChangeText={reason => setDecision({ id, reason })} />
      <Button title={c.confirmReturn} variant="outline" icon="checkmark-done-outline" loading={busy === 'confirm_return'}
        disabled={!!busy || decisionReason.trim().length < 5}
        onPress={() => confirm(c.confirmReturnHint, () => act('confirm_return', `/admin/orders/${order.id}/resolve`,
          { action: 'confirm_return', reason: decisionReason.trim() }, () => setDecision({ id, reason: '' })), c.yes, c.no)} />
    </Card>}

    {isAdmin && (order.status === 'returning' || (order.status === 'in_transit' && order.service !== 'ride')) && <Card>
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
        {needsCode &&
          <Field label={order.status === 'returning' ? c.codeFromSender : c.codeFromCustomer} icon="key-outline" value={code} onChangeText={setCode} keyboardType="phone-pad" placeholder="0000"
            disabled={!!busy || advanceLocked === order.status} />}
        {order.status !== 'on_hold' && !order.safetyHold && <Button title={c[order.status === 'in_transit' && order.service === 'ride' ? 'advance_in_transit_ride' : `advance_${order.status}` as 'advance_assigned']}
          icon="arrow-forward-circle-outline" loading={busy === 'advance'} disabled={!!busy}
          onPress={() => act('advance', `/orders/${order.id}/advance`, { code })} />}
        {order.status === 'in_transit' && order.service !== 'ride' && <Card tone="muted">
          <Txt variant="title" style={{ marginBottom: 8 }}>{c.reportProblem}</Txt>
          <FilterChips items={exceptionReasons.map(key => ({ key, label: c[`reason_${key}`] }))} value={problem.reason}
            onChange={reason => setProblem(p => ({ ...p, reason }))} />
          <Field label={c.problemNote} value={problem.note} maxLength={200} disabled={!!busy} onChangeText={note => setProblem(p => ({ ...p, note }))} />
          <Button title={c.reportProblem} variant="outline" icon="alert-circle-outline" loading={busy === 'problem'} disabled={!!busy}
            onPress={() => confirm(c.reportConfirm, () => act('problem', `/orders/${order.id}/exception`,
              { reason: problem.reason, note: problem.note.trim() }, () => setProblem({ reason: 'absent', note: '' })), c.yes, c.no)} />
        </Card>}
        <Button title={c.navigate} icon="navigate-outline" variant="soft" onPress={() => {
          const toDropoff = order.status === 'in_transit' || order.status === 'on_hold'; // returning goes back to the sender
          openMaps(toDropoff ? order.dropoffPoint ?? null : order.pickupPoint, (toDropoff ? to : from)[language], toDropoff ? order.dropoffNote : order.pickupNote)
            .catch(() => setActionError(c.mapUnavailable));
        }} />
        {!(order.status === 'in_transit' || order.status === 'on_hold' ? order.dropoffPoint : order.pickupPoint) && <Txt center variant="caption">{c.navigateLandmark}</Txt>}
        {order.status === 'assigned' && <Button title={c.release} variant="ghost" size="sm" loading={busy === 'release'}
          onPress={() => confirm(c.releaseConfirm, () => act('release', `/orders/${order.id}/release`, {}, () => router.back()), c.release, c.no)} />}
      </>}

      {order.status === 'completed' && (isCustomer || mine || isAdmin) &&
        <Button title={c.viewReceipt} icon="receipt-outline" variant="outline" onPress={() => router.push(`/receipt/${order.id}`)} />}

      {isCustomer && order.status === 'completed' && <RateDriver order={order} onRate={rating => act('rate', `/orders/${order.id}/rate`, { rating })} />}

      {isCustomer && (live || order.sharing) && <Card>
        <Txt variant="caption" style={{ marginBottom: 8 }}>{c.shareHint}</Txt>
        {sharedUrl?.id === id && <Txt variant="caption" selectable style={{ marginBottom: 8 }}>{sharedUrl.url}</Txt>}
        {live && <Button title={c.shareTracking} icon="share-social-outline" variant="soft" loading={busy === 'share'} disabled={!!busy}
          onPress={async () => {
            setBusy('share'); setActionError('');
            try {
              const { path } = await api<{ path: string }>(`/orders/${order.id}/share`, {});
              const url = `${API_URL}${path}`;
              setSharedUrl({ id, url }); setData({ ...order, sharing: true });
              await Share.share({ message: fill(c.shareMessage, { url }) }).catch(() => undefined); // the link stays visible to copy
            } catch (e) { setActionError(err(e)); } finally { setBusy(null); }
          }} />}
        {order.sharing && <Button title={c.stopSharing} variant="ghost" size="sm" loading={busy === 'unshare'}
          onPress={() => act('unshare', `/orders/${order.id}/share/revoke`, {}, () => { setSharedUrl(null); setData({ ...order, sharing: false }); })} />}
      </Card>}

      {isCustomer && order.dispute && <Card tone={order.dispute.status === 'open' ? 'clay' : 'olive'}>
        <Txt variant="title">{order.dispute.status === 'open' ? c.disputeOpen : c.disputeResolved}</Txt>
        <Txt variant="caption" style={{ marginTop: 4 }}>{order.dispute.resolution ?? order.dispute.reason}</Txt>
        {order.dispute.credit && <Txt variant="label" selectable style={{ marginTop: 6 }}>{fill(c.disputeCredit, { r: money(order.dispute.credit.amount), code: order.dispute.credit.code })}</Txt>}
      </Card>}
      {canDispute && !order.dispute && <Card>
        <Txt variant="title">{c.disputeTitle}</Txt>
        <Txt variant="caption" style={{ marginTop: 4, marginBottom: 12 }}>{c.disputeHint}</Txt>
        <Field label={c.disputeReason} value={disputeReason} multiline maxLength={1000} disabled={!!busy}
          onChangeText={reason => setDispute({ id, reason })} />
        <Button title={c.disputeSend} variant="outline" icon="flag-outline" loading={busy === 'dispute'} disabled={!!busy || disputeReason.trim().length < 10}
          onPress={() => act('dispute', `/orders/${order.id}/dispute`, { reason: disputeReason.trim() }, () => setDispute({ id, reason: '' }))} />
      </Card>}

      {((isCustomer || isAdmin) && ['searching', 'assigned'].includes(order.status)) &&
        <Button title={c.cancelOrder} variant="danger" size="sm" icon="close-circle-outline" loading={busy === 'cancel'}
          onPress={() => confirm(c.cancelConfirm, () => act('cancel', `/orders/${order.id}/cancel`), c.cancelOrder, c.no)} />}
      <Button title={c.help} variant="ghost" icon="help-circle-outline" onPress={() => router.push({ pathname: '/help', params: { order: orderCode(order.id) } })} />
    </View>
  </Screen>;
}

// Uber-style safety toolkit: emergency numbers work without Wind's server; a report reaches Wind's safety team.
const emergency = [['police', '100', 'shield-outline'], ['ambulance', '101', 'medkit-outline'], ['civilDefence', '102', 'flame-outline']] as const;
function Safety({ order, onChange }: { order: Order; onChange: (order: Order) => void }) {
  const { c, err } = useCopy();
  const [open, setOpen] = useState(order.safetyReport?.status === 'open');
  const [kind, setKind] = useState<SafetyKind>('unsafe_driving');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const report = order.safetyReport;
  async function send() {
    setBusy(true); setFailure('');
    try {
      onChange(await api<Order>(`/orders/${order.id}/sos`, { kind, note: note.trim() })); haptic.success(); setNote('');
      AccessibilityInfo.announceForAccessibility(c.safetyReported); // live regions alone are silent on iOS
    }
    catch (e) { haptic.error(); setFailure(err(e)); } finally { setBusy(false); }
  }
  if (!open) return <Button title={c.safety} icon="shield-checkmark-outline" variant="outline" onPress={() => setOpen(true)} />;
  return <Card tone="clay">
    <Row gap={8} style={{ marginBottom: 4 }}>
      <Ionicons name="shield-checkmark" size={22} color={palette.clayInk} />
      <Txt variant="title" style={{ flex: 1 }}>{c.safety}</Txt>
      <IconButton icon="close" label={c.close} onPress={() => setOpen(false)} />
    </Row>
    <Txt variant="caption" style={{ marginBottom: 10 }}>{c.safetyEmergencyHint}</Txt>
    <View style={{ gap: 8, marginBottom: 14 }}>
      {emergency.map(([key, number, icon]) => <Button key={key} title={c[key]} trailing={number} icon={icon} variant="danger"
        onPress={() => { Linking.openURL(`tel:${number}`).catch(() => setFailure(c.callUnavailable)); }} />)}
    </View>
    {report?.status === 'open' ? <View accessibilityLiveRegion="assertive">
      <Txt variant="title">{c.safetyReported}</Txt>
      <Txt variant="caption" style={{ marginTop: 4 }}>{c.safetyReportedHint}</Txt>
    </View> : <>
      {report && <Txt variant="caption" style={{ marginBottom: 10 }}>{`${c.safetyResolved}: ${report.resolution ?? ''}`}</Txt>}
      <Txt variant="title" style={{ marginBottom: 8 }}>{c.safetyReport}</Txt>
      <FilterChips items={safetyKinds.map(key => ({ key, label: c[`safety_${key}`] }))} value={kind} onChange={setKind} />
      <Field label={c.problemNote} value={note} maxLength={300} multiline disabled={busy} onChangeText={setNote} />
      <Button title={c.safetySend} icon="alert-circle-outline" variant="outline" loading={busy} disabled={busy}
        onPress={() => confirm(c.safetyConfirm, send, c.yes, c.no)} />
    </>}
    <ErrorText>{failure}</ErrorText>
  </Card>;
}

type Message = { id: number; mine: boolean; role: 'customer' | 'driver'; body: string; createdAt: number };
const quickReplies = ['qrOnMyWay', 'qrArrived', 'qrCallMe', 'qrLate'] as const;

// In-trip chat: cheaper than calls on local plans and kept for support. Polls while the order screen is open.
function Chat({ orderId, canWrite, live }: { orderId: number; canWrite: boolean; live: boolean }) {
  const { c, err, row, rtl } = useCopy();
  const { time } = useFormat();
  const { data, error, setData } = useApi<Message[]>(`/orders/${orderId}/messages`, live ? 5000 : undefined);
  // Announce only new messages from the other side; a live region around the list would re-read it every poll.
  const seen = useRef<number | null>(null);
  useEffect(() => {
    const last = data?.at(-1);
    if (!last) return;
    if (seen.current !== null && last.id > seen.current && !last.mine) AccessibilityInfo.announceForAccessibility(`${c[last.role]}: ${last.body}`);
    seen.current = last.id;
  }, [data, c]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  async function send(body: string) {
    if (!body.trim() || busy) return;
    setBusy(true); setFailure('');
    try { setData(await api<Message[]>(`/orders/${orderId}/messages`, { body: body.trim() })); if (body === draft) setDraft(''); haptic.success(); }
    catch (e) { haptic.error(); setFailure(err(e)); } finally { setBusy(false); }
  }
  const recent = (data ?? []).slice(-20);
  return <Card>
    <Row gap={8} style={{ marginBottom: 8 }}>
      <Ionicons name="chatbubbles-outline" size={20} color={palette.olive} />
      <Txt variant="title" style={{ flex: 1 }}>{c.messages}</Txt>
    </Row>
    {error && !data ? <ErrorText>{err(error)}</ErrorText> : recent.length === 0
      ? <Txt variant="caption" style={{ marginBottom: 8 }}>{canWrite ? c.chatEmpty : c.chatNone}</Txt>
      : <View style={{ gap: 6, marginBottom: 8 }}>
        {recent.map(m => <View key={m.id} style={[styles.bubble, { alignSelf: m.mine === rtl ? 'flex-start' : 'flex-end', backgroundColor: m.mine ? palette.olivePale : palette.muted }]}
          accessible accessibilityLabel={`${m.mine ? c.you : c[m.role]}: ${m.body}, ${time(m.createdAt)}`}>
          {!m.mine && <Txt variant="micro">{c[m.role]}</Txt>}
          <Txt>{m.body}</Txt>
          <Txt variant="micro">{time(m.createdAt)}</Txt>
        </View>)}
      </View>}
    {canWrite && <>
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {quickReplies.map(key => <Press key={key} accessibilityLabel={`${c.send}: ${c[key]}`} disabled={busy} onPress={() => send(c[key])} style={styles.quick}>
          <Txt variant="label" style={{ color: palette.olive }}>{c[key]}</Txt>
        </Press>)}
      </View>
      <Field label={c.chatMessage} value={draft} onChangeText={setDraft} maxLength={500} multiline disabled={busy} />
      <Button title={c.send} icon="send-outline" variant="soft" loading={busy} disabled={busy || !draft.trim()} onPress={() => send(draft)} />
    </>}
    <ErrorText>{failure}</ErrorText>
  </Card>;
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
  bubble: { maxWidth: '85%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  quick: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 22, backgroundColor: palette.olivePale },
});
