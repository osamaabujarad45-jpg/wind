import { isCity, optionsFor, services, type CityId, type Point, type Service } from './model.ts';

export type BookingPayload = {
  service: Service; pickupCity: CityId; dropoffCity: CityId; pickupPoint: Point | null;
  pickupNote: string; dropoffNote: string; contact: string; detail: string;
  option: string; loadingHelp: boolean; shared: false; quotedPrice: number; scheduledFor?: number;
};
export type PendingBooking = { requestId: string; payload: BookingPayload };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newRequestId(): string {
  // Retry identity, never a credential or proof secret.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const n = Math.floor(Math.random() * 16);
    return (c === 'x' ? n : (n & 3) | 8).toString(16);
  });
}
export const newBooking = (payload: BookingPayload): PendingBooking => ({ requestId: newRequestId(), payload });

export function readBooking(saved: string | null): PendingBooking | null {
  if (saved === null) return null;
  const booking: PendingBooking = JSON.parse(saved);
  const p = booking?.payload;
  if (!uuid.test(booking?.requestId) || !p || !services.includes(p.service) || !isCity(p.pickupCity) || !isCity(p.dropoffCity)
    || !optionsFor(p.service).includes(p.option) || p.shared !== false || typeof p.loadingHelp !== 'boolean'
    || !Number.isFinite(p.quotedPrice) || p.quotedPrice < 1
    || ['pickupNote', 'dropoffNote', 'contact', 'detail'].some(key => typeof p[key as 'detail'] !== 'string')
    || (p.scheduledFor !== undefined && !Number.isInteger(p.scheduledFor))
    || (p.pickupPoint !== null && (!Number.isFinite(p.pickupPoint?.latitude) || !Number.isFinite(p.pickupPoint?.longitude)))) {
    throw new Error('invalid_pending_booking');
  }
  return booking;
}

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
