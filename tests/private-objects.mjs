// WP12 private objects (PG + unit): coded-but-off Blob adapter with fake
// scanner/store in tests; custody is never changed by an upload.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { fixture } from './eligibility-support.mjs';
import { objectsConfig, PRIVATE_OBJECT_MAX_BYTES } from '../server/domain/private-objects.ts';

assert.deepEqual(objectsConfig({}), { testFake: false, blobConfigured: false }, 'no configuration means honestly off');
assert.equal(objectsConfig({ NODE_ENV: 'test', WIND_OBJECTS_TEST_ONLY: '1' }).testFake, true);
assert.equal(objectsConfig({ WIND_BLOB_ENABLED: '1', WIND_BLOB_CONNECTION_STRING: 'synthetic', WIND_BLOB_CONTAINER: 'synthetic' }).blobConfigured, true);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const payload = (bytes, over = {}) => ({ purpose: 'condition-photo', contentType: 'image/jpeg',
  sizeBytes: bytes.length, sha256: sha256(bytes), contentBase64: bytes.toString('base64'), ...over });

const f = await fixture('privobj', { WIND_OBJECTS_TEST_ONLY: '1' });
try {
  const order = await f.book();
  await f.call(`/jobs/${order.id}/accept`, { token: f.d1.token, body: {} });
  const goodBytes = Buffer.from('synthetic condition photo bytes');
  const foreign = await f.account();
  assert.equal((await f.call(`/orders/${order.id}/objects`, { token: foreign.token, body: payload(goodBytes), expect: 403 })).error, 'forbidden', 'a wrong account cannot upload');
  assert.equal((await f.call(`/orders/${order.id}/objects`, { token: f.d2.token, body: payload(goodBytes), expect: 403 })).error, 'forbidden', 'an unassigned driver cannot upload');
  await f.call('/orders/999999999/objects', { token: f.customer.token, body: payload(goodBytes), expect: 404 });
  assert.equal((await f.call(`/orders/${order.id}/objects`, { token: f.d1.token, body: payload(goodBytes, { purpose: 'driver-id-scan' }), expect: 400 })).error, 'invalid_input', 'driver ID scans are never collected');
  assert.equal((await f.call(`/orders/${order.id}/objects`, { token: f.d1.token, body: payload(goodBytes, { contentType: 'text/html' }), expect: 400 })).error, 'invalid_content_type');
  assert.equal((await f.call(`/orders/${order.id}/objects`, { token: f.d1.token, body: payload(goodBytes, { sizeBytes: goodBytes.length + 1 }), expect: 400 })).error, 'invalid_input');
  assert.equal((await f.call(`/orders/${order.id}/objects`, { token: f.d1.token, body: payload(goodBytes, { sizeBytes: PRIVATE_OBJECT_MAX_BYTES + 1 }), expect: 400 })).error, 'object_too_large');
  assert.equal((await f.call(`/orders/${order.id}/objects`, { token: f.d1.token, body: payload(goodBytes, { sha256: sha256(Buffer.from('other bytes')) }), expect: 400 })).error, 'checksum_mismatch');
  assert.equal((await f.call(`/orders/${order.id}/objects`, { token: f.d1.token, body: payload(goodBytes, { sha256: 'not-a-hash' }), expect: 400 })).error, 'invalid_checksum');
  const custodyBefore = Number((await f.db.one('SELECT count(*) n FROM custody_records WHERE order_id=?', order.id)).n);
  const uploaded = await f.call(`/orders/${order.id}/objects`, { token: f.d1.token, body: payload(goodBytes) });
  assert.equal(uploaded.scanState, 'clean', 'the fake scanner passes clean bytes from quarantine');
  assert.equal(uploaded.sha256, sha256(goodBytes));
  assert.equal(uploaded.retentionUntil - uploaded.createdAt, 90 * 86400000, 'purpose-based retention is recorded');
  assert.equal((await f.db.one('SELECT status FROM orders WHERE id=?', order.id)).status, 'assigned', 'an upload alone never changes custody or status');
  assert.equal(Number((await f.db.one('SELECT count(*) n FROM custody_records WHERE order_id=?', order.id)).n), custodyBefore, 'an upload writes no custody record');
  const rejected = await f.call(`/orders/${order.id}/objects`, { token: f.d1.token, body: payload(Buffer.from('MALICIOUS synthetic payload')) });
  assert.equal(rejected.scanState, 'rejected');
  assert.equal((await f.call(`/orders/${order.id}/objects/${rejected.id}/read`, { token: f.customer.token, body: {}, expect: 409 })).error, 'object_rejected', 'rejected objects are never readable');
  const listed = await f.call(`/orders/${order.id}/objects`, { token: f.customer.token });
  assert.equal(listed.length, 2);
  await f.call(`/orders/${order.id}/objects`, { token: foreign.token, expect: 403 });
  const grant = await f.call(`/orders/${order.id}/objects/${uploaded.id}/read`, { token: f.customer.token, body: {} });
  assert.ok(grant.token); assert.ok(grant.expiresAt > Date.now());
  const content = await f.call(`/orders/${order.id}/objects/${uploaded.id}/content?readToken=${grant.token}`, { token: f.customer.token });
  assert.equal(Buffer.from(content.contentBase64, 'base64').toString(), goodBytes.toString(), 'a participant reads the clean object back');
  assert.equal((await f.call(`/orders/${order.id}/objects/${uploaded.id}/content`, { token: f.customer.token, expect: 401 })).error, 'read_invalid', 'a guessed object id without a grant is denied');
  assert.equal((await f.call(`/orders/${order.id}/objects/${uploaded.id}/content?readToken=${grant.token}`, { token: f.d1.token, expect: 403 })).error, 'forbidden', 'a grant is bound to its subject');
  const adminGrant = await f.call(`/orders/${order.id}/objects/${uploaded.id}/read`, { token: f.admin.token, body: {} });
  assert.equal((await f.call(`/orders/${order.id}/objects/${uploaded.id}/content?readToken=${adminGrant.token}`, { token: f.admin.token })).sha256, sha256(goodBytes), 'a scoped admin reads through the same expiring grant');
  const driverGrant = await f.call(`/orders/${order.id}/objects/${uploaded.id}/read`, { token: f.d1.token, body: {} });
  await f.db.run('UPDATE private_object_reads SET expires_at=? WHERE token_hash=?', Date.now() - 1000, sha256(driverGrant.token));
  assert.equal((await f.call(`/orders/${order.id}/objects/${uploaded.id}/content?readToken=${driverGrant.token}`, { token: f.d1.token, expect: 401 })).error, 'read_expired', 'an expired grant is denied');
  console.log('WP12 private-objects: authorization matrix, checksum/scan states, expiring reads, custody invariant passed');
} finally { await f.close(); }

const g = await fixture('privoff');
try {
  const order = await g.book();
  await g.call(`/jobs/${order.id}/accept`, { token: g.d1.token, body: {} });
  const bytes = Buffer.from('synthetic bytes');
  assert.equal((await g.call(`/orders/${order.id}/objects`, { token: g.d1.token, body: payload(bytes), expect: 409 })).error, 'objects_unavailable', 'unconfigured upload is unavailable');
  assert.equal((await g.call(`/orders/${order.id}/objects`, { token: g.customer.token, expect: 409 })).error, 'objects_unavailable', 'unconfigured list is unavailable');
  assert.equal((await g.call(`/orders/${order.id}/objects/${randomUUID()}/read`, { token: g.customer.token, body: {}, expect: 409 })).error, 'objects_unavailable', 'unconfigured read grant is unavailable');
  assert.equal((await g.call(`/orders/${order.id}/objects/${randomUUID()}/content?readToken=synthetic`, { token: g.customer.token, expect: 409 })).error, 'objects_unavailable', 'unconfigured content is unavailable');
  console.log('WP12 private-objects: unconfigured backend returns objects_unavailable everywhere');
} finally { await g.close(); }
