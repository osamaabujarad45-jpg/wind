// Home, Uber/Careem pattern: one "Where to?" entry, the three services as small tiles, the live order,
// recent routes to book again, and short cards that explain saving and safety.
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApi } from '../../api';
import { activeStatuses, city, defaultSettings, services, type Order, type Service } from '../../model';
import { OrderRow, ServiceIcon } from '../../parts';
import { useSession } from '../../session';
import { Appear, ErrorText, fill, IconButton, ListGroup, Loading, Logo, palette, Press, Rail, Row, Screen, Section, shadow, Tip, Txt, useCopy, type IconName } from '../../ui';

const book = (params: { service: Service; from?: string; to?: string; pick?: 'to' }) => router.push({ pathname: '/book', params });

export default function Home() {
  const { me } = useSession();
  const { c, row, rtl, language } = useCopy();
  const { data, error, reload } = useApi<Order[]>('/orders', 10_000);
  const orders = data ?? [];
  const active = orders.filter(o => o.status === 'searching' || activeStatuses.includes(o.status));
  // Latest distinct routes, newest first: the "book again" list.
  const recent = orders.filter((o, i) => orders.findIndex(x => x.service === o.service && x.pickupCity === o.pickupCity && x.dropoffCity === o.dropoffCity) === i).slice(0, 3);
  const first = me?.user.name.split(' ')[0] ?? '';
  const greet = new Date().getHours() < 12 ? c.goodMorning : c.goodEvening;
  const enabledServices = me?.capabilities?.enabledServices ?? ['parcel'];

  return <Screen onRefresh={reload}>
    <Row style={{ justifyContent: 'space-between', marginBottom: 14 }}>
      <Row gap={10}>
        <Logo size={34} />
        <View>
          <Txt variant="micro">{greet}</Txt>
          <Txt variant="h2" numberOfLines={1}>{first}</Txt>
        </View>
      </Row>
      <IconButton icon="help-circle-outline" label={c.help} onPress={() => router.push('/help')} />
    </Row>

    {/* The one entry point: destination first, like Uber's "Where to?" */}
    <Press accessibilityLabel={c.whereTo} onPress={() => book({ service: 'parcel', pick: 'to' })} style={[styles.search, { flexDirection: row }]}>
      <View style={styles.searchIcon}><Ionicons name="search" size={20} color={palette.ink} /></View>
      <Text style={[styles.searchText, { textAlign: rtl ? 'right' : 'left' }]}>{c.whereTo}</Text>
      <View style={[styles.now, { flexDirection: row }]}>
        <Ionicons name="time-outline" size={15} color={palette.ink} />
        <Text style={styles.nowText}>{c.now}</Text>
      </View>
    </Press>

    <Tip id="home-first" icon="sparkles-outline" title={c.tipHomeTitle} body={c.tipHomeBody} />

    <Section title={c.services} />
    <Row gap={10} style={{ marginBottom: 18, alignItems: 'stretch' }}>
      {services.filter(service => enabledServices.includes(service)).map((service, i) => <Appear key={service} index={i} style={{ flex: 1 }}>
        <Press accessibilityLabel={c[service]} onPress={() => book({ service })} style={[styles.tile, shadow]}>
          <ServiceIcon service={service} size={42} />
          <Txt variant="label" center numberOfLines={2}>{c[service]}</Txt>
        </Press>
      </Appear>)}
    </Row>
    <ErrorText>{error && c.updatesPaused}</ErrorText>
    {!data && !error && <Loading />}

    {active.length > 0 && <>
      <Section title={c.activeOrder} />
      {active.map((order, i) => <OrderRow key={order.id} order={order} index={i} />)}
    </>}

    {recent.length > 0 && <>
      <Section title={c.recent} action={c.seeAll} onAction={() => router.navigate('/orders')} />
      <ListGroup>
        {recent.map(o => <Press key={o.id} accessibilityLabel={`${c.request} ${city(o.pickupCity)[language]} ${city(o.dropoffCity)[language]}`}
          onPress={() => book({ service: o.service, from: o.pickupCity, to: o.dropoffCity })} style={[styles.recent, { flexDirection: row }]}>
          <View style={styles.clock}><Ionicons name="time-outline" size={17} color={palette.secondary} /></View>
          <View style={{ flex: 1 }}>
            <Txt variant="title" numberOfLines={1}>{city(o.pickupCity)[language]} {rtl ? '←' : '→'} {city(o.dropoffCity)[language]}</Txt>
            <Txt variant="caption" numberOfLines={1}>{c[o.service]} · {o.pickupNote}</Txt>
          </View>
          <Ionicons name="refresh" size={17} color={palette.olive} />
        </Press>)}
      </ListGroup>
    </>}

    <Section title={c.waysToSave} />
    <Rail gap={10} style={{ marginHorizontal: -16 }} contentStyle={{ paddingBottom: 4 }}>
      <View style={{ width: 6 }} />
      <Promo tone="clay" icon="shield-checkmark-outline" title={c.promoSafe} body={c.promoSafeBody} onPress={() => router.push({ pathname: '/help', params: { topic: 'code' } })} />
      {!me?.plan && <Promo tone="olive" icon="sparkles-outline" title={c.plusTitle}
        body={fill(c.plusPitch, { pct: Math.round((me?.settings.plusDiscount ?? defaultSettings.plusDiscount) * 100), price: me?.settings.plusPrice ?? defaultSettings.plusPrice })} onPress={() => router.navigate('/account')} />}
      <View style={{ width: 6 }} />
    </Rail>
  </Screen>;
}

function Promo({ tone, icon, title, body, onPress }: { tone: 'forest' | 'clay' | 'olive'; icon: IconName; title: string; body: string; onPress: () => void }) {
  const t = { forest: [palette.forest, palette.lime, 'rgba(255,255,255,0.78)'], clay: [palette.clayPale, palette.clayInk, palette.ink], olive: [palette.olivePale, palette.olive, palette.ink] }[tone];
  return <Press accessibilityLabel={title} onPress={onPress} style={[styles.promo, { backgroundColor: t[0] }]}>
    <Ionicons name={icon} size={20} color={t[1]} />
    <Txt variant="title" numberOfLines={2} style={{ color: tone === 'forest' ? palette.lime : palette.ink, marginTop: 8 }}>{title}</Txt>
    <Txt variant="caption" numberOfLines={2} style={{ color: t[2], opacity: tone === 'forest' ? 1 : 0.8 }}>{body}</Txt>
  </Press>;
}

const styles = StyleSheet.create({
  search: { alignItems: 'center', gap: 4, height: 52, borderRadius: 26, backgroundColor: palette.muted, paddingHorizontal: 6, marginBottom: 14 },
  searchIcon: { width: 38, alignItems: 'center' },
  searchText: { flex: 1, fontSize: 17, fontWeight: '800', color: palette.ink },
  now: { alignItems: 'center', gap: 5, height: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: palette.card },
  nowText: { fontSize: 13, fontWeight: '700', color: palette.ink },
  tile: { flex: 1, alignItems: 'center', gap: 8, borderRadius: 16, backgroundColor: palette.card, paddingVertical: 12, paddingHorizontal: 6 },
  recent: { alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 14, paddingVertical: 8 },
  clock: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.muted, alignItems: 'center', justifyContent: 'center' },
  promo: { width: 224, borderRadius: 16, padding: 14, minHeight: 118 },
});
