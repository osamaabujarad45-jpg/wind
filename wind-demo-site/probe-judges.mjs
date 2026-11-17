import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9228', { timeout: 30_000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage({ viewport: { width: 1080, height: 2400 } });
page.setDefaultTimeout(30_000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await page.goto('https://wind-demo-qa.web.app/?judgecheck=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const probe = await page.evaluate(() => ({
  url: location.pathname,
  text: document.body.innerText.slice(0, 400),
  storage: Object.keys(localStorage),
}));
console.log(JSON.stringify(probe, null, 1));
const apiMe = await page.evaluate(async () => {
  const t = JSON.parse(localStorage.getItem('wind-demo-state') || 'null')?.token;
  const res = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + t } });
  return { status: res.status, name: (await res.json()).user?.name };
});
console.log('me:', JSON.stringify(apiMe));
await ctx.close();
await browser.close();
