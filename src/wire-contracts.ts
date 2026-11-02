import { isCity, services, type Order, type PriceQuote } from './model.ts';
import { readRuntimeConfiguration } from './runtime-config.ts';
import type { DriverReceipt } from './driver-command.ts';
import type { Journey, JourneyEta } from './journey-contracts.ts';
type RecordValue = Record<string, any>;
const object = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (n: unknown, min = 0): n is number => Number.isSafeInteger(n) && (n as number) >= min;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const nullableTime = (n: unknown) => n === null || integer(n);
const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const statuses = ['searching','assigned','at_pickup','in_transit','completed','cancelled','on_hold','returning','returned'];
const requireContract = (condition: unknown) => { if (!condition) throw new Error('invalid_response'); };

export function readEta(value: unknown): JourneyEta {
  requireContract(object(value)); const e = value as RecordValue;
  requireContract(e.schemaVersion === 1 && integer(e.minSeconds) && integer(e.maxSeconds) && e.maxSeconds >= e.minSeconds
    && (e.rawSeconds === null || integer(e.rawSeconds) && e.rawSeconds >= e.minSeconds && e.rawSeconds <= e.maxSeconds)
    && ['unknown','low','medium','high'].includes(e.accuracy) && ['heuristic','quote_band','straight_line'].includes(e.basis)
    && integer(e.serverTime) && object(e.validity) && integer(e.validity.issuedAt) && integer(e.validity.expiresAt)
    && e.validity.expiresAt > e.validity.issuedAt && integer(e.validity.expiresInSeconds));
  return e as JourneyEta;
}
export function readJourney(value: unknown): Journey {
  requireContract(object(value)); const j = value as RecordValue;
  requireContract(j.schemaVersion === 1 && integer(j.serverTime));
  if (j.offer !== undefined) { const o = j.offer; requireContract(object(o) && uuid(o.offerId) && integer(o.issuedAt)
    && integer(o.expiresAt) && o.expiresAt > o.issuedAt && finite(o.acceptWindowSeconds) && o.acceptWindowSeconds === (o.expiresAt - o.issuedAt) / 1000);
    if (o.eta !== undefined) readEta(o.eta); }
  if (j.boarding !== undefined) { const b = j.boarding; requireContract(object(b) && ['all_trips','not_required','unknown'].includes(b.policy)
    && b.reason === 'provider_setting' && ['required','locked','shouldShow'].every(k => typeof b[k] === 'boolean')
    && (b.isVerified === null || typeof b.isVerified === 'boolean') && nullableTime(b.pinIssuedAt) && integer(b.pinRevision)
    && (b.shouldShow ? b.required && !b.locked && b.isVerified !== true && typeof b.pin === 'string' && /^\d{4}$/.test(b.pin) : b.pin === undefined)); }
  if (j.waiting !== undefined) requireContract(object(j.waiting) && nullableTime(j.waiting.waitingEndsAt)
    && ['not_arrived','waiting','elapsed','ended'].includes(j.waiting.state));
  if (j.lastFareChange !== undefined) { const f = j.lastFareChange;
    requireContract(object(f) && f.schemaVersion === 1 && uuid(f.changeId) && integer(f.occurredAt) && f.currency === 'ILS' && f.reason === 'destination_changed'
      && [f.before,f.after].every(a => object(a) && integer(a.grossMinor) && integer(a.discountMinor) && integer(a.dueMinor)
        && a.discountMinor <= a.grossMinor && a.dueMinor === a.grossMinor - a.discountMinor)); }
  return j as Journey;
}

export function readDriverReceipt(value: unknown): DriverReceipt {
  requireContract(object(value)); const r = value as RecordValue;
  requireContract(r.schemaVersion === 1 && integer(r.orderId, 1) && uuid(r.requestId) && ['unknown','applied','rejected'].includes(r.state));
  if (r.state === 'rejected') requireContract(typeof r.error === 'string' && /^[A-Za-z0-9_:.-]{1,100}$/.test(r.error) && integer(r.httpStatus,400) && r.httpStatus < 600);
  return r as DriverReceipt;
}

export function readOrder(value: unknown): Order {
  requireContract(object(value)); const o = value as RecordValue;
  requireContract(integer(o.id,1) && services.includes(o.service) && statuses.includes(o.status) && isCity(o.pickupCity) && isCity(o.dropoffCity)
    && finite(o.price) && integer(o.createdAt) && integer(o.updatedAt) && typeof o.pickupNote === 'string' && typeof o.dropoffNote === 'string');
  for (const id of [o.customerId,o.driverId]) requireContract(id === null || integer(id,1));
  for (const point of [o.pickupPoint,o.dropoffPoint,o.driverLocation]) if (point != null) requireContract(object(point)
    && typeof point.latitude === 'number' && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
    && typeof point.longitude === 'number' && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180);
  if (o.recovery !== undefined) requireContract(object(o.recovery) && o.recovery.schemaVersion === 1
    && (o.recovery.version === null || integer(o.recovery.version,1)) && (o.recovery.assignmentEpoch === null || integer(o.recovery.assignmentEpoch)));
  if (o.dispatch != null) {
    const d = o.dispatch;
    requireContract(object(d) && uuid(d.roundId) && ['open','matched','exhausted','cancelled'].includes(d.state) && integer(d.deadlineAt));
    if (d.myOffer != null) requireContract(object(d.myOffer) && uuid(d.myOffer.offerId) && integer(d.myOffer.expiresAt) && integer(d.myOffer.issuedAt)
      && (d.myOffer.leaseNonce === null || typeof d.myOffer.leaseNonce === 'string' && d.myOffer.leaseNonce.length > 0 && d.myOffer.leaseNonce.length <= 256));
  }
  if (o.ride != null) requireContract(object(o.ride) && nullableTime(o.ride.arrivedAt) && nullableTime(o.ride.graceUntil)
    && typeof o.ride.boardingRequired === 'boolean' && typeof o.ride.boardingLocked === 'boolean'
    && (o.ride.boardingCode === undefined || typeof o.ride.boardingCode === 'string' && /^\d{4}$/.test(o.ride.boardingCode)));
  if (o.journey !== undefined) readJourney(o.journey);
  if (o.protocol !== undefined) {
    const p = o.protocol;
    requireContract(object(p) && integer(p.version,1) && integer(p.assignmentEpoch) && integer(p.nextCursor) && integer(p.serverTime)
      && p.snapshotRequired === true && Array.isArray(p.events) && p.events.length <= 100);
    let sequence = -1;
    for (const event of p.events) {
      requireContract(object(event) && uuid(event.eventId) && event.schemaVersion === 1 && integer(event.sequence) && event.sequence > sequence
        && integer(event.aggregateVersion,1) && integer(event.assignmentEpoch) && integer(event.occurredAt) && typeof event.type === 'string' && object(event.payload));
      sequence = event.sequence;
    }
  }
  return o as Order;
}

export function readPriceQuote(value: unknown): PriceQuote {
  requireContract(object(value)); const q = value as RecordValue;
  requireContract(finite(q.price) && finite(q.km) && finite(q.minutes) && finite(q.delayMinutes) && typeof q.estimated === 'boolean');
  if (q.quoteId !== undefined) requireContract(uuid(q.quoteId) && integer(q.quoteExpiresAt) && q.currency === 'ILS' && integer(q.priceMinor) && (q.commissionMinor === null || integer(q.commissionMinor)));
  for (const key of ['slow','closed','avoids']) requireContract(Array.isArray(q[key]) && q[key].every((item: unknown) => typeof item === 'string'));
  if (q.eta !== undefined) readEta(q.eta);
  return q as PriceQuote;
}

/** Validate the high-value interfaces we use; unknown additive fields remain compatible. */
export function validateApiResponse(url: string, value: unknown, method: string, now: number) {
  const path = new URL(url).pathname;
  if (/\/api\/(?:route(?:\/google)?|track\/[^/]+\/eta)$/.test(path) && object(value) && value.eta !== undefined) readEta(value.eta);
  if (/\/api\/orders\/\d+\/actions\//.test(path)) { readDriverReceipt(value); return; }
  if (/\/api\/orders\/commands\//.test(path)) { requireContract(object(value) && (value.orderId === null || integer(value.orderId,1))); return; }
  if (path.endsWith('/api/runtime/configuration')) { readRuntimeConfiguration(value, now); return; }
  if (path.endsWith('/api/runtime/capabilities')) {
    requireContract(object(value) && value.schemaVersion === 1 && object(value.capabilities));
    for (const capability of Object.values((value as RecordValue).capabilities)) requireContract(object(capability)
      && ['unavailable','disabled','configured'].includes(capability.state) && capability.operationalEvidence === 'not_checked');
    return;
  }
  if (path.endsWith('/api/price')) { readPriceQuote(value); return; }
  if (path.endsWith('/api/me')) {
    requireContract(object(value) && object(value.user) && integer(value.user.id,1) && ['customer','driver','admin'].includes(value.user.role)
      && ['active','pending','blocked'].includes(value.user.status) && object(value.settings));
    if ((value as RecordValue).capabilities !== undefined) requireContract(object((value as RecordValue).capabilities)
      && Array.isArray((value as RecordValue).capabilities.enabledServices) && (value as RecordValue).capabilities.enabledServices.every((s: unknown) => services.includes(s as 'parcel')));
    return;
  }
  if (method === 'GET' && path.endsWith('/api/jobs')) {
    if (Array.isArray(value)) value.forEach(readOrder);
    else { requireContract(object(value) && value.version === 1 && Array.isArray(value.jobs)); (value as RecordValue).jobs.forEach(readOrder); }
  } else if (method === 'GET' && /\/api\/orders(?:\/\d+)?$/.test(path)) {
    if (Array.isArray(value)) value.forEach(readOrder); else readOrder(value);
  } else if (/\/api\/(?:orders|jobs)(?:\/|$)/.test(path) && object(value) && value.id !== undefined && value.service !== undefined) readOrder(value);
}
