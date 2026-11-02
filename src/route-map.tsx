// Web map (browser and iPhone home-screen app): MapLibre GL + OpenFreeMap vector tiles — OSM data, no key.
// The library is fetched on first use so screens without a map never pay for it; any failure shows the diagram.
// A Google-keyed build (extra.googleMaps.web) that the user opted into draws with google-map.web.tsx instead.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GoogleRouteMap, { PinMap as GooglePinMap } from './google-map.web';
import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, Marker } from 'maplibre-gl';
import { bearing, ease, farJump, fitBounds, glideMs, labelField, metersPerPixelAtCoordinate, routeFramePoints, turn } from './map-math';
import { MapProviderBoundary, type MapAttempt } from './map-provider-boundary';
import type { Point } from './model';
import RoutePreview, { type PinMapProps, type RouteMapProps } from './route-preview';
import { palette, shadow, useCopy } from './ui';

export type { PinMapProps, RouteMapProps };
export const canPin = true;
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
// Vendored ES modules (public/vendor, versioned path so immutable caching is safe). Loaded by the browser directly,
// not by Metro: the worker and the main thread then share one cached copy of maplibre-gl-shared.mjs.
export const MAPLIBRE = '/vendor/maplibre-6.12.0';
type Lib = typeof import('maplibre-gl');
let lib: Promise<Lib> | null = null;
function loadMap(): Promise<Lib> {
  if (!document.querySelector('link[data-maplibre]')) {
    const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `${MAPLIBRE}/maplibre-gl.css` });
    css.dataset.maplibre = '';
    document.head.appendChild(css);
  }
  // Fetch the files first: a failed module load stays in the browser's module map, so a retry would never request it
  // again, while a failed fetch simply runs again. The module script then reads them from the HTTP cache (immutable
  // vendor path). ponytail: a drop between the fetch and the script still needs a page reload; tiny window.
  return lib ??= Promise.all(['load.mjs', 'maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs'].map(async file => {
    const response = await fetch(`${MAPLIBRE}/${file}`);
    if (!response.ok) throw new Error(`maplibre ${file}: ${response.status}`);
    await response.arrayBuffer();
  })).then(() => new Promise<Lib>((resolve, reject) => {
    // A module script from our origin (the CSP forbids eval, so no runtime import()); load fires after it has run.
    const script = Object.assign(document.createElement('script'), { type: 'module', src: `${MAPLIBRE}/load.mjs` });
    script.onload = () => {
      const loaded = (globalThis as unknown as { maplibregl?: Lib }).maplibregl;
      if (loaded?.Map) resolve(loaded);
      else reject(new Error('maplibre module did not initialize'));
    };
    script.onerror = () => { script.remove(); reject(new Error('maplibre failed to load')); };
    document.head.appendChild(script);
  })).then(ml => {
    // Arabic shaping; fetched only when a right-to-left label is first drawn.
    ml.setRTLTextPlugin('/vendor/mapbox-gl-rtl-text.js', true).catch(() => undefined);
    return ml;
  }).catch(e => { lib = null; throw e; });
}

/** Creates a map in `host`, labels it in the app language, and reports failure if the style never loads. */
function useMap(host: React.RefObject<View | null>, points: Point[], language: 'ar' | 'en', { padding, picker }: { padding: number; picker?: boolean }, onReady: (map: MlMap, ml: Lib) => void) {
  const [attempt, setAttempt] = useState(0);
  // Tagged with the map it describes, so a retry or language change starts clean without resetting state in the effect.
  const run = `${language}:${attempt}`;
  const [result, setResult] = useState<{ run: string; map?: MlMap; failed?: boolean; loaded?: boolean }>();
  const { map = null, failed = false, loaded = false } = result?.run === run ? result : {};
  const first = useRef({ points, onReady, padding, picker });
  useEffect(() => { first.current = { points, onReady, padding, picker }; });
  useEffect(() => {
    let disposed = false, created: MlMap | undefined, container: HTMLElement | undefined, observer: ResizeObserver | undefined;
    let mapLoaded = false, baseTileLoaded = false, announcedReady = false, terminalFailure = false;
    const run = `${language}:${attempt}`;
    const patch = (value: { map?: MlMap; failed?: boolean; loaded?: boolean }) => {
      if (!disposed) setResult(previous => ({ ...(previous?.run === run && previous), run, ...value }));
    };
    const fail = () => { if (disposed || terminalFailure) return; terminalFailure = true; patch({ failed: true }); };
    // A parsed style is not yet a usable map: workers/tiles may still fail. Leave the host mounted so a slow load can recover.
    const timer = setTimeout(fail, 25_000);
    loadMap().then(ml => {
      if (disposed || terminalFailure || !host.current) return;
      // Our own node: MapLibre's `.maplibregl-map { position: relative }` would collapse a React Native Web view.
      container = document.createElement('div');
      container.style.cssText = 'position:absolute;inset:0';
      (host.current as unknown as HTMLElement).appendChild(container);
      created = new ml.Map({
        container, style: STYLE, bounds: fitBounds(first.current.points),
        fitBoundsOptions: { padding: first.current.padding, maxZoom: 15 }, attributionControl: { compact: true },
        // Embedded maps let the page scroll (two fingers / ctrl+wheel to move the map); the picker owns all gestures.
        cooperativeGestures: !first.current.picker, dragRotate: false, pitchWithRotate: false, maxZoom: 18,
      });
      created.touchZoomRotate.disableRotation();
      const announceReady = () => {
        if (disposed || terminalFailure || !mapLoaded || !baseTileLoaded || announcedReady) return;
        announcedReady = true;
        clearTimeout(timer);
        patch({ failed: false, loaded: true });
        container?.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
      };
      created.on('sourcedata', event => {
        if (event.source?.type === 'vector' && event.coord && event.tile?.state === 'loaded') { baseTileLoaded = true; announceReady(); }
      });
      created.once('load', () => { mapLoaded = true; announceReady(); });
      created.on('webglcontextlost', fail);
      // Parent sheets/cards can change size without a window resize.
      observer = new ResizeObserver(() => created?.resize());
      observer.observe(container);
      created.once('style.load', () => { // style parsed: draw now, tiles stream in after
        if (disposed) return;
        try {
          for (const layer of created!.getStyle().layers)
            if (layer.type === 'symbol' && JSON.stringify(layer.layout?.['text-field'] ?? '').includes('name'))
              created!.setLayoutProperty(layer.id, 'text-field', labelField(language) as ExpressionSpecification);
          first.current.onReady(created!, ml);
          patch({ map: created! });
        } catch { fail(); }
      });
    }).catch(fail);
    return () => { disposed = true; clearTimeout(timer); observer?.disconnect(); created?.remove(); container?.remove(); };
  }, [host, language, attempt]);
  useEffect(() => {
    if (!failed) return;
    const recover = () => setAttempt(n => n + 1);
    window.addEventListener('online', recover);
    return () => window.removeEventListener('online', recover);
  }, [failed]);
  return { map, failed, loaded, retry: () => setAttempt(n => n + 1) };
}

function dot(color: string, square = false) {
  const el = document.createElement('div');
  el.style.cssText = `width:18px;height:18px;border-radius:${square ? 5 : 9}px;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)`;
  return el;
}
// Closed checkpoint: a no-entry sign, the same everywhere drivers look.
function noEntry() {
  const el = document.createElement('div');
  el.innerHTML = `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="9.5" fill="${palette.error}" stroke="#fff" stroke-width="2"/><rect x="5.5" y="9.5" width="11" height="3" rx="1" fill="#fff"/></svg>`;
  el.style.cssText = 'width:22px;height:22px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))';
  return el;
}
function driverIcon(arrow: boolean) {
  const el = document.createElement('div');
  el.classList.add('driver-marker');
  el.innerHTML = `<svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true"><circle cx="19" cy="19" r="15" fill="${palette.blue}" stroke="#fff" stroke-width="3"/>${
    arrow ? '<path d="M19 9 L26 26 L19 22 L12 26 Z" fill="#fff"/>' : '<circle cx="19" cy="19" r="5" fill="#fff"/>'}</svg>`;
  el.style.cssText = 'width:38px;height:38px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.35))';
  return el;
}
// Accuracy halo radius in pixels for `meters` at every zoom (web-mercator metres per pixel halve per zoom level).
const halo = (meters: number, lat: number) => {
  const base = meters / metersPerPixelAtCoordinate(lat, 0); // MapLibre circles use CSS pixels, independent of display density.
  return ['interpolate', ['exponential', 2], ['zoom'], 0, base, 22, base * 2 ** 22];
};
// The live camera: the car is centred at street level (Uber keeps it in the middle, not zoomed in and out).
const FOLLOW_ZOOM = 15, FOLLOW_OFFSET: [number, number] = [0, -60];

// Pickup/dropoff can become exact after the first render (order loads, pins confirmed): rebuild the map then.
export default function RouteMap(props: RouteMapProps) {
  return <MapProviderBoundary platform="web" route={props} render={RouteAdapter} />;
}
function RouteAdapter({ route, attempt }: { route?: RouteMapProps; attempt: MapAttempt }) {
  const props = route!;
  const { pickup: a, dropoff: b } = props;
  const key = `${a.latitude},${a.longitude},${b.latitude},${b.longitude}:${attempt.key}`;
  return attempt.renderer === 'google' ? <GoogleRouteMap key={key} {...props} onFail={attempt.onFail} />
    : <LiveMap key={key} {...props} onFail={attempt.onFail} />;
}

function LiveMap(props: RouteMapProps) {
  const { pickup, dropoff, driver, height = 220 } = props;
  const { c, language } = useCopy();
  const host = useRef<View>(null);
  const markers = useRef<{ ml?: Lib; driver?: Marker; arrow?: boolean; shown?: Point; frame?: number; closed?: Marker[];
    at?: number; rotation?: number; approach?: [number, number][] | null; lineAt?: number; haloAt?: number; stale?: boolean; moved?: boolean }>({});
  const [moved, setMoved] = useState(false);
  const points = routeFramePoints(props);
  const failureCallback = useRef(props.onFail);
  useEffect(() => { failureCallback.current = props.onFail; });
  const padding = Math.round(Math.min(56, height / 5)); // markers clear of the edges without zooming a short map out
  const { map, failed, loaded, retry } = useMap(host, points, language, { padding }, (m, ml) => {
    // A retried or relabelled map is new: markers of the old one went with it, and its camera follows the route again.
    markers.current = { ml };
    setMoved(false);
    new ml.Marker({ element: dot(palette.olive) }).setLngLat([pickup.longitude, pickup.latitude]).addTo(m);
    new ml.Marker({ element: dot(palette.clay, true) }).setLngLat([dropoff.longitude, dropoff.latitude]).addTo(m);
    // Lines follow roads only (OSRM geometry); a straight pickup→dropoff line would cut through buildings.
    for (const [id, color] of [['road', palette.forest], ['approach', palette.blue]] as const) {
      m.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id, type: 'line', source: id, layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': color, 'line-width': id === 'road' ? 4 : 5, 'line-opacity': id === 'road' ? 0.85 : 0.9 } });
    }
    m.addSource('accuracy', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m.addLayer({ id: 'accuracy', type: 'circle', source: 'accuracy', paint: { 'circle-color': palette.blue, 'circle-opacity': 0.12, 'circle-stroke-color': palette.blue, 'circle-stroke-opacity': 0.3, 'circle-stroke-width': 1 } });
    m.on('dragstart', () => { markers.current.moved = true; setMoved(true); });
    m.on('zoomstart', e => { if ((e as { originalEvent?: unknown }).originalEvent) { markers.current.moved = true; setMoved(true); } });
  });

  // A terminal failure goes to the provider boundary, which owns fallback and retry for this attempt.
  useEffect(() => { if (failed) failureCallback.current?.(); }, [failed]);

  // Road lines arrive after the map (and the driver leg changes as the car moves).
  const { road, approach } = props;
  const lineKey = JSON.stringify([road, approach]); // every point: a reroute can keep its length and ends
  useEffect(() => {
    if (!map) return;
    const shown = markers.current.shown;
    markers.current.approach = approach;
    for (const [id, l] of [['road', road], ['approach', approach && shown ? [[shown.longitude, shown.latitude], ...approach] : approach]] as const)
      (map.getSource(id) as GeoJSONSource | undefined)?.setData(l
        ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: l } } : { type: 'FeatureCollection', features: [] });
  }, [map, lineKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const closedKey = (props.closed ?? []).map(p => `${p.latitude},${p.longitude}`).join('|');
  useEffect(() => {
    const state = markers.current;
    if (!map || !state.ml) return;
    state.closed?.forEach(m => m.remove());
    state.closed = (props.closed ?? []).map(p => new state.ml!.Marker({ element: noEntry() }).setLngLat([p.longitude, p.latitude]).addTo(map));
  }, [map, closedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Driver: glide from the shown position to each new fix over the gap between fixes, so the marker is still moving
  // when the next one lands (no hop-and-wait), turn smoothly, and keep the approach line starting under the marker.
  const heading = driver?.heading ?? null, accuracy = driver?.accuracy ?? null;
  const driverKey = driver ? `${driver.latitude},${driver.longitude},${heading},${accuracy},${props.focus}` : '';
  useEffect(() => {
    if (!map) return;
    const state = markers.current;
    if (state.frame) cancelAnimationFrame(state.frame);
    const source = map.getSource('accuracy') as GeoJSONSource | undefined;
    if (!driver) {
      state.driver?.remove(); state.driver = undefined; state.shown = undefined; state.at = undefined; state.rotation = undefined;
      source?.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    const target = { latitude: driver.latitude, longitude: driver.longitude };
    const from = state.shown;
    const moving = from && Math.abs(from.latitude - target.latitude) + Math.abs(from.longitude - target.longitude) > 0.0001;
    const rotation = heading ?? (moving ? bearing(from!, target) : null);
    if (!state.driver || state.arrow !== (rotation !== null)) {
      state.driver?.remove();
      state.driver = new state.ml!.Marker({ element: driverIcon(rotation !== null), rotationAlignment: 'map' })
        .setLngLat([(from ?? target).longitude, (from ?? target).latitude]).addTo(map);
      state.arrow = rotation !== null; state.rotation = undefined;
    }
    const turnFrom = state.rotation ?? rotation;
    if (accuracy != null) map.setPaintProperty('accuracy', 'circle-radius', halo(accuracy, target.latitude) as ExpressionSpecification);
    else source?.setData({ type: 'FeatureCollection', features: [] });
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const snap = !!from && farJump(from, target);
    const start = performance.now(), origin = snap ? target : from ?? target;
    const span = snap ? 0 : glideMs(state.at === undefined ? 0 : start - state.at);
    state.at = start;
    // The camera rides along with the car over the same span: the map never zooms or jumps between fixes.
    // A user gesture stops the camera, but it must not interrupt the marker's glide.
    if (!state.moved) map.easeTo({ center: [target.longitude, target.latitude], zoom: FOLLOW_ZOOM, offset: FOLLOW_OFFSET, duration: still ? 0 : span });
    const step = (t: number) => {
      const k = still ? 1 : (t - start) / span;
      const p = ease(origin, target, k);
      state.driver?.setLngLat([p.longitude, p.latitude]);
      if (rotation !== null) state.driver?.setRotation(state.rotation = turn(turnFrom ?? rotation, rotation, still ? 1 : (t - start) / 500));
      state.shown = p;
      const line = state.approach;
      if (line?.length && !state.stale && (k >= 1 || t - (state.lineAt ?? 0) > 100)) { // ~10 line redraws a second is smooth and cheap
        state.lineAt = t;
        (map.getSource('approach') as GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: [[p.longitude, p.latitude], ...line] } });
      }
      // The halo belongs to the drawn car, not to the raw fix: it must not jump ahead of the marker.
      if (accuracy != null && !state.stale && (k >= 1 || t - (state.haloAt ?? 0) > 100)) {
        state.haloAt = t;
        source?.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] }, properties: {} });
      }
      if (k < 1) state.frame = requestAnimationFrame(step);
    };
    state.frame = requestAnimationFrame(step);
    return () => { if (state.frame) cancelAnimationFrame(state.frame); };
  }, [map, driverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Faded while the fix is old; the marker element is rebuilt when the arrow appears, so set it on every change
  // of what it reads. A stale fix keeps its halo but loses the approach line: there is no road left to follow.
  useEffect(() => {
    const state = markers.current;
    state.stale = !!props.stale;
    state.moved = moved; // the camera stops following after a gesture, the marker does not
    const el = state.driver?.getElement();
    if (el) el.style.opacity = props.stale ? '0.45' : '';
    if (!map) return;
    map.setPaintProperty('accuracy', 'circle-opacity', props.stale ? 0.05 : 0.12);
    const approach = map.getSource('approach') as GeoJSONSource | undefined;
    if (!approach) return;
    const line = state.approach;
    const drawn = state.shown && line?.length ? [[state.shown.longitude, state.shown.latitude], ...line] : line;
    approach.setData(props.stale || !drawn?.length
      ? { type: 'FeatureCollection', features: [] }
      : { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: drawn } });
  }, [map, props.stale, lineKey, moved]);

  // Camera: with a driver it follows the car (above); without one it frames the two stops and the road between them.
  const frameKey = JSON.stringify(points);
  useEffect(() => {
    if (!map || moved || driver) return;
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const refit = (duration: number) => map.fitBounds(fitBounds(points), { padding, maxZoom: 16, duration });
    const resized = () => refit(0);
    refit(still ? 0 : 800);
    map.on('resize', resized);
    return () => { map.off('resize', resized); };
  }, [map, moved, frameKey, padding, driver]); // eslint-disable-line react-hooks/exhaustive-deps

  function recenter() {
    setMoved(false);
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (driver) map?.easeTo({ center: [driver.longitude, driver.latitude], zoom: FOLLOW_ZOOM, offset: FOLLOW_OFFSET, duration: still ? 0 : 600 });
    else map?.fitBounds(fitBounds(points), { padding, maxZoom: 16 });
  }

  return <View style={{ height, width: '100%' }} accessible accessibilityRole="image"
    accessibilityLabel={`${c.routeDiagram}: ${props.pickupTitle} → ${props.dropoffTitle}${driver ? ` · ${props.driverTitle ?? ''}` : ''}`}>
    {/* The diagram shows while the real map loads: never a blank box. It is decoration there: no words,
        no announcement, no gestures. Once the map is up it covers the placeholder. */}
    {!loaded && !failed && <View style={[StyleSheet.absoluteFill, styles.placeholder]} pointerEvents="none"
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <RoutePreview {...props} plain />
    </View>}
    <View ref={host} style={StyleSheet.absoluteFill} />
    {failed && <View style={[StyleSheet.absoluteFill, styles.failure]}>
      <RoutePreview {...props} />
      <Pressable onPress={retry} accessibilityRole="button" style={styles.retry}><Text>{c.retry}</Text></Pressable>
    </View>}
    {map && moved && <Pressable onPress={recenter} accessibilityRole="button" accessibilityLabel={c.recenter}
      style={[styles.recenter, shadow]}>
      <Ionicons name="locate" size={20} color={palette.blue} />
    </Pressable>}
  </View>;
}

/** Fixed centre pin over a draggable map; reports the centre when the map stops moving. */
export function PinMap(props: PinMapProps) {
  return <MapProviderBoundary platform="web" pin={props} render={PinAdapter} />;
}
function PinAdapter({ pin, attempt }: { pin?: PinMapProps; attempt: MapAttempt }) {
  const props = pin!;
  const guarded = { ...props, onReady: attempt.onReady, onFail: attempt.onFail,
    onChange: (point: PinMapProps['center']) => { if (attempt.current()) props.onChange(point); } };
  return attempt.renderer === 'google' ? <GooglePinMap key={attempt.key} {...guarded} /> : <MapLibrePin key={attempt.key} {...guarded} />;
}

function MapLibrePin({ center, onChange, onFail, onReady, height = 320 }: PinMapProps) {
  const { language } = useCopy();
  const host = useRef<View>(null);
  const callbacks = useRef({ onChange, onFail, onReady });
  useEffect(() => { callbacks.current = { onChange, onFail, onReady }; });
  const { map, failed, loaded, retry } = useMap(host, [center], language, { padding: 0, picker: true }, m => {
    m.jumpTo({ center: [center.longitude, center.latitude], zoom: 16 });
    m.on('moveend', () => { const p = m.getCenter(); callbacks.current.onChange({ latitude: p.lat, longitude: p.lng }); });
  });
  useEffect(() => { if (failed) callbacks.current.onFail?.(); }, [failed]);
  useEffect(() => { if (loaded && !failed) callbacks.current.onReady?.(); }, [loaded, failed]);
  useEffect(() => {
    if (!map) return;
    const p = map.getCenter();
    if (Math.abs(p.lat - center.latitude) + Math.abs(p.lng - center.longitude) > 0.000001)
      map.jumpTo({ center: [center.longitude, center.latitude] });
  }, [map, center.latitude, center.longitude]);
  const { c } = useCopy();
  return <View style={{ height, width: '100%' }}>
    <View ref={host} style={StyleSheet.absoluteFill} />
    <View pointerEvents="none" style={[styles.pin, failed && { opacity: 0 }]}>
      <Ionicons name="location-sharp" size={44} color={palette.clay} />
    </View>
    {failed && <View style={[StyleSheet.absoluteFill, styles.failure]}>
      <Pressable onPress={retry} accessibilityRole="button" style={styles.retry}><Text>{c.retry}</Text></Pressable>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  recenter: { position: 'absolute', bottom: 34, right: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center' },
  pin: { position: 'absolute', left: '50%', top: '50%', marginLeft: -22, marginTop: -42 },
  placeholder: { justifyContent: 'center' },
  failure: { backgroundColor: '#E6ECE3', justifyContent: 'center', alignItems: 'center' },
  retry: { padding: 12, backgroundColor: palette.card, borderRadius: 12 },
});
