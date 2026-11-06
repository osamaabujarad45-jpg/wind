import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Exercise the real booking callbacks with a GPS provider that replies after cancellation.
const source = readFileSync(new URL('../src/app/book.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const locate = source.slice(source.indexOf('  async function locate() {'), source.indexOf('  // Opening the screen reuses consent'));
const confirm = source.slice(source.indexOf('  function confirmPinSpot() {'), source.indexOf('  useEffect(() => {\n    const leave', source.indexOf('  function confirmPinSpot() {')));
const gesture = source.match(/onGesture=\{(\(\) => \{[^\n]*\})\}/)?.[1];
assert.ok(locate.includes('pickupLocation') && confirm.includes('applyPlace') && gesture, 'booking callbacks must be present');
let resolveFix, signal, cameraWrites = 0, confirmed = 0, locating = false;
const context = {
  AbortController, locationRequest: { current: null }, pickupTouched: { current: false }, step: 'pin', pinFor: 'pickup',
  pickupLocation: next => { signal = next; return new Promise(resolve => { resolveFix = resolve; }); },
  get locating() { return locating; }, mapReady: true, pinMoving: false, pinPoint: { latitude: 31.9, longitude: 35.2 }, pinServed: 'ramallah', pinNote: 'Manual',
  setLocating: value => { locating = value; }, setLocationError() {}, setPinMoving() {}, setPinLabel() {},
  setHere() {}, rememberHere: async () => {}, setPinCenter() { cameraWrites++; }, setPickupNote() {}, adoptFix() {},
  haptic: { success() {} }, applyPlace() { confirmed++; }, setPinNote() {},
};
runInNewContext(locate + confirm + `\nglobalThis.locate = locate; globalThis.confirmPinSpot = confirmPinSpot; globalThis.gesture = ${gesture};`, context);
const pending = context.locate();
assert.equal(locating, true);
context.confirmPinSpot();
assert.equal(confirmed, 0, 'a pending GPS request cannot confirm an unseen fallback pin');
context.gesture();
assert.equal(signal.aborted, true, 'a manual map drag cancels the outstanding location request');
assert.equal(context.pickupTouched.current, true, 'a manual pickup choice wins over a quiet startup fix');
assert.equal(locating, false, 'manual selection releases the loading state');
resolveFix({ city: 'ramallah', point: { latitude: 31.9, longitude: 35.2 }, accuracy: 10 });
await pending;
assert.equal(cameraWrites, 0, 'a late GPS response cannot move the manual pin');
console.log('Booking manual map gesture cancels pending location and fences a late fix');

// On the phone, a place picked with the keyboard up left it open over the map pin, hiding the confirm button.
// Dismiss has to run before the step changes: once the search field is unmounted there is nothing left to blur.
const search = readFileSync(new URL('../src/trip-search.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const pick = search.match(/const pick = (\(place[^\n]*\});/)?.[1]?.replace(": TripPlace", "");
const mapRow = search.match(/title=\{c\.setOnMap\} onPress=\{(\(\) => \{[^\n]*\})\} \/>/)?.[1];
assert.ok(pick && mapRow, 'the two ways out of the search step must be present');
const order = [];
const leaving = {
  Keyboard: { dismiss() { order.push('dismiss'); } }, haptic: { tap() {} }, field: 'pickup', setQuery() {},
  onPick() { order.push('leave'); }, onMap() { order.push('leave'); },
};
runInNewContext(`globalThis.pick = ${pick}; globalThis.mapRow = ${mapRow};`, leaving);
leaving.pick({ city: 'ramallah', point: null, note: '' });
assert.deepEqual(order.splice(0), ['dismiss', 'leave'], 'picking a place closes the keyboard first');
leaving.mapRow();
assert.deepEqual(order.splice(0), ['dismiss', 'leave'], 'choosing on the map closes the keyboard first');
