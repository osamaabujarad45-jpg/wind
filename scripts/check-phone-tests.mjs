// ADB evidence helper for the three isolated APKs. Screenshots are original device captures.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (process.platform === 'win32') {
  process.env.PATH = (process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Android\\Sdk\\platform-tools;` : '') + process.env.PATH;
}

const port = Number(process.env.WIND_PHONE_TEST_PORT ?? 4191);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('WIND_PHONE_TEST_PORT must be a valid unprivileged TCP port');
const sandboxName = port === 4191 ? 'phone-qa' : `phone-qa-${port}`;
const output = resolve('.expo', sandboxName, 'device');
mkdirSync(output, { recursive: true });
// The attached phone: WIND_PHONE_SERIAL overrides it, so the script does not rot with the device.
const device = process.env.WIND_PHONE_SERIAL?.trim() || 'R5CTB0FJP9Z';
const agentDevice = process.env.WIND_AGENT_DEVICE?.trim();
const agent = (...args) => execFileSync(process.env.COMSPEC ?? 'cmd.exe', ['/d', '/s', '/c', agentDevice, ...args], { timeout: 60_000, encoding: 'utf8' });
export const adb = (...args) => execFileSync('adb', ['-s', device, ...args], { timeout: 30_000 });
export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const decode = text => text.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
export function nodes(xml) {
  return [...xml.matchAll(/<node\s+([^>]+)>/g)].map(match =>
    Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)])));
}
export async function snapshot(name, expectedPackage = 'ps.wind.app') {
  if (agentDevice) {
    let text = '', page = '';
    for (let attempt = 0; attempt < 8; attempt++) {
      text = agent('snapshot', '-i');
      page = text.match(/^Page:\s*(\S+)/m)?.[1] ?? '';
      if (page.includes(expectedPackage)) break;
      await pause(1500);
    }
    writeFileSync(join(output, `${name}.txt`), text);
    agent('screenshot', join(output, `${name}.png`));
    return [...text.matchAll(/^@e(\d+) \[([^\]]+)](?: "([^"]*)")?([^\r\n]*)$/gm)].map(match => ({
      ref: `@e${match[1]}`, kind: match[2], text: match[3] ?? '', 'content-desc': match[3] ?? '',
      package: page, enabled: 'true', className: match[2] === 'text-field' ? 'android.widget.EditText' : match[2],
      clickable: match[2] === 'button' ? 'true' : 'false', selected: match[4].includes('selected') ? 'true' : 'false',
    }));
  }
  // Remove the prior capture: a successful dump from another role is not evidence for this role.
  let xml = '';
  for (let attempt = 0; attempt < 8; attempt++) {
    adb('shell', 'rm', '-f', '/sdcard/wind-test-window.xml');
    try { adb('shell', 'uiautomator', 'dump', '--compressed', '/sdcard/wind-test-window.xml'); } catch { /* retry below */ }
    try { xml = adb('shell', 'cat', '/sdcard/wind-test-window.xml').toString(); } catch { xml = ''; }
    if (xml.includes(`package="${expectedPackage}"`) && !xml.includes('aodservice')) break;
    await pause(1500);
  }
  writeFileSync(join(output, `${name}.xml`), xml);
  writeFileSync(join(output, `${name}.png`), adb('exec-out', 'screencap', '-p'));
  return nodes(xml);
}
export function tap(node) {
  assert.ok(node, 'Expected device control was not present');
  if (agentDevice && node.ref) return agent('press', node.ref, '--settle');
  const bounds = node.bounds.match(/\d+/g).map(Number);
  adb('shell', 'input', 'tap', String(Math.round((bounds[0] + bounds[2]) / 2)), String(Math.round((bounds[1] + bounds[3]) / 2)));
}
export function fill(node, value) {
  assert.ok(node, 'Expected device input was not present');
  if (agentDevice && node.ref) {
    try { return agent('fill', node.ref, value, '--settle'); }
    catch {
      const snapshot = JSON.parse(agent('snapshot', '-i', '--json'));
      const target = snapshot.data.nodes.find(item => item.ref === node.ref.slice(1) && item.editable && item.rect);
      assert.ok(target, `Editable input ${node.ref} has no usable frame`);
      const x = Math.round(target.rect.x + target.rect.width / 2), y = Math.round(target.rect.y + target.rect.height / 2);
      return agent('fill', String(x), String(y), value, '--settle');
    }
  }
  tap(node);
  adb('shell', 'input', 'text', value);
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
}
export function scrollDown() {
  if (agentDevice) return agent('scroll', 'down', '--settle');
  return adb('shell', 'input', 'swipe', '500', '1600', '500', '450', '450');
}
export async function apiCall(provision, path, role) {
  const account = provision.roles[role];
  let token = account.token;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${provision.apiUrl}/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json();
    if (response.status === 401) {
      const login = await fetch(`${provision.apiUrl}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: account.identifier, password: account.password }),
      });
      const value = await login.json();
      assert.equal(login.status, 200, `${role} sandbox reauthentication: ${value.error ?? login.status}`);
      token = value.token;
      continue;
    }
    assert.equal(response.status, 200, `${path}: ${body.error ?? response.status}`);
    return body;
  }
  throw new Error(`${path}: sandbox token remained unauthorized after reauthentication`);
}
export function open(role, path = '') {
  assert.ok(['customer', 'driver', 'admin'].includes(role));
  const pkg = `ps.wind.app.test${role}`;
  assert.ok(!/[\s'"\\]/.test(path), 'Expected a simple app test route');
  if (agentDevice) return agent('open', pkg, `wind-test-${role}://${path}`);
  return adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `'wind-test-${role}://${path}'`, pkg).toString();
}
async function smoke() {
  adb('reverse', `tcp:${port}`, `tcp:${port}`);
  const roles = ['customer', 'driver', 'admin'];
  const results = [];
  for (const role of roles) {
    const pkg = `ps.wind.app.test${role}`;
    if (agentDevice) agent('open', pkg, '--relaunch');
    else {
      adb('shell', 'am', 'force-stop', pkg);
      adb('shell', 'am', 'start', '-W', '-n', `${pkg}/.MainActivity`);
    }
    await pause(5_000);
    const ui = await snapshot(`${role}-home`, pkg);
    const text = ui.map(n => n.text || n['content-desc']).filter(Boolean);
    assert.ok(ui.some(n => n.package === pkg), `${role} is foreground`);
    assert.ok(!text.includes('تسجيل الدخول') && !text.includes('Sign in'), `${role} opens without authentication`);
    assert.ok(!text.some(t => /Unable to load script|Could not connect|Uncaught Error|Render Error/.test(t)), `${role} has no runtime error screen`);
    // Role-specific identity must be visible on its account/dashboard screen.
    open(role, role === 'customer' ? 'account' : role === 'driver' ? 'driver/account' : 'admin');
    await pause(2_000);
    const account = await snapshot(`${role}-identity`, pkg);
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
