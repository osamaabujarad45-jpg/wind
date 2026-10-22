import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from 'expo-router';
import { errorCode, request } from './api-client';
export { ApiError, configureApi, errorCode } from './api-client';

// Dev: the API runs next to Metro on port 4000 (npm run server). Production: EXPO_PUBLIC_API_URL.
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? `http://${devHost ?? 'localhost'}:4000`).replace(/\/+$/, '');
export const PRIVACY_URL = `${API_URL}/privacy`;
export const TERMS_URL = `${API_URL}/terms`;
// Support WhatsApp in international digits, e.g. 970599123456. Unset: support buttons are hidden.
const supportNumber = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP?.replace(/\D/g, '');
const supportContact = process.env.EXPO_PUBLIC_SUPPORT_CONTACT?.trim();
export const SUPPORT_URL = supportNumber ? `https://wa.me/${supportNumber}`
  : supportContact && /^(mailto:|https:\/\/)/.test(supportContact) ? supportContact : null;

export const storage = {
  get: async (key: string) => Platform.OS === 'web' ? safe(() => localStorage.getItem(key)) : SecureStore.getItemAsync(key),
  set: async (key: string, value: string | null, required = false) => {
    if (Platform.OS === 'web') {
      const write = () => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
      return required ? write() : safe(write);
    }
    return value === null ? SecureStore.deleteItemAsync(key) : SecureStore.setItemAsync(key, value);
  },
};

function safe<T>(fn: () => T): T | null {
  try { return fn(); } catch { return null; }
}

export const api = <T>(path: string, body?: object, method?: 'GET' | 'POST' | 'PATCH' | 'DELETE', signal?: AbortSignal): Promise<T> =>
  request(`${API_URL}/api${path}`, body, method, signal);

// Loads on focus and, with pollMs, refreshes while the screen stays focused.
// The poll pauses while the app is in the background (battery, server load), backs off after a failure and stops on a
// refusal that cannot fix itself (a revoked session, a deleted order): the screen shows the reason.
// ponytail: polling; switch to websockets/SSE if request volume becomes a cost.
export function useApi<T>(path: string | null, pollMs?: number) {
  const [data, setResult] = useState<{ path: string; value: T }>();
  const [error, setError] = useState<{ path: string; value: string }>();
  const generation = useRef(0);
  const latestPath = useRef(path);
  useEffect(() => { latestPath.current = path; }, [path]);
  const inFlight = useRef<number | null>(null);
  const load = useCallback(async () => {
    if (!path || inFlight.current === generation.current) return undefined;
    const current = generation.current;
    inFlight.current = current;
    try {
      const next = await api<T>(path);
      if (current === generation.current && latestPath.current === path) { setResult({ path, value: next }); setError(undefined); }
      return undefined;
    } catch (e) {
      const code = errorCode(e);
      if (current === generation.current && latestPath.current === path) setError({ path, value: code });
      return code;
    } finally { if (inFlight.current === current) inFlight.current = null; }
  }, [path]);
  useFocusEffect(useCallback(() => {
    generation.current++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false, pending = false, foreground = true, failures = 0;
    const clear = () => { if (timer) { clearTimeout(timer); timer = undefined; } };
    const tick = async () => {
      if (stopped || pending) return;
      pending = true;
      const code = await load();
      pending = false;
      if (stopped || !foreground) return;
      if (code === undefined) failures = 0; else failures++;
      if (code && terminal(code)) return; // a revoked session or a gone order: polling again cannot help
      const base = pollMs ?? 0;
      if (!base) return;
      timer = setTimeout(tick, failures ? Math.min(base * Math.min(8, failures), 30_000) : base);
    };
    void tick();
    // A backgrounded app must not keep the radio busy; the first poll on return brings the screen up to date.
    const subscription = AppState.addEventListener('change', state => {
      foreground = state === 'active';
      if (foreground) { if (!pending) void tick(); } else clear();
    });
    return () => { stopped = true; clear(); subscription.remove(); generation.current++; };
  }, [load, pollMs]));
  const setData = (next: T) => {
    if (path !== latestPath.current) return;
    generation.current++; // an acknowledged action wins over a poll that started before it
    if (path) setResult({ path, value: next });
  };
  return { data: data?.path === path ? data.value : undefined, error: error?.path === path ? error.value : undefined, reload: load, setData };
}

// Live driver fix over the server's long-poll (`.../live?since=`): each answer arrives as soon as the driver's next fix
// is stored, so the map moves within network latency of the upload. undefined until the first answer. Put the driver
// in the path (`?driver=`) so a reassignment starts clean instead of keeping the previous driver's fix.
// ponytail: long-poll over fetch (auth header, no native module); SSE/WebSocket if one stream must carry more.
export function useLiveFix<T extends { updatedAt: number }>(path: string | null) {
  const [fix, setFix] = useState<{ path: string; value: T | null }>();
  useFocusEffect(useCallback(() => {
    if (!path) return;
    let stopped = false, since = 0, failures = 0, foreground = true;
    let watch = path; // the driver this watch asks for; the server names the one it has
    setFix(undefined); // a new watch never shows a fix from an earlier one
    const subscription = AppState.addEventListener('change', state => { foreground = state === 'active'; });
    // Leaving the screen gives up the held request: the socket and the server's watcher slot are freed at once.
    const controller = new AbortController();
    void (async () => {
      while (!stopped) {
        if (!foreground) { await new Promise(resolve => setTimeout(resolve, 2_000)); continue; } // no radio use in the background
        let pause = 2_000; // nothing new (hold expired, or no driver): ask again shortly, never in a tight loop
        try {
          const answer = await api<{ driverLocation: T | null; driverChanged?: boolean; driverKey?: string | null }>(
            `${watch}${watch.includes('?') ? '&' : '?'}since=${since}`, undefined, undefined, controller.signal);
          if (stopped) return;
          // Another driver took the job: drop the old fix and ask for the new driver, so the live channel
          // carries the car that is actually driving instead of waiting for the next poll.
          if (answer.driverChanged) {
            since = 0;
            setFix({ path, value: null });
            if (answer.driverKey) watch = path.replace(/([?&]driver=)[^&]*/, `$1${encodeURIComponent(answer.driverKey)}`);
            pause = 0;
          } else {
            const { driverLocation } = answer;
            if (driverLocation && driverLocation.updatedAt > since) { since = driverLocation.updatedAt; pause = 0; }
            failures = 0;
            setFix({ path, value: driverLocation });
          }
        } catch (error) {
          if (stopped) return;
          const code = errorCode(error);
          failures++;
          if (terminal(code)) return; // a revoked session or a revoked link: the screen shows it, the stream ends
          pause = Math.min(5_000 * failures, 30_000);
        }
        if (pause) await new Promise(resolve => setTimeout(resolve, pause));
      }
    })();
    return () => { stopped = true; controller.abort(); subscription.remove(); };
  }, [path]));
  return fix?.path === path ? fix.value : undefined;
}

// A refusal that polling cannot fix: the session is gone, the link was revoked, the order was deleted.
const terminal = (code: string) => code === 'unauthorized' || code === 'forbidden' || code === 'not_found' || code === 'session_changed';
