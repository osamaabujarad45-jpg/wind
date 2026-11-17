import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { copy } = require('../src/copy.ts');
const flat = style => Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : style || {};
const days = (count, zero = false) => Array.from({ length: count }, (_, i) => ({
  date: `2026-11-${String(i + 1).padStart(2, '0')}`, commission: zero ? 0 : i + 1, subscriptions: zero ? 0 : i * 2,
}));
function harness(language, reduced) {
  const states = new Map();
  let active;
  let daily;
  const navigated = [];
  const c = copy[language];
  const money = value => `${value} ILS`;
  const uiNames = ['Appear', 'Badge', 'Card', 'ErrorText', 'Header', 'ListGroup', 'Loading', 'Press', 'Row', 'Screen', 'Stat', 'Txt'];
  const modules = {
    react: { useState(initial) {
      const slot = active.slots[active.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
    }, useEffect() {} }, // Render correctness cannot depend on a later effect.
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native': { Pressable: 'Pressable', View: 'View', StyleSheet: { create: value => value } },
    '../../motion': { __esModule: true, default: { View: 'Animated.View' }, cubicBezier: () => null, useReducedMotion: () => reduced },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-router': { router: { navigate: value => navigated.push(value) } },
    '../../api': { useApi: () => ({ data: { daily, profit: 10, commission: 20, subscriptions: 30, discounts: 0, gmv: 40,
      completed: 2, activeSubscriptions: 1, openIncidents: 1, pendingDrivers: 2, pendingSubscriptions: 3, statuses: {}, users: {} }, reload() {} }) },
    '../../parts': { PushRow: 'PushRow' }, '../../push': { pushSupported: () => false },
    '../../session': { useSession: () => ({ me: { user: { name: 'Admin' } } }) },
    '../../ui': { ...Object.fromEntries(uiNames.map(name => [name, name])), palette: { ink: '#000', muted: '#eee', onFill: '#fff', clayInk: '#123', line: '#ddd' },
      fill: (text, values) => text.replace('{name}', values.name), useCopy: () => ({ c, money, err: String, row: language === 'ar' ? 'row-reverse' : 'row', rtl: language === 'ar', language }) },
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules, `missing module ${name}`); return modules[name]; } };
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/admin/index.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  function evaluate(node) {
    if (Array.isArray(node)) return node.map(evaluate);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      const previous = active;
      active = states.get(node.type) ?? { slots: [], cursor: 0 };
      states.set(node.type, active); active.cursor = 0;
      const result = node.type(node.props);
      active = previous;
      return evaluate(result);
    }
    return { ...node, props: { ...node.props, children: evaluate(node.props?.children) } };
  }
  const render = value => { daily = value; return evaluate({ type: context.exports.default, props: {} }); };
  return { render, c, money, navigated };
}
function all(node, type, out = []) {
  if (Array.isArray(node)) { node.forEach(child => all(child, type, out)); return out; }
  if (!node || typeof node !== 'object') return out;
  if (node.type === type) out.push(node);
  all(node.props?.children, type, out); return out;
}
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node == null || node === false ? '' : String(node);
function dashboardIntact(tree, h) {
  assert.equal(all(tree, 'Header')[0].props.title, h.c.dashboard);
  assert.equal(all(tree, 'Stat').length, 7);
  const shortcuts = all(tree, 'Press');
  assert.equal(shortcuts.length, 3);
  shortcuts.forEach(item => item.props.onPress());
  assert.equal(h.navigated.length % 3, 0);
  assert.deepEqual(h.navigated.slice(-2), ['/admin/users', '/admin/subscriptions']);
  assert.equal(h.navigated.at(-3).pathname, '/admin/orders');
}
function populated(tree, h, daily, selected, reduced) {
  dashboardIntact(tree, h);
  const bars = all(tree, 'Pressable');
  assert.equal(bars.length, daily.length);
  const columns = bars.map(bar => all(bar, 'Animated.View')[0]);
  assert.equal(columns.filter(column => flat(column.props.style).opacity === 1).length, 1);
  assert.equal(flat(columns[selected].props.style).opacity, 1);
  columns.forEach(column => {
    const style = flat(column.props.style);
    assert.ok(Number.isFinite(Number.parseFloat(style.height)));
    assert.equal(!!style.animationName, !reduced);
  });
  const pick = daily[selected];
  const date = new Date(`${pick.date}T12:00:00`).toLocaleDateString(h.c === copy.ar ? 'ar-PS-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' });
  assert.ok(all(tree, 'Txt').some(item => text(item) === `${date} · ${h.c.commissionRevenue} ${h.money(pick.commission)} · ${h.c.subscriptionRevenue} ${h.money(pick.subscriptions)}`));
  return bars;
}
function empty(tree, h) {
  dashboardIntact(tree, h);
  assert.equal(all(tree, 'Pressable').length, 0);
  const card = all(tree, 'Card').find(item => all(item, 'Txt').some(label => text(label) === h.c.last14));
  assert.ok(card, 'chart retains its title');
  assert.equal(text(card), h.c.last14 + h.c.chartNoData);
  assert.equal(h.c.chartNoData, h.c === copy.ar ? 'لا توجد بيانات يومية للرسم' : 'No daily data to chart');
  assert.equal(all(card, 'View').length, 0, 'no empty interactive plot or axis');
}
let failures = 0;
for (const language of ['ar', 'en']) for (const reduced of [false, true]) {
  const cases = {
    'empty then one day': () => { const h = harness(language, reduced); empty(h.render([]), h); populated(h.render(days(1)), h, days(1), 0, reduced); },
    'last selection survives shrink before effects': () => { const h = harness(language, reduced); const data = days(14); populated(h.render(data), h, data, 13, reduced)[13].props.onPress(); populated(h.render(days(1)), h, days(1), 0, reduced); },
    'populated to empty to one day': () => { const h = harness(language, reduced); const data = days(14); populated(h.render(data), h, data, 13, reduced); empty(h.render([]), h); populated(h.render(days(1)), h, days(1), 0, reduced); },
    'earlier selection and zero-valued days': () => { const h = harness(language, reduced); const data = days(14); populated(h.render(data), h, data, 13, reduced)[2].props.onPress(); populated(h.render(data), h, data, 2, reduced); populated(h.render(days(1)), h, days(1), 0, reduced); const zeros = harness(language, reduced); populated(zeros.render(days(14, true)), zeros, days(14, true), 13, reduced); },
  };
  for (const [name, run] of Object.entries(cases)) {
    try { run(); console.log(`PASS ${language} reduced=${reduced}: ${name}`); }
    catch (error) { failures++; console.error(`FAIL ${language} reduced=${reduced}: ${name}: ${error.message}`); }
  }
}
assert.equal(failures, 0, `${failures} dashboard chart cases failed`);
