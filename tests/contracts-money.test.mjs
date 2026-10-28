// Expected cash/tariff values are frozen literals reviewed against WP01 source, not calculated from the producer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canTake, commissionOn, defaultSettings, isNight, PARCEL_LOAD, parcelFare, quote, smartPrice } from '../src/model.ts';

const read = name => JSON.parse(readFileSync(new URL(`../docs/implementation/contracts/${name}`, import.meta.url), 'utf8'));
const fixture = read('money.json');
assert.deepEqual(defaultSettings, read('config.json').tariffs.defaults);
for (const item of fixture.parcelCases) {
  const settings = { ...defaultSettings, ...item.settings };
  assert.equal(parcelFare(settings, item.input), item.ils, item.id);
  assert.equal(quote(settings, { ...item.input, service: 'parcel', pickupCity: 'hebron', dropoffCity: 'jenin', shared: false }), item.ils, `${item.id}: intercity compatibility`);
  assert.equal(item.ils * 100, item.minor, item.id);
}
for (const item of fixture.smartCases) assert.equal(smartPrice(defaultSettings, { ...item.input, at: Date.parse(item.input.at) }), item.ils, item.id);
for (const item of fixture.commissionCases) {
  assert.equal(commissionOn(item.price, item.rate), item.ils);
  assert.equal(Math.round(commissionOn(item.price, item.rate) * 100), item.minor);
}
for (const item of fixture.nightBoundaries) assert.equal(isNight(Date.parse(item.at)), item.night, item.at);
assert.equal(PARCEL_LOAD, 200, 'legacy count ceiling is compatibility, not verified physical capacity');
assert.equal(canTake(Array(199).fill({ service: 'parcel' }), 'parcel'), true);
assert.equal(canTake(Array(200).fill({ service: 'parcel' }), 'parcel'), false);
for (const exclusive of ['ride', 'freight']) {
  assert.equal(canTake([{ service: 'parcel' }], exclusive), false);
  assert.equal(canTake([{ service: exclusive }], 'parcel'), false);
}
console.log(`WP01 money: ${fixture.parcelCases.length} parcel fares, ${fixture.smartCases.length} smart fares, ${fixture.commissionCases.length} commissions and ${fixture.nightBoundaries.length} night boundaries passed; parcel/exclusive constraints preserved`);
