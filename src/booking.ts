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
