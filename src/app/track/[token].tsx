// Public trip page behind a shared link: no account, no personal details — status, cities, driver first name
// and vehicle, and a live position only while it is fresh. Polls like the order screen.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useApi } from '../../api';
import { city, ltr, type CityId, type OrderStatus, type Service, type Vehicle } from '../../model';
import { RouteLine, ServiceIcon } from '../../parts';
import RouteMap from '../../route-map';
import { Badge, Card, Empty, fill, Header, Loading, Row, Screen, Txt, useCopy } from '../../ui';

type Tracking = { orderCode: string; status: OrderStatus; service: Service; pickupCity: CityId; dropoffCity: CityId; updatedAt: number;
  driver: { firstName: string; vehicle: Vehicle | null } | null;
  driverLocation: { latitude: number; longitude: number; updatedAt: number } | null };

export default function TrackScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { c, language } = useCopy();
  const { data, error } = useApi<Tracking>(/^[a-f0-9]{64}$/.test(token ?? '') ? `/track/${token}` : null, 10_000);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 10_000); return () => clearInterval(timer); }, []);

  if (!data) return <Screen><Header title={c.trackTitle} />
    {error || !/^[a-f0-9]{64}$/.test(token ?? '') ? <Empty icon="link-outline" title={c.trackEnded} /> : <Loading />}</Screen>;

  const from = city(data.pickupCity), to = city(data.dropoffCity);
  const location = data.driverLocation ? { ...data.driverLocation, ageSeconds: Math.max(0, Math.round((now - data.driverLocation.updatedAt) / 1000)) } : null;
  const age = location?.ageSeconds ?? 0;
  return <Screen>
    <Header title={c.trackTitle} subtitle={ltr(data.orderCode)} right={<Badge label={c[data.status]} status={data.status} />} />
    <View style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
      <RouteMap pickup={from} dropoff={to} pickupTitle={from[language]} dropoffTitle={to[language]}
        driver={location} driverTitle={data.driver?.firstName} />
    </View>
    <Card>
      <Row gap={10} style={{ marginBottom: 10 }}>
        <ServiceIcon service={data.service} size={28} />
        <Txt variant="h2" style={{ flex: 1 }}>{c[data.status]}</Txt>
      </Row>
      <RouteLine from={from[language]} to={to[language]} />
      {data.driver && <Txt style={{ marginTop: 10 }}>{data.driver.vehicle ? `${data.driver.firstName} · ${c[data.driver.vehicle]}` : data.driver.firstName}</Txt>}
      {location && <Txt variant="caption" style={{ marginTop: 6 }}>{fill(c.trackUpdated, { s: age < 60 ? fill(c.agoSeconds, { n: age }) : fill(c.agoMinutes, { n: Math.floor(age / 60) }) })}</Txt>}
    </Card>
  </Screen>;
}
