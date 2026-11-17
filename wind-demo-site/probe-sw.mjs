import { chromium } from 'playwright';

const base = 'https://wind-demo.web.app';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9228', { timeout: 30_000 });
const page = browser.contexts()[0].pages().find(p => p.url().startsWith(base));
if (!page) { console.log('NO TAB'); process.exit(1); }
await page.bringToFront();
const probe = await page.evaluate(async () => {
  const regs = [];
  try {
    for (const r of await navigator.serviceWorker.getRegistrations()) {
      regs.push({ script: r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL, scope: r.scope, state: r.active?.state });
    }
  } catch (e) { return { regsError: String(e) }; }
  let cacheNames = [];
  try { const keys = await caches.keys(); cacheNames = keys; } catch (e) { cacheNames = ['err:' + e]; }
  const cacheInfo = [];
  for (const name of cacheNames) {
    try {
      const c = await caches.open(name);
      const reqs = await c.keys();
      cacheInfo.push({ name, count: reqs.length, urls: reqs.slice(0, 15).map(r => r.url.replace('https://wind-demo.web.app', '')) });
    } catch (e) { cacheInfo.push({ name, error: String(e) }); }
  }
  return { regs, cacheInfo };
});
console.log(JSON.stringify(probe, null, 1));
await browser.close();
