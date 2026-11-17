import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9228', { timeout: 30_000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.setDefaultTimeout(30_000);
await page.goto('https://wind-demo.web.app/?fresh=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const probe = await page.evaluate(async () => {
  const out = {};
  out.localStorage = { keys: Object.keys(localStorage), onboarded: localStorage.getItem('onboarded'), token: (localStorage.getItem('token') || '').slice(0, 20), demo: (localStorage.getItem('wind-demo-state') || '').slice(0, 120) };
  for (const path of ['/api/auth/options', '/api/phone/capabilities', '/api/me', '/api/auth/login']) {
    try {
      const res = path === '/api/auth/login'
        ? await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'demo@example.test', password: 'Wind_Demo_2026' }) })
        : await fetch(path);
      out[path] = { status: res.status, body: (await res.text()).slice(0, 150) };
    } catch (e) { out[path] = { error: String(e) }; }
  }
  out.text = document.body.innerText.slice(0, 400);
  return out;
});
console.log(JSON.stringify(probe, null, 1));
await page.screenshot({ path: 'C:\\Users\\osama\\AppData\\Local\\Temp\\opencode\\fresh-tab.png' });
await ctx.close();
await browser.close();
