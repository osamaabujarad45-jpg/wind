// Map search: real places from OpenStreetMap (the data the map draws) through Nominatim. Measured 31 Oct 2026 on 19
// West Bank places in Arabic and English: OSM 18 within 1.5 km, Azure Maps 8, Amazon Location 4. The app searches on an
// explicit tap, never per keystroke (OSMF usage policy). Palestine only (`countrycodes=ps`: same 18/19, and no Israeli
// towns that fall inside a served circle); answers are cached and the whole server sends at most one
// upstream request a second. Only places inside the served area come back, so every hit can become a pin; with `near`
// (the booking's pin or town) the closest come first, so the Manara roundabout in Ramallah beats the one in Hebron.
// ponytail: public Nominatim suits a small pilot; point GEOCODER_URL at a self-hosted Nominatim when traffic grows.
import { city, crowKm, servedCity, type Point } from '../../src/model.ts';

type Register = (method: string, path: string, handler: (ctx: { user: { id: number }; query: URLSearchParams }) => Promise<unknown>) => unknown;
type Guards = {
  fail: (status: number, code: string) => never;
  limit: (key: string, maximum: number, windowMs: number) => Promise<unknown>;
  limitKey: (userId: number) => string;
};
export type PlaceHit = { name: string; detail: string; latitude: number; longitude: number };
type Row = { lat?: unknown; lon?: unknown; name?: unknown; display_name?: unknown; address?: Record<string, unknown> };

const DAY = 86_400_000;
const inRange = (v: number, max: number) => Number.isFinite(v) && v >= -max && v <= max;
// OSM names the same kind of square دوار, ميدان or ساحة (Ramallah's Manara is ميدان المنارة, Hebron's is دوار المنارة).
const SQUARE = /^(?:دوار|ميدان|ساحة)\s+/;

// The detail line is up to two of street/neighbourhood/village, then always our served town. OSM's `city`/`county` are
// skipped: for Ramallah streets they name an Israeli settlement regional council and an Oslo area, not an address.
function toHits(rows: Row[], lang: 'ar' | 'en'): PlaceHit[] {
  return rows.flatMap(r => {
    const latitude = Number(r?.lat), longitude = Number(r?.lon), served = servedCity({ latitude, longitude });
    const name = (typeof r?.name === 'string' && r.name.trim() ? r.name : String(r?.display_name ?? '').split(',')[0]).trim().slice(0, 120);
    if (!name || !inRange(latitude, 90) || !inRange(longitude, 180) || !served) return [];
    const a = r.address ?? {};
    const area = [...new Set([a.road, a.neighbourhood ?? a.suburb ?? a.quarter, a.village ?? a.town ?? a.hamlet]
      .filter((v): v is string => typeof v === 'string' && !!v.trim() && v !== name))].slice(0, 2);
    const town = city(served)[lang];
    return [{ name, detail: [...area, ...(area.includes(town) || town === name ? [] : [town])].join(lang === 'ar' ? '، ' : ', ').slice(0, 160),
      latitude: Math.round(latitude * 1e6) / 1e6, longitude: Math.round(longitude * 1e6) / 1e6 }];
  });
}

export function registerPlaceSearchRoutes(route: Register, guards: Guards, geocoderUrl = 'https://nominatim.openstreetmap.org'): void {
  const base = geocoderUrl.trim().replace(/\/+$/, '');
  const cache = new Map<string, { at: number; hits: PlaceHit[] }>(); // insertion order = age
  const inFlight = new Map<string, Promise<PlaceHit[]>>(); // identical concurrent searches share one upstream lookup
  let next = 0;
  const queueTooLong = () => Math.max(Date.now(), next) - Date.now() > 5000; // upstream is the bottleneck: say so now

  const lookup = async (q: string, lang: 'ar' | 'en'): Promise<PlaceHit[]> => {
    if (queueTooLong()) return guards.fail(503, 'search_unavailable');
    const now = Date.now(), at = Math.max(now, next);
    next = at + 1100;
    if (at > now) await new Promise(r => setTimeout(r, at - now));
    try {
      const res = await fetch(`${base}/search?${new URLSearchParams({ q, format: 'jsonv2', limit: '20', 'accept-language': lang,
        countrycodes: 'ps', viewbox: '34.2,32.6,35.6,31.2', bounded: '1', addressdetails: '1' })}`, { headers: { 'User-Agent': 'Wind/1.0 (delivery app; small pilot)' }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`geocoder ${res.status}`);
      const rows = await res.json();
      if (!Array.isArray(rows)) throw new Error('geocoder reply is not a list'); // an error body must never be cached as "no places"
      return toHits(rows, lang);
    } catch { return guards.fail(503, 'search_unavailable'); }
  };

  // A square query also asks once for the bare name and keeps only the squares carrying it.
  const search = async (q: string, lang: 'ar' | 'en') => {
    const hits = await lookup(q, lang);
    const bare = SQUARE.test(q) ? q.replace(SQUARE, '') : '';
    if (bare.length >= 2) {
      const seen = new Set(hits.map(h => `${h.latitude},${h.longitude}`));
      for (const h of await lookup(bare, lang).catch(() => [] as PlaceHit[])) // best effort: the first answer stands alone
        if (SQUARE.test(h.name) && h.name.includes(bare) && !seen.has(`${h.latitude},${h.longitude}`)) hits.push(h);
    }
    return hits;
  };

  route('GET', '/api/places/search', async ({ user, query }) => {
    const q = (query.get('q') ?? '').trim();
    if (q.length < 2 || q.length > 100) return guards.fail(400, 'invalid_input');
    const lang = query.get('lang') === 'en' ? 'en' : 'ar';
    const [lat, lng] = (query.get('near') ?? '').split(',').map(Number);
    const near: Point | null = inRange(lat, 90) && inRange(lng, 180) ? { latitude: lat, longitude: lng } : null;
    const ranked = (hits: PlaceHit[]) => ({ hits: near ? [...hits].sort((a, b) => crowKm(near, a) - crowKm(near, b)).slice(0, 8) : hits.slice(0, 8) });
    const key = `${lang}:${q.toLowerCase()}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < DAY) return ranked(cached.hits);
    if (queueTooLong()) return guards.fail(503, 'search_unavailable'); // before charging the user's allowance
    await guards.limit(guards.limitKey(user.id), 60, 10 * 60_000);
    let pending = inFlight.get(key);
    if (!pending) {
      pending = search(q, lang).finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
    }
    const hits = await pending;
    cache.delete(key);
    cache.set(key, { at: Date.now(), hits });
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
    return ranked(hits);
  });
}
