// Writes every icon and splash asset from the Wind mark (scripts/brand-mark.mjs), rasterised by Playwright's Chromium.
// Run from the repo root:  node scripts/make_icon.mjs
// Chromium is needed once:  node node_modules/playwright/cli.js install chromium --only-shell
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { BRAND, markSvg } from './brand-mark.mjs';

const OUT = new URL('../assets/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const jobs = [
  // App icon (iOS, web manifest): the tile on paper, like the splash.
  ['icon.png', markSvg(1024, { background: BRAND.paper, inset: 0.1 }), false],
  // Android adaptive icon: forest background layer; the gust and dot inside the 66% safe zone on the foreground layer.
  ['android-icon-background.png', `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${BRAND.forest}"/></svg>`, false],
  ['android-icon-foreground.png', markSvg(1024, { tile: false, inset: 0.15 }), true],
  ['android-icon-monochrome.png', markSvg(1024, { tile: false, monochrome: true, inset: 0.15 }), true],
  // Native splash: the tile alone; the animated intro (src/intro.tsx) picks up from this exact frame.
  ['splash-icon.png', markSvg(512), true],
  ['favicon.png', markSvg(64, { background: BRAND.paper, inset: 0.04 }), false],
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const [file, svg, transparent] of jobs) {
    const size = Number(svg.match(/width="(\d+)"/)[1]);
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await page.locator('svg').screenshot({ path: new URL(file, OUT).pathname.replace(/^\/([A-Za-z]:)/, '$1'), omitBackground: transparent });
    console.log(`wrote assets/${file}`);
  }
} finally {
  await browser.close();
}
