// Local-fallback validation and source contracts; scripts/screens.mjs supplies the browser interaction evidence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = path => readFileSync(join(root, path), 'utf8');
const modules = new Map();
let linkingOpen = async () => {};
function loadTs(path) {
  if (modules.has(path)) return modules.get(path);
  const code = ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: path }).outputText;
  const module = { exports: {} };
  const localRequire = id => {
    if (id === './model') return loadTs('src/model.ts');
    if (id === 'react-native') return { Linking: { openURL: url => linkingOpen(url) } };
    throw new Error(`Unexpected dependency ${id} from ${path}`);
  };
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  modules.set(path, module.exports);
  return module.exports;
}
async function check(name, run) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}\n${error.stack}`); process.exitCode = 1; }
}

const { authProblem } = loadTs('src/auth-validation.ts');
const valid = { name: 'Osama', email: 'osama@example.com', phone: '0599000000', password: 'correct horse battery', consent: true, role: 'customer', vehicle: 'car', plate: '' };

await check('Password auth validation identifies the first invalid field', () => {
  assert.deepEqual(authProblem({ ...valid, mode: 'in', phone: '', password: '' }), { field: 'phone', code: 'invalid_input' });
  assert.deepEqual(authProblem({ ...valid, mode: 'in', password: '' }), { field: 'password', code: 'invalid_input' });
  assert.equal(authProblem({ ...valid, mode: 'in' }), null);
  assert.deepEqual(authProblem({ ...valid, mode: 'up', name: '' }), { field: 'name', code: 'invalid_input' });
  assert.deepEqual(authProblem({ ...valid, mode: 'up', email: 'bad' }), { field: 'email', code: 'invalid_email' });
  assert.deepEqual(authProblem({ ...valid, mode: 'up', phone: 'bad' }), { field: 'phone', code: 'invalid_phone' });
  assert.deepEqual(authProblem({ ...valid, mode: 'up', password: 'short' }), { field: 'password', code: 'weak_password' });
  assert.deepEqual(authProblem({ ...valid, mode: 'up', consent: false }), { field: 'consent', code: 'consent_required' });
  assert.equal(authProblem({ ...valid, mode: 'up' }), null);
});

await check('Vehicle and external-auth validation preserve their real requirements', () => {
  assert.deepEqual(authProblem({ ...valid, mode: 'up', role: 'driver', plate: '' }), { field: 'plate', code: 'invalid_plate' });
  assert.equal(authProblem({ ...valid, mode: 'up', role: 'driver', vehicle: 'bicycle', plate: '' }), null);
  assert.equal(authProblem({ ...valid, mode: 'up', role: 'driver', plate: '1234' }), null);
  assert.equal(authProblem({ ...valid, mode: 'up', password: '', consent: true }, true), null);
  assert.equal(authProblem({ ...valid, mode: 'in', phone: '', password: '' }, true), null);
  assert.deepEqual(authProblem({ ...valid, mode: 'up', password: '', consent: false }, true), { field: 'consent', code: 'consent_required' });
});

await check('External handoffs report both resolution and rejection to the caller', async () => {
  const { openExternal } = loadTs('src/external-link.ts');
  let opened = '';
  linkingOpen = async url => { opened = url; };
  assert.equal(await openExternal('https://example.com/privacy'), true);
  assert.equal(opened, 'https://example.com/privacy');
  linkingOpen = async () => { throw new Error('No handler'); };
  assert.equal(await openExternal('https://example.com/privacy'), false, 'rejection becomes a handled false result');
});

await check('Welcome controls are real 48dp targets with radio semantics', () => {
  const text = source('src/app/welcome.tsx');
  assert.match(text, /pill:\s*\{[^}]*minHeight:\s*48/);
  assert.match(text, /slideKey:\s*\{\s*width:\s*48,\s*height:\s*48/);
  assert.match(text, /accessibilityRole="radiogroup"/);
  assert.match(text, /accessibilityState=\{\{\s*checked:\s*i === index\s*\}\}/);
  assert.match(text, /tabIndex=\{i === index \? 0 : -1\}/);
  assert.match(text, /onKeyDown=\{Platform\.OS === 'web' \? slideKey : undefined\}/);
  assert.match(text, /slideRefs\.current\[wrapped\]\?\.focus\(\)/);
  assert.match(text, /nativeID="welcome-slide-copy"[^\n]*accessibilityLiveRegion="polite" aria-live="polite"/);
});

await check('Auth attaches validation, focuses inputs, and exposes consent as a busy-aware checkbox', () => {
  const text = source('src/app/auth.tsx');
  for (const ref of ['nameRef', 'emailRef', 'phoneRef', 'passwordRef', 'plateRef', 'codeRef']) assert.match(text, new RegExp(`inputRef=\\{${ref}\\}`));
  assert.match(text, /accessibilityRole="checkbox"/);
  assert.match(text, /accessibilityState=\{\{\s*checked:\s*consent,\s*disabled:\s*busy\s*\}\}/);
  assert.match(text, /<ErrorText nativeID="auth-consent-error">\{fieldErrors\.consent\}<\/ErrorText>/);
  assert.match(text, /accessibilityHint=\{fieldErrors\.consent\}/);
  assert.match(text, /describedBy=\{fieldErrors\.consent \? 'auth-consent-error' : undefined\}/);
  assert.match(text, /refs\[problem\.field\]\?\.current\?\.focus\(\)/);
  assert.match(text, /mode === 'reset' && resetSent\) codeRef\.current\?\.focus\(\)/);
  assert.match(text, /if \(resetSent\) \{ setCode\(''\); setPassword\(''\); setError\(''\); \}/);
  assert.match(text, /await openExternal\(url\)/);
  assert.match(text, /setError\(c\.linkUnavailable\)/);
  const parts = source('src/parts.tsx');
  assert.match(parts, /link:\s*\{[^}]*minHeight:\s*48[^}]*minWidth:\s*48/);
});

await check('Home service entry, target sizes, retry, and text reflow are explicit', () => {
  const text = source('src/app/(customer)/index.tsx');
  assert.match(text, /useState<'to' \| 'later' \| null>/);
  assert.match(text, /c\.chooseService/);
  assert.match(text, /!!error && !!data/);
  assert.doesNotMatch(text, /numberOfLines=/);
  assert.match(text, /searchMain:\s*\{[^}]*minHeight:\s*48/);
  assert.match(text, /now:\s*\{[^}]*minHeight:\s*48/);
  assert.match(text, /accessibilityLabel=\{c\[service\]\} containerStyle=\{\{ flex: 1 \}\}/);
  assert.match(text, /loading=\{retrying\} onPress=\{retry\}/);
  assert.match(text, /enabledServices\.length \? <Row/);
  assert.match(text, /title=\{c\.servicesUnavailable\}/);
  assert.match(text, /active\.length === 1 \? c\.activeOrder : c\.activeOrders/);
  assert.match(text, /accessibilityLabel=\{`\$\{c\.requestAgain\}: \$\{c\[o\.service\]\}/);
  assert.match(text, /disabled=\{!enabledServices\.includes\(o\.service\)\}/);
  assert.match(text, /const activeEntry = enabledServices\.length \? entry : null/);
});

await check('Orders retain stale data with a visible retry and uncapped row text', () => {
  const orders = source('src/app/(customer)/orders.tsx');
  assert.match(orders, /!!error && !!data/);
  assert.match(orders, /loading=\{retrying\} onPress=\{retry\}/);
  assert.match(orders, /enabledServices\.length \? services\.filter/);
  assert.match(orders, /pathname: '\/book', params: \{ service \}/);
  const parts = source('src/parts.tsx');
  const row = parts.slice(parts.indexOf('export function OrderRow'), parts.indexOf('// Web Push'));
  assert.doesNotMatch(row, /numberOfLines=/);
  assert.match(row, /flexWrap:\s*'wrap'/);
  assert.match(row, /maxWidth:\s*'100%'/);
  assert.match(row, /variant="micro" style=\{\{ flexShrink: 1 \}\}/);
});

if (!process.exitCode) console.log('Launch/customer validation and UI contracts passed');
