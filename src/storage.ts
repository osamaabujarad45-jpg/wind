import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { webGet, webSet, type WebStore } from './web-storage';
const webStore: WebStore = () => localStorage;
type LockManager = { request: <T>(name: string, run: () => Promise<T>) => Promise<T> };
export const storage = {
  /**
   * Reading the session token and acting on it, with no other tab's sign-in or sign-out in between.
   * ponytail: Web Locks need a secure context, so plain http falls back to the old race; native storage has one process and no tabs.
   */
  exclusive: <T>(run: () => Promise<T>): Promise<T> => {
    const locks = Platform.OS === 'web' ? (globalThis.navigator as unknown as { locks?: LockManager } | undefined)?.locks : undefined;
    return locks ? locks.request('wind.session.token', run) : run();
  },
  get: async (key: string, required = false) => Platform.OS === 'web' ? webGet(webStore, key, required) : SecureStore.getItemAsync(key),
  set: async (key: string, value: string | null, required = false) => {
    if (Platform.OS === 'web') return webSet(webStore, key, value, required);
    return value === null ? SecureStore.deleteItemAsync(key) : SecureStore.setItemAsync(key, value,
      key === 'token' ? { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK } : undefined);
  },
};
