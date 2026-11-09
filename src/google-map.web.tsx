// Google web renderer (T12): reached only when a restricted, referrer-bound browser key is baked into the
// bundle (extra.googleMaps.web via app.config.js) and the user selected the Google mode. The Maps JS is
// fetched once per page and shared by every map instance; each instance owns its overlays and listeners and
// removes them all on unmount. Every failure — blocked SDK, no tiles, quota — lands on the diagram with
// Retry; MapLibre stays the default and the fallback, and Google geometry never reaches a MapLibre overlay.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { farJump, fitBounds, glideMs, routeFramePoints, turn } from './map-math';
import RoutePreview, { type PinMapProps, type RouteMapProps } from './route-preview';
import { mapReadyMs } from './runtime-config';
import { palette, shadow, useCopy } from './ui';
import { loadGoogleMaps } from './google-maps-loader';

// Referrer-restricted browser key: public by design, worthless off the licensed origins; the server's own
// route-key secret is a different credential and never appears in web code.
const BROWSER_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
type GMap = any; // the Maps JS is loaded at runtime; typing it fully would vendor Google's declarations for every build
type Listener = { remove(): void };

declare global { interface Window { google?: { maps?: any } } }

// One script per page: navigation unmounts maps, not the library. A failed load resets the promise so a
// retry can fetch again; an initialized SDK is reused by the shared loader.
function loadGoogle(): Promise<any> {
  return loadGoogleMaps(BROWSER_KEY ?? '');
}

/** SVG path symbols with the same shapes the other renderers draw: dots, square pin, no-entry, car arrow. */
const symbol = (path: string, color: string, opts: { rotation?: number } = {}) => ({
  path, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3,
  rotation: opts.rotation ?? 0,
});
const DOT = 'M 0 -9 A 9 9 0 1 1 -0.01 -9 Z'; // circle
const SQUARE = 'M -8 -8 L 8 -8 L 8 8 L -8 8 Z';
const NO_ENTRY = 'M 0 -11 A 11 11 0 1 1 -0.01 -11 Z M -7 -1.5 L 7 -1.5 L 7 1.5 L -7 1.5 Z';
const ARROW = 'M 0 -12 L 8 10 L 0 4 L -8 10 Z';

// The live camera: the car is centred at street level (Uber keeps it in the middle, not zoomed in and out).
const FOLLOW_ZOOM = 15;

/** Read live at each animation: the user can change the setting while the map is open. */
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export default function RouteMap(props: RouteMapProps) {
  const { pickup, dropoff, driver, height = 220 } = props;
  const { c, rtl } = useCopy();
  const host = useRef<View>(null);
  const state = useRef<{ map?: GMap; maps?: any; ls: Listener[]; road?: any; approach?: any; closed: any[];
    driver?: any; halo?: any; shown?: { latitude: number; longitude: number }; at?: number; rotation?: number; frame?: number; moved?: boolean }>(
    { ls: [], closed: [] });
  const [failed, setFailed] = useState(false);
  // A terminal failure goes to the provider boundary, which owns fallback and retry for this attempt.
  const reportFailure = useRef(props.onFail);
  useEffect(() => { reportFailure.current = props.onFail; });
  useEffect(() => { if (failed) reportFailure.current?.(); }, [failed]);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [moved, setMoved] = useState(false);
  const movedRef = useRef(false);
  const terminal = useRef(false);
  const points = routeFramePoints({ pickup, dropoff, driver, focus: props.focus, road: props.road, approach: props.approach });
  const roadKey = JSON.stringify([props.road, props.approach, props.stale]);
  const closedKey = (props.closed ?? []).map(p => `${p.latitude},${p.longitude}`).join('|');
  const driverKey = driver ? `${driver.latitude},${driver.longitude},${driver.heading},${driver.accuracy},${props.focus}` : '';
  const latest = useRef({ points, drawLines, drawClosed, drawDriver });
  useEffect(() => { latest.current = { points, drawLines, drawClosed, drawDriver }; });

  useEffect(() => {
    let disposed = false;
    terminal.current = false;
    loadGoogle().then(maps => {
      if (disposed || terminal.current || !host.current) return;
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;inset:0';
      (host.current as unknown as HTMLElement).appendChild(el);
      const map = new maps.Map(el, {
        center: { lat: pickup.latitude, lng: pickup.longitude }, zoom: 12,
        gestureHandling: 'cooperative', mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        clickableIcons: false, keyboardShortcuts: false,
      });
      const s = state.current;
      s.map = map; s.maps = maps; s.ls = []; s.closed = [];
      // Any user gesture (drag, wheel zoom, pinch) stops the camera following until Recenter.
      const stopFollow = () => { s.moved = movedRef.current = true; setMoved(true); };
      s.ls.push(map.addListener('dragstart', stopFollow));
      el.addEventListener('wheel', stopFollow, { passive: true });
      el.addEventListener('touchstart', stopFollow, { passive: true });
      s.ls.push({ remove: () => { el.removeEventListener('wheel', stopFollow); el.removeEventListener('touchstart', stopFollow); } });
      // Tiles drawn, not map constructed, is the readiness signal: a revoked key or exhausted quota never
      // draws tiles, and the deadline below turns that into the labelled fallback.
      const tiles = map.addListener('tilesloaded', () => { if (disposed || terminal.current) return; tiles.remove(); setReady(true); });
      s.ls.push(tiles);
      map.fitBounds(toBounds(maps, fitBounds(latest.current.points)));
      s.road = new maps.Polyline({ map, path: [], strokeColor: palette.forest, strokeOpacity: 0.85, strokeWeight: 4 });
      s.approach = new maps.Polyline({ map, path: [], strokeColor: palette.blue, strokeOpacity: 0.9, strokeWeight: 5 });
      s.halo = new maps.Circle({ map, center: toLng(maps, pickup), radius: 0, fillColor: palette.blue, fillOpacity: 0.12,
        strokeColor: palette.blue, strokeOpacity: 0.3, strokeWeight: 1, clickable: false });
      s.driver = new maps.Marker({ map, position: toLng(maps, pickup), clickable: false, icon: symbol(ARROW, palette.blue) });
      s.driver.setVisible(false);
      for (const [p, path, color] of [[pickup, DOT, palette.olive], [dropoff, SQUARE, palette.clay]] as const)
        new maps.Marker({ map, position: toLng(maps, p), clickable: false, icon: symbol(path, color) });
      latest.current.drawLines(); latest.current.drawClosed(); latest.current.drawDriver();
    }).catch(() => { if (!disposed) { terminal.current = true; setFailed(true); } });
    return () => {
      disposed = true;
      const s = state.current;
      if (s.frame) cancelAnimationFrame(s.frame);
      s.ls.forEach(l => l.remove());
      s.road?.setMap(null); s.approach?.setMap(null); s.halo?.setMap(null); s.driver?.setMap(null);
      s.closed.forEach(m => m.setMap(null));
      (s.map?.getDiv?.() as HTMLElement | undefined)?.remove();
      state.current = { ls: [], closed: [] }; // a retry builds a fresh map: no listener or overlay survives
    };
  }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ready || failed) return;
    const timer = setTimeout(() => { terminal.current = true; setFailed(true); }, mapReadyMs() + 5_000);
    return () => clearTimeout(timer);
  }, [ready, failed, attempt]);

  // The camera rides along until the user grabs the map, like the other renderers.
  useEffect(() => {
    const s = state.current;
    if (!s.map || moved) return;
    if (driver) {
      s.map.setZoom(FOLLOW_ZOOM);
      const still = reducedMotion();
      if (still) s.map.setCenter({ lat: driver.latitude, lng: driver.longitude });
      else s.map.panTo({ lat: driver.latitude, lng: driver.longitude });
    } else s.map.fitBounds(toBounds(s.maps, fitBounds(points)));
  }, [driverKey, roadKey, moved, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  function drawLines() {
    const s = state.current;
    if (!s.maps) return;
    s.road.setPath((props.road ?? []).map(([longitude, latitude]) => ({ lat: latitude, lng: longitude })));
    const shown = s.shown;
    s.approach.setPath(!driver || props.stale || !props.approach ? [] : [[shown?.longitude ?? null, shown?.latitude ?? null], ...props.approach]
      .filter((p): p is [number, number] => p[0] != null).map(([longitude, latitude]) => ({ lat: latitude, lng: longitude })));
  }

  function drawClosed() {
    const s = state.current;
    if (!s.maps) return;
    s.closed.forEach(m => m.setMap(null));
    s.closed = (props.closed ?? []).map(p => new s.maps.Marker({
      map: s.map, position: toLng(s.maps, p), clickable: false,
      icon: symbol(NO_ENTRY, palette.error),
    }));
  }

  // Driver motion mirrors the native renderers: glide each fix over its gap, turn the short way, snap across
  // the city, and fade with the fix age (the stale halo stays, the stale approach line goes).
  function drawDriver() {
    const s = state.current;
    if (!s.maps) return;
    if (s.frame) cancelAnimationFrame(s.frame);
    if (!driver) { s.driver.setVisible(false); s.halo.setCenter(toLng(s.maps, pickup)); s.halo.setRadius(0); s.shown = undefined; return; }
    const target = { latitude: driver.latitude, longitude: driver.longitude };
    const from = s.shown ?? target;
    const moving = Math.abs(from.latitude - target.latitude) + Math.abs(from.longitude - target.longitude) > 0.0001;
    const heading = driver.heading ?? (moving ? bearingOf(from, target) : null);
    const snap = farJump(from, target);
    const origin = snap ? target : from;
    const span = snap ? 0 : glideMs(s.at === undefined ? 0 : performance.now() - s.at);
    s.at = performance.now();
    const still = reducedMotion();
    const turnFrom = s.rotation ?? heading;
    const step = (t: number) => {
      const k = still ? 1 : Math.min(1, Math.max(0, span ? (t - s.at!) / span : 1));
      const lat = origin.latitude + (target.latitude - origin.latitude) * k;
      const lng = origin.longitude + (target.longitude - origin.longitude) * k;
      s.shown = { latitude: lat, longitude: lng };
      s.driver.setPosition({ lat, lng });
      s.driver.setVisible(true);
      s.driver.setOpacity(props.stale ? 0.45 : 1);
      if (heading != null) {
        s.rotation = turn(turnFrom ?? heading, heading, k === 1 ? 1 : (t - s.at!) / 500);
        s.driver.setIcon(symbol(ARROW, palette.blue, { rotation: s.rotation }));
      }
      s.halo.setCenter({ lat, lng });
      s.halo.setRadius(driver.accuracy ?? 0);
      s.halo.set('fillOpacity', props.stale ? 0.05 : 0.12);
      if (props.stale) s.approach.setPath([]); // no road left to follow behind a stale fix
      else latest.current.drawLines(); // keep the approach starting under the drawn car
      if (k < 1) s.frame = requestAnimationFrame(step);
      else s.frame = undefined;
    };
    s.frame = requestAnimationFrame(step);
  }

  useEffect(() => { drawLines(); }, [roadKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { drawClosed(); }, [closedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { drawDriver(); }, [driverKey, props.stale]); // eslint-disable-line react-hooks/exhaustive-deps

  function recenter() {
    const s = state.current;
    setMoved(false); movedRef.current = false; s.moved = false;
    // The moved-state effect performs exactly one camera operation.
  }

  // Only the map surface is the labelled image: a labelled container would hide Retry and Recenter from screen readers.
  return <View style={props.fill ? StyleSheet.absoluteFill : { height, width: '100%' }}>
    {!ready && !failed && <View style={[StyleSheet.absoluteFill, styles.placeholder]} pointerEvents="none"
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <RoutePreview {...props} plain />
    </View>}
    <View ref={host} style={StyleSheet.absoluteFill} accessible accessibilityRole="image"
      accessibilityLabel={`${c.routeOnMap}: ${props.pickupTitle} → ${props.dropoffTitle}${driver ? ` · ${props.driverTitle ?? ''}` : ''}`} />
    {failed && <View style={[StyleSheet.absoluteFill, styles.failure]}>
      <RoutePreview {...props} />
      <Pressable onPress={() => { setReady(false); setFailed(false); setMoved(false); movedRef.current = false; setAttempt(n => n + 1); }} accessibilityRole="button" style={styles.retry}>
        <Text>{c.retry}</Text>
      </Pressable>
    </View>}
    {ready && !failed && moved && <Pressable onPress={recenter} accessibilityRole="button" accessibilityLabel={c.recenter}
      style={[styles.recenter, rtl ? { left: 10 } : { right: 10 }, shadow]}>
      <Ionicons name="locate" size={20} color={palette.blue} />
    </Pressable>}
    {/* Google renders its own attribution and logo; nothing of theirs is redrawn or hidden here. */}
  </View>;
}

/** Fixed centre pin over a draggable Google map; reports the centre when the map stops moving. */
export function PinMap({ center, onChange, onGesture, onFail, onReady, height = 320 }: PinMapProps) {
  const { c } = useCopy();
  const host = useRef<View>(null);
  const callbacks = useRef({ onChange, onGesture, onFail, onReady });
  useEffect(() => { callbacks.current = { onChange, onGesture, onFail, onReady }; });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mapRef = useRef<GMap>(null);
  const centerRef = useRef(center);
  useEffect(() => { centerRef.current = center; });
  useEffect(() => {
    let disposed = false;
    let broken = false;
    let cleanup: (() => void) | undefined;
    const hostElement = host.current;
    const fail = () => {
      if (disposed || broken) return;
      broken = true;
      setFailed(true); callbacks.current.onFail?.();
    };
    const timer = setTimeout(fail, mapReadyMs() + 5_000);
    loadGoogle().then(maps => {
      if (disposed || broken || !hostElement) return;
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;inset:0';
      (hostElement as unknown as HTMLElement).appendChild(el);
      const gesture = () => { if (!disposed && !broken) callbacks.current.onGesture?.(); };
      el.addEventListener('pointerdown', gesture);
      el.addEventListener('wheel', gesture, { passive: true });
      const map = new maps.Map(el, {
        center: { lat: centerRef.current.latitude, lng: centerRef.current.longitude }, zoom: 16, gestureHandling: 'greedy',
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false,
      });
      const listeners = [map.addListener('idle', () => {
        if (disposed || broken) return;
        const p = map.getCenter();
        callbacks.current.onChange({ latitude: p.lat(), longitude: p.lng() });
      }), map.addListener('dragstart', () => { if (!disposed && !broken) callbacks.current.onGesture?.(); }),
      map.addListener('tilesloaded', () => { if (!disposed && !broken) { clearTimeout(timer); setReady(true); } })];
      mapRef.current = map;
      cleanup = () => { listeners.forEach(l => l.remove()); maps.event.clearInstanceListeners(map);
        el.removeEventListener('pointerdown', gesture); el.removeEventListener('wheel', gesture); el.remove(); mapRef.current = null; };
    }).catch(fail);
    return () => { disposed = true; clearTimeout(timer); cleanup?.(); };
  }, [attempt]);
  useEffect(() => {
    if (!ready) return;
    callbacks.current.onReady?.();
  }, [ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const p = map.getCenter();
    if (Math.abs(p.lat() - center.latitude) + Math.abs(p.lng() - center.longitude) > 0.000001)
      map.setCenter({ lat: center.latitude, lng: center.longitude });
  }, [center.latitude, center.longitude]);
  return <View style={{ height, width: '100%' }}>
    <View ref={host} style={StyleSheet.absoluteFill} />
    <View pointerEvents="none" style={[styles.pin, failed && { opacity: 0 }]}>
      <Ionicons name="location-sharp" size={44} color={palette.clay} />
    </View>
    {failed && <View style={[StyleSheet.absoluteFill, styles.failure]}>
      <Pressable onPress={() => { setReady(false); setFailed(false); setAttempt(n => n + 1); }} accessibilityRole="button" style={styles.retry}>
        <Text>{c.retry}</Text>
      </Pressable>
    </View>}
  </View>;
}

const toLng = (maps: any, p: { latitude: number; longitude: number }) => new maps.LatLng(p.latitude, p.longitude);
const toBounds = (maps: any, [[w, s], [e, n]]: [[number, number], [number, number]]) => {
  const bounds = new maps.LatLngBounds();
  bounds.extend(new maps.LatLng(s, w));
  bounds.extend(new maps.LatLng(n, e));
  return bounds;
};
// Local helpers over map-math: these take Point objects like map-math's bearing() and return signed degrees.
const bearingOf = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const rad = (d: number) => d * Math.PI / 180;
  const y = Math.sin(rad(b.longitude - a.longitude)) * Math.cos(rad(b.latitude));
  const x = Math.cos(rad(a.latitude)) * Math.sin(rad(b.latitude)) -
    Math.sin(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(rad(b.longitude - a.longitude));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

const styles = StyleSheet.create({
  placeholder: { justifyContent: 'center' },
  failure: { backgroundColor: palette.mapWash, justifyContent: 'center', alignItems: 'center' },
  recenter: { position: 'absolute', bottom: 34, width: 44, height: 44, borderRadius: 22, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center' },
  pin: { position: 'absolute', left: '50%', top: '50%', marginLeft: -22, marginTop: -42 },
  retry: { padding: 12, backgroundColor: palette.card, borderRadius: 12 },
});
