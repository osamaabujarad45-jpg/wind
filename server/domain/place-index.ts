// Instant place suggestions and "what is under this pin", answered from memory out of an OpenStreetMap extract
// (server/data/places-ps.json.gz, built by scripts/build-places-index.mjs). No upstream call, so the app can search per
// keystroke, which public Nominatim forbids. /api/places/search (Nominatim) remains the wider, slower fallback.
// ponytail: a linear scan of about 27k rows per keystroke takes a few ms; add a token index if the corpus grows tenfold.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { city, crowKm, servedCity, type Point } from '../../src/model.ts';

type Register = (method: string, path: string, handler: (ctx: { user: { id: number }; query: URLSearchParams }) => Promise<unknown>) => unknown;
type Guards = {
  fail: (status: number, code: string) => never;
  limit: (key: string, maximum: number, windowMs: number) => Promise<unknown>;
  limitKey: (userId: number) => string;
};
export type PlaceKind = 'town' | 'area' | 'health' | 'education' | 'worship' | 'food' | 'bank' | 'fuel' | 'transit' | 'shop' | 'junction' | 'poi' | 'street';
export type SuggestHit = { name: string; detail: string; latitude: number; longitude: number; kind: PlaceKind };
export type PinLabel = { name: string; detail: string };
type Lang = 'ar' | 'en';
// A place, or a street at the sample closest to the query's `near`.
type Row = { ar: string; en: string; latitude: number; longitude: number; kind: PlaceKind; rank: number; tokens: string[]; folded: string; samples?: number[] };

const DIACRITICS = /[ً-ٰٟـ​-‏‪-‮⁦-⁩]/g;
/** Arabic keyboards vary hamza, alef and ta-marbuta; digits may be Arabic-Indic. */
export const foldPlace = (text: string) => text.toLowerCase().replace(DIACRITICS, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
// "ال" is optional when people type: مستشفى finds المستشفى and the reverse.
const stripAl = (token: string) => token.startsWith('ال') && token.length > 3 ? token.slice(2) : token;
const tokensOf = (text: string) => foldPlace(text).split(' ').filter(Boolean).flatMap(token => {
  const bare = stripAl(token);
  return bare === token ? [token] : [token, bare];
});

const BUCKET = 0.01; // about a kilometre
const bucketKey = (lat: number, lng: number) => `${Math.floor(lat / BUCKET)}:${Math.floor(lng / BUCKET)}`;
type StreetSample = Point & { row: Row };
type Index = { rows: Row[]; pois: Map<string, Row[]>; areas: Map<string, Row[]>; streets: Map<string, StreetSample[]> };
let loaded: Index | null = null;
function index(): Index {
  if (loaded) return loaded;
  const raw = JSON.parse(gunzipSync(readFileSync(new URL('../data/places-ps.json.gz', import.meta.url))).toString('utf8')) as
    { places: [string, string, number, number, PlaceKind, number][]; streets: [string, string][]; points: number[] };
  const pois = new Map<string, Row[]>(), areas = new Map<string, Row[]>(), streets = new Map<string, StreetSample[]>();
  const put = <T,>(map: Map<string, T[]>, key: string, value: T) => { const list = map.get(key); if (list) list.push(value); else map.set(key, [value]); };
  const describe = (ar: string, en: string) => ({ tokens: [...new Set([...tokensOf(ar), ...tokensOf(en)])], folded: `${foldPlace(ar)} | ${foldPlace(en)}` });
  const rows: Row[] = raw.places.map(([ar, en, latitude, longitude, kind, rank]) => {
    const row: Row = { ar, en, latitude, longitude, kind, rank, ...describe(ar, en) };
    put(kind === 'town' || kind === 'area' ? areas : pois, bucketKey(latitude, longitude), row);
    return row;
  });
  const streetRows: Row[] = raw.streets.map(([ar, en]) => ({ ar, en, latitude: 0, longitude: 0, kind: 'street', rank: 3, samples: [], ...describe(ar, en) }));
  for (let i = 0; i < raw.points.length; i += 3) {
    const row = streetRows[raw.points[i]!]!, latitude = raw.points[i + 1]!, longitude = raw.points[i + 2]!;
    row.samples!.push(latitude, longitude);
    put(streets, bucketKey(latitude, longitude), { row, latitude, longitude });
  }
  for (const row of streetRows) if (row.samples!.length) rows.push(row);
  return loaded = { rows, pois, areas, streets };
}

const nearby = <T extends Point>(map: Map<string, T[]>, point: Point, reach: number) => {
  const out: T[] = [], lat = Math.floor(point.latitude / BUCKET), lng = Math.floor(point.longitude / BUCKET);
  for (let a = lat - reach; a <= lat + reach; a++) for (let b = lng - reach; b <= lng + reach; b++) out.push(...(map.get(`${a}:${b}`) ?? []));
  return out;
};
const closest = <T extends Point>(list: T[], point: Point) => list.reduce<{ item: T; km: number } | null>((best, item) => {
  const km = crowKm(point, item);
  return !best || km < best.km ? { item, km } : best;
}, null);
const label = (row: Pick<Row, 'ar' | 'en'>, lang: Lang) => (lang === 'ar' ? row.ar || row.en : row.en || row.ar);

/** The neighbourhood or village around a point and the served town, for the second line of a result. */
function areaLine(point: Point, lang: Lang, except: string) {
  const area = closest(nearby(index().areas, point, 3), point);
  const served = servedCity(point), town = served ? city(served)[lang] : '';
  const parts = [area && area.km < 3 ? label(area.item, lang) : '', town].filter(part => part && part !== except);
  return [...new Set(parts)].join(lang === 'ar' ? '، ' : ', ');
}

const streetPoint = (row: Row, near: Point | null): Point => {
  const samples = row.samples!;
  let best = 0, bestKm = Infinity;
  if (near) for (let i = 0; i < samples.length; i += 2) {
    const km = crowKm(near, { latitude: samples[i]!, longitude: samples[i + 1]! });
    if (km < bestKm) { bestKm = km; best = i; }
  } else best = samples.length >> 2 << 1;
  return { latitude: samples[best]!, longitude: samples[best + 1]! };
};

export function suggestPlaces(query: string, lang: Lang, near: Point | null, limit = 8): SuggestHit[] {
  const whole = foldPlace(query), terms = whole.split(' ').filter(Boolean).map(stripAl);
  if (!terms.length) return [];
  const scored: { row: Row; point: Point; score: number }[] = [];
  for (const row of index().rows) {
    let exactWord = 0, ok = true;
    for (const term of terms) {
      let hit = false;
      for (const token of row.tokens) if (token.startsWith(term)) { hit = true; if (token === term) exactWord++; break; }
      if (!hit) { ok = false; break; }
    }
    if (!ok) continue;
    const point = row.samples ? streetPoint(row, near) : row;
    const km = near ? crowKm(near, point) : 0;
    // Closeness decides most ties: the Manara you mean is the one in your town. A town itself may be far away.
    const distance = row.kind === 'town' ? Math.min(km, 40) * 0.2 : Math.min(km, 60) * 0.8;
    const names = row.folded.split(' | ');
    const score = (names.includes(whole) ? 60 : names.some(name => name.startsWith(whole)) ? 30 : 0) + exactWord * 6 - row.rank * 5 - distance;
    scored.push({ row, point, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>(), hits: SuggestHit[] = [];
  for (const { row, point } of scored) {
    if (!servedCity(point)) continue;
    const name = label(row, lang), key = `${name}:${point.latitude.toFixed(2)}:${point.longitude.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ name, detail: areaLine(point, lang, name), latitude: point.latitude, longitude: point.longitude, kind: row.kind });
    if (hits.length >= limit) break;
  }
  return hits;
}

/** What to call a pin: the place under it, else the street, else the neighbourhood, always ending in the served town. */
export function pinLabel(point: Point, lang: Lang): PinLabel {
  const served = servedCity(point);
  if (!served) return { name: '', detail: '' };
  const data = index();
  const poi = closest(nearby(data.pois, point, 1), point);
  const street = closest(nearby(data.streets, point, 1), point);
  const area = closest(nearby(data.areas, point, 3), point);
  const name = poi && poi.km < 0.04 ? label(poi.item, lang)
    : street && street.km < 0.12 ? label(street.item.row, lang)
    : poi && poi.km < 0.1 ? label(poi.item, lang)
    : area && area.km < 2.5 ? label(area.item, lang) : city(served)[lang];
  return { name, detail: areaLine(point, lang, name) };
}

export function registerPlaceIndexRoutes(route: Register, guards: Guards): void {
  const point = (text: string | null) => {
    const [latitude, longitude] = (text ?? '').split(',').map(Number);
    return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude!) <= 90 && Math.abs(longitude!) <= 180
      ? { latitude: latitude!, longitude: longitude! } : null;
  };
  const language = (query: URLSearchParams): Lang => query.get('lang') === 'en' ? 'en' : 'ar';
  route('GET', '/api/places/suggest', async ({ user, query }) => {
    const q = (query.get('q') ?? '').trim();
    if (!q || q.length > 100) return guards.fail(400, 'invalid_input');
    await guards.limit(guards.limitKey(user.id), 600, 10 * 60_000);
    return { hits: suggestPlaces(q, language(query), point(query.get('near'))) };
  });
  route('GET', '/api/places/reverse', async ({ user, query }) => {
    const at = point(query.get('at')) ?? guards.fail(400, 'invalid_location');
    await guards.limit(guards.limitKey(user.id), 300, 10 * 60_000);
    return pinLabel(at, language(query));
  });
}
