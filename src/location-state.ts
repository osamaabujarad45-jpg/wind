import { serverOffset } from './api-client.ts';

export function locationState(location: { updatedAt: number; ageSeconds?: number } | null | undefined, now = Date.now()) {
  if (!location || !Number.isFinite(location.updatedAt)) return null;
  const serverAge = typeof location.ageSeconds === 'number' && Number.isFinite(location.ageSeconds) ? location.ageSeconds : 0;
  const ageSeconds = Math.max(0, serverAge, Math.floor((now + serverOffset() - location.updatedAt) / 1000)); // fix times are server clock
  // ponytail: thresholds follow the presence freshness limit (30 s, the server drops older fixes) and the 15 s stationary cadence.
  // A stationary driver's fix at ~15 s is normal, so "weak" starts at 30 s and "stale" at two missed stationary cycles. Tune on measured intervals.
  return { ageSeconds, stale: ageSeconds >= 60, reconnecting: ageSeconds >= 30 && ageSeconds < 60 };
}

/** The newer of two reports of one driver fix (the live push and the screen's poll); a missing one loses. */
export const newerFix = <T extends { updatedAt: number }>(a: T | null | undefined, b: T | null | undefined) =>
  !a ? b ?? null : !b || a.updatedAt >= b.updatedAt ? a : b;
