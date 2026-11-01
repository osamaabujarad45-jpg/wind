import { api } from './api';
import { apiSessionRevision } from './api-client';
import { clientDiagnostics } from './client-diagnostics';
import { recoveryStorage } from './recovery-storage';
import { newRequestId } from './booking';

/** Small first-party samples only; no raw URL, body, bearer, PIN, phone, order id or precise coordinate. */
export function startDiagnosticDelivery() {
  const revision = apiSessionRevision();
  let stopped = false, flushing = false, persistTimer: ReturnType<typeof setTimeout> | undefined;
  const valid = () => !stopped && revision === apiSessionRevision();
  const persist = async () => { if (valid()) await recoveryStorage.write('diagnostics', clientDiagnostics.snapshot(), 30 * 60_000).catch(() => {}); };
  const persistSoon = () => { if (!persistTimer && valid()) persistTimer = setTimeout(() => { persistTimer = undefined; void persist(); }, 30_000); };
  const unsubscribe = clientDiagnostics.subscribe(persistSoon);
  void recoveryStorage.read('diagnostics').then(saved => { if (valid() && saved !== null) clientDiagnostics.hydrate(saved); }).catch(() => {});
  const flush = async () => {
    if (!valid() || flushing) return;
    const events = clientDiagnostics.snapshot();
    if (!events.length) return;
    flushing = true;
    try {
      const result = await api<{ accepted: number }>('/runtime/diagnostics', { schemaVersion: 1, batchId: newRequestId(), events });
      if (valid() && result.accepted === events.length) { clientDiagnostics.acknowledge(events.map(event => event.id)); await persist(); }
    } catch { /* The bounded encrypted snapshot survives; next foreground delivery retries. */ }
    finally { flushing = false; }
  };
  const timer = setInterval(() => { void flush(); }, 60_000);
  persistSoon();
  return () => { stopped = true; unsubscribe(); clearInterval(timer); if (persistTimer) clearTimeout(persistTimer); };
}
