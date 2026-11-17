// Home, Uber/Careem pattern: one "Where to?" entry, the three services as small tiles, the live order,
// recent routes to book again, and short cards that explain saving and safety.
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApi } from '../../api';
import { activeStatuses, city, defaultSettings, services, type Order, type Service } from '../../model';
import { OrderRow, ServiceIcon, VerifyEmailNudge } from '../../parts';
import { useSession } from '../../session';
import { Appear, ErrorText, fill, IconButton, ListGroup, Loading, Logo, palette, Press, Rail, Row, Screen, Section, shadow, Txt, useCopy, type IconName } from '../../ui';

const book = (params: { service: Service; from?: string; to?: string; pick?: 'to'; when?: 'later'; again?: string }) => router.push({ pathname: '/book', params });

export default function Home() {
  const { me } = useSession();
  const { c, row, rtl, language } = useCopy();
  const { data, error, reload } = useApi<Order[]>('/orders', 10_000);
  const orders = data ?? [];
  const active = orders.filter(o => o.status === 'searching' || activeStatuses.includes(o.status));
  // Latest distinct routes, newest first: the "book again" list. Only finished trips, as Amazon's "Buy it again"
  // skips what is still on its way; an in-flight route already shows above it.
  const done = orders.filter(o => !active.includes(o));
  const recent = done.filter((o, i) => done.findIndex(x => x.service === o.service && x.pickupCity === o.pickupCity && x.dropoffCity === o.dropoffCity) === i).slice(0, 3);
  const first = me?.user.name.split(' ')[0] ?? '';
  const greet = new Date().getHours() < 12 ? c.goodMorning : c.goodEvening;
  const enabledServices = me?.capabilities?.enabledServices ?? ['parcel'];

  return <Screen onRefresh={reload}>
    <Row style={{ justifyContent: 'space-between', marginBottom: 14 }}>
      <Row gap={10} style={{ flexShrink: 1 }}>
        <Logo size={34} />
        <View style={{ flexShrink: 1 }}>
          <Txt variant="micro">{greet}</Txt>
          <Txt variant="h2" numberOfLines={2}>{first}</Txt>
        </View>
      </Row>
      <IconButton icon="help-circle-outline" label={c.help} onPress={() => router.push('/help')} />
    </Row>

    {/* The one entry point: destination first, like Uber's "Where to?", with "Later" a real control rather than a label
        drawn like a button. */}
    <View style={[styles.search, { flexDirection: row }]}>
      <Press accessibilityLabel={c.whereTo} containerStyle={{ flex: 1 }} onPress={() => book({ service: 'parcel', pick: 'to' })} style={[styles.searchMain, { flexDirection: row }]}>
        <View style={styles.searchIcon}><Ionicons name="search" size={20} color={palette.ink} /></View>
        <Text maxFontSizeMultiplier={1.35} numberOfLines={1} style={[styles.searchText, { textAlign: rtl ? 'right' : 'left' }]}>{c.whereTo}</Text>
      </Press>
      <Press accessibilityLabel={c.later} onPress={() => book({ service: 'parcel', when: 'later' })} style={[styles.now, { flexDirection: row }]}>
        <Ionicons name="calendar-outline" size={15} color={palette.ink} />
        <Text maxFontSizeMultiplier={1.35} style={styles.nowText}>{c.later}</Text>
      </Press>
    </View>

    <VerifyEmailNudge />

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
    {!data && <Loading failed={!!error} onRetry={reload} />}

    {active.length > 0 && <>
      <Section title={c.activeOrder} />
      {active.map((order, i) => <OrderRow key={order.id} order={order} index={i} />)}
    </>}

    {recent.length > 0 && <>
      <Section title={c.recent} action={c.seeAll} onAction={() => router.navigate('/orders')} />
      <ListGroup>
        {recent.map(o => <Press key={o.id} accessibilityLabel={`${c.request} ${city(o.pickupCity)[language]} ${city(o.dropoffCity)[language]}`}
          onPress={() => book({ service: o.service, from: o.pickupCity, to: o.dropoffCity, again: String(o.id) })} style={[styles.recent, { flexDirection: row }]}>
          <View style={styles.clock}><Ionicons name="time-outline" size={17} color={palette.secondary} /></View>
          <View style={{ flex: 1 }}>
            <Txt variant="title" numberOfLines={2}>{city(o.pickupCity)[language]} {rtl ? '←' : '→'} {city(o.dropoffCity)[language]}</Txt>
            <Txt variant="caption" numberOfLines={2}>{`${c[o.service]}, ${o.pickupNote}`}</Txt>
          </View>
          <Ionicons name="refresh" size={17} color={palette.olive} />
        </Press>)}
      </ListGroup>
    </>}

    {/* One card left (Plus members): full width, not a half-empty rail. */}
    {me?.plan ? <Promo tone="clay" icon="shield-checkmark-outline" title={c.promoSafe} body={c.promoSafeBody} onPress={() => router.push({ pathname: '/help', params: { topic: 'code' } })} wide />
      : <>
        <Rail gap={10} style={{ marginHorizontal: -16, marginTop: 10 }} contentStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}>
          <Promo tone="clay" icon="shield-checkmark-outline" title={c.promoSafe} body={c.promoSafeBody} onPress={() => router.push({ pathname: '/help', params: { topic: 'code' } })} />
          <Promo tone="olive" icon="sparkles-outline" title={c.plusTitle}
            body={fill(c.plusPitch, { pct: Math.round((me?.settings.plusDiscount ?? defaultSettings.plusDiscount) * 100), price: me?.settings.plusPrice ?? defaultSettings.plusPrice })} onPress={() => router.navigate('/account')} />
        </Rail>
      </>}
  </Screen>;
}

function Promo({ tone, icon, title, body, onPress, wide }: { tone: 'forest' | 'clay' | 'olive'; icon: IconName; title: string; body: string; onPress: () => void; wide?: boolean }) {
  const t = { forest: [palette.forest, palette.lime, 'rgba(255,255,255,0.78)'], clay: [palette.clayPale, palette.clayInk, palette.ink], olive: [palette.olivePale, palette.olive, palette.ink] }[tone];
  return <Press accessibilityLabel={`${title}. ${body}`} onPress={onPress} style={[styles.promo, wide && styles.wide, { backgroundColor: t[0] }]}>
    <Ionicons name={icon} size={20} color={t[1]} />
    <Txt variant="title" numberOfLines={2} style={{ color: tone === 'forest' ? palette.lime : palette.ink, marginTop: 8 }}>{title}</Txt>
    <Txt variant="caption" style={{ color: t[2], opacity: tone === 'forest' ? 1 : 0.8 }}>{body}</Txt>
  </Press>;
}

const styles = StyleSheet.create({
  // minHeight, not height: the flexed label inside a ScrollView stretched this row to the viewport
  // on the A53 until a scroll (reproduced 29 Oct 2026). The flex now sits on the pressable container;
  // minHeight still lets a large font scale grow the row instead of clipping it.
  search: { alignItems: 'center', gap: 4, minHeight: 56, borderRadius: 26, backgroundColor: palette.muted, paddingHorizontal: 6, paddingVertical: 6, marginBottom: 14 },
  searchMain: { flex: 1, alignItems: 'center', gap: 4, minHeight: 44 },
  searchIcon: { width: 38, alignItems: 'center' },
  searchText: { flex: 1, fontSize: 17, lineHeight: 25, fontWeight: '800', color: palette.ink },
  now: { alignItems: 'center', gap: 5, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: palette.card },
  nowText: { fontSize: 13, lineHeight: 19, fontWeight: '700', color: palette.ink },
  tile: { flex: 1, alignItems: 'center', gap: 8, borderRadius: 16, backgroundColor: palette.card, paddingVertical: 12, paddingHorizontal: 6 },
  recent: { alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 14, paddingVertical: 8 },
  clock: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.muted, alignItems: 'center', justifyContent: 'center' },
  promo: { width: 224, borderRadius: 16, padding: 14, minHeight: 118 },
  wide: { width: 'auto', minHeight: 0, marginTop: 20 },
});
