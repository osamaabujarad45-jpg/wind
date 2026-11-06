// Real UI journeys against a throwaway database. GPS and OSRM are controlled fixtures;
// MapLibre, its worker, fonts, styles and map tiles load normally from their real URLs.
// npm run test:scenarios [-- --no-build]
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { copy } from '../src/copy.ts';
import { apiCaller } from '../tests/support/api.mjs';

const root = resolve(import.meta.dirname, '..');
const base = 'http://localhost:4188';
const output = join(root, '.expo/scenarios');
mkdirSync(output, { recursive: true });
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-scenarios-')), 'stories.db');
process.env.WEB_ROOT = join(root, '.expo/location-review-web');
process.env.WIND_LOCAL_TEST = '1';
process.env.WIND_IDENTITY_MODE = 'self-service';
process.env.WIND_ENABLED_SERVICES = 'parcel,ride,freight';
if (!process.argv.includes('--no-build')) {
  // --clear: Metro's cache does not key on EXPO_PUBLIC_* values, so another build's API URL could be baked in.
  const build = spawnSync(process.execPath, [join(root, 'node_modules/expo/bin/cli'), 'export', '-p', 'web', '--max-workers', '1', '--clear', '--output-dir', process.env.WEB_ROOT], {
    cwd: root, encoding: 'utf8', env: { ...process.env, EXPO_PUBLIC_API_URL: base, EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH: '1', EXPO_UNSTABLE_TREE_SHAKING: '1' },
  });
  writeFileSync(join(output, 'build.log'), build.stdout + build.stderr);
  assert.equal(build.status, 0, `Web export failed: ${output}/build.log`);
}
const osrm = createServer((req, res) => {
  const points = decodeURIComponent(new URL(req.url, base).pathname.split('/').pop()).split(';').map(p => p.split(',').map(Number));
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ code: 'Ok', routes: [{ distance: 5000, duration: 600, geometry: { type: 'LineString', coordinates: points } }] }));
});
await new Promise(r => osrm.listen(0, '127.0.0.1', r));
process.env.OSRM_URL = `http://127.0.0.1:${osrm.address().port}`;
const { server, db, promote, shutdown, liveWatcherCount } = await import('../server/main.ts');
await new Promise(r => server.listen(4188, '127.0.0.1', r));
const call = apiCaller(() => base + '/api');
const browser = await chromium.launch({ headless: true });
const c = copy.en, password = 'Scenario_Local_2026';
const pages = [], errors = [], checks = [], requests = [];
let stage = 'setup';
const apiRoutes = new Map();
const apiRoute = pathname => {
  if (!apiRoutes.has(pathname)) apiRoutes.set(pathname, new RegExp(`${pathname}(?:[?].*)?$`));
  return apiRoutes.get(pathname); // route/unroute share the same matcher identity
};
const button = (page, name) => page.getByRole('button', { name, exact: typeof name === 'string' });
const field = (page, name) => page.getByLabel(name, { exact: true });
async function until(read, predicate, message) {
  const end = Date.now() + 20_000;
  while (Date.now() < end) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.fail(message);
}
const mapOf = page => page.frameLocator('iframe[title="map"]').last();
// The pickup's spot, from the trip: its row opens search, Set on map opens the pin over the same map.
async function openPickupPin(page) {
  await page.getByRole('button', { name: new RegExp(`^${c.pickup}: `) }).click();
  await button(page, c.setOnMap).click();
}
function pass(message) { checks.push(message); console.log(`PASS ${message}`); }
async function newPage(language = 'en', viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', permissions: ['geolocation'],
    geolocation: { latitude: 31.9038, longitude: 35.2034, accuracy: 15 } });
  await context.addInitScript(language => {
    if (!localStorage.getItem('language')) localStorage.setItem('language', language);
    localStorage.setItem('onboarded', '1');
    const geo = navigator.geolocation;
    const watch = geo.watchPosition.bind(geo), clear = geo.clearWatch.bind(geo);
    window.scenarioWatches = new Set();
    geo.watchPosition = (receive, fail, options) => {
      const id = watch(position => { window.scenarioFixCount = (window.scenarioFixCount ?? 0) + 1; window.scenarioFixAge = Date.now() - position.timestamp; receive(position); },
        error => { window.scenarioGeoError = error.message; fail?.(error); }, options);
      window.scenarioWatches.add(id); return id;
    };
    geo.clearWatch = id => { window.scenarioWatches.delete(id); clear(id); };
  }, language);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on('pageerror', e => errors.push({ stage, message: e.message }));
  page.on('response', r => { if (r.url().startsWith(base + '/api/')) requests.push({ stage, path: new URL(r.url()).pathname, status: r.status(),
    ...(r.url().endsWith('/api/location') && { location: r.request().postDataJSON() }) }); });
  page.on('dialog', dialog => dialog.accept());
  pages.push(page);
  return page;
}
async function login(page, identifier) {
  await page.goto(base + '/auth');
  await field(page, c.identifier).fill(identifier);
  await field(page, c.password).fill(password);
  await button(page, c.signIn).click();
  await page.waitForURL(url => !url.pathname.startsWith('/auth'));
}
async function signup(page, phone, name, driver = false) {
  await page.goto(base + '/auth');
  await page.getByRole('radio', { name: c.signUp, exact: true }).click();
  await field(page, c.name).fill(name);
  await field(page, c.email).fill(`${phone}@example.test`);
  await field(page, c.phone).fill(phone);
  await field(page, c.password).fill(password);
  if (driver) {
    await page.getByRole('radio', { name: c.driver, exact: true }).click();
    await field(page, c.plate).fill('12-345-67'); // the plate is required for a motor vehicle
  }
  await page.getByRole('checkbox', { name: c.consent }).click();
  await button(page, c.createAccount).click();
  await page.waitForURL(url => !url.pathname.startsWith('/auth'));
  return page.evaluate(() => localStorage.getItem('token'));
}
const state = id => db.prepare('SELECT * FROM orders WHERE id=?').get(id);
async function atStatus(id, status) { return until(() => state(id), o => o?.status === status, `Order ${id} did not reach ${status}`); }
async function booking(page, { service = 'parcel', lostResponse = false, scheduled = false } = {}) {
  await page.goto(`${base}/book?service=${service}&from=ramallah&to=nablus`);
  await button(page, c.sheetExpand).click();
  await field(page, service === 'ride' ? c.pickupNote_ride : c.pickupNote).fill('QA pickup: shop entrance');
  await field(page, c.dropoffNote).fill('QA dropoff: office reception');
  await field(page, c[`${service}Detail`]).fill(service === 'parcel' ? 'Sealed documents' : service === 'freight' ? 'One boxed appliance' : 'Meet at the entrance');
  if (service !== 'ride') {
    await field(page, c.recipientPhone).fill('0599000707');
    await field(page, c.recipientName).fill('QA Recipient');
  }
  if (scheduled) await page.getByRole('radio', { name: c.later, exact: true }).click();
  if (lostResponse) await page.route(apiRoute('/api/orders'), async route => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fetch(); // the server commits; only its response is lost
    await route.abort('connectionreset');
  }, { times: 1 });
  await button(page, new RegExp(`^${scheduled ? c.scheduleRequest : c.request}`)).click();
  if (lostResponse) {
    await page.getByText(c.bookingPending, { exact: true }).waitFor();
    await page.reload();
    // T19 recovery: the read-only reconciliation finds the committed order on its own and navigates to it —
    // no second booking is created and no manual retry is needed for a confirmed-present command.
  }
  await page.waitForURL(/\/order\/\d+$/);
  return Number(new URL(page.url()).pathname.split('/').pop());
}
async function advance(page, id, current, next, code) {
  if (code) await field(page, current === 'returning' ? c.codeFromSender : c.codeFromCustomer).fill(code);
  await button(page, c[`advance_${current}`]).click();
  await atStatus(id, next);
}
try {
  stage = 'recovery messaging when phone codes are unavailable';
  for (const language of ['en', 'ar']) for (const emailReset of [false, true]) {
    const page = await newPage(language), text = copy[language];
    await page.route('**/api/auth/options', route => route.fulfill({ json: { registrationOpen: true, emailReset } }));
    await page.route('**/api/phone/capabilities', route => route.fulfill({ json: { available: false, enabled: false } }));
    await page.goto(base + '/auth');
    const warning = page.getByText(text.phone_recovery_unavailable, { exact: true });
    await warning.waitFor();
    assert.doesNotMatch(await warning.innerText(), /email|البريد/i, 'Do not suggest a recovery method that may be unavailable');
    await page.getByRole('link', { name: emailReset ? text.forgotPasswordEmail : text.forgotPassword, exact: true }).waitFor();
  }
  pass('recovery guidance matches available methods in Arabic and English');

  stage = 'phone recovery capability retry';
  const phoneRetry = await newPage();
  let capabilityAttempts = 0;
  // Two failures: the client repeats a failed read once by itself before anything reaches the screen.
  await phoneRetry.route('**/api/phone/capabilities', route => ++capabilityAttempts <= 2
    ? route.abort() : route.fulfill({ json: { available: true, enabled: true } }));
  await phoneRetry.goto(base + '/auth');
  await phoneRetry.getByText(c.phone_status_failed, { exact: true }).waitFor();
  await button(phoneRetry, c.retry).click();
  await phoneRetry.getByRole('link', { name: c.phone_recovery_open, exact: true }).waitFor();
  pass('phone recovery capability can be retried after a network failure');

  stage = 'signup and approval';
  await call('/auth/register', { body: { name: 'QA Administrator', email: 'admin@example.test', phone: '0599000709', password, consent: true } });
  await promote('0599000709');
  const customerPage = await newPage(), driverPage = await newPage(), adminPage = await newPage();
  const customerToken = await signup(customerPage, '0599000701', 'QA Customer');
  await signup(driverPage, '0599000702', 'QA Driver', true);
  await driverPage.getByText(c.pendingTitle, { exact: true }).waitFor();
  assert.equal(await button(driverPage, c.accept).count(), 0);
  await login(adminPage, '0599000709');
  await adminPage.goto(base + '/admin/users');
  await field(adminPage, c.search).fill('QA Driver');
  await button(adminPage, c.permanentlyApprove).click();
  await adminPage.getByText(c.permanentlyApproved, { exact: true }).waitFor();
  await driverPage.reload();
  // Approval may revoke the pending session; the same credentials must still work.
  await until(() => driverPage.url(), url => /\/(driver|auth)/.test(url), 'Driver did not refresh after approval');
  if (new URL(driverPage.url()).pathname === '/auth') await login(driverPage, '0599000702');
  await driverPage.getByText(c.presence_offline_title, { exact: true }).waitFor(); // approved drivers land on the jobs screen with the presence card offline (SPEC-driver-presence)
  const driverToken = await driverPage.evaluate(() => localStorage.getItem('token'));
  pass('customer and driver UI registration, pending gate, admin approval, driver login');

  stage = 'admin action errors on long lists';
  const subscriptionsPath = apiRoute('/api/admin/subscriptions'), subscriptionAction = apiRoute('/api/admin/subscriptions/918');
  const cashPath = apiRoute('/api/admin/cash'), cashAction = apiRoute('/api/admin/cash/remittance');
  const promosPath = apiRoute('/api/admin/promos'), promoAction = apiRoute('/api/admin/promos/951/deactivate');
  await adminPage.route(subscriptionsPath, route => route.fulfill({ json: Array.from({ length: 18 }, (_, i) => ({
    id: 901 + i, userId: 901 + i, plan: 'plus', status: 'pending', price: 10, endsAt: null, createdAt: Date.now(), userName: `QA Subscription ${i + 1}`, userPhone: '0599000701',
  })) }));
  await adminPage.route(subscriptionAction, route => route.fulfill({ status: 409, json: { error: 'route_prohibited' } }));
  await adminPage.route(cashPath, route => route.fulfill({ json: Array.from({ length: 18 }, (_, i) => ({
    driverId: 901 + i, name: `QA Cash Driver ${i + 1}`, phone: '0599000702', owedCents: 1000, pendingCents: 0, lastRemittanceAt: null,
  })) }));
  await adminPage.route(cashAction, route => route.fulfill({ status: 409, json: { error: 'route_prohibited' } }));
  await adminPage.route(promosPath, route => route.fulfill({ json: Array.from({ length: 18 }, (_, i) => ({
    id: 951 + i, code: `QAPROMO${i + 1}`, amount: 10, maxUses: 100, uses: 0, expiresAt: Date.now() + 86400000, firstOrderOnly: false, active: true, live: true,
  })) }));
  await adminPage.route(promoAction, route => route.fulfill({ status: 409, json: { error: 'route_prohibited' } }));
  try {
    await adminPage.goto(base + '/admin/subscriptions');
    await adminPage.getByText('QA Subscription 18', { exact: false }).waitFor();
    await button(adminPage, c.activate).last().scrollIntoViewIfNeeded();
    assert.ok((await adminPage.getByText('QA Subscription 1', { exact: false }).first().boundingBox()).y < 0, 'Subscription list must be scrolled down');
    await button(adminPage, c.activate).last().click();
    const subError = adminPage.getByText(c.err_route_prohibited, { exact: true });
    await subError.waitFor();
    await until(() => subError.boundingBox(), box => box && box.y >= 0 && box.y + box.height <= adminPage.viewportSize().height, 'Subscription error is off-screen');

    await adminPage.goto(base + '/admin/cash');
    await adminPage.getByText('QA Cash Driver 18', { exact: true }).waitFor();
    await button(adminPage, c.cashRecord).last().scrollIntoViewIfNeeded();
    assert.ok((await adminPage.getByText('QA Cash Driver 1', { exact: true }).boundingBox()).y < 0, 'Cash list must be scrolled down');
    await button(adminPage, c.cashRecord).last().click();
    await field(adminPage, c.cashAmount).waitFor();
    await button(adminPage, c.cashRecord).last().click();
    const cashError = adminPage.getByText(c.err_route_prohibited, { exact: true });
    await cashError.waitFor();
    await until(() => cashError.boundingBox(), box => box && box.y >= 0 && box.y + box.height <= adminPage.viewportSize().height, 'Cash error is off-screen');

    await adminPage.goto(base + '/admin/settings');
    await button(adminPage, `${c.promoDeactivate} QAPROMO1`).click();
    const promoError = adminPage.getByText(c.err_route_prohibited, { exact: true });
    await promoError.waitFor();
    await until(() => promoError.boundingBox(), box => box && box.y >= 0 && box.y + box.height <= adminPage.viewportSize().height, 'Promo stop error is off-screen');
    pass('long subscription and cash lists reveal failed actions, and promo stop errors stay beside the code');
  } finally {
    await adminPage.unroute(subscriptionsPath); await adminPage.unroute(subscriptionAction);
    await adminPage.unroute(cashPath); await adminPage.unroute(cashAction);
    await adminPage.unroute(promosPath); await adminPage.unroute(promoAction);
  }

  stage = 'checkpoint move retry';
  const roadsPath = apiRoute('/api/roads'), roadPlace = apiRoute('/api/admin/roads/991/place');
  const roadStart = { latitude: 31.9038, longitude: 35.2034 };
  await adminPage.route(roadsPath, route => route.fulfill({ json: [{ id: 991, name: 'QA checkpoint', cities: ['ramallah'], point: roadStart, status: null, note: '', reportedAt: null, agreeing: 0 }] }));
  await adminPage.route(roadPlace, route => route.fulfill({ status: 409, json: { error: 'route_prohibited' } }));
  try {
    await adminPage.goto(base + '/roads');
    await button(adminPage, c.roadMove).click();
    await until(() => button(adminPage, c.confirmPin).isEnabled(), Boolean, 'Checkpoint map did not become ready');
    const roadCanvas = mapOf(adminPage).locator('canvas.maplibregl-canvas').last();
    const roadBox = await roadCanvas.boundingBox();
    await adminPage.mouse.move(roadBox.x + roadBox.width / 2, roadBox.y + roadBox.height / 2);
    await adminPage.mouse.down();
    await adminPage.mouse.move(roadBox.x + roadBox.width / 2 + 60, roadBox.y + roadBox.height / 2 + 20, { steps: 10 });
    await adminPage.mouse.up();
    const firstMove = adminPage.waitForRequest(r => new URL(r.url()).pathname === '/api/admin/roads/991/place' && r.method() === 'POST');
    await button(adminPage, c.confirmPin).click();
    const chosenRoad = (await firstMove).postDataJSON().point;
    assert.ok(Math.abs(chosenRoad.latitude - roadStart.latitude) + Math.abs(chosenRoad.longitude - roadStart.longitude) > 0.0001, 'Checkpoint pin must actually move');
    await adminPage.getByText(c.err_route_prohibited, { exact: true }).waitFor();
    await button(adminPage, c.roadMove).click();
    await until(() => button(adminPage, c.confirmPin).isEnabled(), Boolean, 'Checkpoint retry map did not become ready');
    const retryMove = adminPage.waitForRequest(r => new URL(r.url()).pathname === '/api/admin/roads/991/place' && r.method() === 'POST');
    const retryResponse = adminPage.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/roads/991/place' && r.request().method() === 'POST');
    await button(adminPage, c.confirmPin).click();
    const retriedRoad = (await retryMove).postDataJSON().point;
    await retryResponse;
    assert.ok(Math.abs(chosenRoad.latitude - retriedRoad.latitude) + Math.abs(chosenRoad.longitude - retriedRoad.longitude) < 0.00001, 'Retry must retain the chosen checkpoint point');
    pass('a failed checkpoint move retains the chosen point for retry');
  } finally {
    await adminPage.unroute(roadsPath); await adminPage.unroute(roadPlace);
  }

  stage = 'booking retry';
  const countBefore = db.prepare('SELECT COUNT(*) n FROM orders').get().n;
  const id = await booking(customerPage, { lostResponse: true });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, countBefore + 1);
  assert.equal(await customerPage.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('booking.')).length), 0);
  pass('lost booking response and page reload recover exactly one order');

  stage = 'driver acceptance and live map';
  // Deliver a fresh GPS fix while an upload is still in flight: it must be uploaded next, not discarded.
  // Whether the in-flight first upload is the pre-acceptance cached fix (rejected as stale) or already a
  // grace-accepted fresh one depends on that fix's age — the grace window is pinned deterministically by
  // the location unit suites, so the browser scenario pins only the not-discarded guarantee.
  await driverPage.route('**/api/location', async route => {
    const response = await route.fetch();
    const before = await driverPage.evaluate(() => window.scenarioFixCount);
    await driverPage.context().setGeolocation({ latitude: 31.9045, longitude: 35.2044, accuracy: 15 });
    await driverPage.waitForFunction(n => (window.scenarioFixCount ?? 0) > n, before);
    await route.fulfill({ response });
  }, { times: 1 });
  await driverPage.goto(base + '/driver');
  await button(driverPage, c.accept).click();
  await driverPage.waitForURL(new RegExp(`/order/${id}$`));
  await atStatus(id, 'assigned');
  await until(() => call(`/orders/${id}`, { token: customerToken }), o => o.driverLocation?.latitude === 31.9045, 'Latest GPS fix was lost during the previous upload');
  await customerPage.getByText(c.assigned, { exact: true }).waitFor();
  await mapOf(customerPage).locator('.maplibregl-marker').nth(2).waitFor();
  // The live marker follows the driver: a new fix moves the car on the customer's map, with no user gesture.
  const liveMarker = mapOf(customerPage).locator('.maplibregl-marker').nth(2);
  const markerSpot = () => liveMarker.evaluate(el => { const box = el.getBoundingClientRect(); return [box.x, box.y]; });
  const beforeMove = await markerSpot();
  const fixesBefore = await driverPage.evaluate(() => window.scenarioFixCount ?? 0);
  // A car's real pace: the server rejects a jump no vehicle could make, so the test moves it like a slow street.
  await driverPage.context().setGeolocation({ latitude: 31.9049, longitude: 35.2047, accuracy: 15 });
  await driverPage.waitForFunction(n => (window.scenarioFixCount ?? 0) > n, fixesBefore);
  await until(() => call(`/orders/${id}`, { token: customerToken }), o => o.driverLocation?.latitude === 31.9049,
    'The server did not accept the next driver fix');
  await until(markerSpot, ([x, y]) => Math.hypot(x - beforeMove[0], y - beforeMove[1]) > 0.5,
    'The live marker did not follow the driver to its new position');
  // The camera rides with the car, framing it with the next stop, so it never drifts out of the map.
  await new Promise(resolve => setTimeout(resolve, 2500));
  const [carX, carY] = await markerSpot();
  const mapBox = await mapOf(customerPage).locator('.maplibregl-map').first().boundingBox();
  assert.ok(carX > 0 && carX < mapBox.width && carY > 0 && carY < mapBox.height, `The camera lost the car (${Math.round(carX)},${Math.round(carY)})`);
  await customerPage.screenshot({ path: join(output, 'customer-live-map.png'), fullPage: true });
  await driverPage.screenshot({ path: join(output, 'driver-assigned.png'), fullPage: true });
  pass('driver accepts, real MapLibre renders pickup/dropoff/driver, GPS reaches customer');

  stage = 'chat and recipient';
  await field(customerPage, c.chatMessage).fill('Please use the shop entrance.');
  await button(customerPage, c.send).click();
  await driverPage.getByText('Please use the shop entrance.', { exact: true }).waitFor();
  await field(driverPage, c.chatMessage).fill('I am at the entrance.');
  await button(driverPage, c.send).click();
  await customerPage.getByText('I am at the entrance.', { exact: true }).waitFor();
  const shareResponse = customerPage.waitForResponse(r => new URL(r.url()).pathname.endsWith(`/orders/${id}/share`) && r.request().method() === 'POST');
  await button(customerPage, c.shareTracking).click();
  const share = await (await shareResponse).json();
  const recipient = await newPage();
  await recipient.goto(base + share.path);
  await mapOf(recipient).locator('.maplibregl-marker').first().waitFor();
  const publicText = await recipient.locator('body').innerText();
  assert.ok(!publicText.includes('0599000701') && !publicText.includes('QA pickup:') && !publicText.includes('0599000707'));
  await recipient.screenshot({ path: join(output, 'recipient-tracking.png'), fullPage: true });
  pass('two-way chat and anonymous recipient tracking without private contacts or landmarks');

  stage = 'handover and receipt';
  await call('/location', { token: driverToken, body: { latitude: 31.9049, longitude: 35.2047, accuracy: 5 } });
  const pickupEta = recipient.waitForResponse(r => r.url().includes(`/track/${share.token}/eta?`) && new URL(r.url()).searchParams.get('status') === 'at_pickup');
  await advance(driverPage, id, 'assigned', 'at_pickup');
  await pickupEta;
  await recipient.getByText(/^Driver arrives in /).waitFor();
  let releaseTransitEta, transitEtaWaiting = false;
  const transitEtaGate = new Promise(resolve => { releaseTransitEta = resolve; });
  await recipient.route(`**/api/track/${share.token}/eta?*`, async route => {
    if (new URL(route.request().url()).searchParams.get('status') === 'in_transit') { transitEtaWaiting = true; await transitEtaGate; }
    await route.continue();
  });
  await advance(driverPage, id, 'at_pickup', 'in_transit');
  await until(() => transitEtaWaiting, Boolean, 'The new trip-stage ETA was not requested');
  assert.equal(await recipient.getByText(/^Arrives in /).count(), 0, 'The pickup estimate cannot be relabeled as a dropoff ETA');
  releaseTransitEta();
  await recipient.getByText(/^Arrives in /).waitFor();
  await recipient.unroute(`**/api/track/${share.token}/eta?*`);
  pass('public ETA is cleared and refetched when the same driver changes trip stage');
  const order = await call(`/orders/${id}`, { token: customerToken });
  // A lost reply holds the typed code so it can replay, and says why the field is locked; the server's answer then frees it.
  const advancePath = apiRoute(`/api/orders/${id}/advance`);
  await driverPage.route(advancePath, route => route.abort());
  await field(driverPage, c.codeFromCustomer).fill(order.handoverCode === '0000' ? '1111' : '0000');
  await button(driverPage, c.advance_in_transit).click();
  await driverPage.getByText(c.codeHeldForRetry).waitFor();
  await driverPage.unroute(advancePath);
  await button(driverPage, c.advance_in_transit).click();
  await driverPage.getByText(c.err_wrong_code, { exact: true }).waitFor();
  assert.equal(state(id).status, 'in_transit');
  await advance(driverPage, id, 'in_transit', 'completed', order.handoverCode);
  await until(() => driverPage.evaluate(() => window.scenarioWatches.size), n => n === 0, 'GPS did not stop after delivery');
  await button(driverPage, `${c.rateCustomer} 5/5`).click();
  await button(customerPage, `${c.rateDriver} 5/5`).click();
  await button(customerPage, `${c.ratePrice} 4/5`).click();
  await until(() => call(`/orders/${id}`, { token: customerToken }), o => o.rating === 5 && o.priceRating === 4, 'Ratings were not saved');
  assert.equal((await call(`/orders/${id}`, { token: driverToken })).customerRating, 5);
  await button(customerPage, c.viewReceipt).click();
  await customerPage.waitForURL(new RegExp(`/receipt/${id}$`));
  await customerPage.getByText(c.paymentUnconfirmed, { exact: true }).waitFor();
  await customerPage.screenshot({ path: join(output, 'customer-receipt.png'), fullPage: true });
  pass('arrival, pickup, wrong-code rejection, handover, GPS stop, both ratings and truthful receipt');

  stage = 'rebook and cancellation';
  await customerPage.goto(`${base}/order/${id}`);
  await button(customerPage, c.sendAnother).click();
  // The pickup stays; search asks for the next destination, and nothing of the old recipient comes along.
  await customerPage.getByPlaceholder('QA pickup: shop entrance').waitFor();
  await customerPage.getByPlaceholder(c.whereTo).waitFor();
  const cancelId = await booking(customerPage);
  await button(customerPage, c.cancelOrder).click();
  await atStatus(cancelId, 'cancelled');
  pass('send another retains pickup only; customer cancellation reaches terminal state');

  stage = 'scheduled delivery';
  const scheduledId = await booking(customerPage, { scheduled: true });
  assert.ok(state(scheduledId).scheduled_for > Date.now());
  const scheduledSnapshot = await call(`/orders/${scheduledId}?journeyProtocol=1`, { token: customerToken });
  assert.ok(!(await call('/jobs', { token: driverToken })).some(o => o.id === scheduledId), 'Future jobs must not be dispatched immediately');
  await button(customerPage, c.cancelOrder).click();
  await atStatus(scheduledId, 'cancelled');
  pass('scheduled booking stays out of immediate driver dispatch and can be cancelled');

  stage = 'failed delivery and return';
  const returnId = await booking(customerPage);
  await driverPage.goto(base + '/driver');
  await button(driverPage, c.accept).click();
  await driverPage.waitForURL(new RegExp(`/order/${returnId}$`));
  // Far from the pickup by GPS: warned and asked, never blocked (found on the A53, 80 minutes away).
  const prompts = [], farPath = apiRoute(`/api/orders/${returnId}`);
  driverPage.on('dialog', dialog => prompts.push(dialog.message()));
  await driverPage.route(farPath, async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), pickupPoint: { latitude: 31.9, longitude: 35.2 }, driverLocation: { latitude: 32.31, longitude: 35.03, updatedAt: Date.now(), ageSeconds: 0 } } });
  });
  await driverPage.getByText(new RegExp(c.parcelPickupFar.replace('{km}', '[\\d.,]+'))).waitFor();
  await advance(driverPage, returnId, 'assigned', 'at_pickup');
  assert.ok(prompts.some(text => text.includes(c.parcelPickupFarConfirm.split('{km}')[1])), `the far pickup must ask first: ${JSON.stringify(prompts)}`);
  await driverPage.unroute(farPath);
  prompts.length = 0;
  await driverPage.getByText(new RegExp(c.parcelPickupFar.replace('{km}', '[\\d.,]+'))).waitFor({ state: 'hidden' });
  await advance(driverPage, returnId, 'at_pickup', 'in_transit');
  assert.deepEqual(prompts, [], 'near or unknown, the courier is not asked');
  pass('a courier far from the pickup is warned and asked, and can still continue');
  await button(driverPage, c.sheetExpand).click(); // the problem form is on the open sheet, as for a real driver
  await field(driverPage, c.problemNote).fill('Recipient absent after contact attempts.');
  await button(driverPage, c.reportProblem).click();
  await atStatus(returnId, 'on_hold');
  await adminPage.goto(`${base}/order/${returnId}`);
  await field(adminPage, c.proofResetReason).fill('Sender confirms return to the pickup shop.');
  await button(adminPage, c.returnToSender).click();
  await atStatus(returnId, 'returning');
  const returning = await call(`/orders/${returnId}`, { token: customerToken });
  await advance(driverPage, returnId, 'returning', 'returned', returning.returnCode);
  pass('recipient absent, admin return decision, sender-code return closure');

  stage = 'cash settlement';
  const beforeCash = await call('/driver/cash', { token: driverToken });
  assert.ok(beforeCash.owedCents > 0);
  await adminPage.goto(base + '/admin/cash');
  await button(adminPage, c.cashRecord).click();
  await field(adminPage, c.cashAmount).fill(String(beforeCash.owedCents / 100));
  await field(adminPage, c.problemNote).fill('QA cash handover at office.');
  await button(adminPage, c.cashRecord).click();
  await driverPage.goto(base + '/driver/earnings');
  await button(driverPage, c.cashConfirm).click();
  await until(() => call('/driver/cash', { token: driverToken }), cash => cash.owedCents === 0, 'Confirmed handover did not settle the ledger');
  pass('admin cash record, driver confirmation and zero reconciled balance');

  stage = 'ride service';
  const rideId = await booking(customerPage, { service: 'ride' });
  await driverPage.goto(base + '/driver');
  await button(driverPage, /^Accept/).click();
  await driverPage.waitForURL(new RegExp(`/order/${rideId}$`));
  await advance(driverPage, rideId, 'assigned', 'at_pickup');
  await button(driverPage, c.advance_at_pickup_ride).click();
  await atStatus(rideId, 'in_transit');
  assert.equal(await field(driverPage, c.codeFromCustomer).count(), 0, 'Passenger trip must not request a parcel code');
  await button(driverPage, c.advance_in_transit_ride).click();
  await atStatus(rideId, 'completed');
  pass('enabled ride service: boarding, trip completion, no parcel handover code');

  stage = 'subscription';
  await customerPage.goto(base + '/account');
  await button(customerPage, c.subscribe).click();
  await customerPage.getByText(c.subPending, { exact: true }).waitFor();
  await adminPage.goto(base + '/admin/subscriptions');
  await button(adminPage, c.activate).click();
  await until(() => call('/me', { token: customerToken }), me => me.plan === 'plus', 'Plan was not activated');
  pass('customer subscription request and admin activation');

  stage = 'reassignment with unavailable snapshot';
  const adminToken = await adminPage.evaluate(() => localStorage.getItem('token'));
  const replacement = await call('/auth/register', { body: { name: 'Baker Driver', email: 'replacement@example.test', phone: '0599000708', password, consent: true, registrationRole: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${replacement.user.id}/approve`, { token: adminToken, body: {} });
  const swapId = await booking(customerPage);
  await call(`/jobs/${swapId}/accept`, { token: driverToken, body: {} });
  await call('/location', { token: driverToken, body: { latitude: 31.91, longitude: 35.21, accuracy: 10 } });
  const swapShare = await call(`/orders/${swapId}/share`, { token: customerToken, body: {} });
  await customerPage.reload();
  await customerPage.getByText('QA Driver', { exact: true }).waitFor();
  const swapRecipient = await newPage();
  await swapRecipient.goto(base + swapShare.path);
  await swapRecipient.getByText(/^QA/).first().waitFor();
  await until(() => liveWatcherCount(swapId), n => n >= 2, 'Both live trackers did not subscribe');
  await customerPage.route(apiRoute(`/api/orders/${swapId}`), route => route.abort());
  await swapRecipient.route(`**/api/track/${swapShare.token}`, route => route.abort());
  await call(`/orders/${swapId}/release`, { token: driverToken, body: {} });
  await call(`/jobs/${swapId}/accept`, { token: replacement.token, body: {} });
  await call('/location', { token: replacement.token, body: { latitude: 31.92, longitude: 35.22, accuracy: 10 } });
  await until(() => customerPage.getByText('QA Driver', { exact: true }).count(), n => n === 0, 'Old driver remained on the customer page after release');
  await until(() => swapRecipient.getByText(/^QA/).count(), n => n === 0, 'Old driver remained on the public page after release');
  assert.equal(await customerPage.locator('.driver-marker').count(), 0, 'Old map stays hidden when the snapshot refresh fails');
  await customerPage.unroute(apiRoute(`/api/orders/${swapId}`));
  await swapRecipient.unroute(`**/api/track/${swapShare.token}`);
  await customerPage.getByText('Baker Driver', { exact: true }).waitFor({ timeout: 35_000 });
  await swapRecipient.getByText(/^Baker/).first().waitFor({ timeout: 35_000 });
  await call(`/orders/${swapId}/release`, { token: replacement.token, body: {} });
  await call(`/orders/${swapId}/cancel`, { token: customerToken, body: {} });
  pass('reassignment hides the old driver during failed refresh and shows the replacement after recovery');

  stage = 'reassignment while an old snapshot is in flight';
  const raceId = await booking(customerPage);
  await call(`/jobs/${raceId}/accept`, { token: driverToken, body: {} });
  await call('/location', { token: driverToken, body: { latitude: 31.91, longitude: 35.21, accuracy: 10 } });
  const raceShare = await call(`/orders/${raceId}/share`, { token: customerToken, body: {} });
  await customerPage.reload();
  await customerPage.getByText('QA Driver', { exact: true }).waitFor();
  const raceRecipient = await newPage();
  await raceRecipient.goto(base + raceShare.path);
  await raceRecipient.getByText(/^QA/).first().waitFor();
  await until(() => liveWatcherCount(raceId), n => n >= 2, 'Both trackers did not subscribe for the in-flight test');
  let customerIntercepted = false, recipientIntercepted = false, customerHeld = false, recipientHeld = false;
  let customerReleased = false, recipientReleased = false, unblock, allowFresh;
  const heldSnapshots = new Promise(resolve => { unblock = resolve; });
  const freshSnapshots = new Promise(resolve => { allowFresh = resolve; });
  const holdFirst = (take, ready, released, lateError = false) => async route => {
    if (take()) {
      const response = await route.fetch(); ready(); await heldSnapshots;
      if (lateError) await route.fulfill({ status: 404, json: { error: 'not_found' } });
      else await route.fulfill({ response });
      released();
    }
    else { await freshSnapshots; await route.continue(); }
  };
  await customerPage.route(apiRoute(`/api/orders/${raceId}`), holdFirst(() => { if (customerIntercepted) return false; customerIntercepted = true; return true; },
    () => { customerHeld = true; }, () => { customerReleased = true; }, true));
  await raceRecipient.route(`**/api/track/${raceShare.token}`, holdFirst(() => { if (recipientIntercepted) return false; recipientIntercepted = true; return true; },
    () => { recipientHeld = true; }, () => { recipientReleased = true; }));
  await until(() => customerHeld && recipientHeld, Boolean, 'Both old snapshots were not held');
  await call(`/orders/${raceId}/release`, { token: driverToken, body: {} });
  await call(`/jobs/${raceId}/accept`, { token: replacement.token, body: {} });
  allowFresh();
  await customerPage.getByText('Baker Driver', { exact: true }).waitFor({ timeout: 6_000 });
  await raceRecipient.getByText(/^Baker/).first().waitFor({ timeout: 6_000 });
  let laterPolls = 0;
  const observePoll = request => { if (customerReleased && new URL(request.url()).pathname === `/api/orders/${raceId}`) laterPolls++; };
  customerPage.on('request', observePoll);
  unblock(); // an older 404 must not stop polling; the old public response must not overwrite the newer driver
  await until(() => customerReleased && recipientReleased, Boolean, 'Held snapshots did not finish');
  await customerPage.unroute(apiRoute(`/api/orders/${raceId}`));
  await raceRecipient.unroute(`**/api/track/${raceShare.token}`);
  await customerPage.getByText('Baker Driver', { exact: true }).waitFor();
  await raceRecipient.getByText(/^Baker/).first().waitFor();
  await until(() => laterPolls, n => n > 0, 'A superseded 404 stopped future snapshot polls');
  customerPage.off('request', observePoll);
  await call(`/orders/${raceId}/release`, { token: replacement.token, body: {} });
  await call(`/orders/${raceId}/cancel`, { token: customerToken, body: {} });
  pass('reassignment overtakes old snapshots and a late 404 cannot stop polling');

  stage = 'driver location provider timeout';
  const timeoutId = await booking(customerPage);
  const stalledDriver = await newPage();
  await stalledDriver.addInitScript(() => {
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = descriptor => descriptor.name === 'geolocation'
      ? Promise.resolve({ state: 'prompt', onchange: null, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } })
      : query(descriptor);
    navigator.geolocation.getCurrentPosition = () => {}; // provider never responds
  });
  await login(stalledDriver, '0599000708');
  await button(stalledDriver, c.accept).click();
  await stalledDriver.getByText(c.locationOff, { exact: true }).waitFor({ timeout: 20_000 });
  assert.equal(await button(stalledDriver, c.accept).isEnabled(), true, 'The driver can retry after a stalled permission request');
  assert.equal(state(timeoutId).status, 'searching', 'A timed-out location request must not accept the job');
  await call(`/orders/${timeoutId}/cancel`, { token: customerToken, body: {} });
  pass('unresponsive driver location request times out without accepting and can be retried');

  stage = 'account switch during driver permission';
  const switchDriver = await call('/auth/register', { body: { name: 'Switch Driver', email: 'switch@example.test', phone: '0599000710', password, consent: true, registrationRole: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${switchDriver.user.id}/approve`, { token: adminToken, body: {} });
  const switchId = await booking(customerPage);
  const switching = await newPage();
  await switching.addInitScript(() => {
    window.pendingPermission = [];
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = descriptor => descriptor.name === 'geolocation' ? Promise.resolve({ state: 'prompt' }) : query(descriptor);
    navigator.geolocation.getCurrentPosition = success => window.pendingPermission.push(success);
    navigator.geolocation.watchPosition = () => 1;
    navigator.geolocation.clearWatch = () => {};
  });
  await login(switching, '0599000710');
  await button(switching, c.accept).click();
  await switching.waitForFunction(() => window.pendingPermission.length > 0);
  await switching.getByRole('tab', { name: c.account, exact: true }).click();
  await button(switching, c.logout).click();
  await switching.waitForURL('**/auth');
  await field(switching, c.identifier).fill('0599000708');
  await field(switching, c.password).fill(password);
  await button(switching, c.signIn).click();
  await switching.waitForURL(url => !url.pathname.startsWith('/auth'));
  await switching.evaluate(() => window.pendingPermission.shift()({ coords: { latitude: 31.91, longitude: 35.21, accuracy: 10,
    altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() }));
  await new Promise(resolve => setTimeout(resolve, 1200));
  assert.equal(state(switchId).status, 'searching', 'A previous driver cannot accept under a new session');
  await call(`/orders/${switchId}/cancel`, { token: customerToken, body: {} });
  pass('late location permission cannot accept a job after a driver account switch');

  stage = 'map picker and recovery';
  // Playwright's fixed location keeps its original timestamp until explicitly refreshed.
  await customerPage.context().setGeolocation({ latitude: 31.9038, longitude: 35.2034, accuracy: 15 });
  await customerPage.goto(base + '/book?from=ramallah&to=nablus');
  await openPickupPin(customerPage);
  const confirmPin = button(customerPage, c.confirmPickupSpot);
  await until(() => confirmPin.isEnabled(), Boolean, 'Pin map did not become ready');
  const canvas = mapOf(customerPage).locator('canvas.maplibregl-canvas').last();
  const box = await canvas.boundingBox();
  await customerPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await customerPage.mouse.down();
  await customerPage.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, { steps: 10 });
  await customerPage.mouse.up();
  const pinQuote = customerPage.waitForRequest(r => new URL(r.url()).pathname === '/api/price' && r.postDataJSON()?.pickupPoint);
  await confirmPin.click();
  const chosen = (await pinQuote).postDataJSON().pickupPoint;
  assert.ok(Math.abs(chosen.latitude - 31.9038) + Math.abs(chosen.longitude - 35.2034) > 0.0001,
    'Confirm immediately after dragging must save the moved pin, not the starting city centre');
  await button(customerPage, new RegExp(`^${c.request}`)).waitFor();
  pass('map picker loads real tiles, pans and confirms an exact pickup');

  await customerPage.setViewportSize({ width: 600, height: 320 });
  await openPickupPin(customerPage);
  const landscapeConfirm = button(customerPage, c.confirmPickupSpot);
  await until(() => landscapeConfirm.isEnabled(), Boolean, 'Landscape pin map did not become ready');
  await landscapeConfirm.scrollIntoViewIfNeeded();
  const landscapeBox = await landscapeConfirm.boundingBox();
  assert.ok(landscapeBox && landscapeBox.y >= 0 && landscapeBox.y + landscapeBox.height <= 320, 'Pin confirmation must be reachable in landscape');
  await landscapeConfirm.click();
  await customerPage.setViewportSize({ width: 390, height: 844 });
  pass('pin confirmation remains reachable on a short landscape screen');

  stage = 'map download recovery';
  const recovery = await newPage();
  await login(recovery, '0599000701');
  await recovery.route('**/vendor/maplibre-*/maplibre-gl.mjs', route => route.abort());
  await recovery.goto(base + '/book?from=ramallah&to=nablus');
  await button(recovery, c.retry).click({ trial: true });
  await recovery.unroute('**/vendor/maplibre-*/maplibre-gl.mjs');
  await button(recovery, c.retry).click();
  await mapOf(recovery).locator('.maplibregl-marker').first().waitFor();
  pass('failed map library download shows fallback and recovers with Retry');

  stage = 'Android map bridge';
  const androidMap = await newPage('ar');
  await androidMap.emulateMedia({ reducedMotion: 'no-preference' });
  await androidMap.context().addInitScript(() => {
    window.mapMessages = [];
    window.ReactNativeWebView = { postMessage: json => window.mapMessages.push(JSON.parse(json)) };
  });
  const pickup = { latitude: 31.9038, longitude: 35.2034 }, dropoff = { latitude: 32.2211, longitude: 35.2544 };
  // Expose the test page's map instance through the intercepted HTML only; production stays unchanged.
  await androidMap.route('**/map.html', async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace('const map = new ml.Map({', 'const map = window.testMap = new ml.Map({')
      .replace('marker = new ml.Marker({', 'marker = window.testMarker = new ml.Marker({');
    await route.fulfill({ response, body: html });
  });
  let releaseTiles;
  const tilesReady = new Promise(resolve => { releaseTiles = resolve; });
  await androidMap.route('https://tiles.openfreemap.org/**', async route => {
    if (!route.request().url().includes('/styles/')) await tilesReady;
    await route.continue();
  });
  await androidMap.goto(`${base}/map/v1/map.html#${encodeURIComponent(JSON.stringify({ mode: 'route', language: 'ar', pickup, dropoff, driver: { latitude: 31.9145, longitude: 35.2044, accuracy: 10, heading: 90 }, padding: 40, recenter: copy.ar.recenter }))}`);
  await androidMap.locator('.maplibregl-marker').nth(1).waitFor();
  const prematureReady = await androidMap.evaluate(() => window.mapMessages.some(m => m.type === 'ready'));
  releaseTiles();
  assert.equal(prematureReady, false, 'Android must not enable pin confirmation before its map tiles load');
  await androidMap.waitForFunction(() => window.mapMessages.some(m => m.type === 'ready'));
  await androidMap.locator('.maplibregl-marker').nth(2).waitFor(); // initial fragment driver needs no host injection
  await androidMap.evaluate(driver => window.wind({ driver, focus: 'pickup' }), { latitude: 31.9145, longitude: 35.2044, accuracy: 10, heading: 90 });
  await androidMap.locator('.maplibregl-marker').nth(2).waitFor();
  await androidMap.evaluate(() => window.wind({ approach: [[35.2044, 31.9145], [35.2034, 31.9038]], stale: true }));
  await androidMap.waitForFunction(() => window.testMap.getSource('approach').serialize().data.features?.length === 0);
  await androidMap.evaluate(() => window.wind({ stale: false }));
  await androidMap.waitForFunction(() => window.testMap.getSource('approach').serialize().data.geometry?.type === 'LineString');
  // Recenter brings a driver's follow camera back to the car, street-level and a little below the middle.
  await androidMap.evaluate(() => window.wind({ follow: true }));
  await androidMap.evaluate(() => { window.testMap.fire('dragstart'); window.testMap.jumpTo({ center: [35.3, 32.0] }); });
  await androidMap.locator('#recenter').click();
  await androidMap.waitForFunction(() => {
    const p = window.testMap.project([35.2044, 31.9145]);
    return Math.abs(p.x - innerWidth / 2) < 20 && Math.abs(p.y - (innerHeight / 2 - 40)) < 20;
  });
  await new Promise(resolve => setTimeout(resolve, 1300));
  await androidMap.evaluate(() => window.wind({ driver: { latitude: 31.9155, longitude: 35.2054, accuracy: 10, heading: 90 } }));
  await androidMap.waitForFunction(() => {
    const marker = window.testMarker.getLngLat(), halo = window.testMap.getSource('accuracy').serialize().data.geometry?.coordinates;
    return halo && marker.lat > 31.91455 && marker.lat < 31.91545
      && Math.abs(marker.lat - halo[1]) < 0.00015 && Math.abs(marker.lng - halo[0]) < 0.00015;
  });
  pass('Android accuracy halo follows the moving marker while the approach line is active');
  await androidMap.waitForLoadState('networkidle');
  await androidMap.screenshot({ path: join(output, 'android-map-bridge.png') });
  await androidMap.evaluate(() => window.wind({ driver: null }));
  await until(() => androidMap.locator('.maplibregl-marker').count(), n => n === 2, 'Android bridge did not remove ended GPS');
  pass('Android map waits for tiles, restores stale approach, recenters immediately, and updates driver marker');

  stage = 'map tile failure';
  const badTiles = await newPage();
  await badTiles.addInitScript(() => {
    window.mapMessages = [];
    window.ReactNativeWebView = { postMessage: json => window.mapMessages.push(JSON.parse(json)) };
    const later = window.setTimeout;
    window.setTimeout = (fn, ms, ...args) => later(fn, ms === 20_000 ? 5_000 : ms, ...args);
  });
  await badTiles.route('https://tiles.openfreemap.org/**', route => route.request().url().includes('/styles/') ? route.continue() : route.abort());
  await badTiles.goto(`${base}/map/v1/map.html#${encodeURIComponent(JSON.stringify({ mode: 'route', language: 'en', pickup, dropoff, padding: 40 }))}`);
  await badTiles.waitForFunction(() => window.mapMessages.some(m => m.type === 'drawing'));
  await badTiles.waitForFunction(() => window.mapMessages.some(m => m.type === 'failed'), null, { timeout: 12_000 });
  assert.equal(await badTiles.evaluate(() => window.mapMessages.some(m => m.type === 'ready')), false,
    'A parsed style with failed basemap tiles is not a usable map');
  pass('Android map reports failure when the style loads but basemap tiles fail');

  const webBadTiles = await newPage();
  await webBadTiles.addInitScript(() => {
    const later = window.setTimeout;
    window.setTimeout = (fn, ms, ...args) => later(fn, ms === 25_000 || ms === 20_000 ? 5_000 : ms, ...args);
  });
  await login(webBadTiles, '0599000701');
  await webBadTiles.route('https://tiles.openfreemap.org/**', route => route.request().url().includes('/styles/') ? route.continue() : route.abort());
  await webBadTiles.goto(base + '/book?from=ramallah&to=nablus');
  await openPickupPin(webBadTiles);
  await webBadTiles.getByText(c.pinUnavailable, { exact: true }).waitFor();
  assert.equal(await button(webBadTiles, c.confirmPickupSpot).count(), 0, 'A blank web map cannot confirm a pin');
  await webBadTiles.unroute('https://tiles.openfreemap.org/**');
  await webBadTiles.getByRole('button', { name: c.retry, exact: true }).last().click();
  await until(() => button(webBadTiles, c.confirmPickupSpot).isEnabled(), Boolean, 'The web pin picker did not recover after tile service returned');
  pass('web pin picker refuses blank tiles and recovers after Retry');

  stage = 'responsive role screens';
  for (const [width, height] of [[360, 780], [768, 1024], [1440, 1000]]) {
    await adminPage.setViewportSize({ width, height });
    await adminPage.goto(base + '/admin');
    await adminPage.getByRole('tab', { name: c.dashboard, exact: true }).waitFor();
    assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Admin overflow at ${width}`);
  }
  await driverPage.goto(base + '/driver/earnings');
  await driverPage.getByText(c.cashOwed, { exact: true }).waitFor();
  await customerPage.goto(base + '/account');
  await button(customerPage, `${c.languageTitle}: ${c.language}`).click();
  await until(() => customerPage.evaluate(() => document.documentElement.lang), lang => lang === 'ar', 'Arabic language did not apply');
  await customerPage.goto(base + `/order/${id}`);
  await button(customerPage, copy.ar.viewReceipt).waitFor();
  await customerPage.screenshot({ path: join(output, 'arabic-completed.png'), fullPage: true });
  stage = 'booking recovery';
  // A saved booking that cannot be read fails closed, and can be asked again.
  const unreadable = await newPage();
  await login(unreadable, '0599000701');
  await unreadable.addInitScript(() => {
    const read = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (String(key).startsWith('booking.') && !window.bookingStorageBack) throw new Error('storage blocked');
      return read.call(this, key);
    };
  });
  await unreadable.goto(base + '/book');
  await unreadable.getByText(c.bookingStorageError).waitFor();
  await unreadable.evaluate(() => { window.bookingStorageBack = true; });
  await button(unreadable, c.retry).click();
  await unreadable.getByText(c.bookingStorageError).waitFor({ state: 'hidden' });
  // Order again with the old order out of reach says so, rather than look like its route was copied.
  const unreachable = await newPage();
  await login(unreachable, '0599000701');
  await unreachable.route(apiRoute('/api/orders/424242'), route => route.abort());
  await unreachable.goto(base + '/book?again=424242');
  await unreachable.getByText(c.orderAgainFailed).waitFor();
  pass('booking storage retry and a failed order-again both say what happened');

  stage = 'booking price failure and missed pickup';
  const pricePage = await newPage();
  await login(pricePage, '0599000701');
  const pricePath = apiRoute('/api/price');
  await pricePage.route(pricePath, route => route.fulfill({ status: 409, json: { error: 'route_prohibited' } }));
  await pricePage.goto(base + '/book?from=ramallah&to=nablus');
  await pricePage.getByText(c.err_route_prohibited, { exact: true }).waitFor();
  assert.equal(await button(pricePage, c.request).isDisabled(), true, 'A refused route cannot be requested');
  await pricePage.unroute(pricePath);
  await pricePage.route(pricePath, route => route.abort());
  await button(pricePage, c.retry).click();
  await pricePage.getByText(c.quote_failed, { exact: true }).waitFor();
  assert.equal(await button(pricePage, c.request).isDisabled(), true, 'A failed price cannot be requested');
  await pricePage.unroute(pricePath);
  for (const status of [401, 408, 429, 500]) {
    await pricePage.route(pricePath, route => route.fulfill({ status, json: { error: 'route_prohibited' } }));
    const response = pricePage.waitForResponse(r => new URL(r.url()).pathname === '/api/price' && r.status() === status);
    await button(pricePage, c.retry).click();
    await pricePage.getByText(c.quote_failed, { exact: true }).waitFor({ state: 'hidden' });
    await response;
    await pricePage.getByText(c.quote_failed, { exact: true }).waitFor();
    assert.equal(await button(pricePage, c.request).isDisabled(), true, `${status} must leave Request disabled`);
    await pricePage.unroute(pricePath);
  }

  await pricePage.goto(base + '/book?from=ramallah&to=nablus');
  await button(pricePage, c.sheetExpand).click();
  await field(pricePage, c.pickupNote).fill('QA pickup: shop entrance');
  await field(pricePage, c.dropoffNote).fill('QA dropoff: office reception');
  await field(pricePage, c.parcelDetail).fill('Sealed documents');
  await field(pricePage, c.recipientPhone).fill('0599000707');
  await field(pricePage, c.recipientName).fill('QA Recipient');
  const requestButton = button(pricePage, new RegExp(`^${c.request}`));
  await until(() => requestButton.isEnabled(), Boolean, 'Initial price was not ready');
  const bookingPath = apiRoute('/api/orders');
  let bookingError = 'itinerary_changed';
  await pricePage.route(bookingPath, route => route.fulfill({ status: bookingError === 'quote_not_found' ? 404 : 409, json: { error: bookingError } })); // the statuses the server sends
  for (const code of ['itinerary_changed', 'quote_not_found']) {
    bookingError = code;
    // A refused booking refetches anyway; what matters is that the old price cannot be requested while the new one loads.
    await pricePage.route(pricePath, async route => { await new Promise(resolve => setTimeout(resolve, 2000)); await route.continue(); });
    const refreshed = pricePage.waitForResponse(r => new URL(r.url()).pathname === '/api/price' && r.status() === 200);
    refreshed.catch(() => undefined); // a failure below closes the page; this must not crash the run before the failure prints
    await requestButton.click();
    await pricePage.getByText(c[`err_${code}`], { exact: true }).waitFor();
    await pricePage.waitForTimeout(700);
    assert.equal(await requestButton.isDisabled(), true, `${code}: the old price must not be requestable while the new one loads`);
    await refreshed;
    await pricePage.unroute(pricePath);
    await until(() => requestButton.isEnabled(), Boolean, `The price was not refreshed after ${code}`);
  }
  await pricePage.unroute(bookingPath);

  const orderPath = apiRoute(`/api/orders/${scheduledId}`);
  let orderFixture = { ...scheduledSnapshot, scheduledFor: Date.now() - 60_000, dispatch: null };
  await pricePage.route(orderPath, route => route.fulfill({ json: orderFixture }));
  await pricePage.goto(`${base}/order/${scheduledId}`);
  await pricePage.getByText(c.scheduledMissed, { exact: true }).waitFor();
  await button(pricePage, c.cancelOrder).waitFor();
  orderFixture = { ...orderFixture, dispatch: { roundId: '0b8c5e1e-4a7b-4d2a-9c3e-2f1a6b7c8d9e', state: 'exhausted', deadlineAt: Date.now() } };
  await pricePage.reload();
  await pricePage.getByText(c.dispatchExhausted, { exact: true }).waitFor();
  orderFixture = { ...orderFixture, scheduledFor: Date.now() + 60_000, dispatch: null };
  await pricePage.reload();
  await pricePage.getByText(c.findingBody, { exact: true }).waitFor();
  orderFixture = { ...orderFixture, scheduledFor: null };
  await pricePage.reload();
  await pricePage.getByText(c.findingBody, { exact: true }).waitFor();
  await pricePage.unroute(orderPath);
  pass('price refusals and missed scheduled pickups show the right guidance');
  assert.deepEqual(errors, [], 'Unhandled browser errors');
  pass('driver earnings, admin mobile/tablet/desktop, Arabic order, zero unhandled browser errors');
} catch (error) {
  console.error('Location diagnostics', db.prepare('SELECT driver_id, updated_at FROM driver_locations').all(),
    db.prepare('SELECT id, driver_id, assigned_at, status FROM orders').all(), Date.now());
  console.error('Location requests', requests.filter(r => r.path === '/api/location'));
  for (const [i, page] of pages.entries()) {
    await page.screenshot({ path: join(output, `failure-${i}.png`), fullPage: true }).catch(() => {});
    writeFileSync(join(output, `failure-${i}.txt`), await page.locator('body').ariaSnapshot().catch(() => 'Page unavailable'));
    console.error('Page', i, await page.evaluate(async () => ({ path: location.pathname, visibility: document.visibilityState,
      permission: (await navigator.permissions.query({ name: 'geolocation' })).state, watches: window.scenarioWatches.size,
      fixAge: window.scenarioFixAge, geoError: window.scenarioGeoError })).catch(() => ({})));
  }
  console.error(`FAILED at ${stage}`);
  throw error;
} finally {
  writeFileSync(join(output, 'results.json'), JSON.stringify({ checks, errors, stage, requests }, null, 2));
  await browser.close();
  await shutdown();
  await new Promise(r => osrm.close(r));
}
