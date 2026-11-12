import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { againForm, canOrderAgain, canSendAnother, newBooking, orderRequest, pickupForm, readBooking, retryIds } from '../src/booking.ts';
import { locationState, publicFixClock, publicFixAgeMs, retainedPublicFix } from '../src/location-state.ts';
import { noteServerDate } from '../src/api-client.ts';
import { copy, statusText } from '../src/copy.ts';
import { isOpen, keepOlder, safetyKinds, withOlder } from '../src/model.ts';
import { arrivalDistanceKm, capacityCommand, dispatchAcceptance, RIDE_ARRIVAL_FIX_MAX_AGE_MS, RIDE_ARRIVAL_RADIUS_METERS, rideStep, secondsUntil } from '../src/ride-flow.ts';
import { RIDE_ARRIVAL_FIX_MAX_AGE_MS as serverArrivalFixAge, RIDE_ARRIVAL_RADIUS_METERS as serverArrivalRadius } from '../server/domain/ride-lifecycle.ts';
import { emptyFreightDraft, freightDraftFromScope, freightScope } from '../src/freight-scope.ts';

const loadDraft = { ...emptyFreightDraft(), pieces: '٢', lengthCm: '١٢٫٥', widthCm: '20', heightCm: '30', massKg: '12.345', value: '15.25', equipment: ['straps'] };
const load = freightScope(loadDraft, 1000, 2);
assert.equal(load.massGrams, 12345);
assert.equal(load.lengthMm, 125);
assert.equal(load.declaredValueMinor, 1525);
assert.equal(load.loadingBefore, 7_201_000);
assert.deepEqual(freightScope(freightDraftFromScope(load), 1000, 2), load, 'restoring an editable draft preserves exact terms');
assert.equal(freightScope({ ...loadDraft, massKg: '1.0001' }, 1000, 2), null, 'sub-gram precision is rejected');
assert.equal(freightScope({ ...loadDraft, pieces: '1.5' }, 1000, 2), null);
assert.equal(freightScope({ ...loadDraft, massKg: '-2' }, 1000, 2), null);
assert.equal(freightScope({ ...loadDraft, lengthCm: '10000', widthCm: '10000', heightCm: '10000' }, 1000, 2), null, 'unsafe aggregate volume is rejected');
assert.equal(freightScope(loadDraft, 1000, 0), null);

assert.deepEqual(capacityCommand({}), {});
assert.deepEqual(capacityCommand({ declaredScope: { revision: 2 } }), { capacityProtocol: 1, expectedRequirementsRevision: 2 });
assert.deepEqual(capacityCommand({ measuredScope: { requirementsRevision: 3 }, declaredScope: { revision: 2 } }),
  { capacityProtocol: 1, expectedRequirementsRevision: 3 }, 'measured requirements take precedence over the declaration');

const ride = { service: 'ride', status: 'assigned', ride: { arrivedAt: null, boardingRequired: true, boardingLocked: false } };
assert.equal(rideStep(ride), 'arrive');
assert.equal(rideStep({ ...ride, ride: null }), 'advance', 'legacy rides do not invent a lifecycle');
assert.equal(rideStep({ ...ride, ride: { ...ride.ride, arrivedAt: 100 } }), 'advance');
assert.equal(rideStep({ ...ride, status: 'at_pickup', ride: { ...ride.ride, arrivedAt: 100 } }), 'boarding');
assert.equal(rideStep({ ...ride, status: 'at_pickup', ride: { ...ride.ride, arrivedAt: 100, boardingLocked: true } }), 'locked');
assert.equal(rideStep({ ...ride, status: 'in_transit' }), 'advance');
// The Arrive cue mirrors the server fence: same radius and fix age, a fresh fix only.
assert.equal(RIDE_ARRIVAL_RADIUS_METERS, serverArrivalRadius);
assert.equal(RIDE_ARRIVAL_FIX_MAX_AGE_MS, serverArrivalFixAge);
{
  noteServerDate(new Date(1_000_000_000_000).toUTCString(), 1_000_000_000_000, 0);
  const at = 1_000_000_000_000, pickup = { latitude: 31.9, longitude: 35.2 };
  const fix = (latitude, ageSeconds) => ({ latitude, longitude: 35.2, updatedAt: at - ageSeconds * 1000, ageSeconds });
  assert.ok(Math.abs(arrivalDistanceKm(pickup, fix(31.91, 5), at) - 1.11) < 0.01, '~1.1 km north of pickup');
  assert.ok(arrivalDistanceKm(pickup, fix(31.9015, 5), at) * 1000 < RIDE_ARRIVAL_RADIUS_METERS, '~170 m is inside the fence');
  assert.equal(arrivalDistanceKm(pickup, fix(31.91, 121), at), null, 'a fix the server would call stale is no basis');
  assert.equal(arrivalDistanceKm(null, fix(31.91, 5), at), null);
  assert.equal(arrivalDistanceKm(pickup, null, at), null);
}
const leased = { dispatch: { state: 'open', myOffer: { offerId: 'lease', leaseNonce: 'secret', expiresAt: 200 } } };
assert.deepEqual(dispatchAcceptance(leased, 199), { offerId: 'lease', leaseNonce: 'secret' });
assert.equal(dispatchAcceptance(leased, 200), null, 'an expired lease never becomes a legacy acceptance');
assert.equal(dispatchAcceptance({ dispatch: { ...leased.dispatch, state: 'exhausted' } }, 100), null);
assert.equal(dispatchAcceptance({ dispatch: { state: 'open', myOffer: null } }, 100), null);
assert.deepEqual(dispatchAcceptance({}, 100), {});
noteServerDate(new Date(100_000).toUTCString(), 400_000);
assert.deepEqual(dispatchAcceptance({ dispatch: { ...leased.dispatch, myOffer: { ...leased.dispatch.myOffer, expiresAt: 101_000 } } }, 400_000),
  { offerId: 'lease', leaseNonce: 'secret' }, 'a phone five minutes ahead still sees a valid server lease');
assert.equal(secondsUntil(101_000, 400_000), 1);
assert.equal(secondsUntil(99_000, 400_000), 0);
noteServerDate(new Date(400_000).toUTCString(), 400_000);

const payload = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', pickupPoint: null,
  pickupNote: 'محل', dropoffNote: 'الدوار', contact: '0599123456', detail: 'كتب', option: 'small', loadingHelp: false, shared: false, quotedPrice: 48 };
const pending = newBooking(payload);
const freightCommand = newBooking({ ...payload, service: 'freight', declaredScope: load });
assert.deepEqual(readBooking(JSON.stringify(freightCommand)), freightCommand, 'load terms survive an offline restart');
assert.deepEqual(orderRequest(freightCommand).declaredScope, load);
assert.throws(() => readBooking(JSON.stringify({ ...freightCommand, payload: { ...freightCommand.payload, declaredScope: { ...load, massGrams: -1 } } })));
assert.deepEqual(readBooking(JSON.stringify(pending)), pending); // restart keeps the same command and terms
assert.notEqual(newBooking(payload).requestId, pending.requestId);
// Quote-bound booking: the locked quote survives restart, and the wire body must not
// carry quotedPrice beside quoteId (the server answers quote_price_conflict).
const quotedCommand = newBooking({ ...payload, quoteId: '123e4567-e89b-42d3-a456-426614174000' });
assert.deepEqual(readBooking(JSON.stringify(quotedCommand)), quotedCommand);
assert.throws(() => readBooking(JSON.stringify({ ...pending, payload: { ...payload, quoteId: 'not-a-uuid' } })));
const locked = orderRequest(quotedCommand);
assert.equal(locked.quoteId, quotedCommand.payload.quoteId);
assert.equal('quotedPrice' in locked, false);
assert.equal(locked.requestId, quotedCommand.requestId);
const legacy = orderRequest(pending);
assert.equal(legacy.quotedPrice, payload.quotedPrice);
assert.equal('quoteId' in legacy, false);
// Chat retry: text A fails (reply lost), quick reply B goes out, A is resent with its first id.
const chatIds = retryIds(), firstA = chatIds.for('A');
chatIds.for('B'); chatIds.sent('B');
assert.equal(chatIds.for('A'), firstA, 'a failed text keeps its id after another text was sent');
chatIds.sent('A');
assert.notEqual(chatIds.for('A'), firstA, 'the same text sent again after success is a new message');
// Orders "show older": the hook keeps every ended order it showed plus the loaded page, so when order 11 ends
// and the polled first page drops 8 off its window, 8 stays listed; the polled copy wins for an order in both.
const o = (id, status = 'completed') => ({ id, status });
const shown = withOlder([o(10), o(9), o(8), o(2, 'assigned')], []);
const older = [...shown.filter(x => !isOpen(x)), o(7), o(6)];
const later = withOlder([o(11), o(10), o(9, 'returned'), o(2, 'assigned')], older);
assert.deepEqual(later.map(x => x.id), [11, 10, 9, 8, 7, 6, 2]);
assert.equal(later.find(x => x.id === 9).status, 'returned');
// Each poll carries forward what the window moved past, also orders that ended after the load (Sol 09 F1: 12 here).
const poll1 = [o(12), o(11), o(10), o(2, 'assigned')], poll2 = [o(14), o(13), o(12), o(2, 'assigned')], poll3 = [o(16), o(15), o(14), o(2, 'assigned')];
const carried = keepOlder(poll2, poll3, keepOlder(poll1, poll2, [o(9), o(8)]));
assert.deepEqual(withOlder(poll3, carried).map(x => x.id), [16, 15, 14, 13, 12, 11, 10, 9, 8, 2]);
// An open order that leaves the first page ended below its window: the loaded pages may have passed it, so start over.
assert.equal(keepOlder(poll3, [o(17), o(16), o(15)], carried), null);
assert.equal(readBooking(null), null);
const promo = newBooking({ ...payload, promoCode: 'WELCOME10', expectedDiscount: 10 });
assert.deepEqual(readBooking(JSON.stringify(promo)), promo);
assert.deepEqual(readBooking(JSON.stringify(newBooking({ ...payload, recipientName: 'هدى', recipientPhone: '0599000002' }))).payload.recipientPhone, '0599000002');
for (const saved of [JSON.stringify({ ...pending, payload: { ...payload, recipientPhone: 5 } }), '{', 'null', JSON.stringify({ ...pending, payload: { ...payload, pickupCity: 'outside' } }),
  JSON.stringify({ ...pending, payload: { ...payload, quotedPrice: null } }), JSON.stringify({ ...pending, requestId: 'bad' }), JSON.stringify({ ...pending, payload: { ...payload, promoCode: 'WELCOME10' } })]) {
  assert.throws(() => readBooking(saved));
}
// Order again (SPEC-order-again.md): route and item copy over; price, promo, time and identity never do.
const old = { id: 7, service: 'freight', pickupCity: 'hebron', dropoffCity: 'jenin', pickupPoint: { latitude: 31.53, longitude: 35.09 },
  dropoffPoint: { latitude: 32.46, longitude: 35.3 }, pickupNote: 'مخزن', dropoffNote: 'المحطة', detail: 'ثلاجة', contact: '0599000001',
  option: 'large', loadingHelp: true, price: 120, discount: 10, scheduledFor: 1_800_000_000_000, status: 'completed' };
assert.deepEqual(againForm(old), { service: 'freight', pickupCity: 'hebron', dropoffCity: 'jenin', pickupPoint: old.pickupPoint,
  dropoffPoint: old.dropoffPoint, pickupNote: 'مخزن', dropoffNote: 'المحطة', detail: 'ثلاجة', contact: '0599000001', option: 'large', loadingHelp: true,
  recipientName: '', recipientPhone: '' });
assert.deepEqual([againForm({ ...old, recipientName: 'هدى', recipientPhone: '0599000002' }).recipientName, againForm({ ...old, recipientPhone: '0599000002' }).recipientPhone],
  ['هدى', '0599000002']); // order again: same recipient (SPEC-parcel-recipient.md)
assert.deepEqual(againForm({ ...old, service: 'ride', option: 'large', contact: null, dropoffPoint: undefined }),
  { ...againForm(old), service: 'ride', option: '1', contact: '', dropoffPoint: null }); // stale option → first valid one
const again = newBooking({ ...againForm(old), shared: false, quotedPrice: 99 });
assert.equal(readBooking(JSON.stringify(again)).payload.quotedPrice, 99); // the refilled form makes a valid, fresh command
for (const status of ['completed', 'returned', 'cancelled']) assert.ok(canOrderAgain({ status }, 'customer'), status);
for (const status of ['searching', 'assigned', 'at_pickup', 'in_transit', 'on_hold', 'returning']) assert.ok(!canOrderAgain({ status }, 'customer'), status);
for (const role of ['driver', 'admin', undefined]) assert.ok(!canOrderAgain({ status: 'completed' }, role), String(role));
// Send another (SPEC-send-another.md): only the pickup carries over; the last buyer's drop-off, phone and item never do.
assert.deepEqual(pickupForm({ ...old, service: 'parcel', option: 'small' }),
  { service: 'parcel', option: 'small', pickupCity: 'hebron', pickupPoint: old.pickupPoint, pickupNote: 'مخزن' });
for (const status of ['searching', 'in_transit', 'completed', 'returned']) assert.ok(canSendAnother({ status, service: 'parcel' }, 'customer'), status);
assert.ok(!canSendAnother({ status: 'cancelled', service: 'parcel' }, 'customer'));
assert.ok(!canSendAnother({ status: 'completed', service: 'ride' }, 'customer'));
for (const role of ['driver', 'admin', undefined]) assert.ok(!canSendAnother({ status: 'completed', service: 'parcel' }, role), String(role));
assert.equal(locationState(null, 180000), null);
const location = { latitude: 31.9, longitude: 35.2, updatedAt: 60000, ageSeconds: 0 };
// Freshness limit 30 s: 29 s is fresh, 30 s is weak, 60 s is stale (two missed 15 s stationary cycles).
assert.deepEqual(locationState(location, 89000), { ageSeconds: 29, stale: false, reconnecting: false });
assert.deepEqual(locationState(location, 90000), { ageSeconds: 30, stale: false, reconnecting: true });
assert.deepEqual(locationState(location, 119000), { ageSeconds: 59, stale: false, reconnecting: true });
assert.deepEqual(locationState(location, 120000), { ageSeconds: 60, stale: true, reconnecting: false });
assert.deepEqual(locationState(location, 1000), { ageSeconds: 0, stale: false, reconnecting: false });
assert.deepEqual(locationState({ ...location, ageSeconds: 130 }, 1000), { ageSeconds: 130, stale: true, reconnecting: false }); // server age survives a slow device clock
// A stationary driver's 15 s fix is the normal cadence, not a weak signal.
assert.deepEqual(locationState(location, 76000), { ageSeconds: 16, stale: false, reconnecting: false });
assert.deepEqual(locationState(location, 74000), { ageSeconds: 14, stale: false, reconnecting: false });
// A phone clock 2 minutes ahead (server Date header) still sees a 10 s old fix as live; small header jitter is ignored.
noteServerDate(new Date(70_000).toUTCString(), 190_000);
assert.deepEqual(locationState(location, 190_000), { ageSeconds: 10, stale: false, reconnecting: false });
noteServerDate(new Date(190_000).toUTCString(), 192_000);
assert.deepEqual(locationState(location, 95_000), { ageSeconds: 35, stale: false, reconnecting: true });
// A phone clock two minutes behind must not extend the public marker's 120-second retention.
noteServerDate(new Date(180_000).toUTCString(), 60_000);
const stillRecent = { ...location, updatedAt: 61_000 }, tooOld = { ...location, updatedAt: 59_000 };
assert.equal(retainedPublicFix(stillRecent, 60_000), stillRecent);
assert.equal(retainedPublicFix(tooOld, 60_000), null);
assert.equal(retainedPublicFix({ ...stillRecent, ageSeconds: 121 }, 60_000), null);
assert.equal(retainedPublicFix(null, 60_000), null);
noteServerDate(new Date(60_000).toUTCString(), 60_000);
// Moving the device clock backwards while offline must not renew a cached location.
const lease = publicFixClock(location, 60_000, 1_000);
assert.equal(publicFixAgeMs(location, -3_540_000, lease, 61_000), 60_000);
assert.equal(retainedPublicFix(location, -3_540_000, lease, 121_001), null);
assert.equal(publicFixAgeMs({ ...location, updatedAt: 61_000 }, 61_000, lease, 121_001), 0, 'a different fix does not inherit the prior lease');
noteServerDate(null);
console.log('Booking recovery and location freshness checks passed');

// RTL: OS flipping is off, so a raw 'row' stays left-to-right in Arabic. Use `row` from useCopy(), or say why with `ltr:`.
const sources = readdirSync(new URL('../src', import.meta.url), { recursive: true }).filter(f => /\.tsx?$/.test(f));
const rawRows = sources.flatMap(f => readFileSync(new URL(`../src/${f.replaceAll('\\', '/')}`, import.meta.url), 'utf8').split('\n')
  .map((line, i) => ({ f, i: i + 1, line })).filter(({ line }) => /flexDirection: 'row'/.test(line) && !/ltr:/.test(line)));
assert.deepEqual(rawRows.map(({ f, i }) => `${f}:${i}`), [], 'raw left-to-right rows outside the RTL helper');
console.log('RTL row check passed');

// Status perspective: the assigned driver reads their own move ("heading to pickup"), everyone else "the driver …";
// rides keep trip words, and a status with no driver wording falls back to the shared one.
for (const c of [copy.ar, copy.en]) {
  const parcel = status => ({ service: 'parcel', status }), ride = status => ({ service: 'ride', status });
  assert.equal(statusText(c, parcel('assigned')), c.assigned);
  assert.equal(statusText(c, parcel('assigned'), true), c.driver_assigned);
  assert.equal(statusText(c, parcel('at_pickup'), true), c.driver_at_pickup);
  assert.equal(statusText(c, ride('assigned')), c.assigned_ride);
  assert.equal(statusText(c, ride('assigned'), true), c.driver_assigned_ride);
  assert.equal(statusText(c, ride('at_pickup'), true), c.driver_at_pickup_ride);
  assert.equal(statusText(c, ride('in_transit'), true), c.in_transit_ride);
  assert.equal(statusText(c, parcel('in_transit'), true), c.in_transit);
  assert.equal(statusText(c, parcel('returning'), true), c.returning);
  // Booked a day ahead: nobody is looking for a driver until 30 minutes before (A53, 12 Nov).
  const at = 1_800_000_000_000, booked = { service: 'parcel', status: 'searching', scheduledFor: at };
  assert.equal(statusText(c, booked, false, at - 31 * 60_000), c.searching_booked);
  assert.equal(statusText(c, booked, false, at - 30 * 60_000), c.searching, 'drivers see it from 30 minutes before');
  assert.equal(statusText(c, { ...booked, scheduledFor: null }, false, at), c.searching);
}
assert.ok(!statusText(copy.ar, { service: 'parcel', status: 'assigned' }, true).includes('السائق'), 'a driver never reads "the driver" about themself');
// The safety card preselects 'other': it leads the chips so it is on screen when the card opens.
assert.equal(safetyKinds[0], 'other');
console.log('Status perspective and safety default checks passed');
