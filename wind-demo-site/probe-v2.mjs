import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9228', { timeout: 30_000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await page.goto('https://wind-demo.web.app/?diag3=' + Date.now(), { waitUntil: 'domcontentloaded' });
const probe = await page.evaluate(() => {
  const texts = [...document.scripts].filter(s => !s.src && s.textContent.length > 100).map(s => s.textContent);
  const v2 = texts.some(t => t.includes('Pre-seed a signed-in demo session'));
  const v1 = texts.some(t => t.includes('demo-token-seed-') && t.includes('if (!localStorage.getItem'));
  return {
    v2,
    v1,
    count: texts.length,
    token: localStorage.getItem('token'),
    stateTok: (() => { try { return JSON.parse(localStorage.getItem('wind-demo-state') || 'null')?.token; } catch { return 'ERR'; } })(),
    text: document.body.innerText.slice(0, 200)
  };
});
console.log(JSON.stringify(probe, null, 1));
await ctx.close();
await browser.close();
