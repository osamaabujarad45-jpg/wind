import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { webGet, webSet, type WebStore } from './web-storage';
const webStore: WebStore = () => localStorage;
export const storage = {
  get: async (key: string, required = false) => Platform.OS === 'web' ? webGet(webStore, key, required) : SecureStore.getItemAsync(key),
  set: async (key: string, value: string | null, required = false) => {
    if (Platform.OS === 'web') return webSet(webStore, key, value, required);
    return value === null ? SecureStore.deleteItemAsync(key) : SecureStore.setItemAsync(key, value,
      key === 'token' ? { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK } : undefined);
  },
};
