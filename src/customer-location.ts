import { servedCity, type CityId, type Point } from './model.ts';

type Fix = { timestamp: number; coords: Point & { accuracy: number | null } };
type Pickup = { city: CityId; point: Point; accuracy: number };
type Subscription = { remove(): void };
type Failure = 'unavailable' | 'prompt' | 'permission' | 'blocked' | 'disabled' | 'timeout' | 'inaccurate';
// Native watches report free-text reasons; anything but our own codes counts as 'unavailable'.
export type PickupWatch = (receive: (fix: Fix) => void, fail: (reason: string) => void, signal: AbortSignal) => Promise<Subscription>;
const failureCodes = new Set<Failure>(['unavailable', 'prompt', 'permission', 'blocked', 'disabled', 'timeout', 'inaccurate']);

type Permission = { granted: boolean; canAskAgain?: boolean };
/** Opening a map may reuse consent; only the explicit location button may ask for it. */
export async function pickupPermission(read: () => Promise<Permission>, request: () => Promise<Permission>, canRequest: boolean, signal: AbortSignal) {
  const permission = await read();
  if (signal.aborted) throw new Error('cancelled');
  if (permission.granted) return permission;
  if (permission.canAskAgain === false) throw new Error('blocked');
  if (!canRequest) throw new Error('prompt');
  return request();
}

export function pickupErrorKey(error: unknown) {
  const reason = error instanceof Error ? error.message : '';
  return reason === 'outside' ? 'pinOutsideArea' : reason === 'prompt' ? 'locationPurpose'
    : reason === 'permission' ? 'locationPermissionDenied' : reason === 'blocked' ? 'locationPermissionBlocked'
      : reason === 'disabled' ? 'locationServicesDisabled' : reason === 'inaccurate' ? 'locationInaccurate'
        : reason === 'timeout' ? 'locationTimeout' : 'locationManual';
}

/** A cached pin hint must never hold the picker open or outlive its request. */
export function cachedPickup(read: () => Promise<Fix | null>, signal: AbortSignal, timeoutMs = 250): Promise<Point | null> {
  return new Promise(resolve => {
    let finished = false;
    const finish = (point: Point | null) => {
      if (finished) return;
      finished = true; clearTimeout(timer); signal.removeEventListener('abort', cancel); resolve(point);
    };
    const cancel = () => finish(null);
    const timer = setTimeout(cancel, timeoutMs);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) { cancel(); return; }
    Promise.resolve().then(() => finished ? null : read()).then(fix => {
      const result = fix && pickupFromFix(fix);
      finish(result && !('error' in result) ? result.point : null);
    }, cancel);
  });
}

/** Keep the native permission prompt inside the same timeout/cancellation as GPS. */
export function withPickupPermission(request: (signal: AbortSignal) => Promise<Permission>, watch: PickupWatch): PickupWatch {
  return async (receive, fail, signal) => {
    const permission = await request(signal);
    if (signal.aborted) throw new Error('cancelled');
    if (!permission.granted) throw new Error(permission.canAskAgain === false ? 'blocked' : 'permission');
    return watch(receive, fail, signal);
  };
}

/**
 * Expo 57's web watch passes its internal callback ID through the browser's unrelated
 * watch IDs and does not forward provider errors or high-accuracy options. Keep the
 * browser watch itself as the subscription so permissions, errors and cleanup work.
 * Calling watchPosition also requests permission; no separate unbounded first fix.
 */
export function browserPickupWatch(geolocation: Pick<Geolocation, 'watchPosition' | 'clearWatch'> | undefined): PickupWatch {
  return async (receive, fail) => {
    if (!geolocation) throw new Error('unavailable');
    const id = geolocation.watchPosition(receive, error => {
      fail(error.code === 1 ? 'permission' : error.code === 3 ? 'timeout' : 'unavailable');
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 });
    return { remove: () => geolocation.clearWatch(id) };
  };
}

export function pickupFromFix(fix: Fix, now = Date.now()): Pickup | { error: 'inaccurate' | 'outside' } {
  const { latitude, longitude, accuracy } = fix.coords;
  // A current-location button must not accept an old or city-scale position as an exact pickup.
  if (!Number.isFinite(fix.timestamp) || now - fix.timestamp > 30_000 || fix.timestamp - now > 5_000
    || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    || accuracy === null || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) return { error: 'inaccurate' };
  const point = { latitude, longitude }, city = servedCity(point);
  return city ? { city, point, accuracy } : { error: 'outside' };
}

/** Stop foreground collection after a usable fix, timeout, provider failure or navigation away. */
export function findPickup(watch: PickupWatch, signal?: AbortSignal, timeoutMs = 20_000): Promise<Pickup> {
  return new Promise((resolve, reject) => {
    let subscription: Subscription | undefined, finished = false, inaccurate = false;
    // Includes permission/provider setup, so a hidden or unanswered permission prompt
    // cannot freeze the booking form. Late permission results must not start a watch.
    const lifetime = new AbortController();
    const remove = () => { try { subscription?.remove(); } catch { /* Cleanup must not leave the caller pending. */ } };
    const finish = (result: Pickup | Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      lifetime.abort();
      remove();
      if (result instanceof Error) reject(result); else resolve(result);
    };
    const cancel = () => finish(new Error('cancelled'));
    const timer = setTimeout(() => finish(new Error(inaccurate ? 'inaccurate' : 'timeout')), timeoutMs);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    Promise.resolve().then(() => {
      if (finished) return;
      return watch(fix => {
        if (finished) return;
        const result = pickupFromFix(fix);
        if ('error' in result) {
          if (result.error === 'outside') finish(new Error('outside'));
          else inaccurate = true;
        } else finish(result);
      }, reason => finish(new Error(reason === 'timeout' && inaccurate ? 'inaccurate' : failureCodes.has(reason as Failure) ? reason : 'unavailable')), lifetime.signal);
    }).then(next => {
      subscription = next;
      if (finished) remove();
    }, error => finish(new Error(error instanceof Error && failureCodes.has(error.message as Failure) ? error.message : 'unavailable')));
  });
}
