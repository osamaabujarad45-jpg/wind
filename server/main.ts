/// <reference types="node" />
// Wind API: Node 24 HTTP server with owned async SQLite/PostgreSQL persistence.
// Run: node server/main.ts Â· Make an admin: node server/main.ts promote 0599XXXXXX
import { createServer, type IncomingMessage } from 'node:http';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { initializeSqlite } from './db/sqlite-schema.ts';
import { runtimePersistence } from './db/runtime.ts';
import { databaseUnavailable } from './http/database-errors.ts';
import { customerStatistics, driverStatistics } from './domain/statistics.ts';
import { durableProtocolAvailable, enqueuePush, publicEvent } from './domain/events.ts';
import { versionedCommand } from './domain/commands.ts';
import { PhoneIdentity, registerPhoneRoutes } from './domain/phone-identity.ts';
import { Eligibility, measuredCapability, measuredScopes, registerEligibilityRoutes } from './domain/eligibility.ts';
import { Presence, registerPresenceRoutes } from './domain/presence.ts';
import { Dispatch, registerDispatchRoutes, straightLineEta } from './domain/dispatch.ts';
import { etaProjection, journeyOrder, offerFailure } from './domain/journey.ts';
import { RideLifecycle, registerRideLifecycleRoutes } from './domain/ride-lifecycle.ts';
import { ResourceScope, registerResourceScopeRoutes, validateDeclaredScope, saveDeclaredScope, scopeAvailable, scopePayloadHash } from './domain/resource-scope.ts';
import { createPrivateObjects, registerPrivateObjectRoutes } from './domain/private-objects.ts';
import { Ledger, ledgerAvailable, registerLedgerRoutes } from './domain/ledger.ts';
import { createPayments, registerPaymentsRoutes } from './domain/payments.ts';
import { Ops, registerOpsRoutes } from './domain/ops.ts';
import { NativePush, nativePushAvailable, registerNativePushRoutes, URGENT_KINDS } from './domain/native-push.ts';
import { Realtime, registerRealtimeRoutes } from './domain/realtime.ts';
import { EntraUnavailableError, entraConfig, registerEntraRoutes, verifyEntraIdToken } from './domain/entra.ts';
import { registerActiveGpsRoutes } from './domain/active-gps-routes.ts';
import { destinationAvailable, destinationEligible, pendingDestination, registerDestinationRoutes } from './domain/destination-change.ts';
import { cashOwed } from './domain/money.ts';
import { logServerError } from './domain/diagnostics.ts';
import { hashPassword as createPasswordHash, verifyPassword, PasswordBusyError, closePasswordHasher } from './domain/passwords.ts';
import { SESSION_DAYS, SESSION_IDLE_DAYS } from './domain/session-policy.ts';
import { clientAddress } from './domain/client-address.ts';
import { registerRoutingStatusRoutes } from './domain/routing-status.ts';
import { createGoogleRoutes, registerGoogleRouteRoutes } from './domain/google-routing.ts';
import { registerPlaceSearchRoutes } from './domain/place-search.ts';
import { registerPlaceIndexRoutes } from './domain/place-index.ts';
import { registerCashOpsRoutes } from './domain/cash-ops.ts';
import { registerBookingReceiptRoutes } from './domain/booking-receipts.ts';
import { clientUpdateRequired, registerRuntimeRoutes } from './domain/runtime-readiness.ts';
import { registerDriverReceiptRoutes } from './domain/driver-receipts.ts';
import { bestRoute, checkpointDelaySeconds, expectedMinutes } from './domain/route-quality.ts';
import { quotesAvailable, createQuoteRecord, evaluateQuoteFeasibility, tariffBasisPoints, tariffVersionFor, minorUnits } from './domain/quotes.ts';
import { createHash, createHmac, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { accessSync, constants, createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompress } from 'node:zlib';
import { promisify } from 'node:util';
import {
  activeStatuses, cities, city, commissionOn, crowKm, distanceKm, exceptionReasons, finishedStatuses, defaultSettings, fractionSettings, invalidSetting, isCity, nextStatus, normalizeEmail, normalizePhone,
  canTake, CLOSED_MINUTES, HISTORY_PAGE, isNight, offerRange, PARCEL_LOAD, optionsFor, orderCode, planForRole, quote, roadAlerts, SERVICE_KM, services, SLOW_MINUTES, smartPrice, vehicleServices, vehicles,
  type CityId, type DriverStats, type Offer, type Order, type Plan, type Point, type Role, type Service, type Settings, type Subscription, type User, type Vehicle,
} from '../src/model.ts';
import { BOOKING_COMMAND_TTL_MS } from '../src/booking.ts';
import { createOpencode, registerOpencodeRoutes } from './domain/opencode.ts';
import { backtracks, nearLine } from '../src/map-math.ts';
import { b64url, encrypt, pushEndpoint, vapid, pushSubject } from './push.ts';

const DAY = 86_400_000;
const RELEASE_BEFORE = 30 * 60_000; // scheduled orders reach drivers this long before pickup
// Sliding inactivity is touched at most hourly; the absolute lifetime still applies.
const production = process.env.NODE_ENV === 'production';
const selfService = process.env.WIND_IDENTITY_MODE === 'self-service';
const contactVerificationRequired = selfService && process.env.WIND_CONTACT_VERIFICATION_REQUIRED === 'true';
const contactAllowed = (r: Row) => !contactVerificationRequired || r.role === 'admin' || r.phone_verified_at || r.email_verified_at || r.approved_at;
const registrationOpen = selfService || (!production && process.env.WIND_IDENTITY_MODE !== 'operator-verified');
// Entra External ID stays dark until the tenant is configured; password auth is untouched while it is off.
// A partial or mistyped Entra config must never crash-loop the whole API.
const entra = (() => { try { return entraConfig(); } catch (error) { console.error('Entra disabled:', error instanceof Error ? error.message : error); return null; } })();

// Zro / MoonMath provider config placeholder
const ZRO_PROVIDER_NAME = process.env.ZRO_PROVIDER_NAME ?? process.env.ZRO_PROVIDER ?? '';
const ZRO_API_KEY = process.env.ZRO_API_KEY ?? process.env.ZRO_KEY ?? '';
if (ZRO_PROVIDER_NAME && ZRO_API_KEY) {
  // Small runtime notice so local runs show the provider is available. Real wiring belongs in a provider module.
  console.log(`ZRO provider configured: ${ZRO_PROVIDER_NAME}`);
}
if (production) {
  if (!process.env.DB_PATH || !isAbsolute(process.env.DB_PATH)) throw new Error('Production requires an absolute DB_PATH on a persistent local volume');
  if (!process.env.SUPPORT_CONTACT?.trim()) throw new Error('Production requires a real SUPPORT_CONTACT');
  if (!['operator-verified', 'self-service'].includes(process.env.WIND_IDENTITY_MODE ?? '')) throw new Error('Production requires WIND_IDENTITY_MODE=operator-verified or self-service');
  if (process.platform !== 'win32') process.umask(0o077);
}
const enabledServices = services.filter(service => (process.env.WIND_ENABLED_SERVICES ?? 'parcel').split(',').map(s => s.trim()).includes(service));
const supportContact = (process.env.SUPPORT_CONTACT ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const publicPages = new Map(['/privacy', '/terms', '/account-deletion'].map(path => [path,
  readFileSync(new URL(`${path.slice(1)}.html`, import.meta.url), 'utf8').replaceAll('{{contact}}', supportContact)]));
// Dev (`npm run server`): serve public/ so the Android app's map page (/map.html + /vendor) loads; without it the WebView 404s
// and every Android map falls back to the diagram.
const webRoot = process.env.WEB_ROOT ? resolve(process.env.WEB_ROOT) : production ? null : fileURLToPath(new URL('../public', import.meta.url));
if (production && webRoot && !existsSync(webRoot)) throw new Error('Production WEB_ROOT does not exist');
const webContentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

// The same HTTPS origin hosts the optional iPhone web app. API paths and legal pages stay authoritative here;
// every other extension-free path falls back to Expo Router's single-page entry point.
function serveWeb(pathname: string, req: IncomingMessage, res: import('node:http').ServerResponse) {
  if (!webRoot || pathname.startsWith('/api/')) return false;
  let requested: string;
  try { requested = decodeURIComponent(pathname === '/' ? '/index.html' : pathname); }
  catch { return false; }
  if (requested.includes('\0')) return false;
  const candidate = resolve(webRoot, `.${requested}`);
  const outside = relative(webRoot, candidate);
  if (outside.startsWith('..') || isAbsolute(outside)) return false;
  const file = (() => {
    try { return statSync(candidate).isFile() ? candidate : undefined; } catch { return undefined; }
  })() ?? (!extname(requested) ? (() => {
    const entry = resolve(webRoot, 'index.html');
    try { return statSync(entry).isFile() ? entry : undefined; } catch { return undefined; }
  })() : undefined);
  if (!file) return false;
  const extension = extname(file).toLowerCase();
  const contentType = webContentTypes[extension] ?? 'application/octet-stream';
  const useBrotli = compressible(contentType) && /(?:^|,)\s*br(?:;|,|$)/.test(String(req.headers['accept-encoding'] ?? ''));
  const modified = statSync(file).mtime;
  const cacheControl = extension === '.html' || extension === '.webmanifest' || file === resolve(webRoot, 'sw.js')
    ? 'no-cache' : 'public, max-age=604800, immutable';
  // A revalidating client (the map page is no-cache) gets 304 instead of the whole file again.
  if (file === resolve(webRoot, 'map.html')) res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // the web app shows this page in an iframe; a 304 must say so too
  const since = req.headers['if-modified-since'];
  if (since && Date.parse(String(since)) >= Math.floor(modified.getTime() / 1000) * 1000) {
    res.writeHead(304, { 'Cache-Control': cacheControl, 'Last-Modified': modified.toUTCString(), Vary: 'Accept-Encoding' }).end();
    return true;
  }
  res.writeHead(200, {
    'Content-Type': contentType,
    // map.html (the Android WebView map) runs an inline module, so it keeps the frame/sniff headers only.
    ...(extension === '.html' && file !== resolve(webRoot, 'map.html') && { 'Content-Security-Policy': webCsp }),
    'Cache-Control': cacheControl,
    'Last-Modified': modified.toUTCString(),
    'Vary': 'Accept-Encoding', // always: a shared cache must not hand a brotli body to a client that cannot read it
    ...(useBrotli ? { 'Content-Encoding': 'br' } : {}),
  });
  if (useBrotli) compressed(file).then(body => res.end(body), () => res.destroy());
  else createReadStream(file).on('error', () => res.destroy()).pipe(res);
  return true;
}

// Same-origin app; OpenFreeMap serves the map style, tiles, glyphs and sprites. React Native Web injects <style> tags.
// The Google web renderer (T12) widens these rules only when a restricted browser key is configured for the
// deployment — a baseline deployment never opens its CSP to Google at all.
export const webCspFor = (googleBrowserKey: boolean) => [
  "default-src 'self'",
  googleBrowserKey ? "script-src 'self' https://maps.googleapis.com" : "script-src 'self'",
  "style-src 'self' 'unsafe-inline'" + (googleBrowserKey ? ' https://fonts.googleapis.com https://maps.googleapis.com' : ''),
  "img-src 'self' data: blob: https://tiles.openfreemap.org" + (googleBrowserKey ? ' https://*.googleapis.com https://*.gstatic.com *.google.com *.googleusercontent.com' : ''),
  "font-src 'self' data:" + (googleBrowserKey ? ' https://fonts.gstatic.com' : ''),
  "connect-src 'self' https://tiles.openfreemap.org" + (googleBrowserKey ? ' https://maps.googleapis.com' : ''),
  "worker-src 'self' blob:", "manifest-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
const webCsp = webCspFor(!!process.env.EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY);
const compressible = (type: string) => /^(text\/|application\/(javascript|json|manifest\+json)|image\/svg\+xml|font\/ttf)/.test(type);
// The web build never changes while this process runs: compress each file once at maximum quality, off the event loop,
// instead of per request (quality 11 on the 2.7 MB bundle took ~3.5 s of TTFB). ponytail: ~1 MB of memory for the whole build.
const brotliCache = new Map<string, Promise<Buffer>>();
const compressed = (file: string) => {
  // Keyed by mtime as well: an edited file must not be served from the body cached for the previous one.
  const key = `${file}:${statSync(file).mtimeMs}`;
  let body = brotliCache.get(key);
  if (!body) {
    body = promisify(brotliCompress)(readFileSync(file));
    body.catch(() => brotliCache.delete(key));
    brotliCache.set(key, body);
    if (brotliCache.size > 64) brotliCache.delete(brotliCache.keys().next().value!);
  }
  return body;
};
if (webRoot && production) setImmediate(() => { // warm so the first visitor after a deploy does not pay either
  try {
    for (const name of readdirSync(webRoot, { recursive: true }) as string[]) {
      const file = resolve(webRoot, name);
      if (statSync(file).isFile() && compressible(webContentTypes[extname(file).toLowerCase()] ?? '')) void compressed(file).catch(() => {});
    }
  } catch { /* served lazily instead */ }
});

// Retained sync export is for offline legacy fixture setup; HTTP/domain work uses persistence below.
export const db = new DatabaseSync(process.env.WIND_DATABASE_URL ? ':memory:' : process.env.DB_PATH ?? 'wind.db');
initializeSqlite(db);
export const persistence = runtimePersistence(db);
type Row = Record<string, any>;
const one = (sql: string, ...p: SQLInputValue[]) => persistence.one(sql, ...p);
const all = (sql: string, ...p: SQLInputValue[]) => persistence.all(sql, ...p);
const run = (sql: string, ...p: SQLInputValue[]) => persistence.run(sql, ...p);

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const fail = (status: number, message: string): never => { throw new HttpError(status, message); };
function logAccountCommandFailure(error: unknown) {
  const operatorAction = error instanceof HttpError && error.message === 'cannot_change_self' ? 'cannot_change_self'
    : error instanceof HttpError && error.message === 'verify phone ownership through operator enrollment first' ? 'Verify phone ownership' : undefined;
  logServerError('account_command_failed', error, { operatorAction });
}

// ---------- helpers ----------

async function settings(): Promise<Settings> {
  const stored = Object.fromEntries((await all('SELECT key, value FROM settings')).map(r => [r.key, r.value]));
  return { ...defaultSettings, ...stored };
}

// scrypt is admitted through a bounded worker pool (domain/passwords.ts); saturation is retryable, not a wrong password.
async function hashPassword(password: string) {
  try { return await createPasswordHash(password); }
  catch (error) { if (error instanceof PasswordBusyError) fail(503, 'password_busy'); throw error; }
}

async function checkPassword(password: string, stored: string) {
  try { return await verifyPassword(password, stored); }
  catch (error) { if (error instanceof PasswordBusyError) fail(503, 'password_busy'); throw error; }
}

function newPassword(value: unknown, minimum = production || selfService ? 12 : 6) {
  const password = typeof value === 'string' ? value : '';
  if (password.length < minimum || password.length > 100) fail(400, 'weak_password');
  return password;
}

const sha = (token: string) => createHash('sha256').update(token).digest('hex');
const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const payloadHash = (body: Row) => sha(JSON.stringify(canonical(body)));

async function toUser(r: Row): Promise<User> {
  const stats = r.role === 'driver' ? (await driverStats(r.id)) : null;
  return { id: r.id, phone: r.phone, name: r.name, role: r.role, status: r.status, vehicle: r.vehicle ?? null, plate: r.plate ?? null,
    rating: stats?.rating ?? null, ...(stats && { priceRating: stats.priceRating, trips: stats.trips }), createdAt: r.created_at,
    ...(r.role === 'driver' && { heading: r.heading_city && r.heading_until > Date.now() ? { city: r.heading_city, until: r.heading_until } : null }),
    email: r.email ?? null, permanentlyApprovedAt: r.approved_at ?? null,
    phoneVerifiedAt: r.phone_verified_at ?? null, emailVerifiedAt: r.email_verified_at ?? null };
}

async function activePlan(userId: number): Promise<Plan | null> {
  return ((await one(`SELECT s.plan FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE s.user_id = ?
    AND s.status = 'active' AND s.ends_at > ? AND s.plan = CASE u.role WHEN 'customer' THEN 'plus' WHEN 'driver' THEN 'pro' END`, userId, Date.now()))?.plan as Plan) ?? null;
}

async function latestSubscription(userId: number): Promise<Subscription | null> {
  const r = (await one(`SELECT s.* FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE s.user_id = ?
    AND (s.status = 'pending' OR (s.status = 'active' AND s.ends_at > ?))
    AND s.plan = CASE u.role WHEN 'customer' THEN 'plus' WHEN 'driver' THEN 'pro' END ORDER BY s.id DESC LIMIT 1`, userId, Date.now()));
  return r ? toSubscription(r) : null;
}

function toSubscription(r: Row): Subscription {
  const expired = r.status === 'active' && r.ends_at <= Date.now();
  return { id: r.id, userId: r.user_id, plan: r.plan, status: expired ? 'expired' : r.status, price: r.price, endsAt: r.ends_at ?? null,
    createdAt: r.created_at, userName: r.user_name, userPhone: r.user_phone };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const inList = (statuses: string[]) => statuses.map(s => `'${s}'`).join(',');
const activeSql = inList(activeStatuses), finishedSql = inList(finishedStatuses);
/** What a driver is carrying right now (SPEC-parcel-standard.md: many parcels, or one ride / freight load). */
/** What a driver's vehicle may carry; no vehicle on file serves nothing (a NULL is never a car). */
const servesFor = (vehicle: unknown): Service[] => vehicleServices[vehicle as Vehicle] ?? [];
const activeLoad = async (driverId: number) => (await all(`SELECT service FROM orders WHERE driver_id = ? AND status IN (${activeSql})`, driverId)) as { service: Service }[];

const orderSelect = `SELECT o.*, c.name customer_name, d.name driver_name, d.phone driver_phone, d.vehicle driver_vehicle, d.plate driver_plate,
  l.lat loc_lat, l.lng loc_lng, l.updated_at loc_at, l.heading loc_heading, l.accuracy loc_accuracy, od.status dispute_status, od.reason dispute_reason, od.resolution dispute_resolution,
  (SELECT p.code FROM promo_codes p WHERE p.id = od.credit_promo_id) dispute_credit_code, (SELECT p.amount FROM promo_codes p WHERE p.id = od.credit_promo_id) dispute_credit_amount,
  (SELECT COUNT(*) FROM safety_incidents si WHERE si.order_id = o.id) safety_count,
  (SELECT COUNT(*) FROM safety_incidents si WHERE si.order_id = o.id AND si.status = 'open') safety_open,
  EXISTS(SELECT 1 FROM orders x WHERE x.driver_id = o.driver_id AND x.id <> o.id AND x.status IN (${activeSql})) shared_run
  FROM orders o JOIN users c ON c.id = o.customer_id LEFT JOIN users d ON d.id = o.driver_id
  LEFT JOIN driver_locations l ON l.driver_id = o.driver_id AND l.updated_at >= COALESCE(o.assigned_at, 0) LEFT JOIN order_disputes od ON od.order_id = o.id`;

type JobCardData = { customers: Map<number, { rating: number | null; trips: number }>;
  offers: Map<number, { price: number; createdAt: number }> };

async function toOrder(r: Row, viewer: User, cards?: JobCardData): Promise<Order> {
  const owner = viewer.role === 'admin' || viewer.id === r.customer_id;
  const assigned = viewer.id === r.driver_id;
  const live = activeStatuses.includes(r.status) && r.loc_lat != null && Date.now() - r.loc_at <= 120_000;
  const partyPhones = (owner || assigned) && (activeStatuses.includes(r.status) || r.status === 'searching' || Date.now() - r.updated_at <= DAY);
  const dispatchInfo = await dispatch.summary(r.id, viewer.role === 'driver' ? viewer.id : undefined);
  const rideInfo = await rideLifecycle.summary(r.id, viewer, r);
  const scopeInfo = await resourceScope.summary(r.id, viewer, r);
  // T33: the pending destination card follows the capability, not the dialect.
  const destinationChange = (viewer.id === r.customer_id || viewer.id === r.driver_id) && destinationEligible(r) && await destinationAvailable(persistence)
    ? await pendingDestination(persistence, r) : null;
  return {
    id: r.id, customerId: owner || assigned ? r.customer_id : null, driverId: r.driver_id ?? null, service: r.service, shared: !!r.shared,
    pickupCity: r.pickup_city, dropoffCity: r.dropoff_city,
    pickupPoint: (owner || assigned) && r.pickup_lat != null ? { latitude: r.pickup_lat, longitude: r.pickup_lng } : null,
    dropoffPoint: (owner || assigned) && r.dropoff_lat != null ? { latitude: r.dropoff_lat, longitude: r.dropoff_lng } : null,
    pickupNote: owner || assigned ? r.pickup_note : '', dropoffNote: owner || assigned ? r.dropoff_note : '',
    detail: owner || assigned ? r.detail : '', option: r.option, loadingHelp: !!r.loading_help,
    contact: partyPhones ? r.contact : null, // drivers see phones only after accepting, and only inside the contact window
    pickupContact: partyPhones ? r.pickup_contact ?? r.contact : null,
    recipientName: owner || assigned ? r.recipient_name ?? '' : '', recipientPhone: partyPhones ? r.recipient_phone ?? null : null,
    price: r.price, commission: r.commission ?? null, status: r.status,
    ...(persistence.backend === 'sqlite' && viewer.id === r.customer_id && { canChangeDestination: destinationEligible(r) }),
    ...(destinationChange && { destinationChange }),
    handoverCode: owner ? r.handover_code ?? null : null, // the customer gives it to the driver at delivery
    rating: r.rating ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
    // Stage times for the status timeline: known only where the state was reached.
    assignedAt: r.assigned_at ?? null, pickedUpAt: r.picked_up_at ?? null, completedAt: r.completed_at ?? null,
    sharing: viewer.id === r.customer_id && !!r.share_token_hash, scheduledFor: r.scheduled_for ?? null, discount: r.discount ?? 0,
    returnCode: viewer.id === r.customer_id && r.status === 'returning' ? r.return_code ?? null : null, // the sender gives it back to the driver
    exceptionReason: owner || assigned ? r.exception_reason ?? null : null,
    // Both parties learn the order is paused; only the reporter sees their own report.
    safetyHold: (owner || assigned) && r.safety_open > 0,
    safetyReport: r.safety_count > 0 && viewer.role !== 'admin' && (owner || assigned)
      ? (await one('SELECT status, kind, resolution FROM safety_incidents WHERE order_id = ? AND reporter_id = ? ORDER BY id DESC LIMIT 1', r.id, viewer.id)) as Order['safetyReport'] ?? null
      : null,
    dispute: owner && r.dispute_status ? { status: r.dispute_status, reason: r.dispute_reason, resolution: r.dispute_resolution ?? null,
      credit: r.dispute_credit_code ? { code: r.dispute_credit_code as string, amount: r.dispute_credit_amount as number } : null } : null,
    customerName: owner || assigned ? r.customer_name : '', driverName: r.driver_name ?? undefined,
    driverPhone: partyPhones ? r.driver_phone ?? undefined : undefined, driverVehicle: r.driver_vehicle ?? null,
    // What the customer matches at the kerb (SYSTEM §4): the plate, to the parties on this order only.
    driverPlate: owner || assigned || viewer.role === 'admin' ? r.driver_plate ?? null : null,
    driverLocation: live && (owner || assigned) ? { latitude: r.loc_lat, longitude: r.loc_lng, updatedAt: r.loc_at, ageSeconds: Math.max(0, Math.round((Date.now() - r.loc_at) / 1000)),
      heading: r.loc_heading ?? null, accuracy: r.loc_accuracy ?? null } : null,
    recommendedPrice: r.recommended_price ?? null, priceRating: r.price_rating ?? null, routeKm: r.route_km ?? null,
    // The courier has other stops on this run, so a straight-to-you ETA would be wrong (SPEC-courier-run-eta.md).
    sharedRun: (owner || assigned) && activeStatuses.includes(r.status) && !!r.shared_run,
    myOffer: viewer.role === 'driver' && r.status === 'searching'
      ? cards ? cards.offers.get(Number(r.id)) ?? null : await myOffer(r.id, viewer.id) : null,
    // Drivers rate the customer; customers never see per-order or summary ratings (SPEC-customer-rating.md).
    customerRating: assigned || viewer.role === 'admin' ? r.customer_rating ?? null : null,
    ...(viewer.role === 'driver' && (assigned || r.status === 'searching') && { customerStats: cards
      ? cards.customers.get(Number(r.customer_id)) ?? { rating: null, trips: 0 } : await customerStats(r.customer_id) }),
    ...(viewer.id === r.customer_id && r.status === 'searching' && r.recommended_price != null && { offers: (await offersFor(r.id)) }),
    ...(dispatchInfo ? { dispatch: dispatchInfo as Order['dispatch'] } : {}),
    ...(rideInfo ? { ride: rideInfo as Order['ride'] } : {}),
    ...(scopeInfo ? { declaredScope: scopeInfo as Order['declaredScope'] } : {}),
  };
}

// Driver offers (SPEC-driver-offers.md). An offer counts while it is fresh and its driver is active, free and has not
// released the order; anything else is invisible and cannot be accepted.
const OFFER_TTL = 10 * 60_000; // ponytail: inDrive-like window; tune from how long customers take to choose
const offerOpen = `AND f.created_at > ? AND u.status = 'active'
  AND NOT EXISTS(SELECT 1 FROM orders b WHERE b.driver_id = u.id AND b.status IN (${activeSql}))
  AND NOT EXISTS(SELECT 1 FROM order_releases x WHERE x.order_id = f.order_id AND x.driver_id = u.id)`;
const driverStats = (id: number): Promise<DriverStats> => driverStatistics(persistence, id, finishedSql);
/** The customer's record as drivers see it; fewer than three ratings never exposes an average. */
const customerStats = (id: number) => customerStatistics(persistence, id, finishedSql);
const myOffer = async (orderId: number, driverId: number) => {
  const f = (await one('SELECT price, created_at FROM order_offers WHERE order_id = ? AND driver_id = ? AND created_at > ?', orderId, driverId, Date.now() - OFFER_TTL));
  return f ? { price: f.price as number, createdAt: f.created_at as number } : null;
};

// A job page can contain 50 customers and 50 offers. Fetch each relation once per request;
// neither result is cached across requests, so ratings and the driver's offers stay current.
async function jobCardData(rows: Row[], driverId: number): Promise<JobCardData> {
  const customers = new Map<number, { rating: number | null; trips: number }>();
  const offers = new Map<number, { price: number; createdAt: number }>();
  if (!rows.length) return { customers, offers };
  const customerIds = [...new Set(rows.map(row => Number(row.customer_id)))];
  const orderIds = rows.map(row => Number(row.id));
  const stats = await all(`SELECT customer_id, AVG(customer_rating) rating, COUNT(customer_rating) rated,
    COUNT(*) FILTER (WHERE status IN (${finishedSql})) trips FROM orders
    WHERE customer_id IN (${customerIds.map(() => '?').join(',')}) GROUP BY customer_id`, ...customerIds);
  for (const row of stats) customers.set(Number(row.customer_id), {
    rating: Number(row.rated) >= 3 ? Math.round(Number(row.rating) * 10) / 10 : null, trips: Number(row.trips),
  });
  const rowsWithOffers = await all(`SELECT order_id, price, created_at FROM order_offers
    WHERE driver_id = ? AND created_at > ? AND order_id IN (${orderIds.map(() => '?').join(',')})`, driverId, Date.now() - OFFER_TTL, ...orderIds);
  for (const row of rowsWithOffers) offers.set(Number(row.order_id), { price: Number(row.price), createdAt: Number(row.created_at) });
  return { customers, offers };
}
const offersFor = async (orderId: number): Promise<Offer[]> => (await Promise.all((await all(`SELECT f.driver_id, f.price, f.created_at, u.name, u.vehicle FROM order_offers f JOIN users u ON u.id = f.driver_id
  WHERE f.order_id = ? ${offerOpen} ORDER BY f.price, f.created_at LIMIT 20`, orderId, Date.now() - OFFER_TTL))
  .map(async f => ({ driverId: f.driver_id, name: f.name, vehicle: f.vehicle ?? null, price: f.price, createdAt: f.created_at, ...(await driverStats(f.driver_id)) }))));

async function getOrder(id: number, viewer: User): Promise<Order> {
  const r = (await one(`${orderSelect} WHERE o.id = ?`, id)) ?? fail(404, 'not_found');
  const released = viewer.role === 'driver' && r.status === 'searching' &&
    !!(await one('SELECT 1 FROM order_releases WHERE order_id = ? AND driver_id = ?', r.id, viewer.id));
  const canSee = viewer.role === 'admin' || r.customer_id === viewer.id || r.driver_id === viewer.id ||
    (viewer.role === 'driver' && viewer.status === 'active' && r.status === 'searching' && enabledServices.includes(r.service) && servesFor(viewer.vehicle).includes(r.service)
      && (r.scheduled_for == null || r.scheduled_for <= Date.now() + RELEASE_BEFORE));
  if (!canSee || released) fail(404, 'not_found');
  const order = await toOrder(r, viewer);
  // The rating Uber shows beside the car, computed for one order only: on a list this would be a stats query per row.
  if (order.driverId && (viewer.role === 'admin' || viewer.id === r.customer_id || viewer.id === r.driver_id))
    order.driverRating = (await driverStats(order.driverId)).rating;
  return order;
}

const text = (v: unknown, max: number, required = true) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if ((required && !s) || s.length > max) fail(400, 'invalid_input');
  return s;
};
const need = (user: User, ...roles: Role[]) => { if (!roles.includes(user.role)) fail(403, 'forbidden'); };
const needActive = (user: User) => {
  if (user.status !== 'active') fail(403, user.status === 'pending' ? 'pending_approval' : 'blocked');
  if (production && selfService && user.role === 'driver' && !user.permanentlyApprovedAt) fail(403, 'pending_approval');
};

// Durable fixed windows; the reverse proxy also limits traffic before expensive password work.
async function limit(key: string, maximum: number, windowMs: number, consume = true) {
  const now = Date.now();
  const row = consume ? (await one(`INSERT INTO request_limits (key, count, until) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN request_limits.until > ? THEN request_limits.count + 1 ELSE 1 END,
    until = CASE WHEN request_limits.until > ? THEN request_limits.until ELSE excluded.until END RETURNING count, until`, key, now + windowMs, now, now))
    : (await one('SELECT count, until FROM request_limits WHERE key = ? AND until > ?', key, now));
  if (row && row.count >= maximum + (consume ? 1 : 0)) fail(429, 'too_many_attempts');
}
const identityKey = (kind: string, value: string | number) => `${kind}:${sha(String(value))}`;

// Entra External ID exchange: the app completes PKCE in the system browser, then trades the
// ID token here. The server verifies signature/issuer/audience/expiry itself and only then
// links or creates the Wind account — the password path above stays available during migration.
type EntraClaims = Awaited<ReturnType<typeof verifyEntraIdToken>>;
const entraExchange = async ({ body }: { body: Row }) => {
  if (!entra) fail(503, 'entra_unavailable');
  const idToken = typeof body.idToken === 'string' ? body.idToken : '';
  (await limit(identityKey('entra-attempt', idToken.slice(-24) || 'empty'), 10, 10 * 60_000, false));
  const nonce = typeof body.nonce === 'string' ? body.nonce : '';
  if (!nonce) fail(401, 'invalid_token'); // the client always mints one; a token without it is not ours
  let claims;
  try {
    claims = await verifyEntraIdToken(idToken, entra!, { nonce });
  } catch (error) {
    if (error instanceof EntraUnavailableError) fail(503, 'entra_unavailable');
    (await limit(identityKey('entra-attempt', idToken.slice(-24) || 'empty'), 10, 10 * 60_000));
    fail(401, 'invalid_token');
  }
  // One exchange per ID token: a captured token must not mint fresh sessions.
  (await run('DELETE FROM entra_replay WHERE expires_at < ?', Date.now()));
  try {
    (await run('INSERT INTO entra_replay (token_hash, expires_at) VALUES (?, ?)', sha(claims!.tokenId || idToken), claims!.expiresAt));
  } catch { fail(401, 'invalid_token'); }
  (await limit(identityKey('entra', claims!.oid), 10, 10 * 60_000));
  // The passwordless placeholder is derived before the write transaction; the bounded KDF must
  // never run while one is open. A linked identity needs no new placeholder.
  const known = (await one('SELECT id FROM users WHERE entra_oid = ?', claims!.oid));
  const placeholder = known ? '' : await hashPassword(randomBytes(32).toString('hex'));
  return persistence.atomic({ purpose: 'http_public' }, () => entraAccount(claims!, body, placeholder));
};

async function entraAccount(claims: EntraClaims, body: Row, placeholder: string) {
  let user = (await one('SELECT * FROM users WHERE entra_oid = ?', claims.oid));
  const phone = claims.phoneVerified && claims.phone ? normalizePhone(claims.phone) : null;
  const email = claims.emailVerified && claims.email ? normalizeEmail(claims.email) : null;
  if (body.email !== undefined) {
    const enteredEmail = normalizeEmail(String(body.email));
    if (!enteredEmail) fail(400, 'invalid_email');
    if (!email || email !== enteredEmail) fail(400, 'entra_email_mismatch');
  }
  if (!user) {
    const phoneUser = phone ? await one('SELECT * FROM users WHERE phone = ?', phone) : undefined;
    const emailUser = email ? await one('SELECT * FROM users WHERE email = ? COLLATE NOCASE', email) : undefined;
    // A contact can be entered without proof on an older account. An external
    // proof alone must not turn that unverified contact into account ownership.
    if ((phoneUser && !phoneUser.phone_verified_at) || (emailUser && !emailUser.email_verified_at) ||
        (phoneUser && emailUser && phoneUser.id !== emailUser.id)) fail(403, 'entra_link_required');
    user = phoneUser ?? emailUser;
    if (user) {
      // Staff accounts link only through an authenticated operator action, never by
      // presenting a phone/email claim (phone-identity.ts excludes admins the same way).
      if (user.status === 'blocked') fail(403, 'blocked');
      if (user.role === 'admin' || user.entra_oid) fail(403, 'entra_link_required');
      const linked = await run(`UPDATE users SET entra_oid = ? WHERE id = ? AND entra_oid IS NULL AND role <> 'admin' AND status <> 'blocked'
        AND ((phone = ? AND phone_verified_at IS NOT NULL) OR (email = ? COLLATE NOCASE AND email_verified_at IS NOT NULL))`, claims.oid, user.id, phone, email);
      if (!linked.changes) fail(403, 'entra_link_required');
    } else {
      if (!registrationOpen) fail(403, 'registration_closed');
      if (selfService && body.consent !== true) fail(400, 'consent_required');
      // Entra External ID commonly authenticates by email. A contact entered
      // here is usable for delivery but is not treated as proof of phone ownership.
      const registrationPhone = phone ?? (email ? normalizePhone(String(body.phone ?? '')) : null);
      if (!registrationPhone) fail(400, 'phone_required');
      if (await one('SELECT id FROM users WHERE phone = ?', registrationPhone)) fail(403, 'entra_link_required');
      const requestedRole = body.registrationRole ?? body.role;
      if (requestedRole !== undefined && !['customer', 'driver'].includes(requestedRole)) fail(400, 'invalid_role');
      const role: Role = requestedRole === 'driver' ? 'driver' : 'customer';
      const vehicle = role === 'driver' ? (vehicles.includes(body.vehicle ?? 'car') ? (body.vehicle ?? 'car') as Vehicle : fail(400, 'invalid_vehicle')) : null;
      const plate = role === 'driver' ? text(body.plate, 12, false) || null : null;
      const name = claims.name ?? text(body.name, 60);
      if (!placeholder) fail(409, 'entra_link_required'); // raced with a linked-row removal: retry the exchange
      const id = Number((await run('INSERT INTO users (phone, name, password, role, status, vehicle, plate, created_at, email, consent_at, consent_version, entra_oid, phone_verified_at, email_verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        registrationPhone, name, placeholder, role, role === 'driver' ? 'pending' : 'active', vehicle, plate, Date.now(), email,
        selfService ? Date.now() : null, selfService ? '2026-10-03' : null, claims.oid,
        phone === registrationPhone ? Date.now() : null, email ? Date.now() : null)).lastInsertRowid);
      if (role === 'driver') await queuePush((await adminIds()), 'attention', 0, '/admin/users');
      user = (await one('SELECT * FROM users WHERE id = ?', id))!;
    }
  }
  if (user.status === 'blocked') fail(403, 'blocked');
  // Only the exact contact attested by Entra may be marked verified. A linked
  // identity can carry other verified contacts that do not belong to this row.
  if (phone && phone === user.phone && !user.phone_verified_at) (await run('UPDATE users SET phone_verified_at = ? WHERE id = ? AND phone = ?', Date.now(), user.id, phone));
  if (email && email === normalizeEmail(user.email) && !user.email_verified_at) (await run('UPDATE users SET email_verified_at = ? WHERE id = ? AND email = ? COLLATE NOCASE', Date.now(), user.id, email));
  user = (await one('SELECT * FROM users WHERE id = ?', user.id))!;
  if (!contactAllowed(user)) fail(403, 'verification_required');
  if (production && !selfService && !user.phone_verified_at) fail(403, 'phone_not_verified');
  return (await startSession(user.id));
}

// ---------- routes ----------

type Ctx = { user: User | null; body: Row; params: string[]; query: URLSearchParams; req: IncomingMessage };
type Handler = (ctx: Ctx & { user: User }) => unknown;
const routes: [string, RegExp, Handler, boolean?][] = [];
const route = (method: string, path: string, handler: Handler, isPublic = false) =>
  routes.push([method, new RegExp(`^${path.replace(/:\w+/g, '(\\d+)')}$`), handler, isPublic]);

const eligibility = new Eligibility(persistence, fail);
registerEligibilityRoutes(route, eligibility);
const presence = new Presence(persistence, eligibility, fail, production && selfService);
registerPresenceRoutes(route, presence);
const dispatch = new Dispatch(persistence, eligibility, fail, async (from, to) => {
  if (process.env.OSRM_URL?.trim()) {
    try {
      const routes = await osrmRoutes([from, to]);
      if (routes[0]) return { seconds: routes[0].duration, estimated: false };
    } catch { /* fall through to the marked estimate */ }
  }
  return straightLineEta(from, to);
});
registerDispatchRoutes(route, dispatch);
const rideLifecycle = new RideLifecycle(persistence, fail);
registerRideLifecycleRoutes(route, rideLifecycle);
const resourceScope = new ResourceScope(persistence, fail);
registerResourceScopeRoutes(route, resourceScope);
const privateObjects = createPrivateObjects(persistence, fail);
registerPrivateObjectRoutes(route, privateObjects);
const ledger = new Ledger(persistence, fail);

// T29/T30: live ledger posting on the PostgreSQL capability. Journals reuse importLegacy's stable business
// references, so a later import meets the posted journals and dedupes on the business_ref instead of
// double-counting. SQLite has no ledger tables: the legacy cash flow stays the sole authority there, and
// posting is skipped. A posting failure fails the enclosing money transition (same transaction).
async function ledgerReady() {
  return persistence.backend === 'postgres' && !!(await ledgerAvailable(persistence));
}
const postOrderJournals = async (orderId: number) => {
  if (!(await ledgerReady())) return;
  const o = (await one('SELECT * FROM orders WHERE id = ?', orderId))!;
  const receivable = await ledger.ensureAccount(`driver:${o.driver_id}:receivable`, 'driver_receivable', Number(o.driver_id));
  const revenue = await ledger.ensureAccount('platform:revenue', 'platform_revenue', null);
  const promo = await ledger.ensureAccount('platform:promo_expense', 'promo_expense', null);
  const commission = Number(o.commission_minor ?? 0), discount = Number(o.discount_minor ?? 0);
  if (commission > 0) await ledger.postJournal({ businessRef: `order:${o.id}:commission`, kind: 'commission_accrual', orderId: o.id as number,
    entries: [{ accountId: receivable.id as number, debitMinor: commission }, { accountId: revenue.id as number, creditMinor: commission }] });
  if (discount > 0) await ledger.postJournal({ businessRef: `order:${o.id}:discount`, kind: 'discount_funding', orderId: o.id as number,
    entries: [{ accountId: promo.id as number, debitMinor: discount }, { accountId: receivable.id as number, creditMinor: discount }] });
};
const postCashJournal = async (entryId: number) => {
  if (!(await ledgerReady())) return;
  const e = (await one('SELECT * FROM cash_entries WHERE id = ?', entryId))!;
  if (e.kind === 'remittance' && e.status !== 'confirmed') return; // pending and disputed handovers stay unsettled
  const amount = Number(e.amount_cents);
  if (!amount) return;
  const receivable = await ledger.ensureAccount(`driver:${e.driver_id}:receivable`, 'driver_receivable', Number(e.driver_id));
  const clearing = await ledger.ensureAccount('platform:provider_clearing', 'provider_clearing', null);
  const revenue = await ledger.ensureAccount('platform:revenue', 'platform_revenue', null);
  const other = e.kind === 'remittance' ? clearing : revenue;
  // Sign-aware, exactly like the import: a positive adjustment increases the debt, a negative one relieves it.
  const debitReceivable = e.kind === 'adjustment' ? amount > 0 : amount < 0;
  const n = Math.abs(amount);
  await ledger.postJournal({ businessRef: `cash-entry:${e.id}`, kind: e.kind === 'remittance' ? 'cash_remittance' : 'cash_adjustment', cashEntryId: e.id as number,
    entries: debitReceivable ? [{ accountId: receivable.id as number, debitMinor: n }, { accountId: other.id as number, creditMinor: n }]
      : [{ accountId: other.id as number, debitMinor: n }, { accountId: receivable.id as number, creditMinor: n }] });
};
registerLedgerRoutes(route, ledger);
const payments = createPayments(persistence, fail);
registerPaymentsRoutes(route, payments);
// OpenCode / T3 provider service (runs zro CLI and records jobs)
const opencodeService = createOpencode(persistence, fail);
registerOpencodeRoutes(route, opencodeService);
const ops = new Ops(persistence, fail);
registerOpsRoutes(route, ops);
registerRuntimeRoutes(route, { db: persistence, need, needActive, fail, limit });
registerDriverReceiptRoutes(route, { db: persistence, need, needActive, fail });
const nativePush = new NativePush(persistence, fail);
registerNativePushRoutes(route, nativePush);
const realtime = new Realtime(persistence, fail);
registerRealtimeRoutes(route, realtime);
export const phoneIdentity = new PhoneIdentity(persistence, fail, value => hashPassword(newPassword(value, 12)), checkPassword);
registerPhoneRoutes(route, phoneIdentity);
registerEntraRoutes(route, entraExchange);
await phoneIdentity.reconcileStale();

route('GET', '/api/health', async ({ query }) => ({ ok: true, ...(query.get('protocol') === '1' ? { protocol: await protocolCapabilities() } : {}) }), true);
route('GET', '/api/auth/options', () => ({ registrationOpen, emailReset: emailReady }), true);
route('GET', '/api/ready', async () => {
  let schema = 3;
  try {
    if (persistence.backend === 'sqlite') {
      accessSync(dirname(process.env.DB_PATH ?? 'wind.db'), constants.W_OK);
      accessSync(process.env.DB_PATH ?? 'wind.db', constants.W_OK);
      await one('SELECT COUNT(*) n FROM sqlite_schema');
    } else {
      schema = Number((await one('SELECT MAX(version) AS version FROM schema_migrations'))?.version ?? 0);
      const applied = Number((await one('SELECT COUNT(DISTINCT version) AS n FROM schema_migrations WHERE version BETWEEN 3 AND 21'))?.n ?? 0);
      if (schema < 21 || applied !== 19) fail(503, 'unavailable');
    }
    (await persistence.exec('BEGIN IMMEDIATE')); (await persistence.exec('ROLLBACK'));
  } catch { fail(503, 'unavailable'); }

  return { ok: true, schema };
}, true);




route('POST', '/api/auth/register', async ({ body }) => {
  if (!registrationOpen) fail(403, 'registration_closed');
  if (contactVerificationRequired) fail(403, 'verification_required'); // attach actual proof before opening this future gate
  const phone = normalizePhone(String(body.phone ?? '')) ?? fail(400, 'invalid_phone');
  const name = text(body.name, 60);
  const password = newPassword(body.password);
  const email = selfService ? normalizeEmail(body.email) ?? fail(400, 'invalid_email') : null;
  if (selfService && body.consent !== true) fail(400, 'consent_required');
  const requestedRole = body.registrationRole ?? body.role;
  if (selfService && requestedRole !== undefined && !['customer', 'driver'].includes(requestedRole)) fail(400, 'invalid_role');
  const role: Role = requestedRole === 'driver' ? 'driver' : 'customer'; // admins only through operator enrollment
  const vehicle = role === 'driver' ? (vehicles.includes(body.vehicle ?? 'car') ? (body.vehicle ?? 'car') as Vehicle : fail(400, 'invalid_vehicle')) : null;
  // The plate is what the customer matches at the kerb (SYSTEM §4). Optional on the wire, so the previous build and
  // its tests keep registering; the app asks for it whenever the vehicle carries one.
  const plate = role === 'driver' ? text(body.plate, 12, false) || null : null;
  if ((await one('SELECT id FROM users WHERE phone = ?', phone))) fail(409, 'phone_taken');
  // ponytail: an unverified address still blocks a second sign-up with it; taking it over would silently strip email
  // sign-in from the first account while most addresses are unverified. Support edits the address if it is squatted.
  if (email && (await one('SELECT id FROM users WHERE email = ? COLLATE NOCASE', email))) fail(409, 'email_taken');
  const hashed = await hashPassword(password);
  // The KDF stays outside this short transaction; the user, its alert and its session commit together.
  const [id, session] = await persistence.atomic({ purpose: 'http_public' }, async () => {
    const id = Number((await run('INSERT INTO users (phone, name, password, role, status, vehicle, plate, created_at, email, consent_at, consent_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      phone, name, hashed, role, role === 'driver' ? 'pending' : 'active', vehicle, plate, Date.now(), email,
      selfService ? Date.now() : null, selfService ? '2026-10-03' : null)).lastInsertRowid);
    // A new driver waits for approval: tell the admins, or they only see it on the dashboard (SPEC-driver-signup-alert.md).
    if (role === 'driver') await queuePush((await adminIds()), 'attention', 0, '/admin/users');
    return [id, await startSession(id)] as const;
  });
  if (!emailReady || !email) return session;
  // Not awaited: the push outbox above is per request, and the email must not hold up the sign-up.
  const account = (await one('SELECT * FROM users WHERE id = ?', id))!;
  void persistence.detached(() => sendCode(account, 'verify')).catch(() => {});
  return { ...session, emailCode: 'requested' };
}, true);

route('POST', '/api/auth/login', async ({ body }) => {
  const identifier = String(body.identifier ?? body.phone ?? '').trim();
  const phone = normalizePhone(identifier), email = normalizeEmail(identifier);
  const key = identityKey('login', phone ?? phoneIdentity.loginThrottleKey(identifier) ?? email ?? identifier.toLowerCase());
  (await limit(key, 5, 10 * 60_000, false));
  const legacyAccount = phone ? (await one('SELECT * FROM users WHERE phone = ?', phone))
    : email ? (await one('SELECT * FROM users WHERE email = ? COLLATE NOCASE', email)) : undefined;
  const r = legacyAccount ?? await phoneIdentity.loginAccount(identifier);
  if (!r || !await checkPassword(String(body.password ?? ''), r.password)) {
    (await limit(key, 5, 10 * 60_000));
    fail(401, 'wrong_credentials');
  }
  (await run('DELETE FROM request_limits WHERE key = ?', key));
  if (r!.status === 'blocked') fail(403, 'blocked');
  if (!contactAllowed(r!)) fail(403, 'verification_required');
  if (production && !selfService && !r!.phone_verified_at) fail(403, 'phone_not_verified');
  if (production && selfService && r!.role === 'admin' && !r!.phone_verified_at && !r!.approved_at) fail(403, 'pending_approval');
  return (await startSession(r!.id));
}, true);

async function startSession(userId: number) {
  const token = randomBytes(32).toString('hex');
  (await run('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)', sha(token), userId, Date.now(), Date.now()));
  return { token, ...(await me((await toUser((await one('SELECT * FROM users WHERE id = ?', userId))!)))) };
}

async function me(user: User) {
  return { user, subscription: (await latestSubscription(user.id)), plan: (await activePlan(user.id)), settings: (await settings()), capabilities: { enabledServices, pooling: false, emailVerification: emailReady, ...(await scopeAvailable(persistence) ? { declaredScope: true } : {}) } };
}

// Email (Cloudflare Email Service REST API): a 6-digit code verifies the address, resets a forgotten password, and lets
// support confirm a caller owns the account. Off until all three settings exist; the app then shows these flows.
const emailFrom = process.env.WIND_EMAIL_FROM?.trim();
const cloudflareAccount = process.env.CLOUDFLARE_ACCOUNT_ID?.trim(), cloudflareToken = process.env.CLOUDFLARE_EMAIL_TOKEN?.trim();
const emailReady = !!(emailFrom && cloudflareAccount && cloudflareToken);
const cloudflareApi = (process.env.CLOUDFLARE_API_BASE ?? 'https://api.cloudflare.com/client/v4').replace(/\/$/, '');
const CODE_TTL = 15 * 60_000, CODE_GAP = 60_000, CODE_TRIES = 5;
type CodePurpose = 'verify' | 'reset' | 'support';
const codeMail: Record<CodePurpose, (code: string) => [string, string[]]> = {
  verify: code => [`Ø±Ù…Ø² ÙˆÙŠÙ†Ø¯ ${code} Â· Wind code`, [`Ø±Ù…Ø² ØªØ£ÙƒÙŠØ¯ Ø¨Ø±ÙŠØ¯Ùƒ ÙÙŠ ÙˆÙŠÙ†Ø¯: ${code}`, 'ÙŠÙ†ØªÙ‡ÙŠ Ø®Ù„Ø§Ù„ 15 Ø¯Ù‚ÙŠÙ‚Ø©. Ø¥Ù† Ù„Ù… ØªØ·Ù„Ø¨Ù‡ ÙØªØ¬Ø§Ù‡Ù„ Ù‡Ø°Ù‡ Ø§Ù„Ø±Ø³Ø§Ù„Ø©.', '',
    `Your Wind email confirmation code: ${code}`, 'It expires in 15 minutes. If you did not ask for it, ignore this email.']],
  reset: code => [`Ø±Ù…Ø² Ø¥Ø¹Ø§Ø¯Ø© ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± ${code} Â· Wind password code`, [`Ø±Ù…Ø² Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† ÙƒÙ„Ù…Ø© Ù…Ø±ÙˆØ± ÙˆÙŠÙ†Ø¯: ${code}`, 'ÙŠÙ†ØªÙ‡ÙŠ Ø®Ù„Ø§Ù„ 15 Ø¯Ù‚ÙŠÙ‚Ø©. Ù„Ø§ ØªØ´Ø§Ø±ÙƒÙ‡ Ù…Ø¹ Ø£Ø­Ø¯ØŒ ÙØ±ÙŠÙ‚ ÙˆÙŠÙ†Ø¯ Ù„Ù† ÙŠØ·Ù„Ø¨Ù‡ Ù…Ù†Ùƒ.', '',
    `Your Wind password reset code: ${code}`, 'It expires in 15 minutes. Never share it; Wind staff will never ask for it.']],
  support: code => [`Ø±Ù…Ø² Ø§Ù„ØªØ­Ù‚Ù‚ Ù„Ù„Ø¯Ø¹Ù… ${code} Â· Wind support check`, [`Ø¯Ø¹Ù… ÙˆÙŠÙ†Ø¯ ÙŠØªØ­Ù‚Ù‚ Ù…Ù† Ù‡ÙˆÙŠØªÙƒ. Ø§Ù„Ø±Ù…Ø²: ${code}`, 'Ø§Ù‚Ø±Ø£Ù‡ Ù„Ù…ÙˆØ¸Ù Ø§Ù„Ø¯Ø¹Ù… ÙÙ‚Ø· Ø¥Ù† ÙƒÙ†Øª Ø£Ù†Øª Ù…Ù† ØªÙˆØ§ØµÙ„ Ù…Ø¹ ÙˆÙŠÙ†Ø¯. ÙŠÙ†ØªÙ‡ÙŠ Ø®Ù„Ø§Ù„ 15 Ø¯Ù‚ÙŠÙ‚Ø©.', '',
    `Wind support is confirming it is you. Code: ${code}`, 'Read it to the agent only if you contacted Wind support yourself. It expires in 15 minutes.']],
};

async function sendEmail(to: string, subject: string, lines: string[]) {
  if (!emailReady) fail(503, 'email_unavailable');
  let sent = false;
  try {
    const res = await fetch(`${cloudflareApi}/accounts/${cloudflareAccount}/email/sending/send`, {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${cloudflareToken}`, 'Content-Type': 'application/json' },
      // Every line is fixed text plus digits: nothing user-supplied reaches the HTML.
      body: JSON.stringify({ to, from: emailFrom, subject, text: lines.join('\n'),
        html: `<div dir="auto" style="font-family:sans-serif;font-size:16px">${lines.map(l => l ? `<p>${l}</p>` : '<hr>').join('')}</div>` }),
    });
    const j = await res.json().catch(() => null) as { success?: boolean; errors?: unknown; result?: { permanent_bounces?: string[] } } | null;
    if (res.ok && j?.success === true && (j.result?.permanent_bounces ?? []).includes(to)) fail(422, 'email_bounced'); // a wrong address
    sent = res.ok && j?.success === true;
    if (!sent) logServerError('email_provider_failed', undefined, { httpStatus: res.status });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logServerError('email_provider_failed', error);
  }
  if (!sent) fail(503, 'email_unavailable');
}

const codeKey = randomBytes(32); // in memory only: a database copy cannot recover live codes; a restart voids pending ones
const codeHash = (r: Row, purpose: CodePurpose, code: string) =>
  createHmac('sha256', codeKey).update(`${purpose}:${r.id}:${String(r.email).toLowerCase()}:${code}`).digest('hex');
async function sendCode(r: Row, purpose: CodePurpose) {
  if (!r.email) fail(409, 'no_email');
  const last = (await one('SELECT sent_at FROM email_codes WHERE user_id = ? AND purpose = ?', r.id, purpose));
  if (last && Date.now() - last.sent_at < CODE_GAP) fail(429, 'code_recently_sent');
  (await limit(identityKey(`email-${purpose}`, r.id), 5, 60 * 60_000));
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0'), now = Date.now();
  (await run(`INSERT INTO email_codes (user_id, purpose, code_hash, sent_at, expires_at, tries) VALUES (?, ?, ?, ?, ?, 0)
    ON CONFLICT(user_id, purpose) DO UPDATE SET code_hash = excluded.code_hash, sent_at = excluded.sent_at, expires_at = excluded.expires_at, tries = 0`,
  r.id, purpose, codeHash(r, purpose, code), now, now + CODE_TTL));
  const [subject, lines] = codeMail[purpose](code);
  try { await sendEmail(r.email, subject, lines); }
  catch (error) { (await run('DELETE FROM email_codes WHERE user_id = ? AND purpose = ? AND sent_at = ?', r.id, purpose, now)); throw error; }
}
// A code works once, for 15 minutes, for the address it was sent to; five wrong tries void it.
async function useCode(r: Row, purpose: CodePurpose, input: unknown) {
  const row = (await one('SELECT * FROM email_codes WHERE user_id = ? AND purpose = ? AND expires_at > ?', r.id, purpose, Date.now())) ?? fail(400, 'code_expired');
  const code = typeof input === 'string' ? input.trim() : '';
  if (!/^\d{6}$/.test(code) || !timingSafeEqual(Buffer.from(codeHash(r, purpose, code), 'hex'), Buffer.from(row.code_hash, 'hex'))) {
    const spent = row.tries + 1 >= CODE_TRIES;
    if (spent) (await run('DELETE FROM email_codes WHERE user_id = ? AND purpose = ?', r.id, purpose));
    else (await run('UPDATE email_codes SET tries = tries + 1 WHERE user_id = ? AND purpose = ?', r.id, purpose));
    fail(400, spent ? 'code_expired' : 'wrong_email_code'); // wrong_code is the handover code's
  }
  // A reset runs outside the request transaction while hashing. Two requests
  // may read the same code; only the request that atomically consumes it wins.
  if (!(await run('DELETE FROM email_codes WHERE user_id = ? AND purpose = ? AND code_hash = ? AND expires_at > ? AND tries < ?',
    r.id, purpose, row.code_hash, Date.now(), CODE_TRIES)).changes) fail(400, 'code_expired');
}

route('POST', '/api/me/email/code', async ({ user }) => {
  const r = (await one('SELECT * FROM users WHERE id = ?', user.id))!;
  if (r.email_verified_at) fail(409, 'already_verified');
  await sendCode(r, 'verify');
  return { sent: true };
});
route('POST', '/api/me/email', async ({ user, body }) => {
  const r = (await one('SELECT * FROM users WHERE id = ?', user.id))!;
  if (r.email_verified_at) fail(409, 'already_verified'); // a verified address changes through support
  const email = normalizeEmail(body.email) ?? fail(400, 'invalid_email');
  if ((await one('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id <> ?', email, r.id))) fail(409, 'email_taken');
  (await run('UPDATE users SET email = ? WHERE id = ?', email, r.id));
  (await run('DELETE FROM email_codes WHERE user_id = ?', r.id));
  return (await me((await toUser((await one('SELECT * FROM users WHERE id = ?', r.id))!))));
});
route('POST', '/api/me/email/verify', async ({ user, body }) => {
  const r = (await one('SELECT * FROM users WHERE id = ?', user.id))!;
  if (!r.email_verified_at) {
    (await useCode(r, 'verify', body.code));
    (await run('UPDATE users SET email_verified_at = ? WHERE id = ?', Date.now(), r.id));
  }
  return (await me((await toUser((await one('SELECT * FROM users WHERE id = ?', user.id))!))));
});

// Forgotten password, self-service: only to an already verified address (a typed one could be someone else's), never
// for administrators (operator shell only). The same answer whether or not the account exists.
const accountFor = async (identifier: unknown) => {
  const value = String(identifier ?? '').trim(), phone = normalizePhone(value), email = normalizeEmail(value);
  const r = phone ? (await one('SELECT * FROM users WHERE phone = ?', phone)) : email ? (await one('SELECT * FROM users WHERE email = ? COLLATE NOCASE', email)) : undefined;
  return r && r.email_verified_at && r.status !== 'blocked' && r.role !== 'admin' ? r : undefined;
};
route('POST', '/api/auth/reset/code', async ({ body }) => {
  if (!emailReady) fail(503, 'email_unavailable');
  const r = (await accountFor(body.identifier));
  // Not awaited: the reply time must not tell a real account (provider call) from none; errors stay silent too.
  if (r) void persistence.detached(() => sendCode(r, 'reset')).catch(() => {});
  return { ok: true };
}, true);
route('POST', '/api/auth/reset', async ({ body }) => {
  const password = await hashPassword(newPassword(body.password)); // before the lookup: the same checks whether or not it exists
  // One answer for every miss (no account, no code, wrong or spent code), so failures say nothing about the account.
  const r = (await accountFor(body.identifier)) ?? fail(400, 'wrong_email_code');
  try { (await useCode(r, 'reset', body.code)); }
  catch (error) { throw error instanceof HttpError && error.status === 400 ? new HttpError(400, 'wrong_email_code') : error; }
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    (await run('UPDATE users SET password = ? WHERE id = ?', password, r.id));
    (await run('DELETE FROM sessions WHERE user_id = ?', r.id)); // a reset ends the session on every device
    for (const id of [r.phone, r.email].filter(Boolean)) (await run('DELETE FROM request_limits WHERE key = ?', identityKey('login', String(id).toLowerCase())));
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  return { ok: true }; // the app then signs in normally, through every login gate
}, true);

route('POST', '/api/auth/logout', async ({ user }) => {
  (await run('DELETE FROM sessions WHERE user_id = ?', user.id));
  (await run('DELETE FROM push_subscriptions WHERE user_id = ?', user.id)); // every session ended, so every browser stops alerting
  return { ok: true };
});
route('GET', '/api/me', async ({ user }) => (await me(user)));

// Destination filter (SPEC-driver-destination.md): only jobs dropping off in that city, for 3 hours.
const HEADING_FOR = 3 * 3_600_000; // ponytail: Uber-like window; tune from how long intercity drives home take
route('POST', '/api/driver/heading', async ({ user, body }) => {
  need(user, 'driver');
  const target = body.city == null ? null : isCity(body.city) ? body.city : fail(400, 'invalid_input');
  (await run('UPDATE users SET heading_city = ?, heading_until = ? WHERE id = ?', target, target ? Date.now() + HEADING_FOR : null, user.id));
  return (await me((await toUser((await one('SELECT * FROM users WHERE id = ?', user.id))!))));
});

route('POST', '/api/me', async ({ user, body }) => {
  (await run('UPDATE users SET name = ? WHERE id = ?', text(body.name, 60), user.id));
  return (await me((await toUser((await one('SELECT * FROM users WHERE id = ?', user.id))!))));
});

route('POST', '/api/me/password', async ({ user, body, req }) => {
  const key = identityKey('password', user.id);
  (await limit(key, 5, 10 * 60_000, false));
  const stored = (await one('SELECT password FROM users WHERE id = ?', user.id))!.password;
  if (!await checkPassword(String(body.current ?? ''), stored)) { (await limit(key, 5, 10 * 60_000)); fail(401, 'wrong_password'); }
  const password = await hashPassword(newPassword(body.password));
  const currentToken = /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')![1];
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    // Re-check the exact credential the KDF approved: a concurrent change must not be overwritten.
    if (!(await run('UPDATE users SET password = ? WHERE id = ? AND password = ?', password, user.id, stored)).changes) fail(401, 'wrong_password');
    (await run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', user.id, sha(currentToken)));
    (await run('DELETE FROM request_limits WHERE key = ?', key));
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  return { ok: true };
});

// Store rules require in-app account deletion. Orders stay for accounting, stripped of personal data.
async function deleteAccount(user: User) {
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    if ((await one('SELECT role FROM users WHERE id = ?', user.id))?.role === 'admin') fail(409, 'cannot_change_self');
    (await cashSettled(user.id));
    if ((await one(`SELECT id FROM orders WHERE (customer_id = ? OR driver_id = ?) AND status IN ('searching',${activeSql})`, user.id, user.id)))
      fail(409, 'active_orders');
    (await run(`UPDATE users SET name = '—', phone = ?, email = NULL, phone_verified_at = NULL, email_verified_at = NULL, entra_oid = NULL,
      approved_at = NULL, consent_at = NULL, consent_version = NULL, password = '', status = 'blocked', vehicle = NULL, plate = NULL WHERE id = ?`, `deleted-${user.id}`, user.id));
    (await run(`UPDATE orders SET contact = '', pickup_contact = '', recipient_name = '', recipient_phone = NULL, handover_code = NULL, pickup_note = '', dropoff_note = '', detail = '', pickup_lat = NULL, pickup_lng = NULL, dropoff_lat = NULL, dropoff_lng = NULL, share_token_hash = NULL
      WHERE customer_id = ?`, user.id));
    // T33: the privacy scrub follows the capability on both backends (destination_changes hosts proposals).
    if ((await destinationAvailable(persistence))) await run("UPDATE destination_changes SET original = '[]', dropoff_note = '', dropoff_lat = NULL, dropoff_lng = NULL WHERE customer_id = ?", user.id);
    (await run('DELETE FROM driver_locations WHERE driver_id = ?', user.id));
    (await run('DELETE FROM saved_places WHERE user_id = ?', user.id));
    (await run('DELETE FROM email_codes WHERE user_id = ?', user.id));
    (await run('DELETE FROM push_subscriptions WHERE user_id = ?', user.id));
    (await run('UPDATE referral_codes SET active = 0 WHERE user_id = ?', user.id)); // the code stops working and is never reissued
    (await run("UPDATE checkpoint_reports SET note = '' WHERE reporter_id = ?", user.id));
    (await run("UPDATE order_messages SET body = '—' WHERE sender_id = ?", user.id));
    (await run("DELETE FROM subscriptions WHERE user_id = ? AND status = 'pending'", user.id));
    (await run('DELETE FROM sessions WHERE user_id = ?', user.id));
    (await persistence.exec('COMMIT'));
  } catch (error) {
    (await persistence.exec('ROLLBACK'));
    throw error;
  }
  return { ok: true };
}
route('POST', '/api/me/delete', async ({ user }) => (await deleteAccount(user)));

// Saved and recent places (SPEC-saved-places.md): landmarks are the address here, so a repeat booking reuses them.
const MAX_PLACES = 10;
async function places(user: User) {
  const saved = (await all("SELECT id, label, city, note FROM saved_places WHERE user_id = ? ORDER BY CASE label WHEN 'home' THEN 0 WHEN 'work' THEN 1 ELSE 2 END, id", user.id));
  const seen = new Set(saved.map(p => `${p.city}
${p.note}`));
  const recent: { city: string; note: string }[] = [];
  for (const o of (await all('SELECT pickup_city, pickup_note, dropoff_city, dropoff_note FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 30', user.id)))
    for (const [city, note] of [[o.pickup_city, o.pickup_note], [o.dropoff_city, o.dropoff_note]]) {
      const key = `${city}
${note}`;
      if (note && !seen.has(key) && recent.length < 5) { seen.add(key); recent.push({ city, note }); }
    }
  return { saved, recent };
}
route('GET', '/api/me/places', async ({ user }) => { need(user, 'customer'); return (await places(user)); });
route('POST', '/api/me/places', async ({ user, body }) => {
  need(user, 'customer');
  if (!['home', 'work', 'other'].includes(body.label) || !isCity(body.city)) fail(400, 'invalid_input');
  const note = text(body.note, 200);
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    const existing = (await one('SELECT id FROM saved_places WHERE user_id = ? AND city = ? AND note = ?', user.id, body.city, note));
    if (body.label !== 'other') (await run('DELETE FROM saved_places WHERE user_id = ? AND label = ? AND id IS NOT ?', user.id, body.label, existing?.id ?? null)); // one Home, one Work
    if (existing) (await run('UPDATE saved_places SET label = ? WHERE id = ?', body.label, existing.id));
    else {
      if ((await one('SELECT COUNT(*) n FROM saved_places WHERE user_id = ?', user.id))!.n >= MAX_PLACES) fail(409, 'places_full');
      (await run('INSERT INTO saved_places (user_id, label, city, note, created_at) VALUES (?, ?, ?, ?, ?)', user.id, body.label, body.city, note, Date.now()));
    }
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  return (await places(user));
});
route('DELETE', '/api/me/places/:id', async ({ user, params }) => {
  need(user, 'customer');
  if (!(await run('DELETE FROM saved_places WHERE id = ? AND user_id = ?', Number(params[0]), user.id)).changes) fail(404, 'not_found');
  return (await places(user));
});

// Promo codes (SPEC-promo-codes.md): fixed shekel discounts the customer does not pay in cash; Wind funds them
// through the driver's cash ledger. A cancelled order frees its use.
const promoUses = `SELECT COUNT(*) n FROM promo_redemptions pr JOIN orders o ON o.id = pr.order_id WHERE o.status <> 'cancelled' AND pr.promo_id = ?`;
async function promoFor(user: User, input: unknown, price: number) {
  const code = String(input ?? '').trim().toUpperCase();
  const valid = /^[A-Z0-9]{4,16}$/.test(code);
  const p = valid ? (await one('SELECT * FROM promo_codes WHERE code = ? AND active = 1 AND expires_at > ?', code, Date.now())) : undefined;
  if (!p) {
    // A friend's invite code (SPEC-referral.md): first order only, never your own.
    const ref = (valid ? (await one("SELECT r.user_id FROM referral_codes r JOIN users u ON u.id = r.user_id WHERE r.code = ? AND r.active = 1 AND u.status = 'active'", code)) : undefined)
      ?? fail(400, 'invalid_promo');
    if (ref.user_id === user.id) fail(400, 'invalid_promo');
    if ((await one("SELECT id FROM orders WHERE customer_id = ? AND status <> 'cancelled'", user.id))) fail(409, 'invite_first_order_only');
    if (price < 2) fail(409, 'promo_not_applicable');
    return { id: null, referrerId: ref.user_id as number, code, discount: Math.min(REFERRAL_REWARD, price - 1) };
  }
  if (((await one('SELECT user_id FROM promo_owners WHERE promo_id = ?', p.id))?.user_id ?? user.id) !== user.id) fail(400, 'invalid_promo'); // someone's reward
  // T26: the use count and the redemption insert share the caller's write transaction; PostgreSQL takes a
  // per-promo-and-customer advisory lock so concurrent bookings cannot slip past the count under READ
  // COMMITTED. A cancelled order frees its redemption (promoUses ignores cancelled orders), so a plain
  // unique index would wrongly block the legitimate re-use of a cancelled booking's code.
  if (persistence.backend === 'postgres')
    (await run("SELECT pg_advisory_xact_lock(hashtextextended('wind_promo_use:' || ? || ':' || ?, 0))", p.id, user.id));
  if ((await one(`${promoUses} AND pr.customer_id = ?`, p.id, user.id))!.n > 0 || (await one(promoUses, p.id))!.n >= p.max_uses
    || (p.first_order_only && (await one("SELECT id FROM orders WHERE customer_id = ? AND status <> 'cancelled'", user.id)))) fail(409, 'promo_used');
  if (price < 2) fail(409, 'promo_not_applicable'); // the fare never drops below â‚ª1, so nothing would be discounted
  return { id: p.id as number, referrerId: null, code, discount: Math.min(p.amount, price - 1) };
}
route('POST', '/api/promos/check', async ({ user, body }) => {
  need(user, 'customer');
  needActive(user);
  (await limit(identityKey('promo', user.id), 20, 60 * 60_000)); // codes are short words; no guessing at scale
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 1) fail(400, 'invalid_input');
  const { code, discount } = (await promoFor(user, body.code, price));
  return { code, discount };
});
// Personal codes: invite codes (Wâ€¦) and inviter rewards (Râ€¦) share the promo namespace.
const REFERRAL_REWARD = 10;
// ponytail: flat cap against farming with throwaway accounts; per-phone verification is the real fix once SMS exists.
const REFERRAL_REWARDS_PER_30_DAYS = 5;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const codeTaken = async (code: string) => !!((await one('SELECT id FROM promo_codes WHERE code = ?', code)) ?? (await one('SELECT user_id FROM referral_codes WHERE code = ?', code)));
async function freshCode(prefix: string, length: number) {
  for (;;) {
    const code = prefix + Array.from({ length }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    if (!(await codeTaken(code))) return code;
  }
}
/** A one-use code only `ownerId` can apply, valid 90 days: invite rewards (Râ€¦) and goodwill credits (Câ€¦). */
async function ownedCode(prefix: string, ownerId: number, amount: number, createdBy: number, now: number) {
  const promoId = Number((await run('INSERT INTO promo_codes (code, amount, max_uses, expires_at, first_order_only, created_by, created_at) VALUES (?, ?, 1, ?, 0, ?, ?)',
    (await freshCode(prefix, 7)), amount, now + 90 * DAY, createdBy, now)).lastInsertRowid);
  (await run('INSERT INTO promo_owners (promo_id, user_id) VALUES (?, ?)', promoId, ownerId));
  return promoId;
}
/** The inviter's reward, once, when the friend's first order is delivered. */
export async function rewardReferral(orderId: number, now: number) {
  return persistence.scope(() => applyReferralReward(orderId, now));
}
async function applyReferralReward(orderId: number, now: number) {
  const ref = (await one("SELECT r.referee_id, r.referrer_id FROM referrals r JOIN users u ON u.id = r.referrer_id WHERE r.order_id = ? AND r.reward_promo_id IS NULL AND u.status = 'active'", orderId));
  if (!ref || (await one('SELECT COUNT(*) n FROM referrals r JOIN promo_codes p ON p.id = r.reward_promo_id WHERE r.referrer_id = ? AND p.created_at > ?',
    ref.referrer_id, now - 30 * DAY))!.n >= REFERRAL_REWARDS_PER_30_DAYS) return;
  const promoId = (await ownedCode('R', ref.referrer_id, REFERRAL_REWARD, ref.referrer_id, now));
  (await run('UPDATE referrals SET reward_promo_id = ? WHERE referee_id = ?', promoId, ref.referee_id));
}
route('GET', '/api/me/referral', async ({ user }) => {
  need(user, 'customer');
  if (!(await one('SELECT code FROM referral_codes WHERE user_id = ?', user.id))) (await run('INSERT INTO referral_codes (user_id, code) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING', user.id, (await freshCode('W', 5))));
  return {
    code: (await one('SELECT code FROM referral_codes WHERE user_id = ?', user.id))!.code, reward: REFERRAL_REWARD,
    joined: (await one("SELECT COUNT(*) n FROM referrals r JOIN orders o ON o.id = r.order_id WHERE r.referrer_id = ? AND o.status <> 'cancelled'", user.id))!.n,
    earned: (await one('SELECT COUNT(*) n FROM referrals WHERE referrer_id = ? AND reward_promo_id IS NOT NULL', user.id))!.n,
    credits: (await all(`SELECT p.code, p.amount, p.expires_at AS expiresAt FROM promo_owners w JOIN promo_codes p ON p.id = w.promo_id
      WHERE w.user_id = ? AND p.active = 1 AND p.expires_at > ? AND NOT EXISTS(SELECT 1 FROM promo_redemptions pr JOIN orders o ON o.id = pr.order_id
        WHERE pr.promo_id = p.id AND o.status <> 'cancelled') ORDER BY p.expires_at`, user.id, Date.now())),
  };
});
const adminPromos = 'SELECT * FROM promo_codes WHERE id NOT IN (SELECT promo_id FROM promo_owners) ORDER BY active DESC, id DESC LIMIT 100';
const promoRow = async (p: Row) => ({ id: p.id, code: p.code, amount: p.amount, maxUses: p.max_uses, uses: (await one(promoUses, p.id))!.n,
  expiresAt: p.expires_at, firstOrderOnly: !!p.first_order_only, active: !!p.active,
  live: !!p.active && p.expires_at > Date.now() });
route('GET', '/api/admin/promos', async ({ user }) => { need(user, 'admin'); return (await Promise.all((await all(adminPromos)).map(promoRow))); });
route('POST', '/api/admin/promos', async ({ user, body }) => {
  need(user, 'admin');
  const code = String(body.code ?? '').trim().toUpperCase();
  const whole = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
  if (!/^[A-Z0-9]{4,16}$/.test(code) || !whole(body.amount, 1, 100) || !whole(body.maxUses, 1, 10_000) || !whole(body.days, 1, 90)) fail(400, 'invalid_input');
  if ((await codeTaken(code))) fail(409, 'promo_exists');
  (await run('INSERT INTO promo_codes (code, amount, max_uses, expires_at, first_order_only, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    code, body.amount, body.maxUses, Date.now() + body.days * DAY, body.firstOrderOnly ? 1 : 0, user.id, Date.now()));
  return (await Promise.all((await all(adminPromos)).map(promoRow)));
});
route('POST', '/api/admin/promos/:id/deactivate', async ({ user, params }) => {
  need(user, 'admin');
  if (!(await run('UPDATE promo_codes SET active = 0 WHERE id = ? AND active = 1', Number(params[0]))).changes) fail(404, 'not_found');
  return (await Promise.all((await all(adminPromos)).map(promoRow)));
});

// Web Push (SPEC-web-push.md): opt-in per browser, no provider account. The payload carries a kind and an order id,
// never names or addresses; the service worker words it in the subscriber's language.
type PushKind = 'assigned' | 'at_pickup' | 'in_transit' | 'completed' | 'returned' | 'message' | 'job' | 'released' | 'cancelled'
  | 'offer' | 'offer_accepted' // SPEC-offer-alerts.md
  | 'on_hold' | 'returning' | 'decided' // SPEC-exception-push.md
  | 'approved' | 'support' | 'cash' | 'attention' | 'safety' | 'plan'
  | 'destination_request' | 'destination_accepted' | 'destination_declined';
// T37: the subject is read at send time and must be configured (no obsolete host default).
const PUSH_SUBJECT = () => pushSubject();
let pushKeyCache: { privateKey: ReturnType<typeof createPrivateKey>; publicRaw: Buffer } | undefined;
async function pushKeys() {
  if (pushKeyCache) return pushKeyCache;
  if (!(await one('SELECT id FROM push_keys WHERE id = 1'))) (await run('INSERT OR IGNORE INTO push_keys (id, private_jwk) VALUES (1, ?)',
    JSON.stringify(generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' }))));
  const jwk = JSON.parse((await one('SELECT private_jwk FROM push_keys WHERE id = 1'))!.private_jwk as string);
  pushKeyCache = { privateKey: createPrivateKey({ key: jwk, format: 'jwk' }),
    publicRaw: Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]) };
  return pushKeyCache;
}
// path opens a page that is not an order (order 0: cash, plans, admin queues); flushed only after the commit.
const queuePush = async (userIds: (number | null)[], kind: PushKind, order: number, path?: string) => {
  const ids = userIds.filter((id): id is number => id != null);
  if (ids.length && persistence.backend === 'postgres') { await enqueuePush(persistence, ids, kind, order, path); return; }
  if (ids.length) persistence.defer(async () => (await sendPush(ids, kind, order, path)));
};
dispatch.onOffer = async (driverId, orderId) => { await queuePush([driverId], 'offer', orderId); };
rideLifecycle.onBoardingLocked = async orderId => { await queuePush((await adminIds()), 'attention', orderId, '/admin/orders'); };
const adminIds = async () => (await all("SELECT id FROM users WHERE role = 'admin' AND status = 'active'")).map(a => a.id as number);
const flushPush = () => persistence.flushEffects();
async function sendPush(userIds: number[], kind: PushKind, order: number, path?: string) {
  const url = path ?? (kind === 'job' ? '/driver' : `/order/${order}`);
  for (const s of (await all(`SELECT * FROM push_subscriptions WHERE user_id IN (${userIds.map(() => '?').join(',')})`, ...userIds)))
    void persistence.detached(() => deliverCapped(s, JSON.stringify({ kind, order, url, lang: s.lang }), URGENT_KINDS.includes(kind) ? 'high' : 'normal',
      kind === 'job' ? 300 : kind === 'offer' ? OFFER_TTL / 1000 : 3600));
}

let pushInFlight = 0; const pushWaiters: (() => void)[] = [];
async function deliverCapped(s: Row, message: string, urgency: string, ttl: number) {
  if (pushInFlight >= 8) await new Promise<void>(done => pushWaiters.push(done));
  pushInFlight++;
  try { await deliver(s, message, urgency, ttl); } finally { pushInFlight--; pushWaiters.shift()?.(); }
}
async function deliver(s: Row, message: string, urgency: string, ttl: number) {
  try {
    const { privateKey, publicRaw } = (await pushKeys());
    const res = await fetch(s.endpoint as string, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000), body: encrypt(Buffer.from(message), Buffer.from(s.p256dh as string, 'base64url'), Buffer.from(s.auth as string, 'base64url')),
      headers: { TTL: String(ttl), Urgency: urgency, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: vapid(s.endpoint as string, publicRaw, privateKey, PUSH_SUBJECT()) } });
    await res.body?.cancel();
    if (res.status === 404 || res.status === 410) (await run('DELETE FROM push_subscriptions WHERE endpoint = ?', s.endpoint)); // the browser dropped it
  } catch { /* best effort: the app still shows everything on next open */ }
}
/** A new job reaches free, approved drivers whose vehicle can take it (at most 100 per order). */
async function newJobPush(service: Service, orderId: number, customerId: number, exceptDriver = 0) {
  // Booking is never refused for this, but one account cannot keep 100 drivers' phones ringing: 5 job alerts per 10 minutes.
  try { (await limit(identityKey('job-push', customerId), 5, 10 * 60_000)); } catch { return false; }
  const fits = vehicles.filter(v => vehicleServices[v].includes(service));
  const reachable = (await nativePushAvailable(persistence))
    ? '(EXISTS(SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id) OR EXISTS(SELECT 1 FROM native_push_tokens n WHERE n.user_id = u.id AND n.disabled_at IS NULL))'
    : 'EXISTS(SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)';
  const drivers = (await all(`SELECT u.id FROM users u WHERE u.role = 'driver' AND u.status = 'active' ${production && selfService ? 'AND u.approved_at IS NOT NULL' : ''}
    AND u.vehicle IN (${fits.map(() => '?').join(',')}) AND ${reachable}
    AND u.id <> ? AND NOT EXISTS(SELECT 1 FROM order_releases r WHERE r.order_id = ? AND r.driver_id = u.id)
    AND (u.heading_city IS NULL OR u.heading_until <= ? OR u.heading_city = (SELECT dropoff_city FROM orders WHERE id = ?))
    AND ${service === 'parcel' // a parcel reaches couriers already carrying parcels, below the load limit
    ? `NOT EXISTS(SELECT 1 FROM orders o WHERE o.driver_id = u.id AND o.status IN (${activeSql}) AND o.service <> 'parcel')
       AND (SELECT COUNT(*) FROM orders o WHERE o.driver_id = u.id AND o.status IN (${activeSql})) < ${PARCEL_LOAD}`
    : `NOT EXISTS(SELECT 1 FROM orders o WHERE o.driver_id = u.id AND o.status IN (${activeSql}))`} ORDER BY random() LIMIT 100`, ...fits, exceptDriver, orderId, Date.now(), orderId)); // ponytail: random fairness; nearest-first when driver positions are kept between jobs
  await queuePush(drivers.map(d => d.id as number), 'job', orderId);
  return true;
}
/** WP10: a ride starts a deterministic dispatch round when enabled; otherwise the legacy broadcast is unchanged. */
async function dispatchOrBroadcast(service: Service, orderId: number, customerId: number, exceptDriver = 0) {
  if (service === 'ride' && await dispatch.startRound(orderId)) return true;
  return newJobPush(service, orderId, customerId, exceptDriver);
}
/** Scheduled orders reach drivers when they are released (30 minutes before pickup), once. */
export async function alertReleasedJobs(now = Date.now()) {
  return persistence.atomic({ purpose: 'scheduled_job_release' }, () => releaseJobAlerts(now));
}
/** T21: stale searching demand is system-cancelled so it cannot occupy the board forever. A scheduled order
 * ages from its pickup time, so future work is untouched but a slot missed long ago leaves the board too.
 * An order a driver released (assigned_at kept, updated_at = release time) ages from its return to the board,
 * not from its booking, so it is never cancelled the minute it comes back. */
export async function expireStaleDemand(now = Date.now()) {
  return persistence.atomic({ purpose: 'stale_demand_expiry' }, async () => {
    if (draining) return 0;
    const before = now - SEARCH_EXPIRY_MS;
    const staleWhere = `status = 'searching' AND driver_id IS NULL AND COALESCE(scheduled_for, created_at) < ?
      AND (assigned_at IS NULL OR updated_at < ?)`;
    const stale = (await all(`SELECT id, customer_id FROM orders WHERE ${staleWhere} LIMIT 50`, before, before));
    let expired = 0;
    for (const o of stale) {
      // CAS: only still searching, unassigned and stale (not rescheduled or released since) at the moment of the update.
      if (!(await run(`UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ? AND ${staleWhere}`, now, o.id, before, before)).changes) continue;
      expired++;
      await queuePush([o.customer_id as number], 'cancelled', o.id as number); // the sender learns why their order left the board
    }
    return expired;
  }).then(expired => { void (async () => { if (expired) await flushPush(); })(); return expired; });
}
async function releaseJobAlerts(now: number) {
  if (draining) return;

  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    // A pickup already past is not a new job; a throttled customer's order is retried next minute.
    for (const o of (await all(`SELECT id, service, customer_id FROM orders WHERE status = 'searching' AND scheduled_for IS NOT NULL
      AND scheduled_for <= ? AND scheduled_for > ? AND job_alerted_at IS NULL LIMIT 50`, now + RELEASE_BEFORE, now)))
      if ((await dispatchOrBroadcast(o.service as Service, o.id as number, o.customer_id as number))) (await run('UPDATE orders SET job_alerted_at = ? WHERE id = ? AND job_alerted_at IS NULL', now, o.id));
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK'));  throw error; }
  await flushPush();
}
route('GET', '/api/push/key', async () => ({ key: b64url((await pushKeys()).publicRaw) }), true);
route('POST', '/api/push/subscribe', async ({ user, body }) => {
  const endpoint = pushEndpoint(body.endpoint) ?? fail(400, 'invalid_input');
  const key = Buffer.from(String(body.p256dh ?? ''), 'base64url'), auth = Buffer.from(String(body.auth ?? ''), 'base64url');
  if (key.length !== 65 || key[0] !== 4 || auth.length !== 16) fail(400, 'invalid_input');
  try { createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64url(key.subarray(1, 33)), y: b64url(key.subarray(33)) }, format: 'jwk' }); }
  catch { fail(400, 'invalid_input'); } // a point off the curve would fail on every send
  // A shared browser follows whoever signed in last (knowing the endpoint is the browser's own secret); five browsers per person.
  (await run(`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, lang, created_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang, created_at = excluded.created_at`,
  endpoint, user.id, b64url(key), b64url(auth), body.lang === 'en' ? 'en' : 'ar', Date.now()));
  (await run('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint NOT IN (SELECT endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5)', user.id, user.id));
  return { ok: true };
});
route('POST', '/api/push/unsubscribe', async ({ user, body }) => {
  (await run('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', String(body.endpoint ?? ''), user.id));
  return { ok: true };
});

// Customers
const finite = (v: unknown, max: number, min = -max): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
// Optional map point: absent is fine, anything else must be a real coordinate.
function pointOf(p: any): { latitude: number; longitude: number } | null {
  if (p == null) return null;
  if (!finite(p.latitude, 90) || !finite(p.longitude, 180)) fail(400, 'invalid_location');
  return { latitude: p.latitude, longitude: p.longitude };
}
// A booking pin must sit within the service bound of the city it is booked under (the app also checks it is the nearest;
// twin cities like Ramallah and Al-Bireh make that too strict to refuse here).
function bookedPoint(p: unknown, id: CityId) {
  const point = pointOf(p);
  if (point && crowKm(city(id), point) > SERVICE_KM) fail(400, 'outside_area');
  return point;
}

// Smart recommended price (SPEC-driver-offers.md): the checkpoint-aware road route the map draws, plus Wind's own live
// road reports (/api/roads). Without routing, straight km Ã— 1.3 at 50 km/h.
async function recommend(user: User, b: Row) {
  const service = services.includes(b.service) ? b.service as Service : fail(400, 'invalid_service');
  if (!enabledServices.includes(service)) fail(409, 'service_unavailable');
  if (!isCity(b.pickupCity) || !isCity(b.dropoffCity)) fail(400, 'invalid_city');
  const option = optionsFor(service).includes(String(b.option)) ? String(b.option) : fail(400, 'invalid_option');
  const from = bookedPoint(b.pickupPoint, b.pickupCity) ?? city(b.pickupCity), to = bookedPoint(b.dropoffPoint, b.dropoffCity) ?? city(b.dropoffCity);
  const at = Number.isInteger(b.scheduledFor) ? b.scheduledFor as number : Date.now();
  let trip: RoadRoute | null = null;
  try { trip = await roadRoute(from, to); } catch { /* estimate */ }
  const km = trip?.km ?? distanceKm(from, to), minutes = trip?.minutes ?? Math.round(km * 1.2);
  const reports = (await roads());
  // A positioned checkpoint counts when the route passes it; one without a position counts for its cities.
  const onTrip = (r: Awaited<ReturnType<typeof roads>>[number]) => r.point && trip ? nearLine(r.point, trip.line, CHECKPOINT_RADIUS)
    : r.cities.includes(b.pickupCity) || r.cities.includes(b.dropoffCity);
  const slow = reports.filter(r => r.status === 'slow' && onTrip(r)).map(r => r.name as string);
  // A closed one the route avoids already costs its detour; one it still crosses, or cannot be placed, costs waiting time.
  const closed = [...(trip?.through ?? []), ...reports.filter(r => r.status === 'closed' && (!r.point || !trip) && onTrip(r)).map(r => r.name as string)];
  const delayMinutes = slow.length * SLOW_MINUTES + closed.length * CLOSED_MINUTES;
  const price = smartPrice((await settings()), { service, option, loadingHelp: service === 'freight' && !!b.loadingHelp, km, minutes, delayMinutes, at,
    plus: (await activePlan(user.id)) === 'plus' });
  return { price, km, minutes, delayMinutes, night: isNight(at), slow, closed, avoids: trip?.avoids ?? [], estimated: !trip, standard: service === 'parcel', line: trip?.line ?? null, at };
}
route('POST', '/api/price', async ({ user, body }) => {
  need(user, 'customer');
  needActive(user);
  (await limit(identityKey('price', user.id), 120, 10 * 60_000));
  const base = (await recommend(user, body));
  if (!(await quotesAvailable(persistence))) return base;
  const service = body.service as Service;
  const option = String(body.option);
  const contact = body.contact == null || body.contact === '' ? '' : normalizePhone(String(body.contact)) ?? '';
  const point = bookedPoint(body.pickupPoint, body.pickupCity) ?? city(body.pickupCity), dropoff = bookedPoint(body.dropoffPoint, body.dropoffCity) ?? city(body.dropoffCity);
  const pickupPin = bookedPoint(body.pickupPoint, body.pickupCity), dropoffPin = bookedPoint(body.dropoffPoint, body.dropoffCity);
  const pickupNote = body.pickupNote !== undefined ? text(String(body.pickupNote), 200) : '';
  const dropoffNote = body.dropoffNote !== undefined ? text(String(body.dropoffNote), 200) : '';
  const detail = body.detail !== undefined ? text(String(body.detail), 500, service !== 'ride') : '';
  const shared = !!body.shared, loadingHelp = service === 'freight' && !!body.loadingHelp;
  const recipientPhone = body.recipientPhone == null || body.recipientPhone === '' ? null : normalizePhone(String(body.recipientPhone));
  const recipientName = recipientPhone ? String(body.recipientName ?? '').trim().slice(0,60) : '';
  const pickupContact = body.pickupContact == null ? null : normalizePhone(String(body.pickupContact));
  const scheduledFor = Number.isInteger(body.scheduledFor) ? body.scheduledFor as number : null;
  const tariffSnapshot = (await settings()) as unknown as Record<string, unknown>;
  const tariffVersion = tariffVersionFor(tariffSnapshot);
  const tariffBps = tariffBasisPoints(tariffSnapshot);
  const priceMinor = minorUnits(base.price);
  const commissionRate = (await activePlan(user.id)) === 'pro' ? (tariffSnapshot.proCommission as number) : (tariffSnapshot.commission as number);
  const commissionMinor = Number.isFinite(commissionRate) ? minorUnits(commissionOn(base.price, commissionRate as number)) : null;
  const feasibility = (await evaluateQuoteFeasibility(persistence, { service, routeLine: base.line, estimated: base.estimated, pickup: point ?? null, dropoff: dropoff ?? null }));
  if (feasibility.verdict.feasibility === 'infeasible') fail(409, 'route_prohibited');
  // WP12: a quote may carry the customer-declared scope it will commit.
  const declaredScope = body.declaredScope === undefined || body.declaredScope === null ? null
    : validateDeclaredScope(service, body.declaredScope, fail);
  const input = {
    customerId: user.id,
    service,
    pickupCity: body.pickupCity,
    dropoffCity: body.dropoffCity,
    pickupLat: pickupPin?.latitude ?? null,
    pickupLng: pickupPin?.longitude ?? null,
    dropoffLat: dropoffPin?.latitude ?? null,
    dropoffLng: dropoffPin?.longitude ?? null,
    pickupNote,
    dropoffNote,
    contact,
    pickupContact,
    recipientName,
    recipientPhone,
    detail,
    option,
    loadingHelp,
    shared,
    scheduledFor,
    price: base.price,
    priceMinor,
    commissionMinor,
    km: base.km,
    minutes: base.minutes,
    estimated: base.estimated,
    tariffSnapshot,
    tariffBps,
    tariffVersion,
    declaredScope,
  };
  const record = (await createQuoteRecord(persistence, input as any, feasibility));
  const etaBand = { minSeconds: record.eta_min_seconds, maxSeconds: record.eta_max_seconds };
  const reasons = JSON.parse(record.reasons as unknown as string);
  const disclosures = JSON.parse(record.disclosures as unknown as string);
  const lines = JSON.parse(record.lines as unknown as string);
  return {
    ...base,
    quoteId: record.id,
    quoteExpiresAt: record.expires_at,
    currency: 'ILS',
    priceMinor,
    commissionMinor,
    tariffVersion,
    tariffBasisPoints: tariffBps,
    graphVersion: record.graph_version,
    profileVersion: record.profile_version,
    restrictionVersion: record.restriction_version,
    providerVersion: record.provider_version,
    etaBand,
    feasibility: record.feasibility,
    reasons,
    disclosures,
    lines,
    itineraryHash: record.itinerary_hash,
    ...(declaredScope ? { declaredScope } : {}),
  };
});

// T21: a customer's unscheduled searching demand is capped so spam cannot bury matching supply, and stale
// unclaimed demand stops occupying the board. Both are policy bounds, not money: assigned custody and
// not-yet-due scheduled orders are never touched. Operators may tune the cap; the expiry stays >= 1 hour.
const SEARCHING_LIMIT = Number(process.env.WIND_SEARCHING_LIMIT) || 5;
const SEARCH_EXPIRY_MS = Math.max(Number(process.env.WIND_SEARCH_EXPIRY_MS) || 86_400_000, 3_600_000); // 24 h

async function createOrder(user: User, body: Row, smart?: { price: number; km: number }) {
  // T21: the cap check and the insert share the caller's write transaction — every booking path enters
  // createOrder inside BEGIN IMMEDIATE (SQLite) or persistence.atomic (PostgreSQL), and PostgreSQL takes a
  // per-customer advisory lock so concurrent creates cannot slip past the count under READ COMMITTED.
  if (persistence.backend === 'postgres') (await run("SELECT pg_advisory_xact_lock(hashtextextended('wind_searching_cap', ?))", user.id));
  const searching = (await one("SELECT COUNT(*) AS n FROM orders WHERE customer_id = ? AND status = 'searching' AND scheduled_for IS NULL", user.id)) as { n: number };
  if (Number(searching.n) >= SEARCHING_LIMIT) fail(409, 'too_many_searching');
  // WP08: quote-bound path enforces immutable itinerary/scope, minor-unit lines, versioned ETA and 120s expiry.
  // Legacy path preserves recomputed price/price_changed and promo_changed contracts.
  if (body.quoteId != null) {
    if (body.quotedPrice != null || body.price != null) fail(400, 'quote_price_conflict');
    const quoteId = String(body.quoteId);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quoteId)) fail(400, 'invalid_quote');
    if (!(await quotesAvailable(persistence))) fail(409, 'quotes_unavailable');
    // Lock quote for consumption; re-evaluate prohibition with current evidence before committing.
    const quoted = (await one('SELECT * FROM quotes WHERE id=?::uuid FOR UPDATE', quoteId)) ?? fail(404, 'quote_not_found');
    if (Number(quoted.customer_id) !== user.id) fail(404, 'quote_not_found');
    if (quoted.feasibility === 'infeasible') fail(409, 'route_prohibited');
    const now = Date.now();
    if (now > Number(quoted.expires_at) && quoted.consumed_at == null) fail(409, 'quote_expired');
    if (quoted.consumed_at != null && Number(quoted.consumed_order_id)) {
      // Idempotent consumption already committed; caller should replay via order_commands, but handle direct reuse as conflict.
      // Allow re-consumption only through replay path; treat duplicate quote use as 409 unless the same order is being replayed.
      // The outer order_commands replay already covers successful retries; reaching here with a consumed quote means a new command.
      fail(409, 'quote_consumed');
    }
    // Itinerary/scope immutability: a field supplied at booking must match the quote.
    // A field left unspecified at quote time ('' or a null pin) may be filled in at booking;
    // it then becomes part of the committed order. Effective values are used for the order.
    const quotedText = (value: unknown) => typeof value === 'string' ? value : '';
    const fillText = (quotedValue: unknown, bodyValue: unknown, max: number, required = true) => {
      const quoted = quotedText(quotedValue);
      if (bodyValue === undefined) return quoted;
      const supplied = text(String(bodyValue), max, required);
      if (quoted && supplied !== quoted) fail(409, 'itinerary_changed');
      return quoted || supplied;
    };
    const fillPhone = (quotedValue: unknown, bodyValue: unknown): string | null => {
      const quoted = quotedText(quotedValue);
      if (bodyValue === undefined || bodyValue === null || bodyValue === '') return quoted || null;
      const supplied = normalizePhone(String(bodyValue)) ?? fail(400, 'invalid_phone');
      if (quoted && supplied !== quoted) fail(409, 'itinerary_changed');
      return quoted || supplied;
    };
    const fillPoint = (quotedLat: unknown, quotedLng: unknown, bodyValue: unknown, cityId: unknown) => {
      const quoted = quotedLat != null ? { latitude: Number(quotedLat), longitude: Number(quotedLng) } : null;
      if (bodyValue === undefined || bodyValue === null) return quoted;
      const supplied = bookedPoint(bodyValue, cityId as CityId);
      if (!supplied) return quoted;
      if (quoted && (Math.abs(supplied.latitude - quoted.latitude) > 1e-4 || Math.abs(supplied.longitude - quoted.longitude) > 1e-4)) fail(409, 'itinerary_changed');
      return quoted ?? supplied;
    };
    // For fields that are optional in the price request, only check when the booking body provides them.
    if (body.service !== undefined && body.service !== quoted.service) fail(409, 'itinerary_changed');
    if (body.pickupCity !== undefined && body.pickupCity !== quoted.pickup_city) fail(409, 'itinerary_changed');
    if (body.dropoffCity !== undefined && body.dropoffCity !== quoted.dropoff_city) fail(409, 'itinerary_changed');
    if (body.option !== undefined && String(body.option) !== String(quoted.option)) fail(409, 'itinerary_changed');
    if (body.shared !== undefined && !!body.shared !== !!Number(quoted.shared)) fail(409, 'itinerary_changed');
    if (body.loadingHelp !== undefined && !!body.loadingHelp !== !!Number(quoted.loading_help)) fail(409, 'itinerary_changed');
    if (body.scheduledFor !== undefined && body.scheduledFor !== quoted.scheduled_for) fail(409, 'itinerary_changed');
    const effPickupNote = fillText(quoted.pickup_note, body.pickupNote, 200);
    const effDropoffNote = fillText(quoted.dropoff_note, body.dropoffNote, 200);
    const effDetail = fillText(quoted.detail, body.detail, 500, quoted.service !== 'ride');
    if (!effPickupNote || !effDropoffNote) fail(400, 'invalid_input');
    if (quoted.service !== 'ride' && !effDetail) fail(400, 'invalid_input');
    const effContact = fillPhone(quoted.contact, body.contact) ?? fail(400, 'invalid_phone');
    const effPickupContact = fillPhone(quoted.pickup_contact, body.pickupContact);
    // Pins filled in at booking join the order at the locked quote price; the
    // quote is immutable, so no reprice runs here (a tariff/graph change inside
    // the 120s window must not void the fare the customer accepted).
    const effPoint = fillPoint(quoted.pickup_lat, quoted.pickup_lng, body.pickupPoint, quoted.pickup_city);
    const effDropoffPoint = fillPoint(quoted.dropoff_lat, quoted.dropoff_lng, body.dropoffPoint, quoted.dropoff_city);
    if (quoted.service === 'ride' && body.recipientPhone != null && body.recipientPhone !== '') fail(400, 'invalid_input');
    const effRecipientPhone = fillPhone(quoted.recipient_phone, body.recipientPhone);
    const effRecipientName = effRecipientPhone ? fillText(quoted.recipient_name, body.recipientName, 60, false) : '';
    // Re-evaluate current prohibition on the same road geometry the quote used.
    // The straight chord cuts corners the road bends around (and vice versa).
    const effFrom = effPoint ?? city(quoted.pickup_city as CityId), effTo = effDropoffPoint ?? city(quoted.dropoff_city as CityId);
    let bookingLine: [number, number][] | null = null, bookingEstimated = true;
    try { const trip = await roadRoute(effFrom, effTo); bookingLine = trip.line; bookingEstimated = false; } catch { /* chord fallback below */ }
    const currentFeasibility = (await evaluateQuoteFeasibility(persistence, { service: quoted.service, routeLine: bookingLine, estimated: bookingEstimated, pickup: effFrom, dropoff: effTo }));
    // Current uncertain evidence does not block a valid uncertain quote.
    if (currentFeasibility.verdict.feasibility === 'infeasible') fail(409, 'route_prohibited');
    const service = quoted.service as Service;
    if (!enabledServices.includes(service)) fail(409, 'service_unavailable');
    if (Number(quoted.shared) === 1) fail(409, 'pooling_unavailable');
    const price = Number(quoted.price_minor) / 100;
    const nowTs = Date.now();
    const promo = body.promoCode == null ? null : (await promoFor(user, body.promoCode, price));
    if (promo && body.expectedDiscount != null && Number(body.expectedDiscount) !== promo.discount) fail(409, 'promo_changed');
    const scheduledFor = quoted.scheduled_for as number | null;
    if (scheduledFor !== null && !(Number.isInteger(scheduledFor) && scheduledFor >= nowTs + RELEASE_BEFORE && scheduledFor <= nowTs + 7 * DAY)) fail(400, 'invalid_schedule');
    // Promo last-budget race: lock the promo row when applicable.
    if (promo?.id) {
      const promoRow = (await one('SELECT * FROM promo_codes WHERE id=? FOR UPDATE', promo.id)) ?? fail(409, 'promo_used');
      const uses = Number((await one('SELECT COUNT(*) n FROM promo_redemptions pr JOIN orders o ON o.id=pr.order_id WHERE pr.promo_id=? AND o.status <> \'cancelled\'', promo.id))!.n);
      if (uses >= Number(promoRow.max_uses)) fail(409, 'promo_used');
      const perCustomer = Number((await one('SELECT COUNT(*) n FROM promo_redemptions pr JOIN orders o ON o.id=pr.order_id WHERE pr.promo_id=? AND pr.customer_id=? AND o.status <> \'cancelled\'', promo.id, user.id))!.n);
      if (perCustomer > 0) fail(409, 'promo_used');
    }
    const contact = effContact;
    const pickupContact = effPickupContact;
    const point = effPoint;
    const dropoff = effDropoffPoint;
    const recipientName = effRecipientName;
    const recipientPhone = effRecipientPhone;
    const id = Number((await run(`INSERT INTO orders (customer_id, service, shared, pickup_city, dropoff_city, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
    pickup_note, dropoff_note, contact, pickup_contact, detail, option, loading_help, price, status, handover_code, created_at, updated_at, scheduled_for, discount, recommended_price, route_km,
    recipient_name, recipient_phone, quote_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'searching', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::uuid)`,
    user.id, service, Number(quoted.shared), quoted.pickup_city, quoted.dropoff_city,
    point?.latitude ?? null, point?.longitude ?? null, dropoff?.latitude ?? null, dropoff?.longitude ?? null,
    effPickupNote, effDropoffNote, contact,
    pickupContact ?? contact,
    effDetail,
    quoted.option as string, Number(quoted.loading_help), price, service === 'ride' ? null : String(randomInt(1000, 10000)), nowTs, nowTs, scheduledFor, promo?.discount ?? null,
    service === 'parcel' ? null : price, null, recipientName, recipientPhone, quoteId)).lastInsertRowid);
    if (promo?.id) (await run('INSERT INTO promo_redemptions (promo_id, customer_id, order_id, created_at) VALUES (?, ?, ?, ?)', promo.id, user.id, id, nowTs));
    else if (promo) (await run(`INSERT INTO referrals (referee_id, referrer_id, order_id, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(referee_id) DO UPDATE SET referrer_id = excluded.referrer_id, order_id = excluded.order_id, created_at = excluded.created_at`, user.id, promo.referrerId, id, nowTs));
    // WP12: commit the declared scope with the order. A scope supplied at
    // booking must match the quoted scope; it never changes the price.
    {
      const quotedScope = quoted.declared_scope == null ? null
        : validateDeclaredScope(service, typeof quoted.declared_scope === 'string' ? JSON.parse(quoted.declared_scope as string) : quoted.declared_scope, fail);
      const bookingScope = body.declaredScope === undefined || body.declaredScope === null ? null
        : validateDeclaredScope(service, body.declaredScope, fail);
      if (quotedScope && bookingScope && scopePayloadHash(quotedScope) !== scopePayloadHash(bookingScope)) fail(409, 'itinerary_changed');
      const committedScope = quotedScope ?? bookingScope;
      if (committedScope) await saveDeclaredScope(persistence, fail, id, service, committedScope);
    }
    // Mark quote consumed atomically within the same order transaction.
    (await run('UPDATE quotes SET consumed_at=?, consumed_order_id=? WHERE id=?::uuid', nowTs, id, quoteId));
    if (scheduledFor == null) { (await run('UPDATE orders SET job_alerted_at = ? WHERE id = ?', nowTs, id)); (await dispatchOrBroadcast(service, id, user.id)); }
    return (await getOrder(id, user));
  }
  const service = services.includes(body.service) ? body.service as Service : fail(400, 'invalid_service');
  // Parcels have one standard price: nothing to offer on, so no recommendation (SPEC-parcel-standard.md).
  const recommended = service === 'parcel' ? undefined : smart?.price;
  if (!enabledServices.includes(service)) fail(409, 'service_unavailable');
  if (body.shared !== false && body.shared != null) fail(409, 'pooling_unavailable');
  if (!isCity(body.pickupCity) || !isCity(body.dropoffCity)) fail(400, 'invalid_city');
  const option = optionsFor(service).includes(String(body.option)) ? String(body.option) : fail(400, 'invalid_option');
  const contact = normalizePhone(String(body.contact ?? '')) ?? fail(400, 'invalid_phone');
  const point = bookedPoint(body.pickupPoint, body.pickupCity), dropoff = bookedPoint(body.dropoffPoint, body.dropoffCity);
  const shared = !!body.shared, loadingHelp = service === 'freight' && !!body.loadingHelp;
  // Who receives a parcel or load (SPEC-parcel-recipient.md); optional, never on a ride.
  const recipientPhone = body.recipientPhone == null || body.recipientPhone === '' ? null
    : service === 'ride' ? fail(400, 'invalid_input') : normalizePhone(String(body.recipientPhone)) ?? fail(400, 'invalid_phone');
  const recipientName = recipientPhone ? text(body.recipientName ?? '', 60, false) : '';
  // Smart orders arrive with their recommendation; Souq and apps before 1.0.8 keep the fixed tariff.
  const price = recommended ?? quote((await settings()), { service, pickupCity: body.pickupCity, dropoffCity: body.dropoffCity, option, loadingHelp, shared,
    plus: (await activePlan(user.id)) === 'plus' });
  // The app shows a price before commitment; if tariffs or the plan changed since, make the customer re-confirm.
  if (body.quotedPrice != null && Number(body.quotedPrice) !== price) fail(409, 'price_changed');
  const now = Date.now();
  const promo = body.promoCode == null ? null : (await promoFor(user, body.promoCode, price));
  if (promo && body.expectedDiscount != null && Number(body.expectedDiscount) !== promo.discount) fail(409, 'promo_changed');
  if (promo?.id) {
    const promoRow = (await one(persistence.backend === 'postgres' ? 'SELECT * FROM promo_codes WHERE id=? FOR UPDATE' : 'SELECT * FROM promo_codes WHERE id=?', promo.id)) ?? fail(409, 'promo_used');
    const uses = Number((await one('SELECT COUNT(*) n FROM promo_redemptions pr JOIN orders o ON o.id=pr.order_id WHERE pr.promo_id=? AND o.status <> \'cancelled\'', promo.id))!.n);
    if (uses >= Number(promoRow.max_uses)) fail(409, 'promo_used');
    const perCustomer = Number((await one('SELECT COUNT(*) n FROM promo_redemptions pr JOIN orders o ON o.id=pr.order_id WHERE pr.promo_id=? AND pr.customer_id=? AND o.status <> \'cancelled\'', promo.id, user.id))!.n);
    if (perCustomer > 0) fail(409, 'promo_used');
  }
  const scheduledFor = body.scheduledFor ?? null;
  if (scheduledFor !== null && !(Number.isInteger(scheduledFor) && scheduledFor >= now + RELEASE_BEFORE && scheduledFor <= now + 7 * DAY)) fail(400, 'invalid_schedule');
  const id = Number((await run(`INSERT INTO orders (customer_id, service, shared, pickup_city, dropoff_city, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
    pickup_note, dropoff_note, contact, pickup_contact, detail, option, loading_help, price, status, handover_code, created_at, updated_at, scheduled_for, discount, recommended_price, route_km,
    recipient_name, recipient_phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'searching', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    user.id, service, shared ? 1 : 0, body.pickupCity, body.dropoffCity,
    point?.latitude ?? null, point?.longitude ?? null, dropoff?.latitude ?? null, dropoff?.longitude ?? null,
    text(body.pickupNote, 200), text(body.dropoffNote, 200), contact,
    body.pickupContact == null ? contact : normalizePhone(String(body.pickupContact)) ?? fail(400, 'invalid_phone'),
    text(body.detail, 500, service !== 'ride'),
    option, loadingHelp ? 1 : 0, price, service === 'ride' ? null : String(randomInt(1000, 10000)), now, now, scheduledFor, promo?.discount ?? null,
    recommended ?? null, smart?.km ?? null, recipientName, recipientPhone)).lastInsertRowid); // the km the price used, shown on the driver's job card
  if (body.declaredScope !== undefined && body.declaredScope !== null) {
    if (!(await scopeAvailable(persistence))) fail(409, 'scope_unavailable');
    await saveDeclaredScope(persistence, fail, id, service, validateDeclaredScope(service, body.declaredScope, fail));
  }
  if (promo?.id) (await run('INSERT INTO promo_redemptions (promo_id, customer_id, order_id, created_at) VALUES (?, ?, ?, ?)', promo.id, user.id, id, now));
  // Only reachable again after the earlier first order was cancelled (promoFor refuses otherwise).
  else if (promo) (await run(`INSERT INTO referrals (referee_id, referrer_id, order_id, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(referee_id) DO UPDATE SET referrer_id = excluded.referrer_id, order_id = excluded.order_id, created_at = excluded.created_at`, user.id, promo.referrerId, id, now));
  if (scheduledFor == null) { (await run('UPDATE orders SET job_alerted_at = ? WHERE id = ?', now, id)); (await dispatchOrBroadcast(service, id, user.id)); }
  return (await getOrder(id, user));
}

route('POST', '/api/orders', async ({ user, body, req }) => {
  need(user, 'customer');
  needActive(user);
  if (body.promoCode != null) (await limit(identityKey('promo', user.id), 20, 60 * 60_000)); // no unlimited code guessing through booking
  const { requestId, commandExpiresAt, ...input } = body;
  // Routing is async, so the recommendation is computed before the write transaction (SPEC-driver-offers.md).
  const smart = async () => input.pricing === 'smart' ? await recommend(user, input) : undefined;
  // Quote-bound clients cannot supply an authoritative total; legacy quotedPrice remains supported.
  if (input.quoteId != null && (input.quotedPrice != null || input.price != null)) fail(400, 'quote_price_conflict');
  if (input.quoteId != null) {
    if (typeof input.quoteId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.quoteId)) fail(400, 'invalid_quote');
    if (persistence.backend !== 'postgres' || !(await quotesAvailable(persistence))) fail(409, 'quotes_unavailable');
  }
  // Routing yields to logout and administrator changes. Recheck authority before any booking write.
  const authorize = async () => {
    const current = (await authenticate(req)) ?? fail(401, 'unauthorized');
    need(current, 'customer');
    needActive(current);
    return current;
  };
  if (requestId == null) {
    const recommended = input.quoteId ? undefined : await smart();
    user = (await authorize());
    (await persistence.exec('BEGIN IMMEDIATE'));
    try { const order = (await createOrder(user, input, recommended)); (await persistence.exec('COMMIT')); return order; } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  }
  if (typeof requestId !== 'string' || !uuid.test(requestId)) fail(400, 'invalid_request_id');
  // A command can commit only until its own deadline, so a missing receipt after it is a real absence.
  // Replays of a committed command still return their order; only a new commit is refused.
  if (commandExpiresAt !== undefined && (!Number.isSafeInteger(commandExpiresAt) || (commandExpiresAt as number) > Date.now() + BOOKING_COMMAND_TTL_MS + 60_000)) // a minute of device clock skew
    fail(400, 'invalid_command_deadline');
  const expired = () => commandExpiresAt !== undefined && Date.now() > (commandExpiresAt as number);
  const hash = payloadHash(input);
  const replay = async () => {
    const existing = (await one('SELECT * FROM order_commands WHERE user_id = ? AND request_id = ?', user.id, requestId));
    if (existing && existing.payload_hash !== hash) fail(409, 'idempotency_conflict');
    return existing ? (await getOrder(existing.order_id, user)) : null;
  };
  const done = (await replay()); // a retried command returns its order even if today's price moved
  if (done) return done;
  if (expired()) fail(409, 'booking_command_expired');
  const recommended = input.quoteId ? undefined : await smart();
  user = (await authorize());
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    const raced = (await replay()); // the same command may have committed while routing was awaited
    if (raced) { (await persistence.exec('ROLLBACK')); return raced; }
    if (expired()) fail(409, 'booking_command_expired');
    const order = (await createOrder(user, input, recommended));
    (await run('INSERT INTO order_commands (user_id, request_id, payload_hash, order_id) VALUES (?, ?, ?, ?)', user.id, requestId, hash, order.id));
    (await persistence.exec('COMMIT'));
    return order;
  } catch (error) {
    (await persistence.exec('ROLLBACK'));
    // A concurrent retry can commit this key while we wait on it; answer with the winner.
    if ((error as { code?: string }).code === '23505') { const won = (await replay()); if (won) return won; }
    throw error;
  }
});

registerBookingReceiptRoutes(route, { need, fail, uuid, one });

// A partner key stays on the two API servers; never ship it in a mobile bundle.
function partner(req: IncomingMessage) {
  const configured = process.env.SOUQ_PARTNER_KEY;
  if (!configured || configured.length < 32) fail(503, 'partner_unavailable');
  const supplied = req.headers['x-partner-key'];
  if (typeof supplied !== 'string' || !timingSafeEqual(Buffer.from(sha(supplied), 'hex'), Buffer.from(sha(configured!), 'hex')))
    fail(401, 'unauthorized');
}

async function partnerUser(): Promise<User> {
  const phone = 'partner:souq'; // cannot log in through phone authentication
  let row = (await one('SELECT * FROM users WHERE phone = ?', phone));
  if (!row) {
    const id = Number((await run("INSERT INTO users (phone, name, password, role, status, vehicle, created_at) VALUES (?, 'سوقنا', ?, 'customer', 'active', NULL, ?)",
      phone, await hashPassword(randomBytes(32).toString('hex')), Date.now())).lastInsertRowid);
    row = (await one('SELECT * FROM users WHERE id = ?', id));
  }
  return (await toUser(row!));
}

route('GET', '/api/partner/config', ({ req }) => {
  partner(req);
  return { currency: 'ILS', cities: cities.map(({ id, ar }) => ({ id, ar })), enabledServices, pooling: false };
}, true);

route('POST', '/api/partner/quotes', async ({ req, body }) => {
  partner(req);
  if (!enabledServices.includes('parcel')) fail(409, 'service_unavailable');
  if (body.shared !== false && body.shared != null) fail(409, 'pooling_unavailable');
  if (!isCity(body.pickupCity) || !isCity(body.dropoffCity) || !['small', 'medium', 'large'].includes(String(body.option))) fail(400, 'invalid_input');
  // Optional pins are refused here, before the seller agrees, rather than at booking where the buyer can no longer fix them.
  bookedPoint(body.pickupPoint, body.pickupCity); bookedPoint(body.dropoffPoint, body.dropoffCity);
  return { currency: 'ILS', price: quote((await settings()), { service: 'parcel', pickupCity: body.pickupCity, dropoffCity: body.dropoffCity,
    option: body.option, shared: body.shared === true }) };
}, true);

route('POST', '/api/partner/orders', async ({ req, body }) => {
  partner(req);
  const ref = text(body.externalRef, 150);
  if (!Number.isSafeInteger(body.quotedPrice) || body.quotedPrice < 1) fail(400, 'invalid_input');
  const hash = payloadHash(body);
  const existing = (await one('SELECT * FROM partner_orders WHERE external_ref = ?', ref));
  if (existing) {
    if (existing.payload_hash !== hash) {
      if (existing.payload_hash !== sha(JSON.stringify(body))) fail(409, 'idempotency_conflict');
      (await run('UPDATE partner_orders SET payload_hash = ? WHERE external_ref = ?', hash, ref));
    }
    return (await getOrder(existing.order_id, (await partnerUser())));
  }
  const user = await partnerUser(); // its one-time placeholder KDF must precede the transaction
  // Same short atomic boundary the HTTP envelope used, including the partner_api audit purpose.
  try {
    return await persistence.atomic({ purpose: 'partner_api', correlationId: randomUUID() }, async () => {
      const { promoCode: _code, expectedDiscount: _discount, ...input } = body; // Wind promos are for Wind customers only
      const order = (await createOrder(user, { ...input, service: 'parcel' }));
      (await run('INSERT INTO partner_orders (external_ref, payload_hash, order_id) VALUES (?, ?, ?)', ref, hash, order.id));
      return order;
    });
  } catch (error) {
    // A concurrent retry of this reference won the insert; map both callers to its order.
    if ((error as { code?: string }).code !== '23505') throw error;
    const winner = (await one('SELECT * FROM partner_orders WHERE external_ref = ?', ref));
    if (!winner) throw error;
    if (winner.payload_hash !== hash) fail(409, 'idempotency_conflict');
    return (await getOrder(winner.order_id, (await partnerUser())));
  }
}, true);

async function partnerOrder(req: IncomingMessage, id: number) {
  partner(req);
  if (!(await one('SELECT 1 FROM partner_orders WHERE order_id = ?', id))) fail(404, 'not_found');
  return (await getOrder(id, (await partnerUser())));
}
route('GET', '/api/partner/orders/by-reference', async ({ req, query }) => {
  partner(req);
  const ref = text(query.get('externalRef'), 150);
  const mapping = (await one('SELECT order_id FROM partner_orders WHERE external_ref = ?', ref)) ?? fail(404, 'not_found');
  return (await getOrder(mapping.order_id, (await partnerUser())));
}, true);
route('GET', '/api/partner/orders/:id', async ({ req, params }) => (await partnerOrder(req, Number(params[0]))), true);
// Until the courier holds the parcel the order can still be called off; at_pickup included, or a no-show strands both sides.
const cancellable = ['searching', 'assigned', 'at_pickup'];
route('POST', '/api/partner/orders/:id/cancel', async ({ req, params }) => {
  const order = (await partnerOrder(req, Number(params[0])));
  if (order.status === 'cancelled') return order;
  if (!cancellable.includes(order.status)) fail(409, 'cannot_cancel');
  // The KDF carve-out runs partner routes outside the HTTP envelope, so the cancelled push needs its
  // own mutation transaction (enqueuePush refuses without one); same short boundary as partner create.
  return (await persistence.atomic({ purpose: 'partner_api', correlationId: randomUUID() }, async () => {
    if (!(await run("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ? AND status IN ('searching', 'assigned', 'at_pickup')", Date.now(), order.id)).changes) fail(409, 'cannot_cancel');
    if (order.driverId) await queuePush([order.driverId], 'cancelled', order.id);
    return (await partnerOrder(req, order.id));
  }));
}, true);

route('GET', '/api/orders', async ({ user, query }) => {
  const status = query.get('status'), before = query.get('before');
  const where = user.role === 'admin' ? '1 = 1' : user.role === 'driver' ? 'o.driver_id = ?' : 'o.customer_id = ?';
  const args: SQLInputValue[] = user.role === 'admin' ? [] : [user.id];
  const filter = status ? (args.push(status), ' AND o.status = ?') : '';
  const open = `o.status IN ('searching',${activeSql})`;
  // Load more: the next page of ended orders below the oldest one the client holds. Open work is never paged.
  if (before !== null) {
    const id = /^[1-9]\d{0,14}$/.test(before) ? Number(before) : fail(400, 'invalid_input');
    return (await Promise.all((await all(`${orderSelect} WHERE ${where}${filter} AND NOT (${open}) AND o.id < ? ORDER BY o.id DESC LIMIT ${HISTORY_PAGE}`, ...args, id))
      .map(async r => (await toOrder(r, user)))));
  }
  // First page: every open order, however much newer history there is, plus the newest page of ended ones.
  const newest = `SELECT o.id FROM orders o WHERE ${where}${filter} AND NOT (${open}) ORDER BY o.id DESC LIMIT 1 OFFSET ${HISTORY_PAGE - 1}`;
  return (await Promise.all((await all(`${orderSelect} WHERE ${where}${filter} AND (${open} OR o.id >= COALESCE((${newest}), 0)) ORDER BY o.id DESC`, ...args, ...args))
    .map(async r => (await toOrder(r, user)))));
});

async function withMeasuredScopes<T extends {id:number}>(orders:T[]) {
  const scopes=await measuredScopes(persistence,orders.map(order=>order.id));
  return orders.map(order=>({...order,measuredScope:scopes[order.id]??null}));
}
async function recoveryMetadata(id: number) {
  const row = await one('SELECT * FROM orders WHERE id=?', id) ?? fail(404, 'not_found');
  const version = persistence.backend === 'postgres' ? Number(row.version ?? 0)
    : Number((await one('SELECT COUNT(*) AS n FROM order_actions WHERE order_id=?', id))?.n ?? 0) + 1;
  return { schemaVersion: 1 as const, version, assignmentEpoch: row.assignment_epoch ?? null };
}
route('GET', '/api/orders/:id', async ({ user, params, query }) => {
  const order=query.get('protocol') === '1' ? await orderProtocol(user,Number(params[0]),query) : await getOrder(Number(params[0]),user);
  if ('journey' in order) return order;
  const result = query.get('capacityProtocol') === '1' ? (await withMeasuredScopes([order]))[0] : order;
  if (query.get('recoveryProtocol') !== '1') return result;
  return { ...result, recovery: await recoveryMetadata(order.id) };
});
// Live driver fix (long-poll): answers the moment a fix newer than `since` lands, else after LIVE_HOLD with what it has.
route('GET', '/api/orders/:id/live', async ({ user, params, query, req }) => {
  let limited = false;
  return (await liveFix(async () => {
    // A held request must not retain a session revoked while waiting for the next fix.
    const viewer = (await authenticate(req)) ?? fail(401, 'unauthorized');
    const o = (await getOrder(Number(params[0]), viewer));
    // Counted after the lookup: a stranger polling must not write to the database.
    if (!limited) { (await limit(identityKey('order-live', user.id), 2400, 10 * 60_000)); limited = true; }
    return { orderId: o.id, driverId: o.driverId, driverKey: o.driverId == null ? null : String(o.driverId), fix: o.driverLocation ?? null };
  }, query, req));
});

route('POST', '/api/orders/:id/cancel', async ({ user, params }) => {
  const order = (await getOrder(Number(params[0]), user));
  if (order.status === 'cancelled' && (user.role === 'admin' || user.id === order.customerId)) return order;
  const allowed = (user.role === 'admin' || user.id === order.customerId) && cancellable.includes(order.status);
  if (!allowed) fail(409, 'cannot_cancel');
  if (!(await run("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ? AND status IN ('searching', 'assigned', 'at_pickup')", Date.now(), order.id)).changes) fail(409, 'cannot_cancel');
  if (order.driverId) await queuePush([order.driverId], 'cancelled', order.id);
  if (user.role === 'admin') await queuePush([order.customerId ?? null], 'cancelled', order.id); // support cancelled it for the sender
  return (await getOrder(order.id, user));
});

// A scheduled parcel moves to another time until drivers can see it (RELEASE_BEFORE ahead of pickup).
// ponytail: parcels only, their standard price ignores the time; rides and freight re-price by time of day, so they cancel and rebook.
route('POST', '/api/orders/:id/schedule', async ({ user, params, body }) => {
  const order = (await getOrder(Number(params[0]), user));
  const now = Date.now(), at = body.scheduledFor;
  if (user.id !== order.customerId) fail(409, 'cannot_reschedule');
  if (order.scheduledFor === at) return order; // a resend after a lost reply
  if (order.service !== 'parcel' || order.status !== 'searching' || order.scheduledFor == null || order.scheduledFor <= now + RELEASE_BEFORE)
    fail(409, 'cannot_reschedule');
  if (!(Number.isInteger(at) && at >= now + RELEASE_BEFORE && at <= now + 7 * DAY)) fail(400, 'invalid_schedule');
  (await run('UPDATE orders SET scheduled_for = ?, updated_at = ? WHERE id = ?', at, now, order.id));
  return (await getOrder(order.id, user));
});

route('POST', '/api/orders/:id/rate', async ({ user, params, body }) => {
  const order = (await getOrder(Number(params[0]), user));
  // The driver and the price (SPEC-driver-offers.md) are rated separately, each once.
  const stars = (v: unknown) => v == null ? null : Number(v) >= 1 && Number(v) <= 5 ? Math.round(Number(v)) : fail(409, 'cannot_rate');
  if (user.id === order.driverId && user.role === 'driver') { // the driver rates the customer, once (SPEC-customer-rating.md)
    const customerRating = stars(body.customerRating);
    if (order.status !== 'completed' || customerRating == null || (order.customerRating && order.customerRating !== customerRating)) fail(409, 'cannot_rate');
    if (order.customerRating === customerRating) return order; // a lost response must not make a saved rating look rejected
    // T26: the claim is conditional on the column still being empty or already equal, so a concurrent
    // second rating can neither overwrite the first with a different value nor double-write, while a
    // replay of a lost response (same value) still succeeds.
    if (!(await run('UPDATE orders SET customer_rating = ? WHERE id = ? AND (customer_rating IS NULL OR customer_rating = ?)',
      customerRating, order.id, customerRating)).changes) {
      const saved = Number((await one('SELECT customer_rating FROM orders WHERE id = ?', order.id))!.customer_rating);
      if (saved !== customerRating) fail(409, 'cannot_rate');
    }
    return (await getOrder(order.id, user));
  }
  const rating = stars(body.rating), priceRating = stars(body.priceRating);
  if (order.customerId !== user.id || order.status !== 'completed' || (rating == null && priceRating == null)
    || (rating != null && order.rating && order.rating !== rating)
    || (priceRating != null && order.priceRating && order.priceRating !== priceRating)) fail(409, 'cannot_rate');
  // T26: each provided column must still be empty or already equal (a raced different value is refused; a
  // replay of a lost response, alone or beside a new field, still succeeds against the saved row).
  const claims = [rating != null ? '(rating IS NULL OR rating = ?)' : '', priceRating != null ? '(price_rating IS NULL OR price_rating = ?)' : ''].filter(Boolean);
  const claimValues = [rating, priceRating].filter(v => v != null);
  if (!(await run(`UPDATE orders SET rating = COALESCE(?, rating), price_rating = COALESCE(?, price_rating) WHERE id = ?${claims.length ? ` AND ${claims.join(' AND ')}` : ''}`,
    rating, priceRating, order.id, ...claimValues)).changes) {
    const saved = (await one('SELECT rating, price_rating FROM orders WHERE id = ?', order.id))!;
    if ((rating != null && Number(saved.rating) !== rating) || (priceRating != null && Number(saved.price_rating) !== priceRating)) fail(409, 'cannot_rate');
  }
  return (await getOrder(order.id, user));
});

// Trip sharing: the customer hands a rotating link to a recipient who has no account. Only the token's hash is
// stored, and the public view is an explicit allowlist â€” no phones, notes, codes, price or customer identity.
const SHARE_GRACE = DAY; // a finished trip's final status stays readable for a day
async function shareOrder(id: number, customerId: number) {
  const r = (await one('SELECT id, status FROM orders WHERE id = ? AND customer_id = ?', id, customerId)) ?? fail(404, 'not_found');
  if (!['searching', ...activeStatuses].includes(r.status)) fail(409, 'cannot_share');
  const token = randomBytes(32).toString('hex');
  (await run('UPDATE orders SET share_token_hash = ?, share_created_at = ? WHERE id = ?', sha(token), Date.now(), r.id));
  return { token, path: `/track/${token}` };
}
route('POST', '/api/orders/:id/share', async ({ user, params }) => (await shareOrder(Number(params[0]), user.id)));
// Souq keeps the returned link for its buyer and seller; a new call rotates it.
route('POST', '/api/partner/orders/:id/share', async ({ req, params }) => (await shareOrder((await partnerOrder(req, Number(params[0]))).id, (await partnerUser()).id)), true);
route('POST', '/api/orders/:id/share/revoke', async ({ user, params }) => {
  if (!(await run('UPDATE orders SET share_token_hash = NULL, share_created_at = NULL WHERE id = ? AND customer_id = ?', Number(params[0]), user.id)).changes)
    fail(404, 'not_found');
  return { ok: true };
});
const shareRefKey = randomBytes(32); // in memory only: public driver refs must not be invertible from the link itself
route('GET', '/api/track/([a-f0-9]{64})', async ({ params, req }) => {
  (await limit(identityKey('track-view', clientAddress(req)), 600, 10 * 60_000));
  return (await trackView(params[0]!)).view;
}, true);
route('GET', '/api/track/([a-f0-9]{64})/live', async ({ params, query, req }) => {
  let limited = false;
  return (await liveFix(async () => {
    const t = (await trackView(params[0]!)); // 404 for a made-up token: it leaves no row behind
    // Counted after the lookup, so an unauthenticated flood cannot write to the database.
    if (!limited) { (await limit(identityKey('track-live', sha(params[0]!)), 3600, 10 * 60_000)); limited = true; }
    return { orderId: t.orderId, driverId: t.driverId, driverKey: t.view.driver?.ref ?? null, fix: t.view.driverLocation };
  }, query, req));
}, true);
async function trackView(token: string) {
  const r = (await one(`${orderSelect} WHERE o.share_token_hash = ?`, sha(token))) ?? fail(404, 'not_found');
  const open = r.status === 'searching' || activeStatuses.includes(r.status);
  if (!open && Date.now() - r.updated_at > SHARE_GRACE) fail(404, 'not_found');
  const fresh = activeStatuses.includes(r.status) && r.loc_lat != null && Date.now() - r.loc_at <= 120_000;
  return { orderId: r.id, driverId: r.driver_id as number | null, row: r, view: {
    orderCode: orderCode(r.id), status: r.status, service: r.service, pickupCity: r.pickup_city, dropoffCity: r.dropoff_city,
    updatedAt: r.updated_at,
    driver: r.driver_id && open ? { firstName: String(r.driver_name ?? '').trim().split(/\s+/)[0], vehicle: r.driver_vehicle ?? null,
      ref: createHmac('sha256', shareRefKey).update(`${token}:${r.driver_id}`).digest('hex').slice(0, 12) } : null, // opaque per link: tells a reassignment apart, names no one
    driverLocation: fresh ? { latitude: r.loc_lat, longitude: r.loc_lng, updatedAt: r.loc_at, heading: r.loc_heading ?? null } : null,
  } };
}

// One dispute per finished order, opened by its customer within a week. Resolution is a recorded
// decision only; refunds and cash corrections belong to cash settlement.
route('POST', '/api/orders/:id/dispute', async ({ user, params, body }) => {
  const r = (await one('SELECT * FROM orders WHERE id = ? AND customer_id = ?', Number(params[0]), user.id)) ?? fail(404, 'not_found');
  const reason = text(body.reason, 1000);
  if (reason.length < 10) fail(400, 'invalid_input');
  if (!finishedStatuses.includes(r.status) || Date.now() - (r.completed_at ?? r.updated_at) > 7 * DAY) fail(409, 'cannot_dispute');
  if ((await one('SELECT id FROM order_disputes WHERE order_id = ?', r.id))) fail(409, 'dispute_exists');
  (await run('INSERT INTO order_disputes (order_id, customer_id, reason, created_at) VALUES (?, ?, ?, ?)', r.id, user.id, reason, Date.now()));
  await queuePush((await adminIds()), 'attention', r.id, '/admin/orders');
  return (await getOrder(r.id, user));
});

route('GET', '/api/admin/disputes', async ({ user }) => {
  need(user, 'admin');
  return (await all(`SELECT od.id, od.order_id orderId, od.reason, od.status, od.resolution, od.created_at createdAt, od.resolved_at resolvedAt,
    o.status orderStatus, c.name customerName, (SELECT p.amount FROM promo_codes p WHERE p.id = od.credit_promo_id) creditAmount FROM order_disputes od JOIN orders o ON o.id = od.order_id JOIN users c ON c.id = od.customer_id
    ORDER BY od.status = 'open' DESC, od.id DESC LIMIT 200`));
});

route('POST', '/api/admin/disputes/:id/resolve', async ({ user, params, body }) => {
  need(user, 'admin');
  const resolution = text(body.resolution, 1000);
  if (resolution.length < 5) fail(400, 'invalid_input');
  // Optional goodwill credit for the next order (SPEC-dispute-credit.md), funded like every promo.
  const credit = body.creditShekels == null ? null : Number.isInteger(body.creditShekels) && body.creditShekels >= 1 && body.creditShekels <= 50
    ? body.creditShekels as number : fail(400, 'invalid_input');
  const dispute = (await one('SELECT * FROM order_disputes WHERE id = ?', Number(params[0]))) ?? fail(404, 'not_found');
  // A blocked or deleted customer could never redeem it; resolve without a credit instead.
  if (credit && (await one('SELECT status FROM users WHERE id = ?', dispute.customer_id))?.status !== 'active') fail(409, 'customer_inactive');
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    if (!(await run("UPDATE order_disputes SET status = 'resolved', resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ? AND status = 'open'",
      resolution, user.id, Date.now(), dispute.id)).changes) fail(409, 'cannot_resolve');
    if (credit) (await run('UPDATE order_disputes SET credit_promo_id = ? WHERE id = ?', (await ownedCode('C', dispute.customer_id, credit, user.id, Date.now())), dispute.id));
    (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'DISPUTE_RESOLVED', ?, ?)`,
      user.id, dispute.order_id, JSON.stringify({ resolution, credit }), Date.now()));
    await queuePush([dispute.customer_id], 'support', dispute.order_id);
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  return { ok: true };
});

// Safety (SPEC-safety-sos.md): either party of a live trip can alert Wind's safety team. An open report
// freezes the driver's steps until an administrator resolves it; the reporter stays anonymous to the other party.
const safetyKinds = ['unsafe_driving', 'harassment', 'accident', 'threat', 'other'];
const safetyFree = async (orderId: number) => {
  if ((await one("SELECT id FROM safety_incidents WHERE order_id = ? AND status = 'open'", orderId))) fail(409, 'safety_hold');
};
route('POST', '/api/orders/:id/sos', async ({ user, params, body }) => {
  if (!safetyKinds.includes(body.kind)) fail(400, 'invalid_input');
  const note = text(body.note, 300, false);
  const r = (await one('SELECT o.id, o.status, o.customer_id, o.driver_id, l.lat, l.lng, l.updated_at loc_at FROM orders o LEFT JOIN driver_locations l ON l.driver_id = o.driver_id AND l.updated_at >= COALESCE(o.assigned_at, 0) WHERE o.id = ?',
    Number(params[0]))) ?? fail(404, 'not_found');
  const role = r.customer_id === user.id ? 'customer' : r.driver_id === user.id ? 'driver' : user.role === 'admin' ? null : fail(404, 'not_found');
  if (!role || !activeStatuses.includes(r.status)) fail(409, 'cannot_report');
  if (!(await one("SELECT id FROM safety_incidents WHERE order_id = ? AND reporter_id = ? AND status = 'open'", r.id, user.id))) {
    (await limit(identityKey('sos', user.id), 10, DAY)); // each report pauses a trip and pages an administrator
    const fresh = r.lat != null && Date.now() - r.loc_at <= 10 * 60_000;
    const id = Number((await run(`INSERT INTO safety_incidents (order_id, reporter_id, reporter_role, kind, note, lat, lng, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, r.id, user.id, role, body.kind, note, fresh ? r.lat : null, fresh ? r.lng : null, Date.now())).lastInsertRowid);
    (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'SAFETY_REPORTED', ?, ?)`,
      user.id, r.id, JSON.stringify({ incident: id, kind: body.kind }), Date.now()));
    await queuePush((await adminIds()), 'safety', r.id, '/admin/orders'); // a report pages every administrator
  }
  return (await getOrder(r.id, user));
});

route('GET', '/api/admin/incidents', async ({ user }) => {
  need(user, 'admin');
  return (await all(`SELECT si.id, si.order_id orderId, si.kind, si.note, si.status, si.resolution, si.reporter_role reporterRole,
    si.lat latitude, si.lng longitude, si.created_at createdAt, si.resolved_at resolvedAt, o.status orderStatus,
    rp.name reporterName, rp.phone reporterPhone, c.name customerName, c.phone customerPhone, o.contact orderContact, d.name driverName, d.phone driverPhone
    FROM safety_incidents si JOIN orders o ON o.id = si.order_id JOIN users rp ON rp.id = si.reporter_id
    JOIN users c ON c.id = o.customer_id LEFT JOIN users d ON d.id = o.driver_id
    ORDER BY si.status = 'open' DESC, si.id DESC LIMIT 200`));
});

route('POST', '/api/admin/incidents/:id/resolve', async ({ user, params, body }) => {
  need(user, 'admin');
  const resolution = text(body.resolution, 1000);
  if (resolution.length < 5) fail(400, 'invalid_input');
  const incident = (await one('SELECT * FROM safety_incidents WHERE id = ?', Number(params[0]))) ?? fail(404, 'not_found');
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    if (!(await run("UPDATE safety_incidents SET status = 'resolved', resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ? AND status = 'open'",
      resolution, user.id, Date.now(), incident.id)).changes) fail(409, 'cannot_resolve');
    (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'SAFETY_RESOLVED', ?, ?)`,
      user.id, incident.order_id, JSON.stringify({ incident: incident.id, resolution }), Date.now()));
    const parties = (await one('SELECT customer_id, driver_id FROM orders WHERE id = ?', incident.order_id))!;
    await queuePush([parties.customer_id, parties.driver_id], 'support', incident.order_id); // the frozen driver may continue
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  return { ok: true };
});

// In-trip chat (SPEC-in-app-chat.md): the two parties write while the order is active and read for a day after;
// administrators read for support. Never part of the public tracking view.
async function chatAccess(user: User, id: number) {
  const r = (await one('SELECT id, status, customer_id, driver_id, updated_at FROM orders WHERE id = ?', id)) ?? fail(404, 'not_found');
  const role = r.customer_id === user.id ? 'customer' : r.driver_id === user.id ? 'driver' : user.role === 'admin' ? 'admin' : fail(404, 'not_found');
  return { r, role, active: activeStatuses.includes(r.status) };
}
// A released job's conversation stays with that assignment: the next driver starts a fresh thread.
const chat = async (user: User, id: number, driverId: number | null) => (user.role === 'admin' && user.id !== driverId
  ? (await all('SELECT id, sender_id, sender_role, body, created_at FROM order_messages WHERE order_id = ? ORDER BY id DESC LIMIT 50', id))
  : (await all('SELECT id, sender_id, sender_role, body, created_at FROM order_messages WHERE order_id = ? AND driver_id IS ? ORDER BY id DESC LIMIT 50', id, driverId)))
  .reverse().map(m => ({ id: m.id, mine: m.sender_id === user.id, role: m.sender_role, body: m.body, createdAt: m.created_at }));
route('GET', '/api/orders/:id/messages', async ({ user, params }) => {
  const { r, role, active } = (await chatAccess(user, Number(params[0])));
  if (role !== 'admin' && !active && Date.now() - r.updated_at > DAY) fail(409, 'chat_closed');
  return (await chat(user, r.id, r.driver_id));
});
route('POST', '/api/orders/:id/messages', async ({ user, params, body }) => {
  const { r, role, active } = (await chatAccess(user, Number(params[0])));
  if (role === 'admin') fail(403, 'forbidden');
  const message = text(body.body, 500);
  // A resend after a lost reply replays instead of posting twice, even once the chat has closed.
  // ponytail: optional so older app builds still send; require it once every client runs this one.
  const requestId = body.requestId ?? null;
  if (requestId !== null && (typeof requestId !== 'string' || !uuid.test(requestId))) fail(400, 'invalid_request_id');
  const saved = requestId && (await one('SELECT order_id, body FROM order_messages WHERE sender_id = ? AND request_id = ?', user.id, requestId));
  if (saved) {
    if (saved.order_id !== r.id || saved.body !== message) fail(409, 'idempotency_conflict');
    return (await chat(user, r.id, r.driver_id));
  }
  if (!active) fail(409, 'chat_closed');
  (await limit(identityKey('chat', user.id), 30, 10 * 60_000));
  (await run('INSERT INTO order_messages (order_id, sender_id, driver_id, sender_role, body, created_at, request_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    r.id, user.id, r.driver_id, role, message, Date.now(), requestId));
  await queuePush([role === 'customer' ? r.driver_id : r.customer_id], 'message', r.id);
  return (await chat(user, r.id, r.driver_id));
});

// Road status (SPEC-road-status.md): admin-managed checkpoints, crowd reports from drivers, fresh for two hours.
const ROAD_FRESH = 2 * 3_600_000;
type RoadRow = { id: number; name: string; cities: CityId[]; point: Point | null; status: 'open' | 'slow' | 'closed' | null; note: string; reportedAt: number | null; agreeing: number };
// No cache: a report must show up in the next read. One request that needs it several times reads it once and passes
// the answer on (the ETA route needs the checkpoints three times).
async function roads(): Promise<RoadRow[]> {
  const since = Date.now() - ROAD_FRESH;
  const rows = (await Promise.all((await all('SELECT id, name, cities, lat, lng FROM checkpoints WHERE active = 1 ORDER BY name, id')).map(async c => {
    // Blocked (and deleted) accounts stop counting; each person counts once however often they report.
    const recent = `FROM checkpoint_reports r JOIN users u ON u.id = r.reporter_id WHERE r.checkpoint_id = ? AND r.created_at > ? AND u.status <> 'blocked'`;
    const latest = (await one(`SELECT r.status, r.note, r.created_at ${recent} ORDER BY r.created_at DESC, r.id DESC LIMIT 1`, c.id, since));
    const agreeing = latest ? (await one(`SELECT COUNT(DISTINCT r.reporter_id) n ${recent} AND r.status = ?`, c.id, since, latest.status))!.n : 0;
    return { id: c.id, name: c.name, cities: JSON.parse(c.cities), point: c.lat == null ? null : { latitude: c.lat, longitude: c.lng },
      status: latest?.status ?? null, note: latest?.note ?? '', reportedAt: latest?.created_at ?? null, agreeing };
  })));
  return rows;
}
route('GET', '/api/roads', async () => (await roads()));
route('POST', '/api/roads/:id/report', async ({ user, params, body }) => {
  if (user.role === 'customer') fail(403, 'forbidden');
  needActive(user);
  if (!['open', 'slow', 'closed'].includes(body.status)) fail(400, 'invalid_input');
  const note = text(body.note, 120, false);
  const id = Number(params[0]);
  if (!(await one('SELECT id FROM checkpoints WHERE id = ? AND active = 1', id))) fail(404, 'not_found');
  if ((await one('SELECT id FROM checkpoint_reports WHERE checkpoint_id = ? AND reporter_id = ? AND created_at > ?', id, user.id, Date.now() - 10 * 60_000))) fail(429, 'already_reported');
  (await limit(identityKey('road', user.id), 30, 60 * 60_000)); // across all checkpoints
  (await run('INSERT INTO checkpoint_reports (checkpoint_id, reporter_id, status, note, created_at) VALUES (?, ?, ?, ?, ?)', id, user.id, body.status, note, Date.now()));
  return (await roads());
});
route('POST', '/api/admin/roads', async ({ user, body }) => {
  need(user, 'admin');
  const name = text(body.name, 80);
  const list = Array.isArray(body.cities) ? [...new Set(body.cities)] : [];
  if (name.length < 3 || !list.length || list.length > 3 || !list.every(isCity)) fail(400, 'invalid_input');
  const point = checkpointPoint(body.point, list);
  (await run('INSERT INTO checkpoints (name, cities, lat, lng, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', name, JSON.stringify(list), point?.latitude ?? null, point?.longitude ?? null, user.id, Date.now()));
  return (await roads());
});
// A position lets routing steer around the checkpoint while it is reported closed (SPEC-checkpoint-routing.md).
function checkpointPoint(raw: unknown, list: CityId[]) {
  const point = pointOf(raw);
  if (point && !list.some(id => distanceKm(city(id), point) <= 25)) fail(400, 'checkpoint_too_far');
  return point;
}
// Pilot cities' checkpoints at OpenStreetMap positions read 31 Oct 2026: military=checkpoint nodes, the Qalandia checkpoint
// building and the Tapuach (Za'tara) junction. Only missing names are added, owned by an admin; Roads moves or adds more.
// ponytail: Al-Jalama (Jenin) and Beit Iba have no mapped position yet, so an admin pins them from the Roads screen.
const pilotCheckpoints: [name: string, cities: CityId[], latitude: number, longitude: number][] = [
  ['حاجز حوارة · Huwara', ['nablus'], 32.178, 35.2735],
  ["حاجز زعترة · Za'tara", ['nablus', 'ramallah'], 32.1153, 35.2573],
  ['حاجز دير شرف · Deir Sharaf', ['nablus', 'tulkarm'], 32.2551, 35.1852],
  ['حاجز شافي شمرون · Shavei Shomron', ['nablus', 'jenin'], 32.2642, 35.1879],
  ['حاجز عطارة · Atara', ['ramallah', 'bireh'], 31.9828, 35.2006],
  ["حاجز جبع · Jaba'", ['ramallah', 'bireh', 'jericho'], 31.8539, 35.2564],
  ['حاجز قلنديا · Qalandia', ['ramallah', 'bireh'], 31.8623, 35.2275],
];
export async function seedCheckpoints() {
  const admin = (await one("SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id LIMIT 1")) ?? fail(409, 'promote an admin first');
  let added = 0;
  for (const [name, cities, latitude, longitude] of pilotCheckpoints) {
    if (await one('SELECT 1 FROM checkpoints WHERE name = ?', name)) continue;
    const point = checkpointPoint({ latitude, longitude }, cities)!;
    (await run('INSERT INTO checkpoints (name, cities, lat, lng, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', name, JSON.stringify(cities), point.latitude, point.longitude, admin.id, Date.now()));
    added++;
  }
  return added;
}
route('POST', '/api/admin/roads/:id/place', async ({ user, params, body }) => {
  need(user, 'admin');
  const row = (await one('SELECT cities FROM checkpoints WHERE id = ? AND active = 1', Number(params[0]))) ?? fail(404, 'not_found');
  const point = checkpointPoint(body.point, JSON.parse(row.cities)) ?? fail(400, 'invalid_location');
  (await run('UPDATE checkpoints SET lat = ?, lng = ? WHERE id = ?', point.latitude, point.longitude, Number(params[0])));
  return (await roads());
});
route('POST', '/api/admin/roads/:id/remove', async ({ user, params }) => {
  need(user, 'admin');
  if (!(await run('UPDATE checkpoints SET active = 0 WHERE id = ? AND active = 1', Number(params[0]))).changes) fail(404, 'not_found');
  return (await roads());
});

// Drivers
route('GET', '/api/jobs', async ({ user, query }) => {
  need(user, 'driver');
  needActive(user);
  if (!servesFor(user.vehicle).length) fail(409, 'no_vehicle'); // say why the list is empty
  const allowed = servesFor(user.vehicle).filter(service => enabledServices.includes(service));
  const paging = query.get('page') === '1';
  const pageSize = paging ? 20 : 50; // keep legacy responses stable while bounding mobile rendering and per-request work
  if (!allowed.length) return paging ? { version: 1, jobs: [], nextCursor: null } : [];
  // Scheduled orders wait until shortly before pickup, then queue by pickup time like any other.
  // A driver heading somewhere sees only jobs going there (SPEC-driver-destination.md).
  const heading = user.heading?.city ?? '';
  const after = query.get('after');
  let cursor: [number, number] | undefined;
  if (after !== null) {
    if (!/^\d{1,16}:\d{1,16}$/.test(after)) fail(400, 'invalid_input');
    const [at, id] = after.split(':').map(Number);
    if (!Number.isSafeInteger(at) || !Number.isSafeInteger(id) || id < 1) fail(400, 'invalid_input');
    cursor = [at, id];
  }
  const rows = await all(`${orderSelect} WHERE o.status = 'searching' AND o.service IN (${allowed.map(() => '?').join(',')})
    AND (o.scheduled_for IS NULL OR o.scheduled_for <= ?) AND (? = '' OR o.dropoff_city = ?)
    AND NOT EXISTS(SELECT 1 FROM order_releases r WHERE r.order_id = o.id AND r.driver_id = ?)
    ${cursor ? 'AND (COALESCE(o.scheduled_for, o.created_at) > ? OR (COALESCE(o.scheduled_for, o.created_at) = ? AND o.id > ?))' : ''}
    ORDER BY COALESCE(o.scheduled_for, o.created_at), o.id LIMIT ${paging ? pageSize + 1 : pageSize}`, ...allowed, Date.now() + RELEASE_BEFORE, heading, heading, user.id,
    ...(cursor ? [cursor[0], cursor[0], cursor[1]] : []));
  const visible = rows.slice(0, pageSize);
  const cards = await jobCardData(visible, user.id);
  const jobs = await Promise.all(visible.map(r => toOrder(r, user, cards)));
  const result = query.get('capacityProtocol') === '1' ? await withMeasuredScopes(jobs) : jobs;
  if (!paging) return result;
  const last = visible.at(-1);
  const nextCursor = rows.length > pageSize && last ? `${last.scheduled_for ?? last.created_at}:${last.id}` : null;
  return { version: 1, jobs: result, nextCursor };
});

route('POST', '/api/jobs/:id/accept', async ({ user, params, body }) => {
  need(user, 'driver');
  needActive(user);
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
  const freshDriver = (await one('SELECT role, status, vehicle FROM users WHERE id = ?', user.id));
  if (!freshDriver || freshDriver.role !== 'driver' || freshDriver.status !== 'active') fail(403, 'blocked');
  user.vehicle = freshDriver!.vehicle;
  if (body.offerId !== undefined || body.leaseNonce !== undefined) {
    const dispatched = await dispatch.acceptOffer({ driverId: user.id, orderId: Number(params[0]), offerId: body.offerId, leaseNonce: body.leaseNonce, capacityProtocol: body.capacityProtocol, expectedRequirementsRevision: body.expectedRequirementsRevision }, async () => {
      const offered = (await getOrder(Number(params[0]), user));
      if (!enabledServices.includes(offered.service)) fail(409, 'service_unavailable');
      if (!servesFor(user.vehicle).includes(offered.service)) fail(409, 'wrong_vehicle');
      const carryingOffer = (await activeLoad(user.id));
      if (!canTake(carryingOffer, offered.service)) fail(409, 'vehicle_busy');
      const offeredRate = (await activePlan(user.id)) === 'pro' ? (await settings()).proCommission : (await settings()).commission;
      const changedOffer = (await run(`UPDATE orders SET driver_id = ?, commission = ?, status = 'assigned', updated_at = ?, assigned_at = ? WHERE id = ? AND status = 'searching' AND NOT EXISTS(SELECT 1 FROM order_releases WHERE order_id = ? AND driver_id = ?)`, user.id, commissionOn(offered.price, offeredRate), Date.now(), Date.now(), offered.id, offered.id, user.id)).changes;
      if (!changedOffer) fail(409, 'already_taken');
      await run('UPDATE orders SET commission_rate = ? WHERE id = ?', offeredRate, offered.id); // T33: both backends bind the rate snapshot
      await rideLifecycle.ensureAssignment(offered.id, user.id, 'dispatch');
      (await run('DELETE FROM order_offers WHERE order_id = ? OR driver_id = ?', offered.id, user.id));
      if (!carryingOffer.length) (await run('DELETE FROM driver_locations WHERE driver_id = ?', user.id));
      const assignedResult = (await getOrder(offered.id, user));
      await queuePush([assignedResult.customerId!], 'assigned', offered.id);
      return assignedResult;
    });
    (await persistence.exec('COMMIT'));
    return dispatched;
  }
  if (await dispatch.hasOpenOffer(Number(params[0]))) fail(409, 'dispatch_offer_required');
  // Lock the driver's resource before reading their load; independent API processes share this lock.
  if (persistence.backend === 'postgres') {
    await one('SELECT id FROM users WHERE id = ? FOR UPDATE', user.id);
    await one('SELECT id FROM orders WHERE id = ? FOR UPDATE', Number(params[0]));
  }
  const order = (await getOrder(Number(params[0]), user));
  if (!enabledServices.includes(order.service)) fail(409, 'service_unavailable');
  if (!servesFor(user.vehicle).includes(order.service)) fail(409, 'wrong_vehicle');
  // ponytail: one active job until inspected aggregate load/route policy supports batching.
  const carrying = (await activeLoad(user.id));
  if (!canTake(carrying, order.service)) fail(409, 'vehicle_busy'); // parcels stack up to PARCEL_LOAD; rides and freight are exclusive
  const rate = (await activePlan(user.id)) === 'pro' ? (await settings()).proCommission : (await settings()).commission;
  const changed = (await run(`UPDATE orders SET driver_id = ?, commission = ?, status = 'assigned', updated_at = ?, assigned_at = ?
    WHERE id = ? AND status = 'searching' AND NOT EXISTS(SELECT 1 FROM order_releases WHERE order_id = ? AND driver_id = ?)`,
  user.id, commissionOn(order.price, rate), Date.now(), Date.now(), order.id, order.id, user.id)).changes;
  if (!changed) fail(409, 'already_taken');
  await run('UPDATE orders SET commission_rate = ? WHERE id = ?', rate, order.id); // T33: both backends bind the rate snapshot
  await rideLifecycle.ensureAssignment(order.id, user.id, 'legacy');
  (await run('DELETE FROM order_offers WHERE order_id = ? OR driver_id = ?', order.id, user.id)); // settled, and this driver is busy now
  // An older job's location is not this assignment's fix, unless the driver is still carrying other orders right now.
  if (!carrying.length) (await run('DELETE FROM driver_locations WHERE driver_id = ?', user.id));
  const result = (await getOrder(order.id, user));
  await queuePush([result.customerId!], 'assigned', order.id);
  (await persistence.exec('COMMIT'));
  return result;
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
});

// Driver offers (SPEC-driver-offers.md): name a price within the band around the recommendation; the customer chooses.
route('POST', '/api/jobs/:id/offer', async ({ user, params, body }) => {
  need(user, 'driver');
  needActive(user);
  (await limit(identityKey('offer', user.id), 30, 10 * 60_000));
  const order = (await getOrder(Number(params[0]), user)); // 404 unless an open job this driver may take
  if (order.status !== 'searching') fail(409, 'already_taken');
  const recommended = order.recommendedPrice ?? fail(409, 'fixed_price'); // Souq and older apps: accept at the shown price
  if (!enabledServices.includes(order.service) || !servesFor(user.vehicle).includes(order.service)) fail(409, 'wrong_vehicle');
  if (!canTake((await activeLoad(user.id)), order.service)) fail(409, 'vehicle_busy');
  const [min, max] = offerRange(recommended);
  if (!Number.isInteger(body.price) || body.price < min || body.price > max) fail(400, 'invalid_offer');
  // A driver changing their own live offer does not ring the customer again; a first or renewed one does.
  if (!(await one('SELECT 1 FROM order_offers WHERE order_id = ? AND driver_id = ? AND created_at > ?', order.id, user.id, Date.now() - OFFER_TTL)))
    await queuePush([(await one('SELECT customer_id FROM orders WHERE id = ?', order.id))!.customer_id as number], 'offer', order.id);
  (await run(`INSERT INTO order_offers (order_id, driver_id, price, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(order_id, driver_id) DO UPDATE SET price = excluded.price, created_at = excluded.created_at`, order.id, user.id, body.price, Date.now()));
  return (await getOrder(order.id, user));
});
route('POST', '/api/orders/:id/offers/:driver/accept', async ({ user, params }) => {
  need(user, 'customer');
  needActive(user);
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    if (persistence.backend === 'postgres') {
      await one('SELECT id FROM users WHERE id = ? FOR UPDATE', Number(params[1]));
      await one('SELECT id FROM orders WHERE id = ? FOR UPDATE', Number(params[0]));
    }
    const offerDriver = (await one('SELECT role, status FROM users WHERE id = ?', Number(params[1])));
    if (!offerDriver || offerDriver.role !== 'driver' || offerDriver.status !== 'active') fail(409, 'offer_expired');
    const r = (await one('SELECT * FROM orders WHERE id = ? AND customer_id = ?', Number(params[0]), user.id)) ?? fail(404, 'not_found');
    if (r.status !== 'searching') fail(409, 'order_changed');
    const f = (await one(`SELECT f.price, u.id, u.vehicle FROM order_offers f JOIN users u ON u.id = f.driver_id WHERE f.order_id = ? AND f.driver_id = ? ${offerOpen}`,
      r.id, Number(params[1]), Date.now() - OFFER_TTL)) ?? fail(409, 'offer_expired');
    if (!servesFor(f.vehicle).includes(r.service)) fail(409, 'offer_expired');
    const rate = (await activePlan(f.id)) === 'pro' ? (await settings()).proCommission : (await settings()).commission;
    // A promo or credit never discounts more than the fare minus â‚ª1 (as at booking).
    (await run(`UPDATE orders SET driver_id = ?, price = ?, discount = CASE WHEN discount IS NULL THEN NULL ELSE MIN(discount, ? - 1) END,
      commission = ?, status = 'assigned', updated_at = ?, assigned_at = ? WHERE id = ? AND status = 'searching'`, f.id, f.price, f.price, commissionOn(f.price, rate), Date.now(), Date.now(), r.id));
    await run('UPDATE orders SET commission_rate = ? WHERE id = ?', rate, r.id); // T33: both backends bind the rate snapshot
    await rideLifecycle.ensureAssignment(r.id, Number(f.id), 'legacy');
    (await run('DELETE FROM order_offers WHERE order_id = ? OR driver_id = ?', r.id, f.id));
    (await run('DELETE FROM driver_locations WHERE driver_id = ?', f.id));
    await queuePush([f.id as number], 'offer_accepted', r.id); // the driver has usually left the jobs screen
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  return (await getOrder(Number(params[0]), user));
});

async function restoredDiscount(orderId: number, price: number, current: number | null) {
  if (current == null || price < 2) return current;
  const redemption = (await one('SELECT p.amount FROM promo_redemptions pr JOIN promo_codes p ON p.id = pr.promo_id WHERE pr.order_id = ?', orderId));
  if (redemption) return Math.min(Number(redemption.amount), price - 1);
  if ((await one('SELECT referee_id FROM referrals WHERE order_id = ?', orderId))) return Math.min(REFERRAL_REWARD, price - 1);
  return current;
}

registerDestinationRoutes(route, { need, needActive, fail, limit, identityKey, text, isCity, bookedPoint, uuid,
  db: persistence, settings, tariffVersionFor, activePlan, safetyFree, queuePush, getOrder, recommend, restoredDiscount, commissionOn });

route('POST', '/api/orders/:id/release', async ({ user, params }) => {
  need(user, 'driver'); needActive(user);
  const order = await (async () => {
    (await persistence.exec('BEGIN IMMEDIATE'));
    try {
      if ((await one('SELECT 1 FROM order_releases WHERE order_id = ? AND driver_id = ?', Number(params[0]), user.id))) {
        (await persistence.exec('COMMIT'));
        return null; // the original release succeeded, possibly before the connection dropped
      }
      const current = (await getOrder(Number(params[0]), user));
      if (current.driverId !== user.id || !['assigned', 'at_pickup'].includes(current.status)) fail(409, 'cannot_release'); // nothing collected yet
      (await safetyFree(current.id));
      const now = Date.now();
      const restoredPrice = current.recommendedPrice ?? current.price;
      const discount = (await restoredDiscount(current.id, restoredPrice, current.discount));
      (await run(`UPDATE orders SET driver_id = NULL, commission = NULL, price = ?, discount = ?, status = 'searching',
        job_alerted_at = COALESCE(job_alerted_at, ?), updated_at = ? WHERE id = ?`, restoredPrice, discount, now, now, current.id)); // back to the recommendation
      (await run('INSERT OR IGNORE INTO order_releases (order_id, driver_id, released_at) VALUES (?, ?, ?)', current.id, user.id, now));
      await rideLifecycle.clearAssignment(current.id);
      (await persistence.exec('COMMIT'));
      return current;
    } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  })();
  if (!order) return { ok: true };
  await queuePush([order.customerId!], 'released', order.id);
  if (order.service === 'ride' && dispatch.enabled()) { await dispatch.recordRelease(order.id, user.id); if (!(await dispatch.startRound(order.id))) (await newJobPush(order.service, order.id, order.customerId!, user.id)); }
  else (await newJobPush(order.service, order.id, order.customerId!, user.id)); // the releasing driver is excluded
  return { ok: true };
});

async function advanceOrder(user: User, id: number, body: Row) {
  const r = (await one('SELECT * FROM orders WHERE id = ?', id)) ?? fail(404, 'not_found');
  if (r.driver_id !== user.id || !activeStatuses.includes(r.status)) fail(409, 'cannot_advance');
  if (body.expectedStatus !== r.status) fail(409, 'order_changed');
  const next = nextStatus(r.status);
  if (next === r.status) fail(409, 'cannot_advance'); // on_hold waits for an administrator decision
  (await safetyFree(r.id));
  const now = Date.now();
  await rideLifecycle.guardAdvance(r, user.id, next, body.boardingCode !== undefined ? body.boardingCode : body.code, body.expectedPinRevision);
  if (next === 'completed' || next === 'returned') {
    // Delivery needs the recipient's handover code; a return needs the sender's return code.
    const expected = next === 'completed' ? r.handover_code : r.return_code;
    if (((await one('SELECT failures FROM proof_attempts WHERE order_id = ?', r.id))?.failures ?? 0) >= 5) fail(409, 'proof_locked');
    if (expected && String(body.code ?? '').trim() !== expected) {
      (await run(`INSERT INTO proof_attempts (order_id, failures) VALUES (?, 1) ON CONFLICT(order_id) DO UPDATE SET failures = proof_attempts.failures + 1`, r.id));
      (await run(`INSERT INTO security_events (actor_id, order_id, action, created_at) VALUES (?, ?, 'PROOF_FAILED', ?)`, user.id, r.id, now));
      if ((await one('SELECT failures FROM proof_attempts WHERE order_id = ?', r.id))?.failures === 5) await queuePush((await adminIds()), 'attention', r.id, '/admin/orders'); // the fifth miss locks it
      fail(400, 'wrong_code');
    }
    const rate = (await activePlan(user.id)) === 'pro' ? (await settings()).proCommission : (await settings()).commission;
    (await run('UPDATE orders SET status = ?, commission = ?, completed_at = ?, updated_at = ? WHERE id = ?',
      next, r.commission ?? commissionOn(r.price, rate), now, now, r.id));
    if (next === 'returned') (await run(`INSERT INTO security_events (actor_id, order_id, action, created_at) VALUES (?, ?, 'RETURN_COMPLETED', ?)`, user.id, r.id, now));
    else (await rewardReferral(r.id, now));
    await postOrderJournals(r.id); // T29: balanced commission/discount journals in the same transaction
  } else (await run('UPDATE orders SET status = ?, updated_at = ?, picked_up_at = COALESCE(picked_up_at, ?) WHERE id = ?', next, now, next === 'in_transit' ? now : null, r.id));
  await rideLifecycle.markVerified(r, next);
  if (next === 'at_pickup' || next === 'in_transit' || next === 'completed' || next === 'returned') await queuePush([r.customer_id], next, r.id);
  return (await getOrder(r.id, user));
}

async function reportException(user: User, id: number, body: Row) {
  const r = (await one('SELECT * FROM orders WHERE id = ?', id)) ?? fail(404, 'not_found');
  if (r.driver_id !== user.id || !['at_pickup', 'in_transit'].includes(r.status) || r.service === 'ride') fail(409, 'cannot_report');
  (await safetyFree(r.id));
  if (body.expectedStatus !== r.status) fail(409, 'order_changed');
  const now = Date.now();
  if (r.status === 'at_pickup') {
    // Nothing was collected, so there is nothing to hold or return: the pickup fails and the sender is told why.
    (await run("UPDATE orders SET status = 'cancelled', exception_reason = ?, updated_at = ? WHERE id = ?", body.reason, now, r.id));
    (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'PICKUP_FAILED', ?, ?)`,
      user.id, r.id, JSON.stringify({ reason: body.reason, note: text(body.note, 200, false) }), now));
    await queuePush([r.customer_id], 'cancelled', r.id);
    return (await getOrder(r.id, user));
  }
  (await run("UPDATE orders SET status = 'on_hold', exception_reason = ?, updated_at = ? WHERE id = ?", body.reason, now, r.id));
  (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'DELIVERY_EXCEPTION', ?, ?)`,
    user.id, r.id, JSON.stringify({ reason: body.reason, note: text(body.note, 200, false) }), now));
  await queuePush([r.customer_id], 'on_hold', r.id); // SPEC-exception-push.md
  await queuePush((await adminIds()), 'attention', r.id, '/admin/orders'); // support calls both sides and decides
  return (await getOrder(r.id, user));
}

route('POST', '/api/orders/:id/exception', async ({ user, params, body }) => {
  need(user, 'driver'); needActive(user);
  if (!exceptionReasons.includes(body.reason)) fail(400, 'invalid_input');
  text(body.note, 200, false);
  return (await driverCommand(user, Number(params[0]), body, reportException));
});

route('POST', '/api/admin/orders/:id/resolve', async ({ user, params, body }) => {
  need(user, 'admin');
  const reason = text(body.reason, 500);
  // confirm_return is the way out when the sender cannot give the code: support verifies the handback and records why.
  const from = { reattempt: 'on_hold', return: 'on_hold', confirm_return: 'returning' }[String(body.action)];
  const to = { reattempt: 'in_transit', return: 'returning', confirm_return: 'returned' }[String(body.action)] as PushKind;
  if (reason.length < 5 || !from) fail(400, 'invalid_input');
  const id = Number(params[0]);
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    const order = (await one('SELECT customer_id, driver_id, status FROM orders WHERE id = ?', id)) ?? fail(404, 'not_found');
    if (order.status !== from) fail(409, 'cannot_resolve');
    if (body.action === 'reattempt') (await run("UPDATE orders SET status = 'in_transit', updated_at = ? WHERE id = ?", Date.now(), id));
    else if (body.action === 'confirm_return') (await run("UPDATE orders SET status = 'returned', completed_at = ?, updated_at = ? WHERE id = ?", Date.now(), Date.now(), id));
    else {
      (await run("UPDATE orders SET status = 'returning', return_code = ?, updated_at = ? WHERE id = ?", String(randomInt(1000, 10000)), Date.now(), id));
      (await run('DELETE FROM proof_attempts WHERE order_id = ?', id)); // the return gets its own five attempts
    }
    (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'EXCEPTION_RESOLVED', ?, ?)`,
      user.id, id, JSON.stringify({ action: body.action, reason }), Date.now()));
    await queuePush([order.driver_id], 'decided', id); // SPEC-exception-push.md; ponytail: one generic line, the job card shows which decision
    await queuePush([order.customer_id], to, id);
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  return (await getOrder(id, user));
});

route('POST', '/api/orders/:id/advance', async ({ user, params, body }) => {
  need(user, 'driver'); needActive(user);
  return (await driverCommand(user, Number(params[0]), body, advanceOrder));
});

// Lost acknowledgements replay the stored outcome instead of applying a driver command twice.
async function driverCommand(user: User, id: number, body: Row, apply: (user: User, id: number, input: Row) => Promise<Order>) {
  const { requestId, ...input } = body;
  if (typeof requestId !== 'string' || !uuid.test(requestId)) fail(400, 'invalid_request_id');
  if (!activeStatuses.includes(input.expectedStatus)) fail(400, 'invalid_status');
  (await getOrder(id, user)); // reject nonexistent/inaccessible resources before storing a foreign-keyed outcome
  const hash = payloadHash({ ...input, id }); // unchanged shape keeps pre-release advance retries replayable
  let result: Order | undefined, failure: HttpError | undefined;
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    const saved = (await one('SELECT * FROM order_actions WHERE user_id = ? AND request_id = ?', user.id, requestId));
    if (saved) {
      if (saved.payload_hash !== hash) fail(409, 'idempotency_conflict');
      if (saved.error) failure = new HttpError(saved.http_status, saved.error);
      else result = (await getOrder(id, user)); // acknowledge the original action with the current authoritative state
    } else {
      try {
        if (input.recoveryProtocol !== undefined) {
          if (input.recoveryProtocol !== 1 || !Number.isSafeInteger(input.attemptCreatedAt) || !Number.isSafeInteger(input.attemptExpiresAt)
            || input.attemptExpiresAt <= input.attemptCreatedAt || input.attemptExpiresAt - input.attemptCreatedAt > 60 * 60_000
            || input.attemptCreatedAt > Date.now() + 5_000) fail(400, 'invalid_recovery_command');
          const current = await one(`SELECT * FROM orders WHERE id=?${persistence.backend === 'postgres' ? ' FOR UPDATE' : ''}`, id) ?? fail(404, 'not_found');
          const metadata = await recoveryMetadata(id);
          if (Date.now() >= input.attemptExpiresAt) fail(409, 'command_expired');
          if (input.expectedAssignedAt !== (current.assigned_at ?? null)
            || (metadata.assignmentEpoch !== null && input.expectedAssignmentEpoch !== metadata.assignmentEpoch)
            || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== metadata.version) fail(409, 'order_changed');
        }
        result = (await apply(user, id, input));
      }
      catch (error) { if (!(error instanceof HttpError)) throw error; failure = error; }
      (await run('INSERT INTO order_actions (user_id, request_id, payload_hash, order_id, http_status, error) VALUES (?, ?, ?, ?, ?, ?)',
        user.id, requestId, hash, id, failure?.status ?? 200, failure?.message ?? null));
    }
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  if (failure) { await flushPush(); throw failure; } // a refused command is still committed, so its queued pushes go out too
  return input.recoveryProtocol === 1 && result ? { ...result, recovery: await recoveryMetadata(id) } : result;
}

async function activeGpsAuthority(user: User, req: IncomingMessage) {
  if (process.env.NODE_ENV !== 'test' || process.env.WIND_TEST_ACTIVE_GPS !== '1') fail(409, 'active_gps_unavailable');
  if (persistence.backend !== 'postgres' || !await one('SELECT version FROM schema_migrations WHERE version=10')) fail(409, 'active_gps_unavailable');
  await all(`SELECT id FROM orders WHERE driver_id=? AND status IN (${activeSql}) ORDER BY id FOR UPDATE`, user.id);
  const token = /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')?.[1];
  if (!token || !await one(`SELECT u.id FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=? AND u.role='driver' AND u.status='active' AND s.token_hash=? AND s.created_at>? AND COALESCE(s.last_seen_at,s.created_at)>? FOR UPDATE OF u FOR SHARE OF s`, user.id, sha(token), Date.now() - SESSION_DAYS * DAY, Date.now() - SESSION_IDLE_DAYS * DAY)) fail(401, 'unauthorized');
  const assignments = await all(`SELECT id AS "orderId",assignment_epoch AS "assignmentEpoch" FROM orders WHERE driver_id=? AND status IN (${activeSql}) ORDER BY id FOR UPDATE`, user.id);
  return { tokenHash: sha(token!), assignments };
}
registerActiveGpsRoutes(route, async ({ user, body, req }) => {
  needActive(user); need(user, 'driver');
  await limit(identityKey('location_session', user.id), 30, 60_000);
  if (typeof body.deviceId !== 'string' || !uuid.test(body.deviceId)) fail(400, 'invalid_device');
  const authority = await activeGpsAuthority(user, req);
  const deviceHash = sha(body.deviceId.toLowerCase());
  await run('INSERT INTO driver_active_gps_generations(driver_id) VALUES (?) ON CONFLICT DO NOTHING', user.id);
  const generation = Number((await one('SELECT generation FROM driver_active_gps_generations WHERE driver_id=? FOR UPDATE', user.id))!.generation);
  const existing = await one('SELECT * FROM driver_active_gps_sessions WHERE driver_id=? FOR UPDATE', user.id);
  if (existing && (existing.auth_session_hash !== authority.tokenHash || existing.device_hash !== deviceHash)) fail(409, 'active_gps_session_conflict');
  if (body.sessionId === undefined && body.previousSessionId === undefined) return {sessionId: existing?.id ?? null, generation};
  if (typeof body.sessionId !== 'string' || !uuid.test(body.sessionId) || !Number.isSafeInteger(body.expectedGeneration) || body.expectedGeneration < 0 || !(body.previousSessionId === null || (typeof body.previousSessionId === 'string' && uuid.test(body.previousSessionId)))) fail(400, 'invalid_active_gps');
  if (!authority.assignments.length) fail(409, 'no_active_job');
  const sessionId = body.sessionId.toLowerCase();
  if (existing && existing.id === sessionId && (Number(existing.opened_generation) !== body.expectedGeneration || generation !== body.expectedGeneration + 1)) fail(409, 'active_gps_session_stale');
  if (existing?.id !== sessionId) {
    if (generation !== body.expectedGeneration || (existing?.id ?? null) !== (body.previousSessionId?.toLowerCase() ?? null)) fail(409, 'active_gps_session_stale');
    if (await one('SELECT id FROM driver_active_gps_session_ids WHERE id=?::uuid', sessionId)) fail(409, 'active_gps_session_stale');
    await run('INSERT INTO driver_active_gps_session_ids(id,driver_id) VALUES (?::uuid,?)', sessionId, user.id);
    await run(`INSERT INTO driver_active_gps_sessions(driver_id,id,auth_session_hash,device_hash,opened_generation) VALUES (?,?::uuid,?,?,?)
      ON CONFLICT(driver_id) DO UPDATE SET id=excluded.id,auth_session_hash=excluded.auth_session_hash,device_hash=excluded.device_hash,opened_generation=excluded.opened_generation,seq=0`, user.id, sessionId, authority.tokenHash, deviceHash, generation);
    await run('UPDATE driver_active_gps_generations SET generation=generation+1 WHERE driver_id=?', user.id);
    await run('DELETE FROM driver_locations WHERE driver_id=?', user.id);
  }
  const current = await one('SELECT seq FROM driver_active_gps_sessions WHERE driver_id=?', user.id);
  return { sessionId, generation: generation + (existing?.id === sessionId ? 0 : 1), seq: Number(current!.seq), assignments: authority.assignments };
});

route('POST', '/api/location', async ({ user, body, req }) => {
  needActive(user);
  need(user, 'driver');
  (await limit(identityKey('location', user.id), 60, 60_000)); // clients post at most every 2 s (MIN_GAP): 30 a minute
  // Serialize the ownership check with assignment changes and session revocation.
  // Authentication before reading the request body alone cannot protect a queued upload.
  if (persistence.backend === 'postgres' && body.activeGps === undefined) {
    await all(`SELECT id FROM orders WHERE driver_id = ? AND status IN (${activeSql}) ORDER BY id FOR UPDATE`, user.id);
    const token = /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!token || !await one(`SELECT u.id FROM users u JOIN sessions s ON s.user_id=u.id
      WHERE u.id=? AND u.role='driver' AND u.status='active' AND s.token_hash=? AND s.created_at>? AND COALESCE(s.last_seen_at,s.created_at)>?
      FOR SHARE OF u,s`, user.id, sha(token), Date.now() - SESSION_DAYS * DAY, Date.now() - SESSION_IDLE_DAYS * DAY)) fail(401, 'unauthorized');
  }
  if (body.activeGps !== undefined) {
    const fence = body.activeGps;
    if (!fence || typeof fence !== 'object' || Array.isArray(fence) || typeof fence.deviceId !== 'string' || !uuid.test(fence.deviceId)
      || typeof fence.sessionId !== 'string' || !uuid.test(fence.sessionId) || !Number.isSafeInteger(fence.seq) || fence.seq < 1
      || !Array.isArray(fence.assignments) || fence.assignments.some((a: Row) => !a || !Number.isSafeInteger(a.orderId) || !Number.isSafeInteger(a.assignmentEpoch) || a.assignmentEpoch < 0)) fail(400, 'invalid_active_gps');
    const authority = await activeGpsAuthority(user, req);
    const session = await one('SELECT * FROM driver_active_gps_sessions WHERE driver_id=? FOR UPDATE', user.id);
    if (!session || session.id !== fence.sessionId.toLowerCase() || session.device_hash !== sha(fence.deviceId.toLowerCase()) || session.auth_session_hash !== authority.tokenHash)
      return {ok:true,accepted:false,reason:'session_stale'};
    if (fence.seq <= Number(session.seq)) return {ok:true,accepted:false,reason:'sequence_old'};
    await run('UPDATE driver_active_gps_sessions SET seq=? WHERE driver_id=?', fence.seq, user.id);
    const sent = [...fence.assignments].sort((a: Row,b: Row) => a.orderId-b.orderId);
    if (sent.length !== authority.assignments.length || sent.some((a: Row,i: number) => a.orderId !== Number(authority.assignments[i].orderId) || a.assignmentEpoch !== Number(authority.assignments[i].assignmentEpoch)))
      return {ok:true,accepted:false,reason:'assignment_stale'};
  } else if (process.env.NODE_ENV === 'test' && process.env.WIND_TEST_ACTIVE_GPS === '1' && persistence.backend === 'postgres' && await one('SELECT version FROM schema_migrations WHERE version=10')
    && await one('SELECT driver_id FROM driver_active_gps_session_ids WHERE driver_id=? LIMIT 1', user.id)) {
    fail(409, 'active_gps_required');
  }
  // Legacy rows without an assignment time count as assigned at 0.
  const since = (await one(`SELECT MIN(COALESCE(assigned_at, 0)) since FROM orders WHERE driver_id = ? AND status IN (${activeSql})`, user.id))!.since;
  if (since == null) fail(409, 'no_active_job');
  const { latitude: lat, longitude: lng } = pointOf({ latitude: body.latitude, longitude: body.longitude })!;
  if (lat === 0 && lng === 0) fail(400, 'invalid_location'); // a location stub's default, never a road here
  // Optional extras for a better marker; devices report -1 or nothing when unknown.
  const heading = body.heading == null || body.heading === -1 ? null : finite(body.heading, 360, 0) ? body.heading : fail(400, 'invalid_location');
  const accuracy = body.accuracy == null || body.accuracy === -1 ? null : finite(body.accuracy, 5000, 0) ? body.accuracy : fail(400, 'invalid_location');
  // Devices send how old the fix is, not a clock time, so a wrong phone clock cannot reorder fixes.
  // Older builds send no age: their fixes are taken as current, as before.
  const age = body.age == null ? 0 : finite(body.age, 86_400_000, 0) ? Math.round(body.age) : fail(400, 'invalid_location');
  const fixAt = Date.now() - age;
  // A late upload must not move the driver backward. A fix timestamped up to 15 s before this
  // assignment is still accepted: location providers may batch a fix captured just before the
  // accept, and the marker upsert itself cannot move backward. Older fixes are dropped.
  // Still 2xx: a background task stops on 409, and newer fixes keep coming.
  if (age > 60_000 || fixAt < Number(since) - 15_000) return { ok: true, accepted: false };
  // A jump no vehicle can make (over 70 m/s, ~250 km/h, beyond both fixes' error) is a GPS outlier (urban multipath,
  // a network fix): keep the last good one. A more precise fix always wins.
  // Two yardsticks: the last *plausible* fix (good_*), which the reference follows, and the last displayed fix, which
  // catches the next real fix after a wild one won on accuracy (that froze the marker kilometres away for minutes).
  const last = (await one('SELECT lat, lng, updated_at, accuracy, good_lat, good_lng, good_at, good_acc FROM driver_locations WHERE driver_id = ?', user.id));
  const plausible = (ref: { lat: number; lng: number; at: number; accuracy: number | null } | null) => {
    if (!ref || fixAt <= ref.at) return false;
    const metres = crowKm({ latitude: ref.lat, longitude: ref.lng }, { latitude: lat, longitude: lng }) * 1000
      - (accuracy ?? 50) - (ref.accuracy ?? 50);
    return metres / Math.max(1, (fixAt - ref.at) / 1000) <= 70;
  };
  const reference = last ? (last.good_at != null
    ? { lat: last.good_lat, lng: last.good_lng, at: last.good_at, accuracy: last.good_acc }
    : { lat: last.lat, lng: last.lng, at: last.updated_at, accuracy: last.accuracy }) : null;
  const displayed = last ? { lat: last.lat, lng: last.lng, at: last.updated_at, accuracy: last.accuracy } : null;
  const outcome = !last ? 'ok'
    : plausible(reference) ? 'ok' // plausible: the reference moves on
    : plausible(displayed) ? 'bypass' // next to the fix on screen: real movement, not a new outlier
    : (accuracy ?? 50) < (reference?.accuracy ?? 50) ? 'bypass' // a more precise fix always wins
    : 'reject';
  if (outcome === 'reject') return { ok: true, accepted: false };
  // Only a plausible fix becomes the reference; a wild one may be shown, but it never becomes the yardstick.
  // The accuracy is stored as its effective value (an unreported accuracy is 50 m), so the reference never keeps a
  // stale accuracy from an earlier fix.
  const keep = outcome === 'ok' ? { lat, lng, at: fixAt, acc: accuracy ?? 50 } : { lat: null, lng: null, at: null, acc: null };
  // SQLite has no request-wide transaction: make the authorization and assignment
  // checks part of the write itself, so a queued fix cannot outlive either one.
  const locationArgs: SQLInputValue[] = [user.id, lat, lng, fixAt, heading, accuracy, keep.lat, keep.lng, keep.at, keep.acc];
  let source = 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  if (persistence.backend === 'sqlite') {
    const token = /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')?.[1] ?? fail(401, 'unauthorized');
    const checkedAt = Date.now();
    source = `SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE u.id = ? AND u.role = 'driver' AND u.status = 'active' AND s.token_hash = ?
        AND s.created_at > ? AND COALESCE(s.last_seen_at, s.created_at) > ?
        AND (? = 0 OR u.phone_verified_at IS NOT NULL OR u.email_verified_at IS NOT NULL OR u.approved_at IS NOT NULL)
        AND (? = 0 OR u.phone_verified_at IS NOT NULL)
    ) AND EXISTS (SELECT 1 FROM orders o WHERE o.driver_id = ? AND o.status IN (${activeSql})
      AND (o.assigned_at IS NULL OR o.assigned_at <= ? + 15000))`;
    locationArgs.push(user.id, sha(token), checkedAt - SESSION_DAYS * DAY, checkedAt - SESSION_IDLE_DAYS * DAY,
      contactVerificationRequired ? 1 : 0, production && !selfService ? 1 : 0, user.id, fixAt);
  }
  const written = (await run(`INSERT INTO driver_locations (driver_id, lat, lng, updated_at, heading, accuracy, good_lat, good_lng, good_at, good_acc)
    ${source}
    ON CONFLICT(driver_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, updated_at = excluded.updated_at, heading = excluded.heading, accuracy = excluded.accuracy,
      good_lat = COALESCE(excluded.good_lat, driver_locations.good_lat), good_lng = COALESCE(excluded.good_lng, driver_locations.good_lng),
      good_at = COALESCE(excluded.good_at, driver_locations.good_at), good_acc = COALESCE(excluded.good_acc, driver_locations.good_acc)
    WHERE excluded.updated_at > driver_locations.updated_at`,
  ...locationArgs));
  const accepted = Number(written.changes) > 0;
  if (!accepted && persistence.backend === 'sqlite' && !await authenticate(req)) fail(401, 'unauthorized');
  if (accepted) {
    // The watchers wait on the order, not on the driver: a reassignment wakes the same people.
    const affected = await all(`SELECT id FROM orders WHERE driver_id = ? AND status IN (${activeSql})`, user.id) as { id: number }[];
    // PG wraps the handler in an outer transaction. Wake after COMMIT so another reader
    // sees the new fix, and discard the wake if this mutation rolls back.
    persistence.defer(() => { for (const o of affected) fixWaiters.get(o.id)?.forEach(wake => wake()); });
  }
  return { ok: true, accepted };
});

// Push for the live map (Uber moved riders from polling to a server push channel for the same reason): a watcher's
// request waits here and returns as soon as the driver's next fix is stored, so the marker moves within network
// latency of the upload instead of up to a poll interval later. Held under the clients' 20 s request timeout.
// ponytail: in-process waiters, one API process; several instances need shared pub/sub (e.g. Redis) here.
const LIVE_HOLD = 12_000, LIVE_WATCHERS = 20, LIVE_TOTAL = 200; // per order, and in total: a link must not pin sockets
const fixWaiters = new Map<number, Set<() => void>>(); // keyed by order id: a reassignment wakes the same watchers
let liveTotal = 0;
// In-process observation for deterministic lifecycle tests; it exposes no coordinates or API route.
export const liveWatcherCount = (orderId: number) => fixWaiters.get(orderId)?.size ?? 0;
type LiveRead = { orderId: number; driverId: number | null; driverKey: string | null; fix: { updatedAt: number } | null };
async function liveFix(read: () => Promise<LiveRead>, query: URLSearchParams, req: IncomingMessage) {
  const since = Number(query.get('since')) || 0;
  const want = query.get('driver'); // the driver the client already shows: a fix from another car is never returned
  const now = (await read());
  if (want != null && want !== now.driverKey) return { driverLocation: null, driverKey: now.driverKey, driverChanged: true };
  // No live source (no driver, or a finished trip): answer at once instead of holding a socket for nothing.
  if (!now.driverId || !now.driverKey) return { driverLocation: null, driverKey: null };
  if (now.fix && now.fix.updatedAt > since) return { driverLocation: now.fix, driverKey: now.driverKey };
  const watchers = fixWaiters.get(now.orderId);
  if ((watchers?.size ?? 0) >= LIVE_WATCHERS || liveTotal >= LIVE_TOTAL) return { driverLocation: now.fix, driverKey: now.driverKey };
  await new Promise<void>(done => {
    const set = fixWaiters.get(now.orderId) ?? new Set();
    fixWaiters.set(now.orderId, set);
    liveTotal++;
    let finished = false;
    const finish = () => {
      if (finished) return; // the request and the socket can both close: the slot is freed once
      finished = true;
      clearTimeout(timer); set.delete(finish); req.socket.off('close', finish); req.off('close', finish); liveTotal--;
      if (!set.size && fixWaiters.get(now.orderId) === set) fixWaiters.delete(now.orderId);
      done();
    };
    const timer = setTimeout(finish, LIVE_HOLD);
    set.add(finish);
    req.socket.once('close', finish); // a watcher that left frees its slot at once
    req.once('close', finish); // so does a client that abandons the request but keeps the connection
  });
  // Re-read: access, status, freshness and the assigned driver are checked again before any coordinate goes out.
  const after = (await read());
  // The driver may have changed while the request was held: its position is not the one this client asked for.
  if (want != null && want !== after.driverKey) return { driverLocation: null, driverKey: after.driverKey, driverChanged: true };
  return { driverLocation: after.fix, driverKey: after.driverKey };
}

// Road routing (SPEC-routing-eta.md): self-hosted OSRM on the private network. Without it clients draw no route line.
const osrmUrl = process.env.OSRM_URL?.trim().replace(/\/$/, '');
let routingHealth: { healthy: boolean | null; checkedAt: number | null; reason: 'not_checked' | 'route_unavailable' | null } =
  { healthy: null, checkedAt: null, reason: 'not_checked' };
const routingTimeout = Math.min(10_000, Math.max(1000, Number(process.env.OSRM_TIMEOUT_MS) || 3000));
registerRoutingStatusRoutes(route, () => ({ provider: 'osrm', configured: !!osrmUrl, ...routingHealth,
  reason: osrmUrl ? routingHealth.reason : 'not_configured', timeoutMs: routingTimeout }), user => need(user, 'admin'));
type NavStep = { type: string; modifier?: string; name?: string; exit?: number; latitude: number; longitude: number };
type RoadRoute = { km: number; minutes: number; line: [number, number][]; avoids: string[]; through: string[]; closed: Point[]; provider: 'osrm'; calculatedAt: number; steps: NavStep[] };
type OsrmRoute = { distance: number; duration: number; line: [number, number][]; steps: NavStep[] };
const roadCache = new Map<string, { promise: Promise<RoadRoute>; points: number; calculatedAt?: number }>(); // least recently used evicted
let roadCachePoints = 0;
const ROAD_CACHE_POINTS = 200_000; // a budget, not an entry count: 2000 full-geometry routes would be ~500 MB
// Calibrated on Route 60 (2026-10-05): at 150 m a road 234 m away counted as clear yet may be the same junction; 250 m
// forced 94-minute detours where a 72-minute parallel road exists. Tune both with real checkpoint positions.
const CHECKPOINT_RADIUS = 200; // metres: a route this close to a closed checkpoint is taken to pass through it
const DETOUR_KM = [1, 2, 3, 5, 8]; // via points either side of a blocking checkpoint (10 parallel OSRM calls, cached)

async function osrmRoutes(points: Point[], extra = ''): Promise<OsrmRoute[]> {
  try {
    const res = await fetch(`${osrmUrl}/route/v1/driving/${points.map(p => `${p.longitude},${p.latitude}`).join(';')}?overview=full&geometries=geojson&steps=true${extra}`,
      { signal: AbortSignal.timeout(routingTimeout) });
    if (!res.ok) fail(503, 'route_unavailable');
    const j: any = await res.json();
    if (j?.code === 'NoRoute') {
      routingHealth = { healthy: true, checkedAt: Date.now(), reason: null };
      return [];
    }
    // An upstream error must not become a cached success containing null metrics or a line MapLibre cannot draw.
    const valid = (r: any) => typeof r?.distance === 'number' && Number.isFinite(r.distance) && r.distance >= 0
      && typeof r.duration === 'number' && Number.isFinite(r.duration) && r.duration >= 0
      && Array.isArray(r.geometry?.coordinates) && r.geometry.coordinates.length >= 2
      && r.geometry.coordinates.every((p: unknown) => Array.isArray(p) && p.length >= 2 && finite(p[0], 180) && finite(p[1], 90));
    if (j?.code !== 'Ok' || !Array.isArray(j.routes) || !j.routes.length || !j.routes.every(valid)) fail(503, 'route_unavailable');
    routingHealth = { healthy: true, checkedAt: Date.now(), reason: null };
    return j.routes
      .map((r: any) => ({ distance: r.distance, duration: r.duration, line: r.geometry.coordinates.map(([x, y]: number[]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]),
        // Turn-by-turn for the driver's banner; only /api/route?steps=1 sends them.
        steps: (Array.isArray(r.legs) ? r.legs : []).flatMap((leg: any) => Array.isArray(leg?.steps) ? leg.steps : []).flatMap((step: any) => {
          const [longitude, latitude] = Array.isArray(step?.maneuver?.location) ? step.maneuver.location : [];
          return finite(latitude, 90) && finite(longitude, 180) ? [{ type: String(step.maneuver.type ?? ''), latitude, longitude,
            ...(step.maneuver.modifier && { modifier: String(step.maneuver.modifier) }), ...(step.name && { name: String(step.name).slice(0, 80) }), ...(Number.isInteger(step.maneuver.exit) && { exit: step.maneuver.exit }) }] : [];
        }) }));
  } catch (error) {
    routingHealth = { healthy: false, checkedAt: Date.now(), reason: 'route_unavailable' };
    throw error;
  }
}

// Best road route (SPEC-checkpoint-routing.md): OSRM's fastest (car profile, multi-level Dijkstra), unless it crosses a
// checkpoint drivers report closed â€” then the fastest alternative or forced detour that stays clear of every closed one.
// A known driver heading is a bearing hint so the route starts the way the car moves. Full geometry: simplified lines
// cut corners through buildings at street zoom.
// The closed checkpoints a route must go around; one request reads the road state once and passes it on.
const closedCheckpoints = (state: RoadRow[]) => state.filter(r => r.status === 'closed' && r.point) as { id: number; name: string; point: Point }[];
const slowCheckpoints = (state: RoadRow[]) => state.filter(r => r.status === 'slow' && r.point) as { id: number; name: string; point: Point }[];
type CheckpointState = { closed: ReturnType<typeof closedCheckpoints>; slow: ReturnType<typeof slowCheckpoints> };
const checkpointsFor = (state: RoadRow[]): CheckpointState => ({ closed: closedCheckpoints(state), slow: slowCheckpoints(state) });
async function roadRoute(a: Point, b: Point, heading: number | null = null, checkpoints?: CheckpointState): Promise<RoadRoute> {
  if (!osrmUrl) fail(503, 'route_unavailable');
  // ~10 m rounding: nearby fixes share one request and one cached answer.
  const round = (p: Point) => ({ latitude: Math.round(p.latitude * 1e4) / 1e4, longitude: Math.round(p.longitude * 1e4) / 1e4 });
  a = round(a); b = round(b);
  const at = (p: Point) => `${p.longitude},${p.latitude}`;
  const hint = heading == null ? null : Math.round(heading / 15) * 15 % 360;
  // A new closure, or a closed checkpoint moved on the map, re-routes at once.
  checkpoints ??= checkpointsFor(await roads());
  const { closed, slow } = checkpoints;
  const key = `${at(a)};${at(b)}|${hint}|${closed.map(c => `c${c.id}@${at(c.point)}`).join(',')}|${slow.map(c => `s${c.id}@${at(c.point)}`).join(',')}`;
  let found = roadCache.get(key);
  if (found?.calculatedAt !== undefined && Date.now() >= found.calculatedAt + 30_000) {
    roadCachePoints -= found.points; roadCache.delete(key); found = undefined;
  }
  if (found) { roadCache.delete(key); roadCache.set(key, found); } // recently used stays: the trip line outlives driver churn
  else {
    const promise: Promise<RoadRoute> = (async () => {
      const routes = await osrmRoutes([a, b], `&alternatives=3${hint == null ? '' : `&bearings=${hint},60;`}`);
      if (!routes.length) throw new HttpError(404, 'no_route');
      const crossed = (r: OsrmRoute) => closed.filter(c => nearLine(c.point, r.line, CHECKPOINT_RADIUS));
      const slowCrossed = (r: OsrmRoute) => slow.filter(c => nearLine(c.point, r.line, CHECKPOINT_RADIUS));
      // The same delay the fare model charges: a reported slow checkpoint makes a
      // slightly longer clear route the better ETA, not only the cheaper fare.
      const delay = (r: OsrmRoute) => checkpointDelaySeconds(slowCrossed(r).length);
      const fastest = routes[0], blocked = crossed(fastest);
      let chosen = bestRoute(routes, delay) ?? fastest;
      if (blocked.length) {
        const usable = (r: OsrmRoute) => !crossed(r).length && !backtracks(r.line); // no out-and-back to a dead-end via point
        let options = routes.filter(usable);
        if (!options.length) {
          // Perpendicular to the route at the first blocking checkpoint, 1â€“8 km to either side.
          const c = blocked[0].point, gap = (p: [number, number]) => Math.hypot(p[0] - c.longitude, p[1] - c.latitude);
          const i = fastest.line.reduce((best, p, k) => gap(p) < gap(fastest.line[best]) ? k : best, 0); // route point nearest the checkpoint
          const p1 = fastest.line[Math.max(0, i - 3)], p2 = fastest.line[Math.min(fastest.line.length - 1, i + 3)];
          const kx = 111_320 * Math.cos(c.latitude * Math.PI / 180), dx = (p2[0] - p1[0]) * kx, dy = (p2[1] - p1[1]) * 110_540, n = Math.hypot(dx, dy) || 1;
          const vias = DETOUR_KM.flatMap(km => [1, -1].map(side => ({
            latitude: c.latitude + side * (dx / n) * km * 1000 / 110_540, longitude: c.longitude - side * (dy / n) * km * 1000 / kx })));
          const detours = await Promise.all((await Promise.all(vias.map(async v => osrmRoutes([a, v, b], hint == null ? '' : `&bearings=${hint},60;;`).then(r => r[0], () => undefined)))));
          options = detours.filter((r): r is OsrmRoute => !!r && usable(r));
        }
        chosen = bestRoute(options, delay) ?? fastest;
      }
      const through = crossed(chosen), slowOn = slowCrossed(chosen);
      return { calculatedAt: Date.now(), km: Math.round(chosen.distance / 100) / 10, minutes: expectedMinutes(chosen.duration, slowOn.length), line: chosen.line, steps: chosen.steps,
        avoids: blocked.filter(c => !through.includes(c)).map(c => c.name), through: through.map(c => c.name), provider: 'osrm' as const,
        closed: [...new Set([...blocked, ...through])].map(c => c.point) }; // drawn as no-entry markers
    })().catch(error => { if (roadCache.get(key)?.promise === promise) roadCache.delete(key); throw error instanceof HttpError ? error : new HttpError(503, 'route_unavailable'); });
    found = { promise, points: 0 };
    roadCache.set(key, found);
    const entry = found;
    found.promise.then(route => { // the geometry is only known once OSRM answered: count it, then trim the cache
      if (roadCache.get(key) !== entry) return; // evicted while it was pending: it counts for nothing
      entry.points = route.line.length; entry.calculatedAt = route.calculatedAt;
      roadCachePoints += route.line.length;
      for (const [old, cached] of roadCache) {
        if (roadCachePoints <= ROAD_CACHE_POINTS) break;
        if (old === key) continue;
        roadCachePoints -= cached.points;
        roadCache.delete(old);
      }
    }, () => undefined);
  }
  return found.promise;
}
const queryPoint = (value: string | null) => {
  const [lat, lng] = (value ?? '').split(',').map(Number);
  return pointOf({ latitude: lat, longitude: lng })!;
};
route('GET', '/api/route', async ({ user, query }) => {
  (await limit(identityKey('route', user.id), 120, 10 * 60_000));
  const heading = query.get('heading') == null ? null : Number(query.get('heading'));
  if (heading != null && !(heading >= 0 && heading < 360)) fail(400, 'invalid_heading');
  const { calculatedAt, steps, ...line } = await roadRoute(queryPoint(query.get('from')), queryPoint(query.get('to')), heading);
  const result = query.get('steps') === '1' ? { ...line, steps } : line;
  return query.get('journeyProtocol') === '1' ? { ...result, eta: etaProjection(result.minutes * 60, calculatedAt, calculatedAt + 30_000) } : result;
});

// Map search (real OpenStreetMap places, server/domain/place-search.ts).
registerPlaceSearchRoutes(route, { fail, limit, limitKey: id => identityKey('place-search', id) }, process.env.GEOCODER_URL || undefined);
registerPlaceIndexRoutes(route, { fail, limit, limitKey: id => identityKey('place-suggest', id) });

// T07/T08 Google display-route proxy: budgets, validation and the HTTP boundary live in the domain
// module; fares, feasibility and checkpoint policy keep reading the OSRM route, so it never sets money.
const googleRoutes = createGoogleRoutes({ apiKey: process.env.GOOGLE_MAPS_SERVER_KEY });
registerGoogleRouteRoutes(route, googleRoutes, { fail, limit, budgetKey: id => identityKey('google-route', id) });



// Public trip page: minutes and road lines from the fresh driver fix to the next stop's city (it never sees exact pins).
route('GET', '/api/track/([a-f0-9]{64})/eta', async ({ params, query }) => {
  const token = params[0]!, hash = sha(token);
  const { row: r } = await trackView(token); // validate the link and reuse the same snapshot
  (await limit(identityKey('track-eta', hash), 300, 10 * 60_000)); // after one lookup (a made-up token leaves no row)
  const driverKey = r.driver_id ? createHmac('sha256', shareRefKey).update(`${token}:${r.driver_id}`).digest('hex').slice(0, 12) : null;
  if (query.has('driver') && query.get('driver') !== driverKey) return { minutes: null };
  if (query.has('status') && query.get('status') !== r.status) return { minutes: null };
  if (!activeStatuses.includes(r.status) || r.loc_lat == null || Date.now() - r.loc_at > 120_000) return { minutes: null };
  // The age of the fix the estimate starts from: a two-minute-old position is not a two-minute-old answer.
  const fixAgeSeconds = Math.max(0, Math.round((Date.now() - r.loc_at) / 1000));
  // The road state is read once for this request: three routes and the delay flag all use it.
  const roadState = (await roads()), checkpoints = checkpointsFor(roadState);
  // ponytail: no stop order on a multi-parcel run, so no minutes and no straight-to-you line (SPEC-courier-run-eta.md).
  if (r.shared_run) {
    const road = await roadRoute(city(r.pickup_city), city(r.dropoff_city), null, checkpoints).then(t => t.line, () => null);
    const current = await trackView(token);
    if (current.row.pickup_city !== r.pickup_city || current.row.dropoff_city !== r.dropoff_city) return { minutes: null };
    if (current.view.driver?.ref !== driverKey || current.view.status !== r.status) return { minutes: null, road, fixAgeSeconds, fixUpdatedAt: r.loc_at };
    return { minutes: null, sharedRun: true, road, fixAgeSeconds, fixUpdatedAt: r.loc_at };
  }
  const next = city(['in_transit', 'on_hold'].includes(r.status) ? r.dropoff_city : r.pickup_city);
  // Checkpoint delays as a flag only: the public page never names places beyond the two cities (SPEC-road-aware-eta.md).
  const delayed = roadAlerts(roadState, r.pickup_city, r.dropoff_city).length > 0;
  // Road lines between city centres and from the (already shown) driver fix: nothing beyond what the page already reveals.
  const trip = roadRoute(city(r.pickup_city), city(r.dropoff_city), null, checkpoints).then(t => t.line, () => null);
  // A fix off any road (or OSRM down) gives no minutes, not an error: the page still shows the car and the trip line.
  const leg = Promise.resolve().then(async () => (await roadRoute({ latitude: r.loc_lat, longitude: r.loc_lng }, next, r.loc_heading ?? null, checkpoints))).catch(() => null);
  const [approach, line] = await Promise.all([leg, trip]);
  const current = await trackView(token);
  if (current.row.pickup_city !== r.pickup_city || current.row.dropoff_city !== r.dropoff_city) return { minutes: null };
  if (current.view.driver?.ref !== driverKey || current.view.status !== r.status) return { minutes: null, road: line, fixAgeSeconds, fixUpdatedAt: r.loc_at };
  if (query.get('journeyProtocol') === '1') {
    const now = Date.now(), fixExpiry = Number(r.loc_at) + 30_000;
    const valid = current.row.loc_at === r.loc_at && !current.row.shared_run && now < fixExpiry && Number(r.loc_at) <= now;
    const eta = valid && approach ? etaProjection(approach.minutes * 60, approach.calculatedAt, Math.min(approach.calculatedAt + 30_000, fixExpiry), now) : undefined;
    return { minutes: eta ? approach!.minutes : null, ...(eta ? { eta, approach: approach!.line } : {}), delayed, road: line, fixAgeSeconds, fixUpdatedAt: r.loc_at };
  }
  return approach ? { minutes: approach.minutes, delayed, approach: approach.line, road: line, fixAgeSeconds, fixUpdatedAt: r.loc_at }
    : { minutes: null, delayed, road: line, fixAgeSeconds, fixUpdatedAt: r.loc_at };
}, true);

route('GET', '/api/driver/earnings', async ({ user }) => {
  need(user, 'driver');
  const since = async (from: number) => {
    const r = (await one(`SELECT COUNT(*) jobs, COALESCE(SUM(price), 0) gross, COALESCE(SUM(commission), 0) commission
      FROM orders WHERE driver_id = ? AND status IN (${finishedSql}) AND completed_at >= ?`, user.id, from))!;
    return { jobs: r.jobs, gross: r.gross, commission: r.commission, net: Math.round((r.gross - r.commission) * 100) / 100 };
  };
  const midnight = new Date().setHours(0, 0, 0, 0);
  return { today: (await since(midnight)), week: (await since(Date.now() - 7 * DAY)), all: (await since(0)) };
});

// Cash settlement: drivers collect every fare in cash and owe Wind the commission snapshot of each finished job.
// The ledger is append-only; a handover counts only after the driver confirms it (two-person check).
async function cashBalances(where: string, ...params: SQLInputValue[]) {
  const sum = (filter: string) => `COALESCE((SELECT SUM(amount_cents) FROM cash_entries e WHERE e.driver_id = u.id AND ${filter}), 0)`;
  const minor = (column: 'commission' | 'discount') => persistence.backend === 'postgres' ? `${column}_minor` : `CAST(ROUND(${column} * 100) AS INTEGER)`;
  return (await all(`SELECT u.id, u.name, u.phone,
    COALESCE((SELECT SUM(${minor('commission')}) FROM orders WHERE driver_id = u.id AND status IN (${finishedSql})), 0) commission,
    COALESCE((SELECT SUM(${minor('discount')}) FROM orders WHERE driver_id = u.id AND status IN (${finishedSql})), 0) discounts,
    ${sum("kind = 'adjustment'")} adjustments, ${sum("kind = 'remittance' AND status = 'confirmed'")} remitted,
    ${sum("kind = 'remittance' AND status = 'pending'")} pending,
    (SELECT MAX(created_at) FROM cash_entries e WHERE e.driver_id = u.id AND kind = 'remittance') last_remittance
    FROM users u WHERE u.role = 'driver' AND u.phone NOT LIKE 'deleted-%' AND ${where}`, ...params))
    .map(r => ({ driverId: r.id as number, name: r.name as string, phone: r.phone as string,
      commissionCents: r.commission as number, discountsCents: r.discounts as number, adjustmentsCents: r.adjustments as number, remittedCents: r.remitted as number,
      // Promo discounts are Wind's cost: the driver collected that much less cash, so it comes off what they owe.
      pendingCents: r.pending as number, owedCents: cashOwed(r.commission, r.discounts, r.adjustments, r.remitted), lastRemittanceAt: (r.last_remittance as number) ?? null }));
}
// A driver leaves the ledger (deletion or role change) only once nothing is owed or waiting for confirmation.
async function cashSettled(userId: number) {
  const balance = (await cashBalances('u.id = ?', userId))[0];
  if (balance && (balance.owedCents !== 0 || balance.pendingCents > 0)) fail(409, 'cash_outstanding');
}
const cashEntry = (r: Row) => ({ id: r.id, kind: r.kind, amountCents: r.amount_cents, note: r.note, status: r.status,
  reference: r.kind === 'remittance' ? `R-${String(r.id).padStart(6, '0')}` : null, createdAt: r.created_at, decidedAt: r.decided_at ?? null });
// T25: administrator resolution of pending cash handovers (additive module owns its route declarations).
registerCashOpsRoutes(route, { one, all, run, fail, need, text, cashEntry, queuePush, postCashJournal });

route('GET', '/api/driver/cash', async ({ user, query }) => {
  need(user, 'driver');
  const { owedCents, pendingCents, commissionCents, discountsCents, remittedCents, adjustmentsCents } = (await cashBalances('u.id = ?', user.id))[0]!;
  const protocol = query.get('protocol') === '1' ? { durableCommands: persistence.backend === 'postgres', currency: 'ILS',
    entries: persistence.backend === 'postgres' ? await all('SELECT id,version,amount_cents AS amountCents FROM cash_entries WHERE driver_id=? AND status=\'pending\' ORDER BY id LIMIT 100',user.id) : [] } : undefined;
  return { owedCents, pendingCents, commissionCents, discountsCents, remittedCents, adjustmentsCents, ...(protocol ? { protocol } : {}),
    // The latest 50, plus every handover still waiting on the courier, so an older one is never lost behind newer history.
    entries: (await all(`SELECT * FROM cash_entries WHERE driver_id = ? AND (status = 'pending' OR id >= COALESCE(
      (SELECT id FROM cash_entries WHERE driver_id = ? ORDER BY id DESC LIMIT 1 OFFSET 49), 0)) ORDER BY id DESC`, user.id, user.id)).map(cashEntry) };
});

route('POST', '/api/driver/cash/:id/confirm', async ({ user, params, body }) => {
  need(user, 'driver');
  if (!['confirm', 'dispute'].includes(body.decision)) fail(400, 'invalid_input');
  const entry = (await one("SELECT * FROM cash_entries WHERE id = ? AND driver_id = ? AND kind = 'remittance'", Number(params[0]), user.id)) ?? fail(404, 'not_found');
  if (!(await run("UPDATE cash_entries SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'",
    body.decision === 'confirm' ? 'confirmed' : 'disputed', Date.now(), entry.id)).changes) fail(409, 'already_decided');
  if (body.decision === 'dispute') await queuePush([entry.recorded_by], 'attention', 0, '/admin/cash'); // the admin who recorded it decides
  else await postCashJournal(entry.id); // T30: the confirmed handover settles in the same transaction
  return cashEntry((await one('SELECT * FROM cash_entries WHERE id = ?', entry.id))!);
});

route('GET', '/api/admin/cash', async ({ user }) => {
  need(user, 'admin');
  return (await cashBalances('1 = 1')).sort((a, b) => b.owedCents - a.owedCents || a.driverId - b.driverId);
});


async function recordCash(user: User, body: Row, kind: 'remittance' | 'adjustment') {
  need(user, 'admin');
  const amount = body.amountCents;
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) fail(400, 'invalid_amount');
  const note = kind === 'adjustment' ? text(body.reason, 500) : text(body.note, 200, false);
  if (kind === 'adjustment' && note.length < 5) fail(400, 'invalid_input');
  // A retried form replays the entry it already recorded instead of booking the cash twice.
  // ponytail: optional so an older admin build still records; require it once every admin runs this one.
  const requestId = body.requestId ?? null;
  if (requestId !== null && (typeof requestId !== 'string' || !uuid.test(requestId))) fail(400, 'invalid_request_id');
  const saved = requestId && (await one('SELECT * FROM cash_entries WHERE request_id = ?', requestId));
  if (saved) {
    if (saved.driver_id !== Number(body.driverId) || saved.kind !== kind || saved.amount_cents !== amount) fail(409, 'idempotency_conflict');
    return cashEntry(saved);
  }
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    if (persistence.backend === 'postgres') await one('SELECT id FROM users WHERE id=? FOR UPDATE', Number(body.driverId));
    const balance = (await cashBalances('u.id = ?', Number(body.driverId)))[0] ?? fail(404, 'not_found');
    // No overpayment, and no adjustment that turns a debt into a payout (payouts are out of scope).
    if (kind === 'remittance' && (amount < 0 || amount > balance.owedCents - balance.pendingCents)) fail(400, 'invalid_amount');
    if (kind === 'adjustment' && balance.owedCents - balance.pendingCents + amount < 0) fail(400, 'invalid_amount');
    // T23 fail-closed dual control: forgiving debt binds to an approved request decided by a different
    // finance approver, never to the recording admin; a backend that cannot host the approval protocol
    // rejects instead of forgiving. Amount/subject binding re-checks happen in T24's atomic execution.
    if (kind === 'adjustment' && amount < 0) {
      const approvalId = Number(body.approvalId);
      if (!Number.isSafeInteger(approvalId) || approvalId < 1) fail(409, 'approval_required');
      let approval: Row | undefined;
      try { approval = await one('SELECT * FROM financial_approvals WHERE id = ?', approvalId); }
      catch { fail(503, 'approval_unsupported'); }
      if (!approval || approval.subject_type !== 'cash_adjustment' || approval.subject_id !== String(Number(body.driverId))
        || Number(approval.amount_minor) !== -amount || approval.status !== 'approved' || approval.decided_by == null
        || Number(approval.decided_by) === Number(approval.requested_by) || Number(approval.decided_by) === user.id)
        fail(409, 'approval_required');
      // T24: the decision is spent exactly once, in the same transaction as the cash entry — a second
      // request (new requestId) holding the same approval finds it consumed and is refused.
      if (persistence.backend === 'postgres' &&
        !(await run("UPDATE financial_approvals SET consumed_at = ? WHERE id = ? AND status = 'approved' AND consumed_at IS NULL", Date.now(), approvalId)).changes)
        fail(409, 'approval_used');
    }
    const id = Number((await run('INSERT INTO cash_entries (driver_id, kind, amount_cents, note, status, recorded_by, created_at, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      balance.driverId, kind, amount, note, kind === 'remittance' ? 'pending' : 'confirmed', user.id, Date.now(), requestId)).lastInsertRowid);
    if (kind === 'adjustment') await postCashJournal(id); // T30: adjustments settle as they are recorded
    await queuePush([balance.driverId], 'cash', 0, '/driver/earnings');
    (await persistence.exec('COMMIT'));
    return cashEntry((await one('SELECT * FROM cash_entries WHERE id = ?', id))!);
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
}
route('POST', '/api/admin/cash/remittance', async ({ user, body }) => (await recordCash(user, body, 'remittance')));
route('POST', '/api/admin/cash/adjustment', async ({ user, body }) => (await recordCash(user, body, 'adjustment')));

// Subscriptions: requested in-app, paid in cash / bank transfer, activated by an admin.
route('POST', '/api/subscriptions', async ({ user }) => {
  const plan = planForRole[user.role] ?? fail(403, 'forbidden');
  if ((await latestSubscription(user.id))) fail(409, 'already_subscribed');
  const s = (await settings());
  try {
    (await run("INSERT INTO subscriptions (user_id, plan, status, price, created_at) VALUES (?, ?, 'pending', ?, ?)",
      user.id, plan, plan === 'plus' ? s.plusPrice : s.proPrice, Date.now()));
  } catch (error) {
    // T22: a concurrent double tap committed its pending row first; the unique index turns it into one record.
    if ((error as { code?: string }).code === '23505') fail(409, 'already_subscribed');
    throw error;
  }
  await queuePush((await adminIds()), 'attention', 0, '/admin/subscriptions');
  return (await me(user));
});

// Admin
route('POST', '/api/admin/orders/:id/proof-reset', async ({ user, params, body }) => {
  need(user, 'admin');
  const reason = text(body.reason, 500);
  if (reason.length < 5) fail(400, 'invalid_input');
  const order = (await getOrder(Number(params[0]), user));
  if (!['in_transit', 'returning'].includes(order.status)) fail(409, 'cannot_advance');
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    (await run('DELETE FROM proof_attempts WHERE order_id = ?', order.id));
    (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'PROOF_RESET', ?, ?)`, user.id, order.id, JSON.stringify({ reason }), Date.now()));
    await queuePush([order.driverId ?? null], 'support', order.id); // the driver can enter the code again
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  return { ok: true };
});
route('GET', '/api/admin/stats', async ({ user }) => {
  need(user, 'admin');
  const orders = (await one(`SELECT COUNT(*) completed, COALESCE(SUM(price), 0) gmv, COALESCE(SUM(commission), 0) commission,
    COALESCE(SUM(discount), 0) discounts FROM orders WHERE status IN (${finishedSql})`))!;
  const subs = (await one("SELECT COUNT(*) count, COALESCE(SUM(price), 0) revenue FROM subscriptions WHERE activated_at IS NOT NULL"))!;
  // Calendar days in server local time (set TZ), built with setDate so DST changes don't shift the buckets.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 13);
  const boundaries = Array.from({ length: 15 }, (_, i) => new Date(start).setDate(start.getDate() + i));
  const daily = boundaries.slice(0, 14).map(ms => ({ date: new Date(ms).toLocaleDateString('en-CA'), commission: 0, subscriptions: 0 }));
  // Group in the database instead of formatting every historical row on the event loop.
  // Boundaries are local midnights, so a 23- or 25-hour DST day remains one bucket.
  const bucketCase = (column: string) => `CASE ${boundaries.slice(1, 14).map((_, i) => `WHEN ${column} < ? THEN ${i}`).join(' ')} ELSE 13 END`;
  const params = [...boundaries.slice(1, 14), boundaries[0], boundaries[14]];
  const commissions = await all(`SELECT ${bucketCase('completed_at')} bucket, COALESCE(SUM(commission), 0) amount
    FROM orders WHERE status IN (${finishedSql}) AND completed_at >= ? AND completed_at < ? GROUP BY bucket`, ...params);
  const subscriptions = await all(`SELECT ${bucketCase('activated_at')} bucket, COALESCE(SUM(price), 0) amount
    FROM subscriptions WHERE activated_at >= ? AND activated_at < ? GROUP BY bucket`, ...params);
  for (const row of commissions) daily[Number(row.bucket)].commission = Number(row.amount);
  for (const row of subscriptions) daily[Number(row.bucket)].subscriptions = Number(row.amount);
  return {
    gmv: orders.gmv, commission: orders.commission, subscriptions: subs.revenue, discounts: orders.discounts,
    // Promo discounts are Wind's cost (the driver's ledger credits them), so they come off the profit.
    profit: orders.commission - orders.discounts + subs.revenue,
    completed: orders.completed, activeSubscriptions: (await one("SELECT COUNT(*) n FROM subscriptions WHERE status = 'active' AND ends_at > ?", Date.now()))!.n,
    statuses: Object.fromEntries((await all('SELECT status, COUNT(*) n FROM orders GROUP BY status')).map(r => [r.status, r.n])),
    services: Object.fromEntries((await all(`SELECT service, COUNT(*) n FROM orders WHERE status IN (${finishedSql}) GROUP BY service`)).map(r => [r.service, r.n])),
    users: Object.fromEntries((await all('SELECT role, COUNT(*) n FROM users GROUP BY role')).map(r => [r.role, r.n])),
    pendingDrivers: (await one("SELECT COUNT(*) n FROM users WHERE role = 'driver' AND status = 'pending'"))!.n,
    pendingSubscriptions: (await one("SELECT COUNT(*) n FROM subscriptions WHERE status = 'pending'"))!.n,
    openIncidents: (await one("SELECT COUNT(*) n FROM safety_incidents WHERE status = 'open'"))!.n,
    daily,
  };
});

route('GET', '/api/admin/users', async ({ user, query }) => {
  need(user, 'admin');
  const role = query.get('role'), q = `%${query.get('q') ?? ''}%`;
  const search = ['name','phone','email'].map(column => `${column} ${persistence.backend === 'postgres' ? "ILIKE ? ESCAPE ''" : 'LIKE ?'}`).join(' OR ');
  return (await Promise.all((await all(`SELECT * FROM users WHERE (? IS NULL OR role = ?) AND (${search}) AND phone NOT LIKE 'deleted-%' AND phone NOT LIKE 'partner:%'
    ORDER BY status = 'pending' DESC, id DESC LIMIT 200`, role, role, q, q, q)).map(toUser)));
});

// The partner:souq account owns every Souq delivery, so the admin user routes never list, edit, reset or delete it.
const editUser: Handler = async ({ user, params, body }) => {
  need(user, 'admin');
  const target = (await one("SELECT * FROM users WHERE id = ? AND phone NOT LIKE 'deleted-%' AND phone NOT LIKE 'partner:%'", Number(params[0]))) ?? fail(404, 'not_found');
  if (target.role === 'admin') fail(409, 'cannot_change_admin');
  const name = body.name === undefined ? target.name : text(body.name, 60);
  const phone = body.phone === undefined ? target.phone : normalizePhone(String(body.phone)) ?? fail(400, 'invalid_phone');
  const email = body.email === undefined ? target.email ?? null : body.email === null || body.email === '' ? null : normalizeEmail(body.email) ?? fail(400, 'invalid_email');
  let status = body.status === undefined ? target.status : ['active', 'pending', 'blocked'].includes(body.status) ? body.status : fail(400, 'invalid_status');
  const role = body.role === undefined ? target.role : ['customer', 'driver'].includes(body.role) ? body.role : fail(400, 'invalid_role');
  const vehicle = role === 'driver' ? vehicles.includes(body.vehicle ?? target.vehicle ?? 'car') ? body.vehicle ?? target.vehicle ?? 'car' : fail(400, 'invalid_vehicle') : null;
  const plate = role === 'driver' ? (body.plate === undefined ? target.plate ?? null : text(body.plate, 12, false) || null) : null;
  if ((await one('SELECT id FROM users WHERE phone = ? AND id <> ?', phone, target.id))) fail(409, 'phone_taken');
  if (email && (await one('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id <> ?', email, target.id))) fail(409, 'email_taken');
  const identityChanged = phone !== target.phone || email !== (target.email ?? null);
  const roleChanged = role !== target.role;
  const vehicleChanged = vehicle !== target.vehicle;
  const identityOrRoleChange = identityChanged || roleChanged || vehicleChanged || (status !== target.status && status === 'pending');
  if (selfService && role === 'driver' && (identityChanged || roleChanged || vehicleChanged) && status === 'active') status = 'pending';
  if (production && selfService && role === 'driver' && status === 'active' && !target.approved_at) fail(409, 'pending_approval');
  let carrying: Row[] = [];
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    // Re-checked inside the write transaction: a job accepted after the reads above must not be stranded by this edit.
    if (identityOrRoleChange &&
      (await one(`SELECT id FROM orders WHERE (driver_id = ? AND status IN (${activeSql})) OR (customer_id = ? AND status IN ('searching',${activeSql}))`, target.id, target.id))) fail(409, 'active_orders');
    if (roleChanged && target.role === 'driver') (await cashSettled(target.id));
    // Blocking a courier mid-job must not strand what they carry, and support says so explicitly (recovery: 'return').
    if (target.role === 'driver' && status === 'blocked' && target.status !== 'blocked') {
      carrying = (await all(`SELECT id, status, service, customer_id, price, discount, recommended_price FROM orders WHERE driver_id = ? AND status IN (${activeSql})`, target.id));
      if (carrying.length && body.recovery !== 'return') fail(409, 'carrying_parcels');
    }
    (await run(`UPDATE users SET name = ?, phone = ?, email = ?, status = ?, role = ?, vehicle = ?, plate = ?,
      phone_verified_at = ?, email_verified_at = ?, approved_at = ? WHERE id = ?`,
      name, phone, email, status, role, vehicle, plate, phone !== target.phone ? null : target.phone_verified_at ?? null,
      email !== (target.email ?? null) ? null : target.email_verified_at ?? null,
      identityChanged || roleChanged || vehicleChanged ? null : target.approved_at ?? null, target.id));
    if (roleChanged) {
      // Keep paid revenue history, but end benefits belonging to the previous role.
      (await run("UPDATE subscriptions SET ends_at = MIN(ends_at, ?) WHERE user_id = ? AND status = 'active'", Date.now(), target.id));
      (await run("UPDATE subscriptions SET status = 'rejected' WHERE user_id = ? AND status = 'pending'", target.id));
    }
    if (body.status !== undefined || identityChanged || roleChanged || vehicleChanged) (await run('DELETE FROM sessions WHERE user_id = ?', target.id));
    const now = Date.now();
    const auditFields = [
      name !== target.name ? 'name' : null,
      phone !== target.phone ? 'phone' : null,
      email !== (target.email ?? null) ? 'email' : null,
      status !== target.status ? 'status' : null,
      roleChanged ? 'role' : null,
      vehicle !== (target.vehicle ?? null) ? 'vehicle' : null,
      plate !== (target.plate ?? null) ? 'plate' : null,
    ].filter(Boolean);
    if (auditFields.length) (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, NULL, 'USER_UPDATED', ?, ?)`,
      user.id, JSON.stringify({ targetId: target.id, fields: auditFields, identityChanged, roleChanged }), now));
    for (const o of carrying) {
      if (o.status === 'assigned' || o.status === 'at_pickup') { // not collected yet: back to the pool, as a release would
        const backPrice = (o.recommended_price ?? o.price) as number;
        const backDiscount = (await restoredDiscount(Number(o.id), backPrice, o.discount as number | null));
        (await run(`UPDATE orders SET driver_id = NULL, commission = NULL, price = ?, discount = ?, status = 'searching',
          job_alerted_at = COALESCE(job_alerted_at, ?), updated_at = ? WHERE id = ?`, backPrice, backDiscount, now, now, o.id));
      }
      else if (o.status !== 'returning') { // in custody: support recovers it and confirms the return to the sender
        (await run("UPDATE orders SET status = 'returning', return_code = ?, updated_at = ? WHERE id = ?", String(randomInt(1000, 10000)), now, o.id));
        (await run('DELETE FROM proof_attempts WHERE order_id = ?', o.id));
      }
      (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'COURIER_BLOCKED', ?, ?)`,
        user.id, o.id, JSON.stringify({ driverId: target.id, from: o.status }), now));
    }
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  for (const o of carrying) {
    if (o.status === 'assigned' || o.status === 'at_pickup') { await queuePush([o.customer_id], 'released', o.id); (await newJobPush(o.service, o.id, o.customer_id, target.id)); }
    else if (o.status !== 'returning') await queuePush([o.customer_id], 'returning', o.id);
  }
  if (role === 'driver' && status === 'active' && target.status !== 'active') await queuePush([target.id], 'approved', 0, '/driver');
  return (await toUser((await one('SELECT * FROM users WHERE id = ?', target.id))!));
};
route('POST', '/api/admin/users/:id', editUser); // existing clients
route('PATCH', '/api/admin/users/:id', editUser);
route('POST', '/api/admin/users/:id/approve', async ({ user, params, body }) => {
  need(user, 'admin');
  const target = (await one("SELECT * FROM users WHERE id = ? AND phone NOT LIKE 'deleted-%' AND phone NOT LIKE 'partner:%'", Number(params[0]))) ?? fail(404, 'not_found');
  if (target.role === 'admin') fail(409, 'cannot_change_admin');
  // Unblocking a courier must not skip what blocking enforces. The admin users screen sends
  // this route to clear a block, so without this check a blocked driver holding parcels came
  // back to 'active' in one call, bypassing the carrying_parcels guard in editUser.
  if (target.role === 'driver' && target.status === 'blocked') {
    const carrying = await all(`SELECT id, status FROM orders WHERE driver_id = ? AND status IN (${activeSql})`, target.id);
    if (carrying.length && body.recovery !== 'return') fail(409, 'carrying_parcels');
  }
  (await run("UPDATE users SET status = 'active', approved_at = COALESCE(approved_at, ?) WHERE id = ?", Date.now(), target.id));
  if (target.role === 'driver' && target.status !== 'active') await queuePush([target.id], 'approved', 0, '/driver');
  return (await toUser((await one('SELECT * FROM users WHERE id = ?', target.id))!));
});
route('DELETE', '/api/admin/users/:id', async ({ user, params }) => {
  need(user, 'admin');
  const target = (await one("SELECT * FROM users WHERE id = ? AND phone NOT LIKE 'deleted-%' AND phone NOT LIKE 'partner:%'", Number(params[0]))) ?? fail(404, 'not_found');
  if (target.role === 'admin') fail(409, 'cannot_change_admin');
  return (await deleteAccount((await toUser(target))));
});

// No SMS provider yet: support verifies the caller, resets, and reads the temporary password out to them.
route('POST', '/api/admin/users/:id/password', async ({ user, params }) => {
  need(user, 'admin');
  (await limit(identityKey('support-password', user.id), 20, 60 * 60_000));
  const target = (await one("SELECT * FROM users WHERE id = ? AND role != 'admin' AND phone NOT LIKE 'deleted-%' AND phone NOT LIKE 'partner:%'", Number(params[0]))) ?? fail(404, 'not_found');
  const password = randomBytes(12).toString('base64url');
  const hashed = await hashPassword(password);
  // Keep the envelope's actor on the journaled security event: the route no longer runs inside it.
  await persistence.atomic({ id: user.id, correlationId: randomUUID() }, async () => {
    (await persistence.exec('BEGIN IMMEDIATE'));
    try {
      (await run('UPDATE users SET password = ? WHERE id = ?', hashed, target.id));
      (await run('DELETE FROM sessions WHERE user_id = ?', target.id));
      (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, NULL, 'SUPPORT_PASSWORD_RESET', ?, ?)`,
        user.id, JSON.stringify({ targetId: target.id, sessionsRevoked: true }), Date.now()));
      (await persistence.exec('COMMIT'));
    } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  });
  return { password };
});

// Caller identity for support: a one-time code goes to the account's verified email; the caller reads it back.
const supportTarget = async (id: unknown) => (await one("SELECT * FROM users WHERE id = ? AND role != 'admin' AND phone NOT LIKE 'deleted-%' AND phone NOT LIKE 'partner:%'", Number(id))) ?? fail(404, 'not_found');
route('POST', '/api/admin/users/:id/identity-code', async ({ user, params }) => {
  need(user, 'admin');
  const target = (await supportTarget(params[0]));
  if (!target.email_verified_at) fail(409, 'email_not_verified');
  await sendCode(target, 'support');
  return { sent: true };
});
route('POST', '/api/admin/users/:id/identity-check', async ({ user, params, body }) => {
  need(user, 'admin');
  const target = (await supportTarget(params[0]));
  if (!target.email_verified_at) fail(409, 'email_not_verified');
  (await useCode(target, 'support', body.code));
  return { confirmed: true, at: Date.now() };
});

route('GET', '/api/admin/subscriptions', async ({ user }) => {
  need(user, 'admin');
  return (await all(`SELECT s.*, u.name user_name, u.phone user_phone FROM subscriptions s JOIN users u ON u.id = s.user_id
    ORDER BY s.status = 'pending' DESC, s.id DESC LIMIT 200`)).map(toSubscription);
});

route('POST', '/api/admin/subscriptions/:id', async ({ user, params, body }) => {
  need(user, 'admin');
  // T22: the decision reads, checks and writes inside one transaction with a status predicate on the
  // update, so a concurrent activate/reject race has exactly one outcome; the loser is already_decided.
  return (await persistence.atomic({ purpose: 'admin_subscription_decision' }, async () => {
    const sub = (await one("SELECT * FROM subscriptions WHERE id = ? AND status = 'pending'", Number(params[0]))) ?? fail(404, 'not_found');
    if (body.action === 'activate') {
      const target = (await one('SELECT role FROM users WHERE id = ?', sub.user_id))!;
      if (sub.plan !== planForRole[target.role as User['role']]) fail(409, 'invalid_action');
      if (!(await run("UPDATE subscriptions SET status = 'active', activated_at = ?, ends_at = ? WHERE id = ? AND status = 'pending'", Date.now(), Date.now() + 30 * DAY, sub.id)).changes)
        fail(409, 'subscription_decided');
    }
    else if (body.action === 'reject') {
      if (!(await run("UPDATE subscriptions SET status = 'rejected' WHERE id = ? AND status = 'pending'", sub.id)).changes)
        fail(409, 'subscription_decided');
    }
    else fail(400, 'invalid_action');
    const holder = (await one('SELECT role FROM users WHERE id = ?', sub.user_id))!;
    await queuePush([sub.user_id], 'plan', 0, holder.role === 'driver' ? '/driver/account' : '/account');
    return { ok: true };
  }));
});

route('POST', '/api/admin/settings', async ({ user, body }) => {
  need(user, 'admin');
  for (const [key, value] of Object.entries(body)) {
    const n = Number(value);
    if (!(key in defaultSettings) || !Number.isFinite(n) || n < 0 || (fractionSettings.includes(key as keyof Settings) && n >= 1)) fail(400, 'invalid_setting');
  }
  // A blank field arrives as 0 and a mistyped one as 2000; both are refused by the shared
  // ceiling in model.ts, which the admin form checks too.
  const bad = invalidSetting(Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Number(v)])));
  if (bad) fail(400, `invalid_setting:${bad}`);
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    for (const [key, value] of Object.entries(body)) (await run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, Number(value)));
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  return (await settings());
});

// Additive protocol; installed-client snapshots keep their frozen response shapes.
const protocolCapabilities = async () => {
  const available = await durableProtocolAvailable(persistence);
  return { version: 1, durableCommands: available, durableEvents: available,
    pushDelivery: available ? 'at_least_once' : 'legacy_best_effort', snapshotAuthority: true,
    measuredEligibility: await measuredCapability(persistence), legacyCapacityMeasured: false };
};
async function orderProtocol(user: User, id: number, query: URLSearchParams) {
  if (!(await durableProtocolAvailable(persistence))) fail(409, 'durable_protocol_unavailable');
  return persistence.transaction(async () => {
    await run('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const order = await one('SELECT customer_id,driver_id,version,assignment_epoch FROM orders WHERE id=?', id) ?? fail(404, 'not_found');
    if (user.role !== 'admin' && user.id !== order.customer_id && user.id !== order.driver_id) fail(404, 'not_found');
    const after = Number(query.get('after') ?? 0);
    if (!Number.isSafeInteger(after) || after < 0) fail(400, 'invalid_cursor');
    const events = await all('SELECT * FROM domain_events WHERE order_id=? AND sequence>? ORDER BY sequence LIMIT 100', id, after);
    // Fare history is negotiated, and a driver sees only their own assignment's changes (as journey.lastFareChange).
    const fareVisible = (event: Row) => query.get('journeyProtocol') === '1' && (user.role === 'admin' || user.id === order.customer_id
      || Number(event.payload?.assignmentEpoch) === Number(order.assignment_epoch));
    const snapshot = { ...await getOrder(id, user), protocol: { version: order.version, assignmentEpoch: order.assignment_epoch,
      events: events.filter(event => event.type !== 'fare.changed' || fareVisible(event)).map(publicEvent), nextCursor: events.at(-1)?.sequence ?? after, snapshotRequired: true, serverTime: Date.now() } };
    if (query.get('journeyProtocol') !== '1') return snapshot;
    const measured = query.get('capacityProtocol') === '1' ? (await withMeasuredScopes([snapshot]))[0] : snapshot;
    return journeyOrder(persistence, rideLifecycle, { ...measured, ...(query.get('recoveryProtocol') === '1' ? { recovery: await recoveryMetadata(id) } : {}) }, user);
  }, { commandId: randomUUID() });
}

// ---------- http ----------

async function readBody(req: IncomingMessage): Promise<Row> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 20_000) fail(413, 'too_large');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { const parsed = JSON.parse(raw); return parsed && typeof parsed === 'object' ? parsed : fail(400, 'invalid_json'); }
  catch { return fail(400, 'invalid_json'); }
}

async function authenticate(req: IncomingMessage, touch = true): Promise<User | null> {
  const token = /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')?.[1];
  if (!token) return null;
  const now = Date.now();
  const r = (await one('SELECT u.*, s.created_at AS session_created_at, s.last_seen_at AS session_last_seen_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.created_at > ? AND COALESCE(s.last_seen_at, s.created_at) > ?',
    sha(token), now - SESSION_DAYS * DAY, now - SESSION_IDLE_DAYS * DAY));
  if (!r || r.status === 'blocked' || !contactAllowed(r) || (production && !(selfService ? r.role !== 'admin' || r.phone_verified_at || r.approved_at : r.phone_verified_at))) return null;
  if (touch && now - Number(r.session_last_seen_at ?? r.session_created_at) > 60 * 60_000)
    void run('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?', now, sha(token)).catch(() => {});
  return (await toUser(r));
}

let draining = false;
// Per client address, per 10 minutes, before any password or email work.
const publicAuthLimits: Record<string, number> = { '/api/auth/login': 50, '/api/auth/register': 20, '/api/auth/entra': 30, '/api/auth/reset/code': 10, '/api/auth/reset': 20 };
export const server = createServer({ maxHeaderSize: 16_384 }, async (req, res) => {
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('Access-Control-Allow-Origin', '*'); // Bearer [REDACTED], no cookies: open CORS is safe
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Wind-Client');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  let status = 200, payload: unknown;
  const correlationId = randomUUID();
  try {
    await persistence.scope(async () => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (draining) fail(503, 'unavailable');
    if (url.pathname.startsWith('/api/') && clientUpdateRequired(req.headers['x-wind-client'])) fail(426, 'client_update_required');
    const page = req.method === 'GET' ? publicPages.get(url.pathname) : undefined;
    if (page) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page); return; }
    if (req.method === 'GET' && serveWeb(url.pathname, req, res)) return;
    const match = routes.map(([method, pattern, handler, isPublic]) => ({ method, m: pattern.exec(url.pathname), handler, isPublic }))
      .find(r => r.method === req.method && r.m) ?? fail(404, 'not_found');
    if (!match.isPublic && !(await authenticate(req))) fail(401, 'unauthorized');
    const body = req.method === 'POST' || req.method === 'PATCH' ? await readBody(req) : {};
    const user = (await authenticate(req)); // a slow body cannot retain authority revoked while it was uploading
    if (!match.isPublic && !user) fail(401, 'unauthorized');
    const perAddress = publicAuthLimits[url.pathname];
    if (perAddress) (await limit(identityKey(url.pathname, clientAddress(req)), perAddress, 10 * 60_000));

    const invoke = async () => {
      const target = /^\/api\/(?:orders|jobs|admin\/orders)\/(\d+)(?:\/|$)/.exec(url.pathname);
      if (persistence.backend === 'postgres' && target && ['POST','PATCH','DELETE'].includes(req.method ?? '')) {
        // Handler-owned authorization/replay ordering is part of the installed-client contract.
        await one('SELECT id FROM orders WHERE id=? FOR UPDATE', Number(target[1]));
      }
      const driverWork = /^\/api\/jobs\/(\d+)\/(accept|offer)$/.exec(url.pathname);
      const customerOffer = /^\/api\/orders\/(\d+)\/offers\/(\d+)\/accept$/.exec(url.pathname);
      if (req.method === 'POST' && driverWork) {
        need(user!, 'driver'); needActive(user!);
        await getOrder(Number(driverWork[1]), user!);
        if (body.offerId === undefined && body.leaseNonce === undefined) await eligibility.guard(user!.id, Number(driverWork[1]), driverWork[2] as 'accept'|'offer', body.capacityProtocol, body.price, body.expectedRequirementsRevision);
      } else if (req.method === 'POST' && customerOffer) {
        need(user!, 'customer'); needActive(user!);
        if (!await one('SELECT id FROM orders WHERE id=? AND customer_id=?', Number(customerOffer[1]), user!.id)) fail(404, 'not_found');
        await eligibility.guard(Number(customerOffer[2]), Number(customerOffer[1]), 'offer_accept', body.capacityProtocol, undefined, body.expectedRequirementsRevision);
      } else if (req.method === 'POST' && url.pathname === '/api/orders' && body.capacityProtocol !== undefined) {
        // An installed booking may be measured by an operator; it cannot assert its own verified load.
        await eligibility.available(); fail(409, 'operator_order_assessment_required');
      }
      return await match.handler({ user: user!, body, params: match.m!.slice(1), query: url.searchParams, req });
    };
    if (req.method === 'POST' && /^\/api\/driver\/presence\//.test(url.pathname)) {
      need(user!,'driver');
      if(!url.pathname.endsWith('/offline') || user!.status!=='active') needActive(user!);
      let failure:HttpError|undefined;
      payload = await persistence.atomic({ id:user?.id,correlationId }, async () => {
        try {
          await limit(identityKey(`presence:${url.pathname}`,user!.id),url.pathname.endsWith('/location') ? 60 : 30,60_000);
          return await invoke();
        } catch(error) { if(!(error instanceof HttpError))throw error;failure=error; }
      });
      if(failure)throw failure;
    } else if (['POST','PATCH','DELETE'].includes(req.method ?? '') && /^\/api\/(?:me\/phone(?:\/|$)|auth\/phone\/|admin\/phone\/)/.test(url.pathname)) {
      // Phone issuance commits its budget/challenge before the detached provider call, then rechecks
      // current authority. It owns short transactions and command results instead of an HTTP-long lock.
      payload = await invoke();
    } else if (['POST','PATCH','DELETE'].includes(req.method ?? '') &&
      (/^\/api\/(?:auth\/(?:login|register|reset(?:\/code)?|entra)|me\/password|admin\/users\/\d+\/password)$/.test(url.pathname)
        || /^\/api\/partner\//.test(url.pathname))) {
      // Password routes wait for the bounded KDF before their own short transactions: an HTTP-long
      // envelope would hold a pooled connection and a transaction for the whole hash. Entra and
      // partner create passwordless placeholder credentials, so they take the same path.
      if (body.commandId !== undefined) fail(400, 'unsupported_command');
      if (persistence.backend === 'postgres' && /^\/api\/partner\/orders(?:\/|$)/.test(url.pathname)
        && !(await durableProtocolAvailable(persistence))) fail(503, 'durable_schema_required');
      payload = await invoke();
    } else if (req.method === 'POST' && /^\/api\/orders\/[^/]+\/payments(?:\/refund)?$/.test(url.pathname)) {
      // Payment create/refund call the provider between their own short reserve and settle
      // transactions (WP14). They own their idempotency instead of an HTTP-long lock.
      payload = await invoke();
    } else if (['POST','PATCH','DELETE'].includes(req.method ?? '')) {
      if (persistence.backend === 'postgres' && /^\/api\/(?:orders|jobs|partner\/orders|admin\/orders|driver\/cash|admin\/cash)(?:\/|$)/.test(url.pathname)
        && !(await durableProtocolAvailable(persistence))) fail(503, 'durable_schema_required');
      let failure: HttpError | undefined;
      payload = await persistence.atomic({ id: user?.id, correlationId, purpose: user ? undefined : url.pathname.startsWith('/api/partner/') ? 'partner_api' : 'http_public' }, async () => {
        try { const rawToken = /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')?.[1]; return await versionedCommand(persistence, user, body, url.pathname, req.method!, invoke, fail, e => e instanceof HttpError, id => getOrder(id, user!), { requirePermanentDriverApproval: production && selfService, sessionHash: rawToken ? sha(rawToken) : undefined }); }
        catch (error) { if (!(error instanceof HttpError)) throw error; failure = error; }
      });
      if (failure) throw failure;
    } else payload = await invoke();
    if (url.searchParams.get('journeyProtocol') === '1' && user && /^\/api\/(orders|jobs|admin\/orders)(?:\/|$)/.test(url.pathname)) {
      const viewer = await authenticate(req, false) ?? fail(401, 'unauthorized');
      const decorate = async (value: unknown) => {
        if (!value || typeof value !== 'object' || !('service' in value) || !('id' in value)) return value;
        if ('protocol' in value && 'journey' in value) return value; // already projected in the cursor's snapshot
        const authorized = await getOrder(Number((value as Order).id), viewer);
        const recovery = 'recovery' in value ? { recovery: await recoveryMetadata(authorized.id) } : {};
        return journeyOrder(persistence, rideLifecycle, { ...value as Order, ...authorized, ...recovery }, viewer);
      };
      // A card accepted or released between the page read and this snapshot drops out of the list instead of
      // failing the whole page; a single order still answers 404. ponytail: one re-read per card (pages are small),
      // batch the boarding/fare reads if large pages appear.
      const decorateAll = async (values: unknown[]) => (await Promise.all(values.map(value => decorate(value)
        .catch(error => { if (error instanceof HttpError && error.status === 404) return undefined; throw error; }))))
        .filter(value => value !== undefined);
      payload = await persistence.transaction(async () => {
        if (persistence.backend === 'postgres') await run('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        if (Array.isArray(payload)) return decorateAll(payload);
        if (payload && typeof payload === 'object' && 'jobs' in payload && Array.isArray((payload as Row).jobs))
          return { ...payload, jobs: await decorateAll((payload as Row).jobs) };
        return decorate(payload);
      }, { commandId: randomUUID() });
    }
    if (url.searchParams.get('journeyProtocol') === '1' && url.pathname === '/api/price' && payload && typeof payload === 'object' && 'quoteId' in payload) {
      const record = await one('SELECT * FROM quotes WHERE id=?::uuid', (payload as Row).quoteId);
      if (record) payload = { ...payload, eta: etaProjection(null, Number(record.created_at), Number(record.expires_at), Date.now(), 'quote_band', [Number(record.eta_min_seconds), Number(record.eta_max_seconds)]) };
    }
    });
    if (res.headersSent) return;
  } catch (error) {

    status = error instanceof HttpError ? error.status : databaseUnavailable(error) ? 503 : 500;
    const code = error instanceof HttpError ? error.message : 'server_error';
    payload = { error: code };
    const failedUrl = new URL(req.url ?? '/', 'http://localhost');
    const verb = /^\/api\/jobs\/\d+\/accept$/.test(failedUrl.pathname) ? 'accept'
      : /^\/api\/offers\/[a-f0-9-]+\/decline$/i.test(failedUrl.pathname) ? 'decline' : undefined;
    if (verb && failedUrl.searchParams.get('journeyProtocol') === '1') payload = { error: code, offerFailure: offerFailure(verb, code, status) };
    if (status >= 500 && !(error instanceof HttpError && ['route_unavailable', 'email_unavailable'].includes(error.message)))
      logServerError('http_request_failed', error, { correlationId, httpStatus: status });
  }
  if (status === 429 || status === 503) res.setHeader('Retry-After', '60');
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload));
});
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 50;
server.maxConnections = 2_000; // a held live request is a socket: a cap keeps one client from taking the API down
let presenceSweepTimer: ReturnType<typeof setInterval> | undefined;
let presenceSweepJob: Promise<void> = Promise.resolve();
let presenceSweepRunning = false;
server.on('listening', () => {
  const minimumBuild = process.env.WIND_MIN_CLIENT_BUILD;
  if (minimumBuild && !(Number.isSafeInteger(Number(minimumBuild)) && Number(minimumBuild) > 0))
    console.warn('WIND_MIN_CLIENT_BUILD is not a positive build number, so the forced-upgrade gate is off');
  if (production) void persistence.scope(async () => { const users = Number((await one('SELECT COUNT(*) n FROM users'))?.n ?? 0); if (!users) console.error('Wind API: production database has no users yet. If this is not a first boot, check that the persistent volume is mounted at DB_PATH.'); }).catch(() => undefined);
  const sweep = () => {
    if(presenceSweepRunning || draining)return;
    presenceSweepRunning=true;
    presenceSweepJob = presenceSweepJob.then(() => persistence.detached(async () => {
      for(let batch=0;batch<10;batch++) if(await presence.sweep()<100)break;
    })).catch(error => { logServerError('presence_maintenance_failed',error); }).finally(() => { presenceSweepRunning=false; });
  };
  sweep();
  presenceSweepTimer=setInterval(sweep,15_000);
  presenceSweepTimer.unref();
});

export async function shutdown() {
  if (draining) return;
  draining = true;
  if(presenceSweepTimer)clearInterval(presenceSweepTimer);
  fixWaiters.forEach(set => set.forEach(wake => wake())); // live watchers answer now instead of holding the close
  const force = setTimeout(() => server.closeAllConnections(), 10_000);
  force.unref();
  try { await new Promise<void>(resolve => server.close(() => resolve())); }
  finally { clearTimeout(force); await presenceSweepJob; await phoneIdentity.drain(); await closePasswordHasher(); await persistence.close(); db.close(); }
}

// Phones aren't verified by SMS, so admin rights are granted from the server shell, never over the API.
export async function promote(input: string) {
  const phone = normalizePhone(input) ?? fail(400, 'invalid_phone');
  if (production && !(await one('SELECT phone_verified_at FROM users WHERE phone = ?', phone))?.phone_verified_at) fail(409, 'verify phone ownership through operator enrollment first');
  if (!(await run("UPDATE users SET role = 'admin', status = 'active', vehicle = NULL WHERE phone = ?", phone)).changes)
    fail(404, 'register this number in the app first');
  return phone;
}

if (import.meta.main) {
  if (process.argv[2] === 'delete-account') {
    try {
      if (process.argv[4] !== '--phone-verified') throw Object.assign(new Error('Operator attestation required'), { code: 'OPERATOR_REQUEST_PROOF_REQUIRED' });
      const phone = normalizePhone(process.argv[3] ?? '') ?? fail(400, 'invalid_phone');
      const account = (await one('SELECT * FROM users WHERE phone = ?', phone)) ?? fail(404, 'not_found');
      await persistence.scope(async () => deleteAccount(await toUser(account)));
      console.log('Verified account deletion completed');
    } catch (error) { logAccountCommandFailure(error); process.exitCode = 1; }
    finally { db.close(); }
  } else if (process.argv[2] === 'verify-phone') {
    try {
      if (process.argv[4] !== '--phone-verified') throw Object.assign(new Error('Operator attestation required'), { code: 'OPERATOR_PHONE_PROOF_REQUIRED' });
      const phone = normalizePhone(process.argv[3] ?? '') ?? fail(400, 'invalid_phone');
      if (!(await run('UPDATE users SET phone_verified_at = ? WHERE phone = ? AND status <> ?', Date.now(), phone, 'blocked')).changes) fail(404, 'not_found');
      console.log('Operator phone verification recorded');
    } catch (error) { logAccountCommandFailure(error); process.exitCode = 1; }
    finally { db.close(); }
  } else if (process.argv[2] === 'enroll') {
    try {
      if (process.argv[6] !== '--phone-verified') throw Object.assign(new Error('Operator attestation required'), { code: 'OPERATOR_PHONE_PROOF_REQUIRED' });
      const phone = normalizePhone(process.argv[3] ?? '') ?? fail(400, 'invalid_phone');
      const role = ['customer', 'driver', 'admin'].includes(process.argv[4]) ? process.argv[4] : fail(400, 'invalid_role');
      const vehicle = role === 'driver' ? (vehicles.includes(process.argv[7] as Vehicle) ? process.argv[7] : process.argv[7] ? fail(400, 'invalid_vehicle') : 'car') : null;
      const name = text(process.argv[5], 60), password = newPassword(readFileSync(0, 'utf8').trimEnd());
      if ((await one('SELECT id FROM users WHERE phone = ?', phone))) fail(409, 'phone_taken');
      (await run('INSERT INTO users (phone, name, password, role, status, vehicle, created_at, phone_verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        phone, name, await hashPassword(password), role, role === 'driver' ? 'pending' : 'active', vehicle, Date.now(), Date.now()));
      console.log('Verified account enrolled; drivers still require approval');
    } catch (error) { logAccountCommandFailure(error); process.exitCode = 1; }
    finally { db.close(); }
  } else if (process.argv[2] === 'seed-checkpoints') {
    try { console.log(`${(await seedCheckpoints())} pilot checkpoints added`); }
    catch (error) { logAccountCommandFailure(error); process.exitCode = 1; }
    finally { db.close(); }
  } else if (process.argv[2] === 'promote') {
    try { console.log(`${(await promote(process.argv[3] ?? ''))} is now an admin`); }
    catch (error) { logAccountCommandFailure(error); process.exitCode = 1; }
    finally { db.close(); }
  } else {
    (await run('DELETE FROM checkpoint_reports WHERE created_at < ?', Date.now() - 30 * DAY)); // only the last two hours are ever shown
    const prune = async () => {
      (await run('DELETE FROM sessions WHERE created_at < ? OR COALESCE(last_seen_at, created_at) < ?', Date.now() - SESSION_DAYS * DAY, Date.now() - SESSION_IDLE_DAYS * DAY));
      (await run('DELETE FROM request_limits WHERE until < ?', Date.now()));
    };
    (await prune());
    setInterval(async () => { try { (await prune()); } catch (error) { logServerError('maintenance_failed', error); } }, 60 * 60_000).unref(); // expired throttles never pile up
    const port = Number(process.env.PORT ?? 4000);
    server.listen(port, process.env.HOST ?? (production ? '127.0.0.1' : '0.0.0.0'), () => console.log(`Wind API on :${port}`));
    setInterval(async () => { try { (await alertReleasedJobs()); } catch (error) { logServerError('maintenance_failed', error); } }, 60_000).unref(); // scheduled-job release alerts
    setInterval(async () => { try { const n = (await expireStaleDemand()); if (n) console.log(`T21: ${n} stale searching orders expired`); } catch (error) { logServerError('maintenance_failed', error); } }, 60_000).unref(); // T21 stale searching demand leaves the board, at most 50 a minute
    process.once('SIGTERM', async () => { shutdown().catch(error => { logServerError('shutdown_failed', error); process.exitCode = 1; }); });
    process.once('SIGINT', async () => { shutdown().catch(error => { logServerError('shutdown_failed', error); process.exitCode = 1; }); });
  }
}
