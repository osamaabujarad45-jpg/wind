import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Circle, Marker, Polyline } from 'react-native-maps';
import { glider } from './map-math';
import { useReducedMotion } from './motion';
import type { PinMapProps, RouteMapProps } from './route-preview';
import { palette, shadow, useCopy } from './ui';

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
  // Follow the driver like web/Android: reframe on every fix until the user touches the map, then offer recenter.
  const view = useRef<MapView>(null);
  const [moved, setMoved] = useState(false);
  const still = useReducedMotion();
  const key = JSON.stringify(region);
  useEffect(() => { if (!moved) view.current?.animateToRegion(region, still ? 0 : 800); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const { c } = useCopy();
  return <View style={{ height, width: '100%' }}>
  <MapView ref={view} style={StyleSheet.absoluteFill} initialRegion={region} pitchEnabled={false} rotateEnabled={false} onTouchStart={() => setMoved(true)}>
    {/* Lines follow roads only (OSRM geometry); never a straight pickup→dropoff line. */}
    {props.road && <Polyline coordinates={props.road.map(([longitude, latitude]) => ({ latitude, longitude }))} strokeColor={palette.forest} strokeWidth={4} />}
    <Marker coordinate={pickup} title={pickupTitle} pinColor="#34765A" />
    <Marker coordinate={dropoff} title={dropoffTitle} pinColor="#CB6845" />
    {(props.closed ?? []).map(p => <Marker key={`${p.latitude},${p.longitude}`} coordinate={p} anchor={{ x: 0.5, y: 0.5 }}>
      <Ionicons name="remove-circle" size={24} color={palette.error} />
    </Marker>)}
    {/* Accuracy halo like web/Android: a coarse fix reads as "somewhere here", not a precise dot. */}
    {!!driver?.accuracy && <Circle center={driver} radius={driver.accuracy} fillColor={`${palette.blue}1F`} strokeColor={`${palette.blue}4D`} strokeWidth={1} />}
    {driver && <Car driver={driver} title={driverTitle} approach={props.approach} still={still} stale={!!props.stale} />}
  </MapView>
  {moved && <Pressable onPress={() => { setMoved(false); view.current?.animateToRegion(region, still ? 0 : 800); }}
    accessibilityRole="button" accessibilityLabel={c.recenter} style={[styles.recenter, shadow]}>
    <Ionicons name="locate" size={20} color={palette.blue} />
  </Pressable>}
  </View>;
}

// The driver marker glides to each fix over the gap between fixes, like web/Android: still moving when the next fix
// lands, no hop-and-wait. Driven from JS, not animateMarkerToCoordinate: on iOS that drops a request while one runs
// and truncates its duration to whole seconds. Own component so a frame re-renders the marker, not the map.
// ponytail: one setState per frame on one marker; Reanimated if low-end phones drop frames.
function Car({ driver, title, approach, still, stale }: { driver: NonNullable<RouteMapProps['driver']>; title?: string; approach: RouteMapProps['approach']; still: boolean; stale: boolean }) {
  const [glide] = useState(() => glider({ latitude: driver.latitude, longitude: driver.longitude, rotation: driver.heading ?? 0 }));
  const [pose, setPose] = useState(() => glide.frame(0).now);
  const [lineAt, setLineAt] = useState(pose); // the approach line's first point: the marker, redrawn ~10x/s like web/Android
  useEffect(() => {
    glide.fix(driver, Date.now(), still);
    let frame = 0, drawn = -Infinity;
    const step = () => {
      const t = Date.now(), { now, done } = glide.frame(t);
      setPose(now);
      if (done || t - drawn >= 100) { drawn = t; setLineAt(now); }
      if (!done) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [driver.latitude, driver.longitude, driver.heading, still]); // eslint-disable-line react-hooks/exhaustive-deps
  const line = useMemo(() => approach && [lineAt, ...approach.map(([longitude, latitude]) => ({ latitude, longitude }))], [approach, lineAt]);
  return <>
    {line && <Polyline coordinates={line} strokeColor={palette.blue} strokeWidth={5} />}
    <Marker coordinate={pose} title={title} flat rotation={pose.rotation} anchor={{ x: 0.5, y: 0.5 }} opacity={stale ? 0.45 : 1}>
      <Ionicons name={driver.heading != null ? 'navigate-circle' : 'ellipse'} size={34} color={palette.blue} />
    </Marker>
  </>;
}

const styles = StyleSheet.create({
  recenter: { position: 'absolute', bottom: 34, right: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center' },
});

export function PinMap({ center, onChange, height = 320 }: PinMapProps) {
  return <View style={{ height, width: '100%' }}>
    <MapView style={StyleSheet.absoluteFill} initialRegion={{ ...center, latitudeDelta: 0.01, longitudeDelta: 0.01 }} showsUserLocation
      pitchEnabled={false} rotateEnabled={false} onRegionChangeComplete={r => onChange({ latitude: r.latitude, longitude: r.longitude })} />
    <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -22, marginTop: -42 }}>
      <Ionicons name="location-sharp" size={44} color={palette.clay} />
    </View>
  </View>;
}
