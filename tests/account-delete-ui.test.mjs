import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url), copy = require('../src/copy.ts'), model = require('../src/model.ts');
const source = ts.transpileModule(readFileSync(new URL('../src/parts.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
const find = (node, type, property, value) => {
  if (!node || typeof node !== 'object') return;
  if (node.type === type && node.props[property] === value) return node.props;
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, type, property, value); if (found) return found; }
};
function account() {
  let revision = 1, cursor = 0, effects = [], calls = [], forgot = 0, resolveMicrosoft;
  const slots = [], same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(value) { const slot = slots[cursor++] ??= { value: typeof value === 'function' ? value() : value };
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!same(old?.deps, deps)) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const c = copy.copy.en, ui = Object.fromEntries(['Appear','Avatar','Badge','Button','Card','ErrorText','Field','FilterChips','Header','ListGroup','ListRow','Press','Row','Screen','Txt'].map(name => [name, name]));
  const modules = {
    react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { Platform: { OS: 'web' }, StyleSheet: { create: value => value }, View: 'View', Share: {} },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, 'expo-router': { router: {} }, './model': model, './booking': {}, './map-math': {}, './copy': copy,
    './api': { api: async (path, body) => { calls.push({ path, body }); return path === '/me/delete/challenge' ? { nonce: 'nonce' } : {}; }, apiSessionRevision: () => revision, errorCode: e => e.message },
    './push': { pushSupported: () => false }, './session': { useSession: () => ({ me: { user: { id: 1, role: 'customer', name: 'Test', phone: '0599000000' } }, forget: async () => { forgot++; }, signOut: async () => {}, language: 'en', setLanguage() {} }) },
    './entra-auth': { entraConfigured: true, prepareEntraRequest: async nonce => ({ nonce }), signInWithEntra: async () => new Promise(resolve => { resolveMicrosoft = resolve; }) },
    './ui': { ...ui, palette: {}, tones: {}, confirm: (_text, yes) => yes(), useCopy: () => ({ c, err: e => e.message }), haptic: { error() {} } },
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; } };
  runInNewContext(source, context);
  return { c, calls, render() { cursor = 0; effects = []; const tree = context.exports.AccountScreen(); effects.forEach(fn => fn()); return tree; },
    switchAccount() { revision++; }, resolveMicrosoft(value) { resolveMicrosoft(value); }, get forgot() { return forgot; } };
}
{
  const h = account();
  find(h.render(), 'ListRow', 'label', h.c.deleteAccount).onPress();
  let tree = h.render();
  assert.equal(h.calls.some(call => call.path === '/me/delete'), false, 'opening the form cannot delete');
  find(tree, 'Field', 'label', h.c.currentPassword).onChangeText('secret1');
  tree = h.render(); find(tree, 'Button', 'title', h.c.deleteAccount).onPress(); await flush();
  assert.equal(h.calls.find(call => call.path === '/me/delete').body.password, 'secret1');
  assert.equal(h.forgot, 1);
}
{
  const h = account();
  find(h.render(), 'ListRow', 'label', h.c.deleteAccount).onPress();
  h.render(); await flush(); await flush();
  const button = find(h.render(), 'Button', 'title', h.c.deleteMicrosoft);
  assert.ok(button, 'linked identity challenge prepares a Microsoft button');
  button.onPress();
  h.switchAccount(); h.resolveMicrosoft({ idToken: 'token', nonce: 'nonce' }); await flush();
  assert.equal(h.calls.some(call => call.path === '/me/delete'), false, 'late Microsoft result cannot delete a replacement account');
  assert.equal(h.forgot, 0);
}
console.log('Account deletion UI requires proof and fences a late Microsoft sign-in');
