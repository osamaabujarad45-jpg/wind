// Home, Uber/Careem pattern: one "Where to?" entry, the three services as small tiles, the live order,
// recent routes to book again, and short cards that explain saving and safety.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useApi } from '../../api';
import { pickupErrorKey } from '../../customer-location';
import { MapSheet } from '../../map-sheet';
import { activeStatuses, city, defaultSettings, services, type Order, type Point, type Service } from '../../model';
import { pickupLocation, rememberedHere, rememberHere } from '../../pickup-location';
import { SceneMap } from '../../scene-map';
import { OrderRow, ServiceIcon, VerifyEmailNudge } from '../../parts';
import { useSession } from '../../session';
import { Appear, ErrorText, fill, IconButton, ListGroup, Loading, Logo, palette, Press, Rail, Row, Section, shadow, Txt, useCopy, type IconName } from '../../ui';

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
  const firstService: Service = enabledServices.includes('ride') ? 'ride' : 'parcel';
  const [here, setHere] = useState<(Point & { accuracy?: number | null }) | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState('');
  const [open, setOpen] = useState(false);
  const [peek, setPeek] = useState(0);
  // A map behind another screen holds a GPU context and its tiles for nothing: a low-end phone needs that memory.
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  // Before any fix: the last place this customer booked from, else the middle of the West Bank.
  const lastCity = orders[0]?.pickupCity;
  const camera = here ? { latitude: here.latitude, longitude: here.longitude } : lastCity ? { latitude: city(lastCity).latitude, longitude: city(lastCity).longitude } : { latitude: 31.95, longitude: 35.05 };
  async function locate() {
    setLocating(true); setLocationNote('');
    try {
      const fix = await pickupLocation(new AbortController().signal);
      setHere({ ...fix.point, accuracy: fix.accuracy }); void rememberHere(fix.point);
    } catch (e) { setLocationNote(c[pickupErrorKey(e)]); } finally { setLocating(false); }
  }
  // Opening the map reuses consent already given; only the customer's own tap on Locate may raise the system prompt.
  useEffect(() => {
    const request = new AbortController();
    void rememberedHere().then(known => { if (known && !request.signal.aborted) setHere(current => current ?? { latitude: known.latitude, longitude: known.longitude }); });
    pickupLocation(request.signal, false).then(fix => {
      if (!request.signal.aborted) { setHere({ ...fix.point, accuracy: fix.accuracy }); void rememberHere(fix.point); }
    }).catch(() => undefined);
    return () => request.abort();
  }, []);

  const sheet = <>
    <VerifyEmailNudge />
    <ErrorText>{error && c.updatesPaused}</ErrorText>
    {!data && <Loading failed={!!error} onRetry={reload} />}

    {recent.length > 0 && <>
      <Section title={c.recent} action={c.seeAll} onAction={() => router.navigate('/orders')} />
      <ListGroup>
        {recent.map(o => <Press key={o.id} accessibilityLabel={`${c.request} ${city(o.pickupCity)[language]} ${city(o.dropoffCity)[language]}`}
          onPress={() => book({ service: o.service, from: o.pickupCity, to: o.dropoffCity, again: String(o.id) })} style={[styles.recent, { flexDirection: row }]}>
          <View style={styles.clock}><Ionicons name="time-outline" size={17} color={palette.secondary} /></View>
          <View style={{ flex: 1 }}>
            <Txt variant="title" numberOfLines={1}>{city(o.pickupCity)[language]} {rtl ? '←' : '→'} {city(o.dropoffCity)[language]}</Txt>
            <Txt variant="caption" numberOfLines={1}>{c[o.service]} · {o.pickupNote}</Txt>
          </View>
          <Ionicons name="refresh" size={17} color={palette.olive} />
        </Press>)}
      </ListGroup>
    </>}

    {/* One card left (Plus members): full width, not a half-empty rail. */}
    {me?.plan ? <Promo tone="clay" icon="shield-checkmark-outline" title={c.promoSafe} body={c.promoSafeBody} onPress={() => router.push({ pathname: '/help', params: { topic: 'code' } })} wide />
      : <Rail gap={10} style={{ marginHorizontal: -16, marginTop: 10 }} contentStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}>
        <Promo tone="clay" icon="shield-checkmark-outline" title={c.promoSafe} body={c.promoSafeBody} onPress={() => router.push({ pathname: '/help', params: { topic: 'code' } })} />
        <Promo tone="olive" icon="sparkles-outline" title={c.plusTitle}
          body={fill(c.plusPitch, { pct: Math.round((me?.settings.plusDiscount ?? defaultSettings.plusDiscount) * 100), price: me?.settings.plusPrice ?? defaultSettings.plusPrice })} onPress={() => router.navigate('/account')} />
      </Rail>}
  </>;

  return <View style={{ flex: 1, backgroundColor: palette.paper }}>
    {/* The map is the screen, the way a ride app opens: you, where you are. Everything else sits on the sheet over it. */}
    {focused && <SceneMap fill mode="browse" center={camera} zoom={here ? 15 : lastCity ? 12 : 8.6} user={here} insets={{ top: 60, bottom: peek }} label={c.home} />}
    <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.top}>
      <View style={[styles.topRow, { flexDirection: row }]} pointerEvents="box-none">
        <View style={[styles.hello, shadow, { flexDirection: row }]}>
          <Logo size={30} />
          <View style={{ flexShrink: 1 }}>
            <Txt variant="micro" numberOfLines={1}>{greet}</Txt>
            <Txt variant="title" numberOfLines={1}>{first}</Txt>
          </View>
        </View>
        <IconButton icon="help-circle-outline" label={c.help} onPress={() => router.push('/help')} />
      </View>
    </SafeAreaView>
    {here ? <View style={[styles.locate, rtl ? { left: 12 } : { right: 12 }, { bottom: peek + 12 }]}>
      <IconButton icon={locating ? 'hourglass-outline' : 'locate'} label={c.useLocation} disabled={locating} onPress={() => { void locate(); }} />
    </View> : <Press accessibilityLabel={c.useLocation} disabled={locating} onPress={() => { void locate(); }}
      containerStyle={[styles.locate, { alignSelf: 'center', bottom: peek + 12 }]} style={[styles.askLocation, shadow, { flexDirection: row }]}>
      <Ionicons name="navigate" size={16} color={palette.lime} />
      <Txt variant="label" style={{ color: palette.onFill }}>{locating ? c.locating : c.useLocation}</Txt>
    </Press>}
    {!!locationNote && <View style={[styles.note, shadow, { bottom: peek + 66 }]} accessibilityLiveRegion="polite">
      <Txt variant="caption">{locationNote}</Txt>
    </View>}
    <MapSheet open={open} onOpenChange={setOpen} onPeek={setPeek} safeBottom={false}
      header={<View style={{ paddingBottom: 12 }}>
        {/* The one entry point: destination first, with "Later" a real control rather than a label drawn like a button. */}
        <View style={[styles.search, { flexDirection: row }]}>
          <Press accessibilityLabel={c.whereTo} containerStyle={{ flex: 1 }} onPress={() => book({ service: firstService, pick: 'to' })} style={[styles.searchMain, { flexDirection: row }]}>
            <View style={styles.searchIcon}><Ionicons name="search" size={20} color={palette.ink} /></View>
            <Text key={language} numberOfLines={1} style={[styles.searchText, { textAlign: rtl ? 'right' : 'left' }]}>{c.whereTo}</Text>
          </Press>
          <Press accessibilityLabel={c.later} onPress={() => book({ service: firstService, when: 'later' })} style={[styles.now, { flexDirection: row }]}>
            <Ionicons name="calendar-outline" size={15} color={palette.ink} />
            <Text key={language} style={styles.nowText}>{c.later}</Text>
          </Press>
        </View>
        <Row gap={8} style={{ alignItems: 'stretch' }}>
          {services.filter(service => enabledServices.includes(service)).map((service, i) => <Appear key={service} index={i} style={{ flex: 1 }}>
            <Press accessibilityLabel={c[service]} onPress={() => book({ service })} style={[styles.tile, shadow, { flexDirection: row }]}>
              <ServiceIcon service={service} size={28} />
              <Txt variant="label" numberOfLines={2} style={{ flexShrink: 1, fontSize: 12 }}>{c[service]}</Txt>
            </Press>
          </Appear>)}
        </Row>
        {active.length > 0 && <View style={{ marginTop: 10 }}>
          <Section title={c.activeOrder} />
          {active.slice(0, 1).map((order, i) => <OrderRow key={order.id} order={order} index={i} />)}
          {active.length > 1 && <Press accessibilityLabel={c.seeAll} onPress={() => router.navigate('/orders')}><Txt variant="label" center style={{ color: palette.olive, paddingVertical: 6 }}>{`${c.seeAll} (${active.length})`}</Txt></Press>}
        </View>}
      </View>}>
      {sheet}
    </MapSheet>
  </View>;
}

function Promo({ tone, icon, title, body, onPress, wide }: { tone: 'forest' | 'clay' | 'olive'; icon: IconName; title: string; body: string; onPress: () => void; wide?: boolean }) {
  const t = { forest: [palette.forest, palette.lime, 'rgba(255,255,255,0.78)'], clay: [palette.clayPale, palette.clayInk, palette.ink], olive: [palette.olivePale, palette.olive, palette.ink] }[tone];
  return <Press accessibilityLabel={`${title}. ${body}`} onPress={onPress} style={[styles.promo, wide && styles.wide, { backgroundColor: t[0] }]}>
    <Ionicons name={icon} size={20} color={t[1]} />
    <Txt variant="title" numberOfLines={2} style={{ color: tone === 'forest' ? palette.lime : palette.ink, marginTop: 8 }}>{title}</Txt>
    <Txt variant="caption" numberOfLines={2} style={{ color: t[2], opacity: tone === 'forest' ? 1 : 0.8 }}>{body}</Txt>
  </Press>;
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, paddingTop: 8 },
  topRow: { alignItems: 'center', justifyContent: 'space-between' },
  hello: { alignItems: 'center', gap: 8, flexShrink: 1, backgroundColor: palette.card, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  locate: { position: 'absolute' },
  askLocation: { alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: palette.forest },
  note: { position: 'absolute', left: 12, right: 12, backgroundColor: palette.card, borderRadius: 12, padding: 10 },
  // minHeight, not height: the flexed label inside a ScrollView stretched this row to the viewport
  // on the A53 until a scroll (reproduced 29 Oct 2026). The flex now sits on the pressable container;
  // minHeight still lets a large font scale grow the row instead of clipping it.
  search: { alignItems: 'center', gap: 4, minHeight: 56, borderRadius: 26, backgroundColor: palette.muted, paddingHorizontal: 6, paddingVertical: 6, marginBottom: 10 },
  searchMain: { flex: 1, alignItems: 'center', gap: 4, minHeight: 40 },
  searchIcon: { width: 38, alignItems: 'center' },
  searchText: { flex: 1, fontSize: 17, fontWeight: '800', color: palette.ink },
  now: { alignItems: 'center', gap: 5, minHeight: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: palette.card },
  nowText: { fontSize: 13, fontWeight: '700', color: palette.ink },
  tile: { flex: 1, alignItems: 'center', gap: 6, borderRadius: 14, backgroundColor: palette.card, minHeight: 48, paddingHorizontal: 8 },
  recent: { alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 14, paddingVertical: 8 },
  clock: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.muted, alignItems: 'center', justifyContent: 'center' },
  promo: { width: 224, borderRadius: 16, padding: 14, minHeight: 118 },
  wide: { width: 'auto', minHeight: 0, marginTop: 20 },
});
