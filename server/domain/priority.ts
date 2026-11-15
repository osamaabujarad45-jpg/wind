// A12 same-day parcel priority: one parcel attribute, no surcharge and no reserved capacity.
// The time rule itself lives in src/model.ts so the booking screen and the server judge the same clock.
import { sameDayBookingOpen, validParcelPriority, type ParcelPriority } from '../../src/model.ts';

type Fail = (status: number, message: string) => never;

/** The priority a booking commits. Omitted means standard, so every pre-A12 client keeps its meaning. */
export function bookingPriority(service: unknown, value: unknown, fail: Fail): ParcelPriority {
  if (!validParcelPriority(service, value)) fail(400, 'invalid_priority');
  return (value ?? 'standard') as ParcelPriority;
}

/** Only an explicit same_day is refused by the clock; standard always books. */
export function checkPriorityCutoff(priority: ParcelPriority, fail: Fail, now = Date.now()) {
  if (priority === 'same_day' && !sameDayBookingOpen(now)) fail(409, 'priority_cutoff');
}

/** Replay identity: omitted and explicit standard are one command, so stored historical hashes still match. */
export function priorityIdentity<T extends object>(body: T): T {
  if ((body as { priority?: unknown }).priority !== 'standard') return body;
  const { priority: _standard, ...rest } = body as T & { priority: unknown };
  return rest as T;
}
