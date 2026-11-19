import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { webGet, webSet, type WebStore } from './web-storage';
const webStore: WebStore = () => localStorage;
type LockManager = { request: <T>(name: string, run: () => Promise<T>) => Promise<T> };
// Without Web Locks (native, or an older browser) one app process still runs one holder of a lock at a time: two screen
// instances that share a saved record wait for each other (Sol R17-M2). Another process is not covered here.
const chains = new Map<string, Promise<unknown>>();
function inProcess<T>(lock: string, run: () => Promise<T>): Promise<T> {
  const next = (chains.get(lock) ?? Promise.resolve()).then(run, run);
  chains.set(lock, next.catch(() => undefined));
  return next;
}

export const storage = {
  /**
   * Reading the session token and acting on it, with no other tab's sign-in or sign-out in between.
   * ponytail: Web Locks need a secure context, so plain http falls back to the old race; native storage has one process and no tabs.
   */
  exclusive: <T>(run: () => Promise<T>, lock = 'wind.session.token'): Promise<T> => {
    const locks = Platform.OS === 'web' ? (globalThis.navigator as unknown as { locks?: LockManager } | undefined)?.locks : undefined;
    return locks ? locks.request(lock, run) : inProcess(lock, run);
  },
  get: async (key: string, required = false) => Platform.OS === 'web' ? webGet(webStore, key, required) : SecureStore.getItemAsync(key),
  set: async (key: string, value: string | null, required = false) => {
    if (Platform.OS === 'web') return webSet(webStore, key, value, required);
    return value === null ? SecureStore.deleteItemAsync(key) : SecureStore.setItemAsync(key, value,
      key === 'token' ? { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK } : undefined);
  },
};
