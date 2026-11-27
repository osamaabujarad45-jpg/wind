import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catalogue, catalogueOver, isExplanation, measure, newFileBudget, overBudget, ratchet, scan } from '../scripts/design-check.mjs';

// What counts: a sentence, or eight words or more. Labels, values and actions do not.
assert.equal(isExplanation('Go online'), false);
assert.equal(isExplanation('Cash at the door'), false);
assert.equal(isExplanation('Choose a reason to decline.'), true);
assert.equal(isExplanation('Customers are asked to have the exact amount ready'), true);
const english = { hint: 'Pausing does not cancel orders you already accepted.', title: 'Orders', err_x: 'Something went wrong. Try again.' };
const arabic = { hint: 'الإيقاف لا يلغي الطلبات', title: 'الطلبات', err_x: 'حدث خطأ' };
assert.deepEqual(measure('c.hint c.hint c.title c.err_x <Button reason={why} />', english, arabic), { explanations: 1, words: 12, reasons: 1, keys: ['hint'] });

// The catalogue total holds what the per-file count cannot: errors, computed keys and push texts.
const before = catalogue(english, arabic, "const w = { en: 'Your order is on its way', ar: 'طلبك في الطريق' };");
assert.deepEqual(before, { copyWords: 12 + 7, pushWords: 6 + 3, workerWords: 0 });
const longer = catalogue({ ...english, err_x: `${english.err_x} Then call support and wait.` }, arabic, "en: 'Your order is on its way now'");
assert.equal(catalogueOver(longer, before).map(o => o.kind).join(), 'copyWords', 'a longer error fails, even though no file references it');

// Either language counts: a short English title whose Arabic grows long is text on screen.
const scope = { en: { scope: 'Declared load details' }, ar: { scope: 'تفاصيل الحمولة المصرح بها' } };
const wordy = { scope: `${scope.ar.scope} يجب كتابة كل قطعة ووزنها قبل تأكيد الطلب` };
assert.deepEqual(catalogueOver(catalogue(scope.en, wordy, ''), catalogue(scope.en, scope.ar, '')).map(o => o.kind), ['copyWords']);
assert.deepEqual(measure('c.scope', scope.en, wordy).keys, ['scope']);
// The web worker's own notification words are counted too, whatever their keys are.
assert.equal(catalogue({}, {}, '', "const x = 1;\nconst words = {\n  en: { title: 'Wind', job: 'A new job' },\n};\nconst y = 'not counted';").workerWords, 4);

// A file over its budget fails, including a longer sentence under the same key; a new file gets one explanation.
const held = { 'src/a.tsx': { explanations: 2, words: 20, reasons: 0 } };
assert.deepEqual(overBudget({ 'src/a.tsx': { explanations: 3, words: 20, reasons: 0, keys: ['x'] } }, held).map(o => [o.kind, o.now, o.allowed]), [['explanations', 3, 2]]);
assert.deepEqual(overBudget({ 'src/a.tsx': { explanations: 2, words: 31, reasons: 0, keys: ['x'] } }, held).map(o => o.kind), ['words']);
assert.deepEqual(overBudget({ 'src/new.tsx': { ...newFileBudget, keys: [] } }, {}), []);
assert.equal(overBudget({ 'src/new.tsx': { explanations: 1, words: 10, reasons: 1, keys: [] } }, {}).length, 1);

// The ratchet only goes down, and drops files that no longer carry any.
assert.deepEqual(ratchet({ 'src/a.tsx': { explanations: 5, words: 9, reasons: 1 }, 'src/b.tsx': { explanations: 0, words: 0, reasons: 0 } },
  { 'src/a.tsx': { explanations: 2, words: 30, reasons: 4 }, 'src/b.tsx': { explanations: 3, words: 9, reasons: 3 } }),
{ 'src/a.tsx': { explanations: 2, words: 9, reasons: 1 } });

// The catalogue is walked by the English keys, so both languages must define the same ones.
const { copy } = await import('../src/copy.ts');
assert.deepEqual(Object.keys(copy.ar).sort(), Object.keys(copy.en).sort(), 'an Arabic-only key would escape the count');

// The repository is within its committed budget.
const root = fileURLToPath(new URL('..', import.meta.url));
const budget = JSON.parse(readFileSync(new URL('../docs/design/text-budget.json', import.meta.url), 'utf8'));
const now = await scan(root);
assert.deepEqual([...overBudget(now.files, budget.files), ...catalogueOver(now.catalogue, budget.catalogue)].map(o => `${o.file}: ${o.now} ${o.kind} (budget ${o.allowed})`), [],
  'on-screen text grew: see .agents/skills/wind-design/SKILL.md §2');
assert.ok(now.catalogue.pushWords > 0 && now.catalogue.workerWords > 0, 'push texts are being read');
console.log('design text budget ok');
