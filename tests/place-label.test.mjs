// Pin labels (server/place-label.ts): one SingleUse reverse geocode per settled pin, readable script only, never cached,
// no paid lookup outside the served area, signed-in and rate-limited at the API.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';
import { placeLabel } from '../server/place-label.ts';

// Fake Amazon Location Places: records each request and answers with the next queued address (or a status).
const seen = [];
let answer = { Street: 'يافا', Locality: 'رام الله' };
const places = createServer((req, res) => {
  let raw = '';
  req.on('data', chunk => { raw += chunk; });
  req.on('end', () => {
    seen.push({ url: req.url, body: JSON.parse(raw) });
    if (typeof answer === 'number') return res.writeHead(answer).end('{}');
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ResultItems: answer ? [{ Address: answer }] : [] }));
  });
});
await new Promise(resolve => places.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${places.address().port}`;
const ramallah = { latitude: 31.9038, longitude: 35.2034 };

assert.equal(await placeLabel('k+1', ramallah, 'ar', base), 'يافا، رام الله');
assert.equal(seen[0].url, '/v2/reverse-geocode?key=k%2B1');
assert.deepEqual(seen[0].body, { QueryPosition: [35.2034, 31.9038], Language: 'ar', MaxResults: 1, IntendedUse: 'SingleUse',
  Filter: { IncludePlaceTypes: ['Street', 'PointAddress', 'InterpolatedAddress', 'Intersection'] } });
const hebron = { latitude: 31.5246, longitude: 35.1107 }; // by the Ibrahimi Mosque
answer = { Street: 'عيمك حيفرون', Locality: 'كريات أربع' }; // the live answer there
assert.equal(await placeLabel('k', hebron, 'ar', base), 'عيمك حيفرون، الخليل', "the place is Wind's served city, never the provider's locality");
answer = { Street: 'Emek Hevron', Locality: 'Kiryat Arba' };
assert.equal(await placeLabel('k', hebron, 'en', base), 'Emek Hevron, Hebron');
assert.equal(await placeLabel('k', hebron, 'ar', base), null, 'Latin street in an Arabic label: no label');
answer = { Street: 'דרך האבות', Locality: 'Hebron' };
assert.equal(await placeLabel('k', hebron, 'en', base), null, 'Hebrew never shown');
answer = { District: 'البالوع', Locality: 'البيرة' };
assert.equal(await placeLabel('k', ramallah, 'ar', base), 'البالوع، رام الله', 'district when there is no street');
answer = { Locality: 'رام الله' };
assert.equal(await placeLabel('k', ramallah, 'ar', base), null, 'a city alone adds nothing the app does not know');
answer = null;
assert.equal(await placeLabel('k', ramallah, 'ar', base), null);
answer = 500;
assert.equal(await placeLabel('k', ramallah, 'ar', base), null, 'provider failure is no label, not an error');
const before = seen.length;
assert.equal(await placeLabel('k', { latitude: 31.7683, longitude: 35.0 }, 'ar', base), null);
assert.equal(seen.length, before, 'no paid lookup outside the served area');

// Through the API: a capability, signed-in only, invalid points refused, the same pin asked twice is asked twice.
answer = { Street: 'يافا', Locality: 'رام الله' };
const dir = mkdtempSync(join(tmpdir(), 'wind-place-label-'));
for (const key of ['WIND_EMAIL_FROM', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_EMAIL_TOKEN']) delete process.env[key];
Object.assign(process.env, { DB_PATH: join(dir, 'test.db'), WIND_IDENTITY_MODE: 'self-service', WIND_ENABLED_SERVICES: 'parcel',
  WIND_LOCATION_KEY: 'server-key', WIND_LOCATION_ENDPOINT: base });
const { server, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
try {
  const user = await call('/auth/register', { body: { name: 'Pin User', email: 'pin@mail.example', phone: '0599720001', password: 'Correct-Horse-12', consent: true } });
  assert.equal(user.capabilities.placeLabels, true);
  await call('/place-label?at=31.9038,35.2034', { expect: 401 });
  assert.equal((await call('/place-label?at=north,south', { token: user.token, expect: 400 })).error, 'invalid_location');
  const asked = seen.length;
  for (let i = 0; i < 2; i++)
    assert.deepEqual(await call('/place-label?at=31.9038,35.2034&lang=ar', { token: user.token }), { label: 'يافا، رام الله', attribution: '© AWS, HERE' });
  assert.equal(seen.length, asked + 2, 'nothing cached (AWS Service Terms 82.4a)');
  assert.equal(seen.at(-1).url, '/v2/reverse-geocode?key=server-key');
  answer = 503;
  assert.deepEqual(await call('/place-label?at=31.9038,35.2034', { token: user.token }), { label: null, attribution: null });
  for (let i = 0; i < 26; i++) await call('/place-label?at=31.9038,35.2034', { token: user.token }); // 30 in 10 minutes, the refused point included
  assert.equal((await call('/place-label?at=31.9038,35.2034', { token: user.token, expect: 429 })).error, 'too_many_attempts');
  console.log('Place label checks passed: SingleUse request, script filter, no lookup outside the area, no cache, capability, auth, rate limit');
} finally {
  await shutdown();
  places.close();
  rmSync(dir, { recursive: true, force: true });
}
