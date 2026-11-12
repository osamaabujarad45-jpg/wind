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
  page.on('requestfinished', async request => {
    if (!request.url().includes('/api/orders/commands/')) return;
    try { const response = await request.response(); console.log('RECEIPT FINISHED', response?.status(), await response?.text()); }
    catch (e) { console.log('RECEIPT ERROR', e.message); }
  });
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
  if (lostResponse) {
    const loseResponse = async route => {
      if (route.request().method() !== 'POST') return route.continue();
      await page.unroute(apiRoute('/api/orders'), loseResponse);
      const posted = await route.fetch();
      console.log('LOST POST RESULT', posted.status(), await posted.text());
      await route.abort('connectionreset');
    };
    await page.route(apiRoute('/api/orders'), loseResponse);
    await page.route(apiRoute('/api/orders/commands/*'), route => route.fulfill({ status: 503, json: { error: 'temporarily_unavailable' } }));
  }
  await button(page, new RegExp(`^${scheduled ? c.scheduleRequest : c.request}`)).click();
  if (lostResponse) {
    await Promise.race([
      page.waitForURL(/\/order\/\d+$/),
      page.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith('booking.'))),
    ]);
    console.log('REPRO before reload', await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))));
    await page.unroute(apiRoute('/api/orders/commands/*'));
    await page.reload();
    console.log('REPRO after reload', await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))));
    // T19 recovery: the read-only reconciliation finds the committed order on its own and navigates to it —
    // no second booking is created and no manual retry is needed for a confirmed-present command.
  }
  await page.waitForURL(/\/order\/\d+$/).catch(async error => {
    const diagnostic = await page.evaluate(async () => {
      const stored = {};
      for (const [key, value] of Object.entries(localStorage)) if (key.startsWith('booking.')) stored[key] = value;
      const pending = Object.values(stored)[0];
      const command = pending ? JSON.parse(pending).requestId : null;
      let direct = null;
      if (command) {
        try {
          const response = await fetch(`/api/orders/commands/${command}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
          direct = { status: response.status, body: await response.text() };
        } catch (e) { direct = { error: e.message }; }
      }
      return { url: location.href, text: document.body.innerText, storage: stored, direct };
    });
    console.error('Booking recovery diagnostic', diagnostic);
    console.error('Booking recovery rows', db.prepare('SELECT o.id, o.status, c.request_id FROM orders o LEFT JOIN order_commands c ON c.order_id = o.id ORDER BY o.id').all());
    throw error;
  });
  return Number(new URL(page.url()).pathname.split('/').pop());
}

try {
  const customerPage = await newPage();
  customerPage.on('framenavigated', frame => { if (frame === customerPage.mainFrame()) console.log('REPRO navigation', frame.url()); });
  customerPage.on('response', response => { if (response.url().includes('/api/orders')) console.log('REPRO response', response.status(), response.url()); });
  await signup(customerPage, '0599000701', 'QA Customer');
  for (let attempt = 1; attempt <= 10; attempt++) {
    stage = `booking retry ${attempt}`;
    const before = db.prepare('SELECT COUNT(*) n FROM orders').get().n;
    const id = await booking(customerPage, { lostResponse: true });
    assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, before + 1);
    console.log(`PASS recovery attempt ${attempt}: order ${id}`);
  }
} catch (error) {
  console.error('Location requests', requests.filter(r => r.path.includes('/orders')));
  for (const [i, page] of pages.entries()) {
    await page.screenshot({ path: join(output, `booking-repro-failure-${i}.png`), fullPage: true }).catch(() => {});
    writeFileSync(join(output, `booking-repro-failure-${i}.txt`), await page.locator('body').ariaSnapshot().catch(() => 'Page unavailable'));
  }
  console.error(`FAILED at ${stage}`);
  throw error;
} finally {
  writeFileSync(join(output, 'booking-repro-results.json'), JSON.stringify({ checks, errors, stage, requests }, null, 2));
  await browser.close();
  await shutdown();
  await new Promise(r => osrm.close(r));
}
