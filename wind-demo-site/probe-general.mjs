import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9228', { timeout: 30_000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
try {
  await page.goto('https://example.com/', { timeout: 20000, waitUntil: 'domcontentloaded' });
  console.log('example.com ->', page.url(), '| title:', await page.evaluate(() => document.title));
} catch (e) {
  console.log('example.com FAILED:', String(e).slice(0, 400));
}
try {
  await page.goto('https://wind-demo.web.app/', { timeout: 20000, waitUntil: 'domcontentloaded' });
  console.log('wind-demo ->', page.url(), '| title:', await page.evaluate(() => document.title));
} catch (e) {
  console.log('wind-demo FAILED:', String(e).slice(0, 400));
}
console.log('ERRORS:', errors);
await ctx.close();
await browser.close();
