// Google native renderer (T10 Android, T11 iOS): reached only when a restricted key is baked into this
// binary (extra.googleMaps via app.config.js) and the user selected the Google mode. Same visual contract
// as the baseline renderers — pins, gliding driver, road/approach lines, no-entry markers, follow camera,
// diagram-with-Retry on failure — but readiness waits for loaded tiles, not map initialization.
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useReducedMotion } from './motion';
import RoutePreview, { type PinMapProps, type RouteMapProps } from './route-preview';
import { Car } from './route-map.native';
import { palette, shadow, useCopy } from './ui';

export type { PinMapProps, RouteMapProps };
export const canPin = true;
// The live camera: the car is centred at street level (Uber keeps it in the middle, not zoomed in and out).
const FOLLOW_DELTA = 0.012;

export default function RouteMap(props: RouteMapProps) {
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
  const view = useRef<MapView>(null);
  const [moved, setMoved] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // A terminal failure goes to the provider boundary, which owns fallback and retry for this attempt.
  const reportFailure = useRef(props.onFail);
  useEffect(() => { reportFailure.current = props.onFail; });
  useEffect(() => { if (failed) reportFailure.current?.(); }, [failed]);
  const [attempt, setAttempt] = useState(0);
  const still = useReducedMotion();
  const key = JSON.stringify(region);
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
  // Tiles loaded, not map initialized, are the readiness signal: Google can initialize and still never
  // draw a tile (missing/revoked key, quota). A map that never loads tiles shows the diagram with a Retry.
  useEffect(() => {
    if (ready || failed) return;
    const timer = setTimeout(() => setFailed(true), 25_000);
    return () => clearTimeout(timer);
  }, [ready, failed, attempt]);
  // A provider failure unmounts the map: its overlays go with it, and no Google content lingers anywhere.
  if (failed) return <View style={{ height, width: '100%' }}>
    <RoutePreview {...props} />
    <View style={[StyleSheet.absoluteFill, styles.cover]}>
      <Pressable onPress={() => { setFailed(false); setMoved(false); setAttempt(n => n + 1); }} accessibilityRole="button" style={styles.retry}>
        <Text>{c.retry}</Text>
      </Pressable>
    </View>
  </View>;
  return <View style={{ height, width: '100%' }}>
  <MapView key={attempt} ref={view} style={StyleSheet.absoluteFill} provider={PROVIDER_GOOGLE} initialRegion={region} pitchEnabled={false} rotateEnabled={false}
    onMapLoaded={() => setReady(true)} onPanDrag={() => setMoved(true)}
    onRegionChangeComplete={r => { if (driver && Math.abs(r.latitude - driver.latitude) + Math.abs(r.longitude - driver.longitude) > 0.004) setMoved(true); }}>
    {/* Lines follow roads only (provider geometry); never a straight pickup→dropoff line. */}
    {props.road && <Polyline coordinates={props.road.map(([longitude, latitude]) => ({ latitude, longitude }))} strokeColor={palette.forest} strokeWidth={4} />}
    <Marker coordinate={pickup} title={pickupTitle} pinColor="#34765A" />
    <Marker coordinate={dropoff} title={dropoffTitle} pinColor="#CB6845" />
    {(props.closed ?? []).map(p => <Marker key={`${p.latitude},${p.longitude}`} coordinate={p} anchor={{ x: 0.5, y: 0.5 }}>
      <Ionicons name="remove-circle" size={24} color={palette.error} />
    </Marker>)}
    {driver && <Car driver={driver} title={driverTitle} approach={props.approach} still={still} stale={!!props.stale} />}
  </MapView>
  {moved && <Pressable onPress={() => setMoved(false)}
    accessibilityRole="button" accessibilityLabel={c.recenter} style={[styles.recenter, shadow]}>
    <Ionicons name="locate" size={20} color={palette.blue} />
  </Pressable>}
  </View>;
}

/** Fixed centre pin over a draggable Google map; reports the centre when the map stops moving. */
export function PinMap({ center, onChange, onFail, onReady, height = 320 }: PinMapProps) {
  const { c } = useCopy();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const callbacks = useRef({ onFail, onReady, onChange });
  useEffect(() => { callbacks.current = { onFail, onReady, onChange }; });
  // The sheet offers no pin to confirm until the tiles are actually drawn; a map that never loads says so.
  useEffect(() => {
    if (ready) { callbacks.current.onReady?.(); return; }
    const timer = setTimeout(() => { setFailed(true); callbacks.current.onFail?.(); }, 25_000);
    return () => clearTimeout(timer);
  }, [ready, attempt]);
  if (failed) return <View style={{ height, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6ECE3' }}>
    <Pressable onPress={() => { setFailed(false); setAttempt(n => n + 1); }} accessibilityRole="button" style={styles.retry}>
      <Text>{c.retry}</Text>
    </Pressable>
  </View>;
  return <View style={{ height, width: '100%' }}>
    <MapView key={attempt} style={StyleSheet.absoluteFill} provider={PROVIDER_GOOGLE}
      initialRegion={{ ...center, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
      pitchEnabled={false} rotateEnabled={false} onMapLoaded={() => setReady(true)}
      onRegionChangeComplete={r => callbacks.current.onChange({ latitude: r.latitude, longitude: r.longitude })} />
    <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -22, marginTop: -42 }}>
      <Ionicons name="location-sharp" size={44} color={palette.clay} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  recenter: { position: 'absolute', bottom: 34, right: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center' },
  cover: { alignItems: 'center', justifyContent: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: palette.card, borderRadius: 12 },
});
