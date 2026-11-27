import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isExplanation, measure, newFileBudget, overBudget, ratchet, scan } from '../scripts/design-check.mjs';

// What counts: a sentence, or eight words or more. Labels, values and actions do not.
assert.equal(isExplanation('Go online'), false);
assert.equal(isExplanation('Cash at the door'), false);
assert.equal(isExplanation('Choose a reason to decline.'), true);
assert.equal(isExplanation('Customers are asked to have the exact amount ready'), true);
const english = { hint: 'Pausing does not cancel orders you already accepted.', title: 'Orders', err_x: 'Something went wrong. Try again.' };
assert.deepEqual(measure('c.hint c.hint c.title c.err_x <Button reason={why} />', english), { explanations: 1, reasons: 1, keys: ['hint'] });

// A file over its budget fails; a new file gets one explanation and no reason lines.
assert.deepEqual(overBudget({ 'src/a.tsx': { explanations: 3, reasons: 0, keys: ['x', 'y', 'z'] } }, { 'src/a.tsx': { explanations: 2, reasons: 0 } })
  .map(o => [o.file, o.kind, o.now, o.allowed]), [['src/a.tsx', 'explanations', 3, 2]]);
assert.deepEqual(overBudget({ 'src/new.tsx': { ...newFileBudget, keys: [] } }, {}), []);
assert.equal(overBudget({ 'src/new.tsx': { explanations: 1, reasons: 1, keys: [] } }, {}).length, 1);

// The ratchet only goes down, and drops files that no longer carry any.
assert.deepEqual(ratchet({ 'src/a.tsx': { explanations: 5, reasons: 1 }, 'src/b.tsx': { explanations: 0, reasons: 0 } },
  { 'src/a.tsx': { explanations: 2, reasons: 4 }, 'src/b.tsx': { explanations: 3, reasons: 3 } }), { 'src/a.tsx': { explanations: 2, reasons: 1 } });

// The repository is within its committed budget.
const root = fileURLToPath(new URL('..', import.meta.url));
const budget = JSON.parse(readFileSync(new URL('../docs/design/text-budget.json', import.meta.url), 'utf8'));
assert.deepEqual(overBudget(await scan(root), budget).map(o => `${o.file}: ${o.now} ${o.kind} (budget ${o.allowed})`), [],
  'on-screen explanatory text grew: see .agents/skills/wind-design/SKILL.md §2');
console.log('design text budget ok');
