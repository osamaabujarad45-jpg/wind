import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readOrder, readDriverReceipt, readPriceQuote } from '../src/wire-contracts.ts';
import { configureApi, request, ApiError } from '../src/api-client.ts';
const order = { id: 1, customerId: 2, driverId: null, service: 'parcel', status: 'searching', pickupCity: 'ramallah', dropoffCity: 'nablus',
  price: 20, createdAt: 1, updatedAt: 1, pickupNote: '', dropoffNote: '' };
assert.deepEqual(readOrder({ ...order, futureAdditiveField: true }).futureAdditiveField, true);
for (const changes of [{ status: 'teleported' },{ price: NaN },{ driverId: -1 },{ pickupCity: 'unknown' },{ recovery: { schemaVersion: 2, version: 1, assignmentEpoch: 0 } },
  { ride: { arrivedAt: null, graceUntil: null, boardingRequired: true, boardingLocked: false, boardingCode: 'private-text' } }]) assert.throws(() => readOrder({ ...order, ...changes }), /invalid_response/);
assert.throws(() => readOrder({ ...order, dispatch: { roundId: randomUUID(), state: 'unknown', deadlineAt: 1 } }));
assert.equal(readOrder({ ...order, dispatch: { roundId: randomUUID(), state: 'matched', deadlineAt: 1 } }).dispatch.state, 'matched', 'the actual server matched state stays valid after acceptance');
assert.equal(readDriverReceipt({ schemaVersion: 1, orderId: 1, requestId: randomUUID(), state: 'unknown' }).state, 'unknown');
assert.throws(() => readDriverReceipt({ schemaVersion: 1, orderId: 1, requestId: randomUUID(), state: 'rejected' }));
const quote = { price: 20, km: 1, minutes: 5, delayMinutes: 0, estimated: true, slow: [], closed: [], avoids: [] };
assert.equal(readPriceQuote(quote).price, 20);
assert.throws(() => readPriceQuote({ ...quote, quoteId: randomUUID(), currency: 'USD', quoteExpiresAt: 1, priceMinor: 2000, commissionMinor: 300 }));
assert.throws(() => readPriceQuote({ ...quote, quoteId: randomUUID(), currency: 'ILS', quoteExpiresAt: 1, priceMinor: 2**54, commissionMinor: 300 }));
const oldFetch = globalThis.fetch;
try {
  configureApi('synthetic', () => {});
  globalThis.fetch = async () => new Response(JSON.stringify({ ...order, status: 'unknown' }));
  await assert.rejects(request('https://fixture.invalid/api/orders/1'), e => e instanceof ApiError && e.status === 502 && e.message === 'invalid_response');
  globalThis.fetch = async () => new Response(JSON.stringify(order));
  assert.equal((await request('https://fixture.invalid/api/orders/1')).id, 1);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'offer_expired', offerFailure: {
    schemaVersion: 1, verb: 'accept', code: 'offer_expired', category: 'conflict', recovery: 'refresh' } }), {status:409});
  await assert.rejects(request('https://fixture.invalid/api/jobs/1/accept?journeyProtocol=1', {}),
    e=>e instanceof ApiError && e.status===409 && e.offerFailure.recovery==='refresh');
} finally { globalThis.fetch = oldFetch; configureApi(null, () => {}); }
console.log('Wire enum, amount, lease, proof, schema-version and actual fetch-boundary validation passed');
