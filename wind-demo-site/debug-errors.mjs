import { chromium } from 'playwright';
import { copy } from 'file:///C:/Users/osama/.local/share/opencode/worktree/b44bf6/wind-demo-2026-11-11/src/copy.ts';

const ADB = 'C:\\Users\\osama\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
import { spawnSync } from 'node:child_process';

const base = 'https://wind-demo.web.app';
const target = base + `/?errcheck=${Date.now()}`;
spawnSync(ADB, ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', target, '-p', 'com.android.chrome'], { encoding: 'utf8' });
const deadline = Date.now() + 20_000;
let ready = false;
while (Date.now() < deadline) {
  try { const res = await fetch('http://127.0.0.1:9228/json/version', { signal: AbortSignal.timeout(1000) }); if (res.ok) { ready = true; break; } } catch { }
  await new Promise(r => setTimeout(r, 300));
}
if (!ready) throw new Error('CDP never ready');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9228', { timeout: 30_000 });
const page = browser.contexts()[0].pages().find(p => p.url().startsWith(base));
page.setDefaultTimeout(30_000);
page.on('pageerror', e => console.log('PAGEERROR:', e.message, '\n', e.stack));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type().toUpperCase() + ':', m.text().slice(0, 500)); });
await page.waitForLoadState('domcontentloaded');
await page.evaluate(async () => {
  try {
    const rs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(rs.map(r => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  } catch (e) { }
  localStorage.clear();
});
await page.goto(target);
await page.evaluate(() => { localStorage.setItem('language', 'en'); localStorage.setItem('onboarded', '1'); });
await page.reload();
const c = copy.en;
await page.getByRole('radio', { name: c.signUp, exact: true }).click();
for (const [label, value] of [[c.name, 'Wind Demo'], [c.email, 'demo@example.test'], [c.phone, '0599000782'], [c.password, 'Wind_Demo_2026']])
  await page.getByLabel(label, { exact: true }).fill(value);
await page.getByLabel(c.password, { exact: true }).evaluate(input => input.blur());
await page.getByRole('checkbox', { name: c.consent }).evaluate(el => el.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(400);
await page.getByRole('checkbox', { name: c.consent }).click();
console.log('CHECKED:', await page.getByRole('checkbox', { name: c.consent }).getAttribute('aria-checked'));
console.log('submitting...');
await page.getByRole('button', { name: c.createAccount, exact: true }).click();
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(1000);
  const state = await page.evaluate(() => ({ url: location.pathname, keys: Object.keys(localStorage), body: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 150) }));
  console.log(`t+${i + 1}s`, JSON.stringify(state));
  if (state.url !== '/auth') break;
}
await page.screenshot({ path: 'C:\\Users\\osama\\.local\\share\\opencode\\worktree\\b44bf6\\wind-demo-2026-11-11\\wind-demo-site\\errcheck.png' });
await browser.close();
