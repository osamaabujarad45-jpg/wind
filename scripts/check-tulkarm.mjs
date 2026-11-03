// A whole day-to-day trip in Tulkarm, in a phone-sized browser against a throwaway API: open on the map at your position,
// search a real place as you type, confirm a spot on the pin, see road, price and minutes, request, a driver takes it and
// drives there turn by turn while the customer watches the car.
//   OSRM_URL=http://... node scripts/check-tulkarm.mjs [--web=<web export>] [--out=<folder for screenshots>]
// Needs a web export built for http://localhost:4000 (or --port) (WIND_LOCAL_TEST=1) and a reachable OSRM.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = resolve(import.meta.dirname, '..');
const web = resolve(arg('web') ?? join(root, '.expo/web-local')), out = resolve(arg('out') ?? join(tmpdir(), 'wind-tulkarm'));
const language = arg('lang') === 'en' ? 'en' : 'ar';
mkdirSync(out, { recursive: true });
process.env.WEB_ROOT = web;
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-tulkarm-')), 'tulkarm.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride,freight';
process.env.WIND_IDENTITY_MODE = 'self-service';
for (const key of ['WIND_DATABASE_URL', 'DATABASE_URL']) delete process.env[key];
assert.ok(process.env.OSRM_URL, 'OSRM_URL is required: this gate checks real roads');

const PORT = Number(arg('port') ?? 4000), base = `http://localhost:${PORT}`;
const { server, promote, shutdown } = await import('../server/main.ts');
const { copy } = await import('../src/copy.ts');
await new Promise(done => server.listen(PORT, done));
const c = copy[language];

const call = async (path, { token, body, method } = {}) => {
  const res = await fetch(`${base}/api${path}`, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
};
const password = 'Tulkarm_Local_2026';
const register = (phone, name, extra = {}) => call('/auth/register', { body: { phone, name, email: `${phone}@example.test`, consent: true, password, ...extra } });
const admin = await register('0599000901', 'مدير');
await promote('0599000901');
const customer = await register('0599000902', 'سارة');
const driver = await register('0599000903', 'أحمد', { role: 'driver', vehicle: 'car' });
await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
const adminLogin = await call('/auth/login', { body: { identifier: '0599000901', phone: '0599000901', password } }).catch(() => admin);
void adminLogin;
const driverSession = await call('/auth/login', { body: { identifier: '0599000903', phone: '0599000903', password } }).catch(() => driver);

const here = { latitude: 32.3102, longitude: 35.0286 }; // central Tulkarm
const browser = await chromium.launch();
const failures = [], passed = [];
let last; // the page to photograph when a step fails
const open = async (token, at) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, geolocation: { ...at, accuracy: 15 }, permissions: ['geolocation'], locale: language });
  await context.addInitScript(({ token, language }) => { localStorage.setItem('language', language); localStorage.setItem('onboarded', '1'); localStorage.setItem('token', token); }, { token, language });
  const page = last = await context.newPage();
  page.on('pageerror', e => failures.push(`page error: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) failures.push(`console: ${m.text().slice(0, 240)}`); });
  return page;
};
const shot = (page, name) => page.screenshot({ path: join(out, `${language}-${name}.png`) });
const mapFrame = page => page.frameLocator('iframe[title="map"]').first();
const ok = what => { passed.push(what); console.log(`ok - ${what}`); };
const timed = async (what, limit, fn) => {
  const start = performance.now();
  const value = await fn();
  const took = Math.round(performance.now() - start);
  console.log(`   ${what}: ${took} ms`);
  assert.ok(took < limit, `${what} took ${took} ms, limit ${limit}`);
  return value;
};

try {
  // ---- open on the map, at your position
  const page = await open(customer.token, here);
  await page.goto(base);
  await timed('map drawn after opening', 15_000, () => mapFrame(page).locator('canvas.maplibregl-canvas').waitFor());
  await mapFrame(page).locator('.user-dot').waitFor();
  await page.getByText(c.whereTo, { exact: true }).waitFor();
  await page.waitForTimeout(1500);
  await shot(page, '1-home');
  ok('home opens on a full-screen map with the customer\'s own position');

  // ---- search a real Tulkarm place as you type
  await page.getByRole('button', { name: c.whereTo, exact: true }).first().click();
  await page.getByPlaceholder(c.whereTo).fill(language === 'ar' ? 'خضوري' : 'Palestine Technical');
  const result = page.getByRole('button', { name: language === 'ar' ? /خضوري/ : /Palestine Technical/ }).first();
  await timed('first suggestion after typing', 3000, () => result.waitFor());
  await shot(page, '2-search');
  ok('typing finds a real Tulkarm place at once');
  await result.click();

  // ---- the trip: road, price, minutes, and the pickup is where you stand
  await timed('price ready', 8000, () => page.getByRole('button', { name: new RegExp(`^${c.request}`) }).and(page.locator(':not([aria-disabled="true"])')).first().waitFor());
  await page.getByText(c.pickupHere, { exact: true }).first().waitFor();
  await mapFrame(page).locator('.stop').nth(1).waitFor();
  await page.waitForTimeout(1800);
  await shot(page, '3-trip');
  const routeOnMap = await page.frames().find(f => f.url().includes('/map.html'))?.evaluate(() => true);
  assert.ok(routeOnMap, 'the map page is live');
  ok('trip shows road, price and minutes with GPS as the pickup');

  // ---- correct the pickup on the pin: it lands on a named street
  await page.getByRole('button', { name: new RegExp(c.pickup_ride) }).first().click();
  await page.getByRole('button', { name: c.setOnMap, exact: true }).click();
  await page.getByRole('button', { name: c.confirmPickupSpot, exact: true }).waitFor();
  await page.waitForTimeout(1500);
  const box = await page.locator('iframe[title="map"]').first().boundingBox();
  const touch = await page.context().newCDPSession(page);
  const at = (dx, dy) => [{ x: box.x + box.width / 2 + dx, y: box.y + 300 + dy, id: 1 }];
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0, 0) });
  for (let i = 1; i <= 8; i++) { await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i * 6, i * 8) }); await page.waitForTimeout(16); }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(1500);
  await shot(page, '4-pin');
  await page.getByRole('button', { name: c.confirmPickupSpot, exact: true }).click();
  await timed('back on the trip after the pin', 8000, () => page.getByRole('button', { name: new RegExp(`^${c.request}`) }).first().waitFor());
  ok('dragging the pin names the spot and returns to the trip without a reload');

  // ---- request
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: new RegExp(`^${c.request}`) }).first().click();
  await page.waitForURL(/\/order\/\d+$/, { timeout: 20_000 });
  const orderId = Number(new URL(page.url()).pathname.split('/').pop());
  await page.getByText(c.findingTitle, { exact: true }).waitFor();
  await page.waitForTimeout(1500);
  await shot(page, '5-searching');
  ok(`one tap requests the ride (order ${orderId}) and the map stays on screen`);

  // ---- a driver takes it
  const driverAt = { latitude: 32.3189, longitude: 35.0205 };
  const driverPage = await open(driverSession.token, driverAt);
  await driverPage.goto(`${base}/order/${orderId}`);
  await driverPage.getByRole('button', { name: c.accept, exact: true }).click();
  await driverPage.waitForFunction(() => true);
  let position = driverAt;
  const sent = () => call('/location', { token: driverSession.token, body: { ...position, accuracy: 8, heading: 140 } });
  await sent();
  const gps = setInterval(() => { void sent().catch(() => undefined); }, 3000); // a phone reports every few seconds
  await mapFrame(page).locator('.driver-marker').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  await shot(page, '6-customer-live');
  ok('customer sees the car on the road toward them');

  await driverPage.reload();
  await driverPage.getByRole('button', { name: new RegExp(c.back) }).first().waitFor();
  await mapFrame(driverPage).locator('.driver-marker').waitFor({ timeout: 30_000 });
  await driverPage.waitForTimeout(4000);
  await shot(driverPage, '7-driver-nav');
  const banner = await driverPage.locator('text=/(بعد|In) [0-9.]+ ?(م|كم|m|km)/').count();
  assert.ok(banner > 0, 'the driver sees the next turn with its distance');
  ok('driver navigates turn by turn on the full-screen map');

  // ---- the car moves and the customer's map follows
  for (const point of [{ latitude: 32.3165, longitude: 35.0235 }, { latitude: 32.3145, longitude: 35.0255 }]) { position = point; await page.waitForTimeout(4000); }
  await page.waitForTimeout(12_000);
  await shot(page, '8-customer-moving');
  clearInterval(gps);
  ok('fixes keep moving the car');

  assert.deepEqual(failures, [], 'no unhandled browser errors');
  console.log(`\nTulkarm journey passed (${passed.length} checks). Screenshots: ${out}`);
} catch (error) {
  console.error('FAILED', error.message);
  await last?.screenshot({ path: join(out, `${language}-failed.png`) }).catch(() => undefined);
  console.error('browser errors', failures.slice(0, 10));
  process.exitCode = 1;
} finally {
  await browser.close();
  await shutdown?.().catch?.(() => undefined);
  process.exit(process.exitCode ?? 0);
}
