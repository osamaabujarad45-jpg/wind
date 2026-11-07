// Inspects one screen of the exported web build: the DOM around a control, its box and its computed styles.
// A companion to scripts/ui-audit.mjs, for when a finding needs the actual layout tree rather than a number.
//
//   node scripts/ui-probe.mjs /welcome 64 --text=العربية
//
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(root, '.screens', 'web');
const args = process.argv.slice(2);
const route = args[0] || '/';
const width = Number(args[1]) || 360;
const height = Number(args[2]) || 800;
const want = args.find(a => a.startsWith('--text='))?.slice(7);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.json': 'application/json' };
const web = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(webDir, path);
  if (!file.startsWith(webDir) || !existsSync(file) || statSync(file).isDirectory()) file = join(webDir, 'index.html');
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
const PORT = 4123;
await new Promise(resolve => web.listen(PORT, resolve));

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'en-GB', reducedMotion: 'reduce' });
const page = await context.newPage();
await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

const dump = await page.evaluate((want) => {
  const out = [];
  const all = [...document.querySelectorAll('[role="button"],[role="link"],[role="radio"],[role="tab"],[role="checkbox"],button,a')];
  const matches = want ? all.filter(el => (el.getAttribute('aria-label') || el.innerText || '').trim().includes(want)) : all;
  for (const el of matches.slice(0, 8)) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const kids = [...el.children].map(k => {
      const kr = k.getBoundingClientRect(), ks = getComputedStyle(k);
      return { tag: k.tagName.toLowerCase(), box: [Math.round(kr.x), Math.round(kr.y), Math.round(kr.width), Math.round(kr.height)],
        css: { display: ks.display, minHeight: ks.minHeight, height: ks.height, padding: ks.padding, alignItems: ks.alignItems } };
    });
    out.push({
      tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), aria: el.getAttribute('aria-label'),
      text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      css: { display: s.display, flexDirection: s.flexDirection, alignItems: s.alignItems, minHeight: s.minHeight, height: s.height, padding: s.padding, fontSize: s.fontSize, lineHeight: s.lineHeight },
      kids,
      html: el.outerHTML.slice(0, 500),
    });
  }
  return out;
}, want);

console.log(JSON.stringify(dump, null, 2));
await browser.close();
web.close();
