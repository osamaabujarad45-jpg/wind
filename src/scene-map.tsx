// The baseline map (MapLibre + OpenFreeMap, public/map.html) as the screens use it. One SceneMap can change between a plain
// map, a centre pin and a drawn trip without reloading, so a booking keeps one map from search to request.
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MAP_GROUND, MapPage } from './map-page';
import type { Point } from './model';
import { useReducedMotion } from './motion';
import RoutePreview, { type MapInsets, type PinMapProps, type RouteMapProps, type UserDot } from './route-preview';
import { palette, useCopy } from './ui';

export type SceneMapProps = {
  mode: 'browse' | 'pin' | 'route';
  center?: Point | null; zoom?: number;
  pickup?: Point | null; dropoff?: Point | null;
  driver?: RouteMapProps['driver']; road?: RouteMapProps['road']; approach?: RouteMapProps['approach']; closed?: RouteMapProps['closed'];
  focus?: RouteMapProps['focus']; stale?: boolean; follow?: boolean;
  user?: UserDot | null; insets?: MapInsets; labels?: { pickup?: string; dropoff?: string } | null; eta?: string | null;
  label?: string; height?: number; fill?: boolean;
  /** Margin kept around framed stops, in points. */
  padding?: number;
  onCenter?: (point: Point) => void; onGesture?: () => void; onMoving?: () => void; onReady?: () => void; onFail?: () => void;
  /** What a failed map shows behind Retry; a plain panel when absent. */
  fallback?: React.ReactNode;
};

export function SceneMap(props: SceneMapProps) {
  const { mode, height = 220, fill, center, zoom, pickup, dropoff, driver, road, approach, closed, focus, stale, follow, user, insets, labels, eta, label } = props;
  const { c, language } = useCopy();
  const still = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [drawn, setDrawn] = useState<string | null>(null);
  const run = `${language}:${attempt}`;
  if (failed) return <View style={fill ? StyleSheet.absoluteFill : { height, width: '100%' }}>
    {props.fallback ?? <View style={[StyleSheet.absoluteFill, { backgroundColor: MAP_GROUND }]} />}
    <View style={[StyleSheet.absoluteFill, styles.cover]}>
      <Pressable onPress={() => { setFailed(false); setAttempt(n => n + 1); }} accessibilityRole="button" style={styles.retry}><Text>{c.retry}</Text></Pressable>
    </View>
  </View>;
  const liveDriver = driver ? { latitude: driver.latitude, longitude: driver.longitude, heading: driver.heading ?? null, accuracy: driver.accuracy ?? null } : null;
  const dot = user ? { latitude: user.latitude, longitude: user.longitude, accuracy: user.accuracy ?? null } : null;
  const config = { mode, language, still, center, zoom, pickup, dropoff, driver: liveDriver, user: dot, insets, recenter: c.recenter,
    padding: props.padding ?? (fill ? 56 : Math.round(Math.min(56, height / 5))) }; // markers clear of the edges without zooming a short map out
  const update = { mode, ...(center && { center, zoom }), ...(mode === 'route' && pickup && dropoff ? { pickup, dropoff } : {}), driver: liveDriver, road: road ?? null, approach: approach ?? null,
    closed: closed ?? [], focus, stale: !!stale, follow: !!follow, user: dot, ...(insets && { insets }), labels: labels ?? null, eta: eta ?? null, ...(label && { label }) };
  return <View style={fill ? StyleSheet.absoluteFill : { height, width: '100%' }}>
    {/* Never a blank box while the page loads over a slow connection. */}
    {drawn !== run && <View style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: MAP_GROUND }]} pointerEvents="none"
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <ActivityIndicator color={palette.olive} />
    </View>}
    <MapPage key={run} config={config} update={update} height={height} fill onCenter={props.onCenter} onGesture={props.onGesture} onMoving={props.onMoving}
      onReady={() => { setDrawn(run); props.onReady?.(); }} onFail={() => { setFailed(true); props.onFail?.(); }} />
  </View>;
}

/** A trip with the road, the driver and the stops. Pickup/dropoff can become exact after the first render. */
export function BaselineRoute(props: RouteMapProps) {
  const { c } = useCopy();
  const { pickup, dropoff, driver } = props;
  return <SceneMap mode="route" pickup={pickup} dropoff={dropoff} driver={driver} road={props.road} approach={props.approach} closed={props.closed} focus={props.focus}
    stale={props.stale} follow={props.follow} height={props.height} fill={props.fill} insets={props.insets} user={props.user} eta={props.eta} labels={props.stopLabels} padding={props.padding}
    label={`${c.routeOnMap}: ${props.pickupTitle} → ${props.dropoffTitle}${driver ? ` · ${props.driverTitle ?? ''}` : ''}`} onFail={props.onFail}
    fallback={<RoutePreview {...props} />} />;
}

/** Fixed centre pin over a draggable map; reports the centre when the map stops moving. */
export function BaselinePin({ center, onChange, onGesture, onMoving, onFail, onReady, height = 320, fill, insets, user }: PinMapProps) {
  // The sheet offers no pin to confirm until the map says it is ready again.
  return <SceneMap mode="pin" center={center} height={height} fill={fill} insets={insets} user={user} onCenter={onChange} onGesture={onGesture} onMoving={onMoving} onReady={onReady} onFail={onFail} />;
}

const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: palette.card, borderRadius: 12 },
});
