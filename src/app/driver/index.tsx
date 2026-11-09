// Driver jobs, Uber Driver pattern: a presence card (never ready until the server confirms), then offer cards that lead with what the driver
// earns, the route spine, what the job carries, and one accept button.
import { useCallback, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { api, ApiError, apiSessionRevision, SUPPORT_URL, useApi } from '../../api';
import { canTake, cities, city, commissionOn, distanceKm, latinDigits, ltr, offerRange, type CityId, type Order, type Point } from '../../model';
import { MapSheet, SIDE_SHEET, useSideSheet } from '../../map-sheet';
import { DriverMap } from '../../driver-map';
import { pickupLocation } from '../../pickup-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDriverWork } from '../../driver-work';
import { FreightDetails } from '../../freight-details';
import { capacityCommand, dispatchAcceptance, secondsUntil } from '../../ride-flow';
import { BackgroundLocationAction, DriverPresenceCard } from '../../driver-presence-card';
import { RouteLine, ServiceIcon, useFormat, VerifyEmailNudge } from '../../parts';
import { useSession } from '../../session';
import { shadow, Button, Card, Empty, ErrorText, Field, FilterChips, fill, haptic, IconButton, Loading, palette, Press, Reason, Row, Screen, Txt, useCopy } from '../../ui';

type JobsPage = { version: 1; jobs: Order[]; nextCursor: string | null };

export default function Jobs() {
  const { me, refresh } = useSession();
  const { c, money, err, language, rtl } = useCopy();
  const side = useSideSheet();
  const { time } = useFormat();
  const active = me?.user.status === 'active';
  // A cursor is valid only for this driver and destination filter; changing either returns to the first page.
  const pageScope = `${me?.user.id ?? ''}:${me?.user.heading?.city ?? ''}:${me?.user.heading?.until ?? ''}`;
  const [pages, setPages] = useState<{ scope: string; cursors: string[] }>({ scope: '', cursors: [] });
  const cursors = pages.scope === pageScope ? pages.cursors : [];
  const cursor = cursors.at(-1);
  // Set only while the driver is online or on a job (DriverMap): how far each pickup is, for this answer only.
  const [here, setHere] = useState<Point | null>(null);
  const [peek, setPeek] = useState(0);
  const presenceOn = me?.capabilities?.driverPresence !== false;
  const [locateOn, setLocateOn] = useState(false); // their own tap: GPS for the dot and pickup distances, for this visit to the screen only
  const locateRequest = useRef<AbortController | null>(null);
  const [manualOpen, setManualOpen] = useState<boolean | null>(null); // until the driver chooses, the sheet opens when there are offers
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => { setFocused(false); locateRequest.current?.abort(); locateRequest.current = null; setLocateOn(false); };
  }, []));
  const { data, error, reload } = useApi<JobsPage | Order[]>(active ? `/jobs?page=1&capacityProtocol=1&lang=${language}${here ? `&near=${here.latitude.toFixed(3)},${here.longitude.toFixed(3)}` : ''}${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}` : null, 8000);
  const page = data && !Array.isArray(data) && data.version === 1 && Array.isArray(data.jobs)
    && (data.nextCursor === null || typeof data.nextCursor === 'string') ? data : undefined;
  const badCursor = !!page?.nextCursor && (!/^\d{1,16}:\d{1,16}$/.test(page.nextCursor) || page.nextCursor === cursor);
  // Older APIs ignore `page=1` and return an array. Never present a repeated first page as a new page.
  const pagingUnavailable = (Array.isArray(data) && (!!cursor || data.length === 50)) || (!!data && !Array.isArray(data) && !page) || badCursor;
  const jobs = Array.isArray(data) ? (cursor ? [] : data) : page?.jobs;
  const work = useDriverWork();
  const matching = useApi<{ eligibleForMatching: boolean }>(active && work.presenceState === 'online' ? '/driver/presence' : null, 8000);
  const { permission } = work;
  const [busy, setBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const focusRevision = useRef(0);
  const [now, setNow] = useState(Date.now);
  useFocusEffect(useCallback(() => {
    focusRevision.current++; setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { focusRevision.current++; clearInterval(timer); };
  }, []));
  const [offering, setOffering] = useState<{ id: number; text: string } | null>(null); // the open "offer your price" form
  const rate = me?.plan === 'pro' ? me.settings.proCommission : me?.settings.commission ?? 0;
  const located = work.tracking === 'sharing';
  const locating = work.tracking === 'starting';
  const carrying = work.orders;
  const assigned = carrying.length > 0;
  // Parcels stack up; a ride or freight load is exclusive (SPEC-parcel-standard.md).
  const blocked = (order: Order) => !canTake(carrying, order.service);
  // Why Accept and the offer buttons wait, in one sentence under them (design §10). Null exactly when they can be pressed.
  const acceptReason = (order: Order) => busy !== null ? c.accept_busy : dispatchAcceptance(order, now) === null ? c.dispatchExpired : !work.known ? c.accept_wait_status
    : blocked(order) ? (order.service === 'parcel' && carrying.every(o => o.service === 'parcel') ? c.accept_blocked_parcels : c.accept_blocked_exclusive) : null;

  async function accept(order: Order) {
    if (busy !== null || blocked(order) || !work.known) return;
    setBusy(order.id);
    setActionError('');
    const session = apiSessionRevision(), focus = focusRevision.current;
    const current = () => apiSessionRevision() === session && focusRevision.current === focus;
    try {
      const prepared = await work.prepareTracking();
      if (!current()) return;
      if (!prepared) {
        haptic.error();
        setActionError(c.locationOff);
        return;
      }
      const lease = dispatchAcceptance(order, Date.now()); // tracking permission can outlive a short offer
      if (lease === null) { setActionError(c.dispatchExpired); reload(); return; }
      work.update(await api<Order>(`/jobs/${order.id}/accept`, { ...lease, ...capacityCommand(order) }));
      haptic.success();
      router.push(`/order/${order.id}`);
    } catch (e) {
      if (!current()) return;
      const failure = e instanceof ApiError ? e.offerFailure : undefined;
      if (failure?.recovery === 'reconcile' || e instanceof ApiError && !e.status) {
        try {
          const fresh = await api<Order>(`/orders/${order.id}?capacityProtocol=1&recoveryProtocol=1`);
          if (!current()) return;
          if (fresh.driverId === me?.user.id && ['assigned','at_pickup','in_transit'].includes(fresh.status)) {
            work.update(fresh); router.push(`/order/${fresh.id}`); return;
          }
        } catch { /* Keep the existing refusal/unknown outcome; never resend acceptance automatically. */ }
      }
      haptic.error();
      setActionError(err(e));
      await Promise.all([reload(), work.reload()]);
    } finally { setBusy(null); }
  }

  // Driver offers (SPEC-driver-offers.md): any whole price in the band around the recommendation; the customer chooses.
  async function offer(order: Order, price: number) {
    if (busy !== null || blocked(order) || !work.known || order.dispatch) return;
    setBusy(order.id);
    setActionError('');
    const session = apiSessionRevision(), focus = focusRevision.current;
    const current = () => apiSessionRevision() === session && focusRevision.current === focus;
    try {
      // An accepted offer is an assignment: location sharing must be ready, exactly as for Accept.
      const prepared = await work.prepareTracking();
      if (!current()) return;
      if (!prepared) {
        haptic.error();
        setActionError(c.locationOff);
        return;
      }
      await api<Order>(`/jobs/${order.id}/offer`, { price, ...capacityCommand(order) });
      haptic.success();
      setOffering(null);
      reload();
    } catch (e) { haptic.error(); setActionError(err(e)); reload(); } finally { setBusy(null); }
  }

  async function decline(order: Order) {
    const lease = dispatchAcceptance(order, Date.now());
    if (busy !== null || !lease || !('offerId' in lease)) return;
    setBusy(order.id); setActionError('');
    try { await api(`/offers/${lease.offerId}/decline`, {}); haptic.success(); await reload(); }
    catch (e) { haptic.error(); setActionError(err(e)); reload(); }
    finally { setBusy(null); }
  }

  // Destination filter (SPEC-driver-destination.md): only jobs dropping off in that city, for 3 hours.
  const [headingBusy, setHeadingBusy] = useState(false);
  async function head(target: CityId | 'any') {
    setActionError('');
    setHeadingBusy(true);
    try { await api('/driver/heading', { city: target === 'any' ? null : target }); setPages({ scope: '', cursors: [] }); await refresh(); reload(); }
    catch (e) { haptic.error(); setActionError(err(e)); } finally { setHeadingBusy(false); }
  }

  function locate() {
    if (locateRequest.current) return;
    const request = locateRequest.current = new AbortController();
    setActionError('');
    pickupLocation(request.signal)
      .then(() => { if (!request.signal.aborted) setLocateOn(true); })
      .catch(() => { if (!request.signal.aborted) { setActionError(c.driverLocateFailed); setManualOpen(true); } }) // their tap: show why, even on a sheet they closed
      .finally(() => { if (locateRequest.current === request) locateRequest.current = null; });
  }

  async function enableTracking() {
    try {
      if (permission?.canAskAgain === false && !permission.granted) await Linking.openSettings();
      else if (!await work.prepareTracking()) setActionError(c.locationOff);
    } catch { setActionError(c.locationOff); }
  }

  if (!active) return <Screen onRefresh={refresh}>
    <VerifyEmailNudge />
    {/* Without a configured support line there is nothing to contact: promise the call-back admins are now alerted for (SPEC-pending-driver-help.md). */}
    <Empty icon="shield-checkmark-outline" title={c.pendingTitle} body={SUPPORT_URL ? c.pendingDesc : fill(c.pendingCallBack, { phone: ltr(me?.user.phone ?? '') })}
      action={SUPPORT_URL ? <Button title={c.whatsappSupport} icon="logo-whatsapp" variant="soft" onPress={() => { void Linking.openURL(SUPPORT_URL!); }} /> : undefined} />
  </Screen>;

  return <View style={{ flex: 1, backgroundColor: palette.paper }}>
    {/* A driver's work starts on the map, where they are; going online and the offers sit on the sheet over it. */}
    {focused && <DriverMap active={work.presenceState === 'online' || assigned || locateOn} bottom={peek} label={c.jobs} onHere={setHere} />}
    <SafeAreaView edges={['top']} pointerEvents="box-none" style={[styles.top, side && (rtl ? { left: SIDE_SHEET, right: 0 } : { right: SIDE_SHEET })]}>
      <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'flex-start' }} pointerEvents="box-none">
        <View style={[styles.title, shadow]}><Txt variant="title" numberOfLines={1}>{c.jobs}{jobs?.length ? ` (${jobs.length})` : ''}</Txt></View>
        <View style={{ gap: 8 }}>
          <IconButton icon="trail-sign-outline" label={c.roads} onPress={() => router.push('/roads')} />
          {!presenceOn && !assigned && !locateOn && <IconButton icon="locate" label={c.useLocation} onPress={locate} />}
        </View>
      </View>
    </SafeAreaView>
    {/* Closed only when there is nothing to read: offers, a later page with its way back, or a failure all live on the sheet. */}
    <MapSheet open={manualOpen ?? (!!jobs?.length || cursors.length > 0 || pagingUnavailable || !!error || !!work.error || !!actionError)} onOpenChange={setManualOpen} onPeek={setPeek} safeBottom={false} expandedRatio={0.78} onRefresh={async () => { await Promise.all([reload(), work.reload()]); }}
      header={<View style={{ paddingBottom: 10 }}>
    {/* Active-job tracking: its own purpose and transport, shown only while a job is assigned. */}
    {/* Forest while sharing; a plain clay warning when off, not a clay pill boxed inside a dark card. */}
    {assigned && work.known && <Card tone={located ? 'forest' : 'clay'} style={{ paddingVertical: 12 }}>
      <Press accessibilityLabel={located ? c.sharingLocation : c.locationOff} onPress={() => { void enableTracking(); }}>
        <Row gap={8} style={[styles.location, { backgroundColor: located ? 'rgba(211,242,122,0.14)' : palette.card }]}>
          <Ionicons name={located ? 'locate' : 'location-outline'} size={16} color={located ? palette.lime : palette.clayInk} />
          <Txt variant="caption" style={{ flex: 1, fontWeight: '700', color: located ? palette.lime : palette.clayInk }}>
            {located ? c.sharingLocation : locating ? c.locationStarting : c.locationOff}
          </Txt>
        </Row>
      </Press>
      {located && work.backgroundGranted === false && <Txt variant="caption" style={{ marginTop: 8, color: palette.clayPale }}>{c.backgroundTrackingWarn}</Txt>}{/* on forest: clayInk read 2.4:1 */}
    </Card>}

    {/* During a job presence is stopped (driver-work) and Go online can't be pressed; the card returns if it has something to say. */}
    {presenceOn && !(assigned && !work.presenceError && !work.presencePending) ? <>
      {/* Pre-assignment presence. Starts only from the card's own consent and go-online presses; never on mount. */}
      <View style={{ marginTop: assigned && work.known ? 12 : 0 }}>
        <DriverPresenceCard state={work.presenceState} consentAccepted={work.presenceConsentAccepted}
          requestsOn={work.presenceState === 'online' && matching.data?.eligibleForMatching === true}
          pending={work.presencePending} error={work.presenceError ? err(work.presenceError) : null}
          startDisabled={!work.known || assigned} startReason={!work.known ? c.presence_reason_status : assigned ? c.presence_reason_job : undefined}
          onConsentAndEnable={() => { void work.enablePresence(); }} onDisable={() => { void work.disablePresence(); }}
          onOpenSettings={() => { void Linking.openSettings(); }} />
      </View>
    </> : !assigned && jobs && <Txt variant="title">{jobs?.length ? fill(c.jobsAvailable, { n: jobs.length }) : c.jobsNone}</Txt>}

    {/* gap keeps the shortcut from reading as the first offer's header */}
    {carrying.length === 1 && <View style={{ marginBottom: 14 }}><Button title={c.activeOrder} variant="soft" icon="navigate-outline" onPress={() => router.push(`/order/${carrying[0]!.id}`)} /></View>}
    {carrying.length > 1 && <View style={{ marginBottom: 14 }}><Button title={fill(c.carryingParcels, { n: carrying.length })} variant="soft" icon="cube-outline" onPress={() => router.push('/driver/trips')} /></View>}
      </View>}>
    <VerifyEmailNudge />

    <Txt variant="label" style={{ marginTop: 4 }}>{c.headingTo}</Txt>
    <FilterChips items={[{ key: 'any' as const, label: c.headingAny }, ...cities.map(x => ({ key: x.id, label: x[language] }))]}
      value={me?.user.heading?.city ?? 'any'} disabled={headingBusy} onChange={key => { void head(key); }} />
    {me?.user.heading && <Txt variant="caption" style={{ marginTop: -6, marginBottom: 6 }}>{fill(c.headingUntil, { city: city(me.user.heading.city)[language], t: time(me.user.heading.until) })}</Txt>}

    <ErrorText>{actionError || ((error || work.error) && err(error || work.error))}</ErrorText>

    {!jobs && pagingUnavailable ? <Empty icon="alert-circle-outline" title={c.jobsPagingTitle} body={c.jobsPagingUnavailable} />
      : !jobs ? <Loading failed={!!error} onRetry={reload} /> : jobs.length === 0
      ? <Empty icon="hourglass-outline" title={pagingUnavailable ? c.jobsPagingTitle : cursors.length ? c.jobsNoMore : c.noJobs}
        body={pagingUnavailable ? c.jobsPagingUnavailable : cursors.length ? c.jobsNoMoreDesc : c.noJobsDesc} />
      : jobs.map(order => {
        const earn = order.price - commissionOn(order.price, rate);
        // The road km the price used; fixed-price orders (Souq, old apps) only have the city-centre estimate.
        const km = order.routeKm != null ? `${order.routeKm}` : `≈ ${distanceKm(city(order.pickupCity), city(order.dropoffCity))}`;
        const waiting = acceptReason(order);
        // Native layout animation can retain a removed assignment panel's offset.
        return <View key={order.id}>
          <Card>
            <Row gap={10} style={{ marginBottom: 12 }}>
              <ServiceIcon service={order.service} size={38} />
              <View style={{ flex: 1 }}>
                <Txt variant="title">{c[order.service]}</Txt>
                <Txt variant="caption">{/* same rule as OrderRow: only shared, the exception, is marked */}{order.shared ? `${c.shared} · ` : ''}{order.pickupCity === order.dropoffCity && order.routeKm == null ? c.sameCity : `${km} ${c.km}`}{order.pickupKm != null ? ` · ${fill(c.pickupFromYou, { km: order.pickupKm })}` : ''}</Txt>
                {order.customerStats && <Txt variant="caption">{order.customerStats.trips ? [order.customerStats.rating != null && fill(c.customerStars, { r: order.customerStats.rating }),
                  fill(c.tripsCount, { n: order.customerStats.trips })].filter(Boolean).join(' · ') : c.newCustomer}</Txt>}
              </View>
              <View style={{ alignItems: rtl ? 'flex-start' : 'flex-end' }}>
                <Txt variant="micro">{c.earnLabel}</Txt>
                <Txt variant="h2" style={{ color: palette.olive }}>{money(earn)}</Txt>
              </View>
            </Row>
            {order.discount > 0 && <Row gap={6} style={[styles.note, { marginTop: 0, marginBottom: 10 }]}>
              <Ionicons name="cash-outline" size={15} color={palette.olive} />
              <Txt variant="label" style={{ flex: 1 }}>{fill(c.collectCash, { p: money(order.price - order.discount) })}</Txt>
            </Row>}
            {order.scheduledFor && <Row gap={6} style={[styles.note, { marginTop: 0, marginBottom: 10 }]}>
              <Ionicons name="calendar-outline" size={14} color={palette.olive} />
              <Txt variant="label" style={{ flex: 1 }}>{fill(c.pickupAt, { t: time(order.scheduledFor) })}</Txt>
            </Row>}
            <RouteLine from={order.pickupArea || city(order.pickupCity)[language]} to={order.dropoffArea || city(order.dropoffCity)[language]} fromNote={order.pickupNote} toNote={order.dropoffNote} ride={order.service === 'ride'} />
            <FreightDetails order={order} />
            {order.dispatch?.myOffer && <Txt variant="label" style={{ marginTop: 8 }}>
              {fill(c.dispatchOfferClock, { n: secondsUntil(order.dispatch.myOffer.expiresAt, now, order.journey) })}
            </Txt>}
            {!!order.detail && <Row gap={6} style={styles.note}>
              <Ionicons name="document-text-outline" size={14} color={palette.secondary} />
              <Txt variant="caption" numberOfLines={2} style={{ flex: 1 }}>{order.detail}</Txt>
            </Row>}
            {order.myOffer && <Row gap={6} style={styles.note}>
              <Ionicons name="hourglass-outline" size={14} color={palette.olive} />
              <Txt variant="label" style={{ flex: 1 }}>{fill(c.yourOffer, { p: money(order.myOffer.price) })}</Txt>
            </Row>}
            {!order.dispatch && offering?.id === order.id && order.recommendedPrice != null && (() => {
              const [lo, hi] = offerRange(order.recommendedPrice), n = Number(offering.text);
              const ok = Number.isInteger(n) && n >= lo && n <= hi;
              return <View style={{ marginTop: 12 }}>
                <Field label={`${c.offerPrice} (₪)`} icon="cash-outline" keyboardType="number-pad" value={offering.text} maxLength={4}
                  onChangeText={text => setOffering({ id: order.id, text: latinDigits(text).replace(/\D/g, '') })}
                  error={offering.text && !ok ? fill(c.offerRange, { lo: money(lo), hi: money(hi) }) : undefined} />
                <Txt variant="caption" style={{ marginBottom: 8 }}>{fill(c.recommendedIs, { p: money(order.recommendedPrice) })} · {fill(c.offerRange, { lo: money(lo), hi: money(hi) })}</Txt>
                <Button title={fill(c.sendOffer, { p: ok ? money(n) : '' })} icon="paper-plane-outline" variant="soft"
                  onPress={() => offer(order, n)} loading={busy === order.id} disabled={!ok || busy !== null || blocked(order) || !work.known} />
                {!ok && <Reason>{fill(c.offerWhole, { lo: money(lo), hi: money(hi) })}</Reason>}
              </View>;
            })()}
            <View style={{ marginTop: 12, gap: 8 }}>
              <Button title={order.recommendedPrice != null ? fill(c.acceptAt, { p: money(order.price) }) : c.accept} icon="checkmark-circle-outline"
                onPress={() => accept(order)} loading={busy === order.id && offering?.id !== order.id} disabled={!!waiting} />
              {order.dispatch?.myOffer && <Button title={c.dispatchDecline} variant="ghost" disabled={busy !== null || dispatchAcceptance(order, now) === null}
                onPress={() => decline(order)} />}
              {!order.dispatch && order.recommendedPrice != null && offering?.id !== order.id && <Button title={c.offerPrice} icon="pricetags-outline" variant="ghost"
                disabled={busy !== null || blocked(order) || !work.known} onPress={() => setOffering({ id: order.id, text: String(order.myOffer?.price ?? order.recommendedPrice) })} />}
              {waiting && <Reason>{waiting}</Reason>}
            </View>
          </Card>
        </View>;
      })}
    {pagingUnavailable && !!jobs?.length && <Txt variant="caption" style={{ marginBottom: 8 }}>{c.jobsPagingUnavailable}</Txt>}
    {cursors.length > 0 && <Button title={c.jobsPreviousPage} variant="soft" onPress={() => setPages({ scope: pageScope, cursors: cursors.slice(0, -1) })} />}
    {page?.nextCursor && !badCursor && <Button title={c.jobsNextPage} variant="soft" onPress={() => {
      setPages({ scope: pageScope, cursors: [...cursors, page.nextCursor!] });
    }} />}
    {/* Optional and separately tapped: never requested automatically. */}
    <View style={{ marginTop: 12 }}>
      <BackgroundLocationAction onRequest={() => work.requestBackgroundTracking()} />
    </View>

    </MapSheet>
  </View>;
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, paddingTop: 8 },
  title: { backgroundColor: palette.card, borderRadius: 16, paddingHorizontal: 14, justifyContent: 'center', minHeight: 44 },
  location: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 10 },
  note: { alignItems: 'flex-start', marginTop: 10, backgroundColor: palette.muted, borderRadius: 10, padding: 8 },
});
