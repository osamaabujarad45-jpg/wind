import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from 'expo-router';

// Dev: the API runs next to Metro on port 4000 (npm run server). Production: EXPO_PUBLIC_API_URL.
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? `http://${devHost ?? 'localhost'}:4000`;
export const PRIVACY_URL = `${API_URL}/privacy`;
// Support WhatsApp in international digits, e.g. 970599123456. Unset: support buttons are hidden.
const supportNumber = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP?.replace(/\D/g, '');
export const SUPPORT_URL = supportNumber ? `https://wa.me/${supportNumber}` : null;

export const storage = {
  get: async (key: string) => Platform.OS === 'web' ? safe(() => localStorage.getItem(key)) : SecureStore.getItemAsync(key),
  set: async (key: string, value: string | null) => {
    if (Platform.OS === 'web') return safe(() => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value));
    return value === null ? SecureStore.deleteItemAsync(key) : SecureStore.setItemAsync(key, value);
  },
};

function safe<T>(fn: () => T): T | null {
  try { return fn(); } catch { return null; }
}

export class ApiError extends Error {}

let token: string | null = null;
let onUnauthorized = () => {};
export function configureApi(nextToken: string | null, unauthorized: () => void) {
  token = nextToken;
  onUnauthorized = unauthorized;
}

export async function api<T>(path: string, body?: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: body && JSON.stringify(body),
    });
  } catch {
    throw new ApiError('network');
  }
  const data = await res.json().catch(() => ({ error: 'server_error' }));
  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok) throw new ApiError(data.error ?? 'server_error');
  return data as T;
}

export const errorCode = (error: unknown) => error instanceof ApiError ? error.message : 'server_error';

// Loads on focus and, with pollMs, refreshes while the screen stays focused.
// ponytail: polling; switch to websockets/SSE if request volume becomes a cost.
export function useApi<T>(path: string | null, pollMs?: number) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(undefined);
    } catch (e) {
      setError(errorCode(e));
    }
  }, [path]);
  useFocusEffect(useCallback(() => {
    load();
    if (!pollMs) return;
    const timer = setInterval(load, pollMs);
    return () => clearInterval(timer);
  }, [load, pollMs]));
  return { data, error, reload: load, setData };
}
