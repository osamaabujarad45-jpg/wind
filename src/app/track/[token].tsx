// Public trip page behind a shared link: no account, no personal details — status, cities, driver first name
// and vehicle, and a live position only while it is fresh. Polls like the order screen.
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useApi } from '../../api';
import { locationState } from '../../location-state';
import { etaRange } from '../../map-math';
import { city, ltr, type CityId, type OrderStatus, type Service, type Vehicle } from '../../model';
import { RouteLine, ServiceIcon } from '../../parts';
import RouteMap from '../../route-map';
import { Badge, Button, Card, Empty, fill, Header, Loading, palette, Row, Screen, Txt, useCopy } from '../../ui';

type Tracking = { orderCode: string; status: OrderStatus; service: Service; pickupCity: CityId; dropoffCity: CityId; updatedAt: number;
  driver: { firstName: string; vehicle: Vehicle | null } | null;
  driverLocation: { latitude: number; longitude: number; updatedAt: number; heading?: number | null } | null };

export default function TrackScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { c, language } = useCopy();
  const { data, error } = useApi<Tracking>(/^[a-f0-9]{64}$/.test(token ?? '') ? `/track/${token}` : null, 10_000);
  const valid = /^[a-f0-9]{64}$/.test(token ?? '');
  const etaData = useApi<{ minutes: number | null; delayed?: boolean }>(valid && data?.driverLocation ? `/track/${token}/eta` : null, 30_000).data;
  const eta = etaData?.minutes, delayed = !!etaData?.delayed;
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 10_000); return () => clearInterval(timer); }, []);

  // A failed poll must not leave revoked tracking or stale GPS visible.
  if (error || !data) return <Screen><Header title={c.trackTitle} />
    {error || !/^[a-f0-9]{64}$/.test(token ?? '') ? <Empty icon="link-outline" title={error && error !== 'not_found' ? c.err_network : c.trackEnded} /> : <Loading />}</Screen>;

  const from = city(data.pickupCity), to = city(data.dropoffCity);
  const freshness = locationState(data.driverLocation ? { ...data.driverLocation, ageSeconds: 0 } : null, now);
  const location = data.driverLocation && freshness && !freshness.stale ? { ...data.driverLocation, ageSeconds: freshness.ageSeconds } : null;
  const age = location?.ageSeconds ?? 0;
  return <Screen>
    <Header title={c.trackTitle} subtitle={ltr(data.orderCode)} right={<Badge label={c[data.status]} status={data.status} />} />
    <View style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
      <RouteMap pickup={from} dropoff={to} focus={data.status === 'in_transit' ? 'dropoff' : 'pickup'} pickupTitle={from[language]} dropoffTitle={to[language]}
        driver={location} driverTitle={data.driver?.firstName} />
    </View>
    <Card>
      <Row gap={10} style={{ marginBottom: 10 }}>
        <ServiceIcon service={data.service} size={28} />
        <Txt variant="h2" style={{ flex: 1 }}>{c[data.status]}</Txt>
      </Row>
      <RouteLine from={from[language]} to={to[language]} />
      {data.driver && <Txt style={{ marginTop: 10 }}>{data.driver.vehicle ? `${data.driver.firstName} · ${c[data.driver.vehicle]}` : data.driver.firstName}</Txt>}
      {location && eta != null && <Txt variant="title" style={{ marginTop: 10 }}>{fill(data.status === 'in_transit'
        ? delayed ? c.etaToDropoffSlow : c.etaToDropoff
        : delayed ? c.etaToPickupSlow : c.etaToPickup, { lo: etaRange(eta)[0], hi: etaRange(eta)[1] })}</Txt>}
      {location && eta != null && delayed && <Txt variant="caption" style={{ marginTop: 4, color: palette.clayInk }}>{c.trackDelayed}</Txt>}
      {location && <Txt variant="caption" style={{ marginTop: 6 }}>{fill(c.trackUpdated, { s: age < 60 ? fill(c.agoSeconds, { n: age }) : fill(c.agoMinutes, { n: Math.floor(age / 60) }) })}</Txt>}
      {location && <Button title={c.navigate} icon="map-outline" variant="soft"
        onPress={() => { void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`).catch(() => undefined); }} />}
    </Card>
  </Screen>;
}
