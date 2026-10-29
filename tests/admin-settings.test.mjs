// Admin pricing must refuse the two values that only surface on a customer's next quote:
// a blank field (0) and a mistyped one (2000). REVIEW-2026-10-29 P1 #2.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-settings-'));
process.env.DB_PATH = join(dir, 'settings.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
process.env.SUPPORT_CONTACT = 'Synthetic <support> & "contact"';

const { shutdown, server, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

async function call(path, { token, body, expect = 200 } = {}) {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json();
  assert.equal(res.status, expect, `${path}: ${JSON.stringify(data)}`);
  return data;
}

try {
  const admin = await call('/auth/register', { body: { phone: '0599700001', name: 'Admin', password: 'secret1' } });
  await promote('0599700001');
  const token = (await call('/auth/login', { body: { phone: '0599700001', password: 'secret1' } })).token;

  const saved = () => call('/me', { token }).then(m => m.settings);

  // A blank field reaches the server as 0. It must be refused by name, not stored.
  for (const [body, field] of [
    [{ commission: 0 }, 'commission'],
    [{ parcelPrice: 0 }, 'parcelPrice'],
    [{ plusPrice: 0 }, 'plusPrice'],
    [{ proPrice: 0 }, 'proPrice'],
    [{ ridePerKm: 0 }, 'ridePerKm'],
  ]) {
    const r = await call('/admin/settings', { token, body, expect: 400 });
    assert.equal(r.error, `invalid_setting:${field}`, `${field} must name itself`);
  }

  // A fat-fingered value is refused above the shared ceiling.
  for (const [body, field] of [
    [{ parcelPrice: 2000 }, 'parcelPrice'],
    [{ plusPrice: 2000 }, 'plusPrice'],
    [{ ridePerKm: 500 }, 'ridePerKm'],
  ]) {
    const r = await call('/admin/settings', { token, body, expect: 400 });
    assert.equal(r.error, `invalid_setting:${field}`, `${field} ceiling`);
  }

  // A percentage above 100 is still refused (the pre-existing rule).
  assert.equal((await call('/admin/settings', { token, body: { commission: 1.5 }, expect: 400 })).error, 'invalid_setting');

  // Nothing above was stored.
  const after = await saved();
  assert.equal(after.commission, 0.15);
  assert.equal(after.parcelPrice, 20);
  assert.equal(after.plusPrice, 29);

  // Valid values still save, including at the ceiling.
  await call('/admin/settings', { token, body: { parcelPrice: 25, commission: 0.2 } });
  assert.deepEqual([(await saved()).parcelPrice, (await saved()).commission], [25, 0.2]);
  await call('/admin/settings', { token, body: { parcelPrice: 500 } });
  assert.equal((await saved()).parcelPrice, 500);

  console.log('admin settings: refuses 0 and over-ceiling values by name, valid values save');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
