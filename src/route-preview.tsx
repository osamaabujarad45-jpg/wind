import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Point } from './model';
import { palette } from './ui';

export type RouteMapProps = {
  pickup: Point; dropoff: Point; pickupTitle: string; dropoffTitle: string;
  driver?: Point | null; driverTitle?: string;
};

// Map-free route card: web, and Android builds without a Maps key.
export default function RoutePreview({ pickupTitle, dropoffTitle, driver, driverTitle }: RouteMapProps) {
  return <View style={styles.preview}>
    <View style={styles.route}><View style={styles.dot} /><View style={styles.line} /><View style={[styles.dot, { backgroundColor: palette.clay }]} /></View>
    <View style={styles.labels}>
      <Text style={styles.city}>{pickupTitle}</Text>
      {driver && <View style={styles.driver}><Ionicons name="car" size={16} color={palette.blue} /><Text style={styles.driverText}>{driverTitle}</Text></View>}
      <Text style={styles.city}>{dropoffTitle}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  preview: { height: 180, backgroundColor: palette.olivePale, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  route: { alignItems: 'center', height: 110 },
  dot: { width: 13, height: 13, borderRadius: 7, backgroundColor: palette.olive },
  line: { width: 2, flex: 1, backgroundColor: palette.olive, opacity: 0.45 },
  labels: { height: 115, justifyContent: 'space-between' },
  city: { fontSize: 17, color: palette.ink, fontWeight: '800' },
  driver: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  driverText: { fontSize: 13, color: palette.blue, fontWeight: '800' },
});
