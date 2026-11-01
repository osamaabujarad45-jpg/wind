// Physical Android Chrome only. Run on k5 with loopback SSH forwarding for API
// (4188) and the attached phone's CDP (9228). Never launches a desktop browser.
// Operating approvals and geolocation below are synthetic test fixtures, not field evidence.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { fixture, polygon } from '../tests/eligibility-support.mjs';
import { addDriver, assessRide, bookRide, myOffer } from '../tests/dispatch-support.mjs';
import { connectionString } from '../tests/pg-support.mjs';
import { copy, fill } from '../src/copy.ts';

const cdp = process.env.WIND_PHYSICAL_CDP;
if (cdp !== 'http://127.0.0.1:9228') throw new Error('Requires the explicitly forwarded physical-phone CDP on loopback 9228');
const output = resolve('.artifacts/study-expanded-phone');
await mkdir(output, { recursive: true });
const f = await fixture('expandedphone', { WIND_DISPATCH_TEST_ONLY: '1', WIND_BOARDING_TEST_ONLY: '1' });
let app, browser, page;
const checks = [], errors = [], c = copy.en, base = 'http://127.0.0.1:4188';
const post = (path, token, body = {}) => f.call(path, { token, body });
const until = async (check, label) => {
  const deadline = Date.now() + 30_000;
  do { if (await check()) return; await new Promise(r => setTimeout(r, 200)); } while (Date.now() < deadline);
  throw new Error(`Timed out: ${label}`);
};
try {
  const common = { ...f.common, vehicleClasses: ['car', 'van'] };
  const from = await f.post('/areas', { ...common, key: 'synthetic_from', geometry: polygon(35.19, 31.89, 35.21, 31.91) });
  const to = await f.post('/areas', { ...common, key: 'synthetic_to', geometry: polygon(35.25, 32.21, 35.27, 32.23) });
  await f.post('/routes', { ...common, key: 'synthetic_forward', fromAreaId: from.id, toAreaId: to.id, corridor: polygon(35.18, 31.88, 35.28, 32.24) });
  await f.activatePolicy();
  const who = await addDriver(f, { latitude: 31.9, longitude: 35.19 });
  const van = await f.account('driver', 'van');
  const vehicle = await f.post('/vehicles', { ...f.vehicleBody, class: 'van', plate: 'SYNTHETIC-PHONE-FREIGHT', usableGrams: 100_000 });
  await f.verify(van, vehicle.id);
  Object.assign(process.env, { NODE_ENV: 'test', WIND_DATABASE_URL: connectionString, WIND_POSTGRES_TEST_ONLY: '1',
    WIND_POSTGRES_TEST_SCHEMA: f.schema, DB_PATH: join(await mkdtemp(join(tmpdir(), 'wind-expanded-phone-')), 'legacy.sqlite'),
    WEB_ROOT: resolve('.expo/study-expanded-web'), WIND_LOCAL_TEST: '1', WIND_RELEASE: '0', WIND_IDENTITY_MODE: 'operator-verified',
    WIND_ENABLED_SERVICES: 'parcel,ride,freight', WIND_DISPATCH_TEST_ONLY: '1', WIND_BOARDING_TEST_ONLY: '1' });
  app = await import('../server/main.ts');
  await new Promise((yes, no) => { app.server.once('error', no); app.server.listen(4188, '127.0.0.1', yes); });
  console.log('PHONE_BACKEND_READY');
  browser = await chromium.connectOverCDP(cdp);
  await until(() => {
    page = browser.contexts()[0].pages().find(p => p.url().startsWith(base) && p.url().includes('expandedPhone='));
    return !!page;
  }, 'dedicated expandedPhone tab after backend startup');
  await page.bringToFront();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', e => errors.push(e.message));
  // This is a deterministic, synthetic GPS transport fixture on the real phone.
  // It does not validate Android background delivery or the physical GPS sensor.
  await page.addInitScript(() => {
    const permissionQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = descriptor => descriptor.name === 'geolocation'
      ? Promise.resolve({ state: 'granted', onchange: null, addEventListener() {}, removeEventListener() {} }) : permissionQuery(descriptor);
    const position = () => ({ timestamp: Date.now(), coords: { latitude: 31.9, longitude: 35.19, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: 0 } });
    navigator.geolocation.getCurrentPosition = success => { success(position()); };
    navigator.geolocation.watchPosition = success => { success(position()); return setInterval(() => success(position()), 5000); };
    navigator.geolocation.clearWatch = id => clearInterval(id);
  });
  await page.goto(base + '/auth');
  const login = async (actor, path) => {
    await page.evaluate(token => { localStorage.setItem('token', token); localStorage.setItem('language', 'en'); localStorage.setItem('onboarded', '1'); }, actor.token);
    await page.goto(base + path);
  };
  const click = async label => {
    const button = page.getByRole('button', { name: label, exact: true });
    await button.evaluate(control => control.scrollIntoView({ block: 'center' }));
    await button.click();
  };
  await login(who.driver, '/driver');
  await page.getByText(c.jobs, { exact: true }).first().waitFor();
  await post('/driver/presence/heartbeat', who.driver.token, { deviceId: who.deviceId, sessionId: who.sessionId, seq: 1 });
  await post('/driver/presence/location', who.driver.token, { deviceId: who.deviceId, sessionId: who.sessionId, seq: 2, ageMs: 0, latitude: 31.9, longitude: 35.19, accuracy: 20 });
  // Issue the short lease only after the driver screen is ready.
  const ride = await bookRide(f);
  await assessRide(f, ride, [who.vehicle]);
  if (!await myOffer(f, ride.id, who.driver)) await post(`/orders/${ride.id}/dispatch/retry`, f.customer.token);
  const issued = await myOffer(f, ride.id, who.driver);
  assert.ok(issued, JSON.stringify({ presence: await f.call('/driver/presence', { token: who.driver.token }),
    rounds: await f.db.all('SELECT state,close_reason FROM dispatch_rounds WHERE order_id=?', ride.id) }));
  await page.getByText(/Ride offer · expires in/).waitFor({ timeout: 14_000 });
  assert.equal(await page.getByRole('button', { name: c.offerPrice, exact: true }).count(), 0, 'leased rides cannot solicit a competing price');
  await page.getByRole('button', { name: /^(Accept at|Accept job)/ }).first().click();
  await page.waitForURL(new RegExp(`/order/${ride.id}$`));
  assert.equal((await f.call(`/orders/${ride.id}`, { token: who.driver.token })).ride.boardingCode, undefined);
  await login(f.customer, `/order/${ride.id}`);
  await page.getByText(c.rideBoardingCode, { exact: true }).waitFor();
  await login(who.driver, `/order/${ride.id}`);
  checks.push('A53 accepts a leased ride with nonce and capacity revision; driver never receives PIN');
  // The synthetic fix sits on the pickup: inside the arrival radius the plain hint shows and Arrive leads.
  await page.getByText(c.rideArrivalHint, { exact: true }).waitFor();
  await click(c.rideArrive);
  await page.getByText(/Waiting time remaining/).waitFor();
  await click(c.advance_assigned);
  await page.getByLabel(c.rideEnterCode, { exact: true }).waitFor();
  const customerView = await f.call(`/orders/${ride.id}`, { token: f.customer.token });
  await page.getByLabel(c.rideEnterCode, { exact: true }).fill(customerView.ride.boardingCode === '0000' ? '0001' : '0000');
  await page.getByLabel(c.rideEnterCode, { exact: true }).evaluate(input => input.blur());
  await click(c.advance_at_pickup_ride);
  await page.getByText(c.err_wrong_boarding_code, { exact: true }).waitFor();
  await page.getByLabel(c.rideEnterCode, { exact: true }).fill(customerView.ride.boardingCode);
  await page.getByLabel(c.rideEnterCode, { exact: true }).evaluate(input => input.blur());
  await click(c.advance_at_pickup_ride);
  await page.getByRole('button', { name: c.advance_in_transit_ride, exact: true }).waitFor();
  await page.screenshot({ path: join(output, 'a53-ride-underway.png') });
  await click(c.advance_in_transit_ride);
  await until(async () => (await f.call(`/orders/${ride.id}`, { token: f.customer.token })).status === 'completed', 'ride completion');
  checks.push('A53 confirms arrival, displays grace clock, starts with passenger PIN and completes ride');

  await login(f.customer, '/book?service=freight&from=ramallah&to=nablus');
  await click(c.pickupOnMap); await click(c.confirmPin);
  await click(c.dropoffOnMap); await click(c.confirmPin);
  for (const [label, value] of [[c.pickupNote, 'Synthetic depot'], [c.dropoffNote, 'Synthetic receiver'], [c.freightDetail, 'Two equal-sized sealed boxes'],
    [c.freightPieces, '2'], [c.freightLength, '10'], [c.freightWidth, '20'], [c.freightHeight, '30'], [c.freightMass, '2'], [c.freightCrew, '1']])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel(c.freightCrew, { exact: true }).evaluate(input => input.blur());
  await page.getByRole('checkbox', { name: c.freightStraps, exact: true }).click();
  assert.equal(await page.getByRole('checkbox', { name: c.freightStraps, exact: true }).isChecked(), true);
  const request = page.getByRole('button', { name: /^Request/ });
  await until(() => request.isEnabled(), 'freight quote');
  await request.click();
  await page.waitForURL(/\/order\/\d+$/);
  const freightId = Number(new URL(page.url()).pathname.split('/').at(-1));
  const load = await f.call(`/orders/${freightId}`, { token: f.customer.token });
  assert.equal(load.service, 'freight'); assert.equal(load.declaredScope.massGrams, 2000);
  assert.equal(load.declaredScope.itemCount, 2); assert.equal(load.declaredScope.lengthMm, 100);
  assert.deepEqual(load.declaredScope.equipment, ['straps']);
  assert.equal(load.declaredScope.loadingBefore - load.declaredScope.loadingAfter, 7_200_000);
  await page.getByText(c.freightScopeTitle, { exact: true }).waitFor();
  await page.screenshot({ path: join(output, 'a53-freight-contract.png') });
  checks.push('A53 creates quote-bound freight with exact units, crew, equipment and loading window');
  await f.assess(load, { seats: 1, items: [{ count: 2, gramsEach: 1000, lengthMm: 100, widthMm: 200, heightMm: 300 }],
    route: { type: 'LineString', coordinates: [[load.pickupPoint.longitude, load.pickupPoint.latitude], [load.dropoffPoint.longitude, load.dropoffPoint.latitude]] } });
  await f.approach(load, { vehicleId: vehicle.id });
  await login(van, '/driver');
  await page.getByText(c.freightScopeTitle, { exact: true }).waitFor();
  await click(c.offerPrice);
  await page.getByRole('button', { name: /^Send offer/ }).click();
  await until(async () => (await f.call(`/orders/${freightId}`, { token: f.customer.token })).offers?.length === 1, 'freight price offer');
  await login(f.customer, `/order/${freightId}`);
  await click(c.acceptOffer);
  await until(async () => (await f.call(`/orders/${freightId}`, { token: f.customer.token })).status === 'assigned', 'customer accepts freight offer');
  checks.push('A53 driver reviews inspected load and offers price; customer accepts with reviewed capacity revision');
  // Forced upgrade: the web build names its client build on every call; above the minimum, only the update screen shows.
  process.env.WIND_MIN_CLIENT_BUILD = '99999';
  try {
    await page.goto(base + '/');
    await page.getByText(c.updateRequired, { exact: true }).waitFor();
    await page.getByRole('button', { name: c.updateRequiredWeb, exact: true }).waitFor();
    await page.screenshot({ path: join(output, 'a53-update-required.png') });
  } finally { delete process.env.WIND_MIN_CLIENT_BUILD; }
  checks.push('A53 web build sends its client build; a raised server minimum shows only the update screen');
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'results.json'), JSON.stringify({ host: process.env.COMPUTERNAME, device: 'physical SM-A5360 R5CTB0FJP9Z',
    fixtures: 'Synthetic operating approvals and GPS; loopback-only isolated PostgreSQL', checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (e) {
  if (page) {
    await page.screenshot({ path: join(output, 'a53-failure.png') }).catch(() => {});
    console.error('Physical test diagnostics:', page.url(), (await page.locator('body').innerText().catch(() => '')).slice(-6000), errors);
  }
  throw e;
} finally {
  await page?.close().catch(() => {}); // only the dedicated test tab; preserve the phone profile
  await browser?.close();
  await app?.shutdown();
  await f.close();
}
