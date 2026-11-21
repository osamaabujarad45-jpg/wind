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
// `ask` shows the system dialog while permission is undecided and the OS still allows asking:
// - 'once': a customer with an order on its way (the reason is "your driver accepted"), asked once per device, so the dialog is not
//   raised on every order. On Android 13+ a second denial is final, so a cold ask at sign-in spends one of two (product audit, 21 Nov).
// - 'always': captains and merchants, for whom alerts are the work, and the Account row the person taps; a customer's earlier
//   answer on a shared device does not stop them being asked (Haiku polish M1).
// Without `ask`, a device that already granted it just re-registers. One registration runs at a time: sign-in and the session
// effect can both start one, and two system dialogs must not race (Haiku polish M2).
let running: Promise<void> = Promise.resolve();
export function registerNativePush(lang: 'ar' | 'en', ask: false | 'once' | 'always' = false): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  const next = running.then(() => register(lang, ask));
  running = next.catch(() => undefined);
  return next;
}
async function register(lang: 'ar' | 'en', ask: false | 'once' | 'always'): Promise<void> {
  try {
    // The channel must exist before Android 13 can ask for permission; high importance gives a heads-up. server/push.ts names it.
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: lang === 'ar' ? 'ويند' : 'Wind', importance: Notifications.AndroidImportance.HIGH });
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted' && ask && current.canAskAgain && (ask === 'always' || await storage.get('pushAsked') !== '1')) {
      await storage.set('pushAsked', '1');
      status = (await Notifications.requestPermissionsAsync()).status;
    }
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

/** This device's notification permission for the Account row: on, off (the OS can still ask), or blocked (only the system
 *  settings can change it). */
export async function nativePushState(): Promise<'on' | 'off' | 'denied' | 'unsupported'> {
  if (Platform.OS === 'web') return 'unsupported';
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    return status === 'granted' ? 'on' : canAskAgain ? 'off' : 'denied';
  } catch { return 'unsupported'; }
}

export async function unregisterNativePush(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const deviceId = await storage.get('pushDeviceId');
    if (deviceId) await api('/push/native/unregister', { deviceId });
  } catch { /* server token expires with the session regardless */ }
}
