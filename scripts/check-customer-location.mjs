// Export with EXPO_PUBLIC_API_URL=http://localhost:4188 WIND_LOCAL_TEST=1 to .expo/location-review-web before running this script.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-location-review-')), 'review.db');
process.env.WEB_ROOT = resolve('.expo/location-review-web');
process.env.WIND_LOCAL_TEST = '1';
process.env.WIND_IDENTITY_MODE = 'self-service';
delete process.env.OSRM_URL; // exercise the truthful fallback when road routing is unavailable
const { server, db } = await import('../server/main.ts');
const { copy } = await import('../src/copy.ts');
const c = copy.en;
await new Promise(resolve => server.listen(4188, '127.0.0.1', resolve));
const base = 'http://localhost:4188';
const registration = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'QA Location Review', email: 'location@example.test', phone: '0599000123', password: 'Location_Review_2026', consent: true }) });
assert.equal(registration.status, 200);
const session = await registration.json();
const browser = await chromium.launch({ headless: true });
const errors = [];
let reviewPage;
mkdirSync('.expo/location-review', { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['geolocation'], reducedMotion: 'reduce' });
  await context.route('**/vendor/maplibre-*/load.mjs', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace('globalThis.maplibregl = maplibregl;',
      'globalThis.reviewMaps = []; globalThis.maplibregl = { ...maplibregl, Map: class extends maplibregl.Map { constructor(...args) { super(...args); globalThis.reviewMaps.push(this); } } };');
    await route.fulfill({ response, body: source });
  });
  await context.addInitScript(({ token }) => {
    localStorage.setItem('token', token); localStorage.setItem('onboarded', '1'); localStorage.setItem('language', 'en');
    window.locationReview = { mode: 'success', active: new Set(), next: 0 };
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = descriptor => descriptor.name === 'geolocation' && window.locationReview.permission
      ? Promise.resolve({ state: window.locationReview.permission }) : query(descriptor);
    navigator.geolocation.watchPosition = (success, fail) => {
      const id = ++window.locationReview.next;
      window.locationReview.active.add(id);
      const deliver = () => {
        if (window.locationReview.mode === 'failure') fail?.({ code: 2, message: 'Unavailable' });
        else success({ timestamp: Date.now(), coords: { latitude: 32.312773, longitude: 35.048039, accuracy: 52.4,
          altitude: null, altitudeAccuracy: null, heading: null, speed: null } });
      };
      if (window.locationReview.mode === 'hold') window.locationReview.deliver = deliver;
      else setTimeout(deliver, 30);
      return id;
    };
    navigator.geolocation.clearWatch = id => window.locationReview.active.delete(id);
  }, { token: session.token });
  const page = await context.newPage();
  reviewPage = page;
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/book');
  await page.getByText(c.chooseCity, { exact: true }).first().waitFor();
  assert.equal(await page.getByText(c.chooseCity, { exact: true }).count(), 2);
  assert.equal(await page.getByText('Ramallah', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Nablus', { exact: true }).count(), 0);
  await page.getByRole('textbox', { name: c.pickupNote, exact: true }).fill('Unassigned pickup landmark');
  await page.getByRole('textbox', { name: c.dropoffNote, exact: true }).fill('Unassigned drop-off landmark');
  assert.equal(await page.getByRole('button', { name: c.savePlace, exact: true }).count(), 0,
    'landmarks entered before city selection cannot be saved under fallback cities');
  await page.getByRole('button', { name: /^Request/ }).click();
  await page.getByRole('textbox', { name: c.searchLabel, exact: true }).fill('Ramallah');
  await page.getByRole('button', { name: /^Ramallah,/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: c.searchApply, exact: true }).count(), 0, 'an unchosen city is not proposed automatically');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0, 'request with unchosen cities opens the picker instead of booking');
  await page.screenshot({ path: '.expo/location-review/choose-cities.png', fullPage: true });
  await page.getByRole('button', { name: /^Ramallah,/ }).click();
  await page.getByRole('button', { name: c.searchApply, exact: true }).click();
  assert.equal(await page.getByRole('button', { name: c.savePlace, exact: true }).count(), 1,
    'saving becomes available for the side whose city was explicitly chosen');

  await page.goto(base + '/book?from=ramallah&to=nablus');
  await page.getByText(c.destinationEstimated, { exact: true }).waitFor();
  // If the quote is road-routed, the fallback warning must disappear as well.
  await page.route(/\/api\/price(?:\?|$)/, async route => {
    const response = await route.fetch();
    const quote = await response.json();
    await route.fulfill({ response, json: { ...quote, estimated: false } });
  }, { times: 1 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText(c.standardParcel, { exact: true }).first().waitFor();
  assert.equal(await page.getByText(c.destinationEstimated, { exact: true }).count(), 0);
  await page.getByRole('textbox', { name: c.pickupNote, exact: true }).fill('Old Ramallah landmark');
  await page.getByRole('button', { name: c.useLocation, exact: true }).click();
  await page.getByText('Tulkarm', { exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: c.pickupNote, exact: true }).inputValue(), '');
  await page.getByText(/approximate accuracy ±53 m/).waitFor();
  assert.equal(await page.evaluate(() => window.locationReview.active.size), 0);
  await page.getByRole('button', { name: /^Request/ }).click({ trial: true });
  await page.locator('.maplibregl-marker').first().waitFor({ timeout: 15000 });
  await page.screenshot({ path: '.expo/location-review/tulkarm-pickup.png', fullPage: true });

  // Opening the pickup map starts GPS only with existing consent; verify the actual map camera.
  await page.goto(base + '/book?from=ramallah&to=nablus');
  await page.getByRole('button', { name: c.pickupOnMap, exact: true }).click();
  await page.waitForFunction(() => {
    const center = window.reviewMaps?.at(-1)?.getCenter();
    return center && Math.abs(center.lat - 32.312773) + Math.abs(center.lng - 35.048039) < 0.000001;
  });
  await page.getByRole('button', { name: c.confirmPin, exact: true }).click({ trial: true });
  const pinQuote = page.waitForRequest(r => new URL(r.url()).pathname === '/api/price' && r.postDataJSON()?.pickupPoint);
  await page.getByRole('button', { name: c.confirmPin, exact: true }).click();
  assert.deepEqual((await pinQuote).postDataJSON().pickupPoint, { latitude: 32.312773, longitude: 35.048039 });

  await page.goto(base + '/book?from=ramallah&to=nablus');
  await page.evaluate(() => { window.locationReview.permission = 'prompt'; });
  await page.getByRole('button', { name: c.pickupOnMap, exact: true }).click();
  await page.getByRole('button', { name: c.useLocation, exact: true }).last().waitFor();
  assert.equal(await page.evaluate(() => window.locationReview.next), 0, 'opening an unconsented map never starts the provider');
  assert.equal(await page.getByRole('button', { name: c.confirmPin, exact: true }).isEnabled(), false);
  await page.getByRole('button', { name: c.useLocation, exact: true }).last().click();
  await page.waitForFunction(() => window.locationReview.next === 1 && window.locationReview.active.size === 0);
  await page.getByRole('button', { name: c.confirmPin, exact: true }).click();

  // A manual drag wins over a pending GPS response, including a provider that calls back after cancellation.
  await page.goto(base + '/book?from=ramallah&to=nablus');
  await page.evaluate(() => { window.locationReview.mode = 'hold'; });
  await page.getByRole('button', { name: c.pickupOnMap, exact: true }).click();
  await page.waitForFunction(() => window.locationReview.active.size === 1 && window.reviewMaps?.at(-1)?.loaded());
  const canvas = page.locator('canvas.maplibregl-canvas').last();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(() => !window.reviewMaps.at(-1).isMoving());
  const manual = await page.evaluate(() => { const p = window.reviewMaps.at(-1).getCenter(); return { latitude: p.lat, longitude: p.lng }; });
  assert.equal(await page.evaluate(() => window.locationReview.active.size), 0);
  await page.evaluate(() => window.locationReview.deliver());
  const manualQuote = page.waitForRequest(r => new URL(r.url()).pathname === '/api/price' && r.postDataJSON()?.pickupPoint);
  await page.getByRole('button', { name: c.confirmPin, exact: true }).click();
  assert.deepEqual((await manualQuote).postDataJSON().pickupPoint, manual, 'late GPS cannot move the confirmed manual pickup');

  await page.goto(base + '/book');
  await page.getByText(c.chooseCity, { exact: true }).first().waitFor();
  await page.evaluate(() => { window.locationReview.mode = 'failure'; });
  await page.getByRole('button', { name: c.useLocation, exact: true }).click();
  await page.getByText(c.locationManual, { exact: true }).waitFor();
  assert.equal(await page.getByText(c.chooseCity, { exact: true }).count(), 2, 'failed GPS never becomes Ramallah/Nablus');
  assert.equal(await page.evaluate(() => window.locationReview.active.size), 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
  assert.deepEqual(errors, []);
  console.log('PASS browser: no default route, saved-place city gate, route required before booking, Tulkarm GPS pickup, old landmark cleared, accuracy shown, collection stopped, provider failure, zero orders, no page errors');
} catch (error) {
  if (reviewPage) {
    await reviewPage.screenshot({ path: '.expo/location-review/failure.png', fullPage: true });
    writeFileSync('.expo/location-review/failure.txt', await reviewPage.locator('body').innerText());
  }
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  db.close();
}
