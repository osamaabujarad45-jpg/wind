import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9228', { timeout: 30_000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR >>>', e.message));
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await page.goto('https://wind-demo.web.app/?diag=' + Date.now(), { waitUntil: 'domcontentloaded' });
const s1 = await page.evaluate(() => {
  const demo = localStorage.getItem('wind-demo-state');
  return { keys: Object.keys(localStorage), token: (localStorage.getItem('token') || '').slice(0, 30),
    stateTok: (() => { try { return JSON.parse(demo)?.token; } catch { return 'ERR'; } })() };
});
console.log('right after boot:', JSON.stringify(s1, null, 1));
const meRes = await page.evaluate(async () => {
  const t = JSON.parse(localStorage.getItem('wind-demo-state') || 'null')?.token;
  const res = await fetch('/api/me', { headers: t ? { Authorization: 'Bearer ' + t } : {} });
  return { status: res.status, body: (await res.text()).slice(0, 120) };
});
console.log('/api/me with seeded token:', JSON.stringify(meRes, null, 1));
await page.reload({ waitUntil: 'domcontentloaded' });
const s2 = await page.evaluate(() => ({ keys: Object.keys(localStorage), text: document.body.innerText.slice(0, 200) }));
console.log('after reload:', JSON.stringify(s2, null, 1));
await ctx.close();
await browser.close();
