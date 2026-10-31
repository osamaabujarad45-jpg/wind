import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const prev = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const km = (a, b) => { const R = 6371, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const aws = (...args) => { try { return JSON.parse(execFileSync('aws', [...args, '--profile', 'osama', '--region', 'eu-north-1', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch (e) { return { error: String(e.stderr || e.message).slice(0, 160) }; } };
const truth = Object.fromEntries([
  ['Birzeit University', [31.9605, 35.1830]], ['جامعة بيرزيت', [31.9605, 35.1830]],
  ['An-Najah National University Nablus', [32.2250, 35.2300]], ['جامعة النجاح الوطنية', [32.2250, 35.2300]],
  ['Church of the Nativity Bethlehem', [31.7043, 35.2075]], ['كنيسة المهد', [31.7043, 35.2075]],
  ['Al-Manara Square Ramallah', [31.9038, 35.2043]], ['دوار المنارة رام الله', [31.9038, 35.2043]],
  ['Rafidia Hospital Nablus', [32.2285, 35.2375]], ['مستشفى رفيديا', [32.2285, 35.2375]],
  ['Hebron University', [31.5453, 35.0937]], ['Ibrahimi Mosque Hebron', [31.5247, 35.1107]], ['الحرم الإبراهيمي الخليل', [31.5247, 35.1107]],
  ['Arab American University Jenin', [32.4095, 35.3400]], ['Hisham Palace Jericho', [31.8854, 35.4602]],
  ['Qalandia checkpoint', [31.8650, 35.2175]], ['Huwara', [32.1525, 35.2560]], ['حوارة', [32.1525, 35.2560]], ['Tulkarm', [32.3104, 35.0286]],
]);
for (const row of prev.places) {
  const t = truth[row.query];
  const s = aws('geo-places', 'search-text', '--query-text', row.query, '--bias-position', '35.2', '31.9', '--max-results', '1');
  const p = s.ResultItems?.[0];
  row.aws = p ? { km: +km(t, [p.Position[1], p.Position[0]]).toFixed(2), name: p.Title } : (s.error ?? null);
}
for (const row of prev.routes) {
  const pts = { 'Ramallah→Nablus': [[35.2034, 31.9038], [35.2544, 32.2211]], 'Jenin→Nablus': [[35.2950, 32.4610], [35.2544, 32.2211]],
    'Hebron→Bethlehem': [[35.0998, 31.5326], [35.2024, 31.7054]], 'Ramallah→Jericho': [[35.2034, 31.9038], [35.4500, 31.8667]],
    'Ramallah→Bethlehem': [[35.2034, 31.9038], [35.2024, 31.7054]] }[row.label];
  const r = aws('geo-routes', 'calculate-routes', '--origin', String(pts[0][0]), String(pts[0][1]), '--destination', String(pts[1][0]), String(pts[1][1]), '--travel-mode', 'Car', '--leg-geometry-format', 'Simple');
  const rt = r.Routes?.[0];
  if (rt) {
    const line = rt.Legs.flatMap(l => l.Geometry?.LineString ?? []);
    row.aws = { km: +(rt.Summary.Distance / 1000).toFixed(1), min: Math.round(rt.Summary.Duration / 60), viaJerusalem: line.some(([lon, lat]) => km([lat, lon], [31.7780, 35.2250]) < 3) };
  } else row.aws = r.error ?? r;
}
writeFileSync(process.argv[3], JSON.stringify(prev, null, 1));
const hit = v => v && typeof v === 'object' && v.km < 1.5;
console.table(prev.places.map(r => ({ query: r.query, azureKm: r.azure?.km ?? 'none', awsKm: r.aws?.km ?? (typeof r.aws === 'string' ? r.aws.slice(0, 40) : 'none'), osmKm: r.osm?.km ?? 'none' })));
console.log('hits <1.5km  azure', prev.places.filter(r => hit(r.azure)).length, ' aws', prev.places.filter(r => hit(r.aws)).length, ' osm', prev.places.filter(r => hit(r.osm)).length, ' of', prev.places.length);
console.table(prev.routes.map(r => ({ route: r.label, azure: r.azure && `${r.azure.km}km ${r.azure.min}m${r.azure.viaJerusalem ? ' viaJLM' : ''}`, aws: r.aws?.km ? `${r.aws.km}km ${r.aws.min}m${r.aws.viaJerusalem ? ' viaJLM' : ''}` : JSON.stringify(r.aws).slice(0, 50), osrm: `${r.osrm.km}km ${r.osrm.min}m${r.osrm.viaJerusalem ? ' viaJLM' : ''}` })));
