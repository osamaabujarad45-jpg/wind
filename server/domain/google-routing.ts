/**
 * Google Routes proxy core (T07/T08): validation, one billed request shape, budgets.
 *
 * Coordinate boundaries (the whole app has exactly three conventions):
 * - This module takes `{ latitude, longitude }` objects. `coordinate()` is the only validator;
 *   anything malformed, non-finite or out of range is rejected before an upstream call.
 * - User input arrives as the API's `lat,lng` string (`/api/route?from=lat,lng` today); `latLngQuery()`
 *   parses that one place so no endpoint re-invents the order.
 * - Route lines leave as `[longitude, latitude]` pairs: the order MapLibre/OSRM lines use and the
 *   order Google's polyline encodes. `decodePolyline()` converts and rounds to 1e-5. Google's own
 *   `{ lat, lng }` JSON from other APIs never reaches a caller; convert it with `coordinate()`.
 *
 * Upstream: `GOOGLE_ROUTES_ORIGIN` is a module constant. The request object has no URL, key, field
 * mask or header field, so nothing a client sends can redirect or re-key the call. The
 * `upstreamOrigin` option exists only for the fake fixture server in tests.
 *
 * Budget ownership: the counters below are in-process and belong to one proxy instance. Wind runs a
 * single API instance, so that instance is the whole budget; a second replica would double every cap.
 * Upgrade path (no caller change): keep these options and back the counters with the shared
 * `request_limits` (per user) and `google_usage` (per SKU per day) tables.
 *
 * No caching: OSRM's `roadCache` policy does not transfer. Google route content may not outlive the
 * request, so two identical calls bill twice (tested). No request or response body is ever logged;
 * callers may log the `provider` metadata only.
 */
export const GOOGLE_ROUTES_ORIGIN = 'https://routes.googleapis.com';
export const COMPUTE_ROUTES_PATH = '/directions/v2:computeRoutes';
// Minimal billed fields: distance, duration and one encoded line. No legs/steps/navigation text.
export const FIELD_MASK = 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline';
// A foreground fix that moved less than this is a wobble, not a reason to buy a new route.
export const SIGNIFICANT_MOVEMENT_METRES = 250;

const DEFAULT_TIMEOUT_MS = 4_000;
// Pilot budgets from the maps plan: 60 routes per user per 10 minutes, 2,000 per day across users.
const DEFAULT_PER_USER = { max: 60, windowMs: 10 * 60_000 };
const DEFAULT_GLOBAL = { max: 2_000, windowMs: 24 * 60 * 60_000 };
// Client-side guard, not Google's 3,000 QPM ceiling: four in flight keeps one incident from fanning out.
const DEFAULT_MAX_IN_FLIGHT = 4;
const MAX_TRACKED_USERS = 10_000;
const MAX_LINE_POINTS = 50_000;

export type Coordinate = { latitude: number; longitude: number };
export type Limit = { max: number; windowMs: number };

/** The single coordinate boundary. Arrays, `{ lat, lng }`, strings and ranges outside the earth fail. */
export function coordinate(value: unknown): Coordinate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { latitude, longitude } = value as { latitude?: unknown; longitude?: unknown };
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

/** Parse the API's `lat,lng` query string; anything else is malformed, never silently zero. */
export function latLngQuery(value: string | null | undefined): Coordinate | null {
  if (typeof value !== 'string') return null;
  const parts = value.split(',');
  if (parts.length !== 2) return null;
  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (parts[0].trim() === '' || parts[1].trim() === '') return null;
  return coordinate({ latitude, longitude });
}

/** Decode Google's encoded polyline into `[longitude, latitude]` pairs rounded to 1e-5. */
export function decodePolyline(encoded: unknown): [number, number][] | null {
  if (typeof encoded !== 'string' || !encoded) return null;
  const line: [number, number][] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const delta = (): number | null => {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (index >= encoded.length || shift > 30) return null;
      const byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (byte < 0x20) break;
    }
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    const dLat = delta();
    if (dLat === null) return null;
    const dLng = delta();
    if (dLng === null) return null;
    latitude += dLat;
    longitude += dLng;
    const lat = latitude / 1e5;
    const lng = longitude / 1e5;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    line.push([Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);
    if (line.length > MAX_LINE_POINTS) return null;
  }
  return line.length >= 2 ? line : null;
}

/**
 * Why a caller may bill a route. Only preview, a changed destination, significant foreground
 * movement and an explicitly authorized retry bill: a stationary poll, a background timer or an
 * anonymous refresh must not (tested).
 */
export type RerouteTrigger =
  | { kind: 'preview'; shown: boolean }
  | { kind: 'destination'; changed: boolean }
  | { kind: 'movement'; foreground: boolean; metres: number }
  | { kind: 'retry'; authorized: boolean; failed: GoogleRoutesErrorCode }
  | { kind: 'poll' }
  | { kind: 'background' }
  | { kind: 'anonymous' };

/** Pure policy: true only for a billable trigger. No I/O, no clock, no memory. */
export function shouldReroute(trigger: RerouteTrigger | null | undefined): boolean {
  if (!trigger) return false;
  switch (trigger.kind) {
    case 'preview': return trigger.shown === true;
    case 'destination': return trigger.changed === true;
    case 'movement':
      return trigger.foreground === true && Number.isFinite(trigger.metres) && trigger.metres >= SIGNIFICANT_MOVEMENT_METRES;
    case 'retry':
      return trigger.authorized === true && (trigger.failed === 'maps_unavailable' || trigger.failed === 'maps_quota');
    case 'poll':
    case 'background':
    case 'anonymous':
      return false;
    default:
      return false;
  }
}

export type GoogleRoutesErrorCode =
  | 'unauthorized'
  | 'invalid_input'
  | 'not_billable'
  | 'maps_disabled'
  | 'too_many_attempts'
  | 'maps_quota'
  | 'maps_unavailable'
  | 'no_route';

const ERROR_MESSAGES: Record<GoogleRoutesErrorCode, string> = {
  unauthorized: 'google routes: unauthorized',
  invalid_input: 'google routes: invalid input',
  not_billable: 'google routes: trigger is not billable',
  maps_disabled: 'google routes: disabled by configuration',
  too_many_attempts: 'google routes: request budget exhausted',
  maps_quota: 'google routes: provider quota exhausted',
  maps_unavailable: 'google routes: provider unavailable',
  no_route: 'google routes: no route',
};
const RETRYABLE: Record<GoogleRoutesErrorCode, boolean> = {
  unauthorized: false,
  invalid_input: false,
  not_billable: false,
  maps_disabled: false,
  too_many_attempts: false,
  maps_quota: true,
  maps_unavailable: true,
  no_route: false,
};

/**
 * A typed failure with a fixed message. Upstream bodies, Google messages and the API key never
 * reach the message or any field, so an error is safe to log or return.
 */
export class GoogleRoutesError extends Error {
  readonly code: GoogleRoutesErrorCode;
  readonly retryable: boolean;
  readonly upstreamStatus: number | null;
  constructor(code: GoogleRoutesErrorCode, upstreamStatus: number | null = null, retryable: boolean = RETRYABLE[code]) {
    super(ERROR_MESSAGES[code]);
    this.name = 'GoogleRoutesError';
    this.code = code;
    this.retryable = retryable;
    this.upstreamStatus = upstreamStatus;
  }
}

/** Kill switch: `GOOGLE_MAPS_ENABLED=0` or `MAP_PROVIDER=maplibre` disables billing immediately. */
export function routesDisabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.GOOGLE_MAPS_ENABLED === '0' || env.MAP_PROVIDER === 'maplibre';
}

/** What every result says about the provider it used, whether or not a call was made. */
export type ProviderMetadata = {
  provider: 'google-routes';
  endpoint: typeof COMPUTE_ROUTES_PATH;
  fieldMask: typeof FIELD_MASK;
  trafficAware: false;
  upstream: boolean;
};

export type GoogleRoute = { metres: number; seconds: number; line: [number, number][] };
export type RouteOutcome =
  | { ok: true; route: GoogleRoute; provider: ProviderMetadata }
  | { ok: false; error: GoogleRoutesError; provider: ProviderMetadata };

export type RouteRequest = {
  /** Opaque per-user budget key, already hashed by the caller. */
  userKey: string;
  origin: Coordinate;
  destination: Coordinate;
  trigger: RerouteTrigger;
};

export type GoogleRoutesOptions = {
  /** Server key from `GOOGLE_MAPS_SERVER_KEY`. Never accepted from a request. */
  apiKey?: string;
  /** Lookup source for the kill switch; defaults to `process.env` on every call. */
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  perUser?: Limit;
  global?: Limit;
  maxInFlight?: number;
  now?: () => number;
  /** Tests only: point the fixed path at a fake node:http fixture. */
  upstreamOrigin?: string;
};

export type GoogleRoutes = { route(request: RouteRequest): Promise<RouteOutcome> };

/** HTTP guards stay in the server shell; the registrar is a thin boundary over the pure core. */
export type GoogleRouteGuards = {
  fail: (status: number, code: string) => never;
  limit: (key: string, maximum: number, windowMs: number) => Promise<unknown>;
  budgetKey: (userId: string | number) => string;
};

type Register = (method: string, path: string, handler: (ctx: { user: { id: number }; query: URLSearchParams }) => Promise<unknown>) => unknown;

const STATUS_BY_CODE: Record<GoogleRoutesErrorCode, number> = {
  unauthorized: 401, invalid_input: 400, not_billable: 400, maps_disabled: 503,
  too_many_attempts: 429, maps_quota: 503, maps_unavailable: 503, no_route: 404,
};

/** Query-encoded billable trigger; anything the policy table does not name is a 400, never a bill. */
function parseTrigger(query: URLSearchParams, fail: GoogleRouteGuards['fail']): RerouteTrigger {
  const kind = query.get('trigger') ?? 'preview';
  const on = (name: string) => query.get(name) === '1';
  if (kind === 'preview') return { kind, shown: on('shown') };
  if (kind === 'destination') return { kind, changed: on('changed') };
  if (kind === 'movement') return { kind, foreground: on('foreground'), metres: Number(query.get('metres') ?? 0) };
  if (kind === 'retry') {
    const failed = query.get('failed');
    if (failed !== 'maps_unavailable' && failed !== 'maps_quota') return fail(400, 'invalid_trigger');
    return { kind, authorized: on('authorized'), failed };
  }
  if (kind === 'poll' || kind === 'background' || kind === 'anonymous') return { kind };
  return fail(400, 'invalid_trigger');
}

/**
 * The one Google boundary the app may call. It never changes money: fares, feasibility and
 * checkpoint policy keep reading the OSRM route (plan decision 3); this returns a display
 * route with provider metadata, or a typed unavailable error the client must label.
 */
export function registerGoogleRouteRoutes(route: Register, proxy: GoogleRoutes, guards: GoogleRouteGuards): void {
  route('GET', '/api/route/google', async ({ user, query }) => {
    (await guards.limit(guards.budgetKey(user.id), 120, 10 * 60_000));
    const origin = latLngQuery(query.get('from')), destination = latLngQuery(query.get('to'));
    if (!origin || !destination) return guards.fail(400, 'invalid_input');
    const outcome = await proxy.route({ userKey: guards.budgetKey(user.id), origin, destination, trigger: parseTrigger(query, guards.fail) });
    if (!outcome.ok) return guards.fail(STATUS_BY_CODE[outcome.error.code] ?? 503, outcome.error.code);
    const { metres, seconds, line } = outcome.route;
    // roadRoute's km rounding; minutes carry no checkpoint delay because this line is display-only.
    return { km: Math.round(metres / 100) / 10, minutes: Math.max(1, Math.ceil(seconds / 60)), line, provider: outcome.provider };
  });
}

const positive = (value: number | undefined, fallback: number, floor = 1) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(floor, Math.floor(value)) : fallback;

const sanitizeLimit = (value: Limit | undefined, fallback: Limit): Limit => ({
  max: positive(value?.max, fallback.max),
  windowMs: positive(value?.windowMs, fallback.windowMs),
});

export function createGoogleRoutes(options: GoogleRoutesOptions = {}): GoogleRoutes {
  const upstreamOrigin = (options.upstreamOrigin ?? GOOGLE_ROUTES_ORIGIN).replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/?#]+$/.test(upstreamOrigin)) throw new Error('google routes: invalid upstream origin');
  const apiKey = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const timeoutMs = positive(options.timeoutMs, DEFAULT_TIMEOUT_MS, 50);
  const perUser = sanitizeLimit(options.perUser, DEFAULT_PER_USER);
  const globalLimit = sanitizeLimit(options.global, DEFAULT_GLOBAL);
  const maxInFlight = positive(options.maxInFlight, DEFAULT_MAX_IN_FLIGHT);
  const now = options.now ?? Date.now;
  const environment = () => options.env ?? process.env;

  // In-process counters: one proxy instance owns the whole budget (see the owner note above).
  const users = new Map<string, { start: number; count: number }>();
  let globalState = { start: -1, count: 0 };
  let inFlight = 0;

  const bucket = (limit: Limit, at: number) => Math.floor(at / limit.windowMs) * limit.windowMs;
  const pruneUsers = (start: number) => {
    for (const [key, state] of users) if (state.start !== start) users.delete(key);
    for (const key of users.keys()) {
      if (users.size < MAX_TRACKED_USERS) break;
      users.delete(key);
    }
  };

  const provider = (): ProviderMetadata => ({
    provider: 'google-routes',
    endpoint: COMPUTE_ROUTES_PATH,
    fieldMask: FIELD_MASK,
    trafficAware: false,
    upstream: false,
  });
  const failure = (code: GoogleRoutesErrorCode, metadata: ProviderMetadata,
    status: number | null = null, retryable?: boolean): RouteOutcome =>
    ({ ok: false, error: new GoogleRoutesError(code, status, retryable), provider: { ...metadata } });

  const route = async (request: RouteRequest): Promise<RouteOutcome> => {
    const metadata = provider();
    if (typeof request?.userKey !== 'string' || !request.userKey) return failure('unauthorized', metadata);
    if (!shouldReroute(request.trigger)) return failure('not_billable', metadata);
    if (routesDisabled(environment())) return failure('maps_disabled', metadata);
    if (!apiKey) return failure('maps_unavailable', metadata, null, false); // misconfigured, never worth a call
    const origin = coordinate(request.origin);
    const destination = coordinate(request.destination);
    if (!origin || !destination) return failure('invalid_input', metadata);
    if (origin.latitude === destination.latitude && origin.longitude === destination.longitude) {
      return failure('invalid_input', metadata);
    }

    // Check every budget before charging any: a denied global cap must not spend the user's unit.
    const at = now();
    const userStart = bucket(perUser, at);
    let user = users.get(request.userKey);
    if (!user || user.start !== userStart) {
      if (!user && users.size >= MAX_TRACKED_USERS) pruneUsers(userStart);
      user = { start: userStart, count: 0 };
      users.set(request.userKey, user);
    }
    const globalStart = bucket(globalLimit, at);
    if (globalState.start !== globalStart) globalState = { start: globalStart, count: 0 };
    if (user.count >= perUser.max || globalState.count >= globalLimit.max || inFlight >= maxInFlight) {
      return failure('too_many_attempts', metadata);
    }
    user.count++;
    globalState.count++;
    inFlight++;
    metadata.upstream = true;

    try {
      const body = {
        origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
        destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE', // the West Bank has no Google traffic model; Pro SKU buys nothing
        polylineQuality: 'HIGH_QUALITY',
        computeAlternativeRoutes: false,
        languageCode: 'ar',
        units: 'METRIC',
      };
      let response: Response;
      try {
        response = await fetch(`${upstreamOrigin}${COMPUTE_ROUTES_PATH}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELD_MASK },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        // Timeout or network failure: transient, and no body was read.
        return failure('maps_unavailable', metadata);
      }
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => undefined); // free the socket; the body is never read or logged
        if (response.status === 404) return failure('no_route', metadata, 404);
        if (response.status === 429) return failure('maps_quota', metadata, 429);
        if (response.status === 400) return failure('invalid_input', metadata, 400);
        if (response.status === 403) return failure('maps_unavailable', metadata, 403, false);
        return failure('maps_unavailable', metadata, response.status, response.status >= 500);
      }
      let text: string;
      try {
        text = await response.text();
      } catch {
        return failure('maps_unavailable', metadata);
      }
      const parsed = parseRoutesPayload(text);
      if (parsed.kind === 'no_route') return failure('no_route', metadata, 200);
      if (parsed.kind === 'malformed') return failure('maps_unavailable', metadata, 200, false);
      return { ok: true, route: parsed.route, provider: { ...metadata } };
    } finally {
      inFlight--;
    }
  };

  return { route };
}

type ParsedRoutes =
  | { kind: 'route'; route: GoogleRoute }
  | { kind: 'no_route' }
  | { kind: 'malformed' };

const DURATION = /^\d+(?:\.\d+)?s$/;

/** Validate the documented three fields; anything else is a provider contract break, not a route. */
function parseRoutesPayload(text: string): ParsedRoutes {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return { kind: 'malformed' };
  }
  const routes = (payload as { routes?: unknown })?.routes;
  if (!Array.isArray(routes) || routes.length === 0) {
    return Array.isArray(routes) ? { kind: 'no_route' } : { kind: 'malformed' };
  }
  const first = routes[0] as { distanceMeters?: unknown; duration?: unknown; polyline?: { encodedPolyline?: unknown } };
  const metres = first?.distanceMeters;
  const seconds = first?.duration;
  if (typeof metres !== 'number' || !Number.isFinite(metres) || metres < 0) return { kind: 'malformed' };
  if (typeof seconds !== 'string' || !DURATION.test(seconds)) return { kind: 'malformed' };
  const line = decodePolyline(first.polyline?.encodedPolyline);
  if (!line) return { kind: 'malformed' };
  return { kind: 'route', route: { metres, seconds: Number(seconds.slice(0, -1)), line } };
}
