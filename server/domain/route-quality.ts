import { SLOW_MINUTES } from '../../src/model.ts';

// The fare model already charges a delay for a reported slow checkpoint.
// Routing and ETA use the same number so the price and the promise agree.
// A closed checkpoint keeps its existing "or more" flag and route time: there
// may be no way around, and adding a fixed penalty would invent a delay.
export const checkpointDelaySeconds = (slow: number) => Math.max(0, slow) * SLOW_MINUTES * 60;

export const expectedSeconds = (durationSeconds: number, slow: number) =>
  durationSeconds + checkpointDelaySeconds(slow);

export const expectedMinutes = (durationSeconds: number, slow: number) =>
  Math.max(1, Math.round(durationSeconds / 60) + Math.max(0, slow) * SLOW_MINUTES);

/** Pick the route with the lowest expected time, not just OSRM's free-flow duration. */
export function bestRoute<T extends { duration: number }>(routes: T[], delaySeconds: (route: T) => number): T | undefined {
  let best: T | undefined;
  let bestSeconds = Infinity;
  for (const route of routes) {
    const seconds = route.duration + Math.max(0, delaySeconds(route));
    if (seconds < bestSeconds) { best = route; bestSeconds = seconds; }
  }
  return best;
}
