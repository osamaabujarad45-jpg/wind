// Saved and recent places (SPEC-saved-places.md): owner-only, Home/Work unique, capped, recent from own orders.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-places-')), 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { server, db } = await import('../server/main.ts');
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

  // Recent places come from the customer's own orders, de-duplicated and excluding saved ones.
  const order = { service: 'parcel', option: 'small', shared: false, contact: '0599600001', detail: 'Box' };
  for (const [pickupCity, pickupNote, dropoffCity, dropoffNote] of [['ramallah', 'Al-Manara', 'jenin', 'Old market'], ['bethlehem', 'Manger Square', 'jenin', 'Old market']]) {
    const input = { ...order, pickupCity, pickupNote, dropoffCity, dropoffNote };
    await call('/orders', { token: t, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  }
  places = await call('/me/places', { token: t });
  assert.deepEqual(places.recent, [{ city: 'bethlehem', note: 'Manger Square' }, { city: 'jenin', note: 'Old market' }]);
  assert.deepEqual((await call('/me/places', { token: other.token })).recent, []);

  // Account deletion removes them (open orders block deletion, so cancel first).
  for (const o of await call('/orders', { token: t })) await call(`/orders/${o.id}/cancel`, { token: t, body: {} });
  await call('/me/delete', { token: t, body: {} });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM saved_places').get().n, 0);

  console.log('places: ok');
} finally {
  server.close();
}
