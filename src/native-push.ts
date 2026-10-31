import * as Notifications from 'expo-notifications';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api, storage } from './api';
import { router } from 'expo-router';

// Foreground pushes must still surface, and a tap must land on the linked
// screen; without a handler Expo drops foreground notifications silently.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  // T37: a tap that LAUNCHED the app never reaches the listener — the response is waiting in
  // getLastNotificationResponseAsync. Both paths can report the same tap, so each identifier opens once.
  let lastOpened: string | undefined;
  const open = (response: Notifications.NotificationResponse | null) => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url !== 'string' || !url.startsWith('/')) return;
    const identifier = response?.notification.request.identifier;
    if (identifier && identifier === lastOpened) return;
    lastOpened = identifier;
    router.push(url as never);
  };
  Notifications.addNotificationResponseReceivedListener(open);
  Notifications.getLastNotificationResponseAsync().then(open).catch(() => { /* no cold-start tap */ });
}

// Native push registration (Expo Push). Best-effort by design: any failure —
// permission denied, Expo Go, missing EAS credentials, server gate closed —
// leaves the existing polling path untouched and never blocks sign-in.
export async function registerNativePush(lang: 'ar' | 'en'): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    let status = (await Notifications.getPermissionsAsync()).status;
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const expoPushToken = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    let deviceId = await storage.get('pushDeviceId');
    if (!deviceId) {
      deviceId = Crypto.randomUUID();
      await storage.set('pushDeviceId', deviceId);
    }
    await api('/push/native/register', { expoPushToken, deviceId, platform: Platform.OS, lang });
  } catch { /* polling fallback remains authoritative */ }
}

export async function unregisterNativePush(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const deviceId = await storage.get('pushDeviceId');
    if (deviceId) await api('/push/native/unregister', { deviceId });
  } catch { /* server token expires with the session regardless */ }
}
