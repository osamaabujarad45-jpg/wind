// Which map family the device draws with when more than one is baked into the binary (T10).
// Baseline stays the default and the fallback: a missing or unreadable preference must never select a
// renderer the binary may not contain. Native-only module: the web bundle never imports it.
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export type MapMode = 'baseline' | 'google';

const KEY = 'map-mode';
const modes: MapMode[] = ['baseline', 'google'];
let cached: MapMode | undefined;
const listeners = new Set<(mode: MapMode) => void>();

export async function storeMapMode(mode: MapMode) {
  cached = mode;
  try { await SecureStore.setItemAsync(KEY, mode); } catch { /* the session keeps the choice even if it cannot persist */ }
  for (const listener of listeners) listener(mode);
}

/** [current mode, setter]; 'baseline' until a stored choice says otherwise. */
export function useMapMode(): [MapMode, (mode: MapMode) => void] {
  const [mode, setMode] = useState<MapMode>(cached ?? 'baseline');
  useEffect(() => {
    listeners.add(setMode);
    SecureStore.getItemAsync(KEY).then(value => {
      if (modes.includes(value as MapMode)) { cached = value as MapMode; setMode(value as MapMode); }
    }).catch(() => undefined); // unreadable storage leaves the safe baseline
    return () => { listeners.delete(setMode); };
  }, []);
  return [mode, storeMapMode];
}
