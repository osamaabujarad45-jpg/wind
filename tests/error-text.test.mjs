// Fable SCOPE: the twelve PostgreSQL-only capabilities stay off in the SQLite pilot and answer 409 *_unavailable.
// The app must say they are not available here, never "something went wrong", and keep every specific message.
import assert from 'node:assert/strict';
import { copy, errorText } from '../src/copy.ts';

for (const language of ['ar', 'en']) {
  const c = copy[language];
  for (const code of ['ledger_unavailable', 'payments_unavailable', 'quotes_unavailable', 'objects_unavailable', 'native_push_unavailable', 'durable_protocol_unavailable'])
    assert.equal(errorText(language, code), c.err_feature_unavailable, `${language} ${code}`);
  assert.equal(errorText(language, 'service_unavailable'), c.err_service_unavailable, 'a specific message still wins');
  // Temporary outages and order-state conflicts that share the suffix keep their own message, never "not in this stage".
  for (const code of ['search_unavailable', 'maps_unavailable', 'cod_unavailable', 'receipt_unavailable', 'custody_unavailable', 'route_unavailable'])
    assert.ok(c[`err_${code}`] && errorText(language, code) === c[`err_${code}`], `${language} ${code}`);
  assert.equal(errorText(language, 'wrong_code'), c.err_wrong_code);
  assert.equal(errorText(language, 'server_error'), c.err_server_error ?? c.err_generic);
  assert.equal(errorText(language, 'no_such_code'), c.err_generic);
  assert.notEqual(c.err_feature_unavailable, c.err_generic);
}
console.log('Error text: switched-off capabilities read as unavailable, specific messages kept');
