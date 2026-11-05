import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url), model = require('../src/model.ts'), copy = require('../src/copy.ts');
let language = 'en', mustUpdate = false;
let session = { ready: true, offline: true, me: null, onboarded: true, refresh() {},
  offlineSummary: { actorId: 7, role: 'driver', savedAt: 1, orders: [{ id: 1, service: 'parcel', status: 'assigned', pickupCity: 'ramallah', dropoffCity: 'nablus' }] } };
const ui = { Button: 'Button', Card: 'Card', Empty: 'Empty', Txt: 'Txt', palette: {}, fill: copy.fill,
  useCopy: () => ({ c: copy.copy[language], language, rtl: language === 'ar' }) };
const modules = {
  react: { useSyncExternalStore: () => mustUpdate }, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  'react-native': { View: 'View', Platform: { OS: 'android' }, StyleSheet: { create: x => x, absoluteFill: {} } },
  'expo-router': { Stack: { Protected: 'Protected', Screen: 'Route' } }, 'expo-status-bar': {}, 'expo-splash-screen': { preventAutoHideAsync() {} },
  '../motion': {}, '../intro': {}, '../driver-work': {}, '../session': { useSession: () => session }, '../api': {}, '../api-client': {},
  '../model': model, '../parts': { useFormat: () => ({ time: () => 'saved-time' }) }, '../copy': copy, '../ui': ui,
};
const source = ts.transpileModule(readFileSync(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; } };
runInNewContext(source + '\nexports.TestRoutes = Routes; exports.TestOfflineOrders = OfflineOrders;', context);
function hasSummary(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === context.exports.TestOfflineOrders) return true;
  return [node.props?.children].flat(Infinity).some(hasSummary);
}
for (language of ['en', 'ar']) {
  session = { ...session, me: null };
  assert.equal(hasSummary(context.exports.TestRoutes()), true, 'an offline launch may show its saved read-only context');
  const text = JSON.stringify(context.exports.TestOfflineOrders({ summary: session.offlineSummary }));
  assert.ok(text.includes(copy.copy[language].offlineSavedWarning));
  session = { ...session, me: { user: { id: 8, role: 'driver', status: 'active' } } };
  assert.equal(hasSummary(context.exports.TestRoutes()), false, 'another actor cannot see a stale summary');
  session = { ...session, me: { user: { id: 7, role: 'driver', status: 'blocked' } } };
  assert.equal(hasSummary(context.exports.TestRoutes()), false, 'a blocked actor cannot see a stale summary');
}
mustUpdate = true;
assert.equal(hasSummary(context.exports.TestRoutes()), false, 'a required upgrade takes precedence over offline data');
console.log('Offline view warns about staleness and preserves actor and forced-update boundaries');
