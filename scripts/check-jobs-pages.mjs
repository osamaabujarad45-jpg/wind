// Browser coverage for the driver job queue against an isolated API and fresh web build.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:4198';
const dir = mkdtempSync(join(tmpdir(), 'wind-jobs-ui-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WEB_ROOT = resolve('.expo/jobs-pages-web');
process.env.WIND_LOCAL_TEST = '1';
process.env.WIND_IDENTITY_MODE = 'self-service';
process.env.WIND_ENABLED_SERVICES = 'parcel';
if (!process.argv.includes('--no-build')) {
  const build = spawnSync(process.execPath, [resolve('node_modules/expo/bin/cli'), 'export', '-p', 'web', '--clear', '--output-dir', process.env.WEB_ROOT], {
    cwd: resolve('.'), encoding: 'utf8', env: { ...process.env, EXPO_PUBLIC_API_URL: base,
      EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH: '1', EXPO_UNSTABLE_TREE_SHAKING: '1' },
  });
  assert.equal(build.status, 0, `Job-page web export failed: ${(build.stderr || build.stdout).slice(-3000)}`);
}
const { db, server, shutdown, promote } = await import('../server/main.ts');
let browser, page;
const errors = [];
async function post(path, body, token) {
  const response = await fetch(`${base}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }) }, body: JSON.stringify(body) });
  const value = await response.json();
  assert.equal(response.status, 200, `${path}: ${JSON.stringify(value)}`);
  return value;
}
try {
  await new Promise((listen, reject) => { server.once('error', reject); server.listen(4198, '127.0.0.1', listen); });
  const password = 'Jobs_Ui_Test_Password_2026';
  await post('/auth/register', { phone: '0599800801', email: 'admin@example.test', name: 'Test admin', password, consent: true });
  await promote('0599800801');
  const admin = await post('/auth/login', { identifier: '0599800801', password });
  const customer = await post('/auth/register', { phone: '0599800802', email: 'customer@example.test', name: 'Test customer', password, consent: true });
  const driver = await post('/auth/register', { phone: '0599800803', email: 'driver@example.test', name: 'Test driver', password, consent: true, role: 'driver', vehicle: 'car' });
  await post(`/admin/users/${driver.user.id}/approve`, {}, admin.token);
  const signedDriver = await post('/auth/login', { identifier: '0599800803', password });
  const insert = db.prepare(`INSERT INTO orders(customer_id,service,shared,pickup_city,dropoff_city,pickup_note,dropoff_note,contact,detail,option,loading_help,price,status,created_at,updated_at)
    VALUES(?,'parcel',0,'ramallah','nablus','Shop','Home','0599800802',?,'small',0,?,'searching',?,?)`);
  const at = Date.now() - 60_000;
  for (let i = 1; i <= 105; i++) insert.run(customer.user.id, `Test parcel ${String(i).padStart(3, '0')}`, i <= 20 ? 20 : i <= 40 ? 40 : 60, at, at);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(token => { localStorage.setItem('token', token); localStorage.setItem('language', 'en'); localStorage.setItem('onboarded', '1'); }, signedDriver.token);
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/driver`, { waitUntil: 'domcontentloaded' });
  // Unassigned drivers cannot see parcel details; the two synthetic price bands are visible on job cards.
  await page.getByText('₪ 17', { exact: true }).first().waitFor({ timeout: 30000 });
  assert.equal(await page.getByText('₪ 34', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Show next jobs', exact: true }).click();
  await page.getByText('₪ 34', { exact: true }).first().waitFor({ timeout: 15000 });
  assert.equal(await page.getByText('₪ 34', { exact: true }).count(), 20);
  assert.equal(await page.getByText('₪ 17', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Show next jobs', exact: true }).click();
  await page.getByText('₪ 51', { exact: true }).first().waitFor({ timeout: 15000 });
  assert.equal(await page.getByText('₪ 51', { exact: true }).count(), 20);
  assert.equal(await page.getByRole('button', { name: 'Show next jobs', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Previous jobs', exact: true }).click();
  await page.getByText('₪ 34', { exact: true }).first().waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Previous jobs', exact: true }).click();
  await page.getByText('₪ 17', { exact: true }).first().waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Show next jobs', exact: true }).click();
  await page.getByText('₪ 34', { exact: true }).first().waitFor({ timeout: 15000 });
  // An old or rolled-back API ignores `page=1` and returns the old array shape.
  const isJobs = url => url.pathname === '/api/jobs';
  await page.route(isJobs, async route => {
    const legacy = await route.fetch({ url: `${base}/api/jobs` });
    await route.fulfill({ response: legacy });
  });
  await page.getByRole('button', { name: 'Show next jobs', exact: true }).click();
  await page.getByText('More jobs may be available. The server needs an update to show them.', { exact: true }).waitFor({ timeout: 15000 });
  assert.equal(await page.getByText('₪ 17', { exact: true }).count(), 0, 'rollback must not relabel page one as a later page');
  await page.unroute(isJobs);
  await page.getByRole('button', { name: 'Previous jobs', exact: true }).click();
  await page.getByText('₪ 34', { exact: true }).first().waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Previous jobs', exact: true }).click();
  await page.getByText('₪ 17', { exact: true }).first().waitFor({ timeout: 15000 });
  await page.route(isJobs, async route => {
    const legacy = await route.fetch({ url: `${base}/api/jobs` });
    await route.fulfill({ response: legacy });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('More jobs may be available. The server needs an update to show them.', { exact: true }).waitFor({ timeout: 15000 });
  assert.equal(await page.getByRole('button', { name: 'Show next jobs', exact: true }).count(), 0, 'old API must not offer a silent repeated page');
  assert.deepEqual(errors, [], 'no unhandled browser errors');
  console.log('Driver UI navigates three pages and reports an old API without repeating a page');
} catch (error) {
  if (page) console.error('Job UI diagnostics:', page.url(), (await page.locator('body').innerText().catch(() => '')).slice(0, 2500), errors);
  throw error;
} finally {
  await browser?.close();
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
