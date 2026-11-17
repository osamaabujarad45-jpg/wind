import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9228', { timeout: 30_000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage({ viewport: { width: 1080, height: 2400 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable', {});
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
cdp.on('Network.responseReceived', e => {
  const url = e.response.url;
  if (url.includes('/api/')) console.log(`${e.response.status} ${e.response.requestMethod ?? ''} ${url.slice(0, 120)}`);
});
await page.goto('https://wind-demo.web.app/?net=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const state = await page.evaluate(() => ({
  url: location.pathname,
  tokenPresent: !!localStorage.getItem('token'),
  stateTok: (() => { try { return JSON.parse(localStorage.getItem('wind-demo-state') || 'null')?.token; } catch { return 'ERR'; } })()
}));
console.log('STATE:', JSON.stringify(state));
await ctx.close();
await browser.close();
