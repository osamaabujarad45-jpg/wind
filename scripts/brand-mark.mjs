// The Wind mark, as data and as SVG. One source for the app icons (make_icon.mjs) and the posters (make_promo.mjs);
// <Logo /> in src/ui.tsx draws the same numbers with views, and tests/brand-mark.test.mjs keeps the two equal.
//
// The mark is the Arabic letter و (waw), the first letter of ويند, drawn as a gust: a long streak of wind that curls up
// into a ring, with a clay destination dot held inside the ring. It reads as و, as a curl of wind and as a route that
// arrives somewhere. Geometry lives in a 0..100 box; the streak, the quarter-circle turn and the ring share one stroke
// and meet tangent, so the line is continuous.

export const BRAND = { paper: '#F3F2EC', forest: '#12342A', lime: '#D3F27A', clay: '#CB6845', ink: '#0E1F19', white: '#FFFFFF' };

export const MARK = {
  stroke: 8.5,
  ring: { cx: 63.75, cy: 43.25, r: 12.5 }, // stroke centreline radius
  turn: { cx: 50.25, cy: 43.25, r: 26 }, // a quarter of this circle, from 6 o'clock up to 3 o'clock, where it meets the ring
  streakX: 23.75, // the streak runs left from the bottom of the turn to here (round end)
  dot: 5, // radius, at the ring's centre
  radius: 0.29, // tile corner, of the tile width
};

/** The mark's shapes in the 0..100 box. `monochrome` paints everything white (Android themed icon). */
export function markShapes({ monochrome = false } = {}) {
  const { stroke: w, ring, turn, streakX, dot } = MARK;
  const gust = monochrome ? BRAND.white : BRAND.lime;
  const pin = monochrome ? BRAND.white : BRAND.clay;
  const y = turn.cy + turn.r;
  return [
    `<circle cx="${ring.cx}" cy="${ring.cy}" r="${ring.r}" fill="none" stroke="${gust}" stroke-width="${w}"/>`,
    `<path d="M ${streakX} ${y} H ${turn.cx} A ${turn.r} ${turn.r} 0 0 0 ${turn.cx + turn.r} ${turn.cy}" fill="none" stroke="${gust}" stroke-width="${w}" stroke-linecap="round"/>`,
    `<circle cx="${ring.cx}" cy="${ring.cy}" r="${dot}" fill="${pin}"/>`,
  ].join('');
}

/** A square SVG of the mark. tile: the forest rounded tile behind it. inset: margin as a share of the size. */
export function markSvg(size, { tile = true, monochrome = false, background = null, inset = 0 } = {}) {
  const pad = size * inset, box = size - 2 * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + (background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : '')
    + (tile ? `<rect x="${pad}" y="${pad}" width="${box}" height="${box}" rx="${box * MARK.radius}" fill="${BRAND.forest}"/>` : '')
    + `<g transform="translate(${pad} ${pad}) scale(${box / 100})">${markShapes({ monochrome })}</g></svg>`;
}

/** The mark as a group for embedding in a larger SVG, at x,y with the given size (tile included). */
export function markGroup(x, y, size, { tile = true } = {}) {
  return `<g transform="translate(${x} ${y})">`
    + (tile ? `<rect width="${size}" height="${size}" rx="${size * MARK.radius}" fill="${BRAND.forest}"/>` : '')
    + `<g transform="scale(${size / 100})">${markShapes()}</g></g>`;
}
