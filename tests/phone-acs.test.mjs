// ACS SMS provider: HMAC-SHA256 signing and the shared acceptance contract,
// exercised against a stub transport (no network, no real Azure resource).
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';

Object.assign(process.env, { NODE_ENV: 'test', WIND_POSTGRES_TEST_SCHEMA: 'wp03_acs',
  WIND_POSTGRES_TEST_ONLY: '1', WIND_DATABASE_URL: 'postgres://127.0.0.1/wind-test' });
const { AcsCommunication } = await import('../server/domain/phone-provider.ts');

const key = Buffer.alloc(32, 7).toString('base64');
const config = { provider: 'acs', acsEndpoint: 'https://wind-acs.example.communication.azure.com',
  acsKey: key, acsSender: '+1555000100', sendTimeoutMs: 5000 };
const fixedNow = () => Date.parse('2026-10-28T10:00:00Z');

let calls = [];
const transportReturning = status => async (url, init) => {
  calls.push({ url, init });
  return { status, body: { cancel: async () => {} } };
};

const acs = new AcsCommunication(config, transportReturning(202), fixedNow);
const accepted = await acs.send('+970599000000', '123456', 'txn-1', async () => true);
assert.equal(accepted.state, 'accepted');
assert.equal(accepted.httpStatus, 202);
assert.equal(calls.length, 1);
const { url, init } = calls[0];
assert.equal(url, 'https://wind-acs.example.communication.azure.com/sms?api-version=2021-03-07');
const body = JSON.parse(init.body);
assert.deepEqual(body.to, ['+970599000000']);
assert.match(body.message, /123456/);
// Independently recompute the signature the server must have produced.
const contentHash = createHash('sha256').update(init.body, 'utf8').digest('base64');
assert.equal(init.headers['x-ms-content-sha256'], contentHash);
const stringToSign = `POST\n/sms?api-version=2021-03-07\n${init.headers['x-ms-date']};wind-acs.example.communication.azure.com;${contentHash}`;
const expected = createHmac('sha256', Buffer.from(key, 'base64')).update(stringToSign, 'utf8').digest('base64');
assert.equal(init.headers.Authorization, `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${expected}`);

calls = [];
const refused = new AcsCommunication(config, transportReturning(202), fixedNow);
assert.equal((await refused.send('+970599000000', '123456', 'txn-2', async () => false)).state, 'obsolete');
assert.equal(calls.length, 0); // a superseded challenge never reaches the provider

assert.equal((await new AcsCommunication(config, transportReturning(500), fixedNow)
  .send('+970599000000', '123456', 'txn-3', async () => true)).state, 'unknown');
assert.equal((await new AcsCommunication(config, transportReturning(400), fixedNow)
  .send('+970599000000', '123456', 'txn-4', async () => true)).state, 'failed');
assert.equal((await new AcsCommunication(config, async () => { throw new Error('down'); }, fixedNow)
  .send('+970599000000', '123456', 'txn-5', async () => true)).state, 'unknown');
console.log('phone-acs.test.mjs passed');
