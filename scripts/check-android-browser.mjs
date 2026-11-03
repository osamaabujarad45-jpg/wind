// Uses an already attached Android Chrome without clearing its profile or other tabs.
// adb reverse tcp:4188 tcp:4188
// adb forward tcp:9228 localabstract:chrome_devtools_remote
// Run after npm run test:scenarios (reuses its local web export).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { copy } from '../src/copy.ts';
const base = 'http://localhost:4188', output = resolve('.expo/scenarios');
mkdirSync(output, { recursive: true });
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-phone-')), 'phone.db');
process.env.WEB_ROOT = resolve('.expo/location-review-web');
process.env.WIND_LOCAL_TEST = '1';
process.env.WIND_IDENTITY_MODE = 'self-service';
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { server, shutdown } = await import('../server/main.ts');
await new Promise(r => server.listen(4188, '127.0.0.1', r));
let browser, page;
const errors = [], mapFailures = [], checks = [];
try {
  // A CDP-created background tab may not render while Android has another app
  // foregrounded. Open our own URL through the OS, then attach to that exact tab.
  const target = base + `/auth?phoneCheck=${Date.now()}`;
  const launch = spawnSync('adb', ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', target, '-p', 'com.android.chrome'], { encoding: 'utf8' });
  assert.equal(launch.status, 0, launch.stderr);
  console.log('Opened local test tab on Android');
  // adb can accept the forward before Chrome has created its debugging socket.
  // Wait for an actual version reply so a cold Chrome start does not fail with socket hang up.
  const cdp = 'http://127.0.0.1:9228';
  const cdpDeadline = Date.now() + 15_000;
  let cdpReady = false;
  while (Date.now() < cdpDeadline) {
    try {
      const response = await fetch(`${cdp}/json/version`, { signal: AbortSignal.timeout(Math.min(1000, Math.max(1, cdpDeadline - Date.now()))) });
      if (response.ok && typeof (await response.json()).webSocketDebuggerUrl === 'string') { cdpReady = true; break; }
    } catch { /* Chrome's socket is still starting; retry within the bounded deadline. */ }
    await new Promise(r => setTimeout(r, 200));
  }
  assert.ok(cdpReady, 'Android Chrome debugging endpoint did not become ready within 15 seconds; check the adb forward');
  browser = await chromium.connectOverCDP(cdp, { timeout: 30_000 });
  page = browser.contexts()[0].pages().find(p => p.url() === target);
  assert.ok(page, 'Android did not open the local test tab');
  page.setDefaultTimeout(30_000);
  await page.bringToFront();
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => {
    const message = request.failure()?.errorText ?? '';
    if (request.url().startsWith('https://tiles.openfreemap.org/') && !message.includes('ABORTED')) mapFailures.push(message);
  });
  page.on('response', response => {
    if (response.url().startsWith('https://tiles.openfreemap.org/') && response.status() >= 400) mapFailures.push(`HTTP ${response.status()}`);
  });
  await page.waitForLoadState('domcontentloaded');
  console.log('Connected to Android page');
  await page.evaluate(() => { localStorage.setItem('language', 'en'); localStorage.setItem('onboarded', '1'); localStorage.removeItem('token'); });
  await page.reload();
  const c = copy.en;
  await page.getByRole('radio', { name: c.signUp, exact: true }).click();
  for (const [label, value] of [[c.name, 'QA Android'], [c.email, 'android@example.test'], [c.phone, '0599000781'], [c.password, 'Android_Local_2026']])
    await page.getByLabel(label, { exact: true }).fill(value);
  // Dismiss the soft keyboard first: while it is open the layout shifts and the tap lands on a field instead.
  await page.evaluate(() => document.activeElement?.blur());
  await page.getByRole('checkbox', { name: c.consent }).click();
  await page.getByRole('button', { name: c.createAccount, exact: true }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/auth'));
  checks.push('customer signup on physical Android Chrome');
  await page.goto(base + '/book?from=ramallah&to=nablus');
  await page.getByRole('button', { name: new RegExp(`^${c.pickup}: `) }).click();
  await page.getByRole('button', { name: c.setOnMap, exact: true }).click();
  await page.getByRole('button', { name: c.confirmPickupSpot, exact: true }).click();
  await page.frameLocator('iframe[title="map"]').last().locator('.maplibregl-marker').first().waitFor();
  await page.screenshot({ path: join(output, 'a53-booking-map.png') });
  checks.push('physical GPU renders web map and exact pickup picker');
  for (const [label, value] of [[c.pickupNote, 'Phone test pickup'], [c.dropoffNote, 'Phone test destination'], [c.parcelDetail, 'Documents']])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: /^Request/ }).click();
  await page.waitForURL(/\/order\/\d+$/);
  await page.getByText(c.findingTitle, { exact: true }).waitFor();
  await page.screenshot({ path: join(output, 'a53-booked.png') });
  checks.push('customer booking reaches searching on physical Android');
  const pickup = { latitude: 31.9038, longitude: 35.2034 }, dropoff = { latitude: 32.2211, longitude: 35.2544 };
  await page.addInitScript(() => {
    window.mapMessages = [];
    window.ReactNativeWebView = { postMessage: json => window.mapMessages.push(JSON.parse(json)) };
  });
  await page.goto(`${base}/map.html#${encodeURIComponent(JSON.stringify({ mode: 'route', language: 'ar', pickup, dropoff, padding: 40, recenter: copy.ar.recenter }))}`);
  await page.waitForFunction(() => window.mapMessages.some(m => m.type === 'ready'));
  await page.locator('.maplibregl-marker').nth(1).waitFor();
  await page.evaluate(() => window.wind({ driver: { latitude: 31.9145, longitude: 35.2044, heading: 90, accuracy: 15 }, focus: 'pickup' }));
  await page.locator('.maplibregl-marker').nth(2).waitFor();
  // Camera/marker animations last up to 1.2 seconds. The network can be briefly
  // idle before the camera finishes and requests the destination zoom's tiles.
  await page.waitForTimeout(1400);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: join(output, 'a53-android-map.png') });
  checks.push('Android map HTML renders Arabic tiles and live marker on physical GPU');
  // A real two-finger pinch on the touchscreen path stops the follow camera and offers Recenter (no drag involved).
  assert.equal(await page.locator('#recenter').isVisible(), false, 'the follow camera starts engaged');
  const touch = await page.context().newCDPSession(page);
  const box = await page.locator('#map').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const fingers = spread => [{ x: cx - spread, y: cy, id: 1 }, { x: cx + spread, y: cy, id: 2 }];
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(20) });
  for (let spread = 30; spread <= 110; spread += 20) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(spread) });
    await page.waitForTimeout(30);
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.locator('#recenter').waitFor({ state: 'visible', timeout: 5000 });
  checks.push('pinch on the physical touchscreen stops follow and shows Recenter');
  assert.deepEqual(errors, []);
  assert.deepEqual(mapFailures, []);
  console.log(checks.map(check => `PASS ${check}`).join('\n'));
} catch (error) {
  if (page) {
    await page.screenshot({ path: join(output, 'a53-failure.png') }).catch(() => {});
    writeFileSync(join(output, 'a53-failure.txt'), await page.locator('body').ariaSnapshot().catch(() => 'Unavailable'));
  }
  throw error;
} finally {
  writeFileSync(join(output, 'a53-results.json'), JSON.stringify({ checks, errors, mapFailures }, null, 2));
  await page?.close();
  await browser?.close();
  await shutdown();
}
