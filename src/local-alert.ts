// Alerts without a push service (owner, 23 Nov 2026). Until the Firebase project for native push exists, the server cannot
// reach a phone, so while a screen is open a new job, a new offer or a driver's arrival rings the way a push would: a banner
// with sound (the foreground handler in native-push.ts shows it) and a vibration. Once this device registers for real push,
// the server's push carries these and this stays quiet, so nothing rings twice. Native only: the web app has Web Push.
import { useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
// expo-haptics directly, not ui.tsx's haptic: ui → session → native-push → here would be an import cycle.
import { apiSessionRevision } from './api-client';
import { nativePushRegistered } from './push-state.ts';

export function localAlert(title: string, body: string, url?: string) {
  if (Platform.OS === 'web' || nativePushRegistered(apiSessionRevision())) return; // the server's push is the alert from then on
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  void Notifications.scheduleNotificationAsync({ content: { title, body, sound: 'default', data: url ? { url } : {} }, trigger: null }).catch(() => undefined);
}

/** Calls `onNew` with the ids that were not in any earlier list. The first list is what was already there: nothing rings. */
export function useNewIds(ids: number[] | undefined, onNew: (fresh: number[]) => void) {
  const seen = useRef<Set<number> | null>(null);
  const handler = useRef(onNew);
  useEffect(() => { handler.current = onNew; });
  const key = ids?.join(',');
  useEffect(() => {
    if (key === undefined) return;
    const list = key ? key.split(',').map(Number) : [];
    if (seen.current === null) { seen.current = new Set(list); return; }
    const fresh = list.filter(id => !seen.current!.has(id));
    for (const id of list) seen.current.add(id);
    if (fresh.length) handler.current(fresh);
  }, [key]);
}

/** Calls `onChange(previous, next)` when a watched value changes after the first reading. */
export function useChange<T extends string | number>(value: T | undefined, onChange: (previous: T, next: T) => void) {
  const last = useRef<T | undefined>(undefined);
  const handler = useRef(onChange);
  useEffect(() => { handler.current = onChange; });
  useEffect(() => {
    if (value === undefined) return;
    if (last.current !== undefined && last.current !== value) handler.current(last.current, value);
    last.current = value;
  }, [value]);
}
