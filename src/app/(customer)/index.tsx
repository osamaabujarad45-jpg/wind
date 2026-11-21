// Home, Uber/Careem pattern: one "Where to?" entry, the three services as small tiles, the live order,
// recent routes to book again, and short cards that explain saving and safety.
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { wrapAbove } from '../../text-scale';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useApi } from '../../api';
import { pickupErrorKey } from '../../customer-location';
import { MapSheet, SIDE_SHEET, useSideSheet } from '../../map-sheet';
import { activeStatuses, city, currentRank, defaultSettings, services, type Order, type Point, type Service } from '../../model';
import { pickupLocation, rememberedHere, rememberHere } from '../../pickup-location';
import { SceneMap } from '../../scene-map';
import { OrderRow, ServiceIcon, tripTitle, VerifyEmailNudge } from '../../parts';
import { useSession } from '../../session';
import { storage } from '../../storage';
import { Appear, ErrorText, fill, IconButton, iconSize, ListGroup, Loading, Logo, maxScale, palette, Press, Rail, Row, Section, shadow, Txt, useCopy, useLines, type IconName } from '../../ui';

const book = (params: { service: Service; from?: string; to?: string; pick?: 'to'; when?: 'later'; again?: string }) => router.push({ pathname: '/book', params });

export default function Home() {
  const { me } = useSession();
  const { c, row, rtl, language } = useCopy();
  // Past the wrap threshold a tile stacks its icon over the label: beside it, a third of the width cut أغراض mid-word (A53, 200%).
  // Four services stack too: a quarter of the row left "Items & …" cut at normal text size (screens, 21 Nov).
  const fontScale = useWindowDimensions().fontScale;
  const { data, error, reload } = useApi<Order[]>('/orders', 10_000);
  const orders = data ?? [];
  // A newer booked-ahead order hid a live trip or a search running now behind "See all". Stable sort keeps newest first per rank.
  const active = orders.filter(o => o.status === 'requested' || o.status === 'searching' || activeStatuses.includes(o.status)).sort((a, b) => currentRank(b) - currentRank(a));
  // Latest distinct routes, newest first: the "book again" list. Only finished trips, as Amazon's "Buy it again"
  // skips what is still on its way; an in-flight route already shows above it.
  const done = orders.filter(o => !active.includes(o));
  const recent = done.filter((o, i) => done.findIndex(x => x.service === o.service && x.pickupCity === o.pickupCity && x.dropoffCity === o.dropoffCity) === i).slice(0, 3);
  const first = me?.user.name.split(' ')[0] ?? '';
  const greet = new Date().getHours() < 12 ? c.goodMorning : c.goodEvening;
  const enabledServices = me?.capabilities?.enabledServices ?? ['parcel'];
  const stacked = fontScale > wrapAbove || services.filter(service => enabledServices.includes(service)).length > 3; // the tiles drawn
  const firstService: Service = enabledServices.includes('ride') ? 'ride' : 'parcel'; // "where to" books a trip; shop delivery has its own tile
  const [here, setHere] = useState<(Point & { accuracy?: number | null }) | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState('');
  const [open, setOpen] = useState(false);
  // The first-order guide lives on the sheet, which starts closed: with no orders and the guide not hidden, the sheet opens once
  // so a new customer sees it (Haiku polish H2).
  const [guideHidden, setGuideHidden] = useState<boolean | null>(null);
  const guideKey = `${GUIDE_KEY}.${me?.user.id ?? 0}`; // per account: another account on this phone still sees it
  useEffect(() => { storage.get(guideKey).then(value => setGuideHidden(value === '1'), () => setGuideHidden(false)); }, [guideKey]);
  const guideShown = data?.length === 0 && guideHidden === false;
  const guideOpened = useRef(false);
  useEffect(() => { if (guideShown && !guideOpened.current) { guideOpened.current = true; setOpen(true); } }, [guideShown]);
  const [peek, setPeek] = useState(0);
  const [topBar, setTopBar] = useState(0); // the greeting row's measured height: the camera keeps clear of it at any text size
  const side = useSideSheet();
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
    {guideShown && <FirstOrderGuide onStart={() => book({ service: firstService })} onHide={() => { setGuideHidden(true); void storage.set(guideKey, '1').catch(() => undefined); }} />}
    <ErrorText>{error && c.updatesPaused}</ErrorText>
    {!data && <Loading failed={!!error} onRetry={reload} />}

    {recent.length > 0 && <>
      <Section title={c.recent} action={c.seeAll} onAction={() => router.navigate('/orders')} />
      <ListGroup>
        {recent.map(o => <Press key={o.id} accessibilityLabel={o.service === 'shop' ? `${tripTitle(o, language, rtl)}, ${c[o.service]}` // a shop row opens the order, it does not book again
          : `${c.request} ${city(o.pickupCity)[language]} ${city(o.dropoffCity)[language]}`}
          onPress={() => o.service === 'shop' ? router.push(`/order/${o.id}`) : book({ service: o.service, from: o.pickupCity, to: o.dropoffCity, again: String(o.id) })} style={[styles.recent, { flexDirection: row }]}>
          <View style={styles.clock}><Ionicons name="time-outline" size={iconSize.md} color={palette.secondary} /></View>
          <View style={{ flex: 1 }}>
            <Txt variant="title" numberOfLines={1}>{tripTitle(o, language, rtl)}</Txt>
            <Txt variant="caption">{c[o.service]} · {o.pickupNote}</Txt>
          </View>
          <Ionicons name="refresh" size={iconSize.md} color={palette.olive} />
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
    {focused && <SceneMap fill mode="browse" center={camera} zoom={here ? 15 : lastCity ? 12 : 8.6} user={here} insets={{ top: topBar, bottom: peek, ...(side && (rtl ? { left: SIDE_SHEET } : { right: SIDE_SHEET })) }} label={c.home} />}
    <SafeAreaView edges={['top']} pointerEvents="box-none" style={[styles.top, side && (rtl ? { left: SIDE_SHEET, right: 0 } : { right: SIDE_SHEET })]} onLayout={e => setTopBar(Math.ceil(e.nativeEvent.layout.height))}>
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
    {here ? <View style={[styles.locate, rtl ? { left: 12 + (side ? SIDE_SHEET : 0) } : { right: 12 + (side ? SIDE_SHEET : 0) }, { bottom: peek + 12 }]}>
      <IconButton icon={locating ? 'hourglass-outline' : 'locate'} label={c.useLocation} disabled={locating} onPress={() => { void locate(); }} />
    </View> : <Press accessibilityLabel={c.useLocation} disabled={locating} onPress={() => { void locate(); }}
      containerStyle={[styles.locate, { alignSelf: 'center', bottom: peek + 12 }, side && { transform: [{ translateX: (rtl ? 1 : -1) * SIDE_SHEET / 2 }] }]} style={[styles.askLocation, shadow, { flexDirection: row }]}>
      <Ionicons name="navigate" size={16} color={palette.lime} />
      <Txt variant="label" style={{ color: palette.onFill }}>{locating ? c.locating : c.useLocation}</Txt>
    </Press>}
    {!!locationNote && <View style={[styles.note, shadow, { bottom: peek + 66 }, side && (rtl ? { left: SIDE_SHEET + 12 } : { right: SIDE_SHEET + 12 })]} accessibilityLiveRegion="polite">
      <Txt variant="caption">{locationNote}</Txt>
    </View>}
    <MapSheet open={open} onOpenChange={setOpen} onPeek={setPeek} safeBottom={false} onRefresh={reload}
      header={<View style={{ paddingBottom: 12 }}>
        {/* The one entry point: destination first, with "Later" a real control rather than a label drawn like a button. */}
        <View style={[styles.search, { flexDirection: row }]}>
          <Press accessibilityLabel={c.whereTo} containerStyle={{ flex: 1 }} onPress={() => book({ service: firstService, pick: 'to' })} style={[styles.searchMain, { flexDirection: row }]}>
            <View style={styles.searchIcon}><Ionicons name="search" size={20} color={palette.ink} /></View>
            <Text key={language} maxFontSizeMultiplier={maxScale} numberOfLines={useLines(1)} style={[styles.searchText, { textAlign: rtl ? 'right' : 'left' }]}>{c.whereTo}</Text>
          </Press>
          <Press accessibilityLabel={c.later} onPress={() => book({ service: firstService, when: 'later' })} style={[styles.now, { flexDirection: row }]}>
            <Ionicons name="calendar-outline" size={iconSize.sm} color={palette.ink} />
            <Text key={language} maxFontSizeMultiplier={maxScale} style={styles.nowText}>{c.later}</Text>
          </Press>
        </View>
        <Row gap={8} style={{ alignItems: 'stretch' }}>
          {services.filter(service => enabledServices.includes(service)).map((service, i) => <Appear key={service} index={i} style={{ flex: 1 }}>
            <Press accessibilityLabel={c[service]} containerStyle={{ flexGrow: 1 }} onPress={() => service === 'shop' ? router.push('/shop') : book({ service })} style={[styles.tile, shadow, stacked ? styles.tileStacked : { flexDirection: row }]}>
              <ServiceIcon service={service} size={28} />
              {/* flex, not flexShrink: Android measured مشوار narrower than it draws and cut its last letter (A53) */}
              <Txt variant="label" numberOfLines={2} center={stacked} style={stacked ? { alignSelf: 'stretch', fontSize: 12 } : { flex: 1, fontSize: 12 }}>{c[service]}</Txt>
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
  // flexGrow, not flex: 1. Inside the Pressable's column, flex: 1 set a zero height basis and held the tile at minHeight, so large text spilled out.
  guide: { backgroundColor: palette.card, borderRadius: 16, padding: 14, marginBottom: 12 },
  guideStep: { minWidth: 24, minHeight: 24, paddingHorizontal: 6, borderRadius: 12, backgroundColor: palette.forest, alignItems: 'center', justifyContent: 'center' },
  guideCta: { marginTop: 12, minHeight: 48, borderRadius: 24, backgroundColor: palette.forest, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  tile: { flexGrow: 1, alignItems: 'center', gap: 6, borderRadius: 14, backgroundColor: palette.card, minHeight: 48, paddingHorizontal: 8 },
  tileStacked: { flexDirection: 'column', justifyContent: 'center', paddingVertical: 8 },
  recent: { alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 14, paddingVertical: 8 },
  clock: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.muted, alignItems: 'center', justifyContent: 'center' },
  promo: { width: 224, borderRadius: 16, padding: 14, minHeight: 118 },
  wide: { width: 'auto', minHeight: 0, marginTop: 20 },
});

// First order: how Wind works in three facts (price first, cash to the driver, the handover code), and one button that
// starts it. Shown until the first order exists or the customer hides it (product audit 21 Nov; Careem/Talabat pattern).
const GUIDE_KEY = 'wind.firstOrderGuide.hidden';
function FirstOrderGuide({ onStart, onHide }: { onStart: () => void; onHide: () => void }) {
  const { c, row } = useCopy();
  const steps: [IconName, string][] = [['location-outline', c.guideStepPlace], ['pricetag-outline', c.guideStepPrice], ['cash-outline', c.guideStepCash]];
  return <Appear index={0}>
    <View style={[styles.guide, shadow]}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt variant="title" header style={{ flex: 1 }}>{c.guideTitle}</Txt>
        <IconButton icon="close" label={c.guideHide} tone="muted" onPress={onHide} />
      </Row>
      {steps.map(([icon, text], i) => <View key={icon} accessible accessibilityLabel={`. ${text}`} style={{ flexDirection: row, gap: 10, alignItems: 'center', marginTop: 8 }}>
        <View style={styles.guideStep}><Txt variant="label" style={{ color: palette.lime }}>{String(i + 1)}</Txt></View>
        <Ionicons name={icon} size={iconSize.md} color={palette.olive} />
        <Txt variant="caption" style={{ flex: 1, color: palette.ink }}>{text}</Txt>
      </View>)}
      <Press accessibilityLabel={c.guideStart} onPress={onStart} style={[styles.guideCta, { flexDirection: row }]}>
        <Txt variant="label" style={{ color: palette.onFill }}>{c.guideStart}</Txt>
      </Press>
    </View>
  </Appear>;
}
