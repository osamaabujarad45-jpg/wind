import type { Point } from './model.ts';

const rad = (d: number) => d * Math.PI / 180;

/** Compass bearing in degrees (0 = north) from a to b; used when a device reports no heading. */
export function bearing(a: Point, b: Point): number {
  const y = Math.sin(rad(b.longitude - a.longitude)) * Math.cos(rad(b.latitude));
  const x = Math.cos(rad(a.latitude)) * Math.sin(rad(b.latitude)) -
    Math.sin(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(rad(b.longitude - a.longitude));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** Linear step between two fixes; t is clamped so a late frame never overshoots. */
export function ease(a: Point, b: Point, t: number): Point {
  const k = Math.min(1, Math.max(0, t));
  return { latitude: a.latitude + (b.latitude - a.latitude) * k, longitude: a.longitude + (b.longitude - a.longitude) * k };
}

/** [[west, south], [east, north]] around the points, never smaller than ~1 km so one point still frames a street. */
export function fitBounds(points: Point[]): [[number, number], [number, number]] {
  const lats = points.map(p => p.latitude), lngs = points.map(p => p.longitude);
  let [w, e, s, n] = [Math.min(...lngs), Math.max(...lngs), Math.min(...lats), Math.max(...lats)];
  const pad = 0.005;
  if (e - w < 2 * pad) { const m = (w + e) / 2; w = m - pad; e = m + pad; }
  if (n - s < 2 * pad) { const m = (s + n) / 2; s = m - pad; n = m + pad; }
  return [[w, s], [e, n]];
}

/** Map label expression for the app language (OpenMapTiles name fields). */
// Arabic falls back to the Latin name before the local one, so places without an Arabic name are still readable.
export const labelField = (language: 'ar' | 'en') => language === 'ar'
  ? ['coalesce', ['get', 'name:ar'], ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]
  : ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];

/** ETA shown as a range: checkpoints and closures make a single road-time number lie. */
export const etaRange = (minutes: number): [number, number] => [minutes, Math.round(minutes * 1.3) + 2];

/** /api/route query for two points; coordinates rounded to ~110 m so a moving driver refetches only every ~110 m. */
export const roadPath = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }, grid = 3, heading?: number | null) =>
  `/route?from=${a.latitude.toFixed(grid)},${a.longitude.toFixed(grid)}&to=${b.latitude.toFixed(5)},${b.longitude.toFixed(5)}${
    heading == null ? '' : `&heading=${Math.round(heading / 15) * 15 % 360}`}`; // heading lets the route start the way the car faces
