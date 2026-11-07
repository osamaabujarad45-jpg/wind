// Read-only deployment wiring check. This does not create accounts or orders.
import { readFile } from 'node:fs/promises';

const originIndex = process.argv.indexOf('--origin');
const rawOrigin = originIndex < 0 ? undefined : process.argv[originIndex + 1];
let url;
try { url = new URL(rawOrigin); } catch { throw new Error('Provide --origin https://your-public-api-origin'); }
const localFixture = process.argv.includes('--fixture') && process.env.NODE_ENV === 'test'
  && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
if ((!localFixture && url.protocol !== 'https:') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
  throw new Error('The deployment origin must be HTTPS and contain no credentials, path, query or fragment');
}
const origin = url.origin;
const checks = [];
const record = (name, ok, detail = '') => checks.push({ name, ok, detail });
async function get(path) {
  const target = new URL(path, origin);
  if (target.origin !== origin) throw new Error('Unexpected cross-origin URL');
  const response = await fetch(target, { signal: AbortSignal.timeout(15_000) });
  if (new URL(response.url).origin !== origin) throw new Error('Unexpected cross-origin redirect');
  return { status: response.status, type: response.headers.get('content-type') ?? '', cache: response.headers.get('cache-control'), body: await response.text() };
}
async function check(name, fn) {
  try { await fn(); } catch (error) { record(name, false, error instanceof Error ? error.message : 'Request failed'); }
}
function json(response) {
  if (response.status !== 200 || !response.type.includes('application/json')) return null;
  try { return JSON.parse(response.body); } catch { return null; }
}
for (const path of ['/api/health', '/api/ready']) await check(path, async () => {
  const response = await get(path);
  record(path, json(response)?.ok === true, `HTTP ${response.status}`);
});
await check('authentication capabilities', async () => {
  const response = await get('/api/auth/options'), data = json(response);
  record('authentication capabilities', typeof data?.registrationOpen === 'boolean' && typeof data?.emailReset === 'boolean', `HTTP ${response.status}`);
});
await check('unauthenticated tracking access', async () => {
  const response = await get('/api/orders/1/live');
  record('unauthenticated tracking access', response.status === 401, `HTTP ${response.status}`);
});
for (const path of ['/privacy', '/terms', '/account-deletion']) await check(path, async () => {
  const response = await get(path);
  record(path, response.status === 200 && response.type.includes('text/html') && response.body.length > 100, `HTTP ${response.status}`);
});
await check('current map page', async () => {
  const response = await get('/map.html');
  const expected = await readFile(new URL('../public/map.html', import.meta.url), 'utf8');
  const normalize = value => value.replace(/\r\n/g, '\n');
  record('current map page', response.status === 200 && normalize(response.body) === normalize(expected), `HTTP ${response.status}; compare with source`);
});
await check('versioned map page', async () => {
  const response = await get('/map/v1/map.html');
  const expected = await readFile(new URL('../public/map.html', import.meta.url), 'utf8');
  record('versioned map page', response.status === 200 && response.body.replace(/\r\n/g, '\n') === expected.replace(/\r\n/g, '\n')
    && response.cache === 'public, max-age=86400', `HTTP ${response.status}; bridge v1 bytes and cache lifetime`);
});
await check('web bundle API origin', async () => {
  const home = await get('/');
  const scripts = [...home.body.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map(match => match[1]).filter(path => path.includes('/_expo/static/js/web/'));
  if (home.status !== 200 || !scripts.length) return record('web bundle API origin', false, 'Web bundle is missing');
  const bundles = await Promise.all(scripts.map(get));
  record('web bundle API origin', bundles.every(bundle => bundle.status === 200) && bundles.some(bundle => bundle.body.includes(origin)),
    `Expected ${origin} in the served bundle`);
});
for (const result of checks) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.detail ? `: ${result.detail}` : ''}`);
if (checks.some(result => !result.ok)) process.exitCode = 1;
console.log('Deployment wiring only; provider delivery, real journeys, backups and distribution require separate verification.');
