import type { MapRenderer } from './map-provider.ts';
const sessions = new Map<string, Set<MapRenderer>>();
const listeners = new Set<() => void>();
export const failedRenderers = (key: string): readonly MapRenderer[] => [...(sessions.get(key) ?? [])];
export function subscribeMapFailures(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function recordMapFailure(key: string, renderer: MapRenderer) {
  const failed = sessions.get(key) ?? new Set<MapRenderer>();
  if (failed.has(renderer)) return;
  failed.add(renderer); sessions.set(key, failed);
  while (sessions.size > 8) sessions.delete(sessions.keys().next().value!);
  for (const listener of listeners) listener();
}
export function retryMapProviders(key?: string) {
  if (key) sessions.delete(key); else sessions.clear();
  for (const listener of listeners) listener();
}
