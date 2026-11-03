// Builds server/data/places-ps.json.gz, the place index behind /api/places/suggest and /api/places/reverse, from an
// OpenStreetMap extract. Rerun when OSM has improved enough to matter (data © OpenStreetMap contributors, ODbL):
//   curl -L -o ip.pbf https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf
//   npm i --no-save osm-pbf-parser && node scripts/build-places-index.mjs ip.pbf
// Keeps what is inside the outlines below and has an Arabic or Latin name; names mapped in Hebrew are dropped.
import { createReadStream, writeFileSync } from 'node:fs';
import { Writable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const parser = require('osm-pbf-parser');
const file = process.argv[2];
if (!file) throw new Error('usage: build-places-index.mjs <extract.osm.pbf>');

const ARABIC = /[؀-ۿ]/, LATIN = /[A-Za-z]/, HEBREW = /[֐-׿]/;
// Direction marks and vowel signs come from copied text; OSM also has places named only with their kind.
const clean = v => typeof v === 'string' ? v.replace(/[​-‏‪-‮⁦-⁩﻿ً-ٰٟ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90) : '';
const GENERIC = new Set(['مسجد', 'جامع', 'بقالة', 'مدرسة', 'صيدلية', 'مني ماركت', 'ميني ماركت', 'سوبر ماركت', 'مخبز', 'مطعم', 'كافيه', 'مقهى', 'محل', 'روضة', 'بنك', 'عيادة', 'مقبرة', 'mosque', 'school', 'shop', 'market', 'pharmacy', 'restaurant', 'cafe']);
function names(tags) {
  const name = clean(tags.name);
  if (HEBREW.test(name) || GENERIC.has(name.toLowerCase())) return null;
  const ar = clean(tags['name:ar']) || (ARABIC.test(name) ? name : ''), en = clean(tags['name:en']) || (LATIN.test(name) ? name : '');
  return ar || en ? { ar, en } : null;
}
// Coarse West Bank (with East Jerusalem) and Gaza outlines, a little outside the 1949 line: a served circle also covers
// towns across it, and those are not place suggestions yet. OSM's own Palestine relation only holds Areas A and B.
const OUTLINES = [
  [[35.19,32.54],[35.26,32.56],[35.39,32.53],[35.57,32.40],[35.58,32.20],[35.57,32.00],[35.55,31.85],[35.50,31.75],[35.46,31.50],[35.40,31.35],[35.22,31.34],[35.10,31.35],[34.95,31.33],[34.87,31.39],[34.87,31.47],[34.93,31.55],[34.93,31.62],[35.00,31.70],[35.02,31.74],[35.20,31.74],[35.21,31.80],[35.10,31.83],[34.98,31.85],[35.00,31.90],[35.00,31.97],[34.98,32.05],[34.96,32.12],[34.96,32.19],[35.00,32.26],[35.00,32.32],[35.04,32.39],[35.08,32.46],[35.13,32.50]],
  [[34.19,31.30],[34.26,31.21],[34.40,31.35],[34.56,31.54],[34.50,31.61],[34.47,31.60]],
];
const inside = (lat, lng) => OUTLINES.some(ring => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
});
// Search rank (lower first) and the short kind the app shows an icon for. Unlisted amenities are ordinary POIs.
const PLACE = { city: 0, town: 0, village: 1, suburb: 1, neighbourhood: 2, quarter: 2, hamlet: 2, locality: 3, isolated_dwelling: 4, square: 2 };
const MAJOR = new Set(['hospital', 'university', 'college', 'bus_station', 'marketplace', 'townhall', 'courthouse', 'police', 'fuel', 'clinic', 'school', 'mosque', 'place_of_worship', 'bank', 'pharmacy']);
function classify(tags) {
  if (tags.military === 'checkpoint') return null; // positioned by the Roads screen, never offered as a destination
  if (tags.place && PLACE[tags.place] !== undefined) return { rank: PLACE[tags.place], kind: tags.place === 'city' || tags.place === 'town' || tags.place === 'village' ? 'town' : 'area' };
  if (tags.amenity) {
    const kind = { hospital: 'health', clinic: 'health', doctors: 'health', pharmacy: 'health', dentist: 'health', university: 'education', college: 'education', school: 'education', kindergarten: 'education',
      mosque: 'worship', place_of_worship: 'worship', restaurant: 'food', cafe: 'food', fast_food: 'food', bank: 'bank', atm: 'bank', fuel: 'fuel', bus_station: 'transit', taxi: 'transit' }[tags.amenity] ?? 'poi';
    return { rank: MAJOR.has(tags.amenity) ? 2 : 3, kind };
  }
  if (tags.shop) return { rank: tags.shop === 'mall' || tags.shop === 'supermarket' ? 2 : 3, kind: 'shop' };
  if (tags.junction || tags.highway === 'traffic_signals') return { rank: 2, kind: 'junction' };
  if (tags.healthcare) return { rank: 2, kind: 'health' };
  if (tags.tourism || tags.historic) return { rank: 3, kind: 'poi' };
  if (tags.office || tags.leisure || tags.craft) return { rank: 3, kind: 'poi' };
  if (tags.building && tags.building !== 'yes' && tags.building !== 'house') return { rank: 3, kind: 'poi' };
  if (tags.landuse === 'industrial' || tags.landuse === 'commercial') return { rank: 3, kind: 'area' };
  return null;
}

const coords = new Map(); // node id -> [lat, lng], only inside the served area
const pois = [], roads = [];
const add = (tags, lat, lng) => {
  const n = names(tags), c = n && classify(tags);
  if (n && c) pois.push([n.ar, n.en, +lat.toFixed(5), +lng.toFixed(5), c.kind, c.rank]);
};
const STEP = 0.0012; // about 130 m between a road's reverse-geocoding samples
await new Promise((resolve, reject) => {
  createReadStream(file).pipe(parser()).pipe(new Writable({ objectMode: true, write(items, _, next) {
    for (const item of items) {
      if (item.type === 'node') {
        if (!inside(item.lat, item.lon)) continue;
        coords.set(item.id, [item.lat, item.lon]);
        if (Object.keys(item.tags).length) add(item.tags, item.lat, item.lon);
      } else if (item.type === 'way') {
        const line = item.refs.map(id => coords.get(id)).filter(Boolean);
        if (!line.length) continue;
        const [lat, lng] = line[line.length >> 1];
        if (item.tags.highway) {
          const n = names(item.tags);
          if (!n) continue;
          const samples = [];
          let last = null;
          for (const [a, b] of line) if (!last || Math.abs(a - last[0]) + Math.abs(b - last[1]) >= STEP) { samples.push(+a.toFixed(5), +b.toFixed(5)); last = [a, b]; }
          roads.push({ ar: n.ar, en: n.en, samples });
        } else add(item.tags, lat, lng);
      }
    }
    next();
  } })).on('finish', resolve).on('error', reject);
});

// One row per place: the same name mapped twice close together (a building and its node) is one result.
const seen = new Set();
const places = pois.sort((a, b) => a[5] - b[5]).filter(p => {
  const key = `${p[0] || p[1]}:${p[2].toFixed(2)},${p[3].toFixed(2)}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
const streetIndex = new Map(), streets = [], points = [];
for (const road of roads) {
  const key = road.ar || road.en;
  let i = streetIndex.get(key);
  if (i === undefined) { i = streets.length; streetIndex.set(key, i); streets.push([road.ar, road.en]); }
  for (let k = 0; k < road.samples.length; k += 2) points.push(i, road.samples[k], road.samples[k + 1]);
}
const out = gzipSync(JSON.stringify({ built: new Date().toISOString().slice(0, 10), places, streets, points }), { level: 9 });
writeFileSync(new URL('../server/data/places-ps.json.gz', import.meta.url), out);
console.log(`${places.length} places, ${streets.length} streets, ${points.length / 3} street samples, ${(out.length / 1e6).toFixed(2)} MB`);
