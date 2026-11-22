// Trip / order screen, Uber pattern: map on top, one status line with a progress bar, the driver card
// with a call button, the handover code, then the route and receipt details. Same screen for all roles.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Animated, { useReducedMotion, ZoomIn } from '../../motion';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, API_URL, ApiError, apiSessionRevision, useApi, useLiveFix } from '../../api';
import { canOrderAgain, canSendAnother, newRequestId, scheduleSlots } from '../../booking';
import { delivered, outboxKey, outboxStore, sendText, without, type Unsent } from '../../chat-outbox';
import { storage } from '../../storage';
import { AdminAssign } from '../../admin-assign';
import { acceptPosition, useDriverWork } from '../../driver-work';
import { activeStatuses, bookedAhead, pickupPayCents, canTake, city, commissionOn, crowKm, doorCashMaxCents, exceptionReasons, isolate, pickupRefusal, pickupRefusalDetails, shopExceptionReasons, suggestedNextAction, finishedStatuses, minorFromText, orderCode, roadAlerts, safetyKinds, statusFlow, typedNumber, varianceAllowed, varianceReasons, type ExceptionReason, type Order, type PickupRefusalDetail, type Point, type Road, type SafetyKind, type VarianceReason } from '../../model';
import { SealToggles, sealsBody, sealsReady, ShopAdminPanel, ShopCustomerPanel, ShopHandover } from '../../shop-ui';
import { EtaLine, etaShort, RouteLine, ServiceIcon, SlotPicker, statusText, useFormat } from '../../parts';
import { codeInput } from '../../phone/flow';
import { locationState, newerFix } from '../../location-state';
import { DestinationChangeCard } from '../../destination-change';
import { FreightDetails } from '../../freight-details';
import { arrivalDistanceKm, capacityCommand, dispatchAcceptance, parcelPickupFarKm, RIDE_ARRIVAL_RADIUS_METERS, rideStep, secondsUntil } from '../../ride-flow';
import { arrivingNow, kmLabel } from '../../map-math';
import { advanceRequest, type AdvanceRequest } from '../../driver-command';
import { recoverDriverAction } from '../../driver-recovery';
import { useDriverRecovery } from '../../use-driver-recovery';
import { effectiveRuntime } from '../../runtime-config';
import { MapSheet, SIDE_SHEET, useSideSheet } from '../../map-sheet';
import { maneuverDistance, maneuverIcon, maneuverText, nextManeuver } from '../../nav-steps';
import RouteMap from '../../route-map';
import { RouteCheckpoints, useRoad } from '../../road';
import { CustodyChain } from '../../custody';
import { OfficePanel } from '../../office-ui';
import { registerNativePush } from '../../native-push';
import { useSession } from '../../session';
import { journeyState } from '../../theme';
import {
  Appear, Avatar, Badge, BoundedFooter, Button, Card, confirm, ErrorText, Field, FilterChips, fill, haptic, Header, headingFont, IconButton, iconSize, Loading, maxScale, palette, Press, Pulse, Radar, Row, Screen, shadow, statusTone, Txt, useCopy,
} from '../../ui';

const DONE = ZoomIn.duration(300);
const steps = statusFlow.slice(1); // assigned → completed

// Exact pins open turn-by-turn directions; without one, a search for the landmark is the best we can do.
function openMaps(point: Point | null, place: string, landmark: string, region: string) {
  if (point) {
    const at = `${point.latitude},${point.longitude}`;
    if (Platform.OS === 'android') return Linking.openURL(`google.navigation:q=${at}`).catch(() => Linking.openURL(`geo:${at}?q=${at}`));
    return Linking.openURL(Platform.select({ ios: `maps:?daddr=${at}&dirflg=d`, default: `https://www.google.com/maps/dir/?api=1&destination=${at}` }));
  }
  const q = encodeURIComponent(`${landmark}, ${place}, ${region}`);
  return Linking.openURL(Platform.select({ ios: `maps:0,0?q=${q}`, android: `geo:0,0?q=${q}`, default: `https://www.google.com/maps/search/?api=1&query=${q}` }));
}

/** Read inside the accept handler, never during render (React Compiler's purity rule cannot tell the two apart here). */
const tapTime = () => Date.now();
/** The A11 reasons that fit this amount, in the owner's order. */
const allowedReasons = (collected: number, due: number) => varianceReasons.filter(reason => varianceAllowed(collected, due, reason));

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const work = useDriverWork();
  const { c, language, money, err, row, rtl } = useCopy();
  // A reason this build has no words for (a newer build's, or support's own holds) shows the title alone, never "undefined".
  const reasonLine = (title: string, key: string) => {
    const label = (c as Record<string, string | undefined>)[key];
    return label ? `${title}: ${label}` : title;
  };
  const { time } = useFormat();
  const { data: polled, error, reload, setData } = useApi<Order>(`/orders/${id}?capacityProtocol=1&recoveryProtocol=1&liveProtocol=1`, effectiveRuntime().values.orderRefreshMs);
  // The driver's position comes over the live push as soon as it is stored; the 4 s poll carries everything else.
  const pushed = useLiveFix<NonNullable<Order['driverLocation']>>(polled?.driverId && activeStatuses.includes(polled.status) ? `/orders/${id}/live?driver=${polled.driverId}${polled.assignmentEpoch == null ? '' : `&assignment=${polled.assignmentEpoch}`}` : null); // A→B→A restarts the watch (Sol R3-M3)
  // The server stops sending a fix after 120 s; keep the last one seen for this order and assignment so the map shows
  // it faded as "last known" instead of dropping the car (a reload, another order or another driver starts without it).
  const fresh = polled && pushed.value !== undefined ? newerFix(pushed.value, polled.driverLocation) : polled?.driverLocation;
  const assignment = polled && `${polled.id}:${polled.driverId}:${polled.assignmentEpoch ?? polled.assignedAt ?? ''}`; // A→B→A is a new assignment (Sol M5)
  const [kept, setKept] = useState<{ assignment: string; fix?: NonNullable<Order['driverLocation']> }>();
  if (assignment && (kept?.assignment !== assignment || (fresh && fresh !== kept?.fix))) setKept({ assignment, fix: fresh ?? undefined });
  const shown = fresh ?? (polled && kept?.assignment === assignment && activeStatuses.includes(polled.status) ? kept?.fix : null) ?? null;
  // A reassignment invalidates the snapshot's driver: hide the old car and name
  // even while the refresh that brings the new driver is failing.
  const order = useMemo(() => polled && { ...polled, ...(pushed.driverChanged
    ? { driverName: undefined, driverPhone: undefined, driverLocation: null }
    : { driverLocation: shown }) }, [polled, shown, pushed.driverChanged]);
  // The server's attempt ceiling wins over the reason's suggestion (SHIP-08, Sol R2-M6): one recommendation, one primary action.
  const suggested = order?.reattemptAllowed === false ? 'return' : suggestedNextAction(order ? order.exceptionReason : null);
  const announced = useRef<{ orderId: number; viewerId: number; status: Order['status']; proposalId?: string } | null>(null);
  useEffect(() => {
    if (!order || !me) return;
    const driver = me.user.role === 'driver' && order.driverId === me.user.id;
    const proposal = (me.user.role === 'customer' || driver) && ['assigned', 'at_pickup', 'in_transit'].includes(order.status) ? order.destinationChange?.id : undefined;
    const before = announced.current;
    announced.current = { orderId: order.id, viewerId: me.user.id, status: order.status, proposalId: proposal };
    if (!before || before.orderId !== order.id || before.viewerId !== me.user.id) return;
    const status = before.status !== order.status ? statusText(c, order, driver) : '';
    const destination = proposal && before.proposalId !== proposal ? driver ? c.destinationDriverRequest : c.destinationWaiting : '';
    const message = [status, destination].filter(Boolean).join(' ');
    if (message && Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(message);
  }, [order, me, c]);
  const [busy, setBusy] = useState<string | null>(null);
  const acting = useRef(false); // two taps before a re-render both saw busy === null; accept, cancel and arrive carry no request id
  const focusRevision = useRef(0);
  useFocusEffect(useCallback(() => { focusRevision.current++; return () => { focusRevision.current++; }; }, []));
  const [actionError, setActionError] = useState('');
  const proofContext = `${id}:${me?.user.id}:${polled?.driverId}:${polled?.assignedAt}:${polled?.recovery?.assignmentEpoch}:${polled?.journey?.boarding?.pinRevision}:${polled?.ride?.boardingLocked}:${polled?.status}`;
  const [proofInput, setProofInput] = useState({ context: proofContext, value: '' });
  if (proofInput.context !== proofContext) setProofInput({ context: proofContext, value: '' });
  const code = proofInput.context === proofContext ? proofInput.value : '';
  const setCode = (value: string) => setProofInput({ context: proofContext, value: codeInput(value, 4) });
  // WP-01: the cash taken at the door, typed by the driver; prefilled with what is due, so an exact payment is one tap.
  // A difference needs a reason the driver picks for this amount: never a default, and a new amount clears it.
  const [door, setDoor] = useState<{ context: string; text: string | null; reason: VarianceReason | null }>({ context: proofContext, text: null, reason: null });
  const [advanceLocked, setAdvanceLocked] = useState<string | null>(null);
  const advanceAttempt = useRef<{ orderId: number; body: AdvanceRequest } | null>(null);
  const [proofReset, setProofReset] = useState({ id, reason: '', done: false });
  const [problem, setProblem] = useState<{ reason: ExceptionReason | 'wrong_or_missing_item' | typeof pickupRefusal; detail?: PickupRefusalDetail; note: string }>({ reason: 'absent', note: '' });
  const [seals, setSeals] = useState<Record<number, boolean>>({}); // shop: each sealed package intact or broken (DLV-14)
  const problemAttempt = useRef<{ orderId: number; status: string; requestId: string } | null>(null);
  useDriverRecovery(polled, me?.user.id, !error && me?.user.role === 'driver' && !busy,
    reload, next => { setData(next); work.update(next); }, () => { setAdvanceLocked(null); advanceAttempt.current = null; problemAttempt.current = null; });
  const [decision, setDecision] = useState({ id, reason: '' });
  const [dispute, setDispute] = useState({ id, reason: '' });
  const [report, setReport] = useState({ id, open: false }); // keyed like the dispute draft: another order starts closed
  const reportOpen = report.id === id && report.open;
  const [sharedUrl, setSharedUrl] = useState<{ id: string; url: string } | null>(null);
  const [moving, setMoving] = useState<number | null>(null); // a scheduled parcel's new time while the customer picks it
  const [now, setNow] = useState(Date.now);
  const reduced = useReducedMotion();
  const [sheetOpen, setSheetOpen] = useState(false);
  const side = useSideSheet();
  const [peek, setPeek] = useState(0);
  const [topBar, setTopBar] = useState(0);
  const navigating = !!order && me?.user.role === 'driver' && order.driverId === me.user.id;
  const { road, approach, eta, km, avoids, through, closed, steps: navSteps, navLine } = useRoad(order, navigating ? language : null);
  useEffect(() => { if (pushed.driverChanged) void reload(); }, [pushed.driverChanged, reload]);
  // Live ETA ignores checkpoints; a recent slow/closed report on the route drops its upper bound (SPEC-road-aware-eta.md).
  const roads = useApi<Road[]>(eta ? '/roads' : null, 60_000).data ?? [];
  const alerts = order ? roadAlerts(roads, order.pickupCity, order.dropoffCity) : [];
  useFocusEffect(useCallback(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 5_000); // location age and arrival clock stay current
    return () => clearInterval(timer);
  }, []));

  // A customer is asked for notifications here, with an order on its way: every route to a first order (booking, a recovered
  // booking, order again, shop checkout) lands on this screen, and "your driver accepted" is then the reason (product audit, 21 Nov).
  const customerLive = me?.user.role === 'customer' && !!order && (order.status === 'searching' || activeStatuses.includes(order.status));
  useEffect(() => { if (customerLive) void registerNativePush(language, 'once'); }, [customerLive, language]);

  if (!order || !me) return <Screen><Header title={/^\d+$/.test(id) ? orderCode(Number(id)) : c.orders} back /><ErrorText>{error && err(error)}</ErrorText><Loading failed={!!error} onRetry={reload} /></Screen>;

  const role = me.user.role;
  const isCustomer = role === 'customer', isDriver = role === 'driver', isAdmin = role === 'admin';
  const mine = isDriver && order.driverId === me.user.id;
  const toPickup = ['assigned', 'at_pickup', 'returning'].includes(order.status) && !mine;
  // Header chip and map label: the same words as EtaLine (arrival first, then the shared short wording).
  const etaChip = ([lo, hi]: [number, number]) => arrivingNow(lo, alerts.length > 0) ? (toPickup ? c.arrivingPickup : c.arrivingDropoff) : etaShort(c, [lo, hi], alerts.length > 0);
  const cancelled = order.status === 'cancelled';
  const returned = order.status === 'returned';
  const from = city(order.pickupCity), to = city(order.dropoffCity);
  const pickup = order.pickupPoint ?? from, dropoff = order.dropoffPoint ?? to;
  // A held or returning item is still past pickup; the bar does not move backwards.
  const step = steps.indexOf(['on_hold', 'returning'].includes(order.status) ? 'in_transit' : order.status);
  // a ride under way needs no step, for rider or driver: the bar shows it, and help sits at the foot.
  // Steps speak to the customer or the assigned driver; an admin is neither.
  const next = (isCustomer || mine) && (c as Record<string, string | undefined>)[`${mine ? 'driver_' : ''}${order.service === 'ride' ? 'ride_' : ''}next_${order.status}`];
  const live = order.status === 'searching' || activeStatuses.includes(order.status);
  const rate = me.plan === 'pro' ? me.settings.proCommission : me.settings.commission;
  const resetReason = proofReset.id === id ? proofReset.reason : '';
  const decisionReason = decision.id === id ? decision.reason : '';
  const disputeReason = dispute.id === id ? dispute.reason : '';
  const rideAction = rideStep(order);
  // Like a geofence prompt: Arrive leads only once the latest fix is inside the server's arrival radius.
  const arrivalKm = mine && rideAction === 'arrive' ? arrivalDistanceKm(order.pickupPoint, order.driverLocation, now) : null;
  const arrivalFar = arrivalKm !== null && arrivalKm * 1000 > RIDE_ARRIVAL_RADIUS_METERS;
  const parcelFarKm = mine ? parcelPickupFarKm(order, now) : null;
  const farFill = (pinned: string, cityLevel: string) => parcelFarKm === null ? '' // no pin: the distance is to the city centre
    : order.pickupPoint ? fill(pinned, { km: kmLabel(parcelFarKm) }) : fill(cityLevel, { km: kmLabel(parcelFarKm), city: from[language] });
  const doorStep = !!mine && order.status === 'in_transit' && (order.service === 'parcel' || order.service === 'shop');
  // A shop door collects the goods and both fees (DLV-15); a parcel door the fare less its discount.
  const dueCents = order.service === 'shop' && order.shop ? order.shop.cashAgorot : Math.round((order.price - order.discount) * 100);
  const shopProof = order.service === 'shop' && order.status === 'in_transit' ? { seals: sealsBody(order, seals) } : {};
  const doorOwn = door.context === proofContext ? door : { text: null, reason: null };
  const doorText = doorOwn.text ?? String(dueCents / 100);
  const collectedCents = minorFromText(doorText);
  const doorValid = Number.isSafeInteger(collectedCents) && collectedCents >= 0 && collectedCents <= doorCashMaxCents; // the server refuses more (invalid_input)
  const doorDiffers = doorValid && collectedCents !== dueCents;
  const doorReasons = doorDiffers ? allowedReasons(collectedCents, dueCents) : [];
  const doorReady = doorValid && varianceAllowed(collectedCents, dueCents, doorDiffers ? doorOwn.reason : null);
  const doorProof = doorStep && doorReady ? { collectedCents, ...(doorDiffers && doorOwn.reason ? { varianceReason: doorOwn.reason } : {}) } : {};
  const needsCode = rideAction === 'boarding' || (order.status === 'in_transit' && order.service !== 'ride') || (order.status === 'returning' && !order.supportHasGoods);
  const boarding = order.journey?.boarding;
  const boardingPin = boarding ? boarding.shouldShow ? boarding.pin : undefined : order.ride?.boardingCode;
  const waitingEndsAt = order.journey?.waiting?.waitingEndsAt ?? order.ride?.graceUntil;
  const rideNoShow = mine && order.service === 'ride' && !!order.ride && !order.safetyHold
    && ['assigned', 'at_pickup'].includes(order.status) && waitingEndsAt != null
    && order.recovery?.assignmentEpoch != null && secondsUntil(waitingEndsAt, now, order.journey) <= 0;
  const fareChange = order.journey?.lastFareChange;
  // Same rule as the jobs board (H-02, Sol R2-M5): with presence on, an offline idle captain goes online first.
  const offlineIdle = me?.capabilities?.driverPresence !== false && !work.orders.length && work.presenceState !== 'online';
  const atPickup = order.status === 'at_pickup';
  const canDispute = isCustomer && finishedStatuses.includes(order.status) && now - order.updatedAt <= 7 * 86_400_000;

  async function act(key: string, path: string, body: object = {}, after?: () => void) {
    if (!order || busy || acting.current || key === 'accept' && (!work.known || !canTake(work.orders, order.service))) return;
    acting.current = true;
    setBusy(key);
    setActionError('');
    const session = apiSessionRevision(), focus = focusRevision.current;
    try {
      if (mine && order.recovery && (key === 'advance' || key === 'problem')) {
        if (key === 'advance') setAdvanceLocked(order.status);
        const result = await recoverDriverAction(me!.user.id, order, key === 'advance' ? 'advance' : 'exception',
          key === 'advance' ? { ...(needsCode && code ? { code } : {}), ...doorProof, ...shopProof } : { reason: problem.reason as ExceptionReason, ...(problem.reason === pickupRefusal && { detail: problem.detail }), note: problem.note.trim(), ...shopProof },
          () => apiSessionRevision() === session && focusRevision.current === focus);
        if (result.state === 'previous') {
          // An earlier saved action was settled first: show where the order stands and let the driver repeat this one.
          const earlier = result.previous;
          if ('order' in earlier && earlier.order) { setData(earlier.order); work.update(earlier.order); }
          throw new ApiError('driver_command_previous', 409); // the catch below reloads once for every recovery 4xx
        }
        if (result.state === 'other_order') throw new ApiError('driver_command_other_order', 409);
        if (result.state === 'other_settled') throw new ApiError(result.notice, 409); // reloaded once by the catch, not twice
        if (result.state === 'conflict') throw new ApiError('order_changed', 409);
        if (result.state === 'rejected') throw new ApiError(result.error ?? 'server_error', result.httpStatus ?? 400);
        if (result.state !== 'applied') throw new ApiError('driver_command_pending', 409);
        setAdvanceLocked(null);
        if ('order' in result && result.order) { setData(result.order); work.update(result.order); } else await reload();
        haptic.success(); after?.(); return;
      }
      if (key === 'accept') {
        const prepared = await work.prepareTracking();
        if (apiSessionRevision() !== session || focusRevision.current !== focus) return;
        if (!prepared) { setActionError(c.locationOff); return; }
        const lease = dispatchAcceptance(order, tapTime());
        if (lease === null) { setActionError(c.dispatchExpired); return; }
        const position = await acceptPosition(order.service);
        if (apiSessionRevision() !== session || focusRevision.current !== focus) return;
        body = { ...lease, ...capacityCommand(order), position };
      }
      if (key === 'advance') {
        setAdvanceLocked(order.status);
        const attempt = advanceAttempt.current = advanceRequest(advanceAttempt.current, order.id,
          { expectedStatus: order.status, code: needsCode ? code : '', ...doorProof, ...shopProof, ...(boarding ? { expectedPinRevision: boarding.pinRevision } : {}) }, newRequestId);
        body = attempt.body;
      }
      if (key === 'problem') { // one request id per order, so a lost acknowledgement replays instead of failing
        if (problemAttempt.current?.orderId !== order.id || problemAttempt.current.status !== order.status)
          problemAttempt.current = { orderId: order.id, status: order.status, requestId: newRequestId() };
        body = { ...body, requestId: problemAttempt.current.requestId, expectedStatus: order.status };
      }
      if (key.startsWith('offer')) body = { ...body, ...capacityCommand(order) };
      const next = await api<Order | { ok: true }>(path, body);
      if (apiSessionRevision() !== session || focusRevision.current !== focus) return;
      if (key === 'advance') { advanceAttempt.current = null; setAdvanceLocked(null); }
      if (key === 'problem') problemAttempt.current = null;
      haptic.success();
      if ('id' in next) {
        setData(next);
        if (isDriver) work.update(next);
      } else {
        if (mine && key === 'release') work.update({ ...order, status: 'searching' });
        await reload(); // arrival/dispatch responses carry partial summaries, never an Order
      }
      after?.();
    } catch (e) {
      if (apiSessionRevision() !== session || focusRevision.current !== focus) return;
      if (key === 'accept' && e instanceof ApiError && (e.offerFailure?.recovery === 'reconcile' || !e.status)) {
        await Promise.all([reload(), work.reload()]);
        if (apiSessionRevision() !== session || focusRevision.current !== focus) return;
      }
      // A rejected proof is a recorded decision and advances the recovery revision.
      // Keep actions busy until the next attempt can bind to a fresh authorized snapshot.
      if (mine && order.recovery && e instanceof ApiError && e.status && e.status < 500 && ![401, 408, 429].includes(e.status)) {
        await reload();
        if (apiSessionRevision() !== session || focusRevision.current !== focus) return;
      }
      if (key === 'advance' && e instanceof ApiError && e.status && e.status < 500 && ![401, 408, 429].includes(e.status)
        && e.message !== 'idempotency_conflict') { advanceAttempt.current = null; setAdvanceLocked(null); }
      if (key === 'problem' && e instanceof ApiError && e.status && e.status < 500 && ![401, 408, 429].includes(e.status)) problemAttempt.current = null;
      haptic.error();
      setActionError(err(e));
    } finally { acting.current = false; setBusy(null); }
  }

  const location = locationState(order.driverLocation, now);
  const age = location?.ageSeconds ?? 0;
  const later = bookedAhead(order, now) ? order.scheduledFor! : 0; // booked ahead: the time
  const finding = order.status === 'searching' && !later;
  const searchMinutes = finding ? Math.max(0, Math.floor((now - Math.max(order.createdAt, order.scheduledFor ?? 0)) / 60_000)) : 0;
  // Help with this order, one tap from the top on every state (it opened only from the foot of a long page): the help page
  // prefills the support message with the order number (product audit, 21 Nov).
  const helpButton = <IconButton icon="help-circle-outline" label={c.helpWithOrder} tone="muted" onPress={() => router.push({ pathname: '/help', params: { order: orderCode(order.id) } })} />;
  // The booked time stays in the closed sheet until pickup, including the last 30 minutes while drivers already see it.
  const booked = order.status === 'searching' && order.scheduledFor && now < order.scheduledFor ? order.scheduledFor : 0;

  const nextStop = ['assigned', 'at_pickup', 'returning'].includes(order.status) ? 'pickup' : 'dropoff';
  const maneuver = navigating && navSteps && navLine && order.driverLocation && !location?.stale ? nextManeuver(navSteps, order.driverLocation, navLine, order.driverLocation.heading) : null;
  // Near the door the customer needs this at a glance, so it leaves the sheet's body for the header a closed sheet still shows.
  const codeAtDoor = live && ['in_transit', 'on_hold', 'returning'].includes(order.status);
  const codes = <>
    {isCustomer && order.handoverCode && live && order.status !== 'returning' && order.status !== 'on_hold' && <Appear index={4}>{/* no captain is coming while support decides (H-10) */}
      <Card tone="muted">{/* a code to give, not a warning: neutral, like the design system HandoverCode */}
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ flexGrow: 1, flexBasis: 150, gap: 2 }}>
            <Txt variant="title">{c.handoverCode}</Txt>
            <Txt variant="caption">{c.handoverHint}</Txt>
          </View>
          <View style={[styles.code, { flexDirection: 'row' /* ltr: code digits read left to right */ }]} accessible accessibilityLabel={`${c.handoverCode} ${order.handoverCode.split('').join(' ')}`}>
            {order.handoverCode.split('').map((d, i) => <CodeDigit key={i} digit={d} />)}
          </View>
        </Row>
      </Card>
    </Appear>}

    {isCustomer && order.returnCode && <Appear index={4}>
      <Card tone="muted">
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ flexGrow: 1, flexBasis: 150, gap: 2 }}>
            <Txt variant="title">{c.returnCode}</Txt>
            <Txt variant="caption">{c.returnHint}</Txt>
          </View>
          <View style={[styles.code, { flexDirection: 'row' /* ltr: code digits read left to right */ }]} accessible accessibilityLabel={`${c.returnCode} ${order.returnCode.split('').join(' ')}`}>
            {order.returnCode.split('').map((d, i) => <CodeDigit key={i} digit={d} />)}
          </View>
        </Row>
      </Card>
    </Appear>}
  </>;
  const body = <>
    {/* completed: the banner below already says it, with the time; searching and in a trip, the card below heads with the same words; a second badge one line above only echoes */}

    {order.status === 'completed' && <Animated.View entering={reduced ? undefined : DONE}>
      <Card tone="olive" style={{ paddingVertical: 12 }}>
        <Row gap={10}>
          <Ionicons name="checkmark-circle" size={26} color={palette.olive} />
          <View style={{ flex: 1 }}>
            <Txt variant="title">{statusText(c, order, mine)}</Txt>
            <Txt variant="caption">{time(order.updatedAt)}</Txt>
          </View>
        </Row>
      </Card>
    </Animated.View>}

    {/* Status stays visible even if native entering animations are interrupted. */}
    {!!later && <Card tone="olive">
      <Row gap={10}>
        <Ionicons name="calendar-outline" size={24} color={palette.olive} />
        <View style={{ flex: 1 }}>
          {!live && <Txt variant="title">{fill(c.scheduledFor, { t: time(later) })}</Txt>}{/* over the map the sheet header already says it */}
          <Txt variant="caption">{c.scheduledHint}</Txt>
        </View>
      </Row>
      {isCustomer && order.service === 'parcel' && (moving === null
        ? <View style={{ marginTop: 10 }}><Button title={c.changeTime} variant="outline" size="sm" icon="time-outline"
          onPress={() => { const slots = scheduleSlots(); setMoving(slots.includes(later) ? later : slots[0] ?? null); }} /></View>
        : <View style={{ marginTop: 10, gap: 8 }}>
          <SlotPicker slots={scheduleSlots()} value={moving} onChange={setMoving} />
          <Row gap={8} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>{/* a disabled Save carries its reason underneath, and large text moves Keep to its own line */}
            <Button title={c.saveTime} size="sm" loading={busy === 'schedule'} disabled={!!busy || moving === later} reason={busy ? c.wait_busy : c.time_unchanged}
              onPress={() => act('schedule', `/orders/${order.id}/schedule`, { scheduledFor: moving }, () => setMoving(null))} />
            <Button title={c.keepTime} variant="ghost" size="sm" disabled={!!busy} reason={c.wait_busy} onPress={() => setMoving(null)} />
          </Row>
        </View>)}
    </Card>}
    {/* Driver offers (SPEC-driver-offers.md): cheapest first, with what the customer needs to choose a driver. */}
    <FreightDetails order={order} />
    {isCustomer && order.status === 'searching' && !order.dispatch && order.offers && <Card>
      <Txt variant="title">{c.driverOffers}</Txt>
      {order.offers.length === 0 && <Txt variant="caption" style={{ marginTop: 4 }}>{fill(c.noOffers, { p: money(order.price) })}</Txt>}
      {order.offers.map(offer => <Row key={offer.driverId} gap={10} style={styles.divider}>
        <Avatar name={offer.name} />
        <View style={{ flex: 1 }}>
          <Txt variant="title">{offer.name}</Txt>
          <Txt variant="caption">{[offer.vehicle && c[offer.vehicle], offer.rating == null ? c.newDriver : `★ ${offer.rating}`,
            offer.priceRating != null && fill(c.priceStars, { r: offer.priceRating }), !!offer.trips && fill(c.tripsCount, { n: offer.trips })].filter(Boolean).join(' · ')}</Txt>
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Txt variant="h2">{money(offer.price)}</Txt>
          <Button title={c.acceptOffer} size="sm" loading={busy === `offer${offer.driverId}`} disabled={!!busy} reason={c.wait_busy}
            onPress={() => act(`offer${offer.driverId}`, `/orders/${order.id}/offers/${offer.driverId}/accept`, {})} />
        </View>
      </Row>)}
    </Card>}

    {!live && <Appear index={1}><View style={styles.map}>
        <RouteMap pickup={pickup} dropoff={dropoff} focus={['assigned', 'at_pickup', 'returning'].includes(order.status) ? 'pickup' : 'dropoff'} pickupTitle={from[language]} dropoffTitle={to[language]}
          driver={order.driverLocation} driverTitle={order.driverName} road={road} approach={approach} closed={closed}
          stale={!!location?.stale} height={live && order.driverLocation ? 300 : undefined} />
      </View></Appear>}
    {live && <>
        {live && order.driverId && <Row gap={8} style={{ paddingHorizontal: 12, paddingVertical: 9 }}>
          {/* The icon follows the fix, not the poll: a dropped request must not make a live car look stale. */}
          <Ionicons name={!location || location.stale || location.reconnecting ? 'time-outline' : 'locate-outline'} size={16} color={location?.stale || location?.reconnecting ? palette.warn : palette.blue} />
          <Txt variant="caption" style={{ flex: 1 }}>{location
            ? fill(location.stale ? c.lastDriver : location.reconnecting ? c.driverSignalWeak : mine ? c.liveYou : c.liveDriver, { s: age < 60 ? fill(c.agoSeconds, { n: age }) : fill(c.agoMinutes, { n: Math.floor(age / 60) }) })
            : mine ? c.noYourLocation : c.noDriverLocation}</Txt>
        </Row>}
        {live && eta && location && !location.stale && <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
          {/* "the driver arrives" is for the other parties; the driver reads the neutral arrival line */}
          <EtaLine eta={eta} km={km} now={now} slow={alerts.length > 0} toPickup={toPickup} />
        </View>}
        {live && order.sharedRun && location && !location.stale && <Row gap={8} style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
          <Ionicons name="layers-outline" size={16} color={palette.olive} />
          <Txt variant="caption" style={{ flex: 1 }}>{c.courierRun}</Txt>
        </Row>}
        {/* The driver is close: get the parcel ready (Uber tells the rider when the car is around the corner). */}
        {live && isCustomer && !mine && order.status === 'assigned' && order.pickupPoint && order.driverLocation && !location?.stale
          && crowKm(order.pickupPoint, order.driverLocation) * 1000 <= 500 && <Row gap={8} style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
          <Ionicons name="walk-outline" size={16} color={palette.olive} />
          <Txt variant="caption" style={{ flex: 1, color: palette.olive }}>{fill(c.driverNearby, { m: 500 })}</Txt>
        </Row>}
        {live && eta && location && !location.stale && alerts.length > 0 && <Press accessibilityRole="link" accessibilityLabel={`${c.roadAlert}: ${c.roads}`}
          onPress={() => router.push('/roads')} style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
          <Row gap={8}>
            <Ionicons name="warning-outline" size={16} color={palette.warn} />
            <Txt variant="caption" style={{ flex: 1, color: palette.warn }}>{(rtl ? '\u200f' : '\u200e') + alerts.map(r => `${isolate(r.name)}: ${c[`road_${r.status!}`]}`).join(' · ')}</Txt>
          </Row>
        </Press>}
        {live && <RouteCheckpoints avoids={avoids} through={through} />}
    </>}

    {order.scheduledFor && (order.status === 'assigned' || order.status === 'at_pickup') && <Card tone="olive" style={{ paddingVertical: 10 }}>
      <Row gap={8}><Ionicons name="calendar-outline" size={18} color={palette.olive} /><Txt variant="title">{fill(c.pickupAt, { t: time(order.scheduledFor) })}</Txt></Row>
    </Card>}
    {order.status === 'searching' && order.scheduledFor && !bookedAhead(order, now) && <Txt variant="caption" center>{fill(c.pickupAt, { t: time(order.scheduledFor) })}</Txt>}
    {order.status === 'cancelled' && order.exceptionReason && <Card tone="warn" style={{ paddingVertical: 12 }}>
      {/* only a failed pickup cancels with a reason; the status card is gone once cancelled */}
      <Row gap={8}><Ionicons name="alert-circle-outline" size={18} color={palette.warn} />
        <Txt variant="title" style={{ flex: 1, color: palette.warn }}>{reasonLine(c.pickupFailed, `pickup_${order.exceptionReason}`)}</Txt></Row>
      {order.exceptionDetail && <Txt style={{ marginTop: 4 }}>{c[`refusal_${order.exceptionDetail}`]}</Txt>}
    </Card>}
    {activeStatuses.includes(order.status) && <Appear index={2}>
      <Card>
        <View style={[styles.progress, { flexDirection: row }]} accessibilityRole="progressbar" accessibilityLabel={c.tripProgress}
          accessibilityValue={{ min: 0, max: steps.length, now: step + 1 }}>
          {steps.map((s, i) => <View key={s} style={[styles.segment, i <= step && { backgroundColor: palette.olive }]} />)}
        </View>
        <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
          <Txt variant="micro">{order.service === 'ride' ? c.pickup_ride : c.pickup}</Txt>
          <Txt variant="micro">{order.service === 'ride' ? c.dropoff_ride : c.dropoff}</Txt>
        </Row>
        {next && <Txt variant="caption" style={{ marginTop: 10 }}>{next}</Txt>}
        {/* Uber's stage line: the times we actually recorded, nothing inferred. */}
        {(order.assignedAt || order.pickedUpAt) && <Txt variant="caption" style={{ marginTop: 6 }}>
          {[`${c.requested} ${time(order.createdAt)}`, order.assignedAt ? `${c.driverAssigned} ${time(order.assignedAt)}` : null,
            order.pickedUpAt ? `${c.in_transit} ${time(order.pickedUpAt)}` : null].filter(Boolean).join(' · ')}
        </Txt>}
        {order.safetyHold && order.safetyReport?.status !== 'open' && <View accessibilityLiveRegion="polite">
          <Row gap={6} style={{ marginTop: 6 }}>
            <Ionicons name="shield-outline" size={16} color={palette.warn} />
            <Txt variant="caption" style={{ flex: 1, color: palette.warn }}>{c.safetyPaused}</Txt>
          </Row>
        </View>}
        {order.exceptionReason && ['on_hold', 'returning'].includes(order.status) &&
          <Txt variant="caption" style={{ marginTop: 4, color: palette.warn }}>{reasonLine(c.exceptionTitle, `reason_${order.exceptionReason}`)}</Txt>}
      </Card>
    </Appear>}

    {(isCustomer || mine) && activeStatuses.includes(order.status) && <View style={{ marginBottom: 12 }}><Safety order={order} driver={mine} onChange={setData} /></View>}

    {order.driverName && (isAdmin || (isCustomer && !live && (activeStatuses.includes(order.status) || now - order.updatedAt <= 86_400_000))) ? <Appear index={3}>
      <Card>
        <Person title={isAdmin ? c.driver : c.yourDriver} name={order.driverName} phone={order.driverPhone}
          sub={[order.driverVehicle && c[order.driverVehicle], order.driverRating != null && `★ ${order.driverRating}`].filter(Boolean).join(' · ') || undefined}
          plate={order.driverPlate ?? undefined} approved={isCustomer} />
      </Card>
    </Appear> : null}

    {/* Over the live map the sheet header already names the customer: only the extra contacts stay here (A53, 8 Nov). */}
    {(isAdmin || (mine && (activeStatuses.includes(order.status) || now - order.updatedAt <= 86_400_000))) && order.contact
      && (isAdmin || !live || (order.pickupContact && order.pickupContact !== order.contact) || !!order.recipientPhone) ? <Appear index={3}>
      <Card>
        {(isAdmin || !live) && <Person title={c.customer} name={order.customerName ?? ''} phone={order.contact} />}
        {order.pickupContact && order.pickupContact !== order.contact && <View style={(isAdmin || !live) && styles.divider}>
          <Person title={c.pickupContact} name={order.pickupContact} phone={order.pickupContact} />
        </View>}
        {!!order.recipientPhone && <View style={(isAdmin || !live || (order.pickupContact && order.pickupContact !== order.contact)) && styles.divider}>
          <Person title={c.recipient} name={order.recipientName || order.recipientPhone} phone={order.recipientPhone} />
        </View>}
      </Card>
    </Appear> : null}

    {!codeAtDoor && codes}

    {/* Codes sit above the chat: they are what the customer needs at the door. */}
    {(isAdmin || ((isCustomer || mine) && (activeStatuses.includes(order.status) || (order.driverId && now - order.updatedAt <= 86_400_000)))) && order.driverId &&
      <Chat key={me?.user.id ?? 0} orderId={order.id} canWrite={(isCustomer || mine) && activeStatuses.includes(order.status)} live={activeStatuses.includes(order.status)} />}

    <DestinationChangeCard key={order.id} order={order} customer={isCustomer} driver={!!mine} now={now} onChange={next => {
      setData(next); if (isDriver) work.update(next);
    }} />

    <Appear index={5}>
      <Card>
        <RouteLine from={from[language]} to={to[language]} fromNote={order.pickupNote} toNote={order.dropoffNote} ride={order.service === 'ride'} />
        <View style={styles.divider}>
          {!!order.detail && <Detail label={c.details} value={order.detail} />}
          {order.service !== 'shop' && <Detail label={order.service === 'ride' ? c.passengers : c.size} value={order.service === 'ride' ? order.option : c[order.option as 'small']} />}
          {order.service === 'parcel' && <Detail label={c.parcelPriority} value={order.priority === 'same_day' ? c.priority_same_day : c.priority_standard} />}
          {order.loadingHelp && <Detail label={c.loadingHelp} value={c.yes} />}
          <Detail label={c.payWith} value={c.cash} />
          <Detail label={c.issued} value={time(order.createdAt)} />
          {/* a cancelled order was never charged and pays the driver nothing (earnings count finished jobs only) */}
          {/* A shop order's total is the goods plus both fees, collected at the door (its fee lines are in the shop card). */}
          <Detail label={order.discount > 0 || cancelled || returned ? c.fare : c.total} value={money(order.shop ? order.shop.cashAgorot / 100 : order.price)} strong={!order.discount && !cancelled && !returned} />
          {order.discount > 0 && <Detail label={c.promoDiscount} value={money(-order.discount)} />}
          {order.discount > 0 && !isAdmin && !cancelled && !returned && <Detail label={isDriver ? c.cashToCollect : c.youPayCash} value={money(order.price - order.discount)} strong />}
          {isCustomer && returned && !order.shop && <Detail label={c.youPayCash} value={money(0)} strong />}
          {isDriver && !cancelled && !returned && <Detail label={c.youEarn} value={money(order.price - (order.commission ?? commissionOn(order.price, rate)))} strong />}
          {isAdmin && order.commission != null && <Detail label={c.commission} value={money(order.commission)} />}
          {order.collected && (isAdmin || isDriver) && <Detail label={c.doorCollectedShort} value={money(order.collected.cents / 100)} />}
          {order.collected?.reason && (isAdmin || isDriver) && <Detail label={c.doorReasonShort} value={c[`variance_${order.collected.reason}`]} />}
        </View>
      </Card>
    </Appear>



    {fareChange && (isCustomer || mine) && <Card>
      <Txt variant="title">{c.destinationAcceptedFare}</Txt>
      <Txt>{fill(c.destinationReview, { old: money(fareChange.before.dueMinor / 100), next: money(fareChange.after.dueMinor / 100) })}</Txt>
      <Txt variant="caption">{fill(c.destinationGross, { old: money(fareChange.before.grossMinor / 100), next: money(fareChange.after.grossMinor / 100) })}</Txt>
      <Txt variant="caption">{fill(c.destinationDiscounts, { old: money(fareChange.before.discountMinor / 100), next: money(fareChange.after.discountMinor / 100) })}</Txt>
      <Txt variant="caption">{c.destinationCash}</Txt>
    </Card>}

    {isAdmin && order.ride && ['assigned', 'at_pickup'].includes(order.status)
      && (order.ride.arrivedAt == null || order.ride.boardingLocked) && <Card tone="warn">
      <Txt variant="title">{order.ride.arrivedAt == null ? c.rideArrivalOverride : boarding ? c.rideBoardingRotate : c.rideBoardingReset}</Txt>
      <Txt variant="caption" style={{ marginTop: 4, marginBottom: 12 }}>{order.ride.arrivedAt == null ? c.rideArrivalOverrideHint : boarding ? c.rideBoardingRotateHint : c.rideBoardingResetHint}</Txt>
      <Field label={c.proofResetReason} value={resetReason} maxLength={500} disabled={!!busy}
        onChangeText={reason => setProofReset({ id, reason, done: false })} />
      {([
        ...(order.ride.arrivedAt == null ? [{ key: 'ride-arrival', title: c.rideArrivalOverride, endpoint: 'arrival/override' }] : []),
        ...(order.ride.boardingLocked ? [{ key: 'ride-reset', title: boarding ? c.rideBoardingRotate : c.rideBoardingReset, endpoint: 'boarding-reset' }] : []),
      ]).map(action => <Button key={action.key} title={action.title} variant="outline" loading={busy === action.key}
        disabled={!!busy || resetReason.trim().length < 5} reason={busy ? c.wait_busy : c.reason_min5}
        onPress={() => confirm(c.rideRecoveryConfirm, () => act(action.key, `/admin/orders/${order.id}/${action.endpoint}`,
          { reason: resetReason.trim(), ...(action.key === 'ride-reset' && boarding ? { rotate: true, expectedAssignmentEpoch: order.recovery?.assignmentEpoch, expectedPinRevision: boarding.pinRevision } : {}) }, () => setProofReset({ id, reason: '', done: true })), action.title, c.no)} />)}
    </Card>}

    {isAdmin && ['searching', 'assigned', 'at_pickup'].includes(order.status) && <AdminAssign order={order} busy={!!busy} act={act} />}

    {isAdmin && order.status === 'on_hold' && <Card tone="warn">
      <Txt variant="title">{c.exceptionTitle}</Txt>
      <Txt variant="caption" style={{ marginTop: 4, marginBottom: 12 }}>{c.resolveConfirm}</Txt>
      <Field label={c.proofResetReason} value={decisionReason} maxLength={500} disabled={!!busy}
        onChangeText={reason => setDecision({ id, reason })} />
      {suggested && <Txt variant="caption" style={{ marginBottom: 8 }}>
        {fill(c.suggestedNext, { a: suggested === 'return' ? c.returnToSender : c.reattempt })}</Txt>}
      <View style={{ gap: 8 }}>
        {(['reattempt', 'return'] as const).map(action => <Button key={action} title={action === 'reattempt' ? c.reattempt : c.returnToSender}
          variant={action === (suggested ?? 'reattempt') ? 'primary' : 'outline'} icon={action === 'reattempt' ? 'refresh-outline' : 'return-up-back-outline'}
          loading={busy === action} disabled={!!busy || decisionReason.trim().length < 5 || (action === 'reattempt' && order.reattemptAllowed === false)}
          reason={action === 'reattempt' && order.reattemptAllowed === false ? c.err_reattempt_limit : busy ? c.wait_busy : c.reason_min5}
          onPress={() => confirm(c.resolveConfirm, () => act(action, `/admin/orders/${order.id}/resolve`,
            { action, reason: decisionReason.trim() }, () => setDecision({ id, reason: '' })), action === 'reattempt' ? c.reattempt : c.returnToSender, c.no)} />)}
      </View>
    </Card>}

    {isAdmin && order.status === 'returning' && <Card tone="warn">
      <Txt variant="title">{c.confirmReturnTitle}</Txt>
      {order.supportHasGoods && <Txt variant="caption" style={{ marginTop: 4, color: palette.warn }}>{c.supportHasGoodsAdmin}</Txt>}
      <Field label={c.proofResetReason} value={decisionReason} maxLength={500} disabled={!!busy}
        onChangeText={reason => setDecision({ id, reason })} />
      <View style={{ gap: 8 }}>
        {([
          ['confirm_sender_return', undefined, c.confirmReturn, c.confirmReturnHint],
          // Who brought the goods decides the captain's office leg: recorded by the button, never assumed.
          ['confirm_office_return', 'captain', c.confirmOfficeReturnCaptain, c.confirmOfficeReturnHint],
          ['confirm_office_return', 'staff', c.confirmOfficeReturnStaff, c.confirmOfficeReturnStaffHint],
          ['confirm_office_return', 'support', c.confirmOfficeReturnSupport, c.confirmOfficeReturnSupportHint],
          // Support collected the goods mid-return: recorded when they change hands, before any closure (Sol recheck of PR 101).
          ['support_takeover', undefined, c.supportTakeover, c.supportTakeoverHint],
        ] as const).filter(([action, carrier]) => !order.supportHasGoods || (action !== 'support_takeover' && carrier !== 'captain' && carrier !== 'staff')).map(([action, carrier, title, hint]) => <Button key={`${action}-${carrier ?? ''}`} title={title} variant="outline" icon={action === 'support_takeover' ? 'hand-left-outline' : 'checkmark-done-outline'}
          loading={busy === `${action}-${carrier ?? ''}`} disabled={!!busy || decisionReason.trim().length < 5} reason={busy ? c.wait_busy : c.reason_min5}
          onPress={() => confirm(hint, () => act(`${action}-${carrier ?? ''}`, `/admin/orders/${order.id}/resolve`,
            { action, ...(carrier && { carrier }), reason: decisionReason.trim() },
            () => setDecision({ id, reason: '' })), title, c.no)} />)}
      </View>
    </Card>}

    {isAdmin && (order.status === 'returning' || (order.status === 'in_transit' && order.service !== 'ride')) && <Card>
      <Txt variant="title">{c.proofResetTitle}</Txt>
      <Txt variant="caption" style={{ marginTop: 4, marginBottom: 12 }}>{c.proofResetHint}</Txt>
      <Field label={c.proofResetReason} value={resetReason} maxLength={500} disabled={!!busy}
        onChangeText={reason => setProofReset({ id, reason, done: false })} />
      <Button title={c.proofResetAction} variant="outline" icon="refresh-outline" loading={busy === 'proof-reset'}
        disabled={!!busy || resetReason.trim().length < 5} reason={busy ? c.wait_busy : c.reason_min5}
        onPress={() => confirm(c.proofResetConfirm, () => act('proof-reset', `/admin/orders/${order.id}/proof-reset`,
          { reason: resetReason.trim() }, () => setProofReset({ id, reason: '', done: true })), c.proofResetAction, c.no)} />
      {proofReset.id === id && proofReset.done && <View accessibilityLiveRegion="polite" style={{ marginTop: 10 }}>
        <Txt variant="caption" style={{ color: palette.olive }}>{c.proofResetDone}</Txt>
      </View>}
    </Card>}

    {order.shop && isCustomer && <ShopCustomerPanel order={order} onChange={setData} />}
    {order.shop && mine && atPickup && <ShopHandover order={order} onChange={setData} />}
    {order.shop && isAdmin && <ShopAdminPanel order={order} onChange={setData} />}
    {isAdmin && order.pickupPayReview && <PickupPayReviewCard key={order.id} orderId={order.id} fareCents={Math.round(order.price * 100)} review={order.pickupPayReview} onDone={reload} />}
    {isAdmin && order.blockReview && <BlockReviewCard order={order} review={order.blockReview} me={me!.user.id} now={now} onDone={reload} />}
    {isAdmin && order.status === 'returned' && order.service !== 'ride' && <OfficePanel orderId={order.id} shop={order.service === 'shop'} />}

    {!live && <ErrorText>{actionError}</ErrorText>}

    <View style={{ gap: 8 }}>
      {isDriver && order.status === 'searching' && <Button title={c.accept} icon="checkmark-circle-outline" loading={busy === 'accept'} disabled={!!busy || !work.known || offlineIdle || !canTake(work.orders, order.service)}
        reason={busy ? c.wait_busy : !work.known ? c.accept_wait_status : offlineIdle ? c.accept_go_online : order.service === 'parcel' && work.orders.every(o => o.service === 'parcel') ? c.accept_blocked_parcels : c.accept_blocked_exclusive}
        onPress={() => act('accept', `/jobs/${order.id}/accept`)} />}

      {isCustomer && boarding?.locked && ['assigned','at_pickup'].includes(order.status) && <ErrorText>{c.rideBoardingLocked}</ErrorText>}
      {/* The PIN itself is in the sheet header, visible with the sheet closed. */}
      {isCustomer && boardingPin && ['assigned', 'at_pickup'].includes(order.status) && <Txt variant="caption">{c.rideBoardingHint}</Txt>}
      {(isCustomer || mine) && waitingEndsAt != null && ['assigned', 'at_pickup'].includes(order.status)
        && <GraceClock left={secondsUntil(waitingEndsAt!, now, order.journey)} extended={!!order.ride?.graceExtended} />}
      {isCustomer && order.ride?.graceExtended && waitingEndsAt != null && ['assigned', 'at_pickup'].includes(order.status)
        && secondsUntil(waitingEndsAt, now, order.journey) > 0 && <Txt variant="caption">{c.rideGraceExtended}</Txt>}
      {/* RIDE-06/A11Y-08: once, while the waiting grace runs; the server owns the new end time. */}
      {isCustomer && order.ride?.graceExtended === false && waitingEndsAt != null && order.recovery?.assignmentEpoch != null && ['assigned', 'at_pickup'].includes(order.status)
        && secondsUntil(waitingEndsAt, now, order.journey) > 0 && <Button title={c.rideGraceExtend} icon="time-outline" variant="outline"
          disabled={!!busy} loading={busy === 'grace'} onPress={() => act('grace', `/orders/${order.id}/ride/grace-extension`, { expectedAssignmentEpoch: order.recovery!.assignmentEpoch })} />}{/* the assignment the rider saw (Sol R2-M2) */}
      {mine && activeStatuses.includes(order.status) && <>
        {((order.status === 'at_pickup' && order.service !== 'shop') || order.status === 'in_transit') && order.service !== 'ride' && <Card tone="muted">
          <Txt variant="title" style={{ marginBottom: 8 }}>{atPickup ? c.pickupProblem : c.reportProblem}</Txt>
          {/* SHIP-17: at the pickup check a damaged parcel is a refusal with its own sub-reason, so `damaged` is not offered there */}
          <FilterChips items={(order.service === 'shop' ? [...shopExceptionReasons] : atPickup ? [...exceptionReasons.filter(k => k !== 'damaged'), pickupRefusal] : exceptionReasons)
            .map(key => ({ key, label: atPickup ? c[`pickup_${key}` as keyof typeof c] : c[`reason_${key}` as keyof typeof c] }))} value={problem.reason}
            onChange={reason => setProblem(p => ({ ...p, reason: reason as typeof p.reason, detail: undefined }))} />
          {problem.reason === pickupRefusal && <FilterChips items={pickupRefusalDetails.map(key => ({ key, label: c[`refusal_${key}`] }))} value={problem.detail as PickupRefusalDetail}
            onChange={detail => setProblem(p => ({ ...p, detail: detail as PickupRefusalDetail }))} />}
          <Field label={c.problemNote} value={problem.note} maxLength={200} disabled={!!busy} onChangeText={note => setProblem(p => ({ ...p, note }))} />
          <Button title={atPickup ? c.pickupProblem : c.reportProblem} variant="outline" icon="alert-circle-outline" loading={busy === 'problem'}
            disabled={!!busy || order.service === 'shop' && order.status === 'in_transit' && !sealsReady(order, seals) || problem.reason === pickupRefusal && !problem.detail}
            reason={busy ? c.wait_busy : problem.reason === pickupRefusal && !problem.detail ? c.refusalPick : c.shopSealsNeeded}
            onPress={() => confirm(atPickup ? c.pickupConfirm : c.reportConfirm, () => act('problem', `/orders/${order.id}/exception`,
              { reason: problem.reason, ...(problem.reason === pickupRefusal && { detail: problem.detail }), note: problem.note.trim(), ...shopProof }, () => setProblem({ reason: 'absent', note: '' })), atPickup ? c.pickupProblem : c.reportProblem, c.no)} />
        </Card>}
        {(order.status === 'assigned' || atPickup) && <Button title={c.release} variant="ghost" size="sm" loading={busy === 'release'}
          onPress={() => confirm(c.releaseConfirm, () => act('release', `/orders/${order.id}/release`, {}, () => router.back()), c.release, c.no)} />}
      </>}

      {isCustomer && order.status === 'completed' && <RateDriver order={order} onRate={body => act('rate', `/orders/${order.id}/rate`, body)} />}
      {isDriver && mine && order.status === 'completed' && <RateCustomer order={order} onRate={n => act('rate', `/orders/${order.id}/rate`, { customerRating: n })} />}

      {order.status === 'completed' && (isCustomer || mine || isAdmin) &&
        <Button title={c.viewReceipt} icon="receipt-outline" variant="outline" onPress={() => router.push(`/receipt/${order.id}`)} />}

      {canSendAnother(order, role) && <Button title={c.sendAnother} icon="add-circle-outline" variant="soft"
        onPress={() => router.push({ pathname: '/book', params: { again: String(order.id), keep: 'pickup' } })} />}

      {/* one primary on a finished order: repeating it is the likely next step; receipt and send-another stay quieter */}
      {canOrderAgain(order, role) && <Button title={c.orderAgain} icon="refresh-outline" variant="primary"
        onPress={() => router.push({ pathname: '/book', params: { again: String(order.id) } })} />}

      {(isCustomer || isAdmin) && (order.service === 'parcel' || order.service === 'freight') && <CustodyChain orderId={order.id} />}

      {isCustomer && (live || order.sharing) && <Card style={{ gap: 8 }}>
        <Txt variant="caption">{c.shareHint}</Txt>
        {sharedUrl?.id === id && <Txt variant="caption" selectable>{sharedUrl.url}</Txt>}
        {live && <Button title={c.shareTracking} icon="share-social-outline" variant="soft" loading={busy === 'share'} disabled={!!busy} reason={c.wait_busy}
          onPress={async () => {
            setBusy('share'); setActionError('');
            try {
              const url = sharedUrl?.id === id ? sharedUrl.url : `${API_URL}${(await api<{ path: string }>(`/orders/${order.id}/share`, {})).path}`;
              if (sharedUrl?.id !== id) { setSharedUrl({ id, url }); setData({ ...order, sharing: true }); }
              await Share.share({ message: fill(c.shareMessage, { url }) }).catch(() => undefined); // the link stays visible to copy
            } catch (e) { setActionError(err(e)); } finally { setBusy(null); }
          }} />}
        {live && !!order.recipientPhone && <Button title={c.shareRecipient} icon="logo-whatsapp" variant="soft" loading={busy === 'share-wa'} disabled={!!busy} reason={c.wait_busy}
          onPress={async () => { // the recipient gets the live link on WhatsApp, no SMS provider (SPEC-parcel-recipient.md)
            setBusy('share-wa'); setActionError('');
            try {
              const url = sharedUrl?.id === id ? sharedUrl.url : `${API_URL}${(await api<{ path: string }>(`/orders/${order.id}/share`, {})).path}`;
              if (sharedUrl?.id !== id) { setSharedUrl({ id, url }); setData({ ...order, sharing: true }); }
              await Linking.openURL(`https://wa.me/970${order.recipientPhone!.slice(1)}?text=${encodeURIComponent(fill(c.shareMessage, { url }))}`);
            } catch (e) { setActionError(err(e)); } finally { setBusy(null); }
          }} />}
        {order.sharing && <Button title={c.stopSharing} variant="ghost" size="sm" loading={busy === 'unshare'}
          onPress={() => act('unshare', `/orders/${order.id}/share/revoke`, {}, () => { setSharedUrl(null); setData({ ...order, sharing: false }); })} />}
      </Card>}

      {isCustomer && order.dispute && <Card tone={order.dispute.status === 'open' ? 'warn' : 'olive'}>
        <Txt variant="title">{order.dispute.status === 'open' ? c.disputeOpen : c.disputeResolved}</Txt>
        <Txt variant="caption" style={{ marginTop: 4 }}>{order.dispute.resolution ?? order.dispute.reason}</Txt>
        {order.dispute.credit && <Txt variant="label" selectable style={{ marginTop: 6 }}>{fill(c.disputeCredit, { r: money(order.dispute.credit.amount), code: order.dispute.credit.code })}</Txt>}
      </Card>}
      {/* Behind one button until asked for: an open, empty complaint box under a good delivery read as a warning (product audit, 21 Nov).
          A started draft keeps it open. */}
      {canDispute && !order.dispute && !reportOpen && !disputeReason && <Button title={c.disputeTitle} variant="outline" size="sm" icon="flag-outline" onPress={() => setReport({ id, open: true })} />}
      {canDispute && !order.dispute && (reportOpen || !!disputeReason) && <Card>
        <Txt variant="title">{c.disputeTitle}</Txt>
        <Txt variant="caption" style={{ marginTop: 4, marginBottom: 12 }}>{c.disputeHint}</Txt>
        <Field label={c.disputeReason} value={disputeReason} multiline maxLength={1000} disabled={!!busy}
          onChangeText={reason => setDispute({ id, reason })} />
        <Button title={c.disputeSend} variant="outline" icon="flag-outline" loading={busy === 'dispute'} disabled={!!busy || disputeReason.trim().length < 10} reason={busy ? c.wait_busy : c.reason_min10}
          onPress={() => act('dispute', `/orders/${order.id}/dispute`, { reason: disputeReason.trim() }, () => setDispute({ id, reason: '' }))} />
      </Card>}

      {((isCustomer || isAdmin) && ['searching', 'assigned', 'at_pickup'].includes(order.status)) && order.service !== 'shop' && !(isCustomer && finding) && // the searching card already carries it
        <Button title={c.cancelOrder} variant="danger" size="sm" icon="close-circle-outline" loading={busy === 'cancel'}
          onPress={() => confirm(c.cancelConfirm, () => act('cancel', `/orders/${order.id}/cancel`), c.cancelOrder, c.no)} />}
      <Button title={c.help} variant="ghost" icon="help-circle-outline" onPress={() => router.push({ pathname: '/help', params: { order: orderCode(order.id) } })} />
    </View>
  </>;
  // Open work happens on the map: it fills the screen and the rest of the order sits on the sheet over it.
  if (live) return <View style={{ flex: 1, backgroundColor: palette.paper }}>
    <RouteMap fill pickup={pickup} dropoff={dropoff} focus={nextStop} pickupTitle={from[language]} dropoffTitle={to[language]}
      driver={order.driverLocation} driverTitle={order.driverName} road={road} approach={approach} closed={closed} stale={!!location?.stale}
      insets={{ top: topBar, bottom: peek, ...(side && (rtl ? { left: SIDE_SHEET } : { right: SIDE_SHEET })) }} padding={44} follow={mine} eta={eta && location && !location.stale ? etaChip(eta) : null}
      stopLabels={{ pickup: order.pickupNote || from[language], dropoff: order.dropoffNote || to[language] }} />
    <SafeAreaView edges={['top']} pointerEvents="box-none" style={[styles.topBar, side && (rtl ? { left: SIDE_SHEET, right: 0 } : { right: SIDE_SHEET })]} onLayout={e => setTopBar(Math.ceil(e.nativeEvent.layout.height))}>
      {maneuver ? <View accessibilityLiveRegion="polite" style={[styles.nav, { flexDirection: row }]}>
        <IconButton icon={rtl ? 'arrow-forward' : 'arrow-back'} label={c.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
        <Ionicons name={maneuverIcon(maneuver.step)} size={34} color={palette.lime} />
        <View style={{ flex: 1 }}>
          <Txt variant="h2" style={{ color: palette.onFill }}>{maneuverDistance(maneuver.metres, c)}</Txt>
          {/* clamp, not numberOfLines: a plain line cap is dropped past 1.35x, and the driving banner must not grow over the map */}
          <Txt variant="caption" clamp={4} style={{ color: palette.onFill }}>{maneuverText(maneuver.step, c)}</Txt>
        </View>
      </View> : <View style={[styles.topCard, shadow, { flexDirection: row }]}>
        <IconButton icon={rtl ? 'arrow-forward' : 'arrow-back'} label={c.back} tone="muted" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
        <View style={{ flex: 1 }}>
          <Txt variant="title" numberOfLines={1}>{orderCode(order.id)}</Txt>
          <Txt variant="micro" numberOfLines={1}>{`${c[order.service]}${order.shared ? ` · ${c.shared}` : ''}`}</Txt>
        </View>
        {!finding && !activeStatuses.includes(order.status) ? <Badge label={statusText(c, order, mine, now)} status={order.status} /> : null}
        {helpButton}
      </View>}
    </SafeAreaView>
    <MapSheet open={sheetOpen} onOpenChange={setSheetOpen} onPeek={setPeek} onRefresh={reload}
      header={<View style={{ paddingBottom: 10 }}>
    {/* In the header, not the body: a closed sheet hides its body, and a refused action must still say why. */}
    <ErrorText>{actionError}</ErrorText>
    {error && <ErrorText>{c.updatesPaused}</ErrorText>}
    {codeAtDoor && <View style={{ paddingBottom: 8 }}>{codes}</View>}
    {/* Booked ahead is neither finding nor active: without this the closed sheet is a bare grip. */}
    {!!booked && <Row gap={8} style={{ marginBottom: 4 }}>
      <Ionicons name="calendar-outline" size={18} color={palette.olive} />
      <Txt variant="h2" numberOfLines={1} style={{ flex: 1 }}>{fill(c.scheduledFor, { t: time(booked) })}</Txt>
    </Row>}
    {finding && <View style={{ alignItems: 'center', paddingBottom: 8 }}>
      <Radar color={palette.forest} size={64}>
        <ServiceIcon service={order.service} size={28} />
      </Radar>
      <Txt variant="title" center style={{ marginTop: 4 }}>{c.findingTitle}</Txt>
      {/* Addressed to the sender; a driver or admin viewing the same order reads the title only. */}
      {isCustomer && <Txt center variant="caption" style={{ marginTop: 4, maxWidth: 300 }}>{order.dispatch?.state === 'exhausted' ? c.dispatchExhausted : order.scheduledFor && now > order.scheduledFor ? c.scheduledMissed : c.findingBody}</Txt>}
      {/* How long it has been, and past five minutes a way to reach support: a silent wait with a small pilot fleet reads as broken
          and ends in a cancel (Uber and inDrive show both; product audit, 21 Nov). Counted from the booked time once it passed. */}
      {isCustomer && searchMinutes >= 1 && order.dispatch?.state !== 'exhausted' && <Txt center variant="micro" style={{ marginTop: 4 }}>{fill(c.searchingFor, { n: searchMinutes })}</Txt>}
      {isCustomer && searchMinutes >= 5 && order.dispatch?.state !== 'exhausted' && <View accessibilityLiveRegion="polite" style={{ marginTop: 10, alignSelf: 'stretch', gap: 6 }}>
        <Txt center variant="caption">{c.stillLooking}</Txt>
        <Button title={c.helpWithOrder} variant="soft" size="sm" icon="chatbubble-ellipses-outline" onPress={() => router.push({ pathname: '/help', params: { order: orderCode(order.id) } })} />
      </View>}
      {isCustomer && order.dispatch?.state === 'exhausted' && <View style={{ marginTop: 12 }}>
        <Button title={c.dispatchRetry} variant="soft" disabled={!!busy} loading={busy === 'dispatch-retry'}
          onPress={() => act('dispatch-retry', `/orders/${order.id}/dispatch/retry`)} />
      </View>}
      {/* Uber keeps Cancel under the search animation: the bottom of the page is three screens away. */}
      {isCustomer && order.service !== 'shop' && <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
        <Button title={c.cancelOrder} variant="ghost" icon="close-circle-outline" loading={busy === 'cancel'}
          onPress={() => confirm(c.cancelConfirm, () => act('cancel', `/orders/${order.id}/cancel`), c.cancelOrder, c.no)} />
      </View>}
    </View>}
        {activeStatuses.includes(order.status) && <>
          <Row gap={8} style={{ marginBottom: 4 }}>
            {journeyState[order.status] === 'live' ? <Pulse color={statusTone[order.status].mark} size={8} />
              : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusTone[order.status].mark }} />}{/* the state's colour, as on its badge; only live states pulse */}
            <Txt variant="h2" numberOfLines={2} style={{ flex: 1 }}>{statusText(c, order, mine)}</Txt>
            {eta && location && !location.stale && <Txt variant="display" numberOfLines={1} style={{ color: statusTone[order.status].mark, flexShrink: 0 }}>{etaChip(eta)}</Txt>}
          </Row>
          {isCustomer && boardingPin && ['assigned', 'at_pickup'].includes(order.status) && <Row gap={8} style={{ marginBottom: 6 }}>
            <Ionicons name="key-outline" size={16} color={palette.olive} />
            <Txt variant="caption" style={{ flex: 1 }}>{c.rideBoardingCode}</Txt>
            <Txt variant="h2" selectable accessibilityLabel={`${c.rideBoardingCode} ${boardingPin.split('').join(' ')}`}>{boardingPin}</Txt>
          </Row>}
          {isCustomer && order.driverName && <Person title={c.yourDriver} name={order.driverName} phone={order.driverPhone}
          sub={[order.driverVehicle && c[order.driverVehicle], order.driverRating != null && `★ ${order.driverRating}`].filter(Boolean).join(' · ') || undefined}
          plate={order.driverPlate ?? undefined} approved />}
          {mine && !!order.contact && <Person title={c.customer} name={order.customerName ?? ''} phone={order.contact} />}
        </>}
      </View>}
      footer={mine && activeStatuses.includes(order.status) ? <BoundedFooter><View style={{ gap: 8 }}>
        {order.shop && order.status === 'in_transit' && <SealToggles order={order} value={seals} onChange={setSeals} />}
        {doorStep && <>
          <Field label={fill(c.doorCollected, { p: money(dueCents / 100) })} icon="cash-outline" value={doorText} keyboardType="decimal-pad" maxLength={10}
            onChangeText={text => setDoor({ context: proofContext, text, reason: null })} disabled={!!busy || advanceLocked === order.status}
            error={doorText.trim() && !doorValid ? c.doorInvalid : undefined} />
          {doorDiffers && <>
            <Txt variant="caption">{c.doorReasonHint}</Txt>
            <FilterChips label={c.doorReasonHint} items={doorReasons.map(key => ({ key, label: c[`variance_${key}`] }))} value={doorOwn.reason ?? ('' as VarianceReason)}
              disabled={!!busy || advanceLocked === order.status} onChange={reason => setDoor({ context: proofContext, text: doorOwn.text, reason })} />
          </>}
        </>}
        {needsCode &&
          <Field label={rideAction === 'boarding' ? c.rideEnterCode : order.status === 'returning' ? c.codeFromSender : c.codeFromCustomer} icon="key-outline" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" maxLength={4} placeholder="0000"
            disabled={!!busy || advanceLocked === order.status} />}
        {needsCode && !busy && advanceLocked === order.status && <Txt variant="caption">{c.codeHeldForRetry}</Txt>}
        {order.status === 'returning' && order.supportHasGoods && <Txt variant="caption">{c.supportHasGoodsDriver}</Txt>}
        {rideAction === 'arrive' && <Txt variant="caption">{arrivalFar ? fill(c.rideArrivalFar, { km: kmLabel(arrivalKm!), m: RIDE_ARRIVAL_RADIUS_METERS }) : c.rideArrivalHint}</Txt>}
        {parcelFarKm !== null && <Txt variant="caption">{farFill(c.parcelPickupFar, c.parcelPickupFarCity)}</Txt>}
        {rideAction === 'locked' && <ErrorText>{c.rideBoardingLocked}</ErrorText>}
        {order.status !== 'on_hold' && !order.safetyHold && !(order.service === 'shop' && atPickup) && !(order.status === 'returning' && order.supportHasGoods) && <Button title={rideAction === 'arrive' ? c.rideArrive : c[order.service === 'ride' && order.status === 'at_pickup' ? 'advance_at_pickup_ride'
          : order.service === 'ride' && order.status === 'in_transit' ? 'advance_in_transit_ride' : `advance_${order.status}` as 'advance_assigned']}
          icon="arrow-forward-circle-outline" variant={arrivalFar || parcelFarKm !== null ? 'outline' : 'primary'} loading={busy === 'advance' || busy === 'arrive'} disabled={!!busy || rideAction === 'locked' || rideAction === 'boarding' && !/^\d{4}$/.test(code) || doorStep && !doorReady || order.service === 'shop' && order.status === 'in_transit' && !sealsReady(order, seals)}
          reason={order.service === 'shop' && order.status === 'in_transit' && !sealsReady(order, seals) ? c.shopSealsNeeded : doorStep && !doorValid ? c.doorInvalid : doorStep && !doorReady ? c.doorReasonHint : rideAction === 'locked' ? c.rideBoardingLocked : rideAction === 'boarding' && !/^\d{4}$/.test(code) ? c.rideEnterCode : c.wait_busy}
          onPress={() => rideAction === 'arrive' ? act('arrive', `/orders/${order.id}/arrive`)
            : parcelFarKm !== null ? confirm(farFill(c.parcelPickupFarConfirm, c.parcelPickupFarCityConfirm), () => act('advance', `/orders/${order.id}/advance`, { code }), c.continue, c.no)
            : act('advance', `/orders/${order.id}/advance`, { code })} />}
        {rideNoShow && <Button title={c.rideNoShow} variant="outline" disabled={!!busy} loading={busy === 'no-show'}
          onPress={() => confirm(c.rideNoShowConfirm, () => act('no-show', `/orders/${order.id}/ride/no-show`,
            { reason: 'absent', expectedAssignmentEpoch: order.recovery?.assignmentEpoch }, () => { void work.reload(); }), c.rideNoShow, c.no)} />}
        <Button title={c.navigate} icon="navigate-outline" variant="soft" onPress={() => {
          const toDropoff = order.status === 'in_transit' || order.status === 'on_hold'; // returning goes back to the sender
          openMaps(toDropoff ? order.dropoffPoint ?? null : order.pickupPoint, (toDropoff ? to : from)[language], toDropoff ? order.dropoffNote : order.pickupNote, c.mapsRegion)
            .catch(() => setActionError(c.mapUnavailable));
        }} />
        {!(order.status === 'in_transit' || order.status === 'on_hold' ? order.dropoffPoint : order.pickupPoint) && <Txt center variant="caption">{c.navigateLandmark}</Txt>}
      </View></BoundedFooter> : undefined}>
      {body}
    </MapSheet>
  </View>;
  return <Screen onRefresh={reload}>
    <Header title={orderCode(order.id)} subtitle={`${c[order.service]}${order.shared ? ` · ${c.shared}` : ''}`} back
      right={<Row gap={8} style={{ alignItems: 'center' }}>
        {order.status === 'completed' || finding || activeStatuses.includes(order.status) ? null : <Badge label={statusText(c, order, mine, now)} status={order.status} />}
        {helpButton}
      </Row>} />
    {/* completed: the banner below already says it, with the time; a second badge one line above only echoes */}
    {error && <ErrorText>{c.updatesPaused}</ErrorText>}
    {body}
  </Screen>;
}

// Uber-style safety toolkit: emergency numbers work without Wind's server; a report reaches Wind's safety team.
const emergency = [['police', '100', 'shield-outline'], ['ambulance', '101', 'medkit-outline'], ['civilDefence', '102', 'flame-outline']] as const;
function Safety({ order, driver, onChange }: { order: Order; driver: boolean; onChange: (order: Order) => void }) {
  const { c, err } = useCopy();
  const [open, setOpen] = useState(order.safetyReport?.status === 'open');
  // only a ride passenger sits through the driving; nothing is preselected but the neutral "other"
  const kinds = order.service === 'ride' && !driver ? safetyKinds : safetyKinds.filter(key => key !== 'unsafe_driving');
  const [kind, setKind] = useState<SafetyKind>('other');
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
  return <Card tone="warn">
    <Row gap={8} style={{ marginBottom: 4 }}>
      <Ionicons name="shield-checkmark" size={22} color={palette.warn} />
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
      <FilterChips items={kinds.map(key => ({ key, label: c[`safety_${key}`] }))} value={kind} onChange={setKind} />
      <Field label={c.problemNote} value={note} maxLength={300} multiline disabled={busy} onChangeText={setNote} />
      <Button title={c.safetySend} icon="alert-circle-outline" variant="outline" loading={busy} disabled={busy} reason={c.wait_busy}
        onPress={() => confirm(c.safetyConfirm, send, c.safetySend, c.no)} />
    </>}
    <ErrorText>{failure}</ErrorText>
  </Card>;
}

type Message = { id: number; mine: boolean; role: 'customer' | 'driver'; body: string; createdAt: number };
const quickReplies = ['qrOnMyWay', 'qrArrived', 'qrCallMe', 'qrLate'] as const;

// In-trip chat: cheaper than calls on local plans and kept for support. Polls while the order screen is open.
function Chat({ orderId, canWrite, live }: { orderId: number; canWrite: boolean; live: boolean }) {
  const { c, err, row, rtl } = useCopy();
  const { stamp } = useFormat();
  const { data, error, reload, setData } = useApi<Message[]>(`/orders/${orderId}/messages`, live ? 5000 : undefined);
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
  // Unsent texts keep the id they were first sent with, saved in the account's own slot before the request leaves: a
  // resend after a lost reply or an app restart is replayed by the server, never posted twice. The parent keys this
  // component by account, so another account's texts never show here.
  const userId = useSession().me?.user.id;
  const [store] = useState(() => userId ? outboxStore({ read: () => storage.get(outboxKey(userId)), write: value => storage.set(outboxKey(userId), value) }, Date.now) : null);
  const [unsent, setUnsent] = useState<Unsent[]>([]);
  const outbox = useRef<Unsent[]>([]); // the current list for sends started from an older render
  const keep = (list: Unsent[]) => { outbox.current = list; setUnsent(list); return store?.save(list) ?? Promise.resolve(false); };
  useEffect(() => {
    let mounted = true;
    void store?.load().then(list => { if (mounted) { outbox.current = list; setUnsent(list); } });
    return () => { mounted = false; };
  }, [store]);
  // A text the server lists as mine, newer than what was on screen when it was queued, landed although its reply was lost.
  const landed = data ? delivered(unsent, orderId, data).map(u => u.requestId).join() : '';
  useEffect(() => {
    if (!landed) return;
    const ids = landed.split(',');
    void keep(outbox.current.filter(u => !ids.includes(u.requestId)));
  }, [landed]); // eslint-disable-line react-hooks/exhaustive-deps -- keep only writes the outbox; `landed` is the whole input
  async function send(body: string) {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true); setFailure('');
    const newest = data?.at(-1)?.id ?? (data ? 0 : null); // null: the history is not loaded, so delivery cannot be inferred
    const outcome = await sendText({ list: outbox.current, orderId, body: text, afterId: newest,
      save: keep, post: entry => api<Message[]>(`/orders/${orderId}/messages`, { body: entry.body, requestId: entry.requestId }) });
    outbox.current = outcome.list; setUnsent(outcome.list);
    if (outcome.state === 'sent') {
      setData(outcome.reply);
      if (body === draft) setDraft('');
      haptic.success();
    } else if (outcome.state === 'full') setFailure(c.chatOutboxFull);
    else {
      haptic.error(); setFailure(err(outcome.error));
      if (outcome.state === 'refused') setDraft(text); // never delivered: give the words back to edit or copy
      else if (outcome.durable && body === draft) setDraft(''); // it waits below as "not sent yet", with its own resend
    }
    setBusy(false);
  }
  const mineUnsent = unsent.filter(u => u.orderId === orderId);
  const recent = (data ?? []).slice(-20);
  // a closed chat with nothing in it is a card that says "nothing here"; a closed one with history still shows
  if (!canWrite && !recent.length && !error && !mineUnsent.length) return null;
  return <Card>
    <Row gap={8} style={{ marginBottom: 8 }}>
      <Ionicons name="chatbubbles-outline" size={20} color={palette.olive} />
      <Txt variant="title" style={{ flex: 1 }}>{c.messages}</Txt>
    </Row>
    {error && !data ? <ErrorText>{err(error)}</ErrorText> : recent.length === 0
      ? <Txt variant="caption" style={{ marginBottom: 8 }}>{c.chatEmpty}</Txt>
      : <View style={{ gap: 6, marginBottom: 8 }}>
        {recent.map(m => <View key={m.id} style={[styles.bubble, { alignSelf: m.mine === rtl ? 'flex-start' : 'flex-end', backgroundColor: m.mine ? palette.olivePale : palette.muted }]}
          accessible accessibilityLabel={`${m.mine ? c.you : c[m.role]}: ${m.body}, ${stamp(m.createdAt)}`}>
          {!m.mine && <Txt variant="micro" style={styles.bubbleMeta}>{c[m.role]}</Txt>}
          <Txt>{m.body}</Txt>
          <Txt variant="micro" style={styles.bubbleMeta}>{stamp(m.createdAt)}</Txt>
        </View>)}
      </View>}
    {mineUnsent.map(u => <View key={u.requestId} style={[styles.bubble, styles.unsent, { alignSelf: rtl ? 'flex-start' : 'flex-end' }]}>
      <Txt accessibilityLabel={`${c.you}: ${u.body}, ${c.chatNotSent}`}>{u.body}</Txt>
      <Row gap={12} style={{ marginTop: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Txt variant="micro" style={{ color: palette.warn }}>{c.chatNotSent}</Txt>
        {canWrite && <Press accessibilityLabel={`${c.chatResend}: ${u.body}`} disabled={busy} onPress={() => send(u.body)} style={styles.unsentAction}>
          <Txt variant="label" style={{ color: palette.olive }}>{c.chatResend}</Txt>
        </Press>}
        <Press accessibilityLabel={`${c.chatDiscard}: ${u.body}`} disabled={busy} style={styles.unsentAction}
          onPress={() => confirm(c.chatDiscardConfirm, () => { void keep(without(outbox.current, u.requestId)); }, c.chatDiscard, c.cancel)}>
          <Txt variant="label" style={{ color: palette.secondary }}>{c.chatDiscard}</Txt>
        </Press>
      </Row>
    </View>)}
    {error && data && <>{/* the history and the draft stay; say newer messages may be missing */}
      <ErrorText>{c.chatPaused}</ErrorText>
      <Button title={c.retry} icon="refresh" variant="ghost" size="sm" onPress={reload} />
    </>}
    {canWrite && <>
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {quickReplies.map(key => <Press key={key} accessibilityLabel={`${c.send}: ${c[key]}`} disabled={busy} onPress={() => send(c[key])} style={styles.quick}>
          <Txt variant="label" style={{ color: palette.olive }}>{c[key]}</Txt>
        </Press>)}
      </View>
      {/* Send sits beside the field, as in messaging apps: below it, the keyboard would cover it while typing. */}
      <Row gap={8} style={{ alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}><Field label={c.chatMessage} value={draft} onChangeText={setDraft} maxLength={500} multiline disabled={busy} /></View>
        <Press accessibilityLabel={c.send} accessibilityState={{ busy }} disabled={busy || !draft.trim()} onPress={() => send(draft)} style={styles.send}>
          {busy ? <ActivityIndicator size="small" color={palette.lime} />
            : <Ionicons name="send" size={iconSize.lg} color={palette.lime} style={rtl ? { transform: [{ scaleX: -1 }] } : undefined} />}
        </Press>
      </Row>
    </>}
    <ErrorText>{failure}</ErrorText>
  </Card>;
}

function Person({ title, name, sub, plate, phone, approved }: { title: string; name: string; sub?: string; plate?: string; phone?: string | null; approved?: boolean }) {
  const { c } = useCopy();
  return <Row gap={12}>
    <Avatar name={name} size={44} />
    <View style={{ flex: 1 }}>
      <Txt variant="micro">{title}</Txt>
      <Txt variant="title" numberOfLines={1}>{name}</Txt>
      {!!sub && <Txt variant="caption">{sub}</Txt>}
      {/* the plate is what you match at the kerb: its own bold line, not buried in the caption */}
      {!!plate && <Txt variant="label" style={{ marginTop: 2, letterSpacing: 1 }}>{plate}</Txt>}
      {/* Only an approved captain can take an order (pending accounts are refused by the server), so this states a real gate. */}
      {approved && <Row gap={4} style={{ marginTop: 4 }}>
        <Ionicons name="shield-checkmark" size={14} color={palette.olive} />
        <Txt variant="micro" style={{ color: palette.olive }}>{c.driverApproved}</Txt>
      </Row>}
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

// The driver and the price are rated separately (SPEC-driver-offers.md), each once.
function RateDriver({ order, onRate }: { order: Order; onRate: (body: { rating: number } | { priceRating: number }) => void }) {
  const { c } = useCopy();
  return <Card tone="olive" style={{ marginTop: 4 }}>
    <Txt variant="title" center>{order.rating ? c.thanksDriver : c.rateDriver}</Txt>
    <Row gap={4} style={{ justifyContent: 'center', marginTop: 8 }}>
      {[1, 2, 3, 4, 5].map(n => <IconStar key={n} n={n} label={c.rateDriver} on={n <= (order.rating ?? 0)} disabled={!!order.rating} onPress={() => onRate({ rating: n })} />)}
    </Row>
    <Txt variant="title" center style={{ marginTop: 8 }}>{order.priceRating ? c.thanksPrice : c.ratePrice}</Txt>
    <Row gap={4} style={{ justifyContent: 'center', marginTop: 8 }}>
      {[1, 2, 3, 4, 5].map(n => <IconStar key={n} n={n} label={c.ratePrice} on={n <= (order.priceRating ?? 0)} disabled={!!order.priceRating} onPress={() => onRate({ priceRating: n })} />)}
    </Row>
  </Card>;
}

// Drivers rate the customer once (SPEC-customer-rating.md); customers never see it.
function RateCustomer({ order, onRate }: { order: Order; onRate: (n: number) => void }) {
  const { c } = useCopy();
  return <Card tone="olive" style={{ marginTop: 4 }}>
    <Txt variant="title" center>{order.customerRating ? c.thanks : c.rateCustomer}</Txt>
    <Row gap={4} style={{ justifyContent: 'center', marginTop: 8 }}>
      {[1, 2, 3, 4, 5].map(n => <IconStar key={n} n={n} label={c.rateCustomer} on={n <= (order.customerRating ?? 0)} disabled={!!order.customerRating} onPress={() => onRate(n)} />)}
    </Row>
  </Card>;
}

function IconStar({ n, label, on, disabled, onPress }: { n: number; label: string; on: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${n}/5`} disabled={disabled} aria-disabled={disabled} onPress={onPress} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name={on ? 'star' : 'star-outline'} size={28} color={palette.warn} />
  </Pressable>;
}

// Each digit sits in a box that sizes itself and centres the Text, which carries no height: iOS ignores textAlignVertical,
// so a fixed Text height clipped the digits at larger text sizes. The box grows with the font up to maxScale.
function CodeDigit({ digit }: { digit: string }) {
  return <View style={styles.digit}><Text maxFontSizeMultiplier={maxScale} style={styles.digitText}>{digit}</Text></View>;
}

const styles = StyleSheet.create({
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 },
  topCard: { alignItems: 'center', gap: 10, backgroundColor: palette.card, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 8 },
  nav: { alignItems: 'center', gap: 12, backgroundColor: palette.forest, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  map: { borderRadius: 16, overflow: 'hidden', backgroundColor: palette.card, marginBottom: 12 },
  progress: { gap: 4 },
  segment: { flex: 1, height: 5, borderRadius: 3, backgroundColor: palette.muted },
  divider: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.hair },
  code: { gap: 4, flexWrap: 'wrap' },
  digit: { minWidth: 30, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, borderRadius: 8, backgroundColor: palette.card, overflow: 'hidden' },
  digitText: { fontSize: 22, fontFamily: headingFont.bold, color: palette.ink, textAlign: 'center' },
  detail: { paddingVertical: 6, alignItems: 'flex-start', justifyContent: 'space-between' },
  bubble: { maxWidth: '85%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  unsent: { backgroundColor: palette.olivePale, marginBottom: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.warn },
  unsentAction: { minHeight: 48, minWidth: 48, justifyContent: 'center', paddingHorizontal: 6 }, // 48 dp targets, as for Send
  bubbleMeta: { color: palette.secondary }, // faint is under 4.5:1 on the tinted bubbles
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.forest, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, // Field's bottom margin: aligns with the box
  quick: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 24, backgroundColor: palette.olivePale },
});

function PickupPayReviewCard({ orderId, fareCents, review, onDone }: { orderId: number; fareCents: number; review: NonNullable<Order['pickupPayReview']>; onDone: () => unknown }) {
  const { c, money, err } = useCopy();
  const { time } = useFormat();
  const [km, setKm] = useState(review.drivenKm?.toFixed(2) ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [failure, setFailure] = useState('');
  const distance = km.trim() ? typedNumber(km) : NaN;
  const canGrant = Number.isFinite(distance) && distance >= 0 && distance <= 200;
  async function decide(granted: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setFailure('');
    try {
      await api(`/admin/orders/${orderId}/pickup-pay-review`, { granted, km: granted ? distance : 0, reason: reason.trim() });
      await onDone();
    } catch (error) { setFailure(err(error)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const { decision, originKm, currentKm, originFixAt, currentFixAt, suggestedCents, drivenKm } = review;
  const distanceText = (km: number | null | undefined) => km == null ? c.pickupPayEvidenceUnavailable : fill(c.pickupPayDistance, { km: km.toFixed(2) });
  return <Card>
    <Txt variant="title">{c.pickupPayReview}</Txt>
    <Txt variant="caption">{c[`pickup_${review.reason}`]}</Txt>
    <Txt variant="caption">{fill(c.pickupPayOrigin, { distance: distanceText(originKm), time: originFixAt == null ? c.pickupPayEvidenceUnavailable : time(originFixAt) })}</Txt>
    <Txt variant="caption">{fill(c.pickupPayCurrent, { distance: distanceText(currentKm), time: currentFixAt == null ? c.pickupPayEvidenceUnavailable : time(currentFixAt) })}</Txt>
    {/* The origin fix is read just before the assignment by design (within 120 s): only a missing fix time is weak (Haiku r6 F1). */}
    {originFixAt == null && <Txt variant="caption">{c.pickupPayWeakOrigin}</Txt>}
    <Txt variant="caption">{suggestedCents == null ? c.pickupPayNoSuggestion : fill(c.pickupPaySuggestion, { pay: money(suggestedCents / 100) })}</Txt>
    {decision ? <>
      <Txt>{decision.granted ? fill(c.pickupPayCredited, { pay: money(decision.paidCents / 100) }) : c.pickupPayDenied}</Txt>
      <Txt variant="caption">{decision.reason}</Txt>
    </> : <>
      {drivenKm != null && <Txt variant="caption">{c.pickupPayDistanceBasis}</Txt>}
      <Field label={c.pickupPayKm} value={km} onChangeText={setKm} keyboardType="decimal-pad" disabled={busy} />
      {canGrant && <Txt variant="caption">{fill(c.pickupPayGrantAmount, { pay: money(pickupPayCents(fareCents, distance, review.rate) / 100) })}</Txt>}
      <Field label={c.cashReason} value={reason} onChangeText={setReason} maxLength={500} disabled={busy} />
      <ErrorText>{failure}</ErrorText>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        <Button title={c.pickupPayGrant} size="sm" disabled={busy || !canGrant || reason.trim().length < 5} onPress={() => void decide(true)} />
        <Button title={c.pickupPayDeny} size="sm" variant="outline" disabled={busy || reason.trim().length < 5} onPress={() => void decide(false)} />
      </Row>
    </>}
  </Card>;
}

// DRV-17: a second admin decides whether the captain is cleared and the trip pay can be posted.
function BlockReviewCard({ order, review, me, now, onDone }: { order: Order; review: NonNullable<Order['blockReview']>; me: number; now: number; onDone: () => unknown }) {
  const { c, err } = useCopy();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'' | 'yes' | 'no'>('');
  const [error, setError] = useState('');
  const pay = `${(review.tripPayCents / 100).toFixed(2)} ₪`;
  async function decide(cleared: boolean) {
    if (busy) return;
    setBusy(cleared ? 'yes' : 'no'); setError('');
    try { await api(`/admin/orders/${order.id}/block-review`, { cleared, note: note.trim() }); await onDone(); }
    catch (e) { setError(err(e)); }
    finally { setBusy(''); }
  }
  if (review.decidedAt != null) return <Card>
    <Txt variant="title">{c.blockReview}</Txt>
    <Txt variant="caption">{review.cleared ? fill(c.blockReviewCleared, { pay, paid: `${((review.paidCents ?? 0) / 100).toFixed(2)} ₪` }) : c.blockReviewNotCleared}</Txt>
  </Card>;
  const self = review.blockedBy === me, noteOk = note.trim().length >= 5;
  return <Card tone={review.dueAt < now ? 'warn' : undefined}>
    <Txt variant="title">{c.blockReview}</Txt>
    <Txt variant="caption">{fill(c.blockReviewDue, { pay, due: new Date(review.dueAt).toLocaleString() })}</Txt>
    {self ? <Txt variant="caption">{c.blockReviewSecondAdmin}</Txt> : <>
      <Field label={c.adminNote} value={note} onChangeText={setNote} multiline maxLength={500} />
      <Button title={c.blockReviewClear} size="sm" disabled={!noteOk || !!busy} reason={noteOk ? undefined : c.adminNoteNeeded} loading={busy === 'yes'} onPress={() => decide(true)} />
      <Button title={c.blockReviewKeep} size="sm" variant="outline" disabled={!noteOk || !!busy} reason={noteOk ? undefined : c.adminNoteNeeded} loading={busy === 'no'} onPress={() => decide(false)} />
    </>}
    <ErrorText>{error}</ErrorText>
  </Card>;
}

/** A11Y-08 (Sol R2-M2): the waiting clock speaks when it crosses 2 min, 1 min and 30 s, at the end, and when an extension lands. */
function GraceClock({ left, extended }: { left: number; extended: boolean }) {
  const { c } = useCopy();
  const text = left > 0 ? fill(c.rideGrace, { n: left }) : c.rideGraceEnded;
  const step = left > 120 ? 4 : left > 60 ? 3 : left > 30 ? 2 : left > 0 ? 1 : 0;
  // What is spoken changes only at a step or an extension: native announces it, the web reads it from a polite live region
  // (announceForAccessibility is a no-op on react-native-web; Sol R3-M5), the same pattern as the captain's offer clock.
  const spoken = step === 0 ? c.rideGraceEnded : `${extended ? `${c.rideGraceExtended} ` : ''}${fill(c.rideGrace, { n: [0, 30, 60, 120, Math.ceil(left / 60) * 60][step] })}`;
  useEffect(() => { if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(spoken); }, [spoken]);
  return <View>
    <Txt variant="caption">{text}</Txt>
    {Platform.OS === 'web' && <View accessibilityLiveRegion="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}><Txt>{spoken}</Txt></View>}
  </View>;
}
