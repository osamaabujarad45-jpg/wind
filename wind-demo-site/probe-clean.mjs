import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9228', { timeout: 30_000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage({ viewport: { width: 1080, height: 2400 } });
page.setDefaultTimeout(20_000);
page.on('pageerror', e => console.log('PAGEERROR >>>', e.message));
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await page.goto('https://wind-demo.web.app/?clean=' + Date.now(), { waitUntil: 'domcontentloaded' });
// Now scrub everything and reload the genuine page as a brand-new visitor sees it.
await page.evaluate(() => { localStorage.clear(); });
await page.goto('https://wind-demo.web.app/?cleanfinal=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const state = await page.evaluate(() => ({
  url: location.pathname,
  keys: Object.keys(localStorage),
  token: (localStorage.getItem('token') || '').slice(0, 20),
  state: (() => { try { const s = JSON.parse(localStorage.getItem('wind-demo-state') || 'null'); return s ? { user: s.user?.name, tokenLen: (s.token||'').length, orders: s.orders.length } : null; } catch { return 'ERR'; } })(),
  text: document.body.innerText.slice(0, 150)
}));
console.log(JSON.stringify(state, null, 1));
await page.screenshot({ path: 'C:\\Users\\osama\\AppData\\Local\\Temp\\opencode\\clean-load.png' });
await ctx.close();
await browser.close();
