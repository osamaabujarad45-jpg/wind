import { routeFramePoints } from './map-math.ts';
import type { Point } from './model.ts';
export const MAP_FOLLOW_ZOOM = 15;
export type MapInsets = { top: number; right: number; bottom: number; left: number };
export function visibleMapInsets(sources: readonly Partial<MapInsets>[], width: number, height: number): MapInsets {
  const inset = (edge: keyof MapInsets, span: number) => Math.min(Math.max(0, Number.isFinite(span) ? span - 1 : 0),
    Math.max(0, ...sources.map(source => Number.isFinite(source[edge]) ? Math.max(0, source[edge]!) : 0)));
  return { top: inset('top', height), right: inset('right', width), bottom: inset('bottom', height), left: inset('left', width) };
}
export function mapCameraIntent(input: { pickup: Point; dropoff: Point; driver?: Point | null; focus?: 'pickup' | 'dropoff';
  road?: [number,number][] | null; approach?: [number,number][] | null; userControlled: boolean; width: number; height: number; occlusion?: readonly Partial<MapInsets>[] }) {
  const padding = visibleMapInsets(input.occlusion ?? [{ top: 24, right: 24, bottom: 24, left: 24 }], input.width, input.height);
  const visible = input.width - padding.left - padding.right >= 44 && input.height - padding.top - padding.bottom >= 44;
  return { mode: input.userControlled || !visible ? 'manual' as const : input.driver ? 'follow' as const : 'fit' as const, visible,
    center: input.driver ?? null, zoom: MAP_FOLLOW_ZOOM, points: routeFramePoints(input), padding };
}
