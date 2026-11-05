import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url), model = require('../src/model.ts'), copy = require('../src/copy.ts');
const slots = []; let cursor = 0, calls = [], confirmCount = 0, complete;
const react = {
  useRef(value) { return slots[cursor++] ??= { current: value }; },
  useState(value) { const slot = slots[cursor++] ??= { value: typeof value === 'function' ? value() : value };
    return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; },
};
class ApiError extends Error {}
const user = { id: 7, role: 'driver', status: 'active', name: 'Driver', vehicle: 'car', permanentlyApprovedAt: Date.now() };
const ui = Object.fromEntries(['Appear','Badge','Button','Card','Choices','Empty','ErrorText','Field','FilterChips','Header','Loading','Row','Screen','Txt'].map(name => [name, name]));
const modules = {
  react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  '../../session': { useSession: () => ({ me: { user: { id: 1 } } }) }, 'react-native': { View: 'View' }, '../../model': model,
  '../../parts': { useFormat: () => ({ date: () => '', time: () => '' }) },
  '../../api': { ApiError, useApi: () => ({ data: [user], reload: async () => {} }), api: async (_path, body) => {
    calls.push(body); if (calls.length === 1) throw new ApiError('carrying_parcels'); await new Promise(resolve => { complete = resolve; });
  } },
  '../../ui': { ...ui, fill: copy.fill, useCopy: () => ({ c: copy.copy.en, err: e => e.message }), palette: {}, tones: { active: {} },
    haptic: { success() {}, error() {} }, confirm: (_message, yes) => { confirmCount++; yes(); } },
};
const source = ts.transpileModule(readFileSync(new URL('../src/app/admin/users.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; } };
runInNewContext(source, context);
const render = () => { cursor = 0; return context.exports.default(); };
function find(node, title) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'Button' && node.props.title === title) return node.props;
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, title); if (found) return found; }
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const first = find(render(), copy.copy.en.block);
await first.onPress(); await flush();
assert.equal(confirmCount, 1); assert.equal(calls.length, 2); assert.equal(calls[1].recovery, 'return');
assert.equal(find(render(), copy.copy.en.block).disabled, true, 'the recovery request remains busy until it completes');
await first.onPress(); assert.equal(calls.length, 2, 'a stale button callback cannot duplicate the mutation');
complete(); await flush();
assert.equal(find(render(), copy.copy.en.block).disabled, false);
console.log('Admin parcel recovery serializes the confirmation retry');
