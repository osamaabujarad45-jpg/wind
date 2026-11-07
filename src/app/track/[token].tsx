// Public trip page behind a shared link: no account, no personal details — status, cities, driver first name
// and vehicle, and a live position only while it is fresh. Polls like the order screen.
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useApi, useLiveFix } from '../../api';
import { locationState, newerFix, publicFixAgeMs, publicFixClock, retainedPublicFix } from '../../location-state';
import { deadlineSeconds } from '../../api-clock';
import type { JourneyEta } from '../../journey-contracts';
import { etaRange, fromDriver } from '../../map-math';
import { city, ltr, type CityId, type OrderStatus, type Service, type Vehicle } from '../../model';
import { EtaLine, RouteLine, ServiceIcon, statusText } from '../../parts';
import RouteMap from '../../route-map';
import { Button, Card, Empty, fill, Header, Loading, palette, Row, Screen, Txt, useCopy } from '../../ui';

type Tracking = { orderCode: string; status: OrderStatus; service: Service; pickupCity: CityId; dropoffCity: CityId; updatedAt: number;
  driver: { firstName: string; vehicle: Vehicle | null; ref: string } | null;
  driverLocation: { latitude: number; longitude: number; updatedAt: number; ageSeconds?: number; heading?: number | null } | null };

export default function TrackScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { c, language } = useCopy();
  const valid = /^[a-f0-9]{64}$/.test(token ?? '');
  const { data: polled, error, reload } = useApi<Tracking>(valid ? `/track/${token}` : null, 10_000);
  // Driver position over the live push; the 10 s poll carries status and revocation.
  const live = useLiveFix<NonNullable<Tracking['driverLocation']>>(valid && polled?.driver ? `/track/${token}/live?driver=${polled.driver.ref}` : null);
  const fresh = polled && live.value !== undefined ? newerFix(live.value, polled.driverLocation) : polled?.driverLocation;
  // The server stops sending a fix after 120 s: keep the last one seen for this driver, faded as "last known",
  // instead of dropping the car (a reload or a new link starts without it).
  const assignment = polled?.driver?.ref ?? null;
  const [{ wall: now, monotonic }, setNow] = useState(() => ({ wall: Date.now(), monotonic: performance.now() }));
  const [kept, setKept] = useState<{ assignment: string | null; fix?: NonNullable<Tracking['driverLocation']>; clock?: ReturnType<typeof publicFixClock> }>();
  if (assignment !== kept?.assignment || (fresh && fresh.updatedAt !== kept?.fix?.updatedAt)) setKept({
    assignment, fix: fresh ?? undefined, clock: fresh ? publicFixClock(fresh, now, monotonic) : undefined,
  });
  const keptFix = kept?.assignment === assignment ? kept?.fix ?? null : null;
  // Both the poll and the live channel can retain an old answer during a network failure.
  const candidate = fresh ?? keptFix;
  const fixClock = kept?.assignment === assignment ? kept.clock : undefined;
  const fixAge = candidate ? publicFixAgeMs(candidate, now, fixClock, monotonic) : Infinity;
  const shown = retainedPublicFix(candidate, now, fixClock, monotonic);
  // A reassignment invalidates the snapshot's driver: hide the old car and name
  // even while the refresh that brings the new driver is failing.
  const data = polled && { ...polled, ...(live.driverChanged ? { driver: null, driverLocation: null } : { driverLocation: shown }) };
  const etaApi = useApi<{ eta?: JourneyEta; minutes: number | null; sharedRun?: boolean; delayed?: boolean; approach?: [number, number][]; road?: [number, number][] | null; fixUpdatedAt?: number }>(valid && shown && assignment && polled && !live.driverChanged ? `/track/${token}/eta?journeyProtocol=1&driver=${encodeURIComponent(assignment)}&status=${encodeURIComponent(polled.status)}` : null, 15_000);
  // useApi keeps the last answer when a refresh fails: show no estimate (or approach line) rather than an old one.
  // The estimate starts from the driver's position: past 30 s it describes a place the driver has left.
  useEffect(() => { const timer = setInterval(() => setNow({ wall: Date.now(), monotonic: performance.now() }), 10_000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (live.driverChanged) void reload(); }, [live.driverChanged, reload]);
  const etaData = etaApi.data, etaFresh = !etaApi.error && etaData?.fixUpdatedAt != null && (locationState({
    updatedAt: etaData.fixUpdatedAt,
    ageSeconds: candidate ? Math.floor(Math.max(0, fixAge + candidate.updatedAt - etaData.fixUpdatedAt) / 1000) : undefined,
  }, now)?.ageSeconds ?? Infinity) <= 30;
  const eta = etaFresh && (!etaData?.eta || deadlineSeconds(etaData.eta.validity.expiresAt, etaData.eta, now) > 0) ? etaData?.minutes : undefined, delayed = !!etaData?.delayed;

  // A failed poll must not leave revoked tracking or stale GPS visible — but it must not blank the page either:
  // the last answer stays with a note that the updates are paused.
  if (error === 'not_found') return <Screen><Header title={c.trackTitle} /><Empty icon="link-outline" title={c.trackEnded} /></Screen>;
  if (!data) return <Screen><Header title={c.trackTitle} />
    {error || !valid ? <Empty icon="link-outline" title={error && error !== 'not_found' ? c.err_network : c.trackEnded} /> : <Loading />}</Screen>;

  const from = city(data.pickupCity), to = city(data.dropoffCity);
  const freshness = locationState(data.driverLocation && { ...data.driverLocation, ageSeconds: Math.floor(fixAge / 1000) }, now);
  const age = freshness?.ageSeconds ?? 0;
  const location = data.driverLocation && freshness ? { ...data.driverLocation, ageSeconds: freshness.ageSeconds } : null;
  // The leg the driver is on: towards the pickup until it is collected, towards the dropoff after that.
  const toPickup = ['assigned', 'at_pickup', 'returning'].includes(data.status);
  return <Screen>
    <Header title={c.trackTitle} subtitle={ltr(data.orderCode)} />{/* the card below heads with the status; a header badge only echoed it */}
    {error && <Txt variant="caption" style={{ marginBottom: 8 }}>{c.updatesPaused}</Txt>}
    <View style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
      {/* Anonymous tracking draws the free baseline only: a Google-keyed build still makes zero paid calls here (T15). */}
      <RouteMap forceBaseline pickup={from} dropoff={to} focus={toPickup ? 'pickup' : 'dropoff'} pickupTitle={from[language]} dropoffTitle={to[language]}
        driver={location} driverTitle={data.driver?.firstName} road={etaData?.road} height={location ? 300 : undefined}
        stale={!!freshness?.stale} approach={location && etaFresh && etaData?.approach ? fromDriver(etaData.approach, location) : null} />
    </View>
    <Card>
      <Row gap={10} style={{ marginBottom: 10 }}>
        <ServiceIcon service={data.service} size={28} />
        <Txt variant="h2" style={{ flex: 1 }}>{statusText(c, data)}</Txt>
      </Row>
      <RouteLine from={from[language]} to={to[language]} ride={data.service === 'ride'} />
      {data.driver && <Txt style={{ marginTop: 10 }}>{data.driver.vehicle ? `${data.driver.firstName} · ${c[data.driver.vehicle]}` : data.driver.firstName}</Txt>}
      {location && !freshness?.stale && eta != null && <View style={{ marginTop: 10 }}><EtaLine eta={etaData?.eta ? [Math.ceil(etaData.eta.minSeconds / 60), Math.ceil(etaData.eta.maxSeconds / 60)] : etaRange(eta)} now={now} slow={delayed} toPickup={toPickup} /></View>}
      {location && etaData?.sharedRun && <Txt variant="caption" style={{ marginTop: 10 }}>{c.courierRun}</Txt>}
      {location && !freshness?.stale && eta != null && delayed && <Txt variant="caption" style={{ marginTop: 4, color: palette.clayInk }}>{c.trackDelayed}</Txt>}
      {location && <Txt variant="caption" style={{ marginTop: 6 }}>{fill(freshness?.stale ? c.lastDriver : c.trackUpdated, { s: age < 60 ? fill(c.agoSeconds, { n: age }) : fill(c.agoMinutes, { n: Math.floor(age / 60) }) })}</Txt>}
      {location && !freshness?.stale && <Button title={c.navigate} icon="map-outline" variant="soft"
        onPress={() => { void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`).catch(() => undefined); }} />}
    </Card>
  </Screen>;
}
