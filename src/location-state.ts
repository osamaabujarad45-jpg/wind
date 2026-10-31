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

type PublicFix = { updatedAt: number; ageSeconds?: number };
type PublicFixClock = { updatedAt: number; ageMs: number; monotonicAt: number };

/** Keep elapsed time for a particular fix even if the phone's wall clock changes while offline. */
export function publicFixAgeMs(fix: PublicFix, now: number, clock?: PublicFixClock, monotonic = 0) {
  return Math.max(0, now + serverOffset() - fix.updatedAt,
    typeof fix.ageSeconds === 'number' && Number.isFinite(fix.ageSeconds) ? fix.ageSeconds * 1000 : 0,
    clock?.updatedAt === fix.updatedAt ? clock.ageMs + Math.max(0, monotonic - clock.monotonicAt) : 0);
}
export const publicFixClock = (fix: PublicFix, now: number, monotonic: number): PublicFixClock =>
  ({ updatedAt: fix.updatedAt, ageMs: publicFixAgeMs(fix, now), monotonicAt: monotonic });

/** A public link may retain the last known marker only while it remains within its display window. */
export const retainedPublicFix = <T extends PublicFix>(fix: T | null | undefined, now = Date.now(), clock?: PublicFixClock, monotonic = 0) =>
  fix && Number.isFinite(fix.updatedAt) && publicFixAgeMs(fix, now, clock, monotonic) <= 120_000 ? fix : null;
