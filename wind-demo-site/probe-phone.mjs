import { chromium } from 'playwright';

const target = 'https://wind-demo.web.app/';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9228', { timeout: 30_000 });
const page = browser.contexts()[0].pages().find(p => p.url().startsWith('https://wind-demo.web.app'));
if (!page) { console.log('NO TAB'); process.exit(1); }
await page.bringToFront();
const probe = await page.evaluate(async () => {
  const demo = localStorage.getItem('wind-demo-state');
  const tok = localStorage.getItem('token');
  let me = null, meStatus = null, meBody = null;
  try {
    const parsed = demo ? JSON.parse(demo) : null;
    const headers = parsed?.token ? { Authorization: 'Bearer ' + parsed.token } : {};
    const res = await fetch('/api/me', { headers });
    meStatus = res.status;
    meBody = (await res.text()).slice(0, 300);
  } catch (e) { me = String(e); }
  return { demo: demo ? demo.slice(0, 400) : null, token: tok, keys: Object.keys(localStorage), meStatus, meBody, me };
});
console.log(JSON.stringify(probe, null, 1));
await browser.close();
