# Wind brand kit

## The mark

The Arabic **و** (waw, the first letter of ويند), drawn as a gust of wind: a long streak curls up into a ring, and the ring holds a clay destination dot. It reads as the letter, as a curl of wind, and as a route that arrives somewhere. It replaced the speed lines and stock map pin (23 Nov 2026), which looked like every other delivery app.

- Geometry: `scripts/brand-mark.mjs` (`MARK`, a 0..100 box). `<Logo />` in `src/ui.tsx` draws the same numbers with views; `tests/brand-mark.test.mjs` keeps them equal.
- Colours never change with the theme: lime `#D3F27A` gust and clay `#CB6845` dot on the forest `#12342A` tile. On light paper, use the forest gust (`logo/wind-mark-on-paper.svg`).
- Never mirror it for Arabic, and never put it on a busy photo without its tile.

| File | Use |
|---|---|
| `logo/wind-tile.svg` | App tile: avatars, partner listings, stickers |
| `logo/wind-mark.svg` | Mark alone, for forest or dark grounds |
| `logo/wind-mark-white.svg` | One-colour white, for photos and embossing |
| `logo/wind-mark-on-paper.svg` | Forest gust and clay dot on paper |

App icons, the adaptive icon layers, the splash and the favicon in `assets/` are written by `node scripts/make_icon.mjs`.

## Posters and promotion

Rendered by `node scripts/make_promo.mjs` from the app's own screenshots (`docs/screens/<lang>/home.png`), so run it after `npm run screens`. Both scripts need Playwright's Chromium; run them in the Docker sandbox. The HTML sources in `src/` can be edited and re-rendered.

| File | Size | Use |
|---|---|---|
| `poster-ar.png`, `poster-en.png` | 1080 × 1350 | Feed posts; prints at A4/A3 portrait with a margin |
| `story-ar.png`, `story-en.png` | 1080 × 1920 | Stories, WhatsApp status, roll-up banners |
| `feature-ar.png`, `feature-en.png` | 1024 × 500 | Google Play feature graphic |

The copy is the product's own (service names and the tagline). Nothing claims numbers, prices or coverage. Before printing, add the download link or a QR code beside the "Get Wind on Android" button; it is left off because the public link is not final.
