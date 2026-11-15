// GEO-03: a place people already have, read to one point. Pasted coordinates, Google Maps links and Plus Codes (Open
// Location Code) become a point for the pin to show; the customer still confirms it on the map. Pure: no network. A short
// map link (maps.app.goo.gl, goo.gl/maps) only reports that it needs resolving; the server follows it (place-link.ts)
// through the same parser, so both sides agree on what a point is. Shared by the app and the API server.
import { cities, latinDigits, servedCity, type Point } from './model.ts';

export type SharedLocationError = 'out_of_range' | 'outside_area' | 'short_plus_code' | 'bad_plus_code' | 'bad_link';
export type SharedLocation =
  | { point: Point; source: 'coordinates' | 'map_link' | 'plus_code' }
  | { shortLink: string }
  | { error: SharedLocationError };

// Open Location Code, from the public spec: 20 digits, five pairs (latitude, longitude) at these resolutions in degrees,
// then a 5-row by 4-column grid for each character after the tenth.
const ALPHABET = '23456789CFGHJMPQRVWX';
const PAIR_RESOLUTION = [20, 1, 0.05, 0.0025, 0.000125];
const GRID_ROWS = 5, GRID_COLUMNS = 4;
const DIGITS = /^[23456789CFGHJMPQRVWX]+$/;

// Google's own hosts, then the two short-link hosts. google.<cc> covers google.ps, google.co.il, google.com.ps and so on.
const GOOGLE_HOST = /^(?:www\.)?google\.(?:com|[a-z]{2}|com?\.[a-z]{2})$/;
export const isAllowedMapHost = (host: string) => host === 'maps.app.goo.gl' || host === 'goo.gl' || host === 'maps.google.com' || GOOGLE_HOST.test(host);
const isShortHost = (host: string) => host === 'maps.app.goo.gl' || host === 'goo.gl';

const NUMBER = '[+-]?\\d{1,3}\\.\\d+';
const PAIR_TEXT = new RegExp(`^(${NUMBER})(?:\\s*[,،]\\s*|\\s+)(${NUMBER})$`);
const PAIR_PREFIX = /^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/; // a query value such as "31.9,35.2(Label)"
const AT_POINT = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
const URL_SHAPED = /^(?:https?:\/\/|[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\/)/i;

// Arabic-Indic and Persian digits and the Arabic decimal mark become ASCII; direction marks pasted with a location are dropped.
const clean = (text: string) => latinDigits(text).replace(/٫/g, '.').replace(/[‎‏؜]/g, '').trim();
const fold = (text: string) => text.toLowerCase().replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

// Served area: the one bound the app and the server share (servedCity, 20 km from a city centre).
function checked(latitude: number, longitude: number, source: 'coordinates' | 'map_link' | 'plus_code'): SharedLocation {
  if (!(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180)) return { error: 'out_of_range' };
  const point = { latitude, longitude };
  return servedCity(point) ? { point, source } : { error: 'outside_area' };
}

type Code = { digits: string; sep: number; short: boolean };
// The code's significant digits, where its separator sits and whether it is short. Null when the text is not a Plus Code.
// Padded full codes (84000000+) end at the separator. After the separator a code has no characters or at least two.
function readCode(raw: string): Code | null {
  const code = raw.toUpperCase();
  const sep = code.indexOf('+');
  if (sep < 0 || code.indexOf('+', sep + 1) >= 0) return null;
  const head = code.slice(0, sep), tail = code.slice(sep + 1);
  const real = head.replace(/0+$/, ''); // trailing zeros are padding
  if ((real && !DIGITS.test(real)) || (tail && !DIGITS.test(tail)) || tail.length === 1) return null;
  if (sep === 8) {
    const padded = real.length < 8;
    const valid = padded ? real.length >= 2 && real.length % 2 === 0 && tail === '' : true;
    return valid ? { digits: real + tail, sep, short: false } : null;
  }
  // A short code keeps two, four or six characters before the separator; shortening can leave none after it.
  const valid = [0, 2, 4, 6].includes(sep) && real.length === sep && real.length + tail.length >= 2;
  return valid ? { digits: real + tail, sep, short: true } : null;
}

const valueOf = (ch: string) => ch === '0' ? 0 : ALPHABET.indexOf(ch);

// The cell a code names. Digits 11 to 15 refine it on the grid (the spec stops at 15 significant digits); a padded code's missing pairs are zero.
function cellArea(digits: string) {
  const pairs = digits.slice(0, 10).padEnd(10, '0');
  let latitudeLo = -90, longitudeLo = -180;
  for (let i = 0; i < 5; i++) {
    latitudeLo += valueOf(pairs[2 * i]!) * PAIR_RESOLUTION[i]!;
    longitudeLo += valueOf(pairs[2 * i + 1]!) * PAIR_RESOLUTION[i]!;
  }
  let latitudeSize = PAIR_RESOLUTION[Math.min(digits.length, 10) / 2 - 1]!, longitudeSize = latitudeSize;
  for (const ch of digits.slice(10, 15)) {
    const index = ALPHABET.indexOf(ch);
    latitudeSize /= GRID_ROWS; longitudeSize /= GRID_COLUMNS;
    latitudeLo += Math.floor(index / GRID_COLUMNS) * latitudeSize;
    longitudeLo += (index % GRID_COLUMNS) * longitudeSize;
  }
  return { latitudeLo, longitudeLo, latitudeHi: latitudeLo + latitudeSize, longitudeHi: longitudeLo + longitudeSize };
}
type Area = ReturnType<typeof cellArea>;
const centre = (area: Area): Point => ({ latitude: (area.latitudeLo + area.latitudeHi) / 2, longitude: (area.longitudeLo + area.longitudeHi) / 2 });

/** The bounds of a full Plus Code's cell, or null if the text is not a full code on the earth. */
export function plusCodeArea(code: string): Area | null {
  const parsed = readCode(code);
  if (!parsed || parsed.short) return null;
  const area = cellArea(parsed.digits);
  return area.latitudeHi <= 90 && area.longitudeHi <= 180 ? area : null;
}

/** The centre of a full Plus Code's cell, e.g. 849VCWC8+R9 is the Googleplex, Mountain View. */
export function decodePlusCode(code: string): Point | null {
  const area = plusCodeArea(code);
  return area ? centre(area) : null;
}

// Five pairs of ten characters: the code for a point, before the separator is put in.
function pairCode(point: Point): string {
  const latitude = Math.min(Math.max(point.latitude, -90), 90);
  const longitude = ((point.longitude + 180) % 360 + 360) % 360;
  const latitudeUnits = Math.min(Math.floor((latitude + 90) * 8000 + 1e-6), 1439999);
  const longitudeUnits = Math.min(Math.floor(longitude * 8000 + 1e-6), 2879999);
  let out = '';
  for (const divisor of [160000, 8000, 400, 20, 1])
    out += ALPHABET[Math.floor(latitudeUnits / divisor) % 20] + ALPHABET[Math.floor(longitudeUnits / divisor) % 20];
  return out;
}

/** The full Plus Code (ten characters, eight before the separator) for a point; a point is encoded to its cell, not its centre. */
export function encodePlusCode(point: Point): string {
  const pairs = pairCode(point);
  return `${pairs.slice(0, 8)}+${pairs.slice(8)}`;
}

/**
 * A short code (CWC8+R9) read against a reference point: the reference supplies the leading characters and the nearest
 * cell wins. Short codes need a town, so the caller passes its centre. The spec's recoverNearest, in place.
 */
export function recoverPlusCode(code: string, reference: Point): Point | null {
  const parsed = readCode(code);
  if (!parsed) return null;
  if (!parsed.short) return decodePlusCode(code); // a full code needs no reference
  const supplied = 8 - parsed.sep; // characters taken from the reference
  const resolution = Math.pow(20, 2 - supplied / 2);
  const area = cellArea(pairCode(reference).slice(0, supplied) + parsed.digits);
  // The centre can land a whole cell away from the reference; move it onto the nearer cell, unless that leaves the earth.
  const nearest = (value: number, at: number, limit: number) => {
    const gap = value - at;
    if (gap > resolution / 2 && value - resolution >= -limit) return value - resolution;
    if (gap < -resolution / 2 && value + resolution <= limit) return value + resolution;
    return value;
  };
  const found = centre(area);
  const latitude = nearest(found.latitude, reference.latitude, 90), longitude = nearest(found.longitude, reference.longitude, 180);
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}

// Coordinates and map links name a point themselves; a short code needs its town after it ("CWC8+R9 Ramallah").
function localityCentre(text: string): Point | null {
  const term = fold(text);
  const town = cities.find(item => term.includes(fold(item.en)) || term.includes(fold(item.ar)));
  return town ? { latitude: town.latitude, longitude: town.longitude } : null;
}

function plusCodeRead(head: string, rest: string): SharedLocation | null {
  const parsed = readCode(head);
  if (!parsed) return null; // not a code, or still being typed
  if (!parsed.short) {
    const point = decodePlusCode(head);
    return point ? checked(point.latitude, point.longitude, 'plus_code') : { error: 'bad_plus_code' };
  }
  const reference = localityCentre(rest);
  if (!reference) return { error: 'short_plus_code' };
  const point = recoverPlusCode(head, reference);
  return point ? checked(point.latitude, point.longitude, 'plus_code') : { error: 'bad_plus_code' };
}

// A map link. The point is in the path (@lat,lng), or in q=, ll= or query=; a Google Maps link without one has no point.
function mapLinkRead(url: URL): SharedLocation {
  if (isShortHost(url.hostname)) return url.pathname.length > 1 ? { shortLink: url.href } : { error: 'bad_link' };
  const onMapsPath = url.hostname === 'maps.google.com' || /^\/maps(\/|$)/.test(url.pathname);
  if (!onMapsPath) return { error: 'bad_link' };
  const at = AT_POINT.exec(url.pathname);
  const fromQuery = ['q', 'll', 'query'].map(key => PAIR_PREFIX.exec(url.searchParams.get(key) ?? '')).find((m): m is RegExpExecArray => m !== null);
  const pair = at ?? fromQuery;
  return pair ? checked(Number(pair[1]), Number(pair[2]), 'map_link') : { error: 'bad_link' };
}

/**
 * What a pasted or typed place means. Null means ordinary search text (or a code still being typed).
 * An error means the text is clearly a location but cannot be used: say why, and never book it.
 */
export function parseSharedLocation(text: string): SharedLocation | null {
  const t = clean(text);
  if (!t) return null;
  const pair = PAIR_TEXT.exec(t);
  if (pair) return checked(Number(pair[1]), Number(pair[2]), 'coordinates');
  if (/^https?:\/\//i.test(t) || URL_SHAPED.test(t)) {
    let url: URL;
    try { url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`); } catch { return { error: 'bad_link' }; }
    if (url.pathname === '/' && !url.search && !url.hash) return null; // a host still being typed
    if (url.protocol !== 'https:' || !isAllowedMapHost(url.hostname)) return { error: 'bad_link' };
    return mapLinkRead(url);
  }
  const [head = '', ...others] = t.split(/[\s,،]+/);
  return head.includes('+') ? plusCodeRead(head, others.join(' ')) : null;
}
