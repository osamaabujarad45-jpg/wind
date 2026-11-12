// B10: the declared freight fields must say what is wrong with each of them.
// The pilot shows one form-wide sentence (c.freightScopeInvalid) and leaves the Request button
// disabled, so a customer who typed three of the four dimensions cannot tell which one is missing.
// These checks drive the REAL component (src/freight-details.tsx) and the REAL scope rules
// (src/freight-scope.ts): the field feedback must reuse the scope's own numbers, never a second
// copy of them. On the pilot baseline the per-field checks FAIL (that is the reproduction);
// the scope checks pass, proving the harness drives the real code.
// Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning tests/booking-freight-fields.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as freight from '../src/freight-scope.ts';

const require = createRequire(import.meta.url);
const copy = require('../src/copy.ts').copy;

const formSource = readFileSync(new URL('../src/freight-details.tsx', import.meta.url), 'utf8');
const transpiled = ts.transpileModule(formSource,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;

const find = (node, type, property, value) => {
  if (!node || typeof node !== 'object') return;
  if (node.type === type && node.props[property] === value) return node.props;
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, type, property, value); if (found) return found; }
};

// The real component, rendered with a small React double: the draft lives in the parent, so the
// harness keeps it and hands a fresh copy to every render, exactly like book.tsx does.
function form(language = 'en') {
  const c = copy[language];
  let cursor = 0;
  const slots = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(value) { const slot = slots[cursor++] ??= { value: typeof value === 'function' ? value() : value };
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!same(old?.deps, deps)) { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; } },
  };
  const modules = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { View: 'View' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    './freight-scope': freight,
    './parts': { useFormat: () => ({ time: value => value }) },
    './ui': { ...Object.fromEntries(['Card', 'Field', 'Press', 'Row', 'Txt'].map(name => [name, name])),
      fill: template => template, ErrorText: 'ErrorText', palette: { olive: '#34765A' }, useCopy: () => ({ c }) },
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules, 'unexpected import: ' + name); return modules[name]; } };
  runInNewContext(transpiled, context);
  const state = { draft: freight.emptyFreightDraft() };
  const render = () => { cursor = 0; return context.exports.FreightScopeForm({ draft: state.draft, onChange: next => { state.draft = next; }, disabled: false,
    invalid: freight.freightScope(state.draft, Date.now(), 2) === null }); };
  const field = label => find(render(), 'Field', 'label', label);
  return { c, render, field, type: (label, text) => { field(label).onChangeText(text); }, blur: label => { field(label).onBlur(); } };
}

const failures = [];
async function check(name, fn) {
  try { await fn(); console.log('ok    ' + name); }
  catch (e) { failures.push(name); console.log('FAIL  ' + name + ' :: ' + (e && e.message ? e.message : e)); }
}

const labels = c => [c.freightPieces, c.freightLength, c.freightWidth, c.freightHeight, c.freightMass, c.freightCrew, c.freightValue];

// ---------- the form ----------
await check('an untouched form says nothing: no field is blamed before the user touches it', () => {
  const h = form(), tree = h.render();
  for (const label of labels(h.c)) assert.equal(find(tree, 'Field', 'label', label).error, undefined, `${label}: an untouched field has no error`);
});

await check('a wrong value stays quiet while typing, then is reported on its own field on blur', () => {
  const h = form();
  h.type(h.c.freightLength, 'abc');
  assert.equal(h.field(h.c.freightLength).error, undefined, 'typing is not a completed edit');
  h.blur(h.c.freightLength);
  const tree = h.render();
  assert.equal(find(tree, 'Field', 'label', h.c.freightLength).error, h.c.freightDimensionInvalid, 'the length field carries its numeric constraint');
  assert.equal(find(tree, 'Field', 'label', h.c.freightMass).error, undefined, 'an untouched field stays quiet');
});

await check('an emptied required field is required', () => {
  const h = form();
  h.type(h.c.freightPieces, '');
  h.blur(h.c.freightPieces);
  assert.equal(find(h.render(), 'Field', 'label', h.c.freightPieces).error, h.c.fieldRequired, 'a cleared piece count is required');
});

await check('a good value clears the complaint', () => {
  const h = form();
  h.type(h.c.freightLength, 'abc');
  h.blur(h.c.freightLength);
  h.type(h.c.freightLength, '120');
  assert.equal(find(h.render(), 'Field', 'label', h.c.freightLength).error, undefined, 'a valid length has no error');
});

await check('the declared value stays optional', () => {
  const h = form();
  assert.equal(find(h.render(), 'Field', 'label', h.c.freightValue).error, undefined, 'the optional value field is quiet when empty');
  h.type(h.c.freightValue, '');
  assert.equal(find(h.render(), 'Field', 'label', h.c.freightValue).error, undefined, 'the optional value field stays optional when cleared');
  h.type(h.c.freightValue, 'x');
  h.blur(h.c.freightValue);
  assert.equal(find(h.render(), 'Field', 'label', h.c.freightValue).error, h.c.freightValueInvalid, 'a wrong declared value is reported');
});

await check('Arabic-Indic digits are a valid value and a half-typed decimal is not a mistake yet', () => {
  const h = form();
  h.type(h.c.freightPieces, '٣');
  assert.equal(find(h.render(), 'Field', 'label', h.c.freightPieces).error, undefined, 'Arabic-Indic digits are a valid piece count');
  h.type(h.c.freightLength, '1.');
  assert.equal(find(h.render(), 'Field', 'label', h.c.freightLength).error, undefined, 'a half-typed decimal is still being written');
  h.blur(h.c.freightLength);
  assert.equal(h.field(h.c.freightLength).error, h.c.freightDimensionInvalid, 'an unfinished decimal is invalid after blur');
  h.type(h.c.freightLength, '١٫');
  assert.equal(h.field(h.c.freightLength).error, undefined, 'Arabic decimals also stay quiet while typing');
  h.blur(h.c.freightLength);
  assert.equal(h.field(h.c.freightLength).error, h.c.freightDimensionInvalid);
});

await check('the Arabic copy is used for the same verdicts', () => {
  const h = form('ar');
  h.type(h.c.freightMass, 'x');
  h.blur(h.c.freightMass);
  assert.equal(find(h.render(), 'Field', 'label', h.c.freightMass).error, h.c.freightMassInvalid, 'the Arabic form reports the Arabic sentence');
  h.type(h.c.freightMass, '');
  h.blur(h.c.freightMass);
  assert.equal(find(h.render(), 'Field', 'label', h.c.freightMass).error, h.c.fieldRequired, 'the Arabic form asks for the field in Arabic');
});

await check('valid individual fields explain aggregate volume rejection beside the freight fields', () => {
  const h = form();
  for (const [label, value] of [[h.c.freightPieces, '200'], [h.c.freightLength, '300'], [h.c.freightWidth, '300'],
    [h.c.freightHeight, '200'], [h.c.freightMass, '250'], [h.c.freightCrew, '2']]) h.type(label, value);
  assert.ok(find(h.render(), 'ErrorText', 'children', h.c.freightScopeTooLarge), 'aggregate feedback belongs beside the fields');
  h.type(h.c.freightPieces, '2');
  assert.equal(find(h.render(), 'ErrorText', 'children', h.c.freightScopeTooLarge), undefined, 'valid volume clears aggregate feedback');
});

await check('the house Field forwards blur without losing its focus cleanup', () => {
  const ui = readFileSync(new URL('../src/ui.tsx', import.meta.url), 'utf8');
  const callback = ui.match(/onBlur=\{(\(\) => \{[^\n]+\})\}/)?.[1];
  assert.ok(callback, 'Field composes its internal and caller blur callbacks');
  let focused = true, calls = 0;
  const run = onBlur => runInNewContext(`(${callback})()`, { onBlur, setFocused: value => { focused = value; } });
  run(() => { calls++; });
  assert.equal(focused, false); assert.equal(calls, 1);
  run(undefined);
  assert.equal(focused, false); assert.equal(calls, 1);
});

// ---------- the rules, in one place ----------
await check('the scope exposes the per-field verdict the form uses', () => {
  assert.equal(typeof freight.freightFieldProblem, 'function', 'freight-scope exposes freightFieldProblem');
  const draft = freight.emptyFreightDraft();
  assert.equal(freight.freightFieldProblem(draft, 'lengthCm'), 'required', 'a blank dimension is required');
  assert.equal(freight.freightFieldProblem(draft, 'value'), null, 'the declared value is optional');
  assert.equal(freight.freightFieldProblem({ ...draft, pieces: '0' }, 'pieces'), 'invalid', 'zero pieces is not a piece count');
  assert.equal(freight.freightFieldProblem({ ...draft, pieces: '201' }, 'pieces'), 'invalid', 'more than two hundred pieces is rejected');
  assert.equal(freight.freightFieldProblem({ ...draft, crew: '21' }, 'crew'), 'invalid', 'more than twenty crew seats is rejected');
  assert.equal(freight.freightFieldProblem({ ...draft, massKg: '1.234' }, 'massKg'), null, 'a kilogram keeps three decimals');
  assert.equal(freight.freightFieldProblem({ ...draft, massKg: '1.2345' }, 'massKg'), 'invalid', 'a kilogram does not keep four decimals');
  assert.equal(freight.freightFieldProblem({ ...draft, lengthCm: '١٫٥' }, 'lengthCm'), null, 'Arabic digits and the Arabic decimal separator are a valid length');
});

await check('the form never re-checks the numbers itself', () => {
  assert.ok(formSource.includes('freightFieldProblem'), 'the form asks the scope for the field verdict');
  for (const banned of ['parseFloat', 'parseInt', 'Number(', 'replace(', '\\d'])
    assert.ok(!formSource.includes(banned), `the form must not duplicate the numeric rules (${banned})`);
});

// ---------- the scope keeps its constraints ----------
const complete = { pieces: '2', lengthCm: '100', widthCm: '50', heightCm: '40', massKg: '250', crew: '2', value: '', equipment: [] };

await check('a complete declaration still builds a scope, and the optional value stays out of it', () => {
  const scope = freight.freightScope(complete, Date.now(), 2);
  assert.ok(scope, 'a complete declaration builds a scope');
  assert.equal(scope.declaredValueMinor, undefined, 'an empty declared value stays out of the scope');
  assert.equal(freight.freightScope({ ...complete, value: '120.50' }, Date.now(), 2).declaredValueMinor, 12050, 'a declared value keeps its cents');
});

await check('the numbers stay integers in the scope units', () => {
  const scope = freight.freightScope({ ...complete, lengthCm: '1.5', massKg: '0.001' }, Date.now(), 2);
  assert.equal(scope.lengthMm, 15, 'a centimetre with one decimal becomes millimetres');
  assert.equal(scope.massGrams, 1, 'a kilogram with three decimals becomes grams');
});

await check('a missing or wrong field still rejects the whole scope', () => {
  assert.equal(freight.freightScope({ ...complete, lengthCm: '' }, Date.now(), 2), null, 'a missing dimension rejects the scope');
  assert.equal(freight.freightScope({ ...complete, massKg: 'abc' }, Date.now(), 2), null, 'a wrong weight rejects the scope');
  assert.equal(freight.freightScope({ ...complete, pieces: '0' }, Date.now(), 2), null, 'zero pieces rejects the scope');
});

await check('the aggregate volume is still rejected', () => {
  assert.equal(freight.freightScope({ ...complete, pieces: '200', lengthCm: '300', widthCm: '300', heightCm: '200' }, Date.now(), 2), null,
    'two hundred big pieces exceed the allowed volume');
  assert.ok(freight.freightScope({ ...complete, pieces: '2', lengthCm: '300', widthCm: '300', heightCm: '200' }, Date.now(), 2), 'the same size in two pieces fits');
});

await check('the loading window shown is the window declared and priced', async () => {
  // Review 8 Nov: the caption read slotBucket.at while the declared scope started at max(slotBucket.at, quotedAt).
  const book = readFileSync(new URL('../src/app/book.tsx', import.meta.url), 'utf8');
  assert.match(book, /freightScope\(freight, windowStart, loadingHours\)/, 'the declared scope starts at windowStart');
  assert.match(book, /from: time\(windowStart\), to: time\(windowStart \+ loadingHours/, 'the caption shows the same start');
});

if (failures.length) {
  console.error(`\n${failures.length} freight field check(s) FAIL on this checkout:`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nBooking freight field checks all passed');
