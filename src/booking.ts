import { isCity, optionsFor, services, type CityId, type Order, type Point, type Role, type Service } from './model.ts';
import { validFreightScope, type FreightScope } from './freight-scope.ts';
import { newRequestId } from './command-id.ts';
export { newRequestId } from './command-id.ts';

export type BookingPayload = {
  service: Service; pickupCity: CityId; dropoffCity: CityId; pickupPoint: Point | null; dropoffPoint?: Point | null;
  pickupNote: string; dropoffNote: string; contact: string; detail: string;
  option: string; loadingHelp: boolean; shared: false; quotedPrice: number; scheduledFor?: number;
  quoteId?: string; // server-locked quote (WP08); when set, the wire body omits quotedPrice
  declaredScope?: FreightScope;
  promoCode?: string; expectedDiscount?: number;
  recipientName?: string; recipientPhone?: string; // parcels and loads (SPEC-parcel-recipient.md)
  pricing?: 'smart'; // the server's recommended price (SPEC-driver-offers.md); absent = fixed tariff
};
export type PendingBooking = {
  requestId: string; payload: BookingPayload;
  sentAt?: number; // first save; locates the order this command may have created
  attemptedAt?: number; // last POST start; absence is only trusted once the server can no longer be committing it
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One retry id per unsent text: a failed text keeps its id when resent, even after other texts went out in between. */
export function retryIds() {
  const ids = new Map<string, string>();
  return {
    for(text: string) { let id = ids.get(text); if (!id) ids.set(text, id = newRequestId()); return id; },
    sent(text: string) { ids.delete(text); },
  };
}
export const newBooking = (payload: BookingPayload): PendingBooking => {
  const now = Date.now();
  return { requestId: newRequestId(), payload, sentAt: now, attemptedAt: now };
};

/** The account's own slot: another account on the same device never reads this payload. */
export const pendingKey = (userId: number) => `booking.${userId}`;

/** Wire body for POST /orders: a locked quote travels by id alone (quotedPrice beside it is a 400). */
export function orderRequest(command: PendingBooking) {
  if (!command.payload.quoteId) return { ...command.payload, requestId: command.requestId };
  const rest: BookingPayload & { requestId: string } = { ...command.payload, requestId: command.requestId };
  delete (rest as { quotedPrice?: number }).quotedPrice;
  return rest;
}

// Order again (SPEC-order-again.md): a customer's ended order refills the booking form.
export const canOrderAgain = (order: Pick<Order, 'status'>, role: Role | undefined) =>
  role === 'customer' && ['completed', 'returned', 'cancelled'].includes(order.status);
/** The route and item of an old order. Never its price, promo, time or request ID: those belong to the new booking. */
export function againForm(order: Order) {
  return {
    service: order.service, pickupCity: order.pickupCity, dropoffCity: order.dropoffCity,
    pickupPoint: order.pickupPoint ?? null, dropoffPoint: order.dropoffPoint ?? null,
    pickupNote: order.pickupNote, dropoffNote: order.dropoffNote, detail: order.detail, contact: order.contact ?? '',
    recipientName: order.recipientName ?? '', recipientPhone: order.recipientPhone ?? '',
    option: optionsFor(order.service).includes(order.option) ? order.option : optionsFor(order.service)[0],
    loadingHelp: order.loadingHelp,
  };
}

// Send another (SPEC-send-another.md): a shop's next parcel from the same place; the buyer's details never carry over.
export const canSendAnother = (order: Pick<Order, 'status' | 'service'>, role: Role | undefined) =>
  role === 'customer' && order.service === 'parcel' && order.status !== 'cancelled';
export function pickupForm(order: Order) {
  const { service, option, pickupCity, pickupPoint, pickupNote } = againForm(order);
  return { service, option, pickupCity, pickupPoint, pickupNote };
}

export function readBooking(saved: string | null): PendingBooking | null {
  if (saved === null) return null;
  const booking: PendingBooking = JSON.parse(saved);
  const p = booking?.payload;
  if (!uuid.test(booking?.requestId) || !p || !services.includes(p.service) || !isCity(p.pickupCity) || !isCity(p.dropoffCity)
    || !optionsFor(p.service).includes(p.option) || p.shared !== false || typeof p.loadingHelp !== 'boolean'
    || !Number.isFinite(p.quotedPrice) || p.quotedPrice < 1
    || ['pickupNote', 'dropoffNote', 'contact', 'detail'].some(key => typeof p[key as 'detail'] !== 'string')
    || (p.scheduledFor !== undefined && !Number.isInteger(p.scheduledFor))
    || (p.promoCode !== undefined && (typeof p.promoCode !== 'string' || !Number.isInteger(p.expectedDiscount)))
    || ['recipientName', 'recipientPhone'].some(key => p[key as 'recipientName'] !== undefined && typeof p[key as 'recipientName'] !== 'string')
    || (p.pricing !== undefined && p.pricing !== 'smart')
    || (p.quoteId !== undefined && !uuid.test(p.quoteId))
    || (p.declaredScope !== undefined && (p.service !== 'freight' || !validFreightScope(p.declaredScope)))
    || (booking.sentAt !== undefined && !Number.isFinite(booking.sentAt))
    || (booking.attemptedAt !== undefined && !Number.isFinite(booking.attemptedAt))
    || [p.pickupPoint, p.dropoffPoint].some(point => point != null && (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)))
    || p.pickupPoint === undefined) {
    throw new Error('invalid_pending_booking');
  }
  return booking;
}

/** The read-only answer to "did this stored command become an order?" Unknown is never an absence. */
export type PendingOutcome = { state: 'present'; orderId: number } | { state: 'absent' } | { state: 'unknown' };

/**
 * A command receipt identifies the exact booking even after its fare or destination changes.
 * A missing receipt remains unknown: the original POST could still commit. Retry keeps its identity.
 */
export function pendingOutcome(receipt: unknown): PendingOutcome {
  const orderId = receipt && typeof receipt === 'object' && 'orderId' in receipt ? receipt.orderId : null;
  return typeof orderId === 'number' && Number.isSafeInteger(orderId) && orderId > 0
    ? { state: 'present', orderId } : { state: 'unknown' };
}

/** Editing or discarding is only safe on a server-confirmed absence; present or unknown keep the frozen form. */
export const pendingReleasable = (outcome: PendingOutcome | null) => outcome?.state === 'absent';

// Scheduling is in Palestine time whatever the phone's zone, matching how every booked time is displayed.
export const HEBRON = 'Asia/Hebron';
const clock = new Intl.DateTimeFormat('en-GB', { timeZone: HEBRON, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const partsOf = (ms: number) => Object.fromEntries(clock.formatToParts(ms).map(p => [p.type, p.value])) as Record<string, string>;
/** Calendar day in Palestine, e.g. "2026-10-05". */
export const dayKey = (ms: number) => { const p = partsOf(ms); return `${p.year}-${p.month}-${p.day}`; };

/** 30-minute pickup slots from 06:00 to 22:00 Palestine time, one hour to just under seven days ahead. */
export function scheduleSlots(now = Date.now()) {
  const out: number[] = [];
  const step = 30 * 60_000; // Palestine's UTC offset is whole hours, so UTC half-hours are local half-hours
  for (let t = Math.ceil((now + 60 * 60_000) / step) * step; t <= now + 6.9 * 86_400_000; t += step) {
    const p = partsOf(t);
    const minutes = Number(p.hour) * 60 + Number(p.minute);
    if (minutes >= 6 * 60 && minutes <= 22 * 60) out.push(t);
  }
  return out;
}
