import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9228', { timeout: 30_000 });
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.goto('https://wind-demo.web.app/?diag=' + Date.now(), { waitUntil: 'domcontentloaded' });
const probe = await page.evaluate(() => {
  const out = { srcs: [...document.scripts].map(s => s.src || 'inline:' + (s.textContent || '').slice(0, 80).replace(/\s+/g, ' ')), inline: [], demoState: null, token: null };
  for (const s of document.scripts) {
    if (!s.src && s.textContent.length > 100) out.inline.push(s.textContent.slice(0, 200));
  }
  try { out.demoState = localStorage.getItem('wind-demo-state'); } catch {}
  try { out.token = localStorage.getItem('token'); } catch {}
  return out;
});
console.log(JSON.stringify(probe, null, 1));
await ctx.close();
await browser.close();
