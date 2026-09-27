import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import type { Service } from '../model';
import { useFastShip } from '../state';
import { BottomBar, palette, PrimaryButton, useCopy } from '../ui';

export default function Home() {
  const { booking, language, setLanguage, gpsPoint, setGpsPoint } = useFastShip();
  const { c, rtl } = useCopy();
  const [gps, setGps] = useState<'idle' | 'loading' | 'ready' | 'denied'>('idle');

  async function locate() {
    setGps('loading');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { setGps('denied'); return; }
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setGpsPoint({ latitude: result.coords.latitude, longitude: result.coords.longitude });
      setGps('ready');
    } catch {
      setGps('denied');
    }
  }

  const services: { id: Service; icon: keyof typeof Ionicons.glyphMap; color: string; pale: string; title: string; description: string }[] = [
    { id: 'parcel', icon: 'cube-outline', color: palette.olive, pale: palette.olivePale, title: c.parcel, description: c.parcelDesc },
    { id: 'ride', icon: 'car-outline', color: '#375C86', pale: '#E9EFF7', title: c.ride, description: c.rideDesc },
    { id: 'freight', icon: 'bus-outline', color: palette.clay, pale: palette.clayPale, title: c.freight, description: c.freightDesc },
  ];

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.top, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <View style={[styles.brand, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <View style={styles.brandMark}><View style={styles.brandLine} /><View style={styles.brandDotA} /><View style={styles.brandDotB} /></View>
          <View><Text style={[styles.brandName, { textAlign: rtl ? 'right' : 'left' }]}>{c.brand}</Text><Text style={styles.brandLatin}>FAST SHIP</Text></View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={language === 'ar' ? 'English' : 'العربية'}
          onPress={() => setLanguage(language === 'ar' ? 'en' : 'ar')} style={styles.language}>
          <Text style={styles.languageText}>{language === 'ar' ? 'EN' : 'عربي'}</Text>
        </Pressable>
      </View>

      <View style={[styles.demoPill, { alignSelf: rtl ? 'flex-end' : 'flex-start' }]}>
        <View style={styles.demoDot} /><Text style={styles.demoText}>{c.demo}</Text>
      </View>
      <Text style={[styles.hero, { textAlign: rtl ? 'right' : 'left' }]}>{c.greeting}</Text>
      <Text style={[styles.intro, { textAlign: rtl ? 'right' : 'left' }]}>{c.homeIntro}</Text>

      <View style={styles.locationCard}>
        <View style={[styles.locationHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <View style={styles.pin}><Ionicons name="location-outline" size={23} color={palette.olive} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { textAlign: rtl ? 'right' : 'left' }]}>{c.where}</Text>
            <Text style={[styles.body, { textAlign: rtl ? 'right' : 'left' }]}>{gps === 'denied' ? c.gpsDenied : gpsPoint ? `${c.gpsReady} · ${gpsPoint.latitude.toFixed(4)}, ${gpsPoint.longitude.toFixed(4)}` : c.gpsPrompt}</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={c.gpsButton} disabled={gps === 'loading'} onPress={locate}
          style={[styles.locateButton, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          {gps === 'loading' ? <ActivityIndicator size="small" color={palette.olive} /> : <Ionicons name="navigate-outline" size={18} color={palette.olive} />}
          <Text style={styles.locateText}>{gps === 'loading' ? c.gpsLoading : c.gpsButton}</Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionTitle, { textAlign: rtl ? 'right' : 'left' }]}>{c.services}</Text>
      {services.map((service, index) => <Pressable key={service.id} accessibilityRole="button"
        accessibilityLabel={`${service.title}. ${c.choose}`}
        onPress={() => router.push({ pathname: '/book', params: { service: service.id } })}
        style={({ pressed }) => [styles.serviceCard, { opacity: pressed ? 0.75 : 1, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <View style={[styles.serviceIcon, { backgroundColor: service.pale }]}><Ionicons name={service.icon} size={27} color={service.color} /></View>
        <View style={styles.serviceText}>
          <Text style={[styles.serviceEyebrow, { textAlign: rtl ? 'right' : 'left' }]}>0{index + 1} / FAST SHIP</Text>
          <Text style={[styles.serviceTitle, { textAlign: rtl ? 'right' : 'left' }]}>{service.title}</Text>
          <Text style={[styles.body, { textAlign: rtl ? 'right' : 'left' }]}>{service.description}</Text>
        </View>
        <Ionicons name={rtl ? 'arrow-back' : 'arrow-forward'} size={21} color={palette.olive} />
      </Pressable>)}

      <Text style={[styles.sectionTitle, { textAlign: rtl ? 'right' : 'left' }]}>{c.recent}</Text>
      <View style={styles.recentCard}>
        {booking ? <>
          <Text style={[styles.cardTitle, { textAlign: rtl ? 'right' : 'left' }]}>{booking.id}</Text>
          <Text style={[styles.body, { textAlign: rtl ? 'right' : 'left', marginBottom: 12 }]}>{c.recentDesc}</Text>
          <PrimaryButton title={c.activity} onPress={() => router.push('/activity')} muted />
        </> : <Text style={[styles.body, { textAlign: rtl ? 'right' : 'left' }]}>{c.noRecent}</Text>}
      </View>
      <Text style={styles.promise}>{c.promise}</Text>
    </ScrollView>
    <BottomBar active="home" />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: palette.paper },
  content: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 30 },
  top: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  brand: { alignItems: 'center', gap: 10 },
  brandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.olive, justifyContent: 'center', alignItems: 'center' },
  brandLine: { width: 22, height: 3, backgroundColor: '#FFFFFF', transform: [{ rotate: '-35deg' }], borderRadius: 2 },
  brandDotA: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF', position: 'absolute', top: 11, right: 10 },
  brandDotB: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF', position: 'absolute', bottom: 11, left: 10 },
  brandName: { color: palette.ink, fontSize: 17, fontWeight: '900' },
  brandLatin: { color: palette.secondary, fontSize: 9, fontWeight: '800', letterSpacing: 2 },
  language: { minWidth: 48, height: 44, borderRadius: 14, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, justifyContent: 'center', alignItems: 'center' },
  languageText: { fontWeight: '800', color: palette.ink, fontSize: 13 },
  demoPill: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: palette.clayPale, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 11, marginBottom: 11 },
  demoDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.clay },
  demoText: { color: palette.clay, fontSize: 12, fontWeight: '800' },
  hero: { color: palette.ink, fontSize: 34, lineHeight: 43, fontWeight: '900', marginBottom: 8 },
  intro: { color: palette.secondary, fontSize: 15, lineHeight: 24, marginBottom: 25 },
  locationCard: { backgroundColor: palette.card, borderColor: palette.line, borderWidth: 1, borderRadius: 22, padding: 17, marginBottom: 27 },
  locationHeader: { alignItems: 'center', gap: 12 },
  pin: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.olivePale, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '800', color: palette.ink, marginBottom: 3 },
  body: { fontSize: 13, lineHeight: 21, color: palette.secondary },
  locateButton: { marginTop: 15, borderRadius: 13, backgroundColor: palette.olivePale, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 8 },
  locateText: { color: palette.olive, fontSize: 14, fontWeight: '800' },
  sectionTitle: { color: palette.ink, fontSize: 20, fontWeight: '900', marginBottom: 13 },
  serviceCard: { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, borderRadius: 20, padding: 15, alignItems: 'center', gap: 13, marginBottom: 11, minHeight: 112 },
  serviceIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  serviceText: { flex: 1 },
  serviceEyebrow: { fontSize: 10, color: palette.clay, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  serviceTitle: { fontSize: 17, fontWeight: '900', color: palette.ink, marginBottom: 3 },
  recentCard: { backgroundColor: palette.muted, padding: 17, borderRadius: 19, marginBottom: 20 },
  promise: { color: palette.secondary, fontSize: 12, textAlign: 'center', lineHeight: 19 },
});
