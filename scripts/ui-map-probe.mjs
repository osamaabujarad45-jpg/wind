// Finds the DOM path of the map vendor's own overlay text, so the audit can tell the
// app's text from the map's text.
//
//   node scripts/ui-map-probe.mjs
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(root, '.screens', 'web');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.json': 'application/json' };
const web = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(webDir, path);
  if (!file.startsWith(webDir) || !existsSync(file) || statSync(file).isDirectory()) file = join(webDir, 'index.html');
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
const PORT = 4124;
await new Promise(resolve => web.listen(PORT, resolve));

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
await page.goto(`http://localhost:${PORT}/book?service=parcel`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const dump = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('div,span,p')) {
    const text = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' ');
    if (!text || !/zoom|attribution|Google/i.test(text)) continue;
    const chain = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) chain.push(`${n.tagName.toLowerCase()}.${[...n.classList].join('.')}`);
    out.push({ text: text.slice(0, 60), chain: chain.slice(0, 8) });
  }
  return out;
});
console.log(JSON.stringify(dump, null, 2));
await browser.close();
web.close();
