import type { Order } from '../../src/model.ts';
import type { Journey, JourneyEta, FareChange, FareAmounts, OfferFailure } from '../../src/journey-contracts.ts';
import type { Persistence, Row } from '../db/persistence.ts';
import type { RideLifecycle } from './ride-lifecycle.ts';

const safe = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0;
/** Calculation identity is supplied by the originating domain; serialization never renews it. */
export function etaProjection(raw: number | null, issuedAt: number, expiresAt: number, now = Date.now(),
  basis: JourneyEta['basis'] = 'heuristic', band?: [number, number]): JourneyEta | undefined {
  if (!safe(issuedAt) || !safe(expiresAt) || expiresAt <= issuedAt || !safe(now) || issuedAt > now || now >= expiresAt
    || raw !== null && (!safe(raw))) return undefined;
  const min = band?.[0] ?? raw, max = band?.[1] ?? (raw === null ? null : (Math.round(1.3 * Math.ceil(raw / 60)) + 2) * 60);
  if (!safe(min) || !safe(max) || max < min || raw !== null && (raw < min || raw > max)) return undefined;
  return { schemaVersion: 1, rawSeconds: raw, minSeconds: min, maxSeconds: max, basis,
    accuracy: basis === 'straight_line' ? 'low' : 'unknown', serverTime: now,
    validity: { issuedAt, expiresAt, expiresInSeconds: Math.max(0, Math.ceil((expiresAt - now) / 1000)) } };
}
export function fareAmounts(price: unknown, discount: unknown): FareAmounts {
  const minor = (value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('invalid_fare_amount');
    const result = Math.round((value + Number.EPSILON) * 100);
    if (!safe(result)) throw new Error('invalid_fare_amount');
    return result;
  };
  const grossMinor = minor(price), discountMinor = minor(discount ?? 0);
  if (discountMinor > grossMinor) throw new Error('invalid_fare_amount');
  return { grossMinor, discountMinor, dueMinor: grossMinor - discountMinor };
}
export function storedFareAmounts(row: Row): FareAmounts {
  if (row.price_minor === undefined) return fareAmounts(row.price, row.discount);
  const grossMinor = Number(row.price_minor), discountMinor = row.discount_minor == null ? 0 : Number(row.discount_minor);
  if (!safe(grossMinor) || !safe(discountMinor) || discountMinor > grossMinor) throw new Error('invalid_fare_amount');
  return { grossMinor, discountMinor, dueMinor: grossMinor - discountMinor };
}
export function acceptedFareChange(id: string, now: number, before: FareAmounts, after: FareAmounts): FareChange | undefined {
  if (before.grossMinor === after.grossMinor && before.discountMinor === after.discountMinor) return undefined;
  return { schemaVersion: 1, changeId: id, occurredAt: now, currency: 'ILS', reason: 'destination_changed', before, after };
}
export function validFareChange(value: unknown): value is FareChange {
  const c = value as FareChange;
  return !!c && c.schemaVersion === 1 && typeof c.changeId === 'string' && /^[a-f0-9-]{36}$/i.test(c.changeId)
    && safe(c.occurredAt) && c.currency === 'ILS' && c.reason === 'destination_changed'
    && [c.before, c.after].every(a => !!a && safe(a.grossMinor) && safe(a.discountMinor) && safe(a.dueMinor)
      && a.discountMinor <= a.grossMinor && a.dueMinor === a.grossMinor - a.discountMinor);
}
export async function journeyOrder(db: Persistence, lifecycle: RideLifecycle, order: Order, viewer: { id: number; role: string }) {
  const now = Date.now(), journey: Journey = { schemaVersion: 1, serverTime: now };
  const offer = order.dispatch?.myOffer;
  if (offer) journey.offer = { offerId: offer.offerId, issuedAt: offer.issuedAt, expiresAt: offer.expiresAt,
    acceptWindowSeconds: Math.max(0, (offer.expiresAt - offer.issuedAt) / 1000),
    eta: etaProjection(Math.ceil(offer.pickupEtaSeconds), offer.issuedAt, offer.expiresAt, now, offer.etaEstimated ? 'straight_line' : 'heuristic') };
  if (order.ride) {
    const row = await db.one('SELECT * FROM orders WHERE id=?', order.id);
    if (row) journey.boarding = await lifecycle.boardingInfo(order.id, viewer, row);
    const waitingEndsAt = order.ride.graceUntil;
    journey.waiting = { waitingEndsAt, state: !['assigned', 'at_pickup'].includes(order.status) ? 'ended'
      : waitingEndsAt === null ? 'not_arrived' : now < waitingEndsAt ? 'waiting' : 'elapsed' };
  }
  // Job-board viewers and former assignments are not entitled to private fare history.
  if (viewer.role === 'admin' || viewer.id === order.customerId || viewer.id === order.driverId) {
    const audit = await db.one("SELECT detail FROM security_events WHERE order_id=? AND action='DESTINATION_ACCEPTED' ORDER BY id DESC LIMIT 1", order.id);
    try {
      const detail: Row = typeof audit?.detail === 'string' ? JSON.parse(audit.detail) : audit?.detail;
      if (detail && validFareChange(detail.fareChange) && (viewer.role === 'admin' || viewer.id === order.customerId || detail.driverId === viewer.id && detail.assignedAt === order.assignedAt))
        journey.lastFareChange = detail.fareChange;
    } catch { /* Historical audit detail is not a typed fare record. */ }
  }
  return { ...order, journey };
}
export function offerFailure(verb: OfferFailure['verb'], code: string, status: number): OfferFailure {
  const category = status === 401 ? 'authentication' : status >= 500 || status === 429 ? 'transient'
    : status === 400 ? 'invalid' : status === 403 || status === 404 ? 'unavailable' : 'conflict';
  return { schemaVersion: 1, verb, code, category, recovery: category === 'authentication' ? 'sign_in'
    : category === 'transient' ? 'reconcile' : category === 'invalid' ? 'review' : category === 'unavailable' ? 'stop' : 'refresh' };
}
