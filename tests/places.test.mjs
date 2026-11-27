// Saved and recent places (SPEC-saved-places.md): owner-only, Home/Work unique, capped, recent from own orders.
import assert from 'node:assert/strict';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { city, defaultSettings, HISTORY_PAGE, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-places-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { shutdown, server, db } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

const call = apiCaller(() => base);

try {
  const customer = await call('/auth/register', { body: { phone: '0599600001', name: 'Huda', password: 'secret1' } });
  const other = await call('/auth/register', { body: { phone: '0599600002', name: 'Other', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599600003', name: 'Driver', password: 'secret1', role: 'driver', vehicle: 'car' } });
  const t = customer.token;

  assert.deepEqual(await call('/me/places', { token: t }), { saved: [], recent: [] });
  await call('/me/places', { token: driver.token, expect: 403 });
  for (const body of [{ label: 'gym', city: 'nablus', note: 'Gate' }, { label: 'home', city: 'atlantis', note: 'Gate' },
    { label: 'home', city: 'nablus', note: '  ' }, { label: 'home', city: 'nablus', note: 'x'.repeat(201) }])
    await call('/me/places', { token: t, body, expect: 400 });

  let places = await call('/me/places', { token: t, body: { label: 'home', city: 'nablus', note: ' Near Al-Najah gate ' } });
  assert.deepEqual(places.saved.map(p => [p.label, p.city, p.note]), [['home', 'nablus', 'Near Al-Najah gate']]);
  places = await call('/me/places', { token: t, body: { label: 'home', city: 'ramallah', note: 'Al-Manara' } }); // new home replaces old
  assert.deepEqual(places.saved.map(p => [p.label, p.city]), [['home', 'ramallah']]);
  places = await call('/me/places', { token: t, body: { label: 'work', city: 'ramallah', note: 'Al-Manara' } }); // same place relabelled
  assert.deepEqual(places.saved.map(p => [p.label, p.city, p.note]), [['work', 'ramallah', 'Al-Manara']]);
  assert.equal(places.saved[0].point, undefined); // landmark-only

  // Research #6: a place keeps its own pin, re-saving without one keeps it, and a pin must be real and inside its city.
  const manara = { latitude: 31.9038, longitude: 35.2034 };
  places = await call('/me/places', { token: t, body: { label: 'work', city: 'ramallah', note: 'Al-Manara', point: manara } });
  assert.deepEqual(places.saved[0].point, manara);
  assert.equal(places.saved[0].pinSaved, true);
  places = await call('/me/places', { token: t, body: { label: 'work', city: 'ramallah', note: 'Al-Manara' } });
  assert.deepEqual(places.saved[0].point, manara);
  const moved = { latitude: 31.9041, longitude: 35.2041 }; // a new pin replaces the stored one (last write wins)
  places = await call('/me/places', { token: t, body: { label: 'work', city: 'ramallah', note: 'Al-Manara', point: moved } });
  assert.deepEqual(places.saved[0].point, moved);
  places = await call('/me/places', { token: t, body: { label: 'work', city: 'ramallah', note: 'Al-Manara', point: manara } });
  assert.deepEqual({ ...db.prepare('SELECT lat, lng FROM saved_places WHERE note = ?').get('Al-Manara') }, { lat: 31.9038, lng: 35.2034 });
  const jenin = city('jenin');
  assert.equal((await call('/me/places', { token: t, body: { label: 'other', city: 'ramallah', note: 'Far', point: { latitude: jenin.latitude, longitude: jenin.longitude } }, expect: 400 })).error, 'outside_area');
  assert.equal((await call('/me/places', { token: t, body: { label: 'other', city: 'ramallah', note: 'Bad', point: { latitude: 'x', longitude: 35 } }, expect: 400 })).error, 'invalid_location');
  assert.equal((await call('/me/places', { token: t })).saved.length, 1); // refused pins saved nothing

  for (let i = 1; i <= 9; i++) places = await call('/me/places', { token: t, body: { label: 'other', city: 'hebron', note: `Shop ${i}` } });
  assert.equal(places.saved.length, 10);
  assert.equal(places.saved[0].label, 'work'); // home, work, then others
  assert.equal((await call('/me/places', { token: t, body: { label: 'other', city: 'hebron', note: 'Shop 10' }, expect: 409 })).error, 'places_full');
  await call('/me/places', { token: t, body: { label: 'other', city: 'hebron', note: 'Shop 9' } }); // an existing place is not a new one

  // Owner only.
  const id = places.saved.at(-1).id;
  assert.deepEqual(await call('/me/places', { token: other.token }), { saved: [], recent: [] });
  await call(`/me/places/${id}`, { token: other.token, method: 'DELETE', expect: 404 });
  places = await call(`/me/places/${id}`, { token: t, method: 'DELETE' });
  assert.equal(places.saved.length, 9);
  await call(`/me/places/${id}`, { token: t, method: 'DELETE', expect: 404 });

  // A landmark-only place lends the pin of the customer's order there, without claiming it as its own.
  await call('/me/places', { token: t, body: { label: 'other', city: 'jenin', note: 'Old market' } });
  // Recent places come from the customer's own orders, de-duplicated and excluding saved ones.
  const order = { service: 'parcel', option: 'small', shared: false, contact: '0599600001', detail: 'Box' };
  for (const [pickupCity, pickupNote, dropoffCity, dropoffNote] of [['ramallah', 'Al-Manara', 'jenin', 'Old market'], ['bethlehem', 'Manger Square', 'jenin', 'Old market']]) {
    const input = { ...order, pickupCity, pickupNote, dropoffCity, dropoffNote };
    // The Al-Manara order is pinned elsewhere: the saved place's own pin must still win over the borrowed one.
    const market = { latitude: jenin.latitude + 0.001, longitude: jenin.longitude + 0.001 };
    const pins = pickupNote === 'Al-Manara' ? { pickupPoint: { latitude: 31.9001, longitude: 35.2001 }, dropoffPoint: market } : {};
    await call('/orders', { token: t, body: { ...input, ...pins, quotedPrice: quote(defaultSettings, input) } });
  }
  places = await call('/me/places', { token: t });
  assert.deepEqual(places.saved.find(p => p.note === 'Al-Manara').point, manara);
  const lent = places.saved.find(p => p.note === 'Old market');
  assert.deepEqual(lent.point, { latitude: jenin.latitude + 0.001, longitude: jenin.longitude + 0.001 });
  assert.equal(lent.pinSaved, undefined); // borrowed, so the app may still offer to save a pin the customer places
  assert.deepEqual(places.recent, [{ city: 'bethlehem', note: 'Manger Square' }]); // Old market is saved now
  assert.deepEqual((await call('/me/places', { token: other.token })).recent, []);

  const point = { latitude: 32.3102, longitude: 35.0299 };
  const stamp = Date.now();
  const history = db.prepare(`INSERT INTO orders(customer_id,service,shared,pickup_city,dropoff_city,pickup_note,dropoff_note,
    dropoff_lat,dropoff_lng,contact,detail,option,loading_help,price,status,driver_id,created_at,updated_at,completed_at)
    VALUES(?,?,0,'tulkarm','tulkarm','Pickup',?,?,?,'0599600001','Synthetic history','small',0,20,?,?,?,?,?)`);
  const completed = ['completed', driver.user.id, stamp, stamp, stamp];
  const earlierShop = Number(history.run(customer.user.id, 'shop', 'Blue door', point.latitude, point.longitude, ...completed).lastInsertRowid);
  for (let i = 0; i <= HISTORY_PAGE; i++) history.run(customer.user.id, 'parcel', 'Newer parcel', point.latitude, point.longitude, ...completed);
  history.run(customer.user.id, 'shop', 'Cancelled shop', point.latitude, point.longitude, 'cancelled', null, stamp, stamp, null);
  assert.ok((await call('/orders', { token: t })).every(entry => entry.id !== earlierShop), 'the saved shop is beyond the first history page');
  assert.deepEqual((await call('/me/places?shopDelivery=1&town=tulkarm', { token: t })).shopDelivery,
    { id: earlierShop, city: 'tulkarm', note: 'Blue door', point });
  assert.equal((await call('/me/places?shopDelivery=1&town=ramallah', { token: t })).shopDelivery, null);
  assert.equal((await call('/me/places?shopDelivery=1', { token: other.token })).shopDelivery, null);
  await call('/me/places?shopDelivery=1', { token: driver.token, expect: 403 });

  // Account deletion removes them (open orders block deletion, so cancel first).
  for (const o of await call('/orders?status=searching', { token: t })) await call(`/orders/${o.id}/cancel`, { token: t, body: {} });
  await call('/me/delete', { token: t, body: { password: 'secret1' } });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM saved_places').get().n, 0);

  console.log('places: ok');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
