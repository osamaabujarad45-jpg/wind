export type ActiveGps = { deviceId: string; sessionId: string; seq: number; assignments: { orderId: number; assignmentEpoch: number }[] };
export type TrackingContext = { id: string; token: string; actor: number; orderId: number; activeGps?: ActiveGps };
export type DriverFix = { timestamp: number; mocked?: boolean; coords: { latitude: number; longitude: number; heading?: number | null; accuracy?: number | null; speed?: number | null } };

/**
 * Heading worth sending: only while clearly moving on a decent fix. Android reports bearing 0 (north) and speed 0 when
 * it has neither, and indoor GPS jitter reads as 1-2 m/s with a random course (seen on the A53 at a 33 m fix), so a
 * parked car would point anywhere and force the route to start that way.
 * ponytail: 2.5 m/s (9 km/h) and 50 m; tune from real driving traces.
 */
export const movingHeading = (heading?: number | null, speed?: number | null, accuracy?: number | null) =>
  heading != null && speed != null && speed > 2.5 && (accuracy == null || accuracy <= 50) && heading >= 0 && heading <= 360 ? heading : undefined;
export type TrackingReceipt = { id: string; lastSentAt: number; fixAt: number; lastTriedAt?: number; failed?: boolean };

// Background callbacks can overlap; one at a time, so the receipt check orders and dedups fixes.
let queue: Promise<void> = Promise.resolve();
const attempts = new WeakMap<object, { id:string; at:number }>();
export function deliverDriverFix(...args: Parameters<typeof deliverOnce>) {
  const run = queue.then(() => deliverOnce(...args));
  queue = run.catch(() => {});
  return run;
}

export const MIN_GAP = 2_000;
export const locationCadence = (speed?: number | null, accuracy?: number | null) =>
  typeof speed === 'number' && Number.isFinite(speed) && speed > 2.5 && typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 50 ? 5_000 : 15_000;

// A headless task can outlive a screen or login. Check persisted authority before every upload.
async function deliverOnce(fix: DriverFix, io: {
  context: () => Promise<TrackingContext | null>;
  token: () => Promise<string | null>;
  receipt: () => Promise<TrackingReceipt | null>;
  post: (token: string, body: object) => Promise<{ status: number; accepted?: boolean }>;
  acknowledge: (receipt: TrackingReceipt) => Promise<void>;
  stop: (id: string) => Promise<void>;
  monotonic?: () => number;
  reserve?: (id: string) => Promise<ActiveGps | null>;
}, now = Date.now()) {
  const context = await io.context();
  if (!context) return;
  if (await io.token() !== context.token) { await io.stop(context.id); return; }
  const { latitude, longitude, accuracy } = fix.coords, heading = movingHeading(fix.coords.heading, fix.coords.speed, fix.coords.accuracy);
  if (fix.mocked === true || !Number.isFinite(fix.timestamp) || now - fix.timestamp > 30_000 || fix.timestamp > now + 5_000 ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
  const receipt = await io.receipt();
  const lastTried = receipt?.id === context.id ? receipt.lastTriedAt ?? receipt.lastSentAt : 0;
  const clockRewound = !!lastTried && now < lastTried - 5_000;
  if (!clockRewound && receipt?.id === context.id && receipt.fixAt >= fix.timestamp) return;
  // Apply the transport floor and movement cadence to every attempted upload, including rejected ones.
  const monotonic=io.monotonic?.() ?? now, previousAttempt=attempts.get(io);
  const elapsed=previousAttempt?.id===context.id ? monotonic-previousAttempt.at : lastTried ? now-lastTried : Infinity;
  if (elapsed < Math.max(MIN_GAP, locationCadence(fix.coords.speed, accuracy))) return;
  if ((await io.context())?.id !== context.id || await io.token() !== context.token) return;
  const previous = receipt?.id === context.id && !clockRewound ? receipt : { id: context.id, lastSentAt: 0, fixAt: 0 };
  await io.acknowledge({ ...previous, lastTriedAt: now });
  if ((await io.context())?.id !== context.id || await io.token() !== context.token) return;
  const activeGps = context.activeGps ? await io.reserve?.(context.id) : undefined;
  if (context.activeGps && !activeGps) return;
  if ((await io.context())?.id !== context.id || await io.token() !== context.token) return;
  attempts.set(io,{id:context.id,at:monotonic});
  let status = 0;
  let accepted: boolean | undefined;
  try {
    // Age, not the phone's clock time: the API orders fixes by it and drops late or replayed ones.
    const response = await io.post(context.token, { latitude, longitude, age: Math.max(0, now - fix.timestamp),
      ...(heading != null && { heading }),
      ...(accuracy != null && accuracy >= 0 && accuracy <= 5000 && { accuracy }),
      ...(activeGps && { activeGps }) });
    status = response.status;
    accepted = response.accepted;
  } catch { /* The next fresh fix retries; stale coordinates are never queued. */ }
  if ((await io.context())?.id !== context.id) return;
  if (await io.token() !== context.token) { await io.stop(context.id); return; }
  if ([401, 403, 409].includes(status)) { await io.stop(context.id); return; }
  // An old/replayed fix can be intentionally ignored with HTTP 200. It must not
  // refresh the sharing indicator or consume the next fresh measurement.
  if (status >= 200 && status < 300 && (accepted === false || (context.activeGps && accepted !== true))) {
    if (context.activeGps) await io.stop(context.id);
    return;
  }
  await io.acknowledge(status >= 200 && status < 300
    ? { id: context.id, lastSentAt: now, fixAt: fix.timestamp, lastTriedAt: now }
    : { ...previous, lastTriedAt: now, failed: true });
}
