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
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
// Synthetic screenshots also cover gated legacy services; production defaults stay parcel-only.
process.env.WIND_ENABLED_SERVICES = 'parcel,ride,freight';
process.env.WIND_IDENTITY_MODE = 'self-service';
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
promote('0599000009');
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
await call('/location', ahmad.token, { latitude: 31.80, longitude: 35.21 });

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
  { id: 'help', group: 'Launch', name: 'Help & support', route: '/help?topic=password', file: 'src/app/help.tsx', role: null },

  { id: 'home', group: 'Customer', name: 'Home', route: '/', file: 'src/app/(customer)/index.tsx', role: 'customer' },
  { id: 'book-parcel', group: 'Customer', name: 'Book a parcel', route: '/book?service=parcel', file: 'src/app/book.tsx', role: 'customer' },
  { id: 'book-ride', group: 'Customer', name: 'Book a ride', route: '/book?service=ride', file: 'src/app/book.tsx', role: 'customer' },
  { id: 'book-freight', group: 'Customer', name: 'Book a load', route: '/book?service=freight', file: 'src/app/book.tsx', role: 'customer' },
  { id: 'book-again', group: 'Customer', name: 'Order again (form copied from a delivered order)', route: `/book?again=${completed.id}`, file: 'src/app/book.tsx', role: 'customer' },
  { id: 'book-send-another', group: 'Customer', name: 'Send another parcel (pickup copied, new recipient)', route: `/book?again=${proofRecovery.id}&keep=pickup`, file: 'src/app/book.tsx', role: 'customer' },
  { id: 'orders', group: 'Customer', name: 'My orders', route: '/orders', file: 'src/app/(customer)/orders.tsx', role: 'customer' },
  { id: 'order-searching', group: 'Customer', name: 'Order · finding a driver', route: `/order/${searching.id}`, file: 'src/app/order/[id].tsx', role: 'customer', motion: true },
  { id: 'order-scheduled', group: 'Customer', name: 'Parcel · scheduled, changing its time', route: `/order/${scheduled.id}`, file: 'src/app/order/[id].tsx', role: 'customer', clicks: ['changeTime'] },
  { id: 'order-live', group: 'Customer', name: 'Order · on the way', route: `/order/${inTransit.id}`, file: 'src/app/order/[id].tsx', role: 'customer' },
  { id: 'order-parcel-live', group: 'Customer', name: 'Parcel · awaiting handover', route: `/order/${proofRecovery.id}`, file: 'src/app/order/[id].tsx', role: 'customer' },
  { id: 'order-done', group: 'Customer', name: 'Order · delivered', route: `/order/${completed.id}`, file: 'src/app/order/[id].tsx', role: 'customer' },
  { id: 'receipt', group: 'Customer', name: 'Receipt', route: `/receipt/${completed.id}`, file: 'src/app/receipt/[id].tsx', role: 'customer' },
  { id: 'account', group: 'Customer', name: 'Account', route: '/account', file: 'src/parts.tsx (AccountScreen)', role: 'customer' },
  { id: 'profile', group: 'Customer', name: 'Edit profile', route: '/profile', file: 'src/app/profile.tsx', role: 'customer' },

  { id: 'driver-pending', group: 'Driver', name: 'Awaiting approval', route: '/driver', file: 'src/app/driver/index.tsx', role: 'pending' },
  { id: 'driver-jobs', group: 'Driver', name: 'Jobs', route: '/driver', file: 'src/app/driver/index.tsx', role: 'driver' },
  { id: 'driver-idle', group: 'Driver', name: 'Jobs · ready for an assignment', route: '/driver', file: 'src/app/driver/index.tsx', role: 'idle' },
  { id: 'driver-run-sheet', group: 'Driver', name: 'Parcel run sheet (pickups and deliveries by city)', route: '/driver/trips', file: 'src/app/driver/trips.tsx', role: 'courier' },
  { id: 'driver-order', group: 'Driver', name: 'Active trip', route: `/order/${inTransit.id}`, file: 'src/app/order/[id].tsx', role: 'driver' },
  { id: 'driver-trips', group: 'Driver', name: 'My trips', route: '/driver/trips', file: 'src/app/driver/trips.tsx', role: 'driver' },
  { id: 'driver-earnings', group: 'Driver', name: 'Earnings', route: '/driver/earnings', file: 'src/app/driver/earnings.tsx', role: 'driver' },
  { id: 'driver-receipt', group: 'Driver', name: 'Receipt (driver view)', route: `/receipt/${completed.id}`, file: 'src/app/receipt/[id].tsx', role: 'driver' },
  { id: 'driver-account', group: 'Driver', name: 'Account', route: '/driver/account', file: 'src/parts.tsx (AccountScreen)', role: 'driver' },

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

for (const language of ['ar', 'en']) {
  mkdirSync(join(outDir, language), { recursive: true });
  for (const screen of screens) {
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

    await page.goto(base + screen.route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(screen.fresh || screen.motion ? 2600 : 1200); // intro + first data load
    for (const click of screen.clicks ?? []) {
      await page.getByText(copy[language][click], { exact: true }).first().click();
      await page.waitForTimeout(700);
    }
    if (screen.motion) await page.waitForTimeout(900); // mid-ripple
    // Grow the viewport to the scroll content so long screens are captured whole (tab bar stays at the bottom).
    const extra = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('div')]
      .filter(d => ['auto', 'scroll'].includes(getComputedStyle(d).overflowY) && d.scrollHeight > d.clientHeight + 4)
      .map(d => d.scrollHeight - d.clientHeight)));
    if (extra) { await page.setViewportSize({ width: phone.width, height: Math.min(phone.height + extra, 2600) }); await page.waitForTimeout(400); }
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
  await page.route('**/api/orders', async route => { recoveryRequested(); await recoveryGate; await route.continue(); });
  const beforeResume = publications;
  await page.evaluate(visibility, false);
  await Promise.race([recoveryRequest, new Promise((_, reject) => setTimeout(() => reject(new Error('Foreground recovery did not request orders')), 5000))]);
  assert.equal(await page.evaluate(() => window.trackingCheck.active.size), 0);
  assert.equal(publications, beforeResume); // the retained assignment cannot restart GPS before recovery finishes
  releaseRecovery();
  await page.waitForFunction(() => window.trackingCheck.active.size === 1, null, { timeout: 3000 });
  await page.unroute('**/api/orders');

  // Returning from Settings must re-read permission; retained grants cannot start GPS while that read is pending or failed.
  async function permissionResume(state, mode = 'ready') {
    await page.evaluate(visibility, true);
    await page.waitForFunction(() => window.trackingCheck.active.size === 0, null, { timeout: 3000 });
    const reads = await page.evaluate(({ state, mode }) => {
      const check = window.permissionCheck;
      check.state = state; check.mode = mode;
      return check.reads;
    }, { state, mode });
    const recovered = page.waitForResponse(response => response.url().endsWith('/api/orders') && response.ok());
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
  await page.goto(`http://localhost:${WEB_PORT}/order/${searching.id}`, { waitUntil: 'networkidle' });
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
await browser.close();
await Promise.all([
  new Promise(resolve => server.close(resolve)),
  new Promise(resolve => web.close(resolve)),
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
