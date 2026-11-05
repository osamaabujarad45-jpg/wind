import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { apiSessionRevision, errorCode, request } from './api-client';
import { cacheOrderSummaries } from './offline-recovery';
import { readOrder } from './wire-contracts';
export { storage } from './storage';
export { ApiError, apiSessionRevision, configureApi, errorCode, invalidateApiSessionActions } from './api-client';

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

export const api = async <T>(path: string, body?: object, method?: 'GET' | 'POST' | 'PATCH' | 'DELETE', signal?: AbortSignal): Promise<T> => {
  const revision = apiSessionRevision();
  const optIn = /^\/(?:orders|jobs|offers|route|price|admin\/orders)(?:[/?]|$)/.test(path);
  const requestPath = optIn && !/[?&]journeyProtocol=/.test(path) ? `${path}${path.includes('?') ? '&' : '?'}journeyProtocol=1` : path;
  const data = await request<T>(`${API_URL}/api${requestPath}`, body, method, signal);
  if (revision === apiSessionRevision() && /^\/orders(?:\/\d+)?(?:\?|$)/.test(path)) {
    if (Array.isArray(data)) void cacheOrderSummaries(data.map(readOrder));
    else if (data && typeof data === 'object' && 'service' in data && 'id' in data) void cacheOrderSummaries([readOrder(data)]);
  }
  return data;
};

// Loads on focus and, with pollMs, refreshes while the screen stays focused.
// The poll pauses while the app is in the background (battery, server load), backs off after a failure and stops on a
// refusal that cannot fix itself (a revoked session, a deleted order): the screen shows the reason.
// ponytail: polling; switch to websockets/SSE if request volume becomes a cost.
export function useApi<T>(path: string | null, pollMs?: number, options?: { refetchOnFocus?: boolean }) {
  // Billable endpoints (a Google display route) must load once per path and never again on an app-foreground
  // bounce: rerenders and refocuses are not reasons to bill (T08's trigger policy). Free endpoints keep the
  // default refresh-on-focus.
  // Per mount: a remount asks once more, and a renderer flip does only when the preview URL differs from the one already
  // held. The paid-trigger policy allows both as a shown preview. No cache of paid answers: Google's Routes policy restricts
  // caching route content.
  const refetchOnFocus = options?.refetchOnFocus ?? true;
  const loaded = useRef<string | null>(null);
  const [data, setResult] = useState<{ path: string; value: T }>();
  const [error, setError] = useState<{ path: string; value: string }>();
  const generation = useRef(0);
  const latestPath = useRef(path);
  useEffect(() => { latestPath.current = path; }, [path]);
  const inFlight = useRef<number | null>(null);
  const load = useCallback(async (force = false) => {
    // An action awaits the reload of the render it started in. If the screen has moved on (a new search), reloading the
    // old path would discard the new path's answer and leave a spinner with nothing to end it: refresh what is shown now.
    const target = force ? latestPath.current : path;
    if (!target) return undefined;
    if (inFlight.current === generation.current) {
      if (!force) return undefined;
      generation.current++; // a manual refresh must not wait for an older snapshot
    }
    const current = generation.current;
    inFlight.current = current;
    try {
      const next = await api<T>(target);
      // A billable answer is already paid for. The newest request's answer landing during a background bounce (the path is
      // null, or back) is kept, because coming back does not ask again. Any other answer only counts if nothing newer started.
      const paidFor = !refetchOnFocus && inFlight.current === current && (latestPath.current === target || latestPath.current === null);
      if (paidFor || (current === generation.current && latestPath.current === target)) { setResult({ path: target, value: next }); setError(undefined); }
      return undefined;
    } catch (e) {
      const code = errorCode(e);
      if (current !== generation.current || latestPath.current !== target) {
        if (inFlight.current === current && loaded.current === target) loaded.current = null; // nothing was kept, so the next focus may ask again
        return undefined;
      }
      // Keep the last snapshot for transient failures, but never display data after access is revoked.
      if (terminal(code)) setResult(previous => previous?.path === target ? undefined : previous);
      setError({ path: target, value: code });
      return code;
    } finally { if (inFlight.current === current) inFlight.current = null; }
  }, [path, refetchOnFocus]);
  useFocusEffect(useCallback(() => {
    generation.current++;
    // A null path (a backgrounded Google approach) is not a new path: coming back to the same URL must not bill again.
    const firstForPath = path !== null && loaded.current !== path;
    if (path !== null) loaded.current = path;
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
    if (firstForPath || refetchOnFocus) void tick();
    // A backgrounded app must not keep the radio busy; the first poll on return brings the screen up to date —
    // unless refetching this path costs money, in which case the next real change (a new pin pair) reloads it.
    const subscription = AppState.addEventListener('change', state => {
      foreground = state === 'active';
      if (foreground) { if (!pending && refetchOnFocus) void tick(); } else clear();
    });
    return () => { stopped = true; clear(); subscription.remove(); generation.current++; };
  }, [load, pollMs, refetchOnFocus, path]));
  const setData = (next: T) => {
    if (path !== latestPath.current) return;
    generation.current++; // an acknowledged action wins over a poll that started before it
    if (path) setResult({ path, value: next });
  };
  const reload = useCallback(() => load(true), [load]);
  return { data: data?.path === path ? data.value : undefined, error: error?.path === path ? error.value : undefined, reload, setData };
}

// Live driver fix over the server's long-poll (`.../live?since=`): each answer arrives as soon as the driver's next fix
// is stored, so the map moves within network latency of the upload. undefined until the first answer. Put the driver
// in the path (`?driver=`) so a reassignment starts clean instead of keeping the previous driver's fix.
// ponytail: long-poll over fetch (auth header, no native module); SSE/WebSocket if one stream must carry more.
export function useLiveFix<T extends { updatedAt: number }>(path: string | null) {
  const [fix, setFix] = useState<{ path: string; value: T | null; driverChanged: boolean }>();
  useFocusEffect(useCallback(() => {
    if (!path) return;
    let stopped = false, since = 0, failures = 0, foreground = true;
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
            `${path}${path.includes('?') ? '&' : '?'}since=${since}`, undefined, undefined, controller.signal);
          if (stopped) return;
          // Keep asking about the snapshot's driver until the snapshot changes.
          // The screen must hide its old driver and reload before displaying a new fix.
          if (answer.driverChanged) {
            since = 0;
            failures = 0;
            setFix({ path, value: null, driverChanged: true });
          } else {
            const { driverLocation } = answer;
            if (driverLocation && driverLocation.updatedAt > since) { since = driverLocation.updatedAt; pause = 0; }
            failures = 0;
            setFix({ path, value: driverLocation, driverChanged: false });
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
  return fix?.path === path ? { value: fix.value, driverChanged: fix.driverChanged } : { value: undefined, driverChanged: false };
}

// A refusal that polling cannot fix: the session is gone, the link was revoked, the order was deleted.
const terminal = (code: string) => code === 'unauthorized' || code === 'forbidden' || code === 'not_found' || code === 'session_changed' || code === 'aborted';
