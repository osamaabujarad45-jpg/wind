import { randomUUID } from 'node:crypto';
import { fixture } from './eligibility-support.mjs';

export const dispatchFixture = (label) => fixture(label, { WIND_DISPATCH_TEST_ONLY: '1' });

/** A fully eligible, online driver on their own approved vehicle with a fresh fix near pickup. */
export async function addDriver(f, { latitude = 31.9005, longitude = 35.195, idleSeconds = 0 } = {}) {
  const driver = await f.account('driver');
  const vehicle = await f.post('/vehicles', { ...f.vehicleBody, plate: `SYN-DISP-${driver.user.id}` });
  await f.verify(driver, vehicle.id);
  const deviceId = randomUUID();
  const online = await f.call('/driver/presence/online', { token: driver.token, body: { commandId: randomUUID(), deviceId, consentVersion: 1 } });
  const located = await f.call('/driver/presence/location', { token: driver.token, body: { deviceId, sessionId: online.sessionId, seq: 1, ageMs: 0, latitude, longitude, accuracy: 20 } });
  if (!located.accepted) throw new Error(`dispatch fixture location rejected: ${JSON.stringify(located)}`);
  if (idleSeconds) await f.db.run('UPDATE driver_presence_sessions SET started_at=? WHERE driver_id=?', Date.now() - idleSeconds * 1000, driver.user.id);
  return { driver, vehicle, deviceId, sessionId: online.sessionId };
}

export const bookRide = (f, extra = {}) => f.book({ service: 'ride', option: '1', ...extra });

/** Measure the ride and attest an approach for every candidate vehicle. */
export async function assessRide(f, order, vehicles = []) {
  await f.assess(order, { items: [], seats: 1 });
  for (const vehicle of vehicles) if (vehicle.id !== f.vehicle.id) await f.approach(order, { vehicleId: vehicle.id });
}

export async function myOffer(f, orderId, driver) {
  const view = await f.call(`/orders/${orderId}`, { token: driver.token });
  return view.dispatch?.myOffer ?? null;
}

export async function acceptOffer(f, orderId, driver, offer, extra = {}, expect = 200) {
  return f.call(`/jobs/${orderId}/accept`, { token: driver.token, body: { offerId: offer.id, leaseNonce: offer.leaseNonce, ...extra }, expect });
}
