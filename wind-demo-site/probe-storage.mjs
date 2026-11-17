import { chromium } from 'playwright';

const base = 'https://wind-demo.web.app';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9228', { timeout: 30_000 });
const page = browser.contexts()[0].pages().find(p => p.url().startsWith(base));
if (!page) { console.log('NO TAB'); process.exit(1); }
await page.bringToFront();
const probe = await page.evaluate(async () => {
  const sets = [];
  try { localStorage.setItem('token', 'probe-' + Date.now()); sets.push('setItem token ok'); } catch (e) { sets.push('setItem token THREW: ' + e.message); }
  try { localStorage.setItem('onboarded', '1'); sets.push('setItem onboarded ok'); } catch (e) { sets.push('setItem onboarded THREW: ' + e.message); }
  const back = {};
  try { back['token'] = localStorage.getItem('token'); back['onboarded'] = localStorage.getItem('onboarded'); } catch (e) { back.readError = String(e); }
  let meRes = null;
  try {
    const res = await fetch('/api/me');
    meRes = { status: res.status, body: (await res.text()).slice(0, 200) };
  } catch (e) { meRes = { error: String(e) }; }
  return { sets, back, keys: Object.keys(localStorage), meRes };
});
console.log(JSON.stringify(probe, null, 1));
await browser.close();
