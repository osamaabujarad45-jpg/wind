// The Wind mark is drawn twice: with views in <Logo /> (src/ui.tsx) and as SVG for the icons and posters
// (scripts/brand-mark.mjs). Both must use the same geometry, or the app logo and the launcher icon drift apart.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MARK, markSvg } from '../scripts/brand-mark.mjs';

const ui = readFileSync(new URL('../src/ui.tsx', import.meta.url), 'utf8');
const block = ui.match(/export const logoMark = \{([\s\S]*?)\n\};/);
assert.ok(block, 'logoMark not found in src/ui.tsx');
const num = (name) => Number(block[1].match(new RegExp(`${name}: ([\\d.]+)`))[1]);
const triple = (name) => block[1].match(new RegExp(`${name}: \\[([\\d., ]+)\\]`))[1].split(',').map(Number);

assert.equal(num('stroke'), MARK.stroke, 'stroke');
assert.deepEqual(triple('ring'), [MARK.ring.cx, MARK.ring.cy, MARK.ring.r], 'ring');
assert.deepEqual(triple('turn'), [MARK.turn.cx, MARK.turn.cy, MARK.turn.r], 'turn');
assert.equal(num('streakX'), MARK.streakX, 'streakX');
assert.equal(num('dot'), MARK.dot, 'dot');
assert.equal(num('radius'), MARK.radius, 'radius');

// The line is continuous: the turn meets the ring at the ring's rightmost point, at the same height, tangent.
assert.equal(MARK.turn.cy, MARK.ring.cy, 'turn and ring centres level');
assert.equal(MARK.turn.cx + MARK.turn.r, MARK.ring.cx + MARK.ring.r, 'turn ends on the ring');
// The dot sits inside the ring's hole with a visible gap, and the mark stays inside the tile.
assert.ok(MARK.dot < MARK.ring.r - MARK.stroke / 2 - 2, 'dot clears the ring');
const h = MARK.stroke / 2;
const box = { left: MARK.streakX - h, right: MARK.ring.cx + MARK.ring.r + h, top: MARK.ring.cy - MARK.ring.r - h, bottom: MARK.turn.cy + MARK.turn.r + h };
assert.ok(box.left > 10 && box.right < 90 && box.top > 10 && box.bottom < 90, `mark inside the tile: ${JSON.stringify(box)}`);
// Optically centred within a unit.
assert.ok(Math.abs((box.left + box.right) / 2 - 50) <= 1 && Math.abs((box.top + box.bottom) / 2 - 50) <= 1, 'mark centred');

assert.match(markSvg(64), /^<svg[^>]+width="64"/);
assert.doesNotMatch(markSvg(64, { monochrome: true }), /#D3F27A|#CB6845/, 'monochrome uses white only');

console.log('Brand mark: <Logo /> and the icon/poster SVG share one geometry, continuous, centred, inside the tile');
