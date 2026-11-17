// Step-by-step signup forensics on the A53 using only trusted (playwright) input.
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { copy } from 'file:///C:/Users/osama/.local/share/opencode/worktree/b44bf6/wind-demo-2026-11-11/src/copy.ts';

const ADB = 'C:\\Users\\osama\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const outDir = 'C:\\Users\\osama\\.local\\share\\opencode\\worktree\\b44bf6\\wind-demo-2026-11-11\\wind-demo-site';
const base = 'https://wind-demo.web.app';
const target = base + `/?debug=${Date.now()}`;
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
if (!page) throw new Error('tab missing');
page.setDefaultTimeout(30_000);
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
const step = async name => {
  const keys = await page.evaluate(() => Object.keys(localStorage).join(','));
  const body = await page.evaluate(() => document.body.innerText.replace(/\n+/g, ' | ').slice(0, 200));
  const url = page.url();
  console.log(`STEP ${name}\n  url=${url}\n  keys=${keys}\n  text=${body}\n`);
};
await step('boot');
const radio = page.getByRole('radio', { name: c.signUp, exact: true });
await radio.click();
await step('after NEW ACCOUNT click');
for (const [label, value] of [[c.name, 'Wind Demo'], [c.email, 'demo@example.test'], [c.phone, '0599000782'], [c.password, 'Wind_Demo_2026']])
  await page.getByLabel(label, { exact: true }).fill(value);
await step('after fills');
await page.getByLabel(c.password, { exact: true }).evaluate(input => input.blur());
await page.waitForTimeout(600);
await page.getByRole('checkbox', { name: c.consent }).evaluate(el => el.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(300);
await page.getByRole('checkbox', { name: c.consent }).click();
await step('after consent click');
await page.getByRole('button', { name: c.createAccount, exact: true }).click();
await page.waitForTimeout(2500);
await step('after CREATE ACCOUNT click');
const me = await page.evaluate(async () => {
  const raw = localStorage.getItem('wind-demo-state');
  const keys = Object.keys(localStorage);
  let parsed = null; try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = { error: String(e) }; }
  let meRes = null;
  try {
    const res = await fetch('/api/me', { headers: parsed?.token ? { Authorization: 'Bearer ' + parsed.token } : {} });
    meRes = { status: res.status, body: (await res.text()).slice(0, 200) };
  } catch (e) { meRes = { error: String(e) }; }
  return { keys, token: parsed?.token ?? null, meRes };
});
console.log('ME CHECK:', JSON.stringify(me, null, 1));
await page.screenshot({ path: outDir + '\\debug-after-create.png' });
await browser.close();
