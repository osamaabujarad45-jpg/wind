import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9228', { timeout: 30_000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage({ viewport: { width: 1080, height: 2400 } });
page.setDefaultTimeout(10_000);
await page.goto('https://wind-demo.web.app/?probe=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const tree = await page.evaluate(() => [...document.querySelectorAll('[role]')].map(e => ({
  role: e.getAttribute('role'),
  label: (e.getAttribute('aria-label') || e.innerText || '').trim().slice(0, 60),
  tag: e.tagName
})).filter(x => x.label));
console.log(JSON.stringify(tree, null, 1));
await ctx.close();
await browser.close();
