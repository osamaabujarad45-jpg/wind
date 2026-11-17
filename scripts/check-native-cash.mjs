// Native SM-A5360 cash handover: admin records, driver confirms, API reconciles.
// Synthetic loopback sandbox only; never prints or writes bearer tokens/passwords to evidence.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adb, open, snapshot, tap, fill, scrollDown, apiCall, pause } from './check-phone-tests.mjs';
import { copy } from '../src/copy.ts';

const port = Number(process.env.WIND_PHONE_TEST_PORT ?? 4191);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid sandbox port');
const sandboxName = port === 4191 ? 'phone-qa' : `phone-qa-${port}`;
const provision = JSON.parse(readFileSync(resolve('.expo', sandboxName, 'provision.json'), 'utf8'));
assert.equal(provision.apiUrl, `http://127.0.0.1:${port}`, 'APK and API must use the same sandbox');
const output = resolve('.expo', sandboxName, 'device', 'cash-results.json');
const c = copy.ar;
const call = (path, role) => apiCall(provision, path, role);
const until = async (read, predicate, label) => {
  for (let attempt = 0; attempt < 30; attempt++) {
    const value = await read();
    if (predicate(value)) return value;
    await pause(500);
  }
  throw new Error(`Timed out: ${label}`);
};
const tapText = (ui, text) => {
  const matches = ui.filter(node => (node.text === text || node['content-desc'] === text) && node.enabled !== 'false');
  assert.ok(matches.length, `Missing native control ${text}; visible: ${ui.map(n => n.text || n['content-desc']).filter(Boolean).join(' | ')}`);
  tap(matches[0]);
};
const fillBlankField = (ui, label, value) => {
  const field = ui.find(node => node.className === 'android.widget.EditText' && (node.text === label || node['content-desc'] === label || node.text === value || !node.text));
  assert.ok(field, `Missing blank field ${label}`);
  fill(field, value);
};

const before = await call('/driver/cash', 'driver');
assert.ok(before.owedCents > 0, 'Seeded completed parcel must create a synthetic cash obligation');
let entry = before.entries.find(item => item.status === 'pending' && item.amountCents === before.owedCents && item.note === 'QA-native-handover');
assert.ok(before.pendingCents === 0 || entry, 'Start with no pending handover or the same resumable QA handover');
adb('reverse', `tcp:${port}`, `tcp:${port}`);
let recorded = before;
if (!entry) {
  open('admin', 'admin/cash');
  await pause(4000);
  const adminBefore = await snapshot('cash-admin-before', 'ps.wind.app.testadmin');
  tapText(adminBefore, c.cashRecord);
  await pause(600);
  const form = await snapshot('cash-admin-form', 'ps.wind.app.testadmin');
  fillBlankField(form, c.problemNote, 'QA-native-handover');
  tapText(form, c.cashRecord);
  recorded = await until(() => call('/driver/cash', 'driver'), cash => cash.pendingCents === before.owedCents, 'admin handover visible to driver');
  entry = recorded.entries.find(item => item.status === 'pending' && item.amountCents === before.owedCents);
} else {
  open('admin', 'admin/cash');
  await pause(2500);
}
assert.ok(entry, 'Pending entry uses integer cents');
await snapshot('cash-admin-recorded', 'ps.wind.app.testadmin');

open('driver', 'driver/earnings');
await pause(4000);
scrollDown();
await pause(800);
const driverBefore = await snapshot('cash-driver-before', 'ps.wind.app.testdriver');
tapText(driverBefore, c.cashConfirm);
const settled = await until(() => call('/driver/cash', 'driver'), cash => cash.owedCents === 0 && cash.pendingCents === 0, 'driver-confirmed zero balance');
assert.ok(settled.entries.some(item => item.id === entry.id && item.status === 'confirmed'), 'The same entry is confirmed');
await pause(800);
await snapshot('cash-driver-confirmed', 'ps.wind.app.testdriver');
const admin = await call('/admin/cash', 'admin');
assert.equal(admin.find(row => row.driverId === provision.roles.driver.userId)?.owedCents, 0, 'Admin and driver see the same zero balance');
const result = { at: new Date().toISOString(), port, driverId: provision.roles.driver.userId,
  beforeCents: before.owedCents, pendingAfterAdminCents: recorded.pendingCents,
  afterCents: settled.owedCents, entryId: entry.id, entryStatus: 'confirmed',
  screenshots: ['cash-admin-before', 'cash-admin-form', 'cash-admin-recorded', 'cash-driver-before', 'cash-driver-confirmed'] };
writeFileSync(output, JSON.stringify(result, null, 2));
console.log(`Native cash handover passed: admin recorded ${before.owedCents} cents, driver confirmed entry ${entry.id}, reconciled balance 0. Evidence: ${output}`);
