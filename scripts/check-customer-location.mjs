// Customer pickup location in a real browser with a scripted GPS: consent rules, accuracy rules, what wins when GPS and the
// customer disagree.
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
process.env.WIND_ENABLED_SERVICES = 'parcel,ride,freight';
delete process.env.OSRM_URL; // exercise the truthful fallback when road routing is unavailable
const { server, db } = await import('../server/main.ts');
const { copy } = await import('../src/copy.ts');
const c = copy.en;
await new Promise(resolve => server.listen(4188, '127.0.0.1', resolve));
const base = 'http://localhost:4188';
const registration = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '0599000321', name: 'Location Review', email: 'location@example.test', consent: true, password: 'Location_Review_2026' }) });
const session = await registration.json();
const browser = await chromium.launch({ headless: true });
const errors = [];
let reviewPage;
mkdirSync('.expo/location-review', { recursive: true });
const tulkarm = { latitude: 32.312773, longitude: 35.048039 };
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['geolocation'], reducedMotion: 'reduce' });
  await context.addInitScript(({ token, at }) => {
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
        else success({ timestamp: Date.now(), coords: { ...at, accuracy: 52.4, altitude: null, altitudeAccuracy: null, heading: null, speed: null } });
      };
      if (window.locationReview.mode === 'hold') window.locationReview.deliver = deliver;
      else setTimeout(deliver, 30);
      return id;
    };
    navigator.geolocation.clearWatch = id => window.locationReview.active.delete(id);
  }, { token: session.token, at: tulkarm });
  const page = await context.newPage();
  reviewPage = page;
  page.on('pageerror', e => errors.push(e.message));
  const map = () => page.frames().find(f => f.url().includes('/map.html'));
  const camera = () => map()?.evaluate(() => { const p = window.windMap?.getCenter(); return p && { latitude: p.lat, longitude: p.lng }; });
  const pickupRow = () => page.getByRole('button', { name: new RegExp(`^${c.pickup}: `) });

  // With consent already given, opening the screen makes where you stand the pickup, without being asked.
  await page.goto(base + '/book');
  await page.getByPlaceholder(c.pickupHere).waitFor();
  assert.equal(await page.evaluate(() => window.locationReview.active.size), 0, 'collection stops at the first usable fix');
  await page.screenshot({ path: '.expo/location-review/gps-pickup.png' });

  // A destination then goes straight to the trip, with no default route anywhere before it.
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
  await page.getByPlaceholder(c.whereTo).fill('Nablus');
  await page.getByRole('button', { name: /^Nablus/ }).first().click();
  const requestButton = page.getByRole('button', { name: /^Request/ });
  await requestButton.waitFor();
  await page.screenshot({ path: '.expo/location-review/trip.png' });

  // An explicit choice of pickup is never moved by a later GPS fix.
  await page.goto(base + '/book?from=ramallah&to=nablus');
  await page.waitForTimeout(500);
  await pickupRow().click();
  await page.getByPlaceholder(/./).first().waitFor();
  await page.getByRole('button', { name: c.setOnMap, exact: true }).click();
  const confirmPickup = page.getByRole('button', { name: c.confirmPickupSpot, exact: true });
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => f.contentWindow?.windMap?.loaded?.()));
  const pinQuote = page.waitForRequest(r => new URL(r.url()).pathname === '/api/price' && r.postDataJSON()?.pickupPoint);
  await assertEnabledThenClick(confirmPickup);
  assert.ok((await pinQuote).postDataJSON().pickupPoint, 'a confirmed spot becomes the exact pickup');

  // Opening a map without consent never starts the provider; Locate is what asks.
  await page.goto(base + '/book?from=ramallah&to=nablus');
  await page.evaluate(() => { window.locationReview.permission = 'prompt'; });
  await page.reload();
  await page.evaluate(() => { window.locationReview.permission = 'prompt'; window.locationReview.next = 0; });
  await pickupRow().click();
  await page.getByRole('button', { name: c.setOnMap, exact: true }).click();
  await page.getByRole('button', { name: c.useLocation, exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.locationReview.next), 0, 'opening an unconsented map never starts the provider');
  await page.getByRole('button', { name: c.useLocation, exact: true }).click();
  await page.waitForFunction(() => window.locationReview.next === 1 && window.locationReview.active.size === 0);
  await page.waitForFunction(({ latitude, longitude }) => {
    const p = [...document.querySelectorAll('iframe')].map(f => f.contentWindow?.windMap?.getCenter?.()).find(Boolean);
    return p && Math.abs(p.lat - latitude) + Math.abs(p.lng - longitude) < 0.000001;
  }, tulkarm);
  const fixQuote = page.waitForRequest(r => new URL(r.url()).pathname === '/api/price' && r.postDataJSON()?.pickupPoint);
  await assertEnabledThenClick(page.getByRole('button', { name: c.confirmPickupSpot, exact: true }));
  const point = (await fixQuote).postDataJSON().pickupPoint;
  assert.ok(Math.abs(point.latitude - tulkarm.latitude) + Math.abs(point.longitude - tulkarm.longitude) < 0.00001, 'the visible camera agrees with the fix that gets booked');

  // A manual drag wins over a pending GPS response, including a provider that calls back after cancellation.
  await page.goto(base + '/book?from=ramallah&to=nablus');
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.locationReview.mode = 'hold'; window.locationReview.permission = 'granted'; });
  await pickupRow().click();
  await page.getByRole('button', { name: c.setOnMap, exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => f.contentWindow?.windMap?.loaded?.()));
  await page.getByRole('button', { name: c.useLocation, exact: true }).click();
  const box = await page.locator('iframe[title="map"]').last().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 280);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + 300, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(() => { const m = [...document.querySelectorAll('iframe')].map(f => f.contentWindow?.windMap).find(Boolean); return m && !m.isMoving(); });
  const manual = await camera();
  await page.evaluate(() => window.locationReview.deliver?.());
  await page.waitForTimeout(400);
  const afterLateFix = await camera();
  assert.ok(Math.abs(manual.latitude - afterLateFix.latitude) + Math.abs(manual.longitude - afterLateFix.longitude) < 0.0005, 'late GPS cannot move the pin after a manual drag');

  // A failed fix explains itself and never becomes a made-up place.
  await page.goto(base + '/book');
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.locationReview.mode = 'failure'; });
  await page.getByPlaceholder(/./).first().click();
  await page.getByRole('button', { name: c.useLocation, exact: true }).click();
  await page.getByText(c.locationManual, { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.locationReview.active.size), 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
  assert.deepEqual(errors, []);
  console.log('PASS browser: GPS default pickup, no default route, explicit pickup stays, consent only on Locate, drag beats late GPS, failure explained');
} catch (error) {
  if (reviewPage) {
    await reviewPage.screenshot({ path: '.expo/location-review/failure.png' });
    writeFileSync('.expo/location-review/failure.txt', await reviewPage.locator('body').innerText());
  }
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  db.close();
}

async function assertEnabledThenClick(locator) {
  for (let i = 0; i < 100 && !(await locator.isEnabled()); i++) await new Promise(resolve => setTimeout(resolve, 150));
  await locator.click();
}
