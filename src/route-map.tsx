// Web map (browser and iPhone home-screen app): MapLibre GL + OpenFreeMap vector tiles — OSM data, no key.
// The library is fetched on first use so screens without a map never pay for it; any failure shows the diagram.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, Marker } from 'maplibre-gl';
import { bearing, ease, fitBounds, labelField } from './map-math';
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
const nativeImport = new Function('url', 'return import(url)') as (url: string) => Promise<Lib>;
let lib: Promise<Lib> | null = null;
function loadMap(): Promise<Lib> {
  if (!document.querySelector('link[data-maplibre]')) {
    const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `${MAPLIBRE}/maplibre-gl.css` });
    css.dataset.maplibre = '';
    document.head.appendChild(css);
  }
  return lib ??= nativeImport(`${MAPLIBRE}/maplibre-gl.mjs`).then(ml => {
    // Arabic shaping; fetched only when a right-to-left label is first drawn.
    ml.setRTLTextPlugin('/vendor/mapbox-gl-rtl-text.js', true).catch(() => undefined);
    return ml;
  }).catch(e => { lib = null; throw e; });
}

/** Creates a map in `host`, labels it in the app language, and reports failure if the style never loads. */
function useMap(host: React.RefObject<View | null>, points: Point[], language: 'ar' | 'en', { padding, picker }: { padding: number; picker?: boolean }, onReady: (map: MlMap, ml: Lib) => void) {
  const [failed, setFailed] = useState(false);
  const [map, setMap] = useState<MlMap | null>(null);
  const first = useRef({ points, onReady, padding, picker });
  useEffect(() => {
    let disposed = false, ready = false, created: MlMap | undefined, container: HTMLElement | undefined;
    const timer = setTimeout(() => { if (!ready) setFailed(true); }, 12_000); // style never arrived: blocked or offline
    loadMap().then(ml => {
      if (disposed || !host.current) return;
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
      created.once('style.load', () => { // style parsed: draw now, tiles stream in after
        if (disposed) return;
        ready = true;
        for (const layer of created!.getStyle().layers)
          if (layer.type === 'symbol' && JSON.stringify(layer.layout?.['text-field'] ?? '').includes('name'))
            created!.setLayoutProperty(layer.id, 'text-field', labelField(language) as ExpressionSpecification);
        created!.once('load', () => container?.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show')); // (i) button; credits one tap away
        first.current.onReady(created!, ml);
        setMap(created!);
      });
    }, () => { if (!disposed) setFailed(true); });
    return () => { disposed = true; clearTimeout(timer); created?.remove(); container?.remove(); };
  }, [host, language]);
  return { map, failed };
}

function dot(color: string, square = false) {
  const el = document.createElement('div');
  el.style.cssText = `width:18px;height:18px;border-radius:${square ? 5 : 9}px;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)`;
  return el;
}
function driverIcon(arrow: boolean) {
  const el = document.createElement('div');
  el.innerHTML = `<svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true"><circle cx="19" cy="19" r="15" fill="${palette.blue}" stroke="#fff" stroke-width="3"/>${
    arrow ? '<path d="M19 9 L26 26 L19 22 L12 26 Z" fill="#fff"/>' : '<circle cx="19" cy="19" r="5" fill="#fff"/>'}</svg>`;
  el.style.cssText = 'width:38px;height:38px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.35))';
  return el;
}
// Accuracy halo radius in pixels for `meters` at every zoom (web-mercator metres per pixel halve per zoom level).
const halo = (meters: number, lat: number) => {
  const base = meters / (156543.03 * Math.cos(lat * Math.PI / 180));
  return ['interpolate', ['exponential', 2], ['zoom'], 0, base, 22, base * 2 ** 22];
};

// Pickup/dropoff can become exact after the first render (order loads, pins confirmed): rebuild the map then.
export default function RouteMap(props: RouteMapProps) {
  const { pickup: a, dropoff: b } = props;
  return <LiveMap key={`${a.latitude},${a.longitude},${b.latitude},${b.longitude}`} {...props} />;
}

function LiveMap(props: RouteMapProps) {
  const { pickup, dropoff, driver, height = 220 } = props;
  const { c, language } = useCopy();
  const host = useRef<View>(null);
  const markers = useRef<{ ml?: Lib; driver?: Marker; arrow?: boolean; shown?: Point; frame?: number }>({});
  const [moved, setMoved] = useState(false);
  const points = [pickup, dropoff, ...(driver ? [driver] : [])];
  const padding = Math.round(Math.min(56, height / 5)); // markers clear of the edges without zooming a short map out
  const { map, failed } = useMap(host, points, language, { padding }, (m, ml) => {
    markers.current.ml = ml;
    new ml.Marker({ element: dot(palette.olive) }).setLngLat([pickup.longitude, pickup.latitude]).addTo(m);
    new ml.Marker({ element: dot(palette.clay, true) }).setLngLat([dropoff.longitude, dropoff.latitude]).addTo(m);
    m.addSource('route', { type: 'geojson', data: line(pickup, dropoff) });
    m.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': palette.forest, 'line-width': 3, 'line-dasharray': [2, 1.5] } });
    m.addSource('road', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m.addLayer({ id: 'road', type: 'line', source: 'road', layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': palette.forest, 'line-width': 4, 'line-opacity': 0.85 } });
    m.addSource('accuracy', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m.addLayer({ id: 'accuracy', type: 'circle', source: 'accuracy', paint: { 'circle-color': palette.blue, 'circle-opacity': 0.12, 'circle-stroke-color': palette.blue, 'circle-stroke-opacity': 0.3, 'circle-stroke-width': 1 } });
    m.on('dragstart', () => setMoved(true));
    m.on('zoomstart', e => { if ((e as { originalEvent?: unknown }).originalEvent) setMoved(true); });
  });

  // Road route arrives after the map: swap the dashed straight line for the solid road line (and back if it goes away).
  const road = props.road;
  const roadKey = road ? `${road.length}:${road[0]}:${road[road.length - 1]}` : '';
  useEffect(() => {
    if (!map) return;
    (map.getSource('road') as GeoJSONSource | undefined)?.setData(road
      ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: road } } : { type: 'FeatureCollection', features: [] });
    map.setLayoutProperty('route', 'visibility', road ? 'none' : 'visible');
  }, [map, roadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Driver: glide from the shown position to the new fix instead of jumping every poll.
  const heading = driver?.heading ?? null, accuracy = driver?.accuracy ?? null;
  const driverKey = driver ? `${driver.latitude},${driver.longitude},${heading},${accuracy}` : '';
  useEffect(() => {
    if (!map) return;
    const state = markers.current;
    const source = map.getSource('accuracy') as GeoJSONSource | undefined;
    if (!driver) {
      state.driver?.remove(); state.driver = undefined; state.shown = undefined;
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
      state.arrow = rotation !== null;
    }
    if (rotation !== null) state.driver.setRotation(rotation);
    source?.setData(accuracy ? { type: 'Feature', geometry: { type: 'Point', coordinates: [target.longitude, target.latitude] }, properties: {} }
      : { type: 'FeatureCollection', features: [] });
    if (accuracy) map.setPaintProperty('accuracy', 'circle-radius', halo(accuracy, target.latitude) as ExpressionSpecification);
    if (state.frame) cancelAnimationFrame(state.frame);
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now(), origin = from ?? target;
    const step = (t: number) => {
      const k = still ? 1 : (t - start) / 1200;
      const p = ease(origin, target, k);
      state.driver?.setLngLat([p.longitude, p.latitude]);
      state.shown = p;
      if (k < 1) state.frame = requestAnimationFrame(step);
    };
    state.frame = requestAnimationFrame(step);
    if (!moved) map.fitBounds(fitBounds([target, ...nextStops()]), { padding, maxZoom: 16, duration: still ? 0 : 800 });
  }, [map, driverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function nextStops() { return props.focus === 'pickup' ? [pickup] : props.focus === 'dropoff' ? [dropoff] : [pickup, dropoff]; }
  function recenter() {
    setMoved(false);
    map?.fitBounds(fitBounds(driver ? [driver, ...nextStops()] : [pickup, dropoff]), { padding, maxZoom: 16 });
  }

  if (failed) return <RoutePreview {...props} />;
  return <View style={{ height, width: '100%' }} accessible accessibilityRole="image"
    accessibilityLabel={`${c.routeDiagram}: ${props.pickupTitle} → ${props.dropoffTitle}${driver ? ` · ${props.driverTitle ?? ''}` : ''}`}>
    <View ref={host} style={StyleSheet.absoluteFill} />
    {map && moved && <Pressable onPress={recenter} accessibilityRole="button" accessibilityLabel={c.recenter}
      style={[styles.recenter, shadow]}>
      <Ionicons name="locate" size={20} color={palette.blue} />
    </Pressable>}
  </View>;
}

const line = (a: Point, b: Point) => ({ type: 'Feature' as const, properties: {},
  geometry: { type: 'LineString' as const, coordinates: [[a.longitude, a.latitude], [b.longitude, b.latitude]] } });

/** Fixed centre pin over a draggable map; reports the centre when the map stops moving. */
export function PinMap({ center, onChange, height = 320 }: PinMapProps) {
  const { language } = useCopy();
  const host = useRef<View>(null);
  const { failed } = useMap(host, [center], language, { padding: 0, picker: true }, m => {
    m.jumpTo({ center: [center.longitude, center.latitude], zoom: 16 });
    m.on('moveend', () => { const p = m.getCenter(); onChange({ latitude: p.lat, longitude: p.lng }); }); // first callback wins; callers pass a state setter
  });
  if (failed) return null;
  return <View style={{ height, width: '100%' }}>
    <View ref={host} style={StyleSheet.absoluteFill} />
    <View pointerEvents="none" style={styles.pin}>
      <Ionicons name="location-sharp" size={44} color={palette.clay} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  recenter: { position: 'absolute', bottom: 34, right: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pin: { position: 'absolute', left: '50%', top: '50%', marginLeft: -22, marginTop: -42 },
});
