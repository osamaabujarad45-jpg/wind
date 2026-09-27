import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import RouteMap from '../RouteMap';
import { city, statusFlow } from '../model';
import { useFastShip } from '../state';
import { BottomBar, palette, PrimaryButton, ScreenTitle, useCopy } from '../ui';

export default function Activity() {
  const { booking, advanceDemo } = useFastShip();
  const { c, language, rtl } = useCopy();

  if (!booking) return <SafeAreaView style={styles.safe}>
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name="receipt-outline" size={34} color={palette.olive} /></View>
      <Text style={styles.emptyTitle}>{c.noOrder}</Text>
      <Text style={styles.emptyText}>{c.noOrderDesc}</Text>
      <PrimaryButton title={c.home} onPress={() => router.replace('/')} />
    </View>
    <BottomBar active="activity" />
  </SafeAreaView>;

  const from = city(booking.pickupCity);
  const to = city(booking.dropoffCity);
  const stageIndex = statusFlow.indexOf(booking.status);
  const pickup = booking.pickupPoint ?? { latitude: from.latitude, longitude: from.longitude };

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenTitle title={c.activityTitle} />
      <View style={[styles.orderHead, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <View>
          <Text style={[styles.eyebrow, { textAlign: rtl ? 'right' : 'left' }]}>{c.sampleOrder}</Text>
          <Text style={styles.orderId}>{booking.id}</Text>
        </View>
        <View style={styles.statusPill}><Text style={styles.statusText}>{c[booking.status]}</Text></View>
      </View>

      <View style={styles.routeCard}>
        <View style={[styles.routeLine, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <View style={styles.startDot} />
          <Text style={[styles.routeType, { textAlign: rtl ? 'right' : 'left' }]}>{c.from}</Text>
          <Text style={[styles.routeCity, { textAlign: rtl ? 'left' : 'right' }]}>{from[language]}</Text>
        </View>
        <View style={[styles.routeLine, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <View style={styles.endDot} />
          <Text style={[styles.routeType, { textAlign: rtl ? 'right' : 'left' }]}>{c.to}</Text>
          <Text style={[styles.routeCity, { textAlign: rtl ? 'left' : 'right' }]}>{to[language]}</Text>
        </View>
      </View>

      <View style={styles.mapCard}>
        <RouteMap pickup={pickup} dropoff={{ latitude: to.latitude, longitude: to.longitude }}
          pickupTitle={from[language]} dropoffTitle={to[language]} sameCity={booking.pickupCity === booking.dropoffCity} />
        <Text style={[styles.mapCaption, { textAlign: rtl ? 'right' : 'left' }]}>{c.mapCaption}</Text>
      </View>

      <Text style={[styles.section, { textAlign: rtl ? 'right' : 'left' }]}>{c.tracking}</Text>
      <View style={styles.timeline}>
        {statusFlow.map((stage, index) => <View key={stage} style={[styles.step, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <View style={[styles.stepCircle, index <= stageIndex && styles.stepActive]}>
            {index < stageIndex ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : <View style={[styles.innerDot, index <= stageIndex && { backgroundColor: '#FFFFFF' }]} />}
          </View>
          <Text style={[styles.stepText, index <= stageIndex && styles.stepTextActive, { textAlign: rtl ? 'right' : 'left' }]}>{c[stage]}</Text>
        </View>)}
      </View>
      <Text style={[styles.support, { textAlign: rtl ? 'right' : 'left' }]}>{c.support}</Text>
      <PrimaryButton title={booking.status === 'completed' ? c.doneDemo : c.nextDemo}
        onPress={advanceDemo} disabled={booking.status === 'completed'} muted />
    </ScrollView>
    <BottomBar active="activity" />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: palette.paper },
  content: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 30 },
  orderHead: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 10 },
  eyebrow: { fontSize: 12, fontWeight: '800', color: palette.secondary, marginBottom: 3 },
  orderId: { fontSize: 19, fontWeight: '900', color: palette.ink },
  statusPill: { backgroundColor: palette.olivePale, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 99 },
  statusText: { fontSize: 12, fontWeight: '800', color: palette.olive },
  routeCard: { backgroundColor: palette.card, padding: 17, borderRadius: 19, borderColor: palette.line, borderWidth: 1, marginBottom: 15, gap: 15 },
  routeLine: { alignItems: 'center', gap: 9 },
  startDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: palette.olive },
  endDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: palette.clay },
  routeType: { color: palette.secondary, fontSize: 13, flex: 1 },
  routeCity: { color: palette.ink, fontSize: 14, fontWeight: '800', flex: 2 },
  mapCard: { borderRadius: 20, overflow: 'hidden', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, marginBottom: 25 },
  mapCaption: { color: palette.secondary, fontSize: 12, lineHeight: 19, paddingHorizontal: 14, paddingVertical: 12 },
  section: { color: palette.ink, fontSize: 19, fontWeight: '900', marginBottom: 13 },
  timeline: { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, borderRadius: 20, padding: 17, marginBottom: 16, gap: 14 },
  step: { alignItems: 'center', gap: 12 },
  stepCircle: { width: 25, height: 25, borderRadius: 13, backgroundColor: palette.line, justifyContent: 'center', alignItems: 'center' },
  stepActive: { backgroundColor: palette.olive },
  innerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.secondary },
  stepText: { color: palette.secondary, fontSize: 14, fontWeight: '600' },
  stepTextActive: { color: palette.ink, fontWeight: '800' },
  support: { color: palette.secondary, fontSize: 12, lineHeight: 19, marginBottom: 14 },
  empty: { flex: 1, padding: 25, justifyContent: 'center', gap: 13 },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: palette.olivePale, justifyContent: 'center', alignItems: 'center', alignSelf: 'center' },
  emptyTitle: { color: palette.ink, textAlign: 'center', fontSize: 23, fontWeight: '900' },
  emptyText: { color: palette.secondary, textAlign: 'center', fontSize: 14, marginBottom: 10 },
});
