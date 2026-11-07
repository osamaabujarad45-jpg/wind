import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { cancelledEntraResult, ENTRA_SCOPES } from '../src/entra-result.ts';

assert.equal(cancelledEntraResult({ type: 'cancel' }), true);
assert.equal(cancelledEntraResult({ type: 'dismiss' }), true);
assert.equal(cancelledEntraResult({ type: 'error', error: { params: { error: 'access_denied' } } }), true);
assert.equal(cancelledEntraResult({ type: 'error', error: { params: { error: 'state_mismatch' } } }), false);
assert.equal(cancelledEntraResult({ type: 'locked' }), false);
assert.equal(cancelledEntraResult({ type: 'success' }), false);
assert.deepEqual(ENTRA_SCOPES, ['openid', 'profile', 'email']);
let prepared;
class AuthRequest { constructor(config) { prepared = config; } async makeAuthUrlAsync() {} }
const modules = {
  'expo-auth-session': { AuthRequest, Prompt: { Login: 'login' }, makeRedirectUri: () => 'wind://auth' },
  'expo-crypto': { randomUUID: () => 'default-nonce' }, 'expo-web-browser': { maybeCompleteAuthSession() {} },
  './entra-result': { cancelledEntraResult, ENTRA_SCOPES },
};
const source = ts.transpileModule(readFileSync(new URL('../src/entra-auth.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {}, require: name => modules[name], process: { env: {
  EXPO_PUBLIC_ENTRA_TENANT_ID: '11111111-2222-3333-4444-555555555555', EXPO_PUBLIC_ENTRA_TENANT_NAME: 'windtest', EXPO_PUBLIC_ENTRA_CLIENT_ID: 'synthetic',
} } };
runInNewContext(source, context);
await context.exports.prepareEntraRequest('server-issued-nonce');
assert.equal(prepared.prompt, 'login');
assert.equal(prepared.extraParams.max_age, '0');
assert.equal(prepared.extraParams.nonce, 'server-issued-nonce');
await context.exports.prepareEntraRequest();
assert.equal(prepared.prompt, undefined, 'ordinary sign-in is unchanged');
assert.equal(prepared.extraParams.nonce, 'default-nonce');
console.log('PASS Entra cancellation and state mismatch handling');
