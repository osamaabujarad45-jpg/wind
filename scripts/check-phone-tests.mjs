// ADB evidence helper for the three isolated APKs. Screenshots are original device captures.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const output = resolve('.expo/phone-qa/device');
mkdirSync(output, { recursive: true });
// The attached phone: WIND_PHONE_SERIAL overrides it, so the script does not rot with the device.
const device = process.env.WIND_PHONE_SERIAL?.trim() || 'R5CTB0FJP9Z';
export const adb = (...args) => execFileSync('adb', ['-s', device, ...args], { timeout: 30_000 });
export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const decode = text => text.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
export function nodes(xml) {
  return [...xml.matchAll(/<node\s+([^>]+)>/g)].map(match =>
    Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)])));
}
export async function snapshot(name) {
  // The animated app rarely idles, so uiautomator often dumps the keyguard/system
  // hierarchy or errors with "could not get idle state"; retry for a real window.
  let xml = '';
  for (let attempt = 0; attempt < 8; attempt++) {
    try { adb('shell', 'uiautomator', 'dump', '--compressed', '/sdcard/wind-test-window.xml'); } catch { /* stale file handled below */ }
    xml = adb('shell', 'cat', '/sdcard/wind-test-window.xml').toString();
    if (xml.includes('ps.wind.app') && !xml.includes('aodservice')) break;
    await pause(1500);
  }
  writeFileSync(join(output, `${name}.xml`), xml);
  writeFileSync(join(output, `${name}.png`), adb('exec-out', 'screencap', '-p'));
  return nodes(xml);
}
export function tap(node) {
  assert.ok(node, 'Expected device control was not present');
  const bounds = node.bounds.match(/\d+/g).map(Number);
  adb('shell', 'input', 'tap', String(Math.round((bounds[0] + bounds[2]) / 2)), String(Math.round((bounds[1] + bounds[3]) / 2)));
}
export function open(role, path = '') {
  assert.ok(['customer', 'driver', 'admin'].includes(role));
  const pkg = `ps.wind.app.test${role}`;
  assert.ok(!/[\s'"\\]/.test(path), 'Expected a simple app test route');
  return adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `'wind-test-${role}://${path}'`, pkg).toString();
}
async function smoke() {
  adb('reverse', 'tcp:4191', 'tcp:4191');
  const roles = ['customer', 'driver', 'admin'];
  const results = [];
  for (const role of roles) {
    const pkg = `ps.wind.app.test${role}`;
    adb('shell', 'am', 'force-stop', pkg);
    adb('shell', 'am', 'start', '-W', '-n', `${pkg}/.MainActivity`);
    await pause(5_000);
    const ui = await snapshot(`${role}-home`);
    const text = ui.map(n => n.text || n['content-desc']).filter(Boolean);
    assert.ok(ui.some(n => n.package === pkg), `${role} is foreground`);
    assert.ok(!text.includes('تسجيل الدخول') && !text.includes('Sign in'), `${role} opens without authentication`);
    assert.ok(!text.some(t => /Unable to load script|Could not connect|Uncaught Error|Render Error/.test(t)), `${role} has no runtime error screen`);
    // Role-specific identity must be visible on its account/dashboard screen.
    open(role, role === 'customer' ? 'account' : role === 'driver' ? 'driver/account' : 'admin');
    await pause(2_000);
    const account = await snapshot(`${role}-identity`);
    const accountText = account.map(n => n.text || n['content-desc']).filter(Boolean);
    const expected = { customer: 'عميل تجريبي', driver: 'سائق تجريبي', admin: 'إدارة تجريبية' }[role];
    assert.ok(accountText.some(t => t.includes(expected)), `${role} shows its provisioned role identity`);
    results.push({ role, package: pkg, homeText: text, identityText: accountText, passed: true });
    console.log(`PASS ${role}: cold launch, no sign-in or Metro, correct role identity`);
  }
  writeFileSync(join(output, 'smoke-results.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  if (process.argv[2] === 'smoke') await smoke();
  else if (process.argv[2] === 'snapshot') console.log((await snapshot(process.argv[3] || 'current')).filter(n => n.text || n['content-desc']).map(n => ({ text: n.text, description: n['content-desc'], bounds: n.bounds, clickable: n.clickable })));
  else throw new Error('Use smoke or snapshot <name>');
}
