// ONE-13 / D-2: the shop line is invisible and refused while WIND_ENABLED_SERVICES does not list it, and a parcel still books.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';
process.env.WIND_PUSH_SUBJECT = 'mailto:wind-push-suite@example.invalid';

const dir = mkdtempSync(join(tmpdir(), 'wind-shop-gate-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { shutdown, server, shopSweep } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);

try {
  const customer = await call('/auth/register', { body: { phone: '0599530001', name: 'Lina', password: 'secret1' } });
  const me = await call('/me', { token: customer.token });
  assert.deepEqual(me.capabilities.enabledServices, ['parcel'], 'no shop tile');
  assert.equal(me.settings.driverCashCap, defaultSettings.driverCashCap, 'the cap keeps its parcel default');
  for (const [path, body] of [['/shop/merchants'], ['/merchant/apply', { name: 'X', category: 'grocery' }],
    ['/orders', { service: 'shop', merchantId: 1, lines: [{ itemId: 1, qtyMilli: 1000, policy: 'remove' }] }]])
    assert.equal((await call(path, { token: customer.token, body, expect: 409 })).error, 'service_unavailable', path);
  assert.equal((await call('/price', { token: customer.token, body: { service: 'shop', pickupCity: 'tulkarm', dropoffCity: 'tulkarm', option: 'shop' }, expect: 400 })).error, 'invalid_service');
  assert.deepEqual(await call('/merchant', { token: customer.token }), { merchant: null });
  assert.equal(await shopSweep(), 0, 'the timers do nothing while the line is off');
  const parcel = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false, pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599530001', detail: 'Box' };
  assert.equal((await call('/orders', { token: customer.token, body: { ...parcel, quotedPrice: quote(defaultSettings, parcel) } })).status, 'searching');
  console.log('Shop gate: hidden and refused while off, parcels unchanged');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
