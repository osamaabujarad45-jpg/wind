// Route, service details, payment and one confirm action; uncertain submissions keep their identity.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { api, ApiError, errorCode, storage, useApi } from '../api';
import { dayKey, HEBRON, newBooking, readBooking, scheduleSlots, type PendingBooking } from '../booking';
import { cities, city, distanceKm, isCity, isValidPhone, nearestCity, optionsFor, quote, roadAlerts, services, type CityId, type Order, type Places, type Point, type Referral, type Road, type SavedPlace, type Service } from '../model';
import { roadPath } from '../map-math';
import { RouteLine, serviceMeta, useFormat } from '../parts';
import RouteMap, { canPin, PinMap } from '../route-map';
import { useSession } from '../session';
import { Button, Card, Choices, confirm, ErrorText, FilterChips, fill, Field, haptic, Header, IconButton, palette, Press, Row, Screen, Stepper, Tip, Txt, useCopy } from '../ui';

export default function Book() {
  const params = useLocalSearchParams<{ service?: string; from?: string; to?: string; pick?: string }>();
  const { me, refresh } = useSession();
  const { c, language, money, err, row, rtl } = useCopy();
  const { time } = useFormat();
  const [service, setService] = useState<Service>(params.service === 'ride' || params.service === 'freight' ? params.service : 'parcel');
  const [pickupCity, setPickupCity] = useState<CityId>(isCity(params.from) ? params.from : 'ramallah');
  const [dropoffCity, setDropoffCity] = useState<CityId>(isCity(params.to) ? params.to : 'nablus');
  const [pickupPoint, setPickupPoint] = useState<Point | null>(null);
  const [gpsPoint, setGpsPoint] = useState<Point | null>(null); // the chip says "from your location" only while the GPS fix is the pickup
  const [dropoffPoint, setDropoffPoint] = useState<Point | null>(null);
  const [pinFor, setPinFor] = useState<'pickup' | 'dropoff' | null>(null);
  const [locating, setLocating] = useState(false);
  const [picker, setPicker] = useState<'pickup' | 'dropoff' | null>(params.pick === 'to' ? 'dropoff' : null);
  const [pickupNote, setPickupNote] = useState('');
  const [dropoffNote, setDropoffNote] = useState('');
  const [contact, setContact] = useState(me?.user.phone ?? '');
  const [detail, setDetail] = useState('');
  const [option, setOption] = useState(optionsFor(service)[0]);
  const [loadingHelp, setLoadingHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [pending, setPending] = useState<PendingBooking | null>(null);
  const [ready, setReady] = useState(false);
  // Now or a 30-minute slot in the next 7 days, at least an hour ahead (the server allows 30 minutes of slack).
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [slot, setSlot] = useState<number | null>(null);
  const slots = scheduleSlots();
  const days = [...new Set(slots.map(dayKey))];
  const chosen = slot !== null && slots.includes(slot) ? slot : slots[0] ?? null;
  const [day, setDay] = useState<string | null>(null);
  const shownDay = day && days.includes(day) ? day : chosen !== null ? dayKey(chosen) : days[0];
  const scheduledFor = when === 'later' ? chosen : null;
  const sending = useRef(false);
  const pendingKey = `booking.${me!.user.id}`;
  const enabledServices = me?.capabilities?.enabledServices ?? ['parcel'];
  const available = enabledServices.includes(service);
  const locked = busy || !!pending || !ready || locating || !available;
  // Per-field problems, shown under each field; cleared as soon as that field is edited.
  const [invalid, setInvalid] = useState<Partial<Record<'pickupNote' | 'dropoffNote' | 'detail' | 'contact', string>>>({});
  const scrollRef = useRef<ScrollView>(null);
  const [promo, setPromo] = useState<{ code: string; discount: number; price: number } | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState('');
  const [checking, setChecking] = useState(false);
  const [credits, setCredits] = useState<Referral['credits']>([]);
  const edit = (key: keyof typeof invalid, set: (v: string) => void) => (v: string) => { set(v); if (invalid[key]) setInvalid({ ...invalid, [key]: undefined }); };
  // Saved and recent places: landmarks are the address here, so reuse them instead of retyping.
  const isCustomer = me?.user.role === 'customer';
  const [places, setPlaces] = useState<Places>({ saved: [], recent: [] });
  useEffect(() => { if (isCustomer) api<Places>('/me/places').then(setPlaces).catch(() => undefined); }, [isCustomer]);
  useEffect(() => { if (isCustomer) api<Referral>('/me/referral').then(r => setCredits(r.credits)).catch(() => undefined); }, [isCustomer]);
  const [roads, setRoads] = useState<Road[]>([]);
  useEffect(() => { api<Road[]>('/roads').then(setRoads).catch(() => undefined); }, []);
  const alerts = roadAlerts(roads, pickupCity, dropoffCity);
  // Road line for the preview map (never a straight line); absent while loading or without routing.
  const preview = useApi<{ km: number; line: [number, number][] }>(roadPath(pickupPoint ?? city(pickupCity), dropoffPoint ?? city(dropoffCity), 5)).data;
  const savePlace = (label: SavedPlace['label'], placeCity: CityId, note: string) => api<Places>('/me/places', { label, city: placeCity, note: note.trim() })
    .then(next => { setPlaces(next); haptic.success(); AccessibilityInfo.announceForAccessibility(c.placeSaved); }).catch(e => setError(err(e)));

  async function locate() {
    setLocating(true);
    setLocationError('');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.granted) {
        const { coords } = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('location_timeout')), 10_000); }),
        ]);
        const point = { latitude: coords.latitude, longitude: coords.longitude };
        // GPS adds a pin to the chosen city; it does not silently turn an unsupported area into that city.
        // ponytail: 15km GPS sanity bound; approved service zones must own actual coverage checks.
        if (nearestCity(point) !== pickupCity || distanceKm(city(pickupCity), point) > 15) {
          setLocationError(c.locationMismatch);
          return;
        }
        setPickupPoint(point); setGpsPoint(point);
      } else setLocationError(c.locationManual);
    } catch {
      setLocationError(c.locationManual);
    } finally { if (timeout) clearTimeout(timeout); setLocating(false); }
  }

  useEffect(() => {
    let mounted = true;
    storage.get(pendingKey).then(saved => {
      const existing = readBooking(saved);
      if (!mounted) return;
      if (existing) {
        const p = existing.payload;
        setPending(existing); setService(p.service); setPickupCity(p.pickupCity); setDropoffCity(p.dropoffCity);
        setPickupPoint(p.pickupPoint); setDropoffPoint(p.dropoffPoint ?? null); setPickupNote(p.pickupNote); setDropoffNote(p.dropoffNote);
        setContact(p.contact); setDetail(p.detail); setOption(p.option); setLoadingHelp(p.loadingHelp);
        if (p.scheduledFor) { setWhen('later'); setSlot(p.scheduledFor); } // a retried booking keeps its time
      }
      setReady(true);
    }).catch(() => { if (mounted) setError(c.bookingStorageError); });
    return () => { mounted = false; };
  }, [pendingKey, c.bookingStorageError]);

  const settings = me!.settings;
  const plus = me?.plan === 'plus';
  const price = pending?.payload.quotedPrice ?? quote(settings, { service, pickupCity, dropoffCity, option, loadingHelp, shared: false, plus });
  const km = distanceKm(pickupPoint ?? city(pickupCity), dropoffPoint ?? city(dropoffCity));
  // A checked code holds for the fare it was checked against; the server re-checks it on booking.
  const applied = pending ? (pending.payload.promoCode ? { code: pending.payload.promoCode, discount: pending.payload.expectedDiscount ?? 0 } : null)
    : promo && promo.price === price ? promo : null;
  const pay = price - (applied?.discount ?? 0);
  async function applyPromo(code: string) {
    if (checking || !code.trim()) return;
    setChecking(true); setPromoError('');
    try {
      const r = await api<{ code: string; discount: number }>('/promos/check', { code, price });
      setPromo({ ...r, price }); setPromoInput(''); haptic.success();
      AccessibilityInfo.announceForAccessibility(fill(c.promoApplied, { code: r.code, d: money(r.discount) }));
    } catch (e) { haptic.error(); setPromo(null); setPromoError(err(e)); } finally { setChecking(false); }
  }

  function switchService(next: Service) {
    haptic.tap();
    setService(next);
    setOption(optionsFor(next)[0]);
    setLoadingHelp(false);
    setError('');
    setInvalid({});
  }

  async function submit() {
    if (!ready || sending.current || (!available && !pending)) return;
    if (!pending && scheduledFor !== null && scheduledFor < Date.now() + 60 * 60_000) { // the form sat open past the slot
      haptic.error(); setSlot(null); setError(c.err_invalid_schedule); return;
    }
    const problems = {
      pickupNote: pickupNote.trim() ? undefined : c.fieldRequired,
      dropoffNote: dropoffNote.trim() ? undefined : c.fieldRequired,
      detail: service === 'ride' || detail.trim() ? undefined : c.fieldRequired,
      contact: isValidPhone(contact) ? undefined : err('invalid_phone'),
    };
    if (Object.values(problems).some(Boolean)) {
      haptic.error();
      setInvalid(problems);
      setError(c.fixMarked);
      // The details sit near the top; the contact field is right above the button.
      if (problems.pickupNote || problems.dropoffNote || problems.detail) scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setInvalid({});
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const command = pending ?? newBooking({ service, pickupCity, dropoffCity, pickupPoint, ...(dropoffPoint && { dropoffPoint }), pickupNote, dropoffNote,
        contact, detail, option, loadingHelp, shared: false, quotedPrice: price, ...(scheduledFor !== null && { scheduledFor }),
        ...(applied && { promoCode: applied.code, expectedDiscount: applied.discount }) });
      await storage.set(pendingKey, JSON.stringify(command), true);
      setPending(command);
      const order = await api<Order>('/orders', { ...command.payload, requestId: command.requestId });
      await storage.set(pendingKey, null, true).catch(() => {}); // a retained successful command safely replays
      haptic.success();
      router.replace(`/order/${order.id}`);
    } catch (e) {
      haptic.error();
      // The command was persisted above, so a transport failure is "saved,
      // awaiting connection" — the pending card below is already on screen.
      if (!(e instanceof ApiError)) setError(c.bookingOfflineSaved);
      else {
        setError(err(e));
        // A transport/5xx failure may have committed: keep the frozen form and same command for retry.
        if (e.status && e.status < 500 && ![401, 408, 429].includes(e.status) && errorCode(e) !== 'idempotency_conflict') {
          try { await storage.set(pendingKey, null, true); setPending(null); }
          catch { setError(c.bookingStorageError); }
        }
      }
      if (errorCode(e) === 'price_changed') await refresh(); // re-render with the new tariff, customer confirms again
      if (['invalid_promo', 'promo_used', 'invite_first_order_only'].includes(errorCode(e) ?? '')) {
        setPromo(null);
        api<Referral>('/me/referral').then(r => setCredits(r.credits)).catch(() => undefined); // a used credit leaves the chip
      }
      if (errorCode(e) === 'promo_changed' && applied) void applyPromo(applied.code); // show the new discount, customer confirms again
    } finally { sending.current = false; setBusy(false); }
  }

  const located = !!pickupPoint && pickupPoint === gpsPoint;
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen scrollRef={scrollRef} footer={<Button title={pending ? c.confirmBooking : scheduledFor !== null ? c.scheduleRequest : c.request} trailing={money(pay)} onPress={submit} loading={busy} disabled={!ready || locating || (!available && !pending)} />}>
      <Header title={c[service]} back />
      {pending && <Card tone="clay"><Txt variant="title">{c.bookingPending}</Txt><Txt variant="caption">{c.bookingRetryHint}</Txt>
        {!!pending.payload.scheduledFor && <Txt variant="label" style={{ marginTop: 4 }}>{fill(c.scheduledFor, { t: time(pending.payload.scheduledFor) })}</Txt>}</Card>}
      {!available && !pending && <Card tone="clay">
        <Txt variant="title">{c.serviceUnavailable}</Txt>
        <Button title={c.help} variant="ghost" onPress={() => router.push('/help')} />
      </Card>}
      {!ready && error && <Button title={c.help} variant="ghost" onPress={() => router.push('/help')} />}

      {/* Service switcher: the route stays, only the details change. */}
      <Row gap={8} style={{ marginBottom: 12 }}>
        {services.filter(s => enabledServices.includes(s)).map(s => {
          const on = s === service;
          return <Press key={s} disabled={busy || !!pending || !ready || locating} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={c[s]} onPress={() => switchService(s)}
            style={[styles.service, { flexDirection: row }, on && styles.serviceOn]}>
            <Ionicons name={serviceMeta[s].icon} size={16} color={on ? palette.lime : palette.secondary} />
            <Text numberOfLines={1} style={[styles.serviceText, on && { color: '#FFFFFF' }]}>{c[s]}</Text>
          </Press>;
        })}
      </Row>

      <Card style={{ paddingTop: 0, overflow: 'hidden' }}>
        <View style={{ marginHorizontal: -16, marginBottom: 12 }}>
          <RouteMap height={150} pickup={pickupPoint ?? city(pickupCity)} dropoff={dropoffPoint ?? city(dropoffCity)}
            pickupTitle={city(pickupCity)[language]} dropoffTitle={city(dropoffCity)[language]} road={preview?.line} />
        </View>
        <View style={rtl ? { paddingLeft: 48 } : { paddingRight: 48 }}>
          <RouteLine from={city(pickupCity)[language]} to={city(dropoffCity)[language]} onFrom={locked ? undefined : () => setPicker('pickup')} onTo={locked ? undefined : () => setPicker('dropoff')} />
          <View style={[styles.swap, rtl ? { left: 0 } : { right: 0 }]}>
            <IconButton icon="swap-vertical" label={c.swap} tone="muted" disabled={locked}
              onPress={() => { haptic.tap(); setPickupCity(dropoffCity); setDropoffCity(pickupCity); setPickupPoint(dropoffPoint); setDropoffPoint(pickupPoint); }} />
          </View>
        </View>
        <Row gap={8} style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.hair, justifyContent: 'space-between' }}>
          <Press accessibilityLabel={c.useLocation} onPress={locate} disabled={locating || locked}>
            <Row gap={6} style={styles.chip}>
              <Ionicons name={located ? 'checkmark-circle' : 'navigate'} size={14} color={palette.olive} />
              <Txt variant="label" style={{ color: palette.olive, fontSize: 12 }}>{locating ? c.locating : located ? c.located : c.useLocation}</Txt>
            </Row>
          </Press>
          <Txt variant="caption">{pickupCity === dropoffCity ? c.sameCity : `≈ ${preview?.km ?? km} ${c.km}`}</Txt>
        </Row>
        {canPin && <Row gap={8} style={{ marginTop: 8, flexWrap: 'wrap' }}>
          {(['pickup', 'dropoff'] as const).map(which => {
            const set = which === 'pickup' ? pickupPoint : dropoffPoint;
            const label = which === 'pickup' ? c.pickupOnMap : c.dropoffOnMap;
            return <Press key={which} accessibilityLabel={label} disabled={locked} onPress={() => { haptic.tap(); setLocationError(''); setPinFor(which); }}>
              <Row gap={6} style={styles.chip}>
                <Ionicons name={set ? 'checkmark-circle' : 'pin-outline'} size={14} color={palette.olive} />
                <Txt variant="label" style={{ color: palette.olive, fontSize: 12 }}>{label}</Txt>
              </Row>
            </Press>;
          })}
        </Row>}
        {!!locationError && <Txt variant="caption" style={{ marginTop: 8 }}>{locationError}</Txt>}
      </Card>

      {alerts.length > 0 && <View accessibilityLiveRegion="polite"><Card tone="clay">
        <Row gap={8} style={{ marginBottom: 6 }}><Ionicons name="warning-outline" size={18} color={palette.clayInk} /><Txt variant="title" style={{ flex: 1 }}>{c.roadAlert}</Txt></Row>
        {alerts.map(r => <Txt key={r.id} variant="caption">{`${r.name}: ${c[`road_${r.status!}`]}${r.note ? ` · ${r.note}` : ''}`}</Txt>)}
        <Button title={c.roads} variant="ghost" size="sm" icon="trail-sign-outline" onPress={() => router.push('/roads')} />
      </Card></View>}

      <Tip id="book-landmark" icon="flag-outline" title={c.tipBookTitle} body={c.tipBookBody} tone="blue" />

      <Card>
        <Field label={c.pickupNote} icon="flag-outline" value={pickupNote} onChangeText={edit('pickupNote', setPickupNote)} placeholder={c.pickupHint} error={invalid.pickupNote} disabled={locked} maxLength={200} />
        {isCustomer && !locked && <SavePlace city={pickupCity} note={pickupNote} saved={places.saved} onSave={savePlace} />}
        <Field label={c.dropoffNote} icon="location-outline" value={dropoffNote} onChangeText={edit('dropoffNote', setDropoffNote)} placeholder={c.dropoffHint} error={invalid.dropoffNote} disabled={locked} maxLength={200} />
        {isCustomer && !locked && <SavePlace city={dropoffCity} note={dropoffNote} saved={places.saved} onSave={savePlace} />}
        <Field label={c[`${service}Detail`]} value={detail} onChangeText={edit('detail', setDetail)} placeholder={c[`${service}Hint`]} multiline error={invalid.detail} disabled={locked} maxLength={500} />
        {service === 'ride'
          ? <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label">{c.passengers}</Txt>
            <Stepper label={c.passengers} value={Number(option)} min={1} max={4} onChange={n => setOption(String(n))} disabled={locked} />
          </Row>
          : <>
            <Txt variant="label" style={{ marginBottom: 6 }}>{c.size}</Txt>
            <Choices items={optionsFor(service).map(key => ({ key, label: c[key as 'small'] }))} value={option} onChange={setOption} disabled={locked} />
          </>}
        {service === 'freight' && <>
          <Txt variant="label" style={{ marginVertical: 6 }}>{c.loadingHelp}</Txt>
          <Choices items={[{ key: 'no', label: c.no }, { key: 'yes', label: c.yes }]} value={loadingHelp ? 'yes' : 'no'} onChange={k => setLoadingHelp(k === 'yes')} disabled={locked} />
        </>}
      </Card>

      <Card>
        <Txt variant="label" style={{ marginBottom: 6 }}>{c.whenTitle}</Txt>
        <Choices items={[{ key: 'now', label: c.now }, { key: 'later', label: c.later }]} value={pending?.payload.scheduledFor ? 'later' : when}
          onChange={setWhen} disabled={locked} />
        {when === 'later' && !pending && chosen !== null && <View style={{ marginTop: 10 }}>
          <FilterChips items={days.map(key => ({ key, label: dayLabel(slots.find(s => dayKey(s) === key)!, language, c) }))} value={shownDay}
            onChange={key => { setDay(key); setSlot(slots.find(s => dayKey(s) === key) ?? null); }} />
          <FilterChips items={slots.filter(s => dayKey(s) === shownDay).map(s => ({ key: String(s), label: timeLabel(s, language) }))} value={String(chosen)}
            onChange={key => setSlot(Number(key))} />
          <Txt variant="caption">{c.scheduledHint}</Txt>
        </View>}
      </Card>

      <Card style={{ paddingVertical: 10 }}>
        <Row gap={12}>
          <View style={styles.cash}><Ionicons name="cash-outline" size={18} color={palette.olive} /></View>
          <View style={{ flex: 1 }}>
            <Txt variant="micro">{c.payWith}</Txt>
            <Txt variant="title">{c.cash}</Txt>
          </View>
          {plus && <Txt variant="label" style={{ color: palette.olive }}>{c.plusApplied}</Txt>}
        </Row>
        {isCustomer && <View style={styles.promo}>
          {applied ? <Row gap={8}>
            <Ionicons name="pricetag" size={16} color={palette.olive} />
            <View style={{ flex: 1 }}>
              <Txt variant="title">{fill(c.promoApplied, { code: applied.code, d: money(applied.discount) })}</Txt>
              <Txt variant="caption">{`${c.fare} ${money(price)} · ${c.youPayCash} ${money(pay)}`}</Txt>
            </View>
            {!pending && <IconButton icon="close" tone="muted" label={c.promoRemove} disabled={locked} onPress={() => { haptic.tap(); setPromo(null); AccessibilityInfo.announceForAccessibility(fill(c.promoRemoved, { p: money(price) })); }} />}
          </Row>
          : promo && !pending ? <Row gap={8}>
            <Txt variant="caption" style={{ flex: 1 }}>{c.promoRecheck}</Txt>
            <Button title={c.promoApply} size="sm" variant="soft" loading={checking} disabled={locked} label={`${c.promoApply} ${promo.code}`} onPress={() => applyPromo(promo.code)} />
          </Row>
          : !pending && (promoOpen ? <>
            <Field label={c.promoCode} icon="pricetag-outline" value={promoInput} onChangeText={v => { setPromoInput(v); setPromoError(''); }}
              error={promoError} disabled={locked || checking} maxLength={16} returnKeyType="go" onSubmitEditing={() => applyPromo(promoInput)} />
            <Button title={c.promoApply} size="sm" variant="soft" loading={checking} disabled={locked || !promoInput.trim()} onPress={() => applyPromo(promoInput)} />
          </> : <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
            {credits[0] && price >= 2 && <Press accessibilityLabel={fill(c.useCredit, { r: money(credits[0].amount), code: credits[0].code })} onPress={() => applyPromo(credits[0]!.code)} disabled={locked || checking}>
              <Row gap={6} style={styles.chip}><Ionicons name="gift-outline" size={14} color={palette.olive} /><Txt variant="label" style={{ color: palette.olive, fontSize: 12 }}>{fill(c.useCredit, { r: money(credits[0].amount), code: credits[0].code })}</Txt></Row>
            </Press>}
            <Press accessibilityLabel={c.promoAdd} onPress={() => setPromoOpen(true)} disabled={locked}>
              <Row gap={6} style={styles.chip}><Ionicons name="pricetag-outline" size={14} color={palette.olive} /><Txt variant="label" style={{ color: palette.olive, fontSize: 12 }}>{c.promoAdd}</Txt></Row>
            </Press>
          </View>)}
          {!promoOpen && !!promoError && <ErrorText>{promoError}</ErrorText>}
        </View>}
      </Card>

      <Field label={c.contact} icon="call-outline" value={contact} onChangeText={edit('contact', setContact)} placeholder={c.phoneHint} keyboardType="phone-pad" autoComplete="tel" error={invalid.contact} disabled={locked} maxLength={32}
        onSubmitEditing={submit} />
      <ErrorText>{error}</ErrorText>
    </Screen>

    {pinFor && <PinSheet title={pinFor === 'pickup' ? c.pickupOnMap : c.dropoffOnMap}
      start={(pinFor === 'pickup' ? pickupPoint : dropoffPoint) ?? city(pinFor === 'pickup' ? pickupCity : dropoffCity)}
      onClose={() => setPinFor(null)} onConfirm={point => {
        const near = nearestCity(point);
        // ponytail: 15km from a served city centre stands in for real service zones (same bound as GPS).
        if (distanceKm(city(near), point) > 15) { setLocationError(c.locationMismatch); setPinFor(null); return; }
        haptic.success();
        if (pinFor === 'pickup') { setPickupCity(near); setPickupPoint(point); } else { setDropoffCity(near); setDropoffPoint(point); }
        if (near !== (pinFor === 'pickup' ? pickupCity : dropoffCity)) setLocationError(fill(c.pinCityChanged, { city: city(near)[language] }));
        setPinFor(null);
      }} />}

    <CityPicker open={picker !== null && !locked} title={picker === 'pickup' ? c.pickup : c.dropoff} selected={picker === 'pickup' ? pickupCity : dropoffCity}
      places={places} onForget={id => confirm(c.forgetPlaceConfirm, () => api<Places>(`/me/places/${id}`, undefined, 'DELETE').then(setPlaces)
        .catch(e => { setPicker(null); setError(err(e)); }), c.forgetPlace, c.no)} // the sheet would hide the error
      onPlace={(id, note) => {
        haptic.tap();
        if (picker === 'pickup') { setPickupCity(id); setPickupPoint(null); edit('pickupNote', setPickupNote)(note); }
        else { setDropoffCity(id); setDropoffPoint(null); edit('dropoffNote', setDropoffNote)(note); }
        setPicker(null);
      }}
      onClose={() => setPicker(null)} onPick={id => {
        haptic.tap();
        if (picker === 'pickup') { setPickupCity(id); setPickupPoint(null); } else { setDropoffCity(id); setDropoffPoint(null); }
        setPicker(null);
      }} />
  </KeyboardAvoidingView>;
}

const fmt = (language: 'ar' | 'en') => language === 'ar' ? 'ar-PS' : 'en-GB';
function dayLabel(ms: number, language: 'ar' | 'en', c: { today: string; tomorrow: string }) {
  const key = dayKey(ms);
  return key === dayKey(Date.now()) ? c.today : key === dayKey(Date.now() + 86_400_000) ? c.tomorrow
    : new Date(ms).toLocaleDateString(fmt(language), { weekday: 'short', day: 'numeric', timeZone: HEBRON });
}
const timeLabel = (ms: number, language: 'ar' | 'en') => new Date(ms).toLocaleTimeString(fmt(language), { hour: 'numeric', minute: '2-digit', timeZone: HEBRON });

// Full-height sheet: drag the map under a fixed pin, then confirm. The landmark field stays the human address.
function PinSheet({ title, start, onClose, onConfirm }: { title: string; start: Point; onClose: () => void; onConfirm: (point: Point) => void }) {
  const { c } = useCopy();
  const [point, setPoint] = useState<Point>({ latitude: start.latitude, longitude: start.longitude });
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
    <Pressable style={styles.shade} onPress={onClose} accessibilityLabel={c.cancel} />
    <SafeAreaView edges={['bottom']} style={[styles.sheet, { maxHeight: '92%' }]} accessibilityViewIsModal>
      <View style={styles.grip} />
      <Txt variant="h2" style={{ marginBottom: 4 }}>{title}</Txt>
      <Txt variant="caption" style={{ marginBottom: 10 }}>{c.pinHint}</Txt>
      <View style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
        <PinMap center={start} onChange={setPoint} height={360} />
      </View>
      <Button title={c.confirmPin} icon="checkmark" onPress={() => onConfirm(point)} />
      <Button title={c.cancel} variant="ghost" onPress={onClose} />
    </SafeAreaView>
  </Modal>;
}

const placeIcons = { home: 'home-outline', work: 'briefcase-outline', other: 'star-outline' } as const;

// "Save to my places" under a landmark field: one tap reveals Home / Work / Other.
function SavePlace({ city: placeCity, note, saved, onSave }: { city: CityId; note: string; saved: SavedPlace[]; onSave: (label: SavedPlace['label'], city: CityId, note: string) => Promise<void> }) {
  const { c, row } = useCopy();
  const [open, setOpen] = useState(false);
  const trimmed = note.trim();
  if (!trimmed || saved.some(p => p.city === placeCity && p.note === trimmed)) return null;
  if (!open) return <Press accessibilityLabel={c.savePlace} onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start', marginTop: -6, marginBottom: 8 }}>
    <Row gap={6} style={styles.chip}><Ionicons name="bookmark-outline" size={14} color={palette.olive} /><Txt variant="label" style={{ color: palette.olive, fontSize: 12 }}>{c.savePlace}</Txt></Row>
  </Press>;
  return <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8, marginTop: -6, marginBottom: 8 }}>
    {(['home', 'work', 'other'] as const).map(label => <Press key={label} accessibilityLabel={`${c.savePlace}: ${c[`place_${label}`]}`}
      onPress={() => { setOpen(false); void onSave(label, placeCity, trimmed); }}>
      <Row gap={6} style={styles.chip}><Ionicons name={placeIcons[label]} size={14} color={palette.olive} /><Txt variant="label" style={{ color: palette.olive, fontSize: 12 }}>{c[`place_${label}`]}</Txt></Row>
    </Press>)}
  </View>;
}

// Searchable city list in a bottom sheet (Arabic and English names both match), with the customer's places first.
function CityPicker({ open, title, selected, onClose, onPick, places, onPlace, onForget }: { open: boolean; title: string; selected: CityId; onClose: () => void; onPick: (id: CityId) => void;
  places: Places; onPlace: (id: CityId, note: string) => void; onForget: (id: number) => void }) {
  const { c, language, row, align } = useCopy();
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const list = cities.filter(item => !term || item.ar.includes(term) || item.en.toLowerCase().includes(term));
  return <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} onShow={() => setQuery('')}>
    <Pressable style={styles.shade} onPress={onClose} accessibilityLabel={c.cancel} />
    <SafeAreaView edges={['bottom']} style={styles.sheet} accessibilityViewIsModal>
      <View style={styles.grip} />
      <Txt variant="h2" style={{ marginBottom: 10 }}>{title}</Txt>
      <View style={[styles.searchBox, { flexDirection: row }]}>
        <Ionicons name="search" size={17} color={palette.faint} />
        <TextInput value={query} onChangeText={setQuery} placeholder={c.chooseCity} placeholderTextColor={palette.faint} accessibilityLabel={c.chooseCity}
          style={[styles.searchInput, { textAlign: align }]} autoCorrect={false} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled">
        {!term && (places.saved.length > 0 || places.recent.length > 0) && <>
          <Txt variant="label" style={{ marginTop: 6 }}>{c.yourPlaces}</Txt>
          {[...places.saved.map(p => ({ ...p, key: `s${p.id}` })), ...places.recent.map((p, i) => ({ ...p, key: `r${i}`, id: 0, label: 'recent' as const }))].map(p => {
            const name = p.label === 'recent' || p.label === 'other' ? p.note : c[`place_${p.label}`];
            return <Row key={p.key} gap={4} style={styles.sheetRow}>
              <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={name === p.note ? `${name}, ${city(p.city)[language]}` : `${name}, ${city(p.city)[language]}, ${p.note}`} onPress={() => onPlace(p.city, p.note)}>
                <Row gap={12} style={{ minHeight: 56 }}>
                  <View style={styles.pin}><Ionicons name={p.label === 'recent' ? 'time-outline' : placeIcons[p.label]} size={15} color={palette.secondary} /></View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="title" numberOfLines={1}>{name}</Txt>
                    <Txt variant="micro" numberOfLines={1}>{p.label === 'recent' || p.label === 'other' ? city(p.city)[language] : `${city(p.city)[language]} · ${p.note}`}</Txt>
                  </View>
                </Row>
              </Pressable>
              {p.label !== 'recent' && <IconButton icon="trash-outline" tone="muted" label={`${c.forgetPlace}: ${name}`} onPress={() => onForget(p.id)} />}
            </Row>;
          })}
          <Txt variant="label" style={{ marginTop: 12 }}>{c.cities}</Txt>
        </>}
        {list.length === 0 && <Txt center style={{ paddingVertical: 24 }}>{c.noCities}</Txt>}
        {list.map(item => {
          const on = item.id === selected;
          return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item[language]} accessibilityState={{ selected: on }} onPress={() => onPick(item.id)}>
            <Row gap={12} style={styles.sheetRow}>
              <View style={[styles.pin, on && { backgroundColor: palette.forest }]}>
                <Ionicons name="location" size={15} color={on ? palette.lime : palette.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="title">{item[language]}</Txt>
                <Txt variant="micro">{item[language === 'ar' ? 'en' : 'ar']}</Txt>
              </View>
              {on && <Ionicons name="checkmark" size={18} color={palette.olive} />}
            </Row>
          </Pressable>;
        })}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  service: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 22, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 8 },
  serviceOn: { backgroundColor: palette.forest, borderColor: palette.forest },
  serviceText: { fontSize: 12, fontWeight: '700', color: palette.secondary, flexShrink: 1 },
  swap: { position: 'absolute', top: 20 },
  chip: { backgroundColor: palette.olivePale, borderRadius: 99, paddingHorizontal: 12, minHeight: 44 },
  promo: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.hair },
  cash: { width: 36, height: 36, borderRadius: 11, backgroundColor: palette.olivePale, alignItems: 'center', justifyContent: 'center' },
  shade: { flex: 1, backgroundColor: '#0E1F1966' },
  sheet: { backgroundColor: palette.paper, maxHeight: '78%', paddingHorizontal: 16, paddingTop: 8, borderTopLeftRadius: 22, borderTopRightRadius: 22, width: '100%', maxWidth: 640, alignSelf: 'center' },
  grip: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: palette.line, marginBottom: 12 },
  searchBox: { alignItems: 'center', gap: 8, height: 44, borderRadius: 12, backgroundColor: palette.card, paddingHorizontal: 12, marginBottom: 6 },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: palette.ink },
  sheetRow: { minHeight: 56, borderBottomWidth: 1, borderBottomColor: palette.hair },
  pin: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.muted, alignItems: 'center', justifyContent: 'center' },
});
