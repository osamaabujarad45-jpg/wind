// Which map family the device draws with when more than one is baked into the binary (T10/T12).
// Baseline stays the default and the fallback: a missing or unreadable preference must never select a
// renderer the binary may not contain. The choice is a plain UI preference: localStorage on web,
// SecureStore (the app's only key-value store) on native.
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { webGet, webSet } from './web-storage';
import { effectiveRuntime, subscribeRuntime } from './runtime-config';
import { retryMapProviders, subscribeMapFailures } from './map-failures';

export type MapMode = 'baseline' | 'google';

const KEY = 'map-mode';
const modes: MapMode[] = ['baseline', 'google'];
let cached: MapMode | undefined;
const listeners = new Set<(mode: MapMode) => void>();

const load = (): Promise<string | null> => Platform.OS === 'web'
  ? Promise.resolve(webGet(() => globalThis.localStorage, KEY))
  : SecureStore.getItemAsync(KEY).catch(() => null);
const save = (mode: MapMode) => {
  if (Platform.OS === 'web') webSet(() => globalThis.localStorage, KEY, mode);
  else SecureStore.setItemAsync(KEY, mode).catch(() => undefined); // the session keeps the choice even if it cannot persist
};

export async function storeMapMode(mode: MapMode) {
  cached = mode;
  retryMapProviders();
  save(mode);
  for (const listener of listeners) listener(mode);
}

/** The live mode outside React (event callbacks): the same value useMapMode renders with. */
export const currentMapMode = (): MapMode => cached ?? effectiveRuntime().mapProviders.initialMapProvider;

/** [current mode, setter]; 'baseline' until a stored choice says otherwise. */
export function useMapMode(): [MapMode, (mode: MapMode) => void] {
  const [mode, setMode] = useState<MapMode>(cached ?? effectiveRuntime().mapProviders.initialMapProvider);
  const [, rerender] = useState(0);
  useEffect(() => {
    const invalidate = () => rerender(value => value + 1);
    const config = subscribeRuntime(invalidate), failures = subscribeMapFailures(invalidate);
    return () => { config(); failures(); };
  }, []);
  useEffect(() => {
    listeners.add(setMode);
    load().then(value => {
      if (cached === undefined && modes.includes(value as MapMode)) cached = value as MapMode;
      if (cached !== undefined) setMode(cached);
    }).catch(() => undefined); // unreadable storage leaves the safe baseline
    return () => { listeners.delete(setMode); };
  }, []);
  return [cached ?? effectiveRuntime().mapProviders.initialMapProvider ?? mode, storeMapMode];
}
