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

/**
 * How long the driver marker glides to a new fix: the time since the previous one, so it is still moving when the
 * next fix lands (continuous, no stop-and-go; the standard live-tracking technique). After a gap, a short catch-up.
 */
export const glideMs = (gap: number) => gap > 0 && gap <= 6_000 ? Math.max(600, gap) : 1_200;

/** Heading from a to b (degrees) at t in 0..1, turning the short way round. */
export function turn(a: number, b: number, t: number): number {
  const d = ((b - a) % 360 + 540) % 360 - 180;
  return (a + d * Math.min(1, Math.max(0, t)) + 360) % 360;
}

export type Pose = Point & { rotation: number };
/**
 * Live marker motion: each fix starts a glide from where the marker is drawn now (never dropped mid-glide, never
 * restarted from the last fix), over glideMs of the gap since the previous fix, turning the short way in 500 ms.
 * still (reduced motion): it lands on the fix at once.
 */
export function glider(start: Pose) {
  let now = start, from = start, to = start, at = 0, span = 0;
  return {
    fix(fix: Point & { heading?: number | null }, t: number, still = false) {
      span = still ? 0 : glideMs(at ? t - at : 0);
      from = now; to = { latitude: fix.latitude, longitude: fix.longitude, rotation: fix.heading ?? now.rotation }; at = t;
    },
    frame(t: number) {
      const e = t - at;
      now = { ...ease(from, to, span ? e / span : 1), rotation: span ? turn(from.rotation, to.rotation, e / 500) : to.rotation };
      return { now, done: e >= (span ? Math.max(span, 500) : 0) };
    },
  };
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

/** Road distance left, as trackers show it: one decimal close by, whole km further out. */
export const kmLabel = (km: number) => Math.round(km * 10) < 100 ? (Math.round(km * 10) / 10).toFixed(1) : String(Math.round(km));

/** The approach route to show: the fresh one, else the one kept for the same stop; nothing while the last fetch failed. */
export const shownApproach = <R>(fetched: R | undefined, failed: boolean, kept: { stop: string; route: R } | undefined, stop: string) =>
  failed ? undefined : fetched ?? (kept?.stop === stop ? kept.route : undefined);

/** /api/route query for two points; coordinates rounded to ~110 m so a moving driver refetches only every ~110 m. */
export const roadPath = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }, grid = 3, heading?: number | null) =>
  `/route?from=${a.latitude.toFixed(grid)},${a.longitude.toFixed(grid)}&to=${b.latitude.toFixed(5)},${b.longitude.toFixed(5)}${
    heading == null ? '' : `&heading=${Math.round(heading / 15) * 15 % 360}`}`; // heading lets the route start the way the car faces

/** True when `p` lies within `metres` of the polyline `line` ([lng, lat][]); local flat-earth metres, fine below ~100 km. */
export function nearLine(p: Point, line: [number, number][], metres: number): boolean {
  const kx = 111_320 * Math.cos(rad(p.latitude)), ky = 110_540;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1][0] - p.longitude) * kx, ay = (line[i - 1][1] - p.latitude) * ky;
    const dx = (line[i][0] - line[i - 1][0]) * kx, dy = (line[i][1] - line[i - 1][1]) * ky;
    const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
    if (Math.hypot(ax + t * dx, ay + t * dy) <= metres) return true;
  }
  return line.length === 1 && Math.hypot((line[0][0] - p.longitude) * kx, (line[0][1] - p.latitude) * ky) <= metres;
}

/**
 * True when the polyline drives back over itself: a point comes within `within` m of an earlier one after more than
 * `loop` m of travel. Forced detours through a via point that snaps onto a dead-end road do this (out and back).
 */
export function backtracks(line: [number, number][], loop = 300, within = 25): boolean {
  if (line.length < 3) return false;
  const kx = 111_320 * Math.cos(rad(line[0][1])), ky = 110_540;
  const p = line.map(([x, y]) => [x * kx, y * ky]), travelled = [0];
  for (let i = 1; i < p.length; i++) travelled.push(travelled[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  // ponytail: O(n²) over full geometry (~1.5k points, ~10 candidates, cached); a grid index if routes get much longer
  for (let i = 0; i < p.length; i++)
    for (let k = i + 1; k < p.length; k++)
      if (travelled[k] - travelled[i] > loop && Math.hypot(p[k][0] - p[i][0], p[k][1] - p[i][1]) < within) return true;
  return false;
}

/** The road line from the driver's point on: the part behind them is dropped, so the line starts under the car. */
export function fromDriver(line: [number, number][], p: Point): [number, number][] {
  if (line.length < 2) return line;
  const kx = 111_320 * Math.cos(rad(p.latitude)), ky = 110_540;
  let best = Infinity, next = 1;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1][0] - p.longitude) * kx, ay = (line[i - 1][1] - p.latitude) * ky;
    const dx = (line[i][0] - line[i - 1][0]) * kx, dy = (line[i][1] - line[i - 1][1]) * ky;
    const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) { best = d; next = t === 0 ? i - 1 : i; } // before a segment's start: keep that vertex, it is ahead
  }
  return [[p.longitude, p.latitude], ...line.slice(next)];
}
