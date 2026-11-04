// Turn-by-turn from the road route's OSRM maneuvers: which one is next for a position, and how to say it.
import type { Point } from './model.ts';

export type NavStep = { type: string; modifier?: string; name?: string; exit?: number; latitude: number; longitude: number };
export type NavIcon = 'arrow-up' | 'arrow-forward' | 'arrow-back' | 'return-up-back' | 'sync' | 'flag';
type Words = Record<'nav_left' | 'nav_right' | 'nav_slight_left' | 'nav_slight_right' | 'nav_sharp_left' | 'nav_sharp_right' | 'nav_uturn' | 'nav_straight' | 'nav_roundabout' | 'nav_arrive' | 'nav_onto' | 'nav_meters' | 'nav_km', string>;

const KIND: Record<string, keyof Words> = { left: 'nav_left', right: 'nav_right', 'slight left': 'nav_slight_left', 'slight right': 'nav_slight_right',
  'sharp left': 'nav_sharp_left', 'sharp right': 'nav_sharp_right', uturn: 'nav_uturn', straight: 'nav_straight' };

const PASSED_METRES = 15;

/**
 * The maneuver still ahead of `at`, measured along the road: a pickup 100 m away across a field can be three turns away.
 * The line and the steps come from one calculation, so every maneuver sits on the line, in order.
 * ponytail: on a road driven out and back the first pass wins until the next route, at most 250 m later (src/road.tsx).
 */
export function nextManeuver(steps: readonly NavStep[], at: Point, line: readonly [number, number][]): { step: NavStep; metres: number } | null {
  if (steps.length < 2 || line.length < 2) return null;
  const kx = 111_320 * Math.cos(at.latitude * Math.PI / 180), ky = 110_540;
  const walked = [0];
  for (let i = 1; i < line.length; i++) walked[i] = walked[i - 1] + Math.hypot((line[i][0] - line[i - 1][0]) * kx, (line[i][1] - line[i - 1][1]) * ky);
  // The point of the line nearest `p`, from segment `from` on. The 1 m tolerance keeps the earliest pass.
  const locate = (p: Point, from: number) => {
    let best = Infinity, segment = from, metres = walked[from - 1];
    for (let i = from; i < line.length; i++) {
      const ax = (line[i - 1][0] - p.longitude) * kx, ay = (line[i - 1][1] - p.latitude) * ky;
      const dx = (line[i][0] - line[i - 1][0]) * kx, dy = (line[i][1] - line[i - 1][1]) * ky;
      const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
      const off = Math.hypot(ax + t * dx, ay + t * dy);
      if (off < best - 1) { best = off; segment = i; metres = walked[i - 1] + t * Math.hypot(dx, dy); }
    }
    return { segment, metres };
  };
  const here = locate(at, 1).metres;
  let from = 1;
  for (let i = 1; i < steps.length; i++) {
    const place = locate(steps[i], from);
    from = place.segment;
    if (i === steps.length - 1 || place.metres - here > PASSED_METRES) return { step: steps[i], metres: Math.max(0, Math.round(place.metres - here)) };
  }
  return null;
}

const isRoundabout = (step: NavStep) => /roundabout|rotary/.test(step.type);

export function maneuverIcon(step: NavStep): NavIcon {
  if (step.type === 'arrive') return 'flag';
  if (isRoundabout(step)) return 'sync';
  if (step.modifier === 'uturn') return 'return-up-back';
  if (step.modifier?.includes('left')) return 'arrow-back'; // the way the road turns, in either language
  if (step.modifier?.includes('right')) return 'arrow-forward';
  return 'arrow-up';
}

export function maneuverText(step: NavStep, words: Words): string {
  const action = step.type === 'arrive' ? words.nav_arrive
    : isRoundabout(step) ? words.nav_roundabout.replace('{n}', String(step.exit ?? 1))
    : step.type === 'new name' || step.type === 'continue' && (!step.modifier || step.modifier === 'straight') ? words.nav_straight
    : words[KIND[step.modifier ?? 'straight'] ?? 'nav_straight'];
  return step.name && step.type !== 'arrive' ? words.nav_onto.replace('{action}', action).replace('{name}', step.name) : action;
}

export const maneuverDistance = (metres: number, words: Words) => metres >= 1000
  ? words.nav_km.replace('{n}', (metres / 1000).toFixed(1))
  : words.nav_meters.replace('{n}', String(Math.max(10, Math.round(metres / 10) * 10)));
