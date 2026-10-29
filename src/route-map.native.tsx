import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Circle, Marker, Polyline } from 'react-native-maps';
import { bearing, glider } from './map-math';
import GoogleRouteMap, { PinMap as GooglePinMap } from './google-map.native';
import { selectRenderer } from './map-provider';
import { useMapMode } from './map-mode';
import { useReducedMotion } from './motion';
import RoutePreview, { type PinMapProps, type RouteMapProps } from './route-preview';
import { palette, shadow, useCopy } from './ui';

export type { PinMapProps, RouteMapProps };
// iOS: Apple Maps is the baseline (no key). When this binary was built with a restricted Google key
// (extra.googleMaps.ios) and the user selected the Google mode, the shared native Google renderer draws.
export const canPin = true;
// The live camera: the car is centred at street level (Uber keeps it in the middle, not zoomed in and out).
const FOLLOW_DELTA = 0.012; // about 1.3 km across the screen

export default function RouteMap(props: RouteMapProps) {
  const { pickup, dropoff } = props;
  const [mode] = useMapMode();
  if (selectRenderer('ios', Constants.expoConfig?.extra?.googleMaps, mode) === 'google')
    return <GoogleRouteMap key={`${pickup.latitude},${pickup.longitude},${dropoff.latitude},${dropoff.longitude}`} {...props} />;
  return <AppleRouteMap {...props} />;
}

function AppleRouteMap(props: RouteMapProps) {
  const { pickup, dropoff, pickupTitle, dropoffTitle, driver, driverTitle, focus, height = 220 } = props;
  const { c } = useCopy();
  const stops = focus === 'pickup' ? [pickup] : focus === 'dropoff' ? [dropoff] : [pickup, dropoff];
  const points = driver ? [driver, ...stops] : stops;
  const lats = points.map(p => p.latitude), lngs = points.map(p => p.longitude);
  const region = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max((Math.max(...lats) - Math.min(...lats)) * 1.6, 0.02),
    longitudeDelta: Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.6, 0.02),
  };
  // Follow the driver like web/Android: the camera rides with the car until the user touches the map, then recenter.
  const view = useRef<MapView>(null);
  const [moved, setMoved] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const still = useReducedMotion();
  const key = JSON.stringify(region);
  // ponytail: a pan stops the follow camera; a pinch does not, because iOS reports the *fitted* region and no
  // zoom comparison can tell the app's own animation from the user's. The next fix zooms back, like before.
  useEffect(() => { if (!moved && !driver && !failed) view.current?.animateToRegion(region, still ? 0 : 800); }, [key, moved, driver, failed, still]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!driver || moved || failed) return;
    view.current?.animateToRegion({ latitude: driver.latitude, longitude: driver.longitude,
      latitudeDelta: FOLLOW_DELTA, longitudeDelta: FOLLOW_DELTA }, still ? 0 : 800);
  }, [driver?.latitude, driver?.longitude, moved, failed, still]); // eslint-disable-line react-hooks/exhaustive-deps
  // Returning to the foreground after a tunnel outage retries a failed map once, like web's online recovery.
  useEffect(() => {
    if (!failed) return;
    const sub = AppState.addEventListener('change', state => { if (state === 'active') { setFailed(false); setMoved(false); setAttempt(n => n + 1); } });
    return () => sub.remove();
  }, [failed]);
  // A map that never becomes usable shows the diagram with a Retry, like web and Android (never a blank box).
  useEffect(() => {
    if (ready || failed) return;
    const timer = setTimeout(() => setFailed(true), 20_000);
    return () => clearTimeout(timer);
  }, [ready, failed, attempt]);
  if (failed) return <View style={{ height, width: '100%' }}>
    <RoutePreview {...props} />
    <View style={[StyleSheet.absoluteFill, styles.cover]}>
      <Pressable onPress={() => { setFailed(false); setMoved(false); setAttempt(n => n + 1); }} accessibilityRole="button" style={styles.retry}>
        <Text>{c.retry}</Text>
      </Pressable>
    </View>
  </View>;
  return <View style={{ height, width: '100%' }}>
  <MapView key={attempt} ref={view} style={StyleSheet.absoluteFill} initialRegion={region} pitchEnabled={false} rotateEnabled={false}
    onMapReady={() => setReady(true)} onPanDrag={() => setMoved(true)}
    onRegionChangeComplete={r => { if (driver && Math.abs(r.latitude - driver.latitude) + Math.abs(r.longitude - driver.longitude) > 0.004) setMoved(true); }}>
    {/* Lines follow roads only (OSRM geometry); never a straight pickup→dropoff line. */}
    {props.road && <Polyline coordinates={props.road.map(([longitude, latitude]) => ({ latitude, longitude }))} strokeColor={palette.forest} strokeWidth={4} />}
    <Marker coordinate={pickup} title={pickupTitle} pinColor="#34765A" />
    <Marker coordinate={dropoff} title={dropoffTitle} pinColor="#CB6845" />
    {(props.closed ?? []).map(p => <Marker key={`${p.latitude},${p.longitude}`} coordinate={p} anchor={{ x: 0.5, y: 0.5 }}>
      <Ionicons name="remove-circle" size={24} color={palette.error} />
    </Marker>)}
    {driver && <Car driver={driver} title={driverTitle} approach={props.approach} still={still} stale={!!props.stale} />}
  </MapView>
  {/* The recenter button only clears the gesture: the follow effect then animates the camera (one animation, not two). */}
  {moved && <Pressable onPress={() => setMoved(false)}
    accessibilityRole="button" accessibilityLabel={c.recenter} style={[styles.recenter, shadow]}>
    <Ionicons name="locate" size={20} color={palette.blue} />
  </Pressable>}
  </View>;
}

// The driver marker glides to each fix over the gap between fixes, like web/Android: still moving when the next fix
// lands, no hop-and-wait. Driven from JS, not animateMarkerToCoordinate: on iOS that drops a request while one runs
// and truncates its duration to whole seconds. Own component so a frame re-renders the marker, not the map.
// Exported for the Google renderer (google-map.native.tsx): marker motion is provider-agnostic.
export function Car({ driver, title, approach, still, stale }: { driver: NonNullable<RouteMapProps['driver']>; title?: string; approach: RouteMapProps['approach']; still: boolean; stale: boolean }) {
  const [glide] = useState(() => glider({ latitude: driver.latitude, longitude: driver.longitude, rotation: driver.heading ?? 0 }));
  const [pose, setPose] = useState(() => glide.frame(0).now);
  const [lineAt, setLineAt] = useState(pose); // the approach line's first point: the marker, redrawn ~10x/s like web/Android
  const [heading, setHeading] = useState<number | null>(driver.heading ?? null);
  const previous = useRef({ latitude: driver.latitude, longitude: driver.longitude });
  useEffect(() => {
    // A device that reports no heading still moves: the direction of travel is the bearing between the two fixes.
    const moved = Math.abs(previous.current.latitude - driver.latitude) + Math.abs(previous.current.longitude - driver.longitude) > 0.0001;
    const direction = driver.heading ?? (moved ? bearing(previous.current, driver) : null);
    previous.current = { latitude: driver.latitude, longitude: driver.longitude };
    setHeading(direction);
    glide.fix({ ...driver, heading: direction }, Date.now(), still);
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
  const line = useMemo(() => approach && !stale && [lineAt, ...approach.map(([longitude, latitude]) => ({ latitude, longitude }))], [approach, lineAt, stale]);
  return <>
    {line && <Polyline coordinates={line} strokeColor={palette.blue} strokeWidth={5} />}
    {/* The halo belongs to the drawn car, not to the raw fix, and fades with it when the signal is lost. */}
    {!!driver.accuracy && <Circle center={lineAt} radius={driver.accuracy}
      fillColor={`${palette.blue}${stale ? '0D' : '1F'}`} strokeColor={`${palette.blue}${stale ? '26' : '4D'}`} strokeWidth={1} />}
    <Marker coordinate={pose} title={title} flat rotation={pose.rotation} anchor={{ x: 0.5, y: 0.5 }} opacity={stale ? 0.45 : 1}>
      <Ionicons name={heading != null ? 'navigate-circle' : 'ellipse'} size={34} color={palette.blue} />
    </Marker>
  </>;
}

const styles = StyleSheet.create({
  recenter: { position: 'absolute', bottom: 34, right: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center' },
  cover: { alignItems: 'center', justifyContent: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: palette.card, borderRadius: 12 },
});

export function PinMap(props: PinMapProps) {
  const [mode] = useMapMode();
  if (selectRenderer('ios', Constants.expoConfig?.extra?.googleMaps, mode) === 'google') return <GooglePinMap {...props} />;
  return <ApplePin {...props} />;
}

function ApplePin({ center, onChange, onFail, onReady, height = 320 }: PinMapProps) {
  const { c } = useCopy();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The callbacks are inline arrows: they change every render, so they are kept in a ref and the timer
  // below depends on the map's state only, not on their identity.
  const callbacks = useRef({ onFail, onReady });
  useEffect(() => { callbacks.current = { onFail, onReady }; });
  // The sheet offers no pin to confirm until the map says it is ready; a map that never loads says so.
  useEffect(() => {
    if (ready) { callbacks.current.onReady?.(); return; }
    const timer = setTimeout(() => { setFailed(true); callbacks.current.onFail?.(); }, 20_000);
    return () => clearTimeout(timer);
  }, [ready, attempt]);
  if (failed) return <View style={{ height, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6ECE3' }}>
    <Pressable onPress={() => { setFailed(false); setAttempt(n => n + 1); }} accessibilityRole="button" style={styles.retry}>
      <Text>{c.retry}</Text>
    </Pressable>
  </View>;
  return <View style={{ height, width: '100%' }}>
    <MapView key={attempt} style={StyleSheet.absoluteFill} initialRegion={{ ...center, latitudeDelta: 0.01, longitudeDelta: 0.01 }} showsUserLocation
      pitchEnabled={false} rotateEnabled={false} onMapReady={() => setReady(true)} onRegionChangeComplete={r => onChange({ latitude: r.latitude, longitude: r.longitude })} />
    <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -22, marginTop: -42 }}>
      <Ionicons name="location-sharp" size={44} color={palette.clay} />
    </View>
  </View>;
}
