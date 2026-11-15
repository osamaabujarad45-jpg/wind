// Physical admin navigation: five visible tabs, with Settings → Account → Back preserved.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { open, snapshot, tap, pause } from './check-phone-tests.mjs';
import { copy } from '../src/copy.ts';

assert.ok(process.env.WIND_AGENT_DEVICE, 'Physical admin navigation requires agent-device transport');
const c = copy.ar;
const output = resolve('.expo', 'phone-qa-4192', 'device', 'admin-tabs-results.json');
const textOf = node => [node.text, node['content-desc']].filter(Boolean);
const hasText = (ui, value) => ui.some(node => textOf(node).some(text => text.includes(value)));
const tapExact = (ui, value) => {
  const node = ui.find(item => textOf(item).includes(value) && item.enabled !== 'false');
  assert.ok(node, `Missing control ${value}; visible: ${ui.flatMap(textOf).join(' | ')}`);
  tap(node);
};

open('admin', 'admin');
await pause(4000);
const home = await snapshot('admin-five-tabs', 'ps.wind.app.testadmin');
const expectedTabs = [c.dashboard, c.allOrders, c.users, c.subscriptions, c.settings];
for (const label of expectedTabs) assert.ok(hasText(home, label), `Missing translated tab ${label}`);
for (const hidden of [c.cashTab, c.account, 'account']) {
  assert.ok(!hasText(home, hidden), `Unexpected visible tab ${hidden}`);
}

open('admin', 'admin/settings');
await pause(2500);
const settings = await snapshot('admin-settings-route', 'ps.wind.app.testadmin');
assert.ok(hasText(settings, c.settings), 'Settings route is visible');
tapExact(settings, c.account);
await pause(2500);
const account = await snapshot('admin-account-route', 'ps.wind.app.testadmin');
assert.ok(hasText(account, c.account), 'Direct account route is visible');
tapExact(account, c.back);
await pause(2500);
const returned = await snapshot('admin-account-back', 'ps.wind.app.testadmin');
assert.ok(hasText(returned, c.settings), 'Account back navigation returns to Settings');

const result = { at: new Date().toISOString(), package: 'ps.wind.app.testadmin',
  visibleTabs: expectedTabs, hiddenTabs: [c.cashTab, c.account],
  accountRoute: 'admin/account', backReturnedToSettings: true,
  screenshots: ['admin-five-tabs', 'admin-settings-route', 'admin-account-route', 'admin-account-back'] };
writeFileSync(output, JSON.stringify(result, null, 2));
console.log(`Admin physical navigation passed: five translated tabs, Settings → Account → Back. Evidence: ${output}`);
