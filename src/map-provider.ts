// T06 (tasks/maps-contract.md): typed renderer capability and route provenance.
// Renderer families are baked into the binary per platform (route-map.tsx / route-map.android.tsx /
// route-map.native.tsx), and every route names its provider on the data. Google Routes content is licensed
// for Google renderers only, so provenance is checked before any line reaches a MapLibre/Apple overlay,
// and anything unknown fails closed: pins stay, no line, never an unlabelled guess.

export type MapRenderer = 'maplibre' | 'apple' | 'google';
export type RouteProvider = 'osrm' | 'google';

/** Renderer families compiled into this binary, in preference order, keyed by the Platform.OS value. */
export const platformRenderers: Record<string, MapRenderer[]> = {
  web: ['maplibre'],
  android: ['maplibre'],
  ios: ['apple'],
};

/**
 * The renderer this platform draws with today. The first family baked into the binary is the default; when
 * a Google family is also baked in (`baked` capability from the build, never a runtime fetch) and the user
 * selected the Google mode, that renderer is used. An unknown platform falls back to the baseline every
 * client ships, never to a renderer that may be absent — a kill switch cannot enable a renderer the binary
 * does not contain.
 */
export function selectRenderer(platform: string, baked?: { android?: boolean; ios?: boolean; web?: boolean } | null, preference?: string): MapRenderer {
  if (preference === 'google') {
    const available = platform === 'android' ? !!baked?.android : platform === 'ios' ? !!baked?.ios : !!baked?.web;
    if (available) return 'google';
  }
  return platformRenderers[platform]?.[0] ?? 'maplibre';
}

/**
 * Normalize a route response's provenance: /api/route sends `provider: 'osrm'`, the Google proxy sends
 * `provider: { provider: 'google-routes', … }`, and responses older than either name no provider at all
 * (they were OSRM). Anything unrecognised stays unrecognised so the renderer guard refuses it.
 */
export function routeProvider(value: unknown): string {
  if (value == null) return 'osrm';
  if (typeof value === 'string') return value === 'google-routes' ? 'google' : value;
  if (typeof value === 'object' && typeof (value as { provider?: unknown }).provider === 'string')
    return routeProvider((value as { provider: string }).provider);
  return 'unknown';
}

/**
 * May this provider's geometry be drawn on this renderer? Baseline OSRM renders everywhere; Google
 * content only on a Google renderer; unknown provenance nowhere.
 */
export function canShowOnRenderer(provider: string, renderer: MapRenderer): boolean {
  if (provider === 'google') return renderer === 'google';
  return provider === 'osrm';
}

/** What a kept route/ETA belongs to: order, driver, stop and provider — any change must drop the cached state. */
export const approachKey = (
  order: { id?: number | string; driverId?: number | null },
  target: { latitude: number; longitude: number } | undefined,
  provider: string,
) => `${order.id ?? ''}:${order.driverId ?? ''}:${target ? `${target.latitude},${target.longitude}` : ''}:${provider}`;

/**
 * The one Google call a booking screen makes (T13): a display route for the current pin pair, billed only
 * for a first shown preview or a changed pin pair — never for a rerender, a refocus or a poll (T08's
 * trigger policy; the server 400s anything else). The client never sends an unauthorized retry.
 */
export const googlePreviewPath = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
  changedPinPair: boolean,
) => `/route/google?from=${a.latitude.toFixed(5)},${a.longitude.toFixed(5)}&to=${b.latitude.toFixed(5)},${b.longitude.toFixed(5)
}&trigger=${changedPinPair ? 'destination&changed=1' : 'preview&shown=1'}`;

/** Mirrors server/domain/google-routing.ts: only a real drive re-bills a tracking route. Kept in step by tests. */
export const SIGNIFICANT_MOVEMENT_METRES = 250;

/**
 * Private tracking's approach (T14): the first approach for a stop bills as a shown preview; afterwards only
 * a significant movement while the app is foregrounded re-bills. Stationary polls, background timers and
 * refocuses build no URL at all — the caller passes metres 0 for the first call and ≥ 250 afterwards.
 */
export const googleApproachPath = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
  metresSinceLastBill: number,
) => metresSinceLastBill <= 0
  ? `/route/google?from=${a.latitude.toFixed(5)},${a.longitude.toFixed(5)}&to=${b.latitude.toFixed(5)},${b.longitude.toFixed(5)}&trigger=preview&shown=1`
  : `/route/google?from=${a.latitude.toFixed(5)},${a.longitude.toFixed(5)}&to=${b.latitude.toFixed(5)},${b.longitude.toFixed(5)
  }&trigger=movement&foreground=1&metres=${Math.round(metresSinceLastBill)}`;
