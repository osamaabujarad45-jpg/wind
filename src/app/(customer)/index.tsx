// Personal home keeps the current trip and the next booking over the map.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useApi } from '../../api';
import { pickupErrorKey } from '../../customer-location';
import { MapSheet, SIDE_SHEET, useSideSheet } from '../../map-sheet';
import { activeStatuses, city, currentRank, isolate, isOpen, type Order, type Places, type Point, type Service } from '../../model';
import { openProfiles, ProfileDot, profilesLabel, useProfileUpdates } from '../../profile-switch';
import { bookingService, lastShopAddress, personalServices, rememberHomeDestination, type PersonalService } from '../../personal-services';
import { pickupLocation, rememberedHere, rememberHere } from '../../pickup-location';
import { SceneMap } from '../../scene-map';
import { OrderRow, VerifyEmailNudge } from '../../parts';
import { useSession } from '../../session';
import { storage } from '../../storage';
import { wrapAbove } from '../../text-scale';
import { Choices, ErrorText, fill, IconButton, iconSize, ListGroup, Loading, Logo, Press, Row, Section, Txt, useCopy } from '../../ui';
import { themedStyles, useTheme } from '../../theme-context';

const CHOICE_KEY = 'wind.homeService';
const urgency = (order: Order) => order.shop?.state === 'awaiting_approval' ? 3 : currentRank(order);
const book = (service: Service, place?: { saved: string } | { again: string; keep: 'dropoff' }) =>
  router.push({ pathname: '/book', params: { service, pick: 'to', ...place } });

export default function Home() {
  const { palette, shadow } = useTheme();
  const styles = useStyles();
  const { me } = useSession();
  const { c, row, rtl, language } = useCopy();
  const { height, fontScale } = useWindowDimensions();
  const { data, error, reload } = useApi<Order[]>('/orders', 10_000);
  const orders = data ?? [];
  const active = orders.filter(isOpen).sort((a, b) => urgency(b) - urgency(a));
  const primary = active.find(o => o.service === 'ride' && activeStatuses.includes(o.status)) ?? active[0];
  const otherActive = active.filter(o => o !== primary);
  const first = me?.user.name.split(' ')[0] ?? '';
  const greet = new Date().getHours() < 12 ? c.goodMorning : c.goodEvening;
  const updates = useProfileUpdates();

  const enabled = me?.capabilities?.enabledServices ?? ['parcel'];
  const lines = personalServices.filter(line => bookingService(line, enabled));
  const label = { ride: c.personalRide, send: c.personalSend, shop: c.personalShop };
  const [remembered, setRemembered] = useState<PersonalService>();
  useEffect(() => {
    let mounted = true;
    void storage.exclusive(() => storage.get(CHOICE_KEY), CHOICE_KEY).then(value => {
      const restored = personalServices.find(line => line === value);
      if (mounted) setRemembered(current => current ?? restored);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);
  function select(line: PersonalService) {
    setRemembered(line);
    void storage.exclusive(() => storage.set(CHOICE_KEY, line), CHOICE_KEY).catch(() => undefined);
  }
  const choice = remembered && lines.includes(remembered) ? remembered : lines[0];
  const service = choice ? bookingService(choice, enabled) : undefined;
  const { data: places, reload: reloadPlaces } = useApi<Places>(service === 'shop' ? '/me/places?shopDelivery=1' : service ? '/me/places' : null);
  const shopAddress = choice === 'shop' ? places?.shopDelivery === undefined ? lastShopAddress(orders) : places.shopDelivery : null;
  const destination = choice === 'ride' ? c.whereTo : choice === 'send' ? c.personalSendWhere
    : shopAddress ? fill(c.personalShopWhere, { address: isolate(shopAddress.note) }) : c.personalShopNoAddress;

  // Keep landmark and pin together. Recent destinations reuse an order ID rather than putting the address in the URL.
  const saved = places?.saved ?? [];
  const seen = new Set(saved.map(place => JSON.stringify([place.city, place.note])));
  const quickPlaces = [
    ...saved.map(place => ({
      key: `saved:${place.id}`, note: place.note, city: place.city, point: place.point ?? null, title: c[`place_${place.label}`],
      icon: place.label === 'home' ? 'home-outline' as const : place.label === 'work' ? 'briefcase-outline' as const : 'bookmark-outline' as const,
      params: { saved: String(place.id) },
    })),
    ...orders.flatMap(order => {
      if (isOpen(order) || order.status === 'cancelled' || !order.dropoffNote) return [];
      const key = JSON.stringify([order.dropoffCity, order.dropoffNote]);
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ key: `${order.id}:dropoff`, note: order.dropoffNote, city: order.dropoffCity, point: order.dropoffPoint ?? null,
        title: order.dropoffNote, icon: 'time-outline' as const, params: { again: String(order.id), keep: 'dropoff' as const } }];
    }).slice(0, 3),
  ];
  const peekPlaces = fontScale > wrapAbove || height < 680 ? 0 : 2;
  const renderPlaces = (start: number, end?: number) => {
    const visible = quickPlaces.slice(start, end);
    if (!visible.length || !service || service === 'shop') return null;
    return <ListGroup>{visible.map(place => <Press key={place.key}
      accessibilityLabel={`${place.title}, ${place.note}, ${city(place.city)[language]}`}
      onPress={() => {
        if (me) rememberHomeDestination(me.user.id, place.key, { city: place.city, note: place.note, point: place.point });
        book(service, place.params);
      }} style={[styles.place, { flexDirection: row }]}>
      <Ionicons name={place.icon} size={iconSize.md} color={palette.olive} />
      <View style={{ flex: 1 }}>
        <Txt variant="label" numberOfLines={2}>{place.title}</Txt>
        {place.title !== place.note && <Txt variant="caption" numberOfLines={2}>{place.note}</Txt>}
      </View>
      <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={iconSize.sm} color={palette.secondary} />
    </Press>)}</ListGroup>;
  };

  const [here, setHere] = useState<(Point & { accuracy?: number | null }) | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState('');
  const [open, setOpen] = useState(false);
  const [peek, setPeek] = useState(0);
  const [topBar, setTopBar] = useState(0);
  const side = useSideSheet();
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const lastCity = orders[0]?.pickupCity;
  const camera = here ? { latitude: here.latitude, longitude: here.longitude } : lastCity ? { latitude: city(lastCity).latitude, longitude: city(lastCity).longitude } : { latitude: 31.95, longitude: 35.05 };
  const nearbyAt = here && enabled.includes('ride') && focused ? `${here.latitude.toFixed(3)},${here.longitude.toFixed(3)}` : null;
  const nearby = useApi<{ cars: Point[]; count: number; nearestKm: number | null }>(nearbyAt ? `/drivers/nearby?service=ride&near=${nearbyAt}` : null, 15_000);
  const cars = nearbyAt ? nearby.data?.cars ?? null : null;
  const nearbyLabel = cars?.length ? fill(c.nearbyCars, { n: cars.length, km: nearby.data?.nearestKm ?? '' }) : c.nearbyNone;
  async function locate() {
    setLocating(true); setLocationNote('');
    try {
      const fix = await pickupLocation(new AbortController().signal);
      setHere({ ...fix.point, accuracy: fix.accuracy }); void rememberHere(fix.point);
    } catch (e) { setLocationNote(c[pickupErrorKey(e)]); } finally { setLocating(false); }
  }
  // Only the customer's own tap on Locate may raise the system prompt.
  useEffect(() => {
    const request = new AbortController();
    void rememberedHere().then(known => { if (known && !request.signal.aborted) setHere(current => current ?? { latitude: known.latitude, longitude: known.longitude }); });
    pickupLocation(request.signal, false).then(fix => {
      if (!request.signal.aborted) { setHere({ ...fix.point, accuracy: fix.accuracy }); void rememberHere(fix.point); }
    }).catch(() => undefined);
    return () => request.abort();
  }, []);

  const primaryInSheet = height < 540;
  const primaryCard = primary && <OrderRow order={primary} compact={fontScale > wrapAbove} />;
  const moreLabel = fill(c.personalMoreActive, { n: otherActive.length });
  const entry = choice && service ? <>
    <Choices tabs label={c.personalServices} items={lines.map(key => ({ key, label: label[key] }))} value={choice} onChange={select} />
    <Press accessibilityLabel={destination} onPress={() => {
      if (service !== 'shop') return book(service);
      if (!shopAddress || !me) return router.push('/shop');
      rememberHomeDestination(me.user.id, `shop:${shopAddress.id}`, shopAddress);
      router.push({ pathname: '/shop', params: { destinationOrder: String(shopAddress.id) } });
    }}
      style={[styles.search, { flexDirection: row }]}>
      <Ionicons name="search" size={20} color={palette.ink} />
      <Txt variant="title" style={{ flex: 1 }}>{destination}</Txt>
    </Press>
  </> : <Txt variant="label">{c.serviceUnavailable}</Txt>;
  return <View style={{ flex: 1, backgroundColor: palette.paper }}>
    {focused && <SceneMap fill mode="browse" center={camera} zoom={here ? 15 : lastCity ? 12 : 8.6} user={here} cars={cars} insets={{ top: topBar, bottom: peek, ...(side && (rtl ? { left: SIDE_SHEET } : { right: SIDE_SHEET })) }}
      label={cars ? `${c.home}. ${nearbyLabel}` : c.home} />}
    <SafeAreaView edges={['top']} pointerEvents="box-none" style={[styles.top, side && (rtl ? { left: SIDE_SHEET, right: 0 } : { right: SIDE_SHEET })]} onLayout={e => setTopBar(Math.ceil(e.nativeEvent.layout.height))}>
      <View style={[styles.topRow, { flexDirection: row }]} pointerEvents="box-none">
        {/* with account profiles the identity chip is the switcher's shortcut (FLOWS §2.2) */}
        {me?.accountProfile ? <Press accessibilityLabel={`${first}. ${profilesLabel(c, updates)}`} onPress={openProfiles}
          style={[styles.hello, shadow, { flexDirection: row }]}>
          <View><Logo size={30} decorative />{updates > 0 && <ProfileDot />}</View>
          <View style={{ flexShrink: 1 }}>
            <Txt variant="micro">{greet}</Txt>
            <Txt variant="title">{first}</Txt>
          </View>
          <Ionicons name="chevron-down" size={14} color={palette.secondary} />
        </Press> : <View style={[styles.hello, shadow, { flexDirection: row }]}>
          <Logo size={30} decorative />
          <View style={{ flexShrink: 1 }}>
            <Txt variant="micro">{greet}</Txt>
            <Txt variant="title">{first}</Txt>
          </View>
        </View>}
        <Press accessibilityLabel={c.personalRoads} onPress={() => router.push('/roads')}
          style={[styles.roads, shadow, { flexDirection: row }]}>
          <Ionicons name="trail-sign-outline" size={iconSize.md} color={palette.olive} />
          <Txt variant="label">{c.personalRoads}</Txt>
        </Press>
        <IconButton icon="help-circle-outline" label={c.help} onPress={() => router.push('/help')} />
      </View>
    </SafeAreaView>
    {here ? <View style={[styles.locate, rtl ? { left: 12 + (side ? SIDE_SHEET : 0) } : { right: 12 + (side ? SIDE_SHEET : 0) }, { bottom: peek + 12 }]}>
      <IconButton icon={locating ? 'hourglass-outline' : 'locate'} label={c.useLocation} disabled={locating} onPress={() => { void locate(); }} />
    </View> : <Press accessibilityLabel={c.useLocation} disabled={locating} onPress={() => { void locate(); }}
      containerStyle={[styles.locate, { alignSelf: 'center', bottom: peek + 12 }, side && { transform: [{ translateX: (rtl ? 1 : -1) * SIDE_SHEET / 2 }] }]} style={[styles.askLocation, shadow, { flexDirection: row }]}>
      <Ionicons name="navigate" size={16} color={palette.lime} />
      <Txt variant="label" style={{ color: palette.onFill, flexShrink: 1 }}>{locating ? c.locating : c.useLocation}</Txt>
    </Press>}
    {!!locationNote && <View style={[styles.note, shadow, { bottom: peek + 66 }, side && (rtl ? { left: SIDE_SHEET + 12 } : { right: SIDE_SHEET + 12 })]} accessibilityLiveRegion="polite">
      <Txt variant="caption">{locationNote}</Txt>
    </View>}
    <MapSheet open={open} onOpenChange={setOpen} onPeek={setPeek} scrollHeader safeBottom={false} onRefresh={() => Promise.all([reload(), reloadPlaces()])}
      header={<View style={{ paddingBottom: 8 }}>
        {!primaryInSheet && primaryCard}
        {!open && <>
          {primaryInSheet && primary && <Press accessibilityLabel={c.activeOrder} onPress={() => router.push(`/order/${primary.id}`)} style={styles.more}>
            <Txt variant="label" style={{ color: palette.olive }}>{c.activeOrder}</Txt>
          </Press>}
          {entry}
          {otherActive.length > 0 && <Press accessibilityLabel={moreLabel} onPress={() => setOpen(true)} style={styles.more}>
            <Txt variant="label" style={{ color: palette.olive }}>{moreLabel}</Txt>
          </Press>}
          {renderPlaces(0, peekPlaces)}
        </>}
      </View>}>
      {primaryInSheet && primaryCard}
      {otherActive.length > 0 && <>
        <Section title={moreLabel} />
        {otherActive.map(order => <OrderRow key={order.id} order={order} compact />)}
      </>}
      {open && entry}
      <VerifyEmailNudge />
      <ErrorText>{error && c.updatesPaused}</ErrorText>
      {!data && <Loading failed={!!error} onRetry={reload} />}
      {cars && <Row gap={6} style={{ marginBottom: 8 }}>
        <Ionicons name="car-outline" size={iconSize.sm} color={palette.olive} />
        <Txt variant="caption" style={{ flex: 1 }}>{nearbyLabel}</Txt>
      </Row>}
      {open && service && service !== 'shop' && quickPlaces.length > 0 && <>
        <Section title={c.personalSavedAndRecent} />
        {renderPlaces(0)}
      </>}
    </MapSheet>
  </View>;
}

const useStyles = themedStyles(palette => StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, paddingTop: 8 },
  topRow: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  hello: { alignItems: 'center', gap: 8, flexShrink: 1, backgroundColor: palette.card, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  roads: { minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 22, backgroundColor: palette.card },
  locate: { position: 'absolute', maxWidth: '85%' },
  askLocation: { alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, paddingVertical: 4, borderRadius: 22, backgroundColor: palette.forest },
  note: { position: 'absolute', left: 12, right: 12, backgroundColor: palette.card, borderRadius: 12, padding: 10 },
  search: { alignItems: 'center', gap: 12, minHeight: 52, borderRadius: 20, backgroundColor: palette.muted, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 6 },
  more: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  place: { minHeight: 44, alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 6 },
}));
