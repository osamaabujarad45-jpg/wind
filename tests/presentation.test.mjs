import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { againForm, canOrderAgain, canSendAnother, newBooking, pickupForm, readBooking, retryIds } from '../src/booking.ts';
import { locationState } from '../src/location-state.ts';
import { copy, statusText } from '../src/copy.ts';
import { isOpen, keepOlder, safetyKinds, withOlder } from '../src/model.ts';

const payload = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', pickupPoint: null,
  pickupNote: 'محل', dropoffNote: 'الدوار', contact: '0599123456', detail: 'كتب', option: 'small', loadingHelp: false, shared: false, quotedPrice: 48 };
const pending = newBooking(payload);
assert.deepEqual(readBooking(JSON.stringify(pending)), pending); // restart keeps the same command and terms
assert.notEqual(newBooking(payload).requestId, pending.requestId);
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
assert.deepEqual(locationState(location, 179000), { ageSeconds: 119, stale: false });
assert.deepEqual(locationState(location, 180000), { ageSeconds: 120, stale: true });
assert.deepEqual(locationState(location, 1000), { ageSeconds: 0, stale: false });
assert.deepEqual(locationState({ ...location, ageSeconds: 130 }, 1000), { ageSeconds: 130, stale: true }); // server age survives a slow device clock
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
}
assert.ok(!statusText(copy.ar, { service: 'parcel', status: 'assigned' }, true).includes('السائق'), 'a driver never reads "the driver" about themself');
// The safety card preselects 'other': it leads the chips so it is on screen when the card opens.
assert.equal(safetyKinds[0], 'other');
console.log('Status perspective and safety default checks passed');
