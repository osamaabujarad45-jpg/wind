import { newRequestId } from './command-id.ts';
import { serverOffset } from './api-clock.ts';
export const diagnosticCategories = ['api_result','map_ready','map_failed','session_ready','intro_released','command_pending','command_recovered'] as const;
export type ClientDiagnostic = { id: string; category: typeof diagnosticCategories[number]; at: number; durationMs?: number; httpStatus?: number; outcome?: 'ok' | 'error'; provider?: 'maplibre' | 'apple' | 'google' };
const LIMIT = 6, TTL = 30 * 60_000;
const allowed = ['id','category','at','durationMs','httpStatus','provider','outcome'];
export function readDiagnostics(input: unknown, now = Date.now()): ClientDiagnostic[] {
  if (!Array.isArray(input) || input.length > LIMIT) throw new Error('invalid_diagnostics');
  return input.map(item => {
    if (!item || typeof item !== 'object' || Object.keys(item).some(key => !allowed.includes(key))
      || typeof item.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(item.id) || !diagnosticCategories.includes(item.category)
      || !Number.isSafeInteger(item.at) || item.at < now - TTL || item.at > now + 5_000
      || (item.durationMs !== undefined && (!Number.isSafeInteger(item.durationMs) || item.durationMs < 0 || item.durationMs > 120_000))
      || (item.httpStatus !== undefined && (!Number.isInteger(item.httpStatus) || item.httpStatus < 100 || item.httpStatus > 599))
      || (item.outcome !== undefined && !['ok','error'].includes(item.outcome))
      || (item.provider !== undefined && !['maplibre','apple','google'].includes(item.provider))) throw new Error('invalid_diagnostics');
    return { ...item } as ClientDiagnostic;
  });
}
export function createDiagnosticBuffer(now: () => number = Date.now) {
  let entries: ClientDiagnostic[] = [], dropped = 0;
  const listeners = new Set<() => void>();
  const trim = () => { entries = entries.filter(item => now() - item.at < TTL && item.at <= now() + 5_000); };
  return {
    record(category: ClientDiagnostic['category'], detail: Omit<ClientDiagnostic,'id' | 'at' | 'category'> = {}) {
      const item = { ...detail, id: newRequestId(), category, at: now() };
      readDiagnostics([item], now()); trim(); entries.push(item);
      if (entries.length > LIMIT) { entries.shift(); dropped++; }
      for (const listener of listeners) listener();
    },
    snapshot() { trim(); return entries.map(item => ({ ...item })); },
    hydrate(input: unknown) {
      const saved = readDiagnostics(input, now()), ids = new Set(entries.map(item => item.id));
      entries = [...saved.filter(item => !ids.has(item.id)), ...entries].slice(-LIMIT); trim();
    },
    acknowledge(ids: readonly string[]) { const saved = new Set(ids); entries = entries.filter(item => !saved.has(item.id)); },
    clear() { entries = []; dropped = 0; },
    dropped() { return dropped; },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
export const clientDiagnostics = createDiagnosticBuffer(() => Date.now() + serverOffset());
