import { createHash } from 'node:crypto';
import type { User } from '../../src/model.ts';
import { readRuntimeConfiguration, runtimeValues } from '../../src/runtime-config.ts';
import type { Persistence } from '../db/persistence.ts';
import { boardingEnabled } from './ride-lifecycle.ts';
import { dispatchEnabled } from './eligibility.ts';
import { readDiagnostics } from '../../src/client-diagnostics.ts';

const migrations = [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,25,26,27,28,29];
export const capabilityMigrations = {
  durableCommands: 4, measuredEligibility: 8, activeGps: 10, lockedQuotes: 11,
  nativePush: 12, dispatch: 13, boarding: 14, declaredScope: 15,
  ledger: 16, payments: 25, operations: 23, freightCrew: 28, boardingMetadata: 29,
} as const;
export type RuntimeCapability = keyof typeof capabilityMigrations;
type Register = (method: string, path: string, handler: (ctx: { user: User; body: Record<string, unknown> }) => Promise<unknown>) => unknown;
let diagnosticSamples = 0;

export function capabilityState(applied: readonly number[], env: NodeJS.ProcessEnv = process.env, postgres = true) {
  const has = new Set(applied);
  return Object.fromEntries(Object.entries(capabilityMigrations).map(([name, version]) => {
    const missing = migrations.filter(v => v <= version && !has.has(v));
    const enabled = name === 'dispatch' ? dispatchEnabled(env) : (name === 'boarding' || name === 'boardingMetadata') ? boardingEnabled(env)
      : name === 'activeGps' ? env.NODE_ENV === 'test' && env.WIND_TEST_ACTIVE_GPS === '1' : true;
    return [name, { schemaCompatible: postgres && missing.length === 0, enabled,
      state: !postgres || missing.length ? 'unavailable' : !enabled ? 'disabled' : 'configured',
      // Provider delivery, operating approvals and field health are never inferred from schema/configuration.
      operationalEvidence: 'not_checked', missingMigrations: missing }];
  }));
}

export function clientConfiguration(env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  const input = env.WIND_CLIENT_CONFIGURATION ? JSON.parse(env.WIND_CLIENT_CONFIGURATION) : {};
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['values', 'mapProviders'].includes(key))) throw new Error('invalid_runtime_configuration');
  const values = runtimeValues(input.values ?? {});
  const mapProviders = input.mapProviders ?? { initialMapProvider: 'baseline', fallbackMapProviders: ['baseline'], missingProviderDefault: 'baseline' };
  const revision = createHash('sha256').update(JSON.stringify({ values, mapProviders })).digest('hex').slice(0, 24);
  return readRuntimeConfiguration({ schemaVersion: 1, revision, issuedAt: now, expiresAt: now + 30 * 60_000, values, mapProviders }, now);
}

/** Forced-upgrade gate: a client that reports a build below WIND_MIN_CLIENT_BUILD gets 426 and shows the update screen. */
export function clientUpdateRequired(sent: string | string[] | undefined, env: NodeJS.ProcessEnv = process.env) {
  // ponytail: no header passes (installs up to 1.0.13, scripts, public pages); only builds that send it can be gated.
  // A repeated header arrives joined ("10012, 10013"); the first value is what the client sent. Empty or 0 is below any minimum.
  const min = Number(env.WIND_MIN_CLIENT_BUILD || 0), build = Number(typeof sent === 'string' ? sent.split(',')[0].trim() : NaN);
  return Number.isSafeInteger(min) && min > 0 && Number.isSafeInteger(build) && build < min;
}

/** Additive operator detail; bare legacy /ready remains a storage probe, not a feature activation claim. */
export function registerRuntimeRoutes(route: Register, deps: { db: Persistence; need: (user: User, role: 'admin') => void;
  needActive: (user: User) => void; fail: (status: number, message: string) => never; limit: (key: string, count: number, window: number) => Promise<unknown> }) {
  const installed = async () => deps.db.backend === 'postgres'
    ? (await deps.db.all('SELECT version FROM schema_migrations')).map(row => Number(row.version)) : [];
  route('GET', '/api/runtime/configuration', async () => clientConfiguration());
  route('GET', '/api/runtime/capabilities', async () => {
    const states = capabilityState(await installed(), process.env, deps.db.backend === 'postgres');
    return { schemaVersion: 1, capabilities: Object.fromEntries(Object.entries(states).map(([name, detail]) =>
      [name, { state: detail.state, operationalEvidence: detail.operationalEvidence }])) };
  });
  route('POST', '/api/runtime/diagnostics', async ({ user, body }) => {
    deps.needActive(user);
    await deps.limit(`client_diagnostics:${user.id}`, 30, 10 * 60_000);
    if (body.schemaVersion !== 1 || typeof body.batchId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.batchId)
      || Object.keys(body).some(key => !['schemaVersion','batchId','events'].includes(key))) deps.fail(400, 'invalid_diagnostics');
    let events;
    try { events = readDiagnostics(body.events); } catch { deps.fail(400, 'invalid_diagnostics'); }
    diagnosticSamples += events!.length;
    console.info(JSON.stringify({ category: 'client_diagnostic_sample', events }));
    return { accepted: events!.length };
  });
  route('GET', '/api/admin/runtime', async ({ user }) => {
    deps.need(user, 'admin');
    return { schemaVersion: 1, backend: deps.db.backend, configurationRevision: clientConfiguration().revision,
      diagnostics: { scope: 'process_lifetime', sampleCount: diagnosticSamples, duplicatePossible: true },
      capabilities: capabilityState(await installed(), process.env, deps.db.backend === 'postgres') };
  });
}
