import { apiSessionRevision, invalidateApiSessionActions, serverOffset } from './api-client';
import { offlineSummary, readOfflineSummary } from './offline-summary';
import { recoveryStorage } from './recovery-storage';
import { effectiveRuntime } from './runtime-config';
import type { Order, Role } from './model';
export type RecoveryActor = { id: number; role: Role; status: string };
let actor: RecoveryActor | null = null;
let cacheQueue: Promise<unknown> = Promise.resolve();
export function configureRecoveryActor(next: RecoveryActor | null) {
  if (actor && (next?.id !== actor.id || next?.role !== actor.role || next?.status !== actor.status)) invalidateApiSessionActions();
  actor = next;
}
export async function savedOfflineSummary() {
  const now = Date.now() + serverOffset();
  return readOfflineSummary(await recoveryStorage.read('summary'), now, effectiveRuntime(now).values.offlineMaxAgeMs);
}
export function cacheOrderSummaries(orders: Order[], replace = false) {
  const owner = actor, revision = apiSessionRevision();
  if (!owner || owner.status !== 'active' || owner.role === 'admin') return;
  const current = () => revision === apiSessionRevision() && actor?.id === owner.id && actor?.role === owner.role;
  const run = cacheQueue.then(async () => {
    if (!current()) return;
    const previous = await savedOfflineSummary().catch(() => null);
    if (!current()) return;
    const now = Date.now() + serverOffset();
    const newest = offlineSummary(owner.id, owner.role, orders, now);
    const changed = new Set(orders.map(order => order.id));
    // Orders missing from this fetch are kept only briefly: their status may have moved on without us.
    const retained = !replace && previous?.actorId === owner.id && previous.role === owner.role && now - previous.savedAt <= 30 * 60_000
      ? previous.orders.filter(order => !changed.has(order.id)) : [];
    newest.orders = [...newest.orders, ...retained].slice(0, 3);
    if (retained.length && previous) newest.savedAt = Math.min(newest.savedAt, previous.savedAt);
    await recoveryStorage.write('summary', newest, effectiveRuntime(now).values.offlineMaxAgeMs);
  });
  cacheQueue = run.catch(() => undefined);
  return cacheQueue;
}
