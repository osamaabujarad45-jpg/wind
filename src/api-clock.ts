let offset = 0;
/** Server clock minus device clock. Long-held responses cannot reliably estimate skew. */
export const serverOffset = () => offset;
export function noteServerDate(date: string | null, now = Date.now(), roundTripMs = 0) {
  const server = date ? Date.parse(date) : NaN;
  if (Number.isFinite(server) && roundTripMs <= 5_000) offset = Math.abs(server - now) > 5_000 + roundTripMs ? server - now : 0;
}
type ClockEnvelope = { serverTime: number };
const anchors = new WeakMap<object, { server: number; monotonic: number }>();
/** The entire measured transit interval is charged conservatively against a deadline. */
export function noteResponseClock(value: unknown, roundTripMs: number, monotonic = performance.now()) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach(item => noteResponseClock(item, roundTripMs, monotonic)); return; }
  const record = value as Record<string, unknown>;
  if (Number.isSafeInteger(record.serverTime) && Number(record.serverTime) >= 0)
    anchors.set(value, { server: Number(record.serverTime) + Math.max(0, roundTripMs), monotonic });
  for (const key of ['journey', 'eta', 'offer', 'jobs']) if (record[key]) noteResponseClock(record[key], roundTripMs, monotonic);
}
export function deadlineMilliseconds(deadline: number, envelope?: ClockEnvelope, wallNow = Date.now(), monotonic = performance.now()) {
  const anchor = envelope && anchors.get(envelope);
  const now = anchor ? anchor.server + Math.max(0, monotonic - anchor.monotonic) : wallNow + serverOffset();
  return Math.max(0, deadline - now);
}
export const deadlineSeconds = (deadline: number, envelope?: ClockEnvelope, wallNow = Date.now(), monotonic = performance.now()) =>
  Math.ceil(deadlineMilliseconds(deadline, envelope, wallNow, monotonic) / 1000);
