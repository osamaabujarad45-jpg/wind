// Screenshots every screen of the app, in Arabic and English, with realistic data, and writes an index
// that maps each screenshot to its route and source file. The output (docs/screens/) is what Claude Code
// (or a reviewer) reads to see the app without running it.
//
//   npm run screens                 build the web app, seed a throwaway API, capture everything
//   npm run screens -- --no-build   reuse the last web build in .screens/web (only when no code changed since)
//   npm run screens -- --only=home,receipt   capture a subset (ids from the table below)
//
// First time on a machine: npx playwright install chromium
// Uses a temporary database; your wind.db is never touched.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const only = args.find(a => a.startsWith('--only='))?.slice(7).split(',');
const API_PORT = 4100, WEB_PORT = 4101;
const webDir = join(root, '.screens', 'web');
const outDir = join(root, 'docs', 'screens');
const phone = { width: 390, height: 844 };

// ---------- 1. throwaway API with seeded data ----------
const dbDir = mkdtempSync(join(tmpdir(), 'wind-screens-'));
process.env.DB_PATH = join(dbDir, 'screens.db');
for (const key of ['WIND_DATABASE_URL', 'WIND_POSTGRES_TEST_ONLY', 'WIND_POSTGRES_TEST_SCHEMA', 'DATABASE_URL']) delete process.env[key];
// Synthetic screenshots also cover gated legacy services; production defaults stay parcel-only.
process.env.WIND_ENABLED_SERVICES = 'parcel,ride,freight';
process.env.WIND_IDENTITY_MODE = 'self-service';
// Deterministic West Bank road fixture (recorded OSRM highway geometries, with curved fallback) so every route map draws real road lines offline.
const recordedRoutes = JSON.parse(readFileSync(join(root, 'scripts', 'screens-routes.json'), 'utf8'));
function syntheticRoad([lng1, lat1], [lng2, lat2]) {
  const dx = lng2 - lng1, dy = lat2 - lat1, span = Math.hypot(dx, dy);
  if (span < 0.0002) return [[lng1, lat1], [lng2, lat2]];
  const nx = -dy / span, ny = dx / span, steps = 16, coords = [];
  const sign = ((Math.round((lat1 + lng1) * 1000) % 2) === 0 ? 1 : -1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bend = sign * span * (0.09 * Math.sin(Math.PI * t) + 0.035 * Math.sin(2 * Math.PI * t));
    coords.push([Number((lng1 + dx * t + nx * bend).toFixed(5)), Number((lat1 + dy * t + ny * bend).toFixed(5))]);
  }
  return coords;
}
const osrm = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const raw = pathname.split('/driving/')[1] ?? '';
  const waypoints = raw.split(';').map(pair => pair.split(',').map(Number)).filter(p => p.length === 2 && p.every(Number.isFinite));
  if (waypoints.length < 2) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: 'InvalidQuery' })); return; }
  const lookupKey = waypoints.map(([lng, lat]) => `${lng.toFixed(4)},${lat.toFixed(4)}`).join(';');
  const recorded = recordedRoutes[lookupKey];
  let coordinates, distance, duration;
  if (recorded) {
    ({ coordinates, distance, duration } = recorded);
  } else {
    coordinates = [];
    for (let i = 1; i < waypoints.length; i++) {
      const seg = syntheticRoad(waypoints[i - 1], waypoints[i]);
      coordinates.push(...(i === 1 ? seg : seg.slice(1)));
    }
    const kx = 111_320 * Math.cos(waypoints[0][1] * Math.PI / 180), ky = 110_540;
    let metres = 0;
    for (let i = 1; i < coordinates.length; i++)
      metres += Math.hypot((coordinates[i][0] - coordinates[i - 1][0]) * kx, (coordinates[i][1] - coordinates[i - 1][1]) * ky);
    distance = Math.max(400, Math.round(metres * 1.12));
    duration = Math.max(90, Math.round(distance / 13.5));
  }
  const mid = coordinates[Math.min(coordinates.length - 1, Math.max(1, Math.floor(coordinates.length * 0.15)))];
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    code: 'Ok',
    routes: [{
      distance,
      duration,
      geometry: { type: 'LineString', coordinates },
      legs: [{ steps: [
        { maneuver: { type: 'depart', location: coordinates[0] }, name: 'طريق وادي النار' },
        { maneuver: { type: 'turn', modifier: 'left', location: mid }, name: 'شارع المهد' },
        { maneuver: { type: 'arrive', location: coordinates.at(-1) }, name: '' },
      ] }],
    }],
  }));
});
await new Promise(resolve => osrm.listen(0, '127.0.0.1', resolve));
process.env.OSRM_URL = `http://127.0.0.1:${osrm.address().port}`;
const { db, server, promote } = await import('../server/main.ts');
const { quote, defaultSettings } = await import('../src/model.ts');
const { scheduleSlots } = await import('../src/booking.ts');
const { copy } = await import('../src/copy.ts');
await new Promise(resolve => server.listen(API_PORT, resolve));
const api = `http://localhost:${API_PORT}/api`;

async function call(path, token, body, expected = 200) {
  if (path.endsWith('/advance') && body && !body.expectedStatus) {
    const order = await call(path.slice(0, -'/advance'.length), token);
    body = { ...body, expectedStatus: order.status, requestId: randomUUID() };
  }
  const res = await fetch(api + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json();
  if (res.status !== expected) throw new Error(`${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}
const register = (phone, name, extra = {}) => call('/auth/register', null, { phone, name, email: `${phone}@example.test`, consent: true, password: 'Screenshot_Secret1', ...extra });

const layla = await register('0599000001', 'ليلى حداد');
const omar = await register('0599000004', 'عمر ناصر');
const ahmad = await register('0599000002', 'أحمد يوسف', { role: 'driver', vehicle: 'car' });
const sami = await register('0569000003', 'سامي خليل', { role: 'driver', vehicle: 'van' }); // stays pending
const boss = await register('0599000009', 'إدارة ويند');
await promote('0599000009');
await call(`/admin/users/${ahmad.user.id}/approve`, boss.token, {});

// Layla has Wind Plus (requested, then activated by the admin); Omar and Ahmad have requests waiting.
const laylaSub = await call('/subscriptions', layla.token, {});
await call(`/admin/subscriptions/${laylaSub.subscription.id}`, boss.token, { action: 'activate' });
await call('/subscriptions', omar.token, {});
await call('/subscriptions', ahmad.token, {});

async function order(who, plus, o) {
  const body = { shared: false, option: o.service === 'ride' ? '1' : 'small', contact: who.user.phone, detail: '', loadingHelp: false, ...o };
  body.quotedPrice = quote(defaultSettings, { ...body, plus });
  return call('/orders', who.token, body);
}
// Smart pricing (SPEC-driver-offers.md): the server recommends, drivers may offer their own price.
async function smartOrder(who, o) {
  const body = { shared: false, option: 'small', contact: who.user.phone, detail: '', loadingHelp: false, pricing: 'smart', ...o };
  body.quotedPrice = (await call('/price', who.token, body)).price;
  return call('/orders', who.token, body);
}
const completed = await order(layla, true, { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus',
  pickupNote: 'محل الزهراء، شارع ركب', dropoffNote: 'دوار الشهداء، بجانب الصيدلية', detail: 'صندوق ملابس وهدية', option: 'medium' });
const inTransit = await order(layla, true, { service: 'ride', pickupCity: 'ramallah', dropoffCity: 'bethlehem',
  pickupNote: 'دوار المنارة', dropoffNote: 'ساحة المهد', option: '2', detail: 'معي عربة أطفال' });
// A ride: drivers offer on rides and freight; parcels have one standard price (SPEC-parcel-standard.md).
const searching = await smartOrder(layla, { service: 'ride', option: '1', pickupCity: 'bireh', dropoffCity: 'tulkarm',
  pickupNote: 'مكتبة الجامعة', dropoffNote: 'مدخل السوق' });
// Booked for tomorrow: the customer can still move it until drivers see it.
const scheduled = await order(layla, true, { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'hebron', pickupNote: 'مكتب البريد', dropoffNote: 'باب الزاوية',
  detail: 'أوراق جامعية', scheduledFor: scheduleSlots().find(s => s > Date.now() + 20 * 3_600_000) });
await order(omar, false, { service: 'ride', pickupCity: 'nablus', dropoffCity: 'jenin', pickupNote: 'مجمع الكراجات', dropoffNote: 'مستشفى جنين' });
await order(omar, false, { service: 'freight', pickupCity: 'hebron', dropoffCity: 'jericho', option: 'large', loadingHelp: true,
  pickupNote: 'عين سارة، عمارة 4', dropoffNote: 'شارع عمّان', detail: 'ثلاجة وغسالة، الطابق الثاني' });

// Ahmad delivers the parcel (with Layla's handover code), then picks up the ride.
await call(`/jobs/${completed.id}/accept`, ahmad.token, {});
await call(`/orders/${completed.id}/advance`, ahmad.token, {});
await call(`/orders/${completed.id}/advance`, ahmad.token, {});
await call(`/orders/${completed.id}/advance`, ahmad.token, { code: completed.handoverCode });
await call(`/orders/${completed.id}/rate`, layla.token, { rating: 5 });
await call(`/jobs/${inTransit.id}/accept`, ahmad.token, {});
await call(`/orders/${inTransit.id}/advance`, ahmad.token, {});
await call(`/orders/${inTransit.id}/advance`, ahmad.token, {});
await call('/location', ahmad.token, { latitude: 31.7420, longitude: 35.2837, heading: 235 });

// A separate driver carries one parcel with locked code attempts for the admin recovery flow.
const recoveryDriver = await register('0599000006', 'يوسف عودة', { role: 'driver', vehicle: 'van' });
await call(`/admin/users/${recoveryDriver.user.id}/approve`, boss.token, {});
const idleDriver = await register('0599000007', 'كريم علي', { role: 'driver', vehicle: 'car' });
await call(`/admin/users/${idleDriver.user.id}/approve`, boss.token, {});
await call(`/jobs/${searching.id}/offer`, idleDriver.token, { price: searching.price - 3 }); // Layla sees one driver offer
const proofRecovery = await order(layla, true, { service: 'parcel', pickupCity: 'bireh', dropoffCity: 'nablus', recipientName: 'هدى سمارة', recipientPhone: '0599123456',
  pickupNote: 'مكتبة الجامعة', dropoffNote: 'دوار الشهداء', detail: 'طرد هدية', option: 'small' });
await call(`/jobs/${proofRecovery.id}/accept`, recoveryDriver.token, {});
await call(`/orders/${proofRecovery.id}/advance`, recoveryDriver.token, {});
await call(`/orders/${proofRecovery.id}/advance`, recoveryDriver.token, {});
for (let attempt = 0; attempt < 5; attempt++)
  await call(`/orders/${proofRecovery.id}/advance`, recoveryDriver.token, { code: '0000' }, 400);
// Yousef's van carries a parcel run (SPEC-run-sheet.md): two more for Nablus on board, one still to collect in Ramallah.
for (const [pickupCity, dropoffCity, pickupNote, dropoffNote, onBoard] of [['ramallah', 'nablus', 'محل الزهراء', 'شارع فيصل', true],
  ['bireh', 'nablus', 'مكتبة الجامعة', 'رفيديا', true], ['ramallah', 'jenin', 'دوار المنارة', 'مستشفى جنين', false]]) {
  const parcel = await order(omar, false, { service: 'parcel', pickupCity, dropoffCity, pickupNote, dropoffNote, detail: 'طرد' });
  await call(`/jobs/${parcel.id}/accept`, recoveryDriver.token, {});
  if (onBoard) for (let step = 0; step < 2; step++) await call(`/orders/${parcel.id}/advance`, recoveryDriver.token, {});
}

// ---------- 2. web build + static server ----------
if (!args.includes('--no-build') || !existsSync(join(webDir, 'index.html'))) {
  console.log('Building the web app…');
  rmSync(webDir, { recursive: true, force: true });
  const built = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', webDir], {
    cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, CI: '1', WIND_LOCAL_TEST: '1', EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH: '1', EXPO_UNSTABLE_TREE_SHAKING: '1', // same bundle as the Dockerfile
      EXPO_PUBLIC_API_URL: `http://localhost:${API_PORT}`, EXPO_PUBLIC_SUPPORT_WHATSAPP: '970590000000' },
  });
  if (built.status !== 0) throw new Error('expo export failed');
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.json': 'application/json' };
const web = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(webDir, path);
  if (!file.startsWith(webDir) || !existsSync(file) || statSync(file).isDirectory()) file = join(webDir, 'index.html'); // SPA fallback
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise(resolve => web.listen(WEB_PORT, resolve));

// ---------- 3. what to capture ----------
// role: whose session (null = signed out). motion: keep animations running (default: reduced motion for stable shots).
const screens = [
  { id: 'intro', group: 'Launch', name: 'Animated intro', route: '/', file: 'src/intro.tsx', role: null, fresh: true, frames: [150, 450, 750, 1050, 1400] },
  { id: 'welcome-1', group: 'Launch', name: 'Welcome · services', route: '/', file: 'src/app/welcome.tsx', role: null, fresh: true },
  { id: 'welcome-2', group: 'Launch', name: 'Welcome · clear pricing', route: '/', file: 'src/app/welcome.tsx', role: null, fresh: true, clicks: ['next'] },
  { id: 'welcome-3', group: 'Launch', name: 'Welcome · track & handover', route: '/', file: 'src/app/welcome.tsx', role: null, fresh: true, clicks: ['next', 'next'] },
  { id: 'sign-in', group: 'Launch', name: 'Sign in', route: '/auth', file: 'src/app/auth.tsx', role: null },
  { id: 'sign-up', group: 'Launch', name: 'Create account (driver)', route: '/auth', file: 'src/app/auth.tsx', role: null, clicks: ['signUp', 'driver'] },
  { id: 'sign-up-customer', group: 'Launch', name: 'Create account (customer)', route: '/auth', file: 'src/app/auth.tsx', role: null, clicks: ['signUp'] },
  { id: 'sign-in-phone-recovery', group: 'Launch', name: 'Sign in · reset with a phone code (synthetic capability, generic reply)', route: '/auth', file: 'src/phone-recovery.tsx', role: null, state: 'phone-recovery' },
  { id: 'help', group: 'Launch', name: 'Help & support', route: '/help?topic=password', file: 'src/app/help.tsx', role: null },

  { id: 'home', group: 'Customer', name: 'Home', route: '/', file: 'src/app/(customer)/index.tsx', role: 'customer' },
  { id: 'book-parcel', group: 'Customer', name: 'Book a parcel', route: '/book?service=parcel', file: 'src/app/book.tsx', role: 'customer' },
  { id: 'book-ride', group: 'Customer', name: 'Book a ride', route: '/book?service=ride', file: 'src/app/book.tsx', role: 'customer' },
  { id: 'book-calculating', group: 'Customer', name: 'Book a ride · price being calculated (Request disabled, reason shown)', route: '/book?service=ride&from=ramallah&to=nablus', file: 'src/app/book.tsx', role: 'customer', state: 'calculating' },
  { id: 'book-freight', group: 'Customer', name: 'Book a load', route: '/book?service=freight', file: 'src/app/book.tsx', role: 'customer' },
  { id: 'book-again', group: 'Customer', name: 'Order again (form copied from a delivered order)', route: `/book?again=${completed.id}`, file: 'src/app/book.tsx', role: 'customer' },
  { id: 'book-send-another', group: 'Customer', name: 'Send another parcel (pickup copied, new recipient)', route: `/book?again=${proofRecovery.id}&keep=pickup`, file: 'src/app/book.tsx', role: 'customer' },
  { id: 'orders', group: 'Customer', name: 'My orders', route: '/orders', file: 'src/app/(customer)/orders.tsx', role: 'customer' },
  { id: 'order-searching', group: 'Customer', name: 'Order · finding a driver', route: `/order/${searching.id}`, file: 'src/app/order/[id].tsx', role: 'customer', motion: true },
  { id: 'order-scheduled', group: 'Customer', name: 'Parcel · scheduled, changing its time', route: `/order/${scheduled.id}`, file: 'src/app/order/[id].tsx', role: 'customer', clicks: ['changeTime'] },
  { id: 'order-live', group: 'Customer', name: 'Order · on the way', route: `/order/${inTransit.id}`, file: 'src/app/order/[id].tsx', role: 'customer', fix: true },
  { id: 'order-parcel-live', group: 'Customer', name: 'Parcel · awaiting handover', route: `/order/${proofRecovery.id}`, file: 'src/app/order/[id].tsx', role: 'customer' },
  { id: 'order-done', group: 'Customer', name: 'Order · delivered', route: `/order/${completed.id}`, file: 'src/app/order/[id].tsx', role: 'customer' },
  { id: 'receipt', group: 'Customer', name: 'Receipt', route: `/receipt/${completed.id}`, file: 'src/app/receipt/[id].tsx', role: 'customer' },
  { id: 'account', group: 'Customer', name: 'Account', route: '/account', file: 'src/parts.tsx (AccountScreen)', role: 'customer' },
  { id: 'profile', group: 'Customer', name: 'Edit profile', route: '/profile', file: 'src/app/profile.tsx', role: 'customer' },
  { id: 'profile-phone-ready', group: 'Customer', name: 'Edit profile · phone verification available (synthetic reply, Verify live)', route: '/profile', file: 'src/phone-card.tsx', role: 'customer', state: 'phone-ready' },
  { id: 'profile-phone-code', group: 'Customer', name: 'Edit profile · code requested, provider accepted (synthetic), not confirmed as delivered', route: '/profile', file: 'src/phone-card.tsx', role: 'customer', state: 'phone-code' },
  { id: 'profile-phone-change', group: 'Customer', name: 'Edit profile · change number form (new number and current password, synthetic capability)', route: '/profile', file: 'src/phone-card.tsx', role: 'customer', state: 'phone-change' },

  { id: 'driver-pending', group: 'Driver', name: 'Awaiting approval', route: '/driver', file: 'src/app/driver/index.tsx', role: 'pending' },
  { id: 'driver-jobs', group: 'Driver', name: 'Jobs', route: '/driver', file: 'src/app/driver/index.tsx', role: 'driver' },
  { id: 'driver-idle', group: 'Driver', name: 'Jobs · no job assigned, presence card offline (go-online not pressed)', route: '/driver', file: 'src/app/driver/index.tsx', role: 'idle' },
  { id: 'driver-run-sheet', group: 'Driver', name: 'Parcel run sheet (pickups and deliveries by city)', route: '/driver/trips', file: 'src/app/driver/trips.tsx', role: 'courier' },
  { id: 'driver-order', group: 'Driver', name: 'Active trip', route: `/order/${inTransit.id}`, file: 'src/app/order/[id].tsx', role: 'driver' },
  { id: 'driver-trips', group: 'Driver', name: 'My trips', route: '/driver/trips', file: 'src/app/driver/trips.tsx', role: 'driver' },
  { id: 'driver-earnings', group: 'Driver', name: 'Earnings', route: '/driver/earnings', file: 'src/app/driver/earnings.tsx', role: 'driver' },
  { id: 'driver-receipt', group: 'Driver', name: 'Receipt (driver view)', route: `/receipt/${completed.id}`, file: 'src/app/receipt/[id].tsx', role: 'driver' },
  { id: 'driver-account', group: 'Driver', name: 'Account', route: '/driver/account', file: 'src/parts.tsx (AccountScreen)', role: 'driver' },
  { id: 'driver-offer-range', group: 'Driver', name: 'Jobs · offer price outside the band (Send offer disabled, band shown)', route: '/driver', file: 'src/app/driver/index.tsx', role: 'freshDriver', state: 'offer-range' },

  { id: 'admin-dashboard', group: 'Admin', name: 'Dashboard', route: '/admin', file: 'src/app/admin/index.tsx', role: 'admin' },
  { id: 'admin-orders', group: 'Admin', name: 'All orders', route: '/admin/orders', file: 'src/app/admin/orders.tsx', role: 'admin' },
  { id: 'admin-order', group: 'Admin', name: 'Parcel · delivery code recovery', route: `/order/${proofRecovery.id}`, file: 'src/app/order/[id].tsx', role: 'admin' },
  { id: 'admin-users', group: 'Admin', name: 'Users', route: '/admin/users', file: 'src/app/admin/users.tsx', role: 'admin' },
  { id: 'admin-subscriptions', group: 'Admin', name: 'Subscriptions', route: '/admin/subscriptions', file: 'src/app/admin/subscriptions.tsx', role: 'admin' },
  { id: 'admin-settings', group: 'Admin', name: 'Tariffs & settings', route: '/admin/settings', file: 'src/app/admin/settings.tsx', role: 'admin' },
].filter(s => !only || only.includes(s.id));
const tokens = { customer: layla.token, driver: ahmad.token, courier: recoveryDriver.token, idle: idleDriver.token, pending: sami.token, admin: boss.token };

// ---------- 4. capture ----------
const { chromium } = await import('playwright');
const browser = await chromium.launch(process.env.SCREENS_CHROMIUM ? { executablePath: process.env.SCREENS_CHROMIUM } : {});
const shots = [];
// Wait for any visible map iframe to finish loading its route geometry (a route map with two stops needs the road line).
async function waitForMaps(targetPage) {
  for (const frame of targetPage.frames().filter(f => f.url().includes('/map.html'))) {
    await frame.waitForFunction(() => {
      const m = window.windMap;
      if (!m?.loaded()) return false;
      const hasStops = document.querySelectorAll('.stop').length >= 2;
      return !hasStops || m.getSource('road')?.serialize()?.data?.geometry?.type === 'LineString';
    }, null, { timeout: 12_000 }).catch(() => {});
  }
  if (targetPage.frames().some(f => f.url().includes('/map.html'))) await targetPage.waitForTimeout(450);
}
// A map screen is evidence only once the basemap has drawn; a blank map background is a failed capture, not a screenshot.
async function mapsReady(page, where) {
  // A map can mount after the fixed waits: look again after a short pause and wait for any frame not yet checked.
  const checked = new Set();
  for (let round = 0; round < 3; round++) {
    const frames = page.frames().filter(f => new URL(f.url(), 'http://x').pathname === '/map.html' && !checked.has(f));
    if (!frames.length && round) break;
    for (const frame of frames) {
      checked.add(frame);
      // areTilesLoaded() counts errored tiles as loaded; require a real basemap tile and no error in this camera generation.
      const drawn = () => frame.waitForFunction(() => window.windBaseTile === true && window.windTileFailed === false && window.windMap?.loaded() && window.windMap.areTilesLoaded(), null, { timeout: 30_000 });
      // One reload for a slow or busy tile server; a map that still has no basemap fails the run rather than shipping a blank screenshot.
      await drawn().catch(async () => { await frame.evaluate(() => location.reload()).catch(() => {}); await drawn(); })
        .catch(() => { throw new Error(`${where}: map tiles never loaded (offline, blocked or slow tile server)`); });
    }
    await page.waitForTimeout(500);
  }
}

for (const language of ['ar', 'en']) {
  mkdirSync(join(outDir, language), { recursive: true });
  for (const screen of screens) {
    if (screen.state) continue; // captured after the scenarios that set them up
    const context = await browser.newContext({ viewport: phone, deviceScaleFactor: 2, locale: language === 'ar' ? 'ar-PS' : 'en-GB',
      reducedMotion: screen.motion || screen.frames || screen.fresh ? 'no-preference' : 'reduce' });
    await context.addInitScript(({ token, language, onboarded }) => {
      if (sessionStorage.getItem('seeded')) return; // only before the first load; the app owns storage after that
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('language', language);
      if (onboarded) localStorage.setItem('onboarded', '1');
      if (token) localStorage.setItem('token', token);
    }, { token: screen.role ? tokens[screen.role] : null, language, onboarded: !screen.fresh });
    const page = await context.newPage();
    const base = `http://localhost:${WEB_PORT}`;

    if (screen.frames) {
      await page.goto(base + screen.route, { waitUntil: 'commit' });
      await page.waitForSelector('text=' + copy[language].brand, { timeout: 30_000 });
      const start = Date.now();
      for (const [i, at] of screen.frames.entries()) {
        await page.waitForTimeout(Math.max(0, at - (Date.now() - start)));
        const file = join(outDir, language, `${screen.id}-${i + 1}.png`);
        await page.screenshot({ path: file });
        shots.push({ ...screen, language, file, frame: i + 1 });
      }
      await context.close();
      continue;
    }

    // The server drops a driver fix after 120 s; send a fresh one so the live screen never depends on run time.
    if (screen.fix) await call('/location', ahmad.token, { latitude: 31.7420, longitude: 35.2837, heading: 235 });
    await page.goto(base + screen.route, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => console.log(`no network idle on ${screen.route}, capturing anyway`)); // a live screen holds a long-poll open
    await page.waitForTimeout(screen.fresh || screen.motion ? 2600 : 1200); // intro + first data load
    for (const click of screen.clicks ?? []) {
      await page.getByText(copy[language][click], { exact: true }).first().click();
      await page.waitForTimeout(700);
    }
    if (screen.motion) await page.waitForTimeout(900); // mid-ripple
    await waitForMaps(page);
    // Full-screen map+sheet screens stay at one phone viewport (as on the device); card/form screens grow to their full scroll height.
    const fullScreenMap = await page.evaluate(() => [...document.querySelectorAll('iframe[title="map"]')]
      .some(f => f.getBoundingClientRect().height >= innerHeight - 8));
    const extra = fullScreenMap ? 0 : await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('div')]
      .filter(d => ['auto', 'scroll'].includes(getComputedStyle(d).overflowY) && d.scrollHeight > d.clientHeight + 4)
      .map(d => d.scrollHeight - d.clientHeight)));
    if (extra) { await page.setViewportSize({ width: phone.width, height: Math.min(phone.height + extra, 2600) }); await page.waitForTimeout(400); }
    await waitForMaps(page);
    await mapsReady(page, `${screen.id} ${language}`);
    const file = join(outDir, language, `${screen.id}.png`);
    await page.screenshot({ path: file });
    shots.push({ ...screen, language, file });
    if (screen.id === 'driver-jobs') {
      await page.getByRole('button', { name: copy[language].activeOrder, exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: copy[language].accept, exact: true }).count() > 0, true);
      for (const button of await page.getByRole('button', { name: copy[language].accept, exact: true }).all()) assert.equal(await button.isDisabled(), true);
    }
    if (screen.id === 'driver-idle') {
      assert.equal(await page.getByRole('button', { name: copy[language].locationOff, exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: copy[language].sharingLocation, exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: copy[language].activeOrder, exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: copy[language].accept, exact: true }).count() > 0, true);
      for (const button of await page.getByRole('button', { name: copy[language].accept, exact: true }).all()) assert.equal(await button.isDisabled(), false);
    }
    if (screen.id === 'order-parcel-live')
      assert.equal(await page.getByRole('button', { name: copy[language].proofResetAction, exact: true }).count(), 0);
    if (screen.id === 'admin-order' && language === 'ar') {
      const reset = page.getByRole('button', { name: copy.ar.proofResetAction, exact: true });
      assert.equal(await reset.isDisabled(), true);
      const reason = 'تم التواصل مع المستلم والتحقق منه';
      await page.getByRole('textbox', { name: copy.ar.proofResetReason, exact: true }).fill(reason);
      page.once('dialog', dialog => dialog.dismiss());
      await reset.click();
      assert.equal(db.prepare('SELECT failures FROM proof_attempts WHERE order_id = ?').get(proofRecovery.id).failures, 5);
      page.once('dialog', dialog => dialog.accept());
      await reset.click();
      await page.getByText(copy.ar.proofResetDone, { exact: true }).waitFor();
      assert.equal(await page.getByText(copy.ar.proofResetDone, { exact: true }).locator('..').getAttribute('aria-live'), 'polite');
      assert.equal(db.prepare('SELECT failures FROM proof_attempts WHERE order_id = ?').get(proofRecovery.id), undefined);
      const current = db.prepare('SELECT status, handover_code FROM orders WHERE id = ?').get(proofRecovery.id);
      assert.equal(current.status, 'in_transit');
      assert.equal(current.handover_code, proofRecovery.handoverCode);
      const audit = db.prepare("SELECT detail FROM security_events WHERE order_id = ? AND action = 'PROOF_RESET'").get(proofRecovery.id);
      assert.equal(JSON.parse(audit.detail).reason, reason);
      console.log('Admin proof recovery UI: verification cancellation, audited reset and required recipient code passed');
    }
    await context.close();
  }
}
if (!only || only.some(id => id.startsWith('driver-'))) {
  const testOrder = await order(layla, true, { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'bireh',
    pickupNote: 'دوار المنارة', dropoffNote: 'البلدية', detail: 'فحص دورة السائق' });
  const context = await browser.newContext({ viewport: phone, reducedMotion: 'reduce', permissions: ['geolocation'],
    geolocation: { latitude: 31.9, longitude: 35.2 } });
  await context.addInitScript(({ token }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('language', 'ar');
    localStorage.setItem('onboarded', '1');
    window.trackingCheck = { next: 0, active: new Set(), callbacks: new Map() };
    window.permissionCheck = { state: 'granted', mode: 'ready', reads: 0, pending: [] };
    const queryPermission = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = descriptor => {
      if (descriptor.name !== 'geolocation') return queryPermission(descriptor);
      const check = window.permissionCheck;
      check.reads++;
      const permission = { state: check.state };
      if (check.mode === 'fail') return Promise.reject(new Error('Permission status unavailable'));
      if (check.mode === 'hold') return new Promise(resolve => check.pending.push(() => resolve(permission)));
      return Promise.resolve(permission);
    };
    navigator.geolocation.watchPosition = success => {
      const tracking = window.trackingCheck;
      const id = ++tracking.next;
      tracking.active.add(id);
      const emit = (timestamp = Date.now()) => success({ coords: { latitude: 31.9, longitude: 35.2, accuracy: 1, altitude: null,
        altitudeAccuracy: null, heading: null, speed: null }, timestamp });
      tracking.callbacks.set(id, emit);
      queueMicrotask(emit);
      return id;
    };
    navigator.geolocation.clearWatch = id => { window.trackingCheck.active.delete(id); };
    // The 30 s heartbeat reads a new fix; Playwright's emulated read reuses an old timestamp, which the app rightly drops.
    navigator.geolocation.getCurrentPosition = success => queueMicrotask(() => success({ coords: { latitude: 31.9, longitude: 35.2, accuracy: 1,
      altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() }));
  }, { token: idleDriver.token });
  const page = await context.newPage();
  let publications = 0, lastLocation;
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/location')) { publications++; lastLocation = request.postDataJSON(); }
  });
  await page.goto(`http://localhost:${WEB_PORT}/driver`, { waitUntil: 'networkidle' });
  // Skip the destination chips (role radio), which carry the same city names (SPEC-driver-destination.md).
  const offer = (from, to) => page.locator(`xpath=//*[normalize-space(text())="${from}" and not(ancestor-or-self::*[@role="radio"])]`)
    .locator(`xpath=ancestor::div[.//*[@role="button" and @aria-label="${copy.ar.accept}"]][1]`)
    .filter({ has: page.getByText(to, { exact: true }) }).getByRole('button', { name: copy.ar.accept, exact: true });
  await offer('رام الله', 'البيرة').waitFor();
  assert.equal(await page.evaluate(() => window.trackingCheck.active.size), 0);
  assert.equal(publications, 0);
  assert.equal(await page.getByRole('button', { name: copy.ar.sharingLocation, exact: true }).count(), 0);
  await offer('رام الله', 'البيرة').click();
  await page.waitForURL(`**/order/${testOrder.id}`);
  await page.waitForFunction(() => window.trackingCheck.active.size === 1, null, { timeout: 3000 });
  await page.getByText(copy.ar.driver_next_assigned, { exact: true }).waitFor();
  assert.equal(await page.getByText(copy.ar.next_assigned, { exact: true }).count(), 0);
  const stationaryPublications = publications;
  await page.waitForTimeout(31_000); // the watcher emits no movement after its initial fix
  assert.ok(publications > stationaryPublications, 'a stationary driver must refresh their GPS fix');
  assert.ok(Number.isInteger(lastLocation.age) && lastLocation.age >= 0 && lastLocation.age < 5_000, 'web sends how old the fix is');
  const beforeLate = publications;
  // A replayed, out-of-order or minutes-old fix must not move the driver backward.
  await page.evaluate(() => { for (const emit of window.trackingCheck.callbacks.values()) { emit(Date.now() - 30_000); emit(Date.now() - 120_000); } });
  await page.waitForTimeout(200);
  assert.equal(publications, beforeLate);
  const visibility = hidden => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: hidden ? 'hidden' : 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  await page.evaluate(visibility, true);
  await page.waitForFunction(() => window.trackingCheck.active.size === 0, null, { timeout: 3000 });
  let releaseRecovery, recoveryRequested;
  const recoveryGate = new Promise(resolve => { releaseRecovery = resolve; });
  const recoveryRequest = new Promise(resolve => { recoveryRequested = resolve; });
  // The client appends ?journeyProtocol=1 to order reads, so match the path with or without a query.
  const ordersList = /\/api\/orders(?:\?|$)/;
  await page.route(ordersList, async route => { recoveryRequested(); await recoveryGate; await route.continue(); });
  const beforeResume = publications;
  await page.evaluate(visibility, false);
  await Promise.race([recoveryRequest, new Promise((_, reject) => setTimeout(() => reject(new Error('Foreground recovery did not request orders')), 5000))]);
  assert.equal(await page.evaluate(() => window.trackingCheck.active.size), 0);
  assert.equal(publications, beforeResume); // the retained assignment cannot restart GPS before recovery finishes
  releaseRecovery();
  await page.waitForFunction(() => window.trackingCheck.active.size === 1, null, { timeout: 3000 });
  await page.unroute(ordersList);

  // Returning from Settings must re-read permission; retained grants cannot start GPS while that read is pending or failed.
  async function permissionResume(state, mode = 'ready') {
    await page.evaluate(visibility, true);
    await page.waitForFunction(() => window.trackingCheck.active.size === 0, null, { timeout: 3000 });
    const reads = await page.evaluate(({ state, mode }) => {
      const check = window.permissionCheck;
      check.state = state; check.mode = mode;
      return check.reads;
    }, { state, mode });
    const recovered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/orders' && response.ok());
    await page.evaluate(visibility, false);
    await recovered;
    await page.waitForFunction(reads => window.permissionCheck.reads > reads, reads, { timeout: 3000 });
  }
  async function resolvePermissions() {
    await page.evaluate(() => {
      window.permissionCheck.mode = 'ready';
      window.permissionCheck.pending.splice(0).forEach(resolve => resolve());
    });
    await page.waitForTimeout(100);
  }
  const beforePermissionChecks = publications;
  await permissionResume('denied', 'hold');
  assert.equal(await page.evaluate(() => window.trackingCheck.active.size), 0);
  assert.equal(publications, beforePermissionChecks);
  await resolvePermissions();
  assert.equal(await page.evaluate(() => window.trackingCheck.active.size), 0); // revoked permission remains off after a fresh assignment read
  await permissionResume('granted', 'hold');
  assert.equal(await page.evaluate(() => window.trackingCheck.active.size), 0);
  assert.equal(publications, beforePermissionChecks);
  await resolvePermissions();
  await page.waitForFunction(() => window.trackingCheck.active.size === 1, null, { timeout: 3000 }); // newly granted permission starts without remounting
  const beforeFailure = publications;
  await permissionResume('granted', 'fail');
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.trackingCheck.active.size), 0);
  assert.equal(publications, beforeFailure); // failed permission refresh cannot reuse a cached grant
  await permissionResume('granted', 'hold');
  await permissionResume('denied');
  await resolvePermissions();
  assert.equal(await page.evaluate(() => window.trackingCheck.active.size), 0); // a prior foreground's late grant cannot override the current denial
  assert.equal(publications, beforeFailure);
  await permissionResume('granted');
  await page.waitForFunction(() => window.trackingCheck.active.size === 1, null, { timeout: 3000 });
  await page.getByRole('button', { name: copy.ar.advance_assigned, exact: true }).click();
  await page.getByText(copy.ar.driver_next_at_pickup, { exact: true }).waitFor();
  await page.getByRole('button', { name: copy.ar.advance_at_pickup, exact: true }).click();
  await page.getByText(copy.ar.driver_next_in_transit, { exact: true }).waitFor();
  assert.equal(await page.getByText(copy.ar.next_in_transit, { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'رجوع', exact: true }).click();
  await page.getByRole('button', { name: copy.ar.activeOrder, exact: true }).waitFor();
  for (const button of await page.getByRole('button', { name: copy.ar.accept, exact: true }).all()) assert.equal(await button.isDisabled(), true);
  await page.getByRole('button', { name: copy.ar.activeOrder, exact: true }).click();
  await page.getByRole('textbox', { name: copy.ar.codeFromCustomer, exact: true }).fill(testOrder.handoverCode);
  await page.getByRole('button', { name: copy.ar.advance_in_transit, exact: true }).click();
  await page.waitForFunction(() => window.trackingCheck.active.size === 0, null, { timeout: 3000 });
  assert.equal(db.prepare('SELECT status FROM orders WHERE id = ?').get(testOrder.id).status, 'completed');
  assert.equal(publications > 0, true);
  const stoppedPublications = publications;
  await page.evaluate(() => { for (const emit of window.trackingCheck.callbacks.values()) emit(); });
  await page.waitForTimeout(200);
  assert.equal(publications, stoppedPublications); // a late GPS callback cannot publish after completion
  await page.getByRole('button', { name: 'رجوع', exact: true }).click();
  await offer('البيرة', 'طولكرم').waitFor();
  assert.equal(await offer('البيرة', 'طولكرم').isDisabled(), false);
  assert.equal(await page.getByRole('button', { name: copy.ar.sharingLocation, exact: true }).count(), 0);
  // An order screen holds a long-poll open, so network idle may never come; the click below waits for Accept itself.
  await page.goto(`http://localhost:${WEB_PORT}/order/${searching.id}`, { waitUntil: 'load' });
  await page.getByRole('button', { name: copy.ar.accept, exact: true }).click();
  await page.waitForFunction(() => window.trackingCheck.active.size === 1, null, { timeout: 3000 });
  await page.goto(`http://localhost:${WEB_PORT}/driver/account`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.trackingCheck.active.size === 1);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: copy.ar.logout, exact: true }).click();
  await page.waitForFunction(() => window.trackingCheck.active.size === 0, null, { timeout: 3000 });
  await page.waitForURL('**/auth');
  const loggedOutPublications = publications;
  await page.evaluate(() => { for (const emit of window.trackingCheck.callbacks.values()) emit(); });
  await page.waitForTimeout(200);
  assert.equal(publications, loggedOutPublications);
  await context.close();
  console.log('Driver UI: idle GPS privacy, foreground assignment/permission recovery, revoked/granted/pending/failed/stale permission reads, busy offers, role hints, completion cleanup, direct accept, late callbacks and logout passed');
}
// ---------- 4b. interactive states: a held quote and an offer price outside its band ----------
if (!only || only.some(id => id === 'book-calculating' || id === 'driver-offer-range')) {
  const base = `http://localhost:${WEB_PORT}`;
  const stateShot = async (screen, language, token, { setup, run }) => {
    const context = await browser.newContext({ viewport: phone, deviceScaleFactor: 2, locale: language === 'ar' ? 'ar-PS' : 'en-GB', reducedMotion: 'reduce' });
    await context.addInitScript(({ token, language }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('language', language);
      localStorage.setItem('onboarded', '1');
      localStorage.setItem('token', token);
    }, { token, language });
    const page = await context.newPage();
    await setup?.(page);
    await page.goto(base + screen.route, { waitUntil: 'load' });
    await page.waitForTimeout(3200); // intro + first data load
    await run?.(page);
    await page.waitForTimeout(800);
    await waitForMaps(page);
    await mapsReady(page, `${screen.id} ${language}`);
    mkdirSync(join(outDir, language), { recursive: true });
    const file = join(outDir, language, `${screen.id}.png`);
    await page.screenshot({ path: file });
    shots.push({ ...screen, language, file });
    await context.close();
  };
  const calculating = screens.find(s => s.id === 'book-calculating');
  const offerRange = screens.find(s => s.id === 'driver-offer-range');
  // A smart-priced ride no driver has taken yet, and a fresh approved driver with no custody, so the offer form opens.
  await smartOrder(omar, { service: 'ride', option: '1', pickupCity: 'ramallah', dropoffCity: 'bireh', pickupNote: 'دوار المنارة', dropoffNote: 'البلدية', detail: '' });
  const fresh = await register('0599000011', 'سائق اختبار', { role: 'driver', vehicle: 'car' });
  await call(`/admin/users/${fresh.user.id}/approve`, boss.token, {});
  for (const language of ['ar', 'en']) {
    // The quote request is held for 9 s, so the footer shows the calculating reason and a disabled Request.
    await stateShot(calculating, language, layla.token, {
      setup: page => page.route(/\/api\/price(?:\?|$)/, async route => { await new Promise(r => setTimeout(r, 9000)); await route.continue(); }),
    });
    await stateShot(offerRange, language, fresh.token, {
      run: async page => {
        await page.getByRole('button', { name: copy[language].offerPrice, exact: true }).first().click();
        await page.getByLabel(`${copy[language].offerPrice} (₪)`).first().fill('5');
        await page.mouse.wheel(0, 420); // bring the send button and its reason into view
      },
    });
  }
}
// ---------- 4c. phone verification and recovery (WP06): synthetic capability replies, no provider, no SMS ----------
// The phone routes run only on PostgreSQL; this block answers them in the browser, so the enabled states are shown without a provider.
const pickScreen = id => screens.find(s => s.id === id);
const readyCaps = { available: true, enabled: true, provider: 'ooredoo_communication', sendAcceptance: true, deliveryReceipts: false, deliveryQuery: false,
  providerTransactionIdempotency: false, policy: { codeSeconds: 300, maxAttempts: 5, resendSeconds: 45 }, supportedContext: 'PS',
  supportedMobilePrefixes: ['56', '59'], legacyLoginPreserved: true };
const selfView = challenges => ({ identityRevision: 1, legacyPhone: '0599000001', profile: null,
  mappings: [{ canonical_group: '+970599000001', routing_e164: '+970599000001', state: 'reviewed', version: 1, country_context: 'PS' }], challenges, capabilities: readyCaps });
const phoneShot = async (screen, language, token, { setup, run }) => {
  const context = await browser.newContext({ viewport: phone, deviceScaleFactor: 2, locale: language === 'ar' ? 'ar-PS' : 'en-GB', reducedMotion: 'reduce' });
  await context.addInitScript(({ token, language }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('language', language);
    localStorage.setItem('onboarded', '1');
    if (token) localStorage.setItem('token', token);
  }, { token, language });
  const page = await context.newPage();
  await setup(page);
  await page.goto(`http://localhost:${WEB_PORT}${screen.route}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500); // intro + first data load
  await run(page);
  await page.setViewportSize({ width: phone.width, height: 1300 }); // the card sits low on the profile and sign-in pages
  await page.waitForTimeout(600);
  mkdirSync(join(outDir, language), { recursive: true });
  const file = join(outDir, language, `${screen.id}.png`);
  await page.screenshot({ path: file });
  shots.push({ ...screen, language, file });
  await context.close();
};
for (const language of ['ar', 'en']) {
  const t = copy[language];
  const ready = pickScreen('profile-phone-ready');
  if (ready) await phoneShot(ready, language, layla.token, {
    setup: async page => {
      await page.route('**/api/phone/capabilities', route => route.fulfill({ json: readyCaps }));
      await page.route('**/api/me/phone', route => route.fulfill({ json: selfView([]) }));
    },
    run: async () => {},
  });
  const code = pickScreen('profile-phone-code');
  if (code) {
    let challenges = [];
    const challengeId = '00000000-0000-4000-8000-0000000000c1';
    await phoneShot(code, language, layla.token, {
      setup: async page => {
        await page.route('**/api/phone/capabilities', route => route.fulfill({ json: readyCaps }));
        await page.route('**/api/me/phone', route => route.fulfill({ json: selfView(challenges) }));
        await page.route('**/api/me/phone/challenges', async route => {
          challenges = [{ id: challengeId, purpose: 'verify', delivery_state: 'accepted', effectiveDeliveryState: 'accepted', expires_at: Date.now() + 300000,
            attempts: 0, resend_at: Date.now() + 45000 }];
          await route.fulfill({ json: { challengeId, state: 'requested', expiresAt: Date.now() + 300000, resendAfterSeconds: 45, deliveryState: 'accepted' } });
        });
      },
      run: async page => {
        await page.getByRole('button', { name: t.phone_verify_send, exact: true }).click();
        await page.getByText(t.phone_state_accepted, { exact: true }).waitFor();
      },
    });
  }
  const change = pickScreen('profile-phone-change');
  if (change) await phoneShot(change, language, layla.token, {
    setup: async page => {
      await page.route('**/api/phone/capabilities', route => route.fulfill({ json: readyCaps }));
      await page.route('**/api/me/phone', route => route.fulfill({ json: selfView([]) }));
    },
    run: async page => {
      await page.getByRole('button', { name: t.phone_change, exact: true }).click();
      await page.getByText(t.phone_change_title, { exact: true }).waitFor();
    },
  });
  const recovery = pickScreen('sign-in-phone-recovery');
  if (recovery) await phoneShot(recovery, language, null, {
    setup: async page => {
      await page.route('**/api/phone/capabilities', route => route.fulfill({ json: readyCaps }));
      await page.route('**/api/auth/phone/recovery/challenges', route => route.fulfill({ json: { challengeId: '00000000-0000-4000-8000-0000000000d1',
        state: 'request_recorded', expiresAt: Date.now() + 300000, resendAfterSeconds: 45, accountStateConcealed: true } }));
    },
    run: async page => {
      await page.getByRole('link', { name: t.phone_recovery_open, exact: true }).click();
      await page.getByRole('textbox', { name: t.phone, exact: true }).fill('0599000001');
      await page.getByRole('button', { name: t.phone_recovery_send, exact: true }).click();
      await page.getByText(t.phone_recovery_recorded, { exact: true }).waitFor();
    },
  });
}
// ---------- 4c. 360 px and large text: the presence card must not overflow, clip or push Go online out of reach ----------
// Captures go to .screens/narrow (not docs/screens). Font scale multiplies every text node's computed size, which approximates
// the OS text setting on web; it does not prove a device's font-scale behaviour.
if (!only || only.some(id => id.startsWith('driver-'))) {
  const base = `http://localhost:${WEB_PORT}`;
  const narrowDir = join(root, '.screens', 'narrow');
  mkdirSync(narrowDir, { recursive: true });
  // A fresh approved driver: the idle driver above logs out in an earlier step, which revokes its session.
  const narrowDriver = await register('0599000012', 'سمير نصار', { role: 'driver', vehicle: 'car' });
  await call(`/admin/users/${narrowDriver.user.id}/approve`, boss.token, {});
  for (const language of ['ar', 'en']) for (const scale of [1, 1.3]) {
    const context = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2,
      locale: language === 'ar' ? 'ar-PS' : 'en-GB', reducedMotion: 'reduce' });
    await context.addInitScript(({ token, language }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('language', language);
      localStorage.setItem('onboarded', '1');
      localStorage.setItem('token', token);
    }, { token: narrowDriver.token, language });
    const page = await context.newPage();
    await page.goto(`${base}/driver`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: copy[language].presence_go_online, exact: true }).waitFor({ timeout: 15000 })
      .catch(async error => { await page.screenshot({ path: join(narrowDir, `debug-${language}.png`) }); throw error; });
    if (scale !== 1) {
      await page.evaluate(factor => {
        for (const element of document.querySelectorAll('body *')) {
          if (![...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) continue;
          element.style.fontSize = `${parseFloat(getComputedStyle(element).fontSize) * factor}px`;
        }
      }, scale);
      await page.waitForTimeout(400);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `${language} at 360px scale ${scale}: horizontal overflow ${overflow}px`);
    // A button whose label wraps is clipped by its fixed height: every visible button in the view must fit its own text.
    const clipped = await page.evaluate(() => [...document.querySelectorAll('[role="button"]')]
      .filter(b => b.getBoundingClientRect().bottom > 0 && b.getBoundingClientRect().top < innerHeight)
      .filter(b => b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1)
      .map(b => b.textContent.trim()));
    assert.deepEqual(clipped, [], `${language} at 360px scale ${scale}: clipped buttons`);
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true, 'reduced motion is active');
    const goOnline = await page.getByRole('button', { name: copy[language].presence_go_online, exact: true }).boundingBox();
    assert.ok(goOnline && goOnline.x >= 0 && goOnline.x + goOnline.width <= 360, `${language} scale ${scale}: Go online inside 360px: ${JSON.stringify(goOnline)}`);
    await page.screenshot({ path: join(narrowDir, `driver-idle-${language}-${scale === 1 ? '100' : '130'}.png`) });
    await context.close();
  }
  console.log('Driver presence at 360 px, 100% and 130% text: no horizontal overflow, Go online reachable, reduced motion active');
}
// ---------- 4d. booking at 360 px and large text, same approximation as 4c: not a device's font-scale behaviour ----------
if (!only || only.includes('booking-narrow')) {
  const narrowDir = join(root, '.screens', 'narrow');
  mkdirSync(narrowDir, { recursive: true });
  const route = 'from=ramallah&to=nablus';
  const views = [
    { id: 'book-parcel', path: `/book?service=parcel&${route}`, ready: t => new RegExp(t.request) },
    { id: 'book-ride', path: `/book?service=ride&${route}`, ready: t => new RegExp(t.request) },
    { id: 'book-freight', path: `/book?service=freight&${route}`, ready: t => new RegExp(t.request) },
    { id: 'order-searching', path: `/order/${searching.id}`, ready: t => t.cancelOrder },
    { id: 'book-parcel-form', path: `/book?service=parcel&${route}`, ready: t => new RegExp(t.scheduleRequest), open: t => [t.sheetExpand, t.later] },
    { id: 'book-ride-form', path: `/book?service=ride&${route}`, ready: t => new RegExp(t.scheduleRequest), open: t => [t.sheetExpand, t.later] },
    { id: 'book-freight-form', path: `/book?service=freight&${route}`, ready: t => new RegExp(t.scheduleRequest), open: t => [t.sheetExpand, t.later] },
    { id: 'order-scheduled', path: `/order/${scheduled.id}`, ready: t => t.saveTime, open: t => [t.changeTime] },
  ];
  for (const language of ['ar', 'en']) for (const scale of [1, 1.3]) for (const view of views) {
    const t = copy[language], where = `${view.id} ${language} at 360px scale ${scale}`;
    const context = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2,
      locale: language === 'ar' ? 'ar-PS' : 'en-GB', reducedMotion: 'reduce' });
    await context.addInitScript(({ token, language }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('language', language);
      localStorage.setItem('onboarded', '1');
      localStorage.setItem('token', token);
    }, { token: layla.token, language });
    const page = await context.newPage();
    // A live order holds a long-poll open, so network idle may never come; the ready-button wait below decides.
    await page.goto(`http://localhost:${WEB_PORT}${view.path}`, { waitUntil: 'load' });
    for (const name of view.open?.(t) ?? []) await page.getByRole('button', { name, exact: true }).or(page.getByRole('radio', { name, exact: true })).first().click();
    const ready = view.ready(t);
    const target = page.getByRole('button', typeof ready === 'string' ? { name: ready, exact: true } : { name: ready }).first();
    await target.waitFor({ timeout: 15000 }).catch(async error => { await page.screenshot({ path: join(narrowDir, `debug-${view.id}-${language}.png`) }); throw error; });
    // The Request button exists from first paint; the evidence must show a price, not "calculating".
    await page.getByText(t.quote_calculating, { exact: true }).first().waitFor({ state: 'hidden', timeout: 15000 });
    assert.equal(await page.getByText(t.quote_failed, { exact: true }).count(), 0, `${where}: the price failed, not a screenshot of a quoted form`);
    if (view.id.startsWith('book-')) assert.notEqual(await target.getAttribute('aria-disabled'), 'true', `${where}: Request is disabled by a specific quote or scope error`);
    if (scale !== 1) {
      await page.evaluate(factor => {
        for (const element of document.querySelectorAll('body *')) {
          if (![...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) continue;
          element.style.fontSize = `${parseFloat(getComputedStyle(element).fontSize) * factor}px`;
        }
      }, scale);
      await page.waitForTimeout(400);
    }
    await mapsReady(page, where);
    await page.screenshot({ path: join(narrowDir, `${view.id}-${language}-${scale === 1 ? '100' : '130'}.png`) });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `${where}: horizontal overflow ${overflow}px`);
    const clipped = await page.evaluate(() => [...document.querySelectorAll('[role="button"]')]
      .filter(b => b.getBoundingClientRect().bottom > 0 && b.getBoundingClientRect().top < innerHeight)
      .filter(b => b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1)
      .map(b => b.textContent.trim()));
    assert.deepEqual(clipped, [], `${where}: clipped buttons`);
    // A row of buttons wider than its card still fits the document: nothing inside a side-scrolling list may reach the screen edge.
    const atEdge = await page.evaluate(() => [...document.querySelectorAll('[role="button"]')]
      .filter(b => { const r = b.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0 && (r.right > innerWidth - 8 || r.left < 8); })
      .filter(b => { for (let p = b.parentElement; p; p = p.parentElement) if (/auto|scroll/.test(getComputedStyle(p).overflowX) && p.scrollWidth > p.clientWidth) return false; return true; })
      .map(b => b.textContent.trim()));
    assert.deepEqual(atEdge, [], `${where}: buttons past the screen gutter`);
    const box = await target.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 360, `${where}: main action inside 360px: ${JSON.stringify(box)}`);
    await context.close();
  }
  console.log('Booking at 360 px, 100% and 130% text, Arabic and English: no horizontal overflow, no clipped button, main action inside the screen');
}
await browser.close();
await Promise.all([
  new Promise(resolve => server.close(resolve)),
  new Promise(resolve => web.close(resolve)),
  new Promise(resolve => osrm.close(resolve)),
]);
db.close();
rmSync(dbDir, { recursive: true, force: true });

// ---------- 5. index for people and for Claude Code ----------
if (!only) {
  const rel = file => relative(outDir, file).split('\\').join('/');
  const rows = [];
  for (const screen of screens) {
    const pick = language => shots.filter(s => s.id === screen.id && s.language === language).map(s => rel(s.file));
    rows.push({ ...screen, ar: pick('ar'), en: pick('en') });
  }
  const groups = [...new Set(rows.map(r => r.group))];
  const md = [
    '# Wind — every screen',
    '',
    `Generated by \`npm run screens\` on ${new Date().toISOString().slice(0, 10)}. Phone viewport ${phone.width}×${phone.height} @2x; long screens are captured to their full scroll height.`,
    'Data is seeded (customer ليلى with Wind Plus, approved driver أحمد with a car, pending driver سامي with a van, one admin).',
    '',
    'For Claude Code: open any PNG below with the Read tool to see the screen, then edit the file in the **Code** column. Re-run `npm run screens` (or `/screens`) after UI changes and compare.',
    '',
    ...groups.flatMap(group => [
      `## ${group}`, '',
      '| Screen | Route | Code | Arabic | English |', '|---|---|---|---|---|',
      ...rows.filter(r => r.group === group).map(r =>
        `| ${r.name} | \`${r.route}\` | \`${r.file}\` | ${r.ar.map(p => `[${p.split('/').pop()}](${p})`).join(' ')} | ${r.en.map(p => `[${p.split('/').pop()}](${p})`).join(' ')} |`),
      '',
    ]),
  ].join('\n');
  writeFileSync(join(outDir, 'README.md'), md + '\n');
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(rows.map(({ clicks, fresh, motion, frames, role, ...r }) => ({ ...r, session: role })), null, 2) + '\n');

  const card = (label, paths) => paths.map(p => `<figure><img src="${p}" loading="lazy" alt="${label}"><figcaption>${label}</figcaption></figure>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Wind screens</title><style>
body{margin:0;font:14px/1.5 system-ui,sans-serif;background:#F8F7F0;color:#182D27}main{max-width:1200px;margin:auto;padding:24px 16px}
h1{font-size:26px}h2{margin-top:40px;border-bottom:1px solid #DBE3D9;padding-bottom:6px}section{margin:18px 0 28px}
h3{margin:0 0 4px}code{background:#E7F0E8;padding:1px 6px;border-radius:6px;font-size:12px}.row{display:flex;gap:14px;overflow-x:auto;padding:8px 0}
figure{margin:0;flex:0 0 auto}img{width:220px;border-radius:18px;border:1px solid #DBE3D9;display:block;background:#fff}figcaption{font-size:12px;color:#627269;text-align:center;margin-top:4px}
</style></head><body><main><h1>Wind — every screen</h1><p>Arabic and English, seeded data. Regenerate with <code>npm run screens</code>.</p>
${groups.map(group => `<h2>${group}</h2>${rows.filter(r => r.group === group).map(r => `<section><h3>${r.name}</h3><code>${r.route}</code> · <code>${r.file}</code>
<div class="row">${card('العربية', r.ar)}${card('English', r.en)}</div></section>`).join('')}`).join('')}
</main></body></html>`;
  writeFileSync(join(outDir, 'index.html'), html);
}
console.log(`Saved ${shots.length} screenshots to ${relative(root, outDir)}`);
process.exit(0);
