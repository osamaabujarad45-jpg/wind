import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from 'expo-router';
import { errorCode, request } from './api-client';
export { ApiError, configureApi, errorCode } from './api-client';

// Dev: the API runs next to Metro on port 4000 (npm run server). Production: EXPO_PUBLIC_API_URL.
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? `http://${devHost ?? 'localhost'}:4000`;
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

export const api = <T>(path: string, body?: object, method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'): Promise<T> => request(`${API_URL}/api${path}`, body, method);

// Loads on focus and, with pollMs, refreshes while the screen stays focused.
// ponytail: polling; switch to websockets/SSE if request volume becomes a cost.
export function useApi<T>(path: string | null, pollMs?: number) {
  const [data, setResult] = useState<{ path: string; value: T }>();
  const [error, setError] = useState<{ path: string; value: string }>();
  const generation = useRef(0);
  const latestPath = useRef(path);
  useEffect(() => { latestPath.current = path; }, [path]);
  const inFlight = useRef<number | null>(null);
  const load = useCallback(async () => {
    if (!path || inFlight.current === generation.current) return;
    const current = generation.current;
    inFlight.current = current;
    try {
      const next = await api<T>(path);
      if (current === generation.current && latestPath.current === path) { setResult({ path, value: next }); setError(undefined); }
    } catch (e) {
      if (current === generation.current && latestPath.current === path) setError({ path, value: errorCode(e) });
    } finally { if (inFlight.current === current) inFlight.current = null; }
  }, [path]);
  useFocusEffect(useCallback(() => {
    generation.current++;
    load();
    const timer = pollMs ? setInterval(load, pollMs) : undefined;
    return () => { generation.current++; if (timer) clearInterval(timer); };
  }, [load, pollMs]));
  const setData = (next: T) => {
    if (path !== latestPath.current) return;
    generation.current++; // an acknowledged action wins over a poll that started before it
    if (path) setResult({ path, value: next });
  };
  return { data: data?.path === path ? data.value : undefined, error: error?.path === path ? error.value : undefined, reload: load, setData };
}
