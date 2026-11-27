// Web Push opt-in for this browser (SPEC-web-push.md). Native apps need an EAS project and are not covered here.
import { Platform } from 'react-native';
import { api, ApiError, storage } from './api';
import { apiSessionCredential } from './api-client';

export type PushState = 'on' | 'off' | 'denied' | 'unsupported';
const BINDING_RECEIPT = 'wind.webPushBinding';

export const pushSupported = () => Platform.OS === 'web' && typeof window !== 'undefined'
  && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function current() {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration?.pushManager.getSubscription() ?? null;
}

function ownedSubscription<T>(token: string | null, work: (check: () => Promise<void>) => Promise<T>) {
  return storage.exclusive(async () => {
    const check = async () => {
      if (!token || await storage.get('token', true) !== token || apiSessionCredential() !== token)
        throw new ApiError('session_changed');
    };
    await check();
    return work(check);
  });
}

async function bind(subscription: PushSubscription, token: string, lang: 'ar' | 'en', check: () => Promise<void>) {
  const { endpoint, keys } = subscription.toJSON();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([token, endpoint, keys?.p256dh, keys?.auth])));
  const receipt = btoa(String.fromCharCode(...new Uint8Array(digest)));
  const confirmed = await storage.get(BINDING_RECEIPT) === receipt;
  await check();
  try { await api('/push/subscribe', { endpoint, p256dh: keys?.p256dh, auth: keys?.auth, lang }); }
  catch (error) {
    await check();
    // A profile switch can discard a successful reply while the browser session keeps the same credential.
    const accepted = error instanceof ApiError && error.message === 'session_changed' && (error as { servedStatus?: number }).servedStatus === 200;
    if (!accepted) {
      if (!confirmed) await subscription.unsubscribe();
      throw error;
    }
  }
  await check();
  await storage.set(BINDING_RECEIPT, receipt);
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return (await current()) ? 'on' : 'off';
}

export async function enablePush(lang: 'ar' | 'en'): Promise<PushState> {
  const token = apiSessionCredential();
  if (!token) throw new ApiError('session_changed');
  // Permission first, while the tap still counts as the user's gesture (Safari, iPhone home-screen app).
  if (await Notification.requestPermission() !== 'granted') return 'denied';
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  const registration = await navigator.serviceWorker.ready; // subscribe needs an active worker
  return ownedSubscription<PushState>(token, async check => {
    const { key } = await api<{ key: string }>('/push/key');
    const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
    const applicationServerKey = Uint8Array.from(raw, ch => ch.charCodeAt(0));
    let subscription = await registration.pushManager.getSubscription();
    await check();
    // A subscription made for an older server key cannot be used any more.
    const old = subscription?.options.applicationServerKey;
    if (subscription && old && btoa(String.fromCharCode(...new Uint8Array(old))) !== btoa(raw)) {
      await subscription.unsubscribe();
      await check();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    await bind(subscription, token, lang, check);
    return 'on';
  });
}

/** Re-send an existing subscription (idempotent): restores a row the server dropped and refreshes the language. */
export async function refreshPush(lang: 'ar' | 'en') {
  if (!pushSupported()) return;
  const token = apiSessionCredential();
  if (!token) return;
  await ownedSubscription(token, async check => {
    const subscription = await current();
    if (subscription) await bind(subscription, token, lang, check);
  });
}

/** Session teardown holds the token lock. The server removes bound rows when the session ends. */
export async function dropLocalPush() {
  if (!pushSupported()) return;
  await (await current().catch(() => null))?.unsubscribe().catch(() => undefined);
  await storage.set(BINDING_RECEIPT, null);
}

/** Off for the signed-in browser. */
export async function disablePush() {
  if (!pushSupported()) return;
  await ownedSubscription(apiSessionCredential(), async check => {
    const subscription = await current().catch(() => null);
    if (!subscription) return;
    await check();
    await api('/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => undefined);
    await check();
    await subscription.unsubscribe();
    await storage.set(BINDING_RECEIPT, null);
  });
}
