import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { PinMapProps, RouteMapProps } from './route-preview';
import { palette } from './ui';

export type { PinMapProps, RouteMapProps };
// iOS: Apple Maps, no key. Android uses route-map.android.tsx (no Google Maps key in the build).
export const canPin = true;

export default function RouteMap(props: RouteMapProps) {
  const { pickup, dropoff, pickupTitle, dropoffTitle, driver, driverTitle, focus, height = 220 } = props;
  const points = driver ? [driver, ...(focus === 'pickup' ? [pickup] : focus === 'dropoff' ? [dropoff] : [pickup, dropoff])] : [pickup, dropoff];
  const lats = points.map(p => p.latitude), lngs = points.map(p => p.longitude);
  const region = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max((Math.max(...lats) - Math.min(...lats)) * 1.6, 0.02),
    longitudeDelta: Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.6, 0.02),
  };
  return <MapView style={{ height, width: '100%' }} initialRegion={region} pitchEnabled={false} rotateEnabled={false}>
    {props.road
      ? <Polyline coordinates={props.road.map(([longitude, latitude]) => ({ latitude, longitude }))} strokeColor={palette.forest} strokeWidth={4} />
      : <Polyline coordinates={[pickup, dropoff]} strokeColor={palette.forest} strokeWidth={3} lineDashPattern={[8, 6]} />}
    <Marker coordinate={pickup} title={pickupTitle} pinColor="#34765A" />
    <Marker coordinate={dropoff} title={dropoffTitle} pinColor="#CB6845" />
    {driver && <Marker coordinate={driver} title={driverTitle} flat rotation={driver.heading ?? 0} anchor={{ x: 0.5, y: 0.5 }}>
      <Ionicons name={driver.heading != null ? 'navigate-circle' : 'ellipse'} size={34} color={palette.blue} />
    </Marker>}
  </MapView>;
}

export function PinMap({ center, onChange, height = 320 }: PinMapProps) {
  return <View style={{ height, width: '100%' }}>
    <MapView style={StyleSheet.absoluteFill} initialRegion={{ ...center, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
      pitchEnabled={false} rotateEnabled={false} onRegionChangeComplete={r => onChange({ latitude: r.latitude, longitude: r.longitude })} />
    <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -22, marginTop: -42 }}>
      <Ionicons name="location-sharp" size={44} color={palette.clay} />
    </View>
  </View>;
}
