// Web Push opt-in for this browser (SPEC-web-push.md). Native apps need an EAS project and are not covered here.
import { Platform } from 'react-native';
import { api } from './api';

export type PushState = 'on' | 'off' | 'denied' | 'unsupported';

export const pushSupported = () => Platform.OS === 'web' && typeof window !== 'undefined'
  && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function current() {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration?.pushManager.getSubscription() ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return (await current()) ? 'on' : 'off';
}

export async function enablePush(lang: 'ar' | 'en'): Promise<PushState> {
  // Permission first, while the tap still counts as the user's gesture (Safari, iPhone home-screen app).
  if (await Notification.requestPermission() !== 'granted') return 'denied';
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  const registration = await navigator.serviceWorker.ready; // subscribe needs an active worker
  const { key } = await api<{ key: string }>('/push/key');
  const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
  const applicationServerKey = Uint8Array.from(raw, ch => ch.charCodeAt(0));
  let subscription = await registration.pushManager.getSubscription();
  // A subscription made for an older server key cannot be used any more.
  const old = subscription?.options.applicationServerKey;
  if (subscription && old && btoa(String.fromCharCode(...new Uint8Array(old))) !== btoa(raw)) { await subscription.unsubscribe(); subscription = null; }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  const { endpoint, keys } = subscription.toJSON();
  await api('/push/subscribe', { endpoint, p256dh: keys?.p256dh, auth: keys?.auth, lang });
  return 'on';
}

/** Re-send an existing subscription (idempotent): restores a row the server dropped and refreshes the language. */
export async function refreshPush(lang: 'ar' | 'en') {
  const subscription = await current();
  if (!subscription) return;
  const { endpoint, keys } = subscription.toJSON();
  await api('/push/subscribe', { endpoint, p256dh: keys?.p256dh, auth: keys?.auth, lang });
}

/** Ends this browser's subscription without the server (the session is already gone). */
export async function dropLocalPush() {
  if (!pushSupported()) return;
  await (await current().catch(() => null))?.unsubscribe().catch(() => undefined);
}

/** Off for this browser; also used on sign-out so a shared browser stops alerting the previous account. */
export async function disablePush() {
  if (!pushSupported()) return;
  const subscription = await current().catch(() => null);
  if (!subscription) return;
  await api('/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}
