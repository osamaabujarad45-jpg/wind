import type { Order } from './model';

export function locationState(location: Order['driverLocation'], now = Date.now()) {
  if (!location || !Number.isFinite(location.updatedAt)) return null;
  const serverAge = Number.isFinite(location.ageSeconds) ? location.ageSeconds : 0;
  const ageSeconds = Math.max(0, serverAge, Math.floor((now - location.updatedAt) / 1000));
  // ponytail: two-minute freshness heuristic; tune against measured driver update intervals.
  return { ageSeconds, stale: ageSeconds >= 120 };
}
