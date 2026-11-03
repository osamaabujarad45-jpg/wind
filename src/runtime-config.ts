import { serverOffset } from './api-clock.ts';
export const runtimeRegistry = {
  orderRefreshMs: { default: 4_000, min: 1_000, max: 30_000, owner: 'orders' },
  mapReadyTimeoutMs: { default: 20_000, min: 5_000, max: 30_000, owner: 'maps' },
  offlineMaxAgeMs: { default: 6 * 60 * 60_000, min: 60_000, max: 24 * 60 * 60_000, owner: 'recovery' },
  commandMaxAgeMs: { default: 15 * 60_000, min: 60_000, max: 60 * 60_000, owner: 'recovery' },
} as const;
export type RuntimeValues = { -readonly [K in keyof typeof runtimeRegistry]: number };
export type RuntimeConfiguration = { schemaVersion: 1; revision: string; issuedAt: number; expiresAt: number;
  values: RuntimeValues; mapProviders: { initialMapProvider: 'baseline' | 'google'; fallbackMapProviders: ('baseline' | 'google')[]; missingProviderDefault: 'baseline' } };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const provider = (value: unknown) => value === 'baseline' || value === 'google';
export const defaultRuntimeValues = (): RuntimeValues => Object.fromEntries(Object.entries(runtimeRegistry).map(([key, rule]) => [key, rule.default])) as RuntimeValues;

/** Only these display/recovery settings are remotely variable. Authority and native capabilities are separate. */
export function runtimeValues(input: unknown): RuntimeValues {
  if (!record(input) || Object.keys(input).some(key => !Object.hasOwn(runtimeRegistry, key))) throw new Error('invalid_runtime_configuration');
  const values = defaultRuntimeValues();
  for (const key of Object.keys(runtimeRegistry) as (keyof RuntimeValues)[]) {
    const rule = runtimeRegistry[key], value = Object.hasOwn(input, key) ? input[key] : rule.default;
    if (!Number.isSafeInteger(value) || (value as number) < rule.min || (value as number) > rule.max) throw new Error('invalid_runtime_configuration');
    values[key] = value as number;
  }
  return values;
}

export function readRuntimeConfiguration(input: unknown, now = Date.now()): RuntimeConfiguration {
  if (!record(input) || input.schemaVersion !== 1 || typeof input.revision !== 'string' || !/^[a-f0-9]{16,64}$/.test(input.revision)
    || !Number.isSafeInteger(input.issuedAt) || !Number.isSafeInteger(input.expiresAt)
    || (input.issuedAt as number) > now + 5_000 || (input.expiresAt as number) <= now
    || (input.expiresAt as number) - (input.issuedAt as number) > 60 * 60_000) throw new Error('invalid_runtime_configuration');
  const maps = input.mapProviders;
  if (!record(maps) || !provider(maps.initialMapProvider) || maps.missingProviderDefault !== 'baseline'
    || !Array.isArray(maps.fallbackMapProviders) || maps.fallbackMapProviders.length > 2 || !maps.fallbackMapProviders.every(provider)) throw new Error('invalid_runtime_configuration');
  return { schemaVersion: 1, revision: input.revision, issuedAt: input.issuedAt as number, expiresAt: input.expiresAt as number,
    values: runtimeValues(input.values), mapProviders: { initialMapProvider: maps.initialMapProvider as 'baseline' | 'google',
      fallbackMapProviders: [...new Set(maps.fallbackMapProviders)] as ('baseline' | 'google')[], missingProviderDefault: 'baseline' } };
}

let current: RuntimeConfiguration | null = null;
const listeners = new Set<() => void>();
export function subscribeRuntime(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function configureRuntime(input: unknown, now = Date.now()) { current = readRuntimeConfiguration(input, now); for (const listener of listeners) listener(); return current; }
export function resetRuntime() { current = null; for (const listener of listeners) listener(); }
/** The one "map is usable" deadline; a renderer that waits on another deadline adds its own margin on top. */
export const mapReadyMs = () => effectiveRuntime().values.mapReadyTimeoutMs;
export function effectiveRuntime(now = Date.now() + serverOffset()) {
  if (current && current.expiresAt > now && current.issuedAt <= now + 5_000) return current;
  return { schemaVersion: 1 as const, revision: 'defaults', issuedAt: now, expiresAt: now,
    values: defaultRuntimeValues(), mapProviders: { initialMapProvider: 'baseline' as const,
      fallbackMapProviders: ['baseline' as const], missingProviderDefault: 'baseline' as const } };
}
