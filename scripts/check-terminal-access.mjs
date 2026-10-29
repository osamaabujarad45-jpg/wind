// Focused browser regression against an isolated local database and the scenario web export.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:4196';
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-access-')), 'access.db');
process.env.WEB_ROOT = resolve('.expo/access-regression-web');
process.env.WIND_LOCAL_TEST = '1';
process.env.WIND_IDENTITY_MODE = 'self-service';
process.env.WIND_ENABLED_SERVICES = 'parcel';
if (!process.argv.includes('--no-build')) {
  const build = spawnSync(process.execPath, [resolve('node_modules/expo/bin/cli'), 'export', '-p', 'web', '--clear', '--output-dir', process.env.WEB_ROOT], {
    cwd: resolve('.'), encoding: 'utf8', env: { ...process.env, EXPO_PUBLIC_API_URL: base,
      EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH: '1', EXPO_UNSTABLE_TREE_SHAKING: '1' },
  });
  assert.equal(build.status, 0, `Access regression web export failed: ${(build.stderr || build.stdout).slice(-3000)}`);
}
const { server, shutdown, promote, liveWatcherCount } = await import('../server/main.ts');
let browser;
const call = async (path, body, token) => {
  const response = await fetch(`${base}/api${path}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: JSON.stringify(body) });
  const data = await response.json();
  assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
};
try {
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(4196, '127.0.0.1', resolveListen); });
  const password = 'Access_Test_Password_2026';
  await call('/auth/register', { phone: '0599800701', email: 'admin@example.test', name: 'Test admin', password, consent: true });
  await promote('0599800701');
  const admin = await call('/auth/login', { identifier: '0599800701', password });
  const customer = await call('/auth/register', { phone: '0599800702', email: 'customer@example.test', name: 'Test customer', password, consent: true });
  const driver = await call('/auth/register', { phone: '0599800703', email: 'driver@example.test', name: 'Test driver', password, consent: true, role: 'driver', vehicle: 'car' });
  await call(`/admin/users/${driver.user.id}/approve`, {}, admin.token);
  const signedDriver = await call('/auth/login', { identifier: '0599800703', password });
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small',
    detail: 'Synthetic box', contact: '0599800702', pickupNote: 'Synthetic pickup', dropoffNote: 'Synthetic dropoff' };
  const quote = await call('/price', input, customer.token);
  const order = await call('/orders', { ...input, quotedPrice: quote.price }, customer.token);
  await call(`/jobs/${order.id}/accept`, {}, signedDriver.token);
  await call('/location', { latitude: 31.9038, longitude: 35.2034, accuracy: 10 }, signedDriver.token);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(token => { localStorage.setItem('token', token); localStorage.setItem('language', 'en'); localStorage.setItem('onboarded', '1'); }, customer.token);
  const page = await context.newPage();
  await page.goto(`${base}/order/${order.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Test driver', { exact: true }).waitFor({ timeout: 30000 });
  // A temporary failure keeps the last snapshot, but a definitive access refusal must remove it.
  let attempts = 0;
  await page.route(`**/api/orders/${order.id}`, route => {
    attempts++;
    return route.fulfill(attempts === 1 ? { status: 503, json: { error: 'server_error' } } : { status: 403, json: { error: 'forbidden' } });
  });
  await page.waitForResponse(response => response.url().endsWith(`/api/orders/${order.id}`) && response.status() === 503, { timeout: 20000 });
  assert.equal(await page.getByText('Test driver', { exact: true }).count(), 1, 'Transient failures should retain the snapshot');
  await page.waitForResponse(response => response.url().endsWith(`/api/orders/${order.id}`) && response.status() === 403, { timeout: 25000 });
  await page.getByText('You can’t do that.', { exact: true }).waitFor({ timeout: 5000 });
  assert.equal(await page.getByText('Test driver', { exact: true }).count(), 0, 'Revoked order data must disappear');
  assert.equal(await page.locator('.driver-marker').count(), 0, 'Revoked driver location must disappear');
  const deadline = Date.now() + 5000;
  while (liveWatcherCount(order.id) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(liveWatcherCount(order.id), 0, 'Revoked order must release its live tracking watcher');
  console.log('Terminal order access clears the driver and location; a transient failure keeps them');
} finally {
  await browser?.close();
  await shutdown();
}
