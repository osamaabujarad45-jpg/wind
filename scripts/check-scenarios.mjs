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
  const build = spawnSync(process.execPath, [join(root, 'node_modules/expo/bin/cli'), 'export', '-p', 'web', '--clear', '--output-dir', process.env.WEB_ROOT], {
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
const { server, db, promote, shutdown } = await import('../server/main.ts');
await new Promise(r => server.listen(4188, '127.0.0.1', r));
const call = apiCaller(() => base + '/api');
const browser = await chromium.launch({ headless: true });
const c = copy.en, password = 'Scenario_Local_2026';
const pages = [], errors = [], checks = [], requests = [];
let stage = 'setup';
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
  if (driver) await page.getByRole('radio', { name: c.driver, exact: true }).click();
  await page.getByRole('checkbox', { name: c.consent }).click();
  await button(page, c.createAccount).click();
  await page.waitForURL(url => !url.pathname.startsWith('/auth'));
  return page.evaluate(() => localStorage.getItem('token'));
}
const state = id => db.prepare('SELECT * FROM orders WHERE id=?').get(id);
async function atStatus(id, status) { return until(() => state(id), o => o?.status === status, `Order ${id} did not reach ${status}`); }
async function booking(page, { service = 'parcel', lostResponse = false, scheduled = false } = {}) {
  await page.goto(`${base}/book?service=${service}&from=ramallah&to=nablus`);
  await field(page, service === 'ride' ? c.pickupNote_ride : c.pickupNote).fill('QA pickup: shop entrance');
  await field(page, c.dropoffNote).fill('QA dropoff: office reception');
  await field(page, c[`${service}Detail`]).fill(service === 'parcel' ? 'Sealed documents' : service === 'freight' ? 'One boxed appliance' : 'Meet at the entrance');
  if (service !== 'ride') {
    await field(page, c.recipientPhone).fill('0599000707');
    await field(page, c.recipientName).fill('QA Recipient');
  }
  if (scheduled) await page.getByRole('radio', { name: c.later, exact: true }).click();
  if (lostResponse) await page.route('**/api/orders', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fetch(); // the server commits; only its response is lost
    await route.abort('connectionreset');
  }, { times: 1 });
  await button(page, new RegExp(`^${scheduled ? c.scheduleRequest : c.request}`)).click();
  if (lostResponse) {
    await page.getByText(c.bookingPending, { exact: true }).waitFor();
    await page.reload();
    await button(page, new RegExp(`^${c.confirmBooking}`)).click();
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
  stage = 'signup and approval';
  await call('/auth/register', { body: { name: 'QA Administrator', email: 'admin@example.test', phone: '0599000709', password, consent: true } });
  promote('0599000709');
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
  await driverPage.getByText(c.online, { exact: true }).waitFor();
  const driverToken = await driverPage.evaluate(() => localStorage.getItem('token'));
  pass('customer and driver UI registration, pending gate, admin approval, driver login');

  stage = 'booking retry';
  const countBefore = db.prepare('SELECT COUNT(*) n FROM orders').get().n;
  const id = await booking(customerPage, { lostResponse: true });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, countBefore + 1);
  assert.equal(await customerPage.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('booking.')).length), 0);
  pass('lost booking response and page reload recover exactly one order');

  stage = 'driver acceptance and live map';
  // The first cached fix predates acceptance. Deliver a fresh GPS fix while that
  // upload is still in flight: it must be uploaded next, not discarded.
  await driverPage.route('**/api/location', async route => {
    const response = await route.fetch();
    assert.equal((await response.json()).accepted, false);
    const before = await driverPage.evaluate(() => window.scenarioFixCount);
    await driverPage.context().setGeolocation({ latitude: 31.9045, longitude: 35.2044, accuracy: 15 });
    await driverPage.waitForFunction(n => window.scenarioFixCount > n, before);
    await route.fulfill({ response });
  }, { times: 1 });
  await driverPage.goto(base + '/driver');
  await button(driverPage, c.accept).click();
  await driverPage.waitForURL(new RegExp(`/order/${id}$`));
  await atStatus(id, 'assigned');
  await until(() => call(`/orders/${id}`, { token: customerToken }), o => o.driverLocation?.latitude === 31.9045, 'Latest GPS fix was lost during the previous upload');
  await customerPage.getByText(c.assigned, { exact: true }).waitFor();
  await customerPage.locator('.maplibregl-marker').nth(2).waitFor();
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
  const shareResponse = customerPage.waitForResponse(r => r.url().endsWith(`/orders/${id}/share`) && r.request().method() === 'POST');
  await button(customerPage, c.shareTracking).click();
  const share = await (await shareResponse).json();
  const recipient = await newPage();
  await recipient.goto(base + share.path);
  await recipient.locator('.maplibregl-marker').first().waitFor();
  const publicText = await recipient.locator('body').innerText();
  assert.ok(!publicText.includes('0599000701') && !publicText.includes('QA pickup:') && !publicText.includes('0599000707'));
  await recipient.screenshot({ path: join(output, 'recipient-tracking.png'), fullPage: true });
  pass('two-way chat and anonymous recipient tracking without private contacts or landmarks');

  stage = 'handover and receipt';
  await advance(driverPage, id, 'assigned', 'at_pickup');
  await advance(driverPage, id, 'at_pickup', 'in_transit');
  const order = await call(`/orders/${id}`, { token: customerToken });
  await field(driverPage, c.codeFromCustomer).fill(order.handoverCode === '0000' ? '1111' : '0000');
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
  await field(customerPage, c.pickupNote).waitFor();
  assert.equal(await field(customerPage, c.pickupNote).inputValue(), 'QA pickup: shop entrance');
  assert.equal(await field(customerPage, c.recipientPhone).inputValue(), '');
  await customerPage.getByText(c.chooseCity, { exact: true }).waitFor();
  const cancelId = await booking(customerPage);
  await button(customerPage, c.cancelOrder).click();
  await atStatus(cancelId, 'cancelled');
  pass('send another retains pickup only; customer cancellation reaches terminal state');

  stage = 'scheduled delivery';
  const scheduledId = await booking(customerPage, { scheduled: true });
  assert.ok(state(scheduledId).scheduled_for > Date.now());
  assert.ok(!(await call('/jobs', { token: driverToken })).some(o => o.id === scheduledId), 'Future jobs must not be dispatched immediately');
  await button(customerPage, c.cancelOrder).click();
  await atStatus(scheduledId, 'cancelled');
  pass('scheduled booking stays out of immediate driver dispatch and can be cancelled');

  stage = 'failed delivery and return';
  const returnId = await booking(customerPage);
  await driverPage.goto(base + '/driver');
  await button(driverPage, c.accept).click();
  await driverPage.waitForURL(new RegExp(`/order/${returnId}$`));
  await advance(driverPage, returnId, 'assigned', 'at_pickup');
  await advance(driverPage, returnId, 'at_pickup', 'in_transit');
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

  stage = 'map picker and recovery';
  await customerPage.goto(base + '/book?from=ramallah&to=nablus');
  await button(customerPage, c.pickupOnMap).click();
  const confirmPin = button(customerPage, c.confirmPin);
  await until(() => confirmPin.isEnabled(), Boolean, 'Pin map did not become ready');
  const canvas = customerPage.locator('canvas.maplibregl-canvas').last();
  const box = await canvas.boundingBox();
  await customerPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await customerPage.mouse.down();
  await customerPage.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, { steps: 10 });
  await customerPage.mouse.up();
  const pinQuote = customerPage.waitForRequest(r => r.url().endsWith('/api/price') && r.postDataJSON()?.pickupPoint);
  await confirmPin.click();
  const chosen = (await pinQuote).postDataJSON().pickupPoint;
  assert.ok(Math.abs(chosen.latitude - 31.9038) + Math.abs(chosen.longitude - 35.2034) > 0.0001,
    'Confirm immediately after dragging must save the moved pin, not the starting city centre');
  await button(customerPage, c.pickupOnMap).waitFor();
  pass('map picker loads real tiles, pans and confirms an exact pickup');

  stage = 'map download recovery';
  const recovery = await newPage();
  await login(recovery, '0599000701');
  await recovery.route('**/vendor/maplibre-*/load.mjs', route => route.abort());
  await recovery.goto(base + '/book?from=ramallah&to=nablus');
  await button(recovery, c.retry).click({ trial: true });
  await recovery.unroute('**/vendor/maplibre-*/load.mjs');
  await button(recovery, c.retry).click();
  await recovery.locator('.maplibregl-marker').first().waitFor();
  pass('failed map library download shows fallback and recovers with Retry');

  stage = 'Android map bridge';
  const androidMap = await newPage('ar');
  await androidMap.context().addInitScript(() => {
    window.mapMessages = [];
    window.ReactNativeWebView = { postMessage: json => window.mapMessages.push(JSON.parse(json)) };
  });
  const pickup = { latitude: 31.9038, longitude: 35.2034 }, dropoff = { latitude: 32.2211, longitude: 35.2544 };
  let releaseTiles;
  const tilesReady = new Promise(resolve => { releaseTiles = resolve; });
  await androidMap.route('https://tiles.openfreemap.org/**', async route => {
    if (!route.request().url().includes('/styles/')) await tilesReady;
    await route.continue();
  });
  await androidMap.goto(`${base}/map.html#${encodeURIComponent(JSON.stringify({ mode: 'route', language: 'ar', pickup, dropoff, padding: 40, recenter: copy.ar.recenter }))}`);
  await androidMap.locator('.maplibregl-marker').nth(1).waitFor();
  const prematureReady = await androidMap.evaluate(() => window.mapMessages.some(m => m.type === 'ready'));
  releaseTiles();
  assert.equal(prematureReady, false, 'Android must not enable pin confirmation before its map tiles load');
  await androidMap.waitForFunction(() => window.mapMessages.some(m => m.type === 'ready'));
  await androidMap.evaluate(driver => window.wind({ driver, focus: 'pickup' }), { latitude: 31.9145, longitude: 35.2044, accuracy: 10, heading: 90 });
  await androidMap.locator('.maplibregl-marker').nth(2).waitFor();
  await androidMap.waitForLoadState('networkidle');
  await androidMap.screenshot({ path: join(output, 'android-map-bridge.png') });
  await androidMap.evaluate(() => window.wind({ driver: null }));
  await until(() => androidMap.locator('.maplibregl-marker').count(), n => n === 2, 'Android bridge did not remove ended GPS');
  pass('Android map waits for tiles, ready/update bridge, Arabic tiles, driver marker creation and removal');

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
