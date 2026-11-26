import * as Notifications from 'expo-notifications';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api, apiSessionRevision, storage } from './api';
import { apiSessionCredential, errorCode } from './api-client';
import { router } from 'expo-router';
import type { User } from './model';
import { setNativePushRegistered } from './push-state.ts';

type NavigationAccount = { user: Pick<User, 'id' | 'role' | 'status'> } | null;
let syncNavigation: (ready: boolean, me: NavigationAccount) => void = () => {};
export function syncNativePushNavigation(sessionReady: boolean, me: NavigationAccount) { syncNavigation(sessionReady, me); }

// Foreground pushes must still surface, and a tap must land on the linked
// screen; without a handler Expo drops foreground notifications silently.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  // T37: a tap that LAUNCHED the app never reaches the listener — the response is waiting in
  // getLastNotificationResponseAsync. Hold every tap until the session and its route guards are ready.
  type Tap = { identifier: string; url: string; kind?: string; recipient?: number };
  type PendingTarget = Tap & { credential: string | null };
  let readyRevision: number | undefined, account: NavigationAccount = null, pending: PendingTarget | null = null;
  let lastOpened: string | undefined, received = 0;
  const startupRevision = apiSessionRevision();
  // Start this read before either Expo response path can resume after a new sign-in.
  const startupCredential = storage.get('token').catch(() => null);
  const allowed = (url: string, role: User['role']) => {
    if (url === '/support' || /^\/(?:order|receipt)\/[1-9]\d*$/.test(url)) return true;
    if (role === 'driver') return /^\/driver(?:\/(?:earnings|account))?$/.test(url);
    if (role === 'admin') return /^\/admin(?:\/(?:users|orders|cash|subscriptions|merchants|support))?$/.test(url);
    return url === '/account' || url === '/merchant' || /^\/merchant\/order\/[1-9]\d*$/.test(url);
  };
  const tapFrom = (response: Notifications.NotificationResponse | null): Tap | null => {
    const request = response?.notification.request;
    const { url, kind, recipient } = request?.content.data ?? {};
    if (!request?.identifier || typeof url !== 'string' || url !== url.trim() || !/^\/(?!\/)[^\\]*$/.test(url)) return null;
    if (recipient !== undefined && (typeof recipient !== 'number' || !Number.isSafeInteger(recipient) || recipient < 1)) return null;
    return { identifier: request.identifier, url, kind: typeof kind === 'string' ? kind : undefined, recipient };
  };
  const consume = (identifier: string) => {
    // Expo keeps the last response until it is cleared. Leave a later notification intact.
    try {
      if (Notifications.getLastNotificationResponse()?.notification.request.identifier === identifier)
        Notifications.clearLastNotificationResponse();
    } catch { /* A notification is only a hint. */ }
  };
  const flush = () => {
    if (readyRevision !== apiSessionRevision() || !pending) return;
    const target = pending;
    pending = null; // a stale or refused tap is never retried under another account
    consume(target.identifier);
    if (!target.credential || target.credential !== apiSessionCredential() || target.identifier === lastOpened
      || !account || (target.recipient !== undefined && target.recipient !== account.user.id)
      || !allowed(target.url, account.user.role)) return;
    const user = account.user;
    // An approval tap can arrive before the foreground session refresh. The driver screen has its own pending gate.
    const pendingDriverTap = user.status === 'pending' && user.role === 'driver' && target.recipient === user.id
      && ((target.kind === 'support_reply' && target.url === '/support') || (target.kind === 'approved' && target.url === '/driver'));
    if (user.status !== 'active' && !pendingDriverTap) return;
    lastOpened = target.identifier;
    router.replace(target.url as never);
  };
  const queue = (tap: Tap, credential: string | null) => {
    pending = { ...tap, credential };
    flush();
  };
  const initialArrival = received;
  Notifications.addNotificationResponseReceivedListener(response => {
    const tap = tapFrom(response);
    if (!tap) return;
    const arrival = ++received;
    const credential = apiSessionCredential();
    if (credential || readyRevision !== undefined || apiSessionRevision() !== startupRevision) {
      queue(tap, credential);
      return;
    }
    pending = null;
    void startupCredential.then(saved => { if (arrival === received) queue(tap, saved); });
  });
  void Promise.all([startupCredential, Notifications.getLastNotificationResponseAsync()]).then(([credential, response]) => {
    const tap = tapFrom(response);
    if (tap && initialArrival === received) queue(tap, credential);
  }).catch(() => { /* No cold-start tap. */ });
  syncNavigation = (sessionReady, me) => {
    readyRevision = sessionReady ? apiSessionRevision() : undefined;
    account = me;
    flush();
  };
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
// At most one system dialog per app session: after one denial Android still allows asking, and sign-in plus the session effect
// (or every visit to merchant mode) would ask again back to back (Haiku polish r2 N1, N3).
// Keyed by API session, so one account's ask does not use up the next account's (Sol ops review 21 Nov).
let askedInSession: number | null = null;
// Each request belongs to the session that made it: one queued before a sign-out neither asks nor registers for the next account
// (Sol full review 21 Nov, item 8). Resolves true once this device is registered for that session and the server delivers push,
// so the Account row only says alerts reach this device when they can (Haiku review of the push delivery gate).
let running: Promise<unknown> = Promise.resolve();
export function registerNativePush(lang: 'ar' | 'en', ask: false | 'once' | 'always' | 'tap' = false): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(false);
  const session = apiSessionRevision();
  const next = running.then(() => register(lang, ask, session));
  running = next.catch(() => undefined);
  return next;
}
async function register(lang: 'ar' | 'en', ask: false | 'once' | 'always' | 'tap', session: number): Promise<boolean> {
  const isCurrentSession = () => apiSessionRevision() === session;
  try {
    if (!isCurrentSession()) return false;
    // The channel must exist before Android 13 can ask for permission; high importance gives a heads-up. server/push.ts names it.
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: lang === 'ar' ? 'ويند' : 'Wind', importance: Notifications.AndroidImportance.HIGH });
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    // The person's own tap on the notifications row ('tap') always asks while the OS allows it (Haiku polish r3 R3-1).
    if (status !== 'granted' && ask && current.canAskAgain && isCurrentSession() && (ask === 'tap' || askedInSession !== session)
      && (ask !== 'once' || await storage.get('pushAsked') !== '1') && isCurrentSession()) {
      askedInSession = session;
      status = (await Notifications.requestPermissionsAsync()).status;
      // A customer's once-per-device ask is spent once answered (Haiku polish r2 N5); captains' asks keep no device flag.
      if (ask === 'once') await storage.set('pushAsked', '1').catch(() => undefined);
    }
    if (!isCurrentSession()) return false;
    // Notifications switched off in the system settings: the server's push cannot show either, so local alerts come back.
    if (status !== 'granted') { setNativePushRegistered(null); return false; }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const expoPushToken = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    let deviceId = await storage.get('pushDeviceId');
    if (!deviceId) {
      deviceId = Crypto.randomUUID();
      await storage.set('pushDeviceId', deviceId);
    }
    if (!isCurrentSession()) return false;
    const result = await api<{ delivering?: boolean } | undefined>('/push/native/register', { expoPushToken, deviceId, platform: Platform.OS, lang });
    // A reply that lands after sign-out or an account change must not mute the next session.
    if (!isCurrentSession()) return false;
    // Local alerts go quiet only while the server says push delivery is switched on; with it off a registered token would
    // otherwise leave the phone with no alert at all (local-alert.ts). The switch is configuration, not proof of arrival:
    // docs/operations/deploy.md turns it on for the host while only a test phone has the Firebase build (step 5) and
    // announces push only once a test push lands there (step 6).
    setNativePushRegistered(result?.delivering === true ? session : null);
    return result?.delivering === true;
  } catch (error) {
    // A failed registration (server without the route, push unavailable, token or permission error) cannot promise a push, so
    // local alerts come back; a plain network blip keeps the last confirmed answer.
    if (isCurrentSession() && !['network', 'aborted', 'session_changed'].includes(errorCode(error))) setNativePushRegistered(null);
    return false; /* polling fallback remains authoritative */
  }
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
    setNativePushRegistered(null);
    const deviceId = await storage.get('pushDeviceId');
    if (deviceId) await api('/push/native/unregister', { deviceId });
  } catch { /* server token expires with the session regardless */ }
}
