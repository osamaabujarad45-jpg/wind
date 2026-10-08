export type TrackingContext = { id: string; token: string; actor: number; orderId: number };
export type DriverFix = { timestamp: number; coords: { latitude: number; longitude: number; heading?: number | null; accuracy?: number | null } };
export type TrackingReceipt = { id: string; lastSentAt: number; fixAt: number; failed?: boolean };

// A headless task can outlive a screen or login. Check persisted authority before every upload.
export async function deliverDriverFix(fix: DriverFix, io: {
  context: () => Promise<TrackingContext | null>;
  token: () => Promise<string | null>;
  receipt: () => Promise<TrackingReceipt | null>;
  post: (token: string, body: object) => Promise<number>;
  acknowledge: (receipt: TrackingReceipt) => Promise<void>;
  stop: (id: string) => Promise<void>;
}, now = Date.now()) {
  const context = await io.context();
  if (!context) return;
  if (await io.token() !== context.token) { await io.stop(context.id); return; }
  const { latitude, longitude, heading, accuracy } = fix.coords;
  if (!Number.isFinite(fix.timestamp) || now - fix.timestamp > 60_000 || fix.timestamp > now + 5_000 ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
  const receipt = await io.receipt();
  if (receipt?.id === context.id && receipt.fixAt >= fix.timestamp) return;
  if ((await io.context())?.id !== context.id || await io.token() !== context.token) return;
  let status = 0;
  try {
    status = await io.post(context.token, { latitude, longitude,
      ...(heading != null && heading >= 0 && heading <= 360 && { heading }),
      ...(accuracy != null && accuracy >= 0 && accuracy <= 5000 && { accuracy }) });
  } catch { /* The next fresh fix retries; stale coordinates are never queued. */ }
  if ((await io.context())?.id !== context.id) return;
  if ([401, 403, 409].includes(status)) { await io.stop(context.id); return; }
  await io.acknowledge(status >= 200 && status < 300
    ? { id: context.id, lastSentAt: now, fixAt: fix.timestamp }
    : { id: context.id, lastSentAt: receipt?.id === context.id ? receipt.lastSentAt : 0,
      fixAt: receipt?.id === context.id ? receipt.fixAt : 0, failed: true });
}
