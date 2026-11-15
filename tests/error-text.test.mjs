// Fable SCOPE: the ten capabilities switched off in this deployment (PostgreSQL-only or env-gated) answer 409 *_unavailable.
// The app must say they are not available here, never "something went wrong", and keep every specific message.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copy, errorText } from '../src/copy.ts';

const stageGates = ['ledger_unavailable', 'payments_unavailable', 'quotes_unavailable', 'objects_unavailable', 'native_push_unavailable',
  'durable_protocol_unavailable', 'ops_unavailable', 'ride_lifecycle_unavailable', 'opencode_unavailable', 'active_gps_unavailable'];
// Every *_unavailable code the server can send either has its own words or is a known stage gate, so a new outage code
// without copy cannot silently read as "not available in this stage".
const serverDir = fileURLToPath(new URL('../server/', import.meta.url));
const files = readdirSync(serverDir, { recursive: true }).filter(name => String(name).endsWith('.ts'));
const codes = new Set(files.flatMap(name => [...readFileSync(join(serverDir, String(name)), 'utf8')
  .matchAll(/'([a-z_]+_unavailable)'/g)].map(match => match[1])));
assert.ok(codes.size > 20, 'the scan found the server codes');
for (const code of codes) assert.ok(stageGates.includes(code) || (copy.ar[`err_${code}`] && copy.en[`err_${code}`]), `${code}: add ar/en copy or list it as a stage gate`);


for (const language of ['ar', 'en']) {
  const c = copy[language];
  for (const code of stageGates)
    assert.equal(errorText(language, code), c.err_feature_unavailable, `${language} ${code}`);
  assert.equal(errorText(language, 'service_unavailable'), c.err_service_unavailable, 'a specific message still wins');
  // Temporary outages and order-state conflicts that share the suffix keep their own message, never "not in this stage".
  for (const code of ['search_unavailable', 'maps_unavailable', 'cod_unavailable', 'receipt_unavailable', 'custody_unavailable', 'route_unavailable'])
    assert.ok(c[`err_${code}`] && errorText(language, code) === c[`err_${code}`], `${language} ${code}`);
  assert.equal(errorText(language, 'wrong_code'), c.err_wrong_code);
  assert.equal(errorText(language, 'server_error'), c.err_generic);
  assert.equal(errorText(language, 'object_missing'), c.err_object_missing);
  for (const code of ['constructor', '__proto__', 'toString', '']) assert.equal(errorText(language, code), c.err_generic, code);
  assert.equal(errorText(language, 'no_such_code'), c.err_generic);
  assert.notEqual(c.err_feature_unavailable, c.err_generic);
}
console.log('Error text: switched-off capabilities read as unavailable, specific messages kept');
