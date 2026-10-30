// Street name under a map pin from Amazon Location ReverseGeocode (docs/operations/aws-credits.md). AWS Service Terms
// 82.4a: a SingleUse result is shown once and never stored or cached; HERE supplies the data, so its attribution travels
// with every label (82.10). Only the pin's coordinates reach AWS.
import { servedCity, type Point } from '../src/model.ts';

export const PLACE_LABEL_ATTRIBUTION = '© AWS, HERE';
const HEBREW = /[֐-׿]/, LATIN = /[A-Za-z]/;
type Address = { Street?: unknown; District?: unknown; Locality?: unknown };

/** Null outside the served area (no paid lookup), when nothing readable comes back, or when the provider fails. */
export async function placeLabel(key: string, point: Point, language: 'ar' | 'en', base = 'https://places.geo.eu-north-1.amazonaws.com'): Promise<string | null> {
  if (!servedCity(point)) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/v2/reverse-geocode?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ QueryPosition: [point.longitude, point.latitude], Language: language, MaxResults: 1, IntendedUse: 'SingleUse',
        Filter: { IncludePlaceTypes: ['Street', 'PointAddress', 'InterpolatedAddress', 'Intersection'] } }),
    });
    if (!res.ok) return null;
    const address = ((await res.json()) as { ResultItems?: { Address?: Address }[] } | null)?.ResultItems?.[0]?.Address;
    // Never Hebrew; Latin only when English was asked for (a settlement name came back in Latin inside Hebron).
    const parts = [address?.Street ?? address?.District, address?.Locality].filter((part): part is string =>
      typeof part === 'string' && !!part.trim() && !HEBREW.test(part) && (language === 'en' || !LATIN.test(part)));
    return parts.length ? parts.join(language === 'ar' ? '، ' : ', ').slice(0, 120) : null;
  } catch {
    return null; // a label is a convenience: the pin and the typed landmark still decide the place
  }
}

type Register = (method: string, path: string, handler: (ctx: { user: { id: number }; query: URLSearchParams }) => Promise<unknown>) => unknown;
export type PlaceLabelGuards = {
  key: string | undefined; endpoint?: string;
  fail: (status: number, code: string) => never;
  limit: (key: string, maximum: number, windowMs: number) => Promise<unknown>;
  budgetKey: (userId: number) => string;
  point: (value: string | null) => Point; // the API's own lat,lng parser (400 invalid_location)
};

/** Signed-in only, 30 lookups per user per 10 minutes; 503 place_label_unavailable without the server key. */
export function registerPlaceLabelRoutes(route: Register, guards: PlaceLabelGuards): void {
  route('GET', '/api/place-label', async ({ user, query }) => {
    if (!guards.key) return guards.fail(503, 'place_label_unavailable');
    (await guards.limit(guards.budgetKey(user.id), 30, 10 * 60_000));
    const label = await placeLabel(guards.key, guards.point(query.get('at')), query.get('lang') === 'en' ? 'en' : 'ar', guards.endpoint);
    return { label, attribution: label && PLACE_LABEL_ATTRIBUTION };
  });
}
