import { serverOffset } from './api-client.ts';
import type { Order } from './model';

export function locationState(location: Order['driverLocation'], now = Date.now()) {
  if (!location || !Number.isFinite(location.updatedAt)) return null;
  const serverAge = Number.isFinite(location.ageSeconds) ? location.ageSeconds : 0;
  const ageSeconds = Math.max(0, serverAge, Math.floor((now + serverOffset() - location.updatedAt) / 1000)); // fix times are server clock
  // ponytail: two-minute freshness heuristic; tune against measured driver update intervals.
  return { ageSeconds, stale: ageSeconds >= 120 };
}

/** The newer of two reports of one driver fix (the live push and the screen's poll); a missing one loses. */
export const newerFix = <T extends { updatedAt: number }>(a: T | null | undefined, b: T | null | undefined) =>
  !a ? b ?? null : !b || a.updatedAt >= b.updatedAt ? a : b;
