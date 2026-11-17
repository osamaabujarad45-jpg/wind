import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9228', { timeout: 30_000 });
const page = browser.contexts()[0].pages().find(p => p.url().startsWith('https://wind-demo.web.app'));
if (!page) { console.log('NO TAB'); process.exit(1); }
await page.bringToFront();
const probe = await page.evaluate(async () => {
  const out = { url: location.href };
  for (const path of ['/api/phone/capabilities', '/api/auth/options']) {
    try {
      const res = await fetch(path);
      out[path] = { status: res.status, body: (await res.text()).slice(0, 200) };
    } catch (e) { out[path] = { error: String(e) }; }
  }
  out.swVersion = [...document.scripts].map(s => s.src);
  out.state = localStorage.getItem('wind-demo-state');
  return out;
});
console.log(JSON.stringify(probe, null, 1));
await browser.close();
