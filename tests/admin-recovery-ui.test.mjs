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
const other = { id: 8, role: 'customer', status: 'active', name: 'Other', phone: '0599000008' };
const verified = { id: 9, role: 'customer', status: 'active', name: 'Verified', phone: '0599000009', email: 'v@example.test', emailVerifiedAt: 1 };
let emailReady = false, resetFailure = null; const resets = [];
const ui = Object.fromEntries(['Appear','Badge','Button','Card','Choices','Empty','ErrorText','Field','FilterChips','Header','Loading','Row','Screen','Txt'].map(name => [name, name]));
const modules = {
  react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  '../../session': { useSession: () => ({ me: { user: { id: 1 }, capabilities: { emailVerification: emailReady } } }) }, 'react-native': { View: 'View', ScrollView: 'ScrollView' }, '../../model': model,
  '../../parts': { useFormat: () => ({ date: () => '', time: () => '' }) }, '../../phone/flow': { codeInput: raw => raw },
  '../../api': { ApiError, useApi: () => ({ data: [user, other, verified], reload: async () => {} }), api: async (path, body) => {
    if (path.endsWith('/password')) { if (resetFailure) throw resetFailure; resets.push({ path, body: JSON.parse(JSON.stringify(body)) }); return { password: 'temporary' }; }
    if (path.endsWith('/identity-code')) return { sent: true };
    if (path.endsWith('/identity-check')) return { at: 1, proof: '1.signature' };
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
assert.equal(confirmCount, 2, 'block asks first (one tap ends every session), then asks about the parcels'); assert.equal(calls.length, 2); assert.equal(calls[1].recovery, 'return');
assert.equal(find(render(), copy.copy.en.block).disabled, true, 'the recovery request remains busy until it completes');
await first.onPress(); assert.equal(calls.length, 2, 'a stale button callback cannot duplicate the mutation');
complete(); await flush();
assert.equal(find(render(), copy.copy.en.block).disabled, false);

// Password reset: the screen asks for what the server will demand, and a note belongs to one account.
const en = copy.copy.en;
const all = (node, type, key, value, found = []) => {
  if (!node || typeof node !== 'object') return found;
  if (node.type === type && node.props[key] === value) found.push(node.props);
  for (const child of [node.props?.children].flat(Infinity)) all(child, type, key, value, found);
  return found;
};
const edit = index => all(render(), 'Button', 'title', en.editUser)[index].onPress();
const note = () => all(render(), 'Field', 'label', en.resetAttestation)[0];
const reset = () => all(render(), 'Button', 'title', en.resetPassword)[0];
const written = 'Called the registered number back';
edit(1);
assert.equal(reset().disabled, true, 'no reset before the admin says what they checked');
note().onChangeText('too short');
assert.equal(reset().disabled, true);
note().onChangeText(written);
assert.equal(reset().disabled, false);
edit(0);
assert.equal(note().value, '', 'a note about one caller does not follow the admin to another account');
assert.equal(reset().disabled, true);
edit(1);
assert.equal(note().value, written, 'and is still there when they come back');
reset().onPress(); await flush();
assert.deepEqual(resets.at(-1), { path: '/admin/users/8/password', body: { attestation: written } });
emailReady = true;
edit(2);
assert.equal(note(), undefined, 'an account the app can email takes the code, not a note');
assert.equal(reset().disabled, true);
assert.equal(reset().reason, en.resetNeedsIdentity);
all(render(), 'Button', 'title', en.identitySend)[0].onPress(); await flush();
all(render(), 'Field', 'label', en.emailCodeLabel)[0].onChangeText('123456');
all(render(), 'Button', 'title', en.identityCheck)[0].onPress(); await flush();
assert.equal(reset().disabled, false, 'the check unlocks it');
reset().onPress(); await flush();
assert.deepEqual(resets.at(-1), { path: '/admin/users/9/password', body: { proof: '1.signature' } });
// On the phone the reset sits far below the list's error line: a refusal showed nothing where the admin was looking.
const scrolled = [];
render().props.scrollRef.current = { scrollTo: at => scrolled.push(at.y) };
edit(1); note().onChangeText(written);
resetFailure = new ApiError('attestation_required');
reset().onPress(); await flush();
assert.deepEqual(scrolled, [0], 'a refused reset brings the error into view');
assert.equal(all(render(), 'ErrorText', 'children', 'attestation_required').length, 1);
assert.equal(note().value, written, 'and the note is kept to correct');
console.log('Admin parcel recovery serializes the confirmation retry; the reset asks for a per-account note or the email check');
