import type { MapRenderer } from './map-provider.ts';
const sessions = new Map<string, Set<MapRenderer>>();
const listeners = new Set<() => void>();
let generation = 0;
const generations = new Map<string, number>();
export function mapGeneration(key: string) {
  if (!generations.has(key)) generations.set(key, ++generation);
  while (generations.size > 32) generations.delete(generations.keys().next().value!);
  return generations.get(key)!;
}
export const failedRenderers = (key: string): readonly MapRenderer[] => [...(sessions.get(key) ?? [])];
export function subscribeMapFailures(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function recordMapFailure(key: string, renderer: MapRenderer, expectedGeneration = mapGeneration(key)) {
  if (expectedGeneration !== mapGeneration(key)) return;
  const failed = sessions.get(key) ?? new Set<MapRenderer>();
  if (failed.has(renderer)) return;
  failed.add(renderer); sessions.set(key, failed);
  while (sessions.size > 8) sessions.delete(sessions.keys().next().value!);
  for (const listener of listeners) listener();
}
export function retryMapProviders(key?: string) {
  generation++;
  if (key) { sessions.delete(key); generations.set(key, generation); }
  else { for (const scope of new Set([...sessions.keys(), ...generations.keys()])) generations.set(scope, generation); sessions.clear(); }
  while (generations.size > 32) generations.delete(generations.keys().next().value!);
  for (const listener of listeners) listener();
}
