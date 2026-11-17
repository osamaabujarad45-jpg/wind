// Wider UI regression after test:scenarios. Reuses its web export and an isolated API/database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { copy } from '../src/copy.ts';
import { apiCaller } from '../tests/support/api.mjs';

const root = resolve(import.meta.dirname, '..'), base = 'http://localhost:4188';
const output = join(root, '.expo/readiness');
mkdirSync(output, { recursive: true });
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-readiness-')), 'readiness.db');
process.env.WEB_ROOT = join(root, '.expo/location-review-web');
process.env.WIND_LOCAL_TEST = '1';
process.env.WIND_IDENTITY_MODE = 'self-service';
process.env.WIND_ENABLED_SERVICES = 'parcel,ride,freight';
const osrm = createServer((req, res) => {
  const coordinates = decodeURIComponent(new URL(req.url, base).pathname.split('/').pop()).split(';').map(p => p.split(',').map(Number));
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ code: 'Ok', routes: [{ distance: 5000, duration: 600, geometry: { type: 'LineString', coordinates } }] }));
});
await new Promise(r => osrm.listen(0, '127.0.0.1', r));
process.env.OSRM_URL = `http://127.0.0.1:${osrm.address().port}`;
const { server, db, promote, shutdown } = await import('../server/main.ts');
await new Promise(r => server.listen(4188, '127.0.0.1', r));
const call = apiCaller(() => base + '/api');
const browser = await chromium.launch({ headless: true });
const c = copy.en, password = 'Readiness_Local_2026', checks = [], errors = [], pages = [];
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
async function pageFor(token) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce',
    permissions: ['geolocation'], geolocation: { latitude: 31.9038, longitude: 35.2034, accuracy: 10 } });
  await context.addInitScript(token => { localStorage.setItem('language', 'en'); localStorage.setItem('onboarded', '1'); localStorage.setItem('token', token); }, token);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on('pageerror', e => errors.push({ stage, message: e.message }));
  page.on('dialog', dialog => dialog.accept());
  pages.push(page);
  return page;
}
async function register(phone, name, role = 'customer') {
  return call('/auth/register', { body: { phone, name, email: `${phone}@example.test`, password, consent: true, role, ...(role === 'driver' && { vehicle: 'van' }) } });
}
async function form(page, service = 'parcel') {
  await page.goto(`${base}/book?from=ramallah&to=nablus&service=${service}`);
  await field(page, c.pickupNote).fill('Readiness pickup shop');
  await field(page, c.dropoffNote).fill('Readiness destination office');
  await field(page, c[`${service}Detail`]).fill('Sealed test box');
}
async function submit(page) {
  await button(page, new RegExp(`^${c.request}`)).click();
  await page.waitForURL(/\/order\/\d+$/);
  return Number(new URL(page.url()).pathname.split('/').pop());
}
async function state(id, status) {
  return until(() => db.prepare('SELECT * FROM orders WHERE id=?').get(id), o => o.status === status, `Order ${id} did not reach ${status}`);
}
try {
  await register('0599000811', 'Readiness Admin');
  await promote('0599000811');
  const admin = await call('/auth/login', { body: { identifier: '0599000811', password } });
  const customer = await register('0599000812', 'Readiness Customer');
  const pending = await register('0599000813', 'Readiness Driver', 'driver');
  await call(`/admin/users/${pending.user.id}/approve`, { token: admin.token, body: {} });
  const driver = await call('/auth/login', { body: { identifier: '0599000813', password } });
  const adminPage = await pageFor(admin.token), customerPage = await pageFor(customer.token), driverPage = await pageFor(driver.token);

  stage = 'profile';
  await customerPage.goto(base + '/profile');
  await field(customerPage, c.name).fill('Readiness Edited');
  await button(customerPage, c.save).click();
  await customerPage.getByText(c.nameSaved, { exact: true }).waitFor();
  const editedProfile = (await call('/me', { token: customer.token })).user;
  assert.equal(editedProfile.name, 'Readiness Edited');
  assert.equal(editedProfile.phone, customer.user.phone);
  pass('customer profile edits persist and read-only account phone remains unchanged');

  stage = 'settings and promo creation';
  await adminPage.goto(base + '/admin/settings');
  await field(adminPage, `${c.set_parcelPrice} ₪`).fill('24');
  await button(adminPage, c.save).click();
  await adminPage.getByText(c.saved, { exact: true }).waitFor();
  assert.equal((await call('/me', { token: customer.token })).settings.parcelPrice, 24);
  await field(adminPage, c.promoCode).fill('READINESS5');
  await field(adminPage, c.promoAmount).fill('5');
  await button(adminPage, c.promoCreate).click();
  await adminPage.getByText(c.promoCreated, { exact: true }).waitFor();
  assert.ok((await call('/admin/promos', { token: admin.token })).some(p => p.code === 'READINESS5' && p.amount === 5));
  pass('admin tariff update and promo creation persist through the real API');

  stage = 'saved places and promo redemption';
  await form(customerPage);
  await button(customerPage, c.savePlace).first().click();
  await button(customerPage, `${c.savePlace}: ${c.place_home}`).click();
  await until(() => call('/me/places', { token: customer.token }), p => p.saved.some(x => x.label === 'home' && x.note === 'Readiness pickup shop'), 'Saved home missing');
  await button(customerPage, c.promoAdd).click();
  await field(customerPage, c.promoCode).fill('READINESS5');
  await button(customerPage, c.promoApply).click();
  await button(customerPage, c.promoRemove).waitFor();
  const promoId = await submit(customerPage);
  const promoOrder = await call(`/orders/${promoId}`, { token: customer.token });
  assert.equal(promoOrder.price, 24);
  assert.equal(promoOrder.discount, 5);
  await button(customerPage, c.cancelOrder).click();
  await state(promoId, 'cancelled');
  await customerPage.goto(base + '/book?pick=to');
  await button(customerPage, `${c.place_home}, Ramallah, Readiness pickup shop`).click();
  assert.equal(await field(customerPage, c.dropoffNote).inputValue(), 'Readiness pickup shop');
  pass('save a Home landmark, reuse it in city picker, apply promo and preserve server fare/discount');

  stage = 'road reports';
  await adminPage.goto(base + '/roads');
  await field(adminPage, c.roadName).fill('Readiness checkpoint');
  await adminPage.getByRole('checkbox', { name: 'Ramallah', exact: true }).click();
  await button(adminPage, c.roadAdd).click();
  await adminPage.getByText('Readiness checkpoint', { exact: true }).waitFor();
  await driverPage.goto(base + '/roads');
  await button(driverPage, c.roadReportLabel.replace('{name}', 'Readiness checkpoint').replace('{s}', c.road_slow)).click();
  await until(() => call('/roads', { token: customer.token }), roads => roads.some(r => r.name === 'Readiness checkpoint' && r.status === 'slow'), 'Driver report missing');
  await customerPage.goto(base + '/roads');
  await customerPage.getByText(c.road_slow, { exact: true }).waitFor();
  assert.equal(await button(customerPage, new RegExp(c.roadReportAs.split('{s}')[0])).count(), 0);
  pass('admin adds checkpoint, driver reports slow traffic, customer reads without report permission');

  stage = 'freight offer and destination filter';
  await form(customerPage, 'freight');
  await customerPage.getByRole('radio', { name: c.yes, exact: true }).click();
  const freightId = await submit(customerPage);
  await driverPage.goto(base + '/driver');
  await driverPage.getByRole('radio', { name: 'Hebron', exact: true }).click();
  await until(() => call('/me', { token: driver.token }), me => me.user.heading?.city === 'hebron', 'Destination filter missing');
  await driverPage.getByText(c.noJobs, { exact: true }).waitFor();
  await driverPage.getByRole('radio', { name: 'Nablus', exact: true }).click();
  await button(driverPage, c.offerPrice).click();
  const offerInput = driverPage.getByRole('textbox').last();
  const offered = Number(await offerInput.inputValue());
  await button(driverPage, new RegExp(`^${c.sendOffer.split('{p}')[0]}`)).click();
  await until(() => call(`/orders/${freightId}`, { token: customer.token }), o => o.offers?.length === 1, 'Driver offer missing');
  await customerPage.reload();
  await button(customerPage, c.acceptOffer).click();
  await state(freightId, 'assigned');
  const freight = await call(`/orders/${freightId}`, { token: customer.token });
  assert.equal(freight.price, offered);
  assert.equal(freight.loadingHelp, true);
  pass('freight with loading help, driver destination filter, counter-offer and customer selection');

  stage = 'safety';
  await button(customerPage, c.safety).click();
  await field(customerPage, c.problemNote).fill('Synthetic readiness safety report');
  await button(customerPage, c.safetySend).click();
  await customerPage.getByText(c.safetyReported, { exact: true }).waitFor();
  assert.equal((await call(`/orders/${freightId}`, { token: driver.token })).safetyHold, true);
  // The Orders tab may already be mounted when a dashboard alert opens it.
  await adminPage.goto(base + '/admin/orders');
  await adminPage.getByRole('tab', { name: c.dashboard, exact: true }).click();
  await button(adminPage, `${c.safetyIncidents}: 1`).click();
  await field(adminPage, c.resolution).fill('Synthetic review complete; both parties safe');
  await button(adminPage, c.resolveDispute).click();
  await until(() => call(`/orders/${freightId}`, { token: customer.token }), o => !o.safetyHold, 'Safety hold did not clear');
  await customerPage.reload();
  await button(customerPage, c.cancelOrder).click();
  await state(freightId, 'cancelled');
  pass('customer safety report holds the job; admin resolution restores actions');

  stage = 'delivery dispute and credit';
  await form(customerPage);
  const deliveryId = await submit(customerPage);
  let delivered = await call(`/jobs/${deliveryId}/accept`, { token: driver.token, body: {} });
  for (let i = 0; i < 3; i++) delivered = await call(`/orders/${deliveryId}/advance`, { token: driver.token,
    body: { requestId: randomUUID(), expectedStatus: delivered.status, ...(i === 2 && { code: (await call(`/orders/${deliveryId}`, { token: customer.token })).handoverCode }) } });
  await customerPage.reload();
  await field(customerPage, c.disputeReason).fill('Synthetic readiness issue with delivery');
  await button(customerPage, c.disputeSend).click();
  await customerPage.getByText(c.disputeOpen, { exact: true }).waitFor();
  await adminPage.goto(base + '/admin/orders');
  await adminPage.getByRole('radio', { name: c.disputes, exact: true }).click();
  await field(adminPage, c.resolution).fill('Reviewed and issued goodwill credit');
  await field(adminPage, c.creditField).fill('7');
  await button(adminPage, new RegExp(`^${c.resolveDispute}`)).click();
  const resolved = await until(() => call(`/orders/${deliveryId}`, { token: customer.token }), o => o.dispute?.status === 'resolved', 'Dispute did not resolve');
  assert.equal(resolved.dispute.credit.amount, 7);
  await customerPage.reload();
  await customerPage.getByText(c.disputeResolved, { exact: true }).waitFor();
  await customerPage.screenshot({ path: join(output, 'resolved-dispute.png'), fullPage: true });
  pass('customer opens finished-order dispute; admin resolves with seven-shekel future credit');

  stage = 'admin account management';
  const spare = await register('0599000814', 'Readiness Spare');
  await adminPage.goto(base + '/admin/users');
  await field(adminPage, c.search).fill('Readiness Spare');
  await button(adminPage, c.editUser).click();
  await field(adminPage, c.name).fill('Readiness Managed');
  await button(adminPage, c.save).click();
  await until(() => call(`/admin/users?q=Readiness%20Managed`, { token: admin.token }), users => users.some(u => u.id === spare.user.id), 'Admin edit missing');
  await field(adminPage, c.search).fill('Readiness Managed');
  await button(adminPage, c.block).click();
  await button(adminPage, c.unblock).waitFor();
  assert.equal((await call('/auth/login', { body: { identifier: spare.user.phone, password }, expect: 403 })).error, 'blocked');
  await button(adminPage, c.unblock).click();
  await button(adminPage, c.block).waitFor();
  await button(adminPage, c.editUser).click();
  const resetResponse = adminPage.waitForResponse(r => r.url().endsWith(`/admin/users/${spare.user.id}/password`) && r.request().method() === 'POST');
  await button(adminPage, c.resetPassword).click();
  const reset = await (await resetResponse).json();
  assert.ok(reset.password.length >= 12);
  const resetLogin = await call('/auth/login', { body: { identifier: spare.user.phone, password: reset.password } });
  assert.equal(resetLogin.user.name, 'Readiness Managed');
  await call('/auth/login', { body: { identifier: spare.user.phone, password }, expect: 401 });
  await button(adminPage, c.deleteAccount).click();
  await until(() => call(`/admin/users?q=Readiness%20Managed`, { token: admin.token }), users => users.length === 0, 'Admin deletion missing');
  pass('administrator edits, blocks/unblocks, resets password and deletes an isolated customer account');

  stage = 'self-service password and deletion';
  const lifecycle = await register('0599000815', 'Readiness Lifecycle');
  const accountPage = await pageFor(lifecycle.token);
  await accountPage.goto(base + '/account');
  await button(accountPage, c.changePassword).click();
  await field(accountPage, c.currentPassword).fill(password);
  const newPassword = 'Changed_Readiness_2026';
  await field(accountPage, c.newPassword).fill(newPassword);
  await button(accountPage, c.save).click();
  await accountPage.getByText(c.passwordChanged, { exact: true }).waitFor();
  assert.equal((await call('/auth/login', { body: { identifier: lifecycle.user.phone, password: newPassword } })).user.id, lifecycle.user.id);
  await call('/auth/login', { body: { identifier: lifecycle.user.phone, password }, expect: 401 });
  await button(accountPage, c.deleteAccount).click();
  await field(accountPage, c.currentPassword).fill(newPassword);
  await button(accountPage, c.deleteAccount).click();
  await accountPage.waitForURL(/\/auth$/);
  // Accounting foreign keys retain an anonymized row; personal identity and every session must be gone.
  const deleted = db.prepare('SELECT name,phone,email,password,status FROM users WHERE id=?').get(lifecycle.user.id);
  assert.deepEqual({ ...deleted }, { name: '—', phone: `deleted-${lifecycle.user.id}`, email: null, password: '', status: 'blocked' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(lifecycle.user.id).n, 0);
  pass('customer changes password, rejects old password and deletes their own inactive test account');
  assert.deepEqual(errors, [], 'Unhandled browser errors');
} catch (error) {
  for (const [i, page] of pages.entries()) {
    await page.screenshot({ path: join(output, `failure-${i}.png`), fullPage: true }).catch(() => {});
    writeFileSync(join(output, `failure-${i}.txt`), await page.locator('body').ariaSnapshot().catch(() => 'Unavailable'));
  }
  console.error(`FAILED at ${stage}`);
  throw error;
} finally {
  writeFileSync(join(output, 'results.json'), JSON.stringify({ checks, errors, stage }, null, 2));
  await browser.close();
  await shutdown();
  await new Promise(r => osrm.close(r));
}
