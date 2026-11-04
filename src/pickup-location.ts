// One usable GPS fix for a pickup, on every platform. Opening a screen may reuse consent (canRequest false); only an
// explicit location action may raise the system prompt.
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { storage } from './storage';
import type { Point } from './model';
import { browserPickupWatch, findPickup, pickupPermission, withPickupPermission } from './customer-location';

export function pickupLocation(signal: AbortSignal, canRequest = true) {
  return findPickup(Platform.OS === 'web' ? async (receive, fail, lifetime) => {
    if (!canRequest) {
      const permission = await navigator.permissions?.query({ name: 'geolocation' }).catch(() => null);
      if (lifetime.aborted) throw new Error('cancelled');
      if (permission?.state !== 'granted') throw new Error(permission?.state === 'denied' ? 'permission' : 'prompt');
    }
    return browserPickupWatch(navigator.geolocation)(receive, fail, lifetime);
  } : withPickupPermission(lifetime => pickupPermission(Location.getForegroundPermissionsAsync,
    Location.requestForegroundPermissionsAsync, canRequest, lifetime), async (receive, fail, lifetime) => {
    if (!await Location.hasServicesEnabledAsync()) throw new Error('disabled');
    if (lifetime.aborted) throw new Error('cancelled');
    return Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 0, timeInterval: 1000 }, receive, fail);
  }), signal, canRequest ? 60_000 : 20_000); // Leave time to read the system prompt; every attempt still expires.
}

// The last fix opens the next map where the customer probably is, while a fresh one comes in (10 s and more indoors).
const HERE_KEY = 'lastHere';
export const rememberHere = (point: Point) => storage.set(HERE_KEY, JSON.stringify({ latitude: point.latitude, longitude: point.longitude, at: Date.now() })).catch(() => undefined);
export async function rememberedHere(): Promise<(Point & { at: number }) | null> {
  try {
    const value = JSON.parse(await storage.get(HERE_KEY) ?? 'null');
    return Number.isFinite(value?.latitude) && Number.isFinite(value?.longitude) ? { latitude: value.latitude, longitude: value.longitude, at: Number(value.at) || 0 } : null;
  } catch { return null; }
}
/** How old a remembered position may be and still stand in as the pickup until the fresh fix replaces it. */
export const HERE_PICKUP_MS = 120_000;
