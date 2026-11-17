import { chromium } from 'playwright';

const base = 'https://wind-demo.web.app';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9228', { timeout: 30_000 });
const contexts = browser.contexts();
console.log('contexts:', contexts.length, 'tabs:', contexts.flatMap(c => c.pages()).map(p => p.url()));
for (const ctx of contexts) {
  for (const p of ctx.pages()) {
    if (p.url().includes('wind-demo.web.app') || p.url().includes('web.app')) {
      console.log('closing', p.url());
      await p.close({ runBeforeUnload: false }).catch(e => console.log('close failed', String(e)));
    }
  }
}
const fresh = contexts[0].pages().length ? contexts[0].pages()[0] : await contexts[0].newPage();
console.log('fresh page target set');
process.exit(0);
