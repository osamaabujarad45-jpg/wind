export type TrackingContext = { id: string; token: string; actor: number; orderId: number };
export type DriverFix = { timestamp: number; coords: { latitude: number; longitude: number; heading?: number | null; accuracy?: number | null; speed?: number | null } };

/**
 * Heading worth sending: only while clearly moving on a decent fix. Android reports bearing 0 (north) and speed 0 when
 * it has neither, and indoor GPS jitter reads as 1-2 m/s with a random course (seen on the A53 at a 33 m fix), so a
 * parked car would point anywhere and force the route to start that way.
 * ponytail: 2.5 m/s (9 km/h) and 50 m; tune from real driving traces.
 */
export const movingHeading = (heading?: number | null, speed?: number | null, accuracy?: number | null) =>
  heading != null && speed != null && speed > 2.5 && (accuracy == null || accuracy <= 50) && heading >= 0 && heading <= 360 ? heading : undefined;
export type TrackingReceipt = { id: string; lastSentAt: number; fixAt: number; failed?: boolean };

// Background callbacks can overlap; one at a time, so the receipt check orders and dedups fixes.
let queue: Promise<void> = Promise.resolve();
export function deliverDriverFix(...args: Parameters<typeof deliverOnce>) {
  const run = queue.then(() => deliverOnce(...args));
  queue = run.catch(() => {});
  return run;
}

export const MIN_GAP = 2_000;

// A headless task can outlive a screen or login. Check persisted authority before every upload.
async function deliverOnce(fix: DriverFix, io: {
  context: () => Promise<TrackingContext | null>;
  token: () => Promise<string | null>;
  receipt: () => Promise<TrackingReceipt | null>;
  post: (token: string, body: object) => Promise<{ status: number; accepted?: boolean }>;
  acknowledge: (receipt: TrackingReceipt) => Promise<void>;
  stop: (id: string) => Promise<void>;
}, now = Date.now()) {
  const context = await io.context();
  if (!context) return;
  if (await io.token() !== context.token) { await io.stop(context.id); return; }
  const { latitude, longitude, accuracy } = fix.coords, heading = movingHeading(fix.coords.heading, fix.coords.speed, fix.coords.accuracy);
  if (!Number.isFinite(fix.timestamp) || now - fix.timestamp > 60_000 || fix.timestamp > now + 5_000 ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
  const receipt = await io.receipt();
  if (receipt?.id === context.id && receipt.fixAt >= fix.timestamp) return;
  // iOS reports about once a second while moving (it has no time interval); one upload per 2 s stays under the API limit.
  if (receipt?.id === context.id && !receipt.failed && now - receipt.lastSentAt < MIN_GAP) return;
  if ((await io.context())?.id !== context.id || await io.token() !== context.token) return;
  let status = 0;
  let accepted: boolean | undefined;
  try {
    // Age, not the phone's clock time: the API orders fixes by it and drops late or replayed ones.
    const response = await io.post(context.token, { latitude, longitude, age: Math.max(0, now - fix.timestamp),
      ...(heading != null && { heading }),
      ...(accuracy != null && accuracy >= 0 && accuracy <= 5000 && { accuracy }) });
    status = response.status;
    accepted = response.accepted;
  } catch { /* The next fresh fix retries; stale coordinates are never queued. */ }
  if ((await io.context())?.id !== context.id) return;
  if ([401, 403, 409].includes(status)) { await io.stop(context.id); return; }
  // An old/replayed fix can be intentionally ignored with HTTP 200. It must not
  // refresh the sharing indicator or consume the next fresh measurement.
  if (status >= 200 && status < 300 && accepted === false) return;
  await io.acknowledge(status >= 200 && status < 300
    ? { id: context.id, lastSentAt: now, fixAt: fix.timestamp }
    : { id: context.id, lastSentAt: receipt?.id === context.id ? receipt.lastSentAt : 0,
      fixAt: receipt?.id === context.id ? receipt.fixAt : 0, failed: true });
}
