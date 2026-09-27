import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { cities, city, isValidPhone, nearestCity, sampleQuote, type CityId, type Service } from '../model';
import { useDarbna } from '../state';
import { palette, PrimaryButton, ScreenTitle, useCopy } from '../ui';

export default function Book() {
  const params = useLocalSearchParams<{ service?: string }>();
  const service: Service = params.service === 'ride' || params.service === 'freight' ? params.service : 'parcel';
  const { placeBooking, gpsPoint, setGpsPoint } = useDarbna();
  const { c, language, rtl } = useCopy();
  const [pickupCity, setPickupCity] = useState<CityId>(gpsPoint ? nearestCity(gpsPoint) : 'ramallah');
  const [dropoffCity, setDropoffCity] = useState<CityId>('nablus');
  const [cityTarget, setCityTarget] = useState<'pickup' | 'dropoff' | null>(null);
  const [pickupNote, setPickupNote] = useState('');
  const [dropoffNote, setDropoffNote] = useState('');
  const [contact, setContact] = useState('');
  const [detail, setDetail] = useState('');
  const [option, setOption] = useState(service === 'ride' ? '1' : 'small');
  const [loadingHelp, setLoadingHelp] = useState(false);
  const [payment, setPayment] = useState<'cash' | 'digital'>('cash');
  const [shared, setShared] = useState(true);
  const [error, setError] = useState('');
  const help = service === 'freight' && loadingHelp ? 30 : 0;
  const quote = (pooled: boolean) => sampleQuote(service, pickupCity, dropoffCity, option, pooled) + help;
  const price = quote(shared);
  const serviceTitle = c[service];

  function submit() {
    if (!pickupNote.trim() || !dropoffNote.trim() || !isValidPhone(contact)) {
      setError(c.required);
      return;
    }
    if (service !== 'ride' && !detail.trim()) {
      setError(service === 'freight' ? c.freightRequired : c.parcelRequired);
      return;
    }
    setError('');
    placeBooking({
      id: `DR-${Date.now().toString().slice(-7)}`,
      service, pickupCity, dropoffCity, pickupPoint: gpsPoint ?? undefined,
      pickupNote: pickupNote.trim(), dropoffNote: dropoffNote.trim(),
      contact: contact.trim(), detail: detail.trim(),
      option: service === 'freight' && loadingHelp ? `${option}+help` : option,
      payment, shared, samplePrice: price, status: 'requested', createdAt: Date.now(),
    });
    router.replace('/activity');
  }

  function cityField(target: 'pickup' | 'dropoff') {
    const selected = target === 'pickup' ? pickupCity : dropoffCity;
    return <Pressable accessibilityRole="button" accessibilityLabel={target === 'pickup' ? c.pickupCity : c.dropoffCity}
      onPress={() => setCityTarget(target)} style={styles.cityField}>
      <Text style={[styles.label, { textAlign: rtl ? 'right' : 'left' }]}>{target === 'pickup' ? c.pickupCity : c.dropoffCity}</Text>
      <View style={[styles.cityValue, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <Text style={styles.cityName}>{city(selected)[language]}</Text>
        <Ionicons name="chevron-down" size={18} color={palette.olive} />
      </View>
    </Pressable>;
  }

  function input(label: string, hint: string, value: string, change: (text: string) => void, multiline = false, phone = false) {
    return <View style={styles.field}>
      <Text style={[styles.label, { textAlign: rtl ? 'right' : 'left' }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={change}
        placeholder={hint}
        placeholderTextColor="#91A097"
        multiline={multiline}
        keyboardType={phone ? 'phone-pad' : 'default'}
        textAlign={rtl ? 'right' : 'left'}
        style={[styles.input, multiline && { minHeight: 84, textAlignVertical: 'top' }]}
      />
    </View>;
  }

  function choices(items: { key: string; label: string }[], current: string, select: (key: string) => void) {
    return <View style={[styles.choices, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
      {items.map(item => <Pressable key={item.key} accessibilityRole="radio" accessibilityLabel={item.label}
        aria-checked={current === item.key}
        onPress={() => select(item.key)}
        style={[styles.choice, current === item.key && styles.choiceActive]}>
        <Text style={[styles.choiceText, current === item.key && { color: palette.olive }]}>{item.label}</Text>
      </Pressable>)}
    </View>;
  }

  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title={c.bookTitle} />
        <Text style={[styles.serviceTag, { alignSelf: rtl ? 'flex-end' : 'flex-start' }]}>{serviceTitle}</Text>

        <Text style={[styles.section, { textAlign: rtl ? 'right' : 'left' }]}>{c.route}</Text>
        <View style={styles.routeCard}>
          {gpsPoint && <Text style={[styles.gpsNote, { textAlign: rtl ? 'right' : 'left' }]}>{c.gpsReady} · {gpsPoint.latitude.toFixed(4)}, {gpsPoint.longitude.toFixed(4)}</Text>}
          <View style={[styles.cities, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            {cityField('pickup')}
            <Ionicons name={rtl ? 'arrow-back' : 'arrow-forward'} size={19} color={palette.clay} />
            {cityField('dropoff')}
          </View>
          <View style={styles.separator} />
          {input(c.pickupNote, c.pickupHint, pickupNote, setPickupNote)}
          {input(c.dropoffNote, c.dropoffHint, dropoffNote, setDropoffNote)}
          {input(c.contact, c.contactHint, contact, setContact, false, true)}
        </View>

        <Text style={[styles.section, { textAlign: rtl ? 'right' : 'left' }]}>{c.details}</Text>
        <View style={styles.detailsCard}>
          {input(service === 'parcel' ? c.parcelDetail : service === 'ride' ? c.rideDetail : c.freightDetail,
            service === 'parcel' ? c.parcelHint : service === 'ride' ? c.rideHint : c.freightHint,
            detail, setDetail, true)}
          <Text style={[styles.label, { textAlign: rtl ? 'right' : 'left' }]}>
            {service === 'parcel' ? c.parcelSize : service === 'ride' ? c.passengers : c.loadSize}
          </Text>
          {choices(service === 'ride'
            ? ['1', '2', '3', '4'].map(n => ({ key: n, label: n }))
            : [{ key: 'small', label: c.small }, { key: 'medium', label: c.medium }, { key: 'large', label: c.large }],
            option, setOption)}
          {service === 'freight' && <>
            <Text style={[styles.label, { textAlign: rtl ? 'right' : 'left', marginTop: 16 }]}>{c.loadingHelp}</Text>
            {choices([{ key: 'no', label: c.no }, { key: 'yes', label: c.yes }], loadingHelp ? 'yes' : 'no', key => setLoadingHelp(key === 'yes'))}
          </>}
        </View>

        <Text style={[styles.section, { textAlign: rtl ? 'right' : 'left' }]}>{c.mode}</Text>
        {choices([
          { key: 'shared', label: `${c.shared} · ${c.nis} ${quote(true)}` },
          { key: 'private', label: `${c.private} · ${c.nis} ${quote(false)}` },
        ], shared ? 'shared' : 'private', key => setShared(key === 'shared'))}
        <Text style={[styles.note, { textAlign: rtl ? 'right' : 'left', marginBottom: 24 }]}>{c.sharedNote}</Text>

        <Text style={[styles.section, { textAlign: rtl ? 'right' : 'left' }]}>{c.payment}</Text>
        {choices([{ key: 'cash', label: c.cash }, { key: 'digital', label: c.digital }], payment, key => setPayment(key as 'cash' | 'digital'))}
        <Text style={[styles.note, { textAlign: rtl ? 'right' : 'left' }]}>{c.paymentNote}</Text>

        <View style={styles.quoteCard}>
          <View style={[styles.quoteRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <Text style={styles.quoteLabel}>{c.quote}</Text>
            <Text style={styles.quoteValue}>{c.nis} {price}</Text>
          </View>
          <Text style={[styles.note, { textAlign: rtl ? 'right' : 'left' }]}>{c.sample}</Text>
        </View>
        {!!error && <Text accessibilityRole="alert" style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{error}</Text>}
        <PrimaryButton title={c.confirm} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>

    <Modal visible={cityTarget !== null} transparent animationType="slide" onRequestClose={() => setCityTarget(null)}>
      <Pressable style={styles.modalShade} onPress={() => setCityTarget(null)} />
      <SafeAreaView style={styles.modalCard}>
        <Text style={[styles.section, { textAlign: rtl ? 'right' : 'left' }]}>{cityTarget === 'pickup' ? c.pickupCity : c.dropoffCity}</Text>
        <ScrollView>
          {cities.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => {
            if (cityTarget === 'pickup') {
              setPickupCity(item.id);
              if (item.id !== pickupCity) setGpsPoint(null);
            }
            else setDropoffCity(item.id);
            setCityTarget(null);
          }} style={[styles.modalCity, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <Text style={styles.modalCityText}>{item[language]}</Text>
            <Ionicons name="chevron-forward" size={17} color={palette.secondary} />
          </Pressable>)}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: palette.paper },
  content: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 35 },
  serviceTag: { color: palette.olive, backgroundColor: palette.olivePale, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, fontWeight: '800', overflow: 'hidden', marginBottom: 22 },
  section: { fontSize: 19, color: palette.ink, fontWeight: '900', marginBottom: 12 },
  routeCard: { backgroundColor: palette.card, borderRadius: 20, borderWidth: 1, borderColor: palette.line, padding: 16, marginBottom: 24 },
  gpsNote: { color: palette.olive, backgroundColor: palette.olivePale, padding: 10, borderRadius: 11, fontSize: 12, fontWeight: '800', overflow: 'hidden', marginBottom: 12 },
  cities: { alignItems: 'center', gap: 9 },
  cityField: { flex: 1, minHeight: 58, justifyContent: 'center' },
  cityValue: { alignItems: 'center', justifyContent: 'space-between', marginTop: 5, backgroundColor: palette.muted, borderRadius: 11, paddingHorizontal: 10, minHeight: 41 },
  cityName: { fontSize: 14, fontWeight: '800', color: palette.ink },
  separator: { height: 1, backgroundColor: palette.line, marginVertical: 17 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '800', color: palette.ink, marginBottom: 7 },
  input: { borderWidth: 1, borderColor: palette.line, borderRadius: 12, minHeight: 48, paddingHorizontal: 13, paddingVertical: 11, color: palette.ink, backgroundColor: palette.paper, fontSize: 15 },
  detailsCard: { backgroundColor: palette.card, borderRadius: 20, borderWidth: 1, borderColor: palette.line, padding: 16, marginBottom: 24 },
  choices: { gap: 8, marginBottom: 7 },
  choice: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  choiceActive: { backgroundColor: palette.olivePale, borderColor: palette.olive },
  choiceText: { color: palette.secondary, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  note: { color: palette.secondary, fontSize: 12, lineHeight: 19, marginTop: 8 },
  quoteCard: { borderRadius: 20, padding: 18, backgroundColor: palette.muted, marginTop: 19, marginBottom: 15 },
  quoteRow: { justifyContent: 'space-between', alignItems: 'center' },
  quoteLabel: { fontSize: 15, color: palette.ink, fontWeight: '800' },
  quoteValue: { fontSize: 25, color: palette.olive, fontWeight: '900' },
  error: { color: palette.error, fontSize: 13, fontWeight: '700', marginBottom: 12 },
  modalShade: { flex: 1, backgroundColor: '#182D2755' },
  modalCard: { backgroundColor: palette.paper, maxHeight: '70%', paddingHorizontal: 22, paddingTop: 22, borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  modalCity: { minHeight: 51, justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: palette.line },
  modalCityText: { color: palette.ink, fontSize: 16, fontWeight: '700' },
});
