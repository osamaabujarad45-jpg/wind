// Turn-by-turn from the road route's OSRM maneuvers: which one is next for a position, and how to say it.
import { crowKm, type Point } from './model.ts';

export type NavStep = { type: string; modifier?: string; name?: string; exit?: number; latitude: number; longitude: number };
export type NavIcon = 'arrow-up' | 'arrow-forward' | 'arrow-back' | 'return-up-back' | 'sync' | 'flag';
type Words = Record<'nav_left' | 'nav_right' | 'nav_slight_left' | 'nav_slight_right' | 'nav_sharp_left' | 'nav_sharp_right' | 'nav_uturn' | 'nav_straight' | 'nav_roundabout' | 'nav_arrive' | 'nav_onto' | 'nav_meters' | 'nav_km', string>;

const KIND: Record<string, keyof Words> = { left: 'nav_left', right: 'nav_right', 'slight left': 'nav_slight_left', 'slight right': 'nav_slight_right',
  'sharp left': 'nav_sharp_left', 'sharp right': 'nav_sharp_right', uturn: 'nav_uturn', straight: 'nav_straight' };

/** The maneuver still ahead of `at`. The list starts where the route was last calculated, so `at` may already be past some. */
export function nextManeuver(steps: readonly NavStep[], at: Point): { step: NavStep; metres: number } | null {
  if (steps.length < 2) return null;
  const distance = (a: Point, b: Point) => crowKm(a, b) * 1000;
  let nearest = 1, best = Infinity;
  for (let i = 1; i < steps.length; i++) {
    const metres = distance(at, steps[i]!);
    if (metres < best) { best = metres; nearest = i; }
  }
  // Closer to the following maneuver than this one is: this one is behind us.
  const following = steps[nearest + 1];
  const passed = best < 25 || (!!following && distance(at, following) < distance(steps[nearest]!, following));
  const index = passed && following ? nearest + 1 : nearest;
  return { step: steps[index]!, metres: Math.round(distance(at, steps[index]!)) };
}

const isRoundabout = (step: NavStep) => /roundabout|rotary/.test(step.type);

export function maneuverIcon(step: NavStep, rtl = false): NavIcon {
  if (step.type === 'arrive') return 'flag';
  if (isRoundabout(step)) return 'sync';
  if (step.modifier === 'uturn') return 'return-up-back';
  if (step.modifier?.includes('left')) return rtl ? 'arrow-back' : 'arrow-back';
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
