// Amazon Location v2 (API key) vs public OSRM demo for Wind's served cities. Read-only; ~60 paid AWS calls.
// Usage: LOCATION_KEY=<restricted eval key> node scripts/aws-location-eval.mjs > location-eval.json (results: docs/operations/aws-credits.md)
const key = process.env.LOCATION_KEY;
if (!key) throw new Error('LOCATION_KEY missing');
const region = 'eu-north-1';
const cities = {
  ramallah: { ar: 'رام الله', en: 'Ramallah', lat: 31.9038, lng: 35.2034, landmarks: ['دوار المنارة', 'مستشفى'] },
  nablus: { ar: 'نابلس', en: 'Nablus', lat: 32.2211, lng: 35.2544, landmarks: ['جامعة النجاح', 'مستشفى'] },
  hebron: { ar: 'الخليل', en: 'Hebron', lat: 31.5326, lng: 35.0998, landmarks: ['الحرم الإبراهيمي', 'مستشفى'] },
  tulkarm: { ar: 'طولكرم', en: 'Tulkarm', lat: 32.3116, lng: 35.0279, landmarks: ['جامعة خضوري', 'مستشفى'] },
  jenin: { ar: 'جنين', en: 'Jenin', lat: 32.4612, lng: 35.3005, landmarks: ['الجامعة العربية الأمريكية', 'مستشفى'] },
};
const km = (a, b) => { // haversine, [lng, lat] arrays
  const r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLng = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return +(12742 * Math.asin(Math.sqrt(h))).toFixed(2);
};
let calls = 0;
async function aws(service, path, body) {
  calls++;
  const t = Date.now();
  const res = await fetch(`https://${service}.geo.${region}.amazonaws.com/v2/${path}?key=${encodeURIComponent(key)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const json = await res.json().catch(() => null);
  return { status: res.status, ms: Date.now() - t, json };
}
const place = (item, center) => item && ({ title: item.Title, type: item.PlaceType, country: item.Address?.Country?.Code3,
  locality: item.Address?.Locality, label: item.Address?.Label, kmFromCentre: item.Position ? km(item.Position, center) : null });
const out = { at: new Date().toISOString(), region, places: {}, routes: [], tiles: [] };

for (const [id, c] of Object.entries(cities)) {
  const center = [c.lng, c.lat], r = (out.places[id] = {});
  for (const [label, text, lang] of [['geocodeAr', c.ar, 'ar'], ['geocodeEn', c.en, 'en']]) {
    const g = await aws('places', 'geocode', { QueryText: text, Language: lang, MaxResults: 1 });
    r[label] = { status: g.status, ms: g.ms, top: place(g.json?.ResultItems?.[0], center), error: g.status === 200 ? undefined : g.json };
  }
  const rev = await aws('places', 'reverse-geocode', { QueryPosition: center, Language: 'ar', MaxResults: 1 });
  r.reverseAr = { status: rev.status, ms: rev.ms, top: place(rev.json?.ResultItems?.[0], center), error: rev.status === 200 ? undefined : rev.json };
  r.search = [];
  for (const q of c.landmarks) {
    const s = await aws('places', 'search-text', { QueryText: q, BiasPosition: center, Language: 'ar', MaxResults: 5 });
    const items = s.json?.ResultItems ?? [];
    r.search.push({ query: q, status: s.status, ms: s.ms, count: items.length, within20km: items.filter(i => i.Position && km(i.Position, center) <= 20).length,
      top: items.slice(0, 3).map(i => place(i, center)), error: s.status === 200 ? undefined : s.json });
  }
}

const ids = Object.keys(cities);
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
  const a = cities[ids[i]], b = cities[ids[j]];
  const crow = km([a.lng, a.lat], [b.lng, b.lat]);
  const amazon = await aws('routes', 'routes', { Origin: [a.lng, a.lat], Destination: [b.lng, b.lat], TravelMode: 'Car', LegGeometryFormat: 'Simple' });
  const route = amazon.json?.Routes?.[0];
  const steps = route?.Legs?.flatMap(l => l.VehicleLegDetails?.TravelSteps ?? []) ?? [];
  const aKm = route?.Summary?.Distance ?? steps.reduce((s, x) => s + (x.Distance ?? 0), 0);
  const aSec = route?.Summary?.Duration ?? steps.reduce((s, x) => s + (x.Duration ?? 0), 0);
  const line = route?.Legs?.flatMap(l => l.Geometry?.LineString ?? []) ?? [];
  let osrm = null;
  const t = Date.now();
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(15_000) });
    const j = await res.json();
    const o = j.routes?.[0];
    osrm = { status: res.status, code: j.code, ms: Date.now() - t, km: o ? +(o.distance / 1000).toFixed(1) : null, min: o ? +(o.duration / 60).toFixed(0) : null, points: o?.geometry?.coordinates?.length ?? 0 };
  } catch (error) { osrm = { error: String(error) }; }
  out.routes.push({ pair: `${ids[i]}-${ids[j]}`, crowKm: crow,
    amazon: { status: amazon.status, ms: amazon.ms, km: route ? +(aKm / 1000).toFixed(1) : null, min: route ? +(aSec / 60).toFixed(0) : null, points: line.length,
      notices: amazon.json?.Notices?.map(n => n.Code) ?? [], error: amazon.status === 200 ? undefined : amazon.json },
    osrm });
}

// Map data: one vector tile over each of Ramallah (z12) and Nablus (z14), plus the style descriptor.
const tileXY = (lat, lng, z) => { const n = 2 ** z, r = lat * Math.PI / 180;
  return [Math.floor((lng + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)]; };
for (const [id, z] of [['ramallah', 12], ['nablus', 14]]) {
  const [x, y] = tileXY(cities[id].lat, cities[id].lng, z);
  calls++;
  const res = await fetch(`https://maps.geo.${region}.amazonaws.com/v2/tiles/vector.basemap/${z}/${x}/${y}?key=${encodeURIComponent(key)}`);
  out.tiles.push({ id, z, x, y, status: res.status, bytes: (await res.arrayBuffer()).byteLength, type: res.headers.get('content-type') });
}
const style = await fetch(`https://maps.geo.${region}.amazonaws.com/v2/styles/Standard/descriptor?key=${encodeURIComponent(key)}`);
out.style = { status: style.status, bytes: (await style.arrayBuffer()).byteLength };
out.paidCalls = calls;
console.log(JSON.stringify(out, null, 2));
