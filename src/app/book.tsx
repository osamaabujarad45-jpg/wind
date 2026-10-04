// Route, service details, payment and one confirm action; uncertain submissions keep their identity.
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { api, ApiError, errorCode, storage } from '../api';
import { newBooking, readBooking, type PendingBooking } from '../booking';
import { cities, city, distanceKm, isCity, isValidPhone, nearestCity, optionsFor, quote, services, type CityId, type Order, type Point, type Service } from '../model';
import { RouteLine, serviceMeta } from '../parts';
import { useSession } from '../session';
import { Button, Card, Choices, ErrorText, Field, haptic, Header, IconButton, palette, Press, Row, Screen, Stepper, Tip, Txt, useCopy } from '../ui';

export default function Book() {
  const params = useLocalSearchParams<{ service?: string; from?: string; to?: string; pick?: string }>();
  const { me, refresh } = useSession();
  const { c, language, money, err, row, rtl } = useCopy();
  const [service, setService] = useState<Service>(params.service === 'ride' || params.service === 'freight' ? params.service : 'parcel');
  const [pickupCity, setPickupCity] = useState<CityId>(isCity(params.from) ? params.from : 'ramallah');
  const [dropoffCity, setDropoffCity] = useState<CityId>(isCity(params.to) ? params.to : 'nablus');
  const [pickupPoint, setPickupPoint] = useState<Point | null>(null);
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
  const sending = useRef(false);
  const pendingKey = `booking.${me!.user.id}`;
  const enabledServices = me?.capabilities?.enabledServices ?? ['parcel'];
  const available = enabledServices.includes(service);
  const locked = busy || !!pending || !ready || locating || !available;
  // Per-field problems, shown under each field; cleared as soon as that field is edited.
  const [invalid, setInvalid] = useState<Partial<Record<'pickupNote' | 'dropoffNote' | 'detail' | 'contact', string>>>({});
  const scrollRef = useRef<ScrollView>(null);
  const edit = (key: keyof typeof invalid, set: (v: string) => void) => (v: string) => { set(v); if (invalid[key]) setInvalid({ ...invalid, [key]: undefined }); };

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
        setPickupPoint(point);
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
        setPickupPoint(p.pickupPoint); setPickupNote(p.pickupNote); setDropoffNote(p.dropoffNote);
        setContact(p.contact); setDetail(p.detail); setOption(p.option); setLoadingHelp(p.loadingHelp);
      }
      setReady(true);
    }).catch(() => { if (mounted) setError(c.bookingStorageError); });
    return () => { mounted = false; };
  }, [pendingKey, c.bookingStorageError]);

  const settings = me!.settings;
  const plus = me?.plan === 'plus';
  const price = pending?.payload.quotedPrice ?? quote(settings, { service, pickupCity, dropoffCity, option, loadingHelp, shared: false, plus });
  const km = distanceKm(city(pickupCity), city(dropoffCity));

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
      const command = pending ?? newBooking({ service, pickupCity, dropoffCity, pickupPoint, pickupNote, dropoffNote,
        contact, detail, option, loadingHelp, shared: false, quotedPrice: price });
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
    } finally { sending.current = false; setBusy(false); }
  }

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen scrollRef={scrollRef} footer={<Button title={pending ? c.confirmBooking : c.request} trailing={money(price)} onPress={submit} loading={busy} disabled={!ready || locating || (!available && !pending)} />}>
      <Header title={c[service]} back />
      {pending && <Card tone="clay"><Txt variant="title">{c.bookingPending}</Txt><Txt variant="caption">{c.bookingRetryHint}</Txt></Card>}
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

      <Card>
        <View style={rtl ? { paddingLeft: 48 } : { paddingRight: 48 }}>
          <RouteLine from={city(pickupCity)[language]} to={city(dropoffCity)[language]} onFrom={locked ? undefined : () => setPicker('pickup')} onTo={locked ? undefined : () => setPicker('dropoff')} />
          <View style={[styles.swap, rtl ? { left: 0 } : { right: 0 }]}>
            <IconButton icon="swap-vertical" label={c.swap} tone="muted" disabled={locked}
              onPress={() => { haptic.tap(); setPickupCity(dropoffCity); setDropoffCity(pickupCity); setPickupPoint(null); }} />
          </View>
        </View>
        <Row gap={8} style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.hair, justifyContent: 'space-between' }}>
          <Press accessibilityLabel={c.useLocation} onPress={locate} disabled={locating || locked}>
            <Row gap={6} style={styles.chip}>
              <Ionicons name={pickupPoint ? 'checkmark-circle' : 'navigate'} size={14} color={palette.olive} />
              <Txt variant="label" style={{ color: palette.olive, fontSize: 12 }}>{locating ? c.locating : pickupPoint ? c.located : c.useLocation}</Txt>
            </Row>
          </Press>
          <Txt variant="caption">{pickupCity === dropoffCity ? c.sameCity : `≈ ${km} ${c.km}`}</Txt>
        </Row>
        {!!locationError && <Txt variant="caption" style={{ marginTop: 8 }}>{locationError}</Txt>}
      </Card>

      <Tip id="book-landmark" icon="flag-outline" title={c.tipBookTitle} body={c.tipBookBody} tone="blue" />

      <Card>
        <Field label={c.pickupNote} icon="flag-outline" value={pickupNote} onChangeText={edit('pickupNote', setPickupNote)} placeholder={c.pickupHint} error={invalid.pickupNote} disabled={locked} maxLength={200} />
        <Field label={c.dropoffNote} icon="location-outline" value={dropoffNote} onChangeText={edit('dropoffNote', setDropoffNote)} placeholder={c.dropoffHint} error={invalid.dropoffNote} disabled={locked} maxLength={200} />
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

      <Card style={{ paddingVertical: 10 }}>
        <Row gap={12}>
          <View style={styles.cash}><Ionicons name="cash-outline" size={18} color={palette.olive} /></View>
          <View style={{ flex: 1 }}>
            <Txt variant="micro">{c.payWith}</Txt>
            <Txt variant="title">{c.cash}</Txt>
          </View>
          {plus && <Txt variant="label" style={{ color: palette.olive }}>{c.plusApplied}</Txt>}
        </Row>
      </Card>

      <Field label={c.contact} icon="call-outline" value={contact} onChangeText={edit('contact', setContact)} placeholder={c.phoneHint} keyboardType="phone-pad" autoComplete="tel" error={invalid.contact} disabled={locked} maxLength={32} />
      <ErrorText>{error}</ErrorText>
    </Screen>

    <CityPicker open={picker !== null && !locked} title={picker === 'pickup' ? c.pickup : c.dropoff} selected={picker === 'pickup' ? pickupCity : dropoffCity}
      onClose={() => setPicker(null)} onPick={id => {
        haptic.tap();
        if (picker === 'pickup') { setPickupCity(id); setPickupPoint(null); } else setDropoffCity(id);
        setPicker(null);
      }} />
  </KeyboardAvoidingView>;
}

// Searchable city list in a bottom sheet (Arabic and English names both match).
function CityPicker({ open, title, selected, onClose, onPick }: { open: boolean; title: string; selected: CityId; onClose: () => void; onPick: (id: CityId) => void }) {
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
  cash: { width: 36, height: 36, borderRadius: 11, backgroundColor: palette.olivePale, alignItems: 'center', justifyContent: 'center' },
  shade: { flex: 1, backgroundColor: '#0E1F1966' },
  sheet: { backgroundColor: palette.paper, maxHeight: '78%', paddingHorizontal: 16, paddingTop: 8, borderTopLeftRadius: 22, borderTopRightRadius: 22, width: '100%', maxWidth: 640, alignSelf: 'center' },
  grip: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: palette.line, marginBottom: 12 },
  searchBox: { alignItems: 'center', gap: 8, height: 44, borderRadius: 12, backgroundColor: palette.card, paddingHorizontal: 12, marginBottom: 6 },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: palette.ink },
  sheetRow: { minHeight: 56, borderBottomWidth: 1, borderBottomColor: palette.hair },
  pin: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.muted, alignItems: 'center', justifyContent: 'center' },
});
