import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from './api';
import { deliverDriverFix, type TrackingContext, type TrackingReceipt } from './location-delivery';

const TASK = 'wind-active-delivery-location';
const CONTEXT = 'wind.tracking';
const RECEIPT = 'wind.tracking.receipt';
const accessible = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
async function read<T>(key: string): Promise<T | null> {
  const value = await SecureStore.getItemAsync(key);
  try { return value ? JSON.parse(value) as T : null; } catch { return null; }
}
let queue = Promise.resolve();
const serial = (action: () => Promise<void>) => {
  const next = queue.then(action, action);
  queue = next.catch(() => {});
  return next;
};
export function stopBackgroundLocation(expectedId?: string) {
  if (Platform.OS === 'web') return Promise.resolve();
  return serial(async () => {
    if (expectedId && (await read<TrackingContext>(CONTEXT))?.id !== expectedId) return;
    await SecureStore.deleteItemAsync(CONTEXT);
    await SecureStore.deleteItemAsync(RECEIPT);
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
  });
}
export function startBackgroundLocation(actor: number, orderId: number) {
  return serial(async () => {
    const token = await SecureStore.getItemAsync('token');
    if (!token) return;
    // Also migrate an existing iOS session so headless uploads can read it after the screen locks.
    await SecureStore.setItemAsync('token', token, accessible);
    const previous = await read<TrackingContext>(CONTEXT);
    const context = previous?.token === token && previous.actor === actor && previous.orderId === orderId
      ? previous : { id: `${actor}:${orderId}:${Date.now()}`, token, actor, orderId };
    await SecureStore.setItemAsync(CONTEXT, JSON.stringify(context), accessible);
    // Registration can survive process replacement while its Android foreground service does not.
    // Re-register from the foreground so Expo refreshes the consumer and restarts that service.
    try {
      await Location.startLocationUpdatesAsync(TASK, {
        accuracy: Location.Accuracy.High, timeInterval: 20_000, distanceInterval: 0,
        deferredUpdatesInterval: 20_000, deferredUpdatesDistance: 0,
        pausesUpdatesAutomatically: false, showsBackgroundLocationIndicator: true,
        foregroundService: { notificationTitle: 'Wind',
          notificationBody: 'مشاركة الموقع أثناء التوصيل · Sharing location during delivery',
          notificationColor: '#12342A', killServiceOnDestroy: false },
      });
    } catch (error) { await SecureStore.deleteItemAsync(CONTEXT); throw error; }
  });
}
export async function backgroundLocationState(): Promise<'off' | 'starting' | 'sharing'> {
  const context = await read<TrackingContext>(CONTEXT);
  if (!context || !await Location.hasStartedLocationUpdatesAsync(TASK)) return 'off';
  const receipt = await read<TrackingReceipt>(RECEIPT);
  return receipt?.id === context.id && !receipt.failed && Date.now() - receipt.lastSentAt < 60_000 ? 'sharing' : 'starting';
}

// Imported by index.js before Router, including when Expo starts JavaScript without mounting screens.
if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(TASK)) TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error || !data?.locations.length) return;
  const fix = data.locations.reduce((latest, candidate) => candidate.timestamp > latest.timestamp ? candidate : latest);
  await deliverDriverFix(fix, {
    context: () => read<TrackingContext>(CONTEXT), token: () => SecureStore.getItemAsync('token'),
    receipt: () => read<TrackingReceipt>(RECEIPT), stop: stopBackgroundLocation,
    acknowledge: receipt => SecureStore.setItemAsync(RECEIPT, JSON.stringify(receipt), accessible),
    post: async (token, body) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(`${API_URL}/api/location`, { method: 'POST', signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        await response.text();
        return response.status;
      } finally { clearTimeout(timer); }
    },
  });
});
