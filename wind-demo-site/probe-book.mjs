import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9228', { timeout: 30_000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage({ viewport: { width: 1080, height: 2400 } });
page.setDefaultTimeout(15_000);
page.on('pageerror', e => console.log('PAGEERROR >>>', e.message, '\n', (e.stack || '').slice(0, 600)));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR >>>', m.text().slice(0, 500)); });
const cdpSession = await page.context().newCDPSession(page);
await cdpSession.send('Network.setCacheDisabled', { cacheDisabled: true });
await page.goto('https://wind-demo.web.app/book?from=ramallah&to=nablus&service=ride', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
console.log('URL:', page.url());
console.log('TEXT:', (await page.evaluate(() => document.body.innerText)).slice(0, 1200));
await page.screenshot({ path: 'C:\\Users\\osama\\AppData\\Local\\Temp\\opencode\\book-page.png' });
await ctx.close();
await browser.close();
