import { StyleSheet, Text, View } from 'react-native';
import { palette } from './ui';

type Props = {
  pickup: { latitude: number; longitude: number };
  dropoff: { latitude: number; longitude: number };
  pickupTitle: string;
  dropoffTitle: string;
  sameCity: boolean;
};

export default function RoutePreview({ pickupTitle, dropoffTitle }: Props) {
  return <View style={styles.preview}>
    <View style={styles.route}><View style={styles.dot} /><View style={styles.line} /><View style={[styles.dot, { backgroundColor: palette.clay }]} /></View>
    <View style={styles.labels}><Text style={styles.city}>{pickupTitle}</Text><Text style={styles.city}>{dropoffTitle}</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  preview: { height: 200, backgroundColor: palette.olivePale, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  route: { alignItems: 'center', height: 100 },
  dot: { width: 13, height: 13, borderRadius: 7, backgroundColor: palette.olive },
  line: { width: 2, flex: 1, backgroundColor: palette.olive, opacity: 0.45 },
  labels: { height: 105, justifyContent: 'space-between' },
  city: { fontSize: 17, color: palette.ink, fontWeight: '800' },
});
