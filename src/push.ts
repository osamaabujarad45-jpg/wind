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
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  if (await Notification.requestPermission() !== 'granted') return 'denied';
  const { key } = await api<{ key: string }>('/push/key');
  const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
  const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, ch => ch.charCodeAt(0)),
  });
  const { endpoint, keys } = subscription.toJSON();
  await api('/push/subscribe', { endpoint, p256dh: keys?.p256dh, auth: keys?.auth, lang });
  return 'on';
}

/** Off for this browser; also used on sign-out so a shared browser stops alerting the previous account. */
export async function disablePush() {
  if (!pushSupported()) return;
  const subscription = await current().catch(() => null);
  if (!subscription) return;
  await api('/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}
