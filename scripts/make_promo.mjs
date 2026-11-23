// Posters and promotion graphics in Arabic and English, from the Wind mark and the app's real screenshots.
// Run from the repo root after `npm run screens`:  node scripts/make_promo.mjs   (--html-only: write the sources, render nothing)
// Writes docs/brand/src/*.html (editable sources), docs/brand/*.png (renders) and docs/brand/logo/*.svg (the mark for print).
// Copy comes from the product (service names, the tagline): no invented numbers, claims or testimonials.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { BRAND, MARK, markShapes, markSvg } from './brand-mark.mjs';

const root = new URL('../docs/brand/', import.meta.url);
for (const dir of ['', 'src/', 'logo/']) mkdirSync(new URL(dir, root), { recursive: true });

// Line colours of design system v2 (src/theme.ts lines.day): accents on icons only.
const LINE = { ride: { c: '#2F5E8C', t: '#E6EDF6' }, send: { c: '#34765A', t: '#E2EEE5' }, shop: { c: '#8A3D6A', t: '#F5E6EE' } };

const COPY = {
  en: { dir: 'ltr', brand: 'Wind', headline: ['Ride.', 'Send.', 'Shop.'], tagline: 'Clear delivery, from pickup to handover.',
    services: { ride: 'Ride', send: 'Items & parcels', shop: 'Shop delivery' }, cta: 'Get Wind on Android', one: 'One app' },
  ar: { dir: 'rtl', brand: 'ويند', headline: ['مشوار.', 'إرسال.', 'متاجر.'], tagline: 'توصيل واضح، من الاستلام للتسليم.',
    services: { ride: 'مشوار', send: 'أغراض وطرود', shop: 'توصيل من المحلات' }, cta: 'حمّل ويند على أندرويد', one: 'تطبيق واحد' },
};

// Simple line glyphs (24 box, 2px stroke), drawn here so the posters need no icon font.
const GLYPH = {
  ride: '<path d="M5 15.5V12l2-4.5h10L19 12v3.5"/><path d="M3.5 15.5h17v2.5h-17z"/><circle cx="7.5" cy="18.5" r="1.6"/><circle cx="16.5" cy="18.5" r="1.6"/><path d="M7 12h10"/>',
  send: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  shop: '<path d="M4 10h16l-1.6 9.2a1.5 1.5 0 0 1-1.5 1.3H7.1a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M8.5 10l3.5-6 3.5 6"/><path d="M10 14v3M14 14v3"/>',
};
const glyph = (k, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${LINE[k].c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[k]}</svg>`;

// The gust alone (streak, turn, ring) as a huge background flourish.
const gustPath = () => {
  const { ring, turn, streakX, stroke } = MARK, y = turn.cy + turn.r;
  return `<circle cx="${ring.cx}" cy="${ring.cy}" r="${ring.r}" fill="none" stroke="${BRAND.lime}" stroke-width="${stroke}"/>`
    + `<path d="M ${streakX - 400} ${y} H ${turn.cx} A ${turn.r} ${turn.r} 0 0 0 ${turn.cx + turn.r} ${turn.cy}" fill="none" stroke="${BRAND.lime}" stroke-width="${stroke}" stroke-linecap="round"/>`;
};

const chip = (k, size, label) => `<div class="chip" style="--c:${LINE[k].c};--t:${LINE[k].t};--s:${size}px">
  <div class="face">${glyph(k, size * 0.5)}</div>${label ? `<span>${label}</span>` : ''}</div>`;

function page({ lang, w, h, layout }) {
  const t = COPY[lang], screen = `../../screens/${lang}/home.png`;
  const isWide = layout === 'feature', isStory = layout === 'story';
  const phoneW = isWide ? 196 : isStory ? 400 : 430;
  const pad = isWide ? 48 : 84;
  const head = isWide ? 64 : 112;
  return `<!doctype html><html lang="${lang}" dir="${t.dir}"><head><meta charset="utf-8"><style>
@font-face { font-family: Readex; src: url(../../../assets/fonts/ReadexPro-Bold.ttf); font-weight: 700; }
@font-face { font-family: Readex; src: url(../../../assets/fonts/ReadexPro-SemiBold.ttf); font-weight: 600; }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${w}px; height: ${h}px; overflow: hidden; }
body { font-family: Readex, sans-serif; color: ${BRAND.paper}; position: relative;
  background: radial-gradient(120% 90% at ${t.dir === 'rtl' ? '85%' : '15%'} 0%, #1E4B3C 0%, ${BRAND.forest} 55%, #0B2119 100%); }
.flourish { position: absolute; opacity: .09; ${isWide ? 'width: 900px; right: -260px; top: -180px;' : `width: ${w * 1.5}px; ${t.dir === 'rtl' ? 'left' : 'right'}: -${w * 0.55}px; top: ${isStory ? 760 : 380}px;`} }
.brand { position: absolute; top: ${pad}px; inset-inline-start: ${pad}px; display: flex; align-items: center; gap: ${isWide ? 14 : 22}px; }
.brand b { font-size: ${isWide ? 40 : 64}px; font-weight: 700; letter-spacing: ${lang === 'en' ? '-1px' : '0'}; }
.copy { position: absolute; inset-inline-start: ${pad}px; ${isWide ? `top: 150px; width: 520px;` : `top: ${pad + 190}px; width: ${isStory ? w - 2 * pad : w - 2 * pad - phoneW + 40}px;`} }
h1 { font-size: ${head}px; line-height: ${lang === 'ar' ? 1.2 : 1.04}; font-weight: 700; }
h1 span:nth-child(1) { color: ${BRAND.paper}; } h1 span:nth-child(2) { color: ${BRAND.lime}; } h1 span:nth-child(3) { color: ${BRAND.paper}; }
h1 span { display: ${isWide ? 'inline' : 'block'}; } h1 span + span { margin-inline-start: ${isWide ? '14px' : 0}; }
p.tag { margin-top: ${isWide ? 16 : 30}px; font-size: ${isWide ? 22 : isStory ? 40 : 34}px; font-weight: 600; color: #C9D6CE; max-width: ${isWide ? 520 : 760}px; line-height: 1.35; }
.stage { position: absolute; perspective: 1800px; ${isWide ? `right: ${t.dir === 'rtl' ? 'auto' : '90px'}; left: ${t.dir === 'rtl' ? '90px' : 'auto'}; top: 30px;` : `inset-inline-end: ${isStory ? 340 : 70}px; bottom: ${isStory ? 220 : 170}px;`} }
.phone { width: ${phoneW}px; aspect-ratio: 780 / 1688; border-radius: ${phoneW * 0.13}px; padding: ${phoneW * 0.035}px; background: #0A1712;
  transform: rotateY(${t.dir === 'rtl' ? 16 : -16}deg) rotateX(6deg) rotateZ(${t.dir === 'rtl' ? -2 : 2}deg); transform-style: preserve-3d;
  box-shadow: ${t.dir === 'rtl' ? '-' : ''}40px 60px 90px rgba(0,0,0,.45), 0 0 0 2px #2A3B35 inset; }
.phone img { width: 100%; height: 100%; border-radius: ${phoneW * 0.1}px; display: block; object-fit: cover; object-position: top; }
.chips { position: absolute; inset: 0; transform-style: preserve-3d; pointer-events: none; }
.chip { position: relative; display: flex; align-items: center; gap: 14px; transform-style: preserve-3d; }
.chip .face { width: var(--s); height: var(--s); border-radius: calc(var(--s) * .3); background: var(--t); display: grid; place-items: center;
  box-shadow: 0 calc(var(--s) * .09) 0 color-mix(in srgb, var(--c) 55%, ${BRAND.forest}), 0 calc(var(--s) * .35) calc(var(--s) * .45) rgba(0,0,0,.35); }
.chip span { font-size: ${isWide ? 18 : 30}px; font-weight: 600; background: rgba(243,242,236,.96); color: ${BRAND.ink}; padding: 10px 18px; border-radius: 999px;
  box-shadow: 0 10px 30px rgba(0,0,0,.25); white-space: nowrap; }
.c1, .c2, .c3 { position: absolute; transform-style: preserve-3d; }
.c1 { top: 5%; inset-inline-start: ${isWide ? -50 : -90}px; transform: translateZ(120px) rotate(-6deg); }
.c2 { top: 44%; inset-inline-end: ${isWide ? -10 : -10}px; transform: translateZ(160px) rotate(5deg); }
.c3 { bottom: 9%; inset-inline-start: ${isWide ? -40 : -110}px; transform: translateZ(100px) rotate(-3deg); }
.cta { position: absolute; inset-inline-start: ${pad}px; bottom: ${isWide ? 40 : pad}px; display: flex; align-items: center; gap: 16px;
  background: ${BRAND.lime}; color: ${BRAND.forest}; font-size: ${isWide ? 20 : 34}px; font-weight: 700; padding: ${isWide ? '12px 22px' : '22px 34px'}; border-radius: 999px;
  box-shadow: 0 6px 0 #9DBD3F, 0 20px 40px rgba(0,0,0,.3); }
.cta i { font-style: normal; font-size: ${isWide ? 14 : 22}px; font-weight: 600; opacity: .75; }
</style></head><body>
<svg class="flourish" viewBox="0 0 100 100" overflow="visible">${gustPath()}</svg>
<div class="brand">${markSvg(isWide ? 64 : 104)}<b>${t.brand}</b></div>
<div class="copy"><h1>${t.headline.map(s => `<span>${s}</span>`).join('')}</h1><p class="tag">${t.tagline}</p></div>
<div class="stage"><div class="phone"><img src="${screen}" alt=""></div>
  <div class="chips">
    <div class="c1">${chip('ride', isWide ? 52 : 92, t.services.ride)}</div>
    <div class="c2">${chip('send', isWide ? 52 : 92, t.services.send)}</div>
    <div class="c3">${chip('shop', isWide ? 52 : 92, t.services.shop)}</div>
  </div></div>
${isWide ? '' : `<div class="cta">${t.cta}<i>· ${t.one}</i></div>`}
</body></html>`;
}

const formats = [
  { name: 'poster', w: 1080, h: 1350, layout: 'poster' }, // feed post and print (4:5)
  { name: 'story', w: 1080, h: 1920, layout: 'story' }, // stories, status, A-series print at 9:16
  { name: 'feature', w: 1024, h: 500, layout: 'feature' }, // Google Play feature graphic
];

// The mark for print and partners: tile, mark alone (for dark grounds), white.
writeFileSync(new URL('logo/wind-tile.svg', root), markSvg(512));
writeFileSync(new URL('logo/wind-mark.svg', root), markSvg(512, { tile: false }));
writeFileSync(new URL('logo/wind-mark-white.svg', root), markSvg(512, { tile: false, monochrome: true }));
writeFileSync(new URL('logo/wind-mark-on-paper.svg', root),
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 100 100"><rect width="100" height="100" fill="${BRAND.paper}"/>`
  + markShapes().replaceAll(BRAND.lime, BRAND.forest) + '</svg>'); // single-colour forest gust with the clay dot, for light paper

for (const f of formats) for (const lang of ['ar', 'en']) writeFileSync(new URL(`src/${f.name}-${lang}.html`, root), page({ lang, ...f }));
if (process.argv.includes('--html-only')) process.exit(0); // sources only, e.g. to preview in a browser

const browser = await chromium.launch();
try {
  const tab = await browser.newPage();
  for (const f of formats) for (const lang of ['ar', 'en']) {
    const html = new URL(`src/${f.name}-${lang}.html`, root);
    await tab.setViewportSize({ width: f.w, height: f.h });
    await tab.goto(pathToFileURL(fileURLToPath(html)).href);
    await tab.evaluate(() => document.fonts.ready);
    await tab.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
    await tab.screenshot({ path: fileURLToPath(new URL(`${f.name}-${lang}.png`, root)) });
    console.log(`wrote docs/brand/${f.name}-${lang}.png`);
  }
} finally {
  await browser.close();
}
