import { readFileSync, writeFileSync } from 'node:fs';
const key = readFileSync(process.argv[2], 'utf8').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const km = (a, b) => { const R = 6371, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const UA = { 'User-Agent': 'wind-provider-eval/1.0 (one-off coverage test)' };
// ground truth [lat, lon], approximate to ~300 m
const places = [
  ['Birzeit University', [31.9605, 35.1830]], ['جامعة بيرزيت', [31.9605, 35.1830]],
  ['An-Najah National University Nablus', [32.2250, 35.2300]], ['جامعة النجاح الوطنية', [32.2250, 35.2300]],
  ['Church of the Nativity Bethlehem', [31.7043, 35.2075]], ['كنيسة المهد', [31.7043, 35.2075]],
  ['Al-Manara Square Ramallah', [31.9038, 35.2043]], ['دوار المنارة رام الله', [31.9038, 35.2043]],
  ['Rafidia Hospital Nablus', [32.2285, 35.2375]], ['مستشفى رفيديا', [32.2285, 35.2375]],
  ['Hebron University', [31.5453, 35.0937]], ['Ibrahimi Mosque Hebron', [31.5247, 35.1107]], ['الحرم الإبراهيمي الخليل', [31.5247, 35.1107]],
  ['Arab American University Jenin', [32.4095, 35.3400]], ['Hisham Palace Jericho', [31.8854, 35.4602]],
  ['Qalandia checkpoint', [31.8650, 35.2175]], ['Huwara', [32.1525, 35.2560]], ['حوارة', [32.1525, 35.2560]], ['Tulkarm', [32.3104, 35.0286]],
];
const out = { places: [], routes: [] };
for (const [query, truth] of places) {
  const row = { query };
  try {
    const r = await fetch(`https://atlas.microsoft.com/geocode?api-version=2026-01-01&top=1&query=${encodeURIComponent(query)}&coordinates=35.2,31.9`, { headers: { 'subscription-key': key } });
    const f = (await r.json()).features?.[0];
    row.azure = f ? { km: +km(truth, [f.geometry.coordinates[1], f.geometry.coordinates[0]]).toFixed(2), name: f.properties?.address?.formattedAddress ?? f.properties?.name } : null;
  } catch (e) { row.azure = 'error ' + e.message; }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ps,il&q=${encodeURIComponent(query)}`, { headers: UA });
    const f = (await r.json())[0];
    row.osm = f ? { km: +km(truth, [+f.lat, +f.lon]).toFixed(2), name: f.display_name.slice(0, 70) } : null;
  } catch (e) { row.osm = 'error ' + e.message; }
  out.places.push(row); await sleep(1100);
}
const routes = [
  ['Ramallah→Nablus', [31.9038, 35.2034], [32.2211, 35.2544]], ['Jenin→Nablus', [32.4610, 35.2950], [32.2211, 35.2544]],
  ['Hebron→Bethlehem', [31.5326, 35.0998], [31.7054, 35.2024]], ['Ramallah→Jericho', [31.9038, 35.2034], [31.8667, 35.4500]],
  ['Ramallah→Bethlehem', [31.9038, 35.2034], [31.7054, 35.2024]],
];
for (const [label, a, b] of routes) {
  const row = { label, straightKm: +km(a, b).toFixed(1) };
  try {
    const r = await fetch('https://atlas.microsoft.com/route/directions?api-version=2025-01-01', { method: 'POST',
      headers: { 'subscription-key': key, 'Content-Type': 'application/geo+json' },
      body: JSON.stringify({ type: 'FeatureCollection', features: [a, b].map((p, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p[1], p[0]] }, properties: { pointIndex: i, pointType: 'waypoint' } })), travelMode: 'driving' }) });
    const j = await r.json();
    const p = j.features?.find(f => f.properties?.type === 'RoutePath')?.properties ?? j.features?.[0]?.properties;
    const line = j.features?.find(f => f.geometry?.type === 'MultiLineString')?.geometry.coordinates.flat() ?? [];
    const viaJerusalem = line.some(([lon, lat]) => km([lat, lon], [31.7780, 35.2250]) < 3);
    row.azure = p?.distanceInMeters ? { km: +(p.distanceInMeters / 1000).toFixed(1), min: Math.round((p.durationTrafficInSeconds ?? p.durationInSeconds) / 60), viaJerusalem } : { status: r.status, body: JSON.stringify(j).slice(0, 200) };
  } catch (e) { row.azure = 'error ' + e.message; }
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`, { headers: UA });
    const j = await r.json(); const rt = j.routes?.[0];
    const viaJerusalem = rt?.geometry.coordinates.some(([lon, lat]) => km([lat, lon], [31.7780, 35.2250]) < 3);
    row.osrm = rt ? { km: +(rt.distance / 1000).toFixed(1), min: Math.round(rt.duration / 60), viaJerusalem } : j.code;
  } catch (e) { row.osrm = 'error ' + e.message; }
  out.routes.push(row); await sleep(1100);
}
writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
const hit = (v) => v && typeof v === 'object' && v.km < 1.5;
console.table(out.places.map(r => ({ query: r.query, azureKm: r.azure?.km ?? 'none', osmKm: r.osm?.km ?? 'none' })));
console.log('hits (<1.5 km): azure', out.places.filter(r => hit(r.azure)).length, '/', out.places.length, ' osm', out.places.filter(r => hit(r.osm)).length, '/', out.places.length);
console.log(JSON.stringify(out.routes, null, 1));
