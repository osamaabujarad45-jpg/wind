import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9228', { timeout: 30_000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR >>>', e.message, '\n', (e.stack || '').slice(0, 800)));
page.on('console', m => { if (['error', 'warning'].includes(m.type())) console.log('CONSOLE', m.type().toUpperCase(), '>>>', m.text().slice(0, 600)); });
await page.goto('https://wind-demo.web.app/?diag4=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
console.log('URL:', page.url());
console.log('TEXT:', (await page.evaluate(() => document.body.innerText)).slice(0, 300));
await page.screenshot({ path: 'C:\\Users\\osama\\AppData\\Local\\Temp\\opencode\\diag4.png' });
await ctx.close();
await browser.close();
