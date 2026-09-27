import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { api, errorCode } from '../api';
import { cities, city, distanceKm, isValidPhone, nearestCity, optionsFor, quote, type CityId, type Order, type Point, type Service } from '../model';
import { useSession } from '../session';
import { Button, Card, Choices, ErrorText, Field, haptic, Header, palette, Press, Row, Screen, Txt, useCopy } from '../ui';

export default function Book() {
  const params = useLocalSearchParams<{ service?: string }>();
  const service: Service = params.service === 'ride' || params.service === 'freight' ? params.service : 'parcel';
  const { me, refresh } = useSession();
  const { c, language, money, err } = useCopy();
  const [pickupCity, setPickupCity] = useState<CityId>('ramallah');
  const [dropoffCity, setDropoffCity] = useState<CityId>('nablus');
  const [pickupPoint, setPickupPoint] = useState<Point | null>(null);
  const [locating, setLocating] = useState(false);
  const [picker, setPicker] = useState<'pickup' | 'dropoff' | null>(null);
  const [pickupNote, setPickupNote] = useState('');
  const [dropoffNote, setDropoffNote] = useState('');
  const [contact, setContact] = useState(me?.user.phone ?? '');
  const [detail, setDetail] = useState('');
  const [option, setOption] = useState(optionsFor(service)[0]);
  const [loadingHelp, setLoadingHelp] = useState(false);
  const [shared, setShared] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function locate(ask: boolean) {
    try {
      const permission = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
      setLocating(permission.granted);
      if (permission.granted) {
        const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const point = { latitude: coords.latitude, longitude: coords.longitude };
        setPickupPoint(point);
        setPickupCity(nearestCity(point));
      }
    } catch {
      // Location is a shortcut; the city picker and landmark still work without it.
    }
    setLocating(false);
  }

  // Fill pickup silently when permission was already granted: no extra tap.
  useEffect(() => {
    Location.getForegroundPermissionsAsync().then(p => { if (p.granted) locate(false); }, () => {});
  }, []);

  const settings = me!.settings;
  const plus = me?.plan === 'plus';
  const priceFor = (pooled: boolean) => quote(settings, { service, pickupCity, dropoffCity, option, loadingHelp, shared: pooled, plus });
  const km = distanceKm(city(pickupCity), city(dropoffCity));

  async function submit() {
    if (!pickupNote.trim() || !dropoffNote.trim() || (service !== 'ride' && !detail.trim())) return setError(err('invalid_input'));
    if (!isValidPhone(contact)) return setError(err('invalid_phone'));
    setBusy(true);
    setError('');
    try {
      const order = await api<Order>('/orders', {
        service, pickupCity, dropoffCity, pickupPoint, pickupNote, dropoffNote, contact, detail, option, loadingHelp, shared,
        quotedPrice: priceFor(shared),
      });
      haptic.success();
      router.replace(`/order/${order.id}`);
    } catch (e) {
      haptic.error();
      setError(err(e));
      if (errorCode(e) === 'price_changed') await refresh(); // re-render with the new tariff, customer confirms again
      setBusy(false);
    }
  }

  function cityButton(target: 'pickup' | 'dropoff') {
    const id = target === 'pickup' ? pickupCity : dropoffCity;
    return <Press accessibilityLabel={`${target === 'pickup' ? c.from : c.to}: ${city(id)[language]}`} onPress={() => setPicker(target)} style={{ flex: 1 }}>
      <View style={styles.city}>
        <Txt variant="caption">{target === 'pickup' ? c.from : c.to}</Txt>
        <Row gap={6} style={{ justifyContent: 'space-between' }}>
          <Txt variant="title">{city(id)[language]}</Txt>
          <Ionicons name="chevron-down" size={16} color={palette.olive} />
        </Row>
      </View>
    </Press>;
  }

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen>
      <Header title={c[service]} back />

      <Card>
        <Row gap={8}>
          {cityButton('pickup')}
          <Pressable accessibilityRole="button" accessibilityLabel="⇄" hitSlop={10} style={styles.swap}
            onPress={() => { setPickupCity(dropoffCity); setDropoffCity(pickupCity); setPickupPoint(null); }}>
            <Ionicons name="swap-horizontal" size={18} color={palette.clay} />
          </Pressable>
          {cityButton('dropoff')}
        </Row>
        <Row gap={8} style={{ marginTop: 10, marginBottom: 14 }}>
          <Press accessibilityLabel={c.useLocation} onPress={() => locate(true)} disabled={locating}>
            <Row gap={6} style={styles.chip}>
              <Ionicons name={pickupPoint ? 'checkmark-circle' : 'navigate-outline'} size={15} color={palette.olive} />
              <Txt variant="caption" style={{ color: palette.olive, fontWeight: '800' }}>
                {locating ? c.locating : pickupPoint ? c.located : c.useLocation}
              </Txt>
            </Row>
          </Press>
          <Txt variant="caption">{pickupCity === dropoffCity ? c.sameCity : `${km} ${c.km}`}</Txt>
        </Row>
        <Field label={c.pickupNote} value={pickupNote} onChangeText={setPickupNote} placeholder={c.pickupHint} />
        <Field label={c.dropoffNote} value={dropoffNote} onChangeText={setDropoffNote} placeholder={c.dropoffHint} />
        <Field label={c.contact} value={contact} onChangeText={setContact} placeholder={c.phoneHint} keyboardType="phone-pad" autoComplete="tel" />
      </Card>

      <Card>
        <Field label={c[`${service}Detail`]} value={detail} onChangeText={setDetail} placeholder={c[`${service}Hint`]} multiline />
        <Txt variant="label" style={{ marginBottom: 7 }}>{service === 'ride' ? c.passengers : c.size}</Txt>
        <Choices items={optionsFor(service).map(key => ({ key, label: service === 'ride' ? key : c[key as 'small'] }))} value={option} onChange={setOption} />
        {service === 'freight' && <>
          <Txt variant="label" style={{ marginVertical: 7 }}>{c.loadingHelp}</Txt>
          <Choices items={[{ key: 'no', label: c.no }, { key: 'yes', label: c.yes }]} value={loadingHelp ? 'yes' : 'no'} onChange={k => setLoadingHelp(k === 'yes')} />
        </>}
      </Card>

      <Txt variant="label" style={{ marginBottom: 7 }}>{c.mode}</Txt>
      <Choices items={[
        { key: 'shared', label: `${c.shared} · ${money(priceFor(true))}` },
        { key: 'private', label: `${c.private} · ${money(priceFor(false))}` },
      ]} value={shared ? 'shared' : 'private'} onChange={k => { haptic.tap(); setShared(k === 'shared'); }} />
      <Txt variant="caption" style={{ marginBottom: 16 }}>{c.sharedNote}</Txt>

      <Card tone="muted">
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Txt variant="title">{c.total}</Txt>
            <Txt variant="caption">{plus ? `${c.plusApplied} · ${c.cashNote}` : c.cashNote}</Txt>
          </View>
          <Txt variant="h1" style={{ color: palette.olive }}>{money(priceFor(shared))}</Txt>
        </Row>
      </Card>
      <ErrorText>{error}</ErrorText>
      <Button title={c.orderNow} icon="flash-outline" onPress={submit} loading={busy} />
    </Screen>

    <Modal visible={picker !== null} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
      <Pressable style={styles.shade} onPress={() => setPicker(null)} accessibilityLabel="×" />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <Txt variant="h2" style={{ marginBottom: 8 }}>{c.chooseCity}</Txt>
        <ScrollView>
          {cities.map(item => {
            const selected = item.id === (picker === 'pickup' ? pickupCity : dropoffCity);
            return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item[language]} onPress={() => {
              haptic.tap();
              if (picker === 'pickup') { setPickupCity(item.id); setPickupPoint(null); } else setDropoffCity(item.id);
              setPicker(null);
            }}>
              <Row style={styles.sheetRow}>
                <Txt variant="title" style={{ flex: 1, color: selected ? palette.olive : palette.ink }}>{item[language]}</Txt>
                {selected && <Ionicons name="checkmark" size={18} color={palette.olive} />}
              </Row>
            </Pressable>;
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  city: { backgroundColor: palette.muted, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, gap: 2 },
  swap: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.clayPale, alignItems: 'center', justifyContent: 'center' },
  chip: { backgroundColor: palette.olivePale, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  shade: { flex: 1, backgroundColor: '#182D2755' },
  sheet: { backgroundColor: palette.paper, maxHeight: '70%', paddingHorizontal: 22, paddingTop: 20, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  sheetRow: { minHeight: 52, borderBottomWidth: 1, borderBottomColor: palette.line },
});
