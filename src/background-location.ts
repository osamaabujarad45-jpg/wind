import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { API_URL } from './api';
import { deliverDriverFix, type ActiveGps, type TrackingContext, type TrackingReceipt } from './location-delivery';
import { acquireActiveGps } from './active-gps-session';

const TASK = 'wind-active-delivery-location';
const CONTEXT = 'wind.tracking';
const RECEIPT = 'wind.tracking.receipt';
const DEVICE = 'wind.active-gps.device';
const CANDIDATE = 'wind.active-gps.candidate';
const SEQUENCE = 'wind.active-gps.sequence';
export const activeGpsTestEnabled = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_TEST_ACTIVE_GPS === '1';
const accessible = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
// T39: the driver screen's 3 s tracking poll re-reads the same context/receipt records every tick. A short
// per-key cache with write invalidation keeps that poll off SecureStore without weakening freshness: any
// write (and every delete) refreshes or drops the entry, so the delivery path still reads what it just wrote
// and authority changes take effect immediately. The auth token is never cached — logout must win at once.
const readCache = new Map<string, { at: number; value: string | null }>();
const READ_TTL_MS = 2_000;
async function read<T>(key: string): Promise<T | null> {
  const cached = readCache.get(key);
  const value = cached && Date.now() - cached.at < READ_TTL_MS
    ? cached.value
    : await SecureStore.getItemAsync(key).then(found => { readCache.set(key, { at: Date.now(), value: found }); return found; });
  try { return value ? JSON.parse(value) as T : null; } catch { return null; }
}
function invalidateRead(key: string) { readCache.delete(key); }
let queue = Promise.resolve();
// A restored native registration is not authority for this JavaScript launch.
let trackingEnabled = false;
let authorityGeneration = 0;
const serial = <T,>(action: () => Promise<T>): Promise<T> => {
  const next = queue.then(action, action);
  queue = next.then(() => {}, () => {});
  return next;
};
export function stopBackgroundLocation(expectedId?: string) {
  if (Platform.OS === 'web') return Promise.resolve();
  // Revoke in-memory authority immediately, even if registration is still in flight.
  // An ID-scoped stop must first verify its context so it cannot revoke a replacement.
  if (!expectedId) { trackingEnabled = false; authorityGeneration++; }
  return serial(async () => {
    if (expectedId && (await read<TrackingContext>(CONTEXT))?.id !== expectedId) return;
    trackingEnabled = false;
    await SecureStore.deleteItemAsync(CONTEXT);
    await SecureStore.deleteItemAsync(RECEIPT);
    invalidateRead(CONTEXT); invalidateRead(RECEIPT);
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
  });
}
export function startBackgroundLocation(actor: number, orderId: number, orderIds?: number[], valid: () => boolean = () => true) {
  const generation = authorityGeneration;
  return serial(async () => {
    const token = await SecureStore.getItemAsync('token');
    if (!token || generation !== authorityGeneration || !valid()) return;
    // The single context envelope binds the existing session token to this assignment.
    const previous = await read<TrackingContext>(CONTEXT);
    let context: TrackingContext;
    if (activeGpsTestEnabled) {
      // Always replace from fresh foreground authority; never acquire in a task callback.
      trackingEnabled = false;
      const stillValid = () => generation === authorityGeneration && valid();
      let activeGps: ActiveGps | null;
      try {
        activeGps = await acquireActiveGps(actor, orderIds ?? [], {
          token: () => SecureStore.getItemAsync('token'), valid: stillValid, uuid: () => Crypto.randomUUID(),
          deviceId: async () => {
            let id = await SecureStore.getItemAsync(DEVICE);
            if (!id) { id = Crypto.randomUUID(); await SecureStore.setItemAsync(DEVICE, id, accessible); }
            return id;
          },
          readCandidate: () => read(CANDIDATE),
          writeCandidate: value => value ? SecureStore.setItemAsync(CANDIDATE, JSON.stringify(value), accessible) : SecureStore.deleteItemAsync(CANDIDATE),
          request: async (key, body) => {
            const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15_000);
            try {
              const response = await fetch(`${API_URL}/api/location/session`, { method: 'POST', signal: controller.signal,
                headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
              if (!response.ok) { if (response.status === 409) await SecureStore.deleteItemAsync(CANDIDATE); throw new Error(`Active GPS session ${response.status}`); }
              return await response.json();
            } finally { clearTimeout(timer); }
          },
        });
      } catch (error) { await SecureStore.deleteItemAsync(CONTEXT); throw error; }
      if (!activeGps || !stillValid() || await SecureStore.getItemAsync('token') !== token) return;
      const saved = await read<{ sessionId: string; seq: number }>(SEQUENCE);
      if (!stillValid() || await SecureStore.getItemAsync('token') !== token) return;
      if (saved?.sessionId === activeGps.sessionId && Number.isSafeInteger(saved.seq)) activeGps.seq = Math.max(activeGps.seq, saved.seq);
      if (previous?.token === token && previous.activeGps?.sessionId === activeGps.sessionId)
        activeGps.seq = Math.max(activeGps.seq, previous.activeGps.seq);
      context = { id: Crypto.randomUUID(), token, actor, orderId, activeGps };
    } else {
      context = trackingEnabled && previous?.token === token && previous.actor === actor && previous.orderId === orderId
        ? previous : { id: Crypto.randomUUID(), token, actor, orderId };
    }
    await SecureStore.setItemAsync(CONTEXT, JSON.stringify(context), accessible); invalidateRead(CONTEXT);
    if (generation !== authorityGeneration || !valid() || await SecureStore.getItemAsync('token') !== token) return;
    // Registration can survive process replacement while its Android foreground service does not.
    // Re-register from the foreground so Expo refreshes the consumer and restarts that service.
    try {
      trackingEnabled = true;
      await Location.startLocationUpdatesAsync(TASK, {
        // A fix every ~3 s while the job is active: the customer's marker can move continuously, not hop every 20 s.
        // Automotive navigation is iOS's profile for vehicle tracking (fixes filtered for road travel).
        accuracy: Location.Accuracy.High, timeInterval: 3_000, distanceInterval: 0, activityType: Location.ActivityType.AutomotiveNavigation,
        deferredUpdatesInterval: 3_000, deferredUpdatesDistance: 0,
        pausesUpdatesAutomatically: false, showsBackgroundLocationIndicator: true,
        foregroundService: { notificationTitle: 'Wind',
          notificationBody: 'مشاركة الموقع أثناء التوصيل · Sharing location during delivery',
          notificationColor: '#12342A', killServiceOnDestroy: false },
      });
    } catch (error) { trackingEnabled = false; await SecureStore.deleteItemAsync(CONTEXT); throw error; }
  });
}
export async function backgroundLocationState(): Promise<'off' | 'starting' | 'sharing'> {
  if (!trackingEnabled) return 'off';
  const context = await read<TrackingContext>(CONTEXT);
  if (!context || !await Location.hasStartedLocationUpdatesAsync(TASK)) return 'off';
  const receipt = await read<TrackingReceipt>(RECEIPT);
  const age=receipt ? Date.now()-receipt.lastSentAt : -1;
  return receipt?.id === context.id && !receipt.failed && age>=0 && age<60_000 ? 'sharing' : 'starting';
}

const deliveryIO = {
    context: async () => {
      if (!trackingEnabled) return null;
      const generation = authorityGeneration, context = await read<TrackingContext>(CONTEXT);
      return trackingEnabled && generation === authorityGeneration ? context : null;
    }, token: () => SecureStore.getItemAsync('token'),
    receipt: () => read<TrackingReceipt>(RECEIPT), stop: stopBackgroundLocation,
    reserve: id => serial(async () => {
      const generation = authorityGeneration;
      if (!trackingEnabled) return null;
      const context = await read<TrackingContext>(CONTEXT);
      if (!trackingEnabled || generation !== authorityGeneration || context?.id !== id || !context.activeGps ||
          await SecureStore.getItemAsync('token') !== context.token || !Number.isSafeInteger(context.activeGps.seq + 1)) return null;
      const saved = await read<{ sessionId: string; seq: number }>(SEQUENCE);
      const last = saved?.sessionId === context.activeGps.sessionId && Number.isSafeInteger(saved.seq) ? Math.max(saved.seq, context.activeGps.seq) : context.activeGps.seq;
      if (!Number.isSafeInteger(last + 1) || !trackingEnabled || generation !== authorityGeneration || await SecureStore.getItemAsync('token') !== context.token) return null;
      const activeGps = { ...context.activeGps, seq: last + 1 };
      await SecureStore.setItemAsync(SEQUENCE, JSON.stringify({ sessionId: activeGps.sessionId, seq: activeGps.seq }), accessible); invalidateRead(SEQUENCE);
      if (!trackingEnabled || generation !== authorityGeneration) return null;
      await SecureStore.setItemAsync(CONTEXT, JSON.stringify({ ...context, activeGps }), accessible); invalidateRead(CONTEXT);
      return trackingEnabled && generation === authorityGeneration ? activeGps : null;
    }),
    acknowledge: receipt => SecureStore.setItemAsync(RECEIPT, JSON.stringify(receipt), accessible).then(() => invalidateRead(RECEIPT)),
    monotonic: () => globalThis.performance?.now?.() ?? Date.now(),
    post: async (token, body) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(`${API_URL}/api/location`, { method: 'POST', signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const receipt = await response.json().catch(() => null) as { accepted?: boolean } | null;
        return { status: response.ok && !receipt ? 502 : response.status, accepted: receipt?.accepted };
      } finally { clearTimeout(timer); }
    },
  } satisfies Parameters<typeof deliverDriverFix>[1];

// Imported by index.js before Router, including when Expo starts JavaScript without mounting screens.
if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(TASK)) TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error || !data?.locations.length) return;
  if (!trackingEnabled) {
    // A stale task may run before React restores and validates the account.
    const restored = await read<TrackingContext>(CONTEXT);
    if (restored) await stopBackgroundLocation(restored.id);
    return;
  }
  const fix = data.locations.reduce((latest, candidate) => candidate.timestamp > latest.timestamp ? candidate : latest);
  await deliverDriverFix(fix, deliveryIO);
});
