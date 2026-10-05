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
export const labelField = (language: 'ar' | 'en') => language === 'ar'
  ? ['coalesce', ['get', 'name:ar'], ['get', 'name']]
  : ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
