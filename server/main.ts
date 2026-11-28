/// <reference types="node" />
// Wind API: Node 24 HTTP server with owned async SQLite/PostgreSQL persistence.
// Run: node server/main.ts · Make an admin: node server/main.ts promote 0599XXXXXX
import { createServer, type IncomingMessage } from 'node:http';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { initializeSqlite } from './db/sqlite-schema.ts';
import { postgresSchemaVersion } from './db/postgres-schema.ts';
import { runtimePersistence } from './db/runtime.ts';
import { databaseUnavailable } from './http/database-errors.ts';
import { customerStatistics, driverStatistics } from './domain/statistics.ts';
import { durableProtocolAvailable, enqueuePush, publicEvent } from './domain/events.ts';
import { versionedCommand } from './domain/commands.ts';
import { holdsPhoneNumber, PhoneIdentity, registerPhoneRoutes } from './domain/phone-identity.ts';
import { Eligibility, measuredCapability, measuredScopes, registerEligibilityRoutes } from './domain/eligibility.ts';
import { Presence, registerPresenceRoutes } from './domain/presence.ts';
import { Dispatch, registerDispatchRoutes, straightLineEta } from './domain/dispatch.ts';
import { etaProjection, journeyOrder, offerFailure } from './domain/journey.ts';
import { RideLifecycle, registerRideLifecycleRoutes } from './domain/ride-lifecycle.ts';
import { custodyBlockFrom, registerBlockReviewRoutes } from './domain/block-review.ts';
import { registerPickupPayRoutes } from './domain/pickup-pay-review.ts';
import { ResourceScope, registerResourceScopeRoutes, validateDeclaredScope, saveDeclaredScope, scopeAvailable, scopePayloadHash } from './domain/resource-scope.ts';
import { createPrivateObjects, registerPrivateObjectRoutes } from './domain/private-objects.ts';
import { Ledger, ledgerAvailable, registerLedgerRoutes, RETURN_NO_FARE } from './domain/ledger.ts';
import { codGoodsMinor, createPayments, registerPaymentsRoutes } from './domain/payments.ts';
import { needStaff, Ops, registerOpsRoutes, staffActor, staffRoleOf } from './domain/ops.ts';
import { NativePush, nativePushAvailable, nativeSuppression, registerNativePushRoutes, URGENT_KINDS } from './domain/native-push.ts';
import { Realtime, registerRealtimeRoutes } from './domain/realtime.ts';
import { EntraUnavailableError, entraConfig, registerEntraRoutes, verifyEntraIdToken } from './domain/entra.ts';
import { registerActiveGpsRoutes } from './domain/active-gps-routes.ts';
import { destinationAvailable, destinationEligible, pendingDestination, registerDestinationRoutes } from './domain/destination-change.ts';
import { registerShop, shopTables } from './domain/shop.ts';
import { cashOwed } from './domain/money.ts';
import { logServerError } from './domain/diagnostics.ts';
import { hashPassword as createPasswordHash, verifyPassword, PasswordBusyError, closePasswordHasher } from './domain/passwords.ts';
import { SESSION_DAYS, SESSION_IDLE_DAYS } from './domain/session-policy.ts';
import { previewProfiles } from './domain/account-profiles.ts';
import { captainActivity, captainGrant, captainHasWork, captainOfflineReason, captainOnline, defaultMode, expireCaptainAvailability, hasCaptainProfile, registerModeRoutes, setCaptainAvailability, setCaptainOffline, supportedMode, switchSessionMode } from './domain/session-mode.ts';
import { initializeSqliteModeSwitching, modeActivationKey } from './db/account-profiles.ts';
import { clientAddress } from './domain/client-address.ts';
import { firebaseReset } from './domain/firebase-reset.ts';
import { firebaseContinuationUrl, firebaseEmailService, recordRecoveryEmailProof, recoveryEmailVerified, validMailboxProof, registerRecoveryEmailRoutes, retireFirebaseEmail } from './domain/firebase-email.ts';
import { registerRoutingStatusRoutes } from './domain/routing-status.ts';
import { createGoogleRoutes, registerGoogleRouteRoutes } from './domain/google-routing.ts';
import { registerPlaceSearchRoutes } from './domain/place-search.ts';
import { forgetDriver, registerNearbyRoutes, sawDriver } from './domain/nearby.ts';
import { areaName, registerPlaceIndexRoutes, streetName } from './domain/place-index.ts';
import { registerPlaceLinkRoutes } from './domain/place-link.ts';
import { registerCashOpsRoutes } from './domain/cash-ops.ts';
import { registerSupportRoutes } from './domain/support.ts';
import { doorCash } from './domain/door-cash.ts';
import { registerAdminAssignRoutes } from './domain/admin-assign.ts';
import { driverRefusal, type RefusalOrder } from './domain/driver-refusal.ts';
import { registerBookingReceiptRoutes } from './domain/booking-receipts.ts';
import { registerCashReceiptRoutes } from './domain/cash-receipts.ts';
import { cashClientFenced, clientUpdateRequired, registerRuntimeRoutes, tripCodeClientTooOld } from './domain/runtime-readiness.ts';
import { registerDriverReceiptRoutes } from './domain/driver-receipts.ts';
import { registerCommandReceiptRoutes } from './domain/command-receipts.ts';
import { registerCustodyRoutes } from './domain/custody.ts';
import { registerOfficeRoutes, remindOffice, returnCustody } from './domain/office.ts';
import { bestRoute, checkpointDelaySeconds, expectedMinutes } from './domain/route-quality.ts';
import { quotesAvailable, createQuoteRecord, evaluateQuoteFeasibility, tariffBasisPoints, tariffVersionFor, minorUnits } from './domain/quotes.ts';
import { bookingPriority, checkPriorityCutoff, priorityIdentity } from './domain/priority.ts';
import { createHash, createHmac, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { accessSync, constants, createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompress } from 'node:zlib';
import { promisify } from 'node:util';
import {
  activeStatuses, cities, city, pickupPayCents as pickupPayFor, commissionOn, crowKm, distanceKm, exceptionReasons, finishedStatuses, pickupRefusal, pickupRefusalDetails, defaultSettings, fractionSettings, invalidSetting, isCity, nextStatus, normalizeEmail, normalizePhone,
  alongTheWay, canTake, CLOSED_MINUTES, nearestCity, onTheWay, poolable, HISTORY_PAGE, isNight, latinDigits, offerRange, overCashCeiling, optionsFor, orderCode, planForRole, quote, rideSeatDemand, rideVehiclesFor, roadAlerts, seatsFor, SERVICE_KM, services, SLOW_MINUTES, smartPrice, vehicleServices, vehicles,
  type AccountMode, type CityId, type DriverStats, type Offer, type Order, type Plan, type Point, type Role, type Service, type Settings, type Subscription, type User, type Vehicle,
} from '../src/model.ts';
import { BOOKING_COMMAND_TTL_MS } from '../src/booking.ts';
import { createOpencode, registerOpencodeRoutes } from './domain/opencode.ts';
import { backtracks, nearLine } from '../src/map-math.ts';
import { b64url, encrypt, isDeviceNotRegistered, pushEndpoint, sendExpoPush, vapid, pushSubject, webPushKind } from './push.ts';

const DAY = 86_400_000;
const RELEASE_BEFORE = 30 * 60_000; // scheduled orders reach drivers this long before pickup
// Sliding inactivity is touched at most hourly; the absolute lifetime still applies.
const production = process.env.NODE_ENV === 'production';
const selfService = process.env.WIND_IDENTITY_MODE === 'self-service';
const contactVerificationRequired = selfService && process.env.WIND_CONTACT_VERIFICATION_REQUIRED === 'true';
const contactAllowed = async (r: Row) => !contactVerificationRequired || r.role === 'admin'
  || r.phone_verified_at || r.approved_at || await recoveryEmailVerified(persistence, r);
const registrationOpen = selfService || (!production && process.env.WIND_IDENTITY_MODE !== 'operator-verified');
// Entra External ID stays dark until the tenant is configured; password auth is untouched while it is off.
// A partial or mistyped Entra config must never crash-loop the whole API.
const entra = (() => { try { return entraConfig(); } catch (error) { console.error('Entra disabled:', error instanceof Error ? error.message : error); return null; } })();

// Zro / MoonMath provider config placeholder
if (production) {
  if (!process.env.DB_PATH || !isAbsolute(process.env.DB_PATH)) throw new Error('Production requires an absolute DB_PATH on a persistent local volume');
  if (!process.env.SUPPORT_CONTACT?.trim()) throw new Error('Production requires a real SUPPORT_CONTACT');
  if (/example|placeholder|changeme|<[^>]*>|0{6,}$/i.test(process.env.SUPPORT_CONTACT.trim())) throw new Error('Production requires a real SUPPORT_CONTACT, not an example value');
  // Both fail silently otherwise: every push delivery throws in its best-effort catch, and behind a proxy every
  // request shares the proxy's address, so one per-address limit holds all users.
  if (!/^(mailto:|https:)/.test(process.env.WIND_PUSH_SUBJECT?.trim() ?? '')) throw new Error('Production requires WIND_PUSH_SUBJECT: a mailto: address or https: origin you control');
  if (!['0', '1'].includes(process.env.WIND_TRUST_PROXY ?? '')) throw new Error('Production requires WIND_TRUST_PROXY: 1 behind a reverse proxy, 0 when directly exposed');
  if (!['operator-verified', 'self-service'].includes(process.env.WIND_IDENTITY_MODE ?? '')) throw new Error('Production requires WIND_IDENTITY_MODE=operator-verified or self-service');
  if (process.platform !== 'win32') process.umask(0o077);
}
const enabledServices = services.filter(service => (process.env.WIND_ENABLED_SERVICES ?? 'parcel').split(',').map(s => s.trim()).includes(service));
const supportContact = (process.env.SUPPORT_CONTACT ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const recoveryPage = readFileSync(new URL('./recovery-email.html', import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
const recoveryPageScript = /<script>([\s\S]*?)<\/script>/.exec(recoveryPage)?.[1] ?? '';
const recoveryPageScriptHash = createHash('sha256').update(recoveryPageScript).digest('base64');
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
  const versionedMap = requested === '/map/v1/map.html';
  const candidate = resolve(webRoot, versionedMap ? './map.html' : `.${requested}`);
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
  const cacheControl = versionedMap ? 'public, max-age=86400' : extension === '.html' || extension === '.webmanifest' || file === resolve(webRoot, 'sw.js')
    ? 'no-cache' : 'public, max-age=604800, immutable';
  if (file === resolve(webRoot, 'map.html')) res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // the web app shows this page in an iframe; a 304 must say so too
  const etag = file === resolve(webRoot, 'map.html') ? `W/"${createHash('sha256').update(readFileSync(file)).digest('hex')}"` : undefined;
  const since = req.headers['if-modified-since'];
  const matches = etag && req.headers['if-none-match'] !== undefined
    ? String(req.headers['if-none-match']).split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''))
    : since && Date.parse(String(since)) >= Math.floor(modified.getTime() / 1000) * 1000;
  if (matches) {
    res.writeHead(304, { 'Cache-Control': cacheControl, 'Last-Modified': modified.toUTCString(), Vary: 'Accept-Encoding', ...(etag && { ETag: etag }) }).end();
    return true;
  }
  res.writeHead(200, {
    'Content-Type': contentType,
    // map.html (the Android WebView map) runs an inline module, so it keeps the frame/sniff headers only.
    ...(extension === '.html' && file !== resolve(webRoot, 'map.html') && { 'Content-Security-Policy': webCsp }),
    'Cache-Control': cacheControl,
    ...(etag && { ETag: etag }),
    'Last-Modified': modified.toUTCString(),
    'Vary': 'Accept-Encoding', // always: a shared cache must not hand a brotli body to a client that cannot read it
    ...(useBrotli ? { 'Content-Encoding': 'br' } : {}),
  });
  if (useBrotli) compressed(file, etag).then(body => res.end(body), () => res.destroy());
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
const compressed = (file: string, revision: string | number = statSync(file).mtimeMs) => {
  // Keyed by mtime as well: an edited file must not be served from the body cached for the previous one.
  const key = `${file}:${revision}`;
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

const accountModes = process.env.WIND_PROFILE_SWITCHING === '1';
const modeRollback = import.meta.main && process.argv[2] === 'rollback-profiles';
if (modeRollback && (process.argv[3] !== '--confirm' || accountModes || process.env.WIND_DATABASE_URL
  || !process.env.DB_PATH || !isAbsolute(process.env.DB_PATH) || !existsSync(process.env.DB_PATH)))
  throw new Error('Profile rollback requires --confirm, disabled profile switching and an existing SQLite database');
// Retained sync export is for offline legacy fixture setup; HTTP/domain work uses persistence below.
export const db = new DatabaseSync(process.env.WIND_DATABASE_URL ? ':memory:' : process.env.DB_PATH ?? 'wind.db');
if (!modeRollback) initializeSqlite(db);
export const persistence = runtimePersistence(db);
if (accountModes && persistence.backend !== 'sqlite') throw new Error('Profile switching requires the SQLite pilot runtime');
if (accountModes && production && !(Number.isSafeInteger(Number(process.env.WIND_MIN_CLIENT_BUILD)) && Number(process.env.WIND_MIN_CLIENT_BUILD) >= 10107))
  throw new Error('Profile switching requires client build 10107 or later');
if (accountModes) initializeSqliteModeSwitching(db, enabledServices.includes('shop'));
else if (persistence.backend === 'sqlite' && !modeRollback && db.prepare('SELECT 1 FROM settings WHERE key = ?').get(modeActivationKey))
  throw new Error('Account profiles are active on this SQLite database. Keep profile switching enabled or complete the profile rollback.');
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
  const stored = Object.fromEntries((await all('SELECT key, value FROM settings'))
    .filter(r => Object.hasOwn(defaultSettings, r.key)).map(r => [r.key, r.value]));
  return { ...defaultSettings, ...(enabledServices.includes('shop') && { driverCashCap: 1000 }), ...stored };
}
function settingsResponse({ pickupPayPerKm, shopHandoverMinutes, ...settings }: Settings, payroll: boolean) {
  return payroll ? { settings: { ...settings, shopHandoverMinutes }, pickupPayPerKm } : { settings };
}
/** ADM-12 (D-1): refuses a price above the per-order cash ceiling. Every path that sets what a customer pays at the door calls it. */
async function guardCashCeiling(price: number, orderId?: number) {
  const cod = orderId == null ? 0 : await codGoodsMinor(persistence, orderId) / 100; // a booked order's goods COD rides on the fare
  if (overCashCeiling((await settings()), price + cod)) fail(409, 'over_cash_ceiling');
}
/** ADM-12 for a fare going back to the pool (release, courier block): the recommendation, but never so high that fare plus goods COD passes the ceiling.
 * A ceiling lowered below the open goods COD leaves no room: the fare stays as booked (it was within the ceiling at booking), so a release or a courier block is never refused. */
async function restoredFare(orderId: number, recommended: number, current: number) {
  const room = Math.floor((await settings()).orderCashCeiling - await codGoodsMinor(persistence, orderId) / 100);
  return room < 1 ? current : Math.min(recommended, room);
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

// An unknown identifier costs the same scrypt as a known one: it is checked against a decoy hash made once, lazily.
// decoyChecks lets a test see the unknown path reached the hash (a timing assertion would be flaky).
let decoyHash: Promise<string> | undefined;
export const loginCheck = { decoyChecks: 0, delayMs: 0 }; // delayMs: test seam so parallel sign-ins really interleave
async function checkLoginPassword(password: string, stored: string | undefined) {
  if (loginCheck.delayMs) await new Promise(resolve => setTimeout(resolve, loginCheck.delayMs));
  if (stored !== undefined) return checkPassword(password, stored);
  loginCheck.decoyChecks++;
  await checkPassword(password, await (decoyHash ??= createPasswordHash(randomBytes(32).toString('hex'))));
  return false;
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
    phoneVerifiedAt: r.phone_verified_at ?? null, emailVerifiedAt: await recoveryEmailVerified(persistence, r) ? r.email_verified_at : null };
}

async function activePlan(userId: number, role?: Role): Promise<Plan | null> {
  return ((await one(`SELECT s.plan FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE s.user_id = ?
    AND s.status = 'active' AND s.ends_at > ? AND s.plan = COALESCE(?, CASE u.role WHEN 'customer' THEN 'plus' WHEN 'driver' THEN 'pro' END)`,
  userId, Date.now(), (accountModes && role ? planForRole[role] : null) ?? null))?.plan as Plan) ?? null;
}

async function latestSubscription(userId: number, role?: Role): Promise<Subscription | null> {
  const r = (await one(`SELECT s.* FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE s.user_id = ?
    AND (s.status = 'pending' OR (s.status = 'active' AND s.ends_at > ?))
    AND s.plan = COALESCE(?, CASE u.role WHEN 'customer' THEN 'plus' WHEN 'driver' THEN 'pro' END) ORDER BY s.id DESC LIMIT 1`,
  userId, Date.now(), (accountModes && role ? planForRole[role] : null) ?? null));
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
// What a driver carries now, with what pooling needs (RIDE-13): which rides are shared and how many seats each holds.
const activeLoad = async (driverId: number) => ((await all(`SELECT service, shared, option FROM orders WHERE driver_id = ? AND status IN (${activeSql})`, driverId)) as Row[])
  .map(r => ({ service: r.service as Service, shared: !!Number(r.shared ?? 0), option: r.option == null ? null : String(r.option) }));

const orderSelect = `SELECT o.*, c.name customer_name, d.name driver_name, d.phone driver_phone, d.vehicle driver_vehicle, d.plate driver_plate,
  l.lat loc_lat, l.lng loc_lng, l.updated_at loc_at, l.heading loc_heading, l.accuracy loc_accuracy, od.status dispute_status, od.reason dispute_reason, od.resolution dispute_resolution,
  (SELECT p.code FROM promo_codes p WHERE p.id = od.credit_promo_id) dispute_credit_code, (SELECT p.amount FROM promo_codes p WHERE p.id = od.credit_promo_id) dispute_credit_amount,
  (SELECT MAX(si.id) FROM safety_incidents si WHERE si.order_id = o.id) safety_latest,
  (SELECT COUNT(*) FROM safety_incidents si WHERE si.order_id = o.id AND si.status = 'open') safety_open,
  EXISTS(SELECT 1 FROM orders x WHERE x.driver_id = o.driver_id AND x.id <> o.id AND x.status IN (${activeSql})) shared_run
  FROM orders o JOIN users c ON c.id = o.customer_id LEFT JOIN users d ON d.id = o.driver_id
  LEFT JOIN driver_locations l ON l.driver_id = o.driver_id AND l.updated_at >= COALESCE(o.assigned_at, 0) LEFT JOIN order_disputes od ON od.order_id = o.id`;

type JobCardData = { customers: Map<number, { rating: number | null; trips: number }>;
  offers: Map<number, { price: number; createdAt: number }> };

async function toOrder(r: Row, viewer: User, cards?: JobCardData): Promise<Order> {
  const personal = viewer.id === r.customer_id && (!viewer.accountMode || viewer.accountMode === 'personal');
  const owner = viewer.role === 'admin' || personal;
  const assigned = viewer.id === r.driver_id && (!viewer.accountMode || viewer.accountMode === 'captain');
  const custody = (owner || assigned) && r.status === 'returning' && r.service !== 'ride'
    ? await returnCustody(persistence, r) : null;
  const driverTrackingEnded = custody?.supportHasGoods === true;
  const live = !driverTrackingEnded && activeStatuses.includes(r.status) && r.loc_lat != null && Date.now() - r.loc_at <= 120_000;
  const partyPhones = (owner || assigned) && (activeStatuses.includes(r.status) || r.status === 'searching' || r.status === 'requested' || Date.now() - r.updated_at <= DAY);
  const dispatchInfo = await dispatch.summary(r.id, viewer.role === 'driver' ? viewer.id : undefined);
  const rideInfo = await rideLifecycle.summary(r.id, viewer, r);
  const scopeInfo = await resourceScope.summary(r.id, viewer, r);
  // T33: destination-change visibility and pending card follow the capability, not the dialect.
  // One capability probe per request, not per order in a list.
  const canChangeDest = (personal || assigned) && await persistence.memo('destinationAvailable', () => destinationAvailable(persistence));
  const destinationChange = canChangeDest && destinationEligible(r)
    ? await pendingDestination(persistence, r) : null;
  return {
    id: r.id, customerId: owner || assigned ? r.customer_id : null, driverId: r.driver_id ?? null, service: r.service, shared: !!r.shared,
    ...(r.service === 'parcel' && { priority: r.priority ?? 'standard' }),
    pickupCity: r.pickup_city, dropoffCity: r.dropoff_city,
    pickupPoint: (owner || assigned) && r.pickup_lat != null ? { latitude: r.pickup_lat, longitude: r.pickup_lng } : null,
    dropoffPoint: (owner || assigned) && r.dropoff_lat != null ? { latitude: r.dropoff_lat, longitude: r.dropoff_lng } : null,
    pickupNote: owner || assigned ? r.pickup_note : '', dropoffNote: owner || assigned ? r.dropoff_note : '',
    detail: owner || assigned ? r.detail : '', option: r.option, loadingHelp: !!r.loading_help,
    contact: partyPhones ? r.contact : null, // drivers see phones only after accepting, and only inside the contact window
    pickupContact: partyPhones ? r.pickup_contact ?? r.contact : null,
    recipientName: owner || assigned ? r.recipient_name ?? '' : '', recipientPhone: partyPhones ? r.recipient_phone ?? null : null,
    price: r.price, commission: r.service === 'shop' && !owner && !assigned ? null : r.commission ?? null, status: r.status, // a shop never sees the captain's commission
    ...(canChangeDest && personal && { canChangeDestination: destinationEligible(r) }),
    ...(destinationChange && { destinationChange }),
    handoverCode: owner ? r.handover_code ?? null : null, // the customer gives it to the driver at delivery
    rating: r.rating ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
    // Stage times for the status timeline: known only where the state was reached.
    assignedAt: r.assigned_at ?? null, pickedUpAt: r.picked_up_at ?? null, completedAt: r.completed_at ?? null,
    sharing: personal && !!r.share_token_hash, scheduledFor: r.scheduled_for ?? null, discount: r.discount ?? 0,
    returnCode: personal && r.status === 'returning' && r.service !== 'shop' ? r.return_code ?? null : null, // the sender gives it back to the driver; a shop's goods go back to the shop
    exceptionReason: owner || assigned ? r.exception_reason ?? null : null,
    exceptionDetail: owner || assigned ? r.exception_detail ?? null : null,
    // Door cash is dispute evidence for the driver who took it and for support; the customer's screen never carries it.
    ...(r.collected_cents != null && (assigned || viewer.role === 'admin') && { collected: { cents: r.collected_cents as number, reason: r.variance_reason ?? null } }),
    // Both parties learn the order is paused; only the reporter sees their own report.
    safetyHold: (owner || assigned) && r.safety_open > 0,
    ...(assigned && activeStatuses.includes(r.status) && r.safety_latest != null && !(r.safety_open > 0)
      && { proofVersion: Number(r.safety_latest) }),
    // SHIP-08: a parcel or freight delivery failure may be reattempted twice; a support hold is not a delivery attempt.
    ...(viewer.role === 'admin' && r.status === 'on_hold' && (r.service === 'parcel' || r.service === 'freight') && exceptionReasons.includes(r.exception_reason)
      && { reattemptAllowed: (await orderDeliveryAttempts(r.id)) < 3 }),
    // Support took the goods from this assignment's captain mid-return (CUSTODY_TAKEN): the captain's return code no longer closes
    // the order, and only office intake by support remains (Sol recheck of PR #101, HIGH 1).
    ...(custody && (viewer.role === 'admin' || assigned) && { supportHasGoods: custody.supportHasGoods }),
    ...(viewer.role === 'admin' && custody && (custody.supportHasGoods || custody.custodyBlocked) && { supportReturnRequired: true }),
    ...(driverTrackingEnded && { driverTrackingEnded: true }),
    // DRV-17: support sees a courier block's review on the order it ended.
    ...(viewer.role === 'admin' && ['cancelled', 'returning', 'returned'].includes(r.status) && await blockReviewsAvailable()
      && await (async () => { const b = await one('SELECT * FROM courier_block_reviews WHERE order_id = ?', r.id); return b ? { blockReview: blockReviewView(b) } : {}; })()),
    ...(viewer.role === 'admin' && r.status === 'cancelled' && shippingOrder(r)
      && await (async () => { const review = await pickupReview(r.id); return review && currentPickupReview(r, review) ? { pickupPayReview: review } : {}; })()),
    safetyReport: r.safety_latest != null && viewer.role !== 'admin' && (owner || assigned)
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
    ...(personal && r.status === 'searching' && r.recommended_price != null && { offers: (await offersFor(r.id)) }),
    ...(dispatchInfo ? { dispatch: dispatchInfo as Order['dispatch'] } : {}),
    ...(rideInfo ? { ride: rideInfo as Order['ride'] } : {}),
    ...(scopeInfo ? { declaredScope: scopeInfo as Order['declaredScope'] } : {}),
    ...(r.service === 'shop' && { shop: (await shop.view(r, viewer)) ?? undefined }),
  };
}

async function toOrders(rows: Row[], viewer: User): Promise<Order[]> {
  const orders: Order[] = [];
  // Bound database-backed serialization and leave room in the pool for other readers.
  for (let start = 0; start < rows.length; start += 4) {
    orders.push(...await Promise.all(rows.slice(start, start + 4).map(row => toOrder(row, viewer))));
  }
  return orders;
}

// Driver offers (SPEC-driver-offers.md). An offer counts while it is fresh and its driver is active, free and has not
// released the order; anything else is invisible and cannot be accepted.
const OFFER_TTL = 10 * 60_000; // ponytail: inDrive-like window; tune from how long customers take to choose
// An offer stays open while its driver is free, or (RIDE-13) when the order is a parcel or a shared ride and everything the driver
// carries can share the vehicle too. Seats are counted in code (offersFor, the offer accept): SQL only keeps the shape.
const poolableSql = (t: string) => `(${t}.service = 'parcel' OR (${t}.service = 'ride' AND ${t}.shared <> 0))`;
const offerOpen = `AND f.created_at > ? AND u.status = 'active'
  AND (NOT EXISTS(SELECT 1 FROM orders b WHERE b.driver_id = u.id AND b.status IN (${activeSql}))
    OR (EXISTS(SELECT 1 FROM orders t WHERE t.id = f.order_id AND ${poolableSql('t')})
      AND NOT EXISTS(SELECT 1 FROM orders b WHERE b.driver_id = u.id AND b.status IN (${activeSql}) AND NOT ${poolableSql('b')})))
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
const offersFor = async (orderId: number): Promise<Offer[]> => {
  const order = await one('SELECT service, shared, option FROM orders WHERE id = ?', orderId);
  const measured = order?.service === 'ride' && await measuredCapability(persistence);
  const rideVehicles = order?.service === 'ride' ? rideVehiclesFor(order.option) : [];
  if (order?.service === 'ride' && !rideVehicles.length) return [];
  const rows = await all(`SELECT f.driver_id, f.price, f.created_at, u.name, u.vehicle FROM order_offers f JOIN users u ON u.id = f.driver_id
    ${measured ? 'LEFT JOIN order_requirements q ON q.order_id=f.order_id' : ''}
    WHERE f.order_id = ? ${offerOpen} ${rideVehicles.length ? `AND u.vehicle IN (${rideVehicles.map(() => '?').join(',')})` : ''}
    ${measured ? `AND (q.order_id IS NULL OR EXISTS (SELECT 1 FROM eligibility_offers e JOIN driver_eligibility d ON d.driver_id=e.driver_id
      JOIN vehicles v ON v.id=d.vehicle_id JOIN vehicle_runs r ON r.vehicle_id=v.id JOIN eligibility_policy p ON p.id=1
      WHERE e.order_id=f.order_id AND e.driver_id=f.driver_id AND e.vehicle_id=v.id
      AND e.driver_revision=d.revision AND e.vehicle_revision=v.revision AND e.policy_revision=p.revision AND e.run_revision=r.revision
      AND e.requirements_revision=q.revision AND v.class=u.vehicle
      AND GREATEST(?,q.seats)<=LEAST(v.seats, COALESCE((?::jsonb ->> v.class)::int,0))))` : ''}
    ORDER BY f.price, f.created_at LIMIT 20`, orderId, Date.now() - OFFER_TTL, ...rideVehicles,
    ...(measured ? [rideSeatDemand(order?.option), JSON.stringify(Object.fromEntries(rideVehicles.map(vehicle => [vehicle, seatsFor(vehicle)])))] : []));
  // A driver already carrying shared riders offers only while the seats still fit (the accept checks the same).
  const fits = await Promise.all(rows.map(async f => !order || (servesFor(f.vehicle).includes(order.service) && canTake(await activeLoad(Number(f.driver_id)), order.service as Service,
    { shared: !!Number(order.shared ?? 0), option: order.option == null ? null : String(order.option) }, (f.vehicle ?? null) as Vehicle | null)
    && !await profileAssignmentRefusal({ id: orderId, service: order.service }, f.driver_id))));
  return Promise.all(rows.filter((_, i) => fits[i])
    .map(async f => ({ driverId: f.driver_id, name: f.name, vehicle: f.vehicle ?? null, price: f.price, createdAt: f.created_at, ...(await driverStats(f.driver_id)) })));
};

async function getOrder(id: number, viewer: User, liveProtocol = false, recoveryProtocol = false): Promise<Order> {
  const r = (await one(`${orderSelect} WHERE o.id = ?`, id)) ?? fail(404, 'not_found');
  const released = viewer.role === 'driver' && r.status === 'searching' &&
    !!(await one('SELECT 1 FROM order_releases WHERE order_id = ? AND driver_id = ?', r.id, viewer.id));
  const personal = (!viewer.accountMode || viewer.accountMode === 'personal') && r.customer_id === viewer.id;
  const captain = (!viewer.accountMode || viewer.accountMode === 'captain') && r.driver_id === viewer.id;
  const canSee = viewer.role === 'admin' || personal || captain ||
    (viewer.role === 'driver' && viewer.status === 'active' && r.status === 'searching' && enabledServices.includes(r.service) && servesFor(viewer.vehicle).includes(r.service)
      && (r.scheduled_for == null || r.scheduled_for <= Date.now() + RELEASE_BEFORE) && !await profileAssignmentRefusal({ id: r.id, service: r.service }, viewer.id)) ||
    (await shop.merchantSees(r, viewer));
  if (!canSee || released) fail(404, 'not_found');
  const order = await toOrder(r, viewer);
  if (liveProtocol) order.assignmentEpoch = Number(r.assignment_epoch);
  // Bind the revision to these instructions, even if the row changes during serialization.
  if (recoveryProtocol) order.recovery = recoveryMetadata(r);
  // The rating Uber shows beside the car, computed for one order only: on a list this would be a stats query per row.
  if (order.driverId && (viewer.role === 'admin' || personal || captain))
    order.driverRating = (await driverStats(order.driverId)).rating;
  return order;
}

const text = (v: unknown, max: number, required = true) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if ((required && !s) || s.length > max) fail(400, 'invalid_input');
  return s;
};
const need = (user: User, ...roles: Role[]) => {
  if (!roles.includes(user.role) || user.accountMode === 'shop') fail(403, 'forbidden');
};
const needActive = (user: User) => {
  if (user.status !== 'active') fail(403, user.status === 'pending' ? 'pending_approval' : 'blocked');
  if (production && selfService && user.role === 'driver' && !user.permanentlyApprovedAt && user.accountMode !== 'captain') fail(403, 'pending_approval');
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
  return persistence.atomic({ purpose: 'http_public' }, () => emailTransaction(() => entraAccount(claims!, body, placeholder)));
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
    if ((phoneUser && !phoneUser.phone_verified_at) || (emailUser && !await recoveryEmailVerified(persistence, emailUser)) ||
        (phoneUser && emailUser && phoneUser.id !== emailUser.id)) fail(403, 'entra_link_required');
    user = phoneUser ?? emailUser;
    if (user) {
      // Staff accounts link only through an authenticated operator action, never by
      // presenting a phone/email claim (phone-identity.ts excludes admins the same way).
      // Unlike password login, this answers 'blocked' to a caller who proved the identity at Entra, not a password.
      if (user.status === 'blocked') fail(403, 'blocked');
      if (user.role === 'admin' || user.entra_oid) fail(403, 'entra_link_required');
      const linked = await run(`UPDATE users SET entra_oid = ? WHERE id = ? AND entra_oid IS NULL AND role <> 'admin' AND status <> 'blocked'
        AND ((phone = ? AND phone_verified_at IS NOT NULL) OR (email = ? COLLATE NOCASE AND EXISTS (SELECT 1 FROM recovery_email_proofs p
          WHERE p.user_id = users.id AND p.email = users.email AND p.verified_at = users.email_verified_at)))`, claims.oid, user.id, phone, email);
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
      const legacyDriver = role === 'driver' && !accountModes;
      const id = Number((await run('INSERT INTO users (phone, name, password, role, status, vehicle, plate, created_at, email, consent_at, consent_version, entra_oid, phone_verified_at, email_verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        registrationPhone, name, placeholder, legacyDriver ? 'driver' : 'customer', legacyDriver ? 'pending' : 'active', legacyDriver ? vehicle : null, legacyDriver ? plate : null, Date.now(), email,
        selfService ? Date.now() : null, selfService ? '2026-10-03' : null, claims.oid,
        phone === registrationPhone ? Date.now() : null, email ? Date.now() : null)).lastInsertRowid);
      if (accountModes && vehicle) await createCaptainApplication(id, vehicle, plate);
      else if (legacyDriver) await queuePush((await adminIds()), 'attention', 0, '/admin/users');
      user = (await one('SELECT * FROM users WHERE id = ?', id))!;
    }
  }
  if (user.status === 'blocked') fail(403, 'blocked');
  // Only the exact contact attested by Entra may be marked verified. A linked
  // identity can carry other verified contacts that do not belong to this row.
  if (phone && phone === user.phone && !user.phone_verified_at) (await run('UPDATE users SET phone_verified_at = ? WHERE id = ? AND phone = ?', Date.now(), user.id, phone));
  if (email && email === normalizeEmail(user.email) && !await recoveryEmailVerified(persistence, user)) await recordRecoveryEmailProof(persistence, user.id, user.email, 'entra');
  user = (await one('SELECT * FROM users WHERE id = ?', user.id))!;
  if (!await contactAllowed(user)) fail(403, 'verification_required');
  if (production && !selfService && !user.phone_verified_at) fail(403, 'phone_not_verified');
  return (await startSession(user.id));
}

// ---------- routes ----------

type Ctx = { user: User | null; body: Row; params: string[]; query: URLSearchParams; req: IncomingMessage };
type Handler = (ctx: Ctx & { user: User }) => unknown;
const routes: [string, RegExp, Handler, boolean?][] = [];
const route = (method: string, path: string, handler: Handler, isPublic = false) =>
  routes.push([method, new RegExp(`^${path.replace(/:\w+/g, '(\\d+)')}$`), handler, isPublic]);

export const eligibility = new Eligibility(persistence, fail); // exported for the admin-assign test seam
registerEligibilityRoutes(route, eligibility, async (order, action, actorId, officeLeg = false) => {
  if (action === 'confirm_return') {
    // DRV-17: eligibility closes the return at the office; the office leg only when the captain carried it (recorded carrier).
    // A custody transfer or block overrides captain return-leg pay.
    const row = await one('SELECT * FROM orders WHERE id = ?', order.id);
    if (row?.service === 'shop') await shop.afterFinish(row, 'returned', actorId, {}, officeLeg);
    else if (row) await shippingTripPay(row, 'returned', actorId, officeLeg);
    await postOrderJournals(order.id);
  }
  await queuePush([order.driver_id], 'decided', order.id);
  await queuePush([order.customer_id], ({ hold: 'on_hold', return: 'returning', confirm_return: 'returned' } as const)[action], order.id);
});
const presence = new Presence(persistence, eligibility, fail, production && selfService);
// Going online needs the PostgreSQL presence tables (migration 9). Without them, as on SQLite in production today, the jobs board
// is the whole driver flow, so the app must not offer a button that can only fail. Tests keep the card unless they ask for production's behaviour.
const presenceOffered = async () => process.env.WIND_DRIVER_PRESENCE !== 'off' && (persistence.backend === 'postgres'
  ? persistence.memo('presenceOffered', async () => !!(await persistence.one("SELECT to_regclass('schema_migrations') AS migrations"))?.migrations
    && !!await persistence.one('SELECT version FROM schema_migrations WHERE version=9'))
  : !production);
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
/** DRV-17 (Sol R3-H1): a return closed by this release carries its policy on the order: commission 0 and a RETURN_NO_FARE marker
 * written in the same transaction. Balances, the live journal, the ledger import and reconciliation read the marker, so a return closed
 * by any earlier writer (before the release or during a rollback) keeps exactly the commission and promo relief it was booked with. */
const markNoFare = (actorId: number, orderId: number) =>
  run('INSERT INTO security_events (actor_id, order_id, action, created_at) VALUES (?, ?, ?, ?)', actorId, orderId, RETURN_NO_FARE, Date.now());
const noFareSql = (alias: string) => `EXISTS (SELECT 1 FROM security_events nf WHERE nf.order_id = ${alias}.id AND nf.action = '${RETURN_NO_FARE}')`;

// T29/T30: live ledger posting on the PostgreSQL capability. Journals reuse importLegacy's stable business
// references, so a later import meets the posted journals and dedupes on the business_ref instead of
// double-counting. SQLite has no ledger tables: the legacy cash flow stays the sole authority there, and
// posting is skipped. A posting failure fails the enclosing money transition (same transaction).
async function ledgerReady() {
  return persistence.backend === 'postgres' && !!(await ledgerAvailable(persistence));
}
const postOrderJournals = async (orderId: number) => {
  if (accountModes) {
    const order = await one('SELECT driver_id FROM orders WHERE id = ?', orderId);
    if (order?.driver_id != null) await closeCaptainIfSettled(order.driver_id);
  }
  if (!(await ledgerReady())) return;
  const o = (await one('SELECT * FROM orders WHERE id = ?', orderId))!;
  const receivable = await ledger.ensureAccount(`driver:${o.driver_id}:receivable`, 'driver_receivable', Number(o.driver_id));
  const revenue = await ledger.ensureAccount('platform:revenue', 'platform_revenue', null);
  const promo = await ledger.ensureAccount('platform:promo_expense', 'promo_expense', null);
  const commission = Number(o.commission_minor ?? 0), discount = Number(o.discount_minor ?? 0);
  if (commission > 0) await ledger.postJournal({ businessRef: `order:${o.id}:commission`, kind: 'commission_accrual', orderId: o.id as number,
    entries: [{ accountId: receivable.id as number, debitMinor: commission }, { accountId: revenue.id as number, creditMinor: commission }] });
  // DRV-17: the same predicate as owedColumns and the import: only a return this release closed (marker) loses its promo relief.
  if (discount > 0 && !(o.status === 'returned' && await one(`SELECT 1 FROM orders o WHERE o.id = ? AND ${noFareSql('o')}`, o.id))) await ledger.postJournal({ businessRef: `order:${o.id}:discount`, kind: 'discount_funding', orderId: o.id as number,
    entries: [{ accountId: promo.id as number, debitMinor: discount }, { accountId: receivable.id as number, creditMinor: discount }] });
};
// Shop door cash on PostgreSQL: the captain owes the goods (the shop's money) and the service fee (Wind's), so a remittance relieves a
// receivable that exists; a failed-trip pay is Wind's operating expense, owed to the captain against what he holds (DLV-15, DRV-17).
async function postShopJournal(orderId: number, driverId: number, kind: 'collection' | 'trip', amounts: { goods?: number; service?: number; over?: number; trip?: number }) {
  if (!(await ledgerReady())) return;
  const receivable = await ledger.ensureAccount(`driver:${driverId}:receivable`, 'driver_receivable', driverId);
  if (kind === 'collection') {
    const goods = amounts.goods ?? 0, service = amounts.service ?? 0, over = amounts.over ?? 0;
    if (goods + service + over <= 0) return;
    const shopPayable = await ledger.ensureAccount('platform:shop_goods_payable', 'merchant_cod_payable', null);
    const revenue = await ledger.ensureAccount('platform:revenue', 'platform_revenue', null);
    // ponytail: the customer overpay sits as a credit on a customer_receivable account; add its own kind if refunds of it get a flow.
    const overpay = over ? await ledger.ensureAccount('platform:customer_overpay', 'customer_receivable', null) : null;
    await ledger.postJournal({ businessRef: `order:${orderId}:shop_collection`, kind: 'cash_collection', orderId,
      entries: [{ accountId: receivable.id as number, debitMinor: goods + service + over },
        ...(goods ? [{ accountId: shopPayable.id as number, creditMinor: goods }] : []), ...(service ? [{ accountId: revenue.id as number, creditMinor: service }] : []),
        ...(overpay ? [{ accountId: overpay.id as number, creditMinor: over }] : [])] });
  } else if (amounts.trip) {
    const expense = await ledger.ensureAccount('platform:operating_expense', 'operating_expense', null);
    // An adjustment journal must say why (ledger_journals CHECK): without it every PostgreSQL shop trip pay failed the request.
    await ledger.postJournal({ businessRef: `order:${orderId}:shop_trip`, kind: 'adjustment', orderId, reason: 'Captain trip pay, shop order not delivered',
      entries: [{ accountId: expense.id as number, debitMinor: amounts.trip }, { accountId: receivable.id as number, creditMinor: amounts.trip }] });
  }
}
const captainPayAvailable = async () => persistence.backend === 'sqlite' || persistence.memo('captainPay', async () =>
  !!(await one("SELECT to_regclass('schema_migrations') AS migrations"))?.migrations
    && !!(await one('SELECT version FROM schema_migrations WHERE version=40')));
const postCashJournal = async (entryId: number) => {
  const entry = await one('SELECT * FROM cash_entries WHERE id = ?', entryId);
  if (!entry) return;
  if (await ledgerReady()) {
    const journal = await ledger.cashJournal(entry);
    if (journal) await ledger.postJournal(journal);
  }
  await shop.releaseSettledGoods(entry);
  if (accountModes && entry.status === 'confirmed') await closeCaptainIfSettled(entry.driver_id);
};
registerLedgerRoutes(route, ledger);
// Order locks serialize every payment to a captain for the same order.
async function captainPay(orderId: number, driverId: number, cents: number, source: 'trip_pay' | 'pickup_pay', actorId: number) {
  if (cents <= 0) return;
  if (!(await captainPayAvailable())) fail(503, 'captain_pay_schema_required');
  const saved = await one('SELECT * FROM cash_entries WHERE source = ? AND order_id = ?', source, orderId);
  if (saved) {
    if (saved.driver_id !== driverId || saved.kind !== 'adjustment' || saved.amount_cents !== -cents || saved.status !== 'confirmed')
      fail(409, 'idempotency_conflict');
    return;
  }
  const note = source === 'trip_pay' ? `DRV-17 trip pay order ${orderId}` : `DRV-18 pickup pay order ${orderId}`;
  const id = Number((await run(`INSERT INTO cash_entries (driver_id, kind, amount_cents, note, status, recorded_by, created_at, source, order_id)
    VALUES (?, 'adjustment', ?, ?, 'confirmed', ?, ?, ?, ?)`, driverId, -cents, note, actorId, Date.now(), source, orderId)).lastInsertRowid);
  await postCashJournal(id);
}
const shippingOrder = (o: Row) => o.service === 'parcel' || o.service === 'freight';
const fareCents = (o: Row) => Math.round(Number(o.price) * 100); // the booked fare, before any discount
function auditDetail(event: Row): Row {
  try { return (JSON.parse(String(event.detail)) ?? {}) as Row; } catch { return {}; }
}
// SHIP-08: the reattempt limit is the order's, whichever captain failed; pay (below) counts the holding captain's attempts.
const orderDeliveryAttempts = async (orderId: number) =>
  Number((await one("SELECT COUNT(*) AS n FROM security_events WHERE order_id = ? AND action = 'DELIVERY_EXCEPTION'", orderId))?.n);
async function shippingDeliveryAttempts(order: Row) {
  const events = await all("SELECT detail, created_at FROM security_events WHERE order_id = ? AND actor_id = ? AND action = 'DELIVERY_EXCEPTION'", order.id, order.driver_id);
  return events.filter(event => {
    const { assignmentEpoch } = auditDetail(event);
    // Older events have only their actor and timestamp to identify the assignment.
    return assignmentEpoch == null ? event.created_at >= (order.assigned_at ?? 0) : assignmentEpoch === order.assignment_epoch;
  }).length;
}
async function shippingTripPay(o: Row, status: 'completed' | 'returned', actorId: number, deliveredToOffice = false) {
  if (!shippingOrder(o) || o.driver_id == null) return;
  const attempts = await shippingDeliveryAttempts(o);
  if (status === 'completed') {
    await captainPay(o.id, o.driver_id, attempts * fareCents(o), 'trip_pay', actorId);
    return;
  }
  const { supportHasGoods, custodyBlocked } = await returnCustody(persistence, o);
  // A custody block is paid only by a clearing review.
  if (custodyBlocked) return;
  const trips = Math.max(1, attempts);
  const returnLegs = supportHasGoods ? 0 : deliveredToOffice ? 2 : 1;
  await captainPay(o.id, o.driver_id, (trips + returnLegs) * fareCents(o), 'trip_pay', actorId);
}
const pickupFixAge = 120_000;
function pickupDistance(order: Row, fix: { latitude: number; longitude: number }) {
  if (order.pickup_lat == null || order.pickup_lng == null) return;
  return crowKm(fix, { latitude: Number(order.pickup_lat), longitude: Number(order.pickup_lng) });
}
async function currentPickupEvidence(order: Row, driverId: number, since: number) {
  const fix = await one(`SELECT good_lat, good_lng, good_at FROM driver_locations WHERE driver_id = ?
    AND good_at BETWEEN ? AND ? AND good_acc BETWEEN 0 AND 200`, driverId, Math.max(since, Date.now() - pickupFixAge), Date.now());
  if (fix?.good_lat != null && fix.good_lng != null)
    return { km: pickupDistance(order, { latitude: fix.good_lat, longitude: fix.good_lng }), at: Number(fix.good_at) };
}
// Read before the assignment update can clear the previous fix. All three shipping assignment paths change driver_id.
async function recordAssignedFrom(orderId: number, driverId: number, actorId: number, position?: Row) {
  const order = (await one('SELECT assignment_epoch, pickup_lat, pickup_lng FROM orders WHERE id = ?', orderId))!;
  const now = Date.now();
  // The origin is server evidence only: the captain's validated fix, fresh at acceptance (Haiku r3 R3-1). A client-sent position
  // is corroboration only. The recorded origin is evidence for the support review.
  const fix = await one(`SELECT good_lat, good_lng, good_acc, good_at FROM driver_locations WHERE driver_id = ?
    AND good_at BETWEEN ? AND ? AND good_acc BETWEEN 0 AND 200`, driverId, now - pickupFixAge, now);
  if (fix?.good_lat == null || fix.good_lng == null) return;
  const validated = { latitude: Number(fix.good_lat), longitude: Number(fix.good_lng) };
  if (position !== undefined) {
    const sent = position && finite(position.latitude, 90) && finite(position.longitude, 180) && finite(position.accuracy, 200, 0)
      && finite(position.at, now + pickupFixAge, now - pickupFixAge) ? { latitude: position.latitude, longitude: position.longitude } : null;
    if (!sent || crowKm(sent, validated) > 0.15 + (Number(position.accuracy) + Number(fix.good_acc)) / 1000) return;
  }
  const km = pickupDistance(order, validated);
  if (km === undefined) return;
  await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'ASSIGNED_FROM', ?, ?)`,
    actorId, orderId, JSON.stringify({ km, fixAt: Number(fix.good_at), driverId, assignmentEpoch: Number(order.assignment_epoch) + 1 }), now);
}
async function assignmentOrigin(order: Row) {
  const events = await all("SELECT detail FROM security_events WHERE order_id = ? AND action = 'ASSIGNED_FROM' ORDER BY id DESC", order.id);
  return events.map(auditDetail).find(detail => detail.assignmentEpoch === order.assignment_epoch && detail.driverId === order.driver_id);
}
const pickupPayCents = (order: Row, km: number, rate: number) => pickupPayFor(fareCents(order), km, rate);
// DRV-18 evidence informs a support decision even when both fixes are available.
async function pickupPay(order: Row, actorId: number, reason: NonNullable<Order['pickupPayReview']>['reason']) {
  if (!shippingOrder(order) || order.driver_id == null) return;
  const from = await assignmentOrigin(order);
  const originKm = from && Number.isFinite(from.km) ? from.km : null;
  const current = await currentPickupEvidence(order, order.driver_id, order.assigned_at ?? 0);
  const currentKm = current?.km ?? null;
  // Two decimals, as the review card prefills it: the suggestion, the grant preview and the paid amount agree (Haiku r7 L-1).
  const drivenKm = originKm != null && currentKm != null ? Math.round(Math.max(0, originKm - currentKm) * 100) / 100 : null;
  const rate = (await settings()).pickupPayPerKm;
  const suggestedCents = drivenKm == null ? null : pickupPayCents(order, drivenKm, rate);
  await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'PICKUP_PAY_REVIEW', ?, ?)`,
    actorId, order.id, JSON.stringify({ reason, rate, originKm, currentKm, drivenKm, suggestedCents, originFixAt: from?.fixAt ?? null, currentFixAt: current?.at ?? null,
      driverId: order.driver_id, assignmentEpoch: order.assignment_epoch }), Date.now());
}
type PickupReview = NonNullable<Order['pickupPayReview']>;
async function pickupReview(orderId: number, lock = false): Promise<PickupReview | undefined> {
  const events = await all(`SELECT id, action, detail FROM security_events WHERE order_id = ?
    AND action IN ('PICKUP_PAY_REVIEW', 'PICKUP_PAY_DECIDED') ORDER BY id DESC${lock ? ' FOR UPDATE' : ''}`, orderId);
  const review = events.find(event => event.action === 'PICKUP_PAY_REVIEW');
  if (!review) return;
  const decision = events.find(event => event.action === 'PICKUP_PAY_DECIDED' && event.id > review.id);
  return { ...auditDetail(review), decision: decision ? auditDetail(decision) : null } as PickupReview;
}
registerPickupPayRoutes(route, async ({ user, params, body }) => {
  need(user, 'admin');
  needStaff(await staffActor(persistence, user), fail, 'finance', 'support');
  const { granted, km } = body;
  const reason = text(body.reason, 500);
  if (typeof granted !== 'boolean' || !finite(km, 200, 0) || reason.length < 5) fail(400, 'invalid_input');
  const id = Number(params[0]);
  await persistence.exec('BEGIN IMMEDIATE');
  try {
    const lock = persistence.backend === 'postgres';
    const order = await one(`SELECT * FROM orders WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, id) ?? fail(404, 'not_found');
    const review = await pickupReview(id, lock) ?? fail(404, 'not_found');
    if (!shippingOrder(order) || order.status !== 'cancelled' || !currentPickupReview(order, review))
      fail(409, 'order_changed');
    if (review.decision) {
      const saved = review.decision;
      if (saved.granted !== granted || saved.km !== km || saved.reason !== reason || saved.decidedBy !== user.id) fail(409, 'review_decided');
      await persistence.exec('COMMIT');
      return saved;
    }
    if (granted && !(await settleableDriver(order.driver_id))) fail(409, 'driver_departed');
    const paidCents = granted ? pickupPayCents(order, km, review.rate) : 0;
    if (granted) await captainPay(id, order.driver_id, paidCents, 'pickup_pay', user.id);
    const decision = { granted, km, reason, paidCents, decidedBy: user.id, decidedAt: Date.now() };
    await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'PICKUP_PAY_DECIDED', ?, ?)`,
      user.id, id, JSON.stringify(decision), decision.decidedAt);
    if (accountModes) await closeCaptainIfSettled(order.driver_id);
    await persistence.exec('COMMIT');
    return decision;
  } catch (error) { await persistence.exec('ROLLBACK'); throw error; }
});
const payments = createPayments(persistence, fail);
registerPaymentsRoutes(route, payments);
// OpenCode / T3 provider service (runs zro CLI and records jobs)
const opencodeService = createOpencode(persistence, fail);
registerOpencodeRoutes(route, opencodeService);
const ops = new Ops(persistence, fail);
registerOpsRoutes(route, ops);
registerRuntimeRoutes(route, { db: persistence, need, needActive, fail, limit });
registerDriverReceiptRoutes(route, { db: persistence, need, needActive, fail });
registerCommandReceiptRoutes(route, { db: persistence, fail });
registerCustodyRoutes(route, { db: persistence, fail });
registerOfficeRoutes(route, { db: persistence, fail, need, text, push: (ids, kind, order, path) => queuePush(ids, kind, order, path) });
const nativePush = new NativePush(persistence, fail);
registerNativePushRoutes(route, nativePush);
const realtime = new Realtime(persistence, fail);
registerRealtimeRoutes(route, realtime);
export const phoneIdentity = new PhoneIdentity(persistence, fail, value => hashPassword(newPassword(value, 12)), checkPassword);
registerPhoneRoutes(route, phoneIdentity);
const recoveryChallenge = (purpose: EntraPurpose) => async ({ user, req }: Pick<Ctx, 'req'> & { user: User }) => {
  if (!entra || !(await one('SELECT entra_oid FROM users WHERE id=?', user.id))?.entra_oid) fail(409, 'entra_unavailable');
  await limit(identityKey(`${purpose}-challenge`, user.id), 10, 10 * 60_000);
  const token = /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')?.[1] ?? fail(401, 'unauthorized');
  const nonce = randomBytes(32).toString('hex');
  await run('DELETE FROM entra_replay WHERE expires_at < ?', Date.now());
  await run('INSERT INTO entra_replay(token_hash,expires_at) VALUES(?,?)', sha(`${purpose}-challenge:${token}:${nonce}`), Date.now() + 5 * 60_000);
  return { nonce };
};
registerEntraRoutes(route, entraExchange, recoveryChallenge);
if (!modeRollback) await phoneIdentity.reconcileStale();

route('GET', '/api/health', async ({ query }) => ({ ok: true, ...(query.get('protocol') === '1' ? { protocol: await protocolCapabilities() } : {}) }), true);
route('GET', '/api/auth/options', () => ({ registrationOpen, emailReset: emailReady,
  ...(accountModes && { profiles: true }), ...(firebaseEmail.resetEnabled ? { emailResetLinkProof: true } : {}) }), true);
route('GET', '/api/ready', async () => {
  let schema = 3;
  try {
    if (persistence.backend === 'sqlite') {
      accessSync(dirname(process.env.DB_PATH ?? 'wind.db'), constants.W_OK);
      accessSync(process.env.DB_PATH ?? 'wind.db', constants.W_OK);
      await one('SELECT COUNT(*) n FROM sqlite_schema');
    } else {
      const version = await postgresSchemaVersion(persistence);
      if (version === null) return fail(503, 'unavailable');
      schema = version;
    }
    (await persistence.exec('BEGIN IMMEDIATE')); (await persistence.exec('ROLLBACK'));
  } catch { fail(503, 'unavailable'); }

  return { ok: true, schema, ...(persistence.backend === 'postgres' && { backend: 'postgres' }) };
}, true);




route('POST', '/api/auth/register', async ({ body, req }) => {
  if (!registrationOpen) fail(403, 'registration_closed');
  if (contactVerificationRequired) fail(403, 'verification_required'); // attach actual proof before opening this future gate
  const phone = normalizePhone(String(body.phone ?? '')) ?? fail(400, 'invalid_phone');
  const name = text(body.name, 60);
  const password = newPassword(body.password);
  const email = selfService && body.email != null && !(typeof body.email === 'string' && !body.email.trim())
    ? normalizeEmail(body.email) ?? fail(400, 'invalid_email') : null;
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
    await persistence.exec('BEGIN IMMEDIATE');
    try {
      const legacyDriver = role === 'driver' && !accountModes;
      const id = Number((await run('INSERT INTO users (phone, name, password, role, status, vehicle, plate, created_at, email, consent_at, consent_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        phone, name, hashed, legacyDriver ? 'driver' : 'customer', legacyDriver ? 'pending' : 'active', legacyDriver ? vehicle : null, legacyDriver ? plate : null, Date.now(), email,
        selfService ? Date.now() : null, selfService ? '2026-10-03' : null)).lastInsertRowid);
      // A new driver waits for approval: tell the admins, or they only see it on the dashboard (SPEC-driver-signup-alert.md).
      if (accountModes && vehicle) await createCaptainApplication(id, vehicle, plate);
      else if (legacyDriver) await queuePush((await adminIds()), 'attention', 0, '/admin/users');
      const session = await startSession(id);
      await persistence.exec('COMMIT');
      return [id, session] as const;
    } catch (error) {
      await persistence.exec('ROLLBACK');
      throw error;
    }
  });
  if (!emailReady || !email) return session;
  const address = clientAddress(req);
  firebaseEmail.background(async () => {
    await limitEmailSend('verify', email, address);
    const sessionHash = sha(session.token);
    const send = await emailTransaction(async () => {
      const account = await lockEmailAccount(id);
      if (account.email !== email || account.password !== hashed || !await recoveryEmailSessionActive(account, sessionHash)) return;
      return reserveEmailCode(account, 'verify', sessionHash);
    });
    await send?.();
  });
  return { ...session, emailCode: 'requested' };
}, true);

route('POST', '/api/auth/login', async ({ body }) => {
  const identifier = String(body.identifier ?? body.phone ?? '').trim();
  const phone = normalizePhone(identifier), email = normalizeEmail(identifier);
  const key = identityKey('login', phone ?? phoneIdentity.loginThrottleKey(identifier) ?? email ?? identifier.toLowerCase());
  // Counted when the attempt starts, not after it fails: checking first let dozens of parallel guesses pass the check
  // before the first failure was recorded (release review, 18 Nov). A successful sign-in clears the count below.
  (await limit(key, 5, 10 * 60_000));
  const legacyAccount = phone ? (await one('SELECT * FROM users WHERE phone = ?', phone))
    : email ? (await one('SELECT * FROM users WHERE email = ? COLLATE NOCASE', email)) : undefined;
  const r = legacyAccount ?? await phoneIdentity.loginAccount(identifier);
  const valid = await checkLoginPassword(String(body.password ?? ''), r?.password);
  if (!valid) fail(401, 'wrong_credentials');
  const account = r ?? fail(401, 'wrong_credentials');
  (await run('DELETE FROM request_limits WHERE key = ?', key));
  return emailTransaction(async () => {
    // A reset can revoke sessions while an earlier password check is still running.
    const current = await one(`SELECT * FROM users WHERE id = ?${persistence.backend === 'postgres' ? ' FOR UPDATE' : ''}`, account.id)
      ?? fail(401, 'wrong_credentials');
    if (current.password !== account.password) fail(401, 'wrong_credentials');
    if (current.status === 'blocked') fail(403, 'blocked');
    if (!await contactAllowed(current)) fail(403, 'verification_required');
    if (production && !selfService && !current.phone_verified_at) fail(403, 'phone_not_verified');
    if (production && selfService && current.role === 'admin' && !current.phone_verified_at && !current.approved_at) fail(403, 'pending_approval');
    return startSession(current.id);
  });
}, true);

async function startSession(userId: number) {
  const token = randomBytes(32).toString('hex');
  const sessionHash = sha(token);
  const now = Date.now();
  const account = (await one('SELECT * FROM users WHERE id = ?', userId))!;
  if (!accountModes) {
    await run('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)', sessionHash, userId, now, now);
    return { token, ...await me(await toUser(account), false, sessionHash) };
  }
  const mode = await defaultMode(persistence, account, now);
  await run(`INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, active_mode, mode_revision, last_activity_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, sessionHash, userId, now, now, mode, mode === 'personal' ? 0 : 1, now);
  return { token, ...await me(await userInMode(account, mode, mode === 'personal' ? 0 : 1), false, sessionHash) };
}

async function me(user: User, payroll = false, sessionHash?: string) {
  const rideOfferSeconds = user.role === 'driver' ? await dispatch.offerSeconds(user.id) : undefined;
  const offerRecoveryEmail = user.role === 'customer' && !user.email && (emailReady || firebaseEmail.resetEnabled)
    && !!await one("SELECT 1 FROM orders WHERE customer_id = ? AND status = 'completed' LIMIT 1", user.id);
  const shadow = process.env.WIND_PROFILE_SHADOW === '1';
  const profiles = sessionHash && (shadow || accountModes)
    ? await previewProfiles(persistence, user, sessionHash, enabledServices.includes('shop'), accountModes) : undefined;
  if (profiles && shadow) console.info(JSON.stringify({ category: 'profile_shadow', mode: profiles.mode,
    roleMatches: profiles.role === user.role, captainAvailable: profiles.captain?.available ?? false }));
  const accountProfile = accountModes && profiles ? { ...profiles,
    captainOnline: profiles.mode === 'captain' && await captainOnline(persistence, user.id, Date.now(), sessionHash),
    workInHand: profiles.mode === 'captain' && await captainHasWork(persistence, user.id),
    ...(profiles.mode === 'captain' && sessionHash && { captainOfflineReason: await captainOfflineReason(persistence, user.id, sessionHash) }),
    updates: await waitingProfileUpdates(user.id),
    ...(profiles.mode === 'shop' && profiles.shop && { shopOrdersOpen: Number((await one(`SELECT COUNT(*) AS n FROM shop_orders s
      JOIN orders o ON o.id = s.order_id WHERE s.merchant_id = ? AND o.status IN ('requested','searching',${activeSql})`, profiles.shop.id))!.n) }) } : undefined;
  return { user, subscription: user.accountMode === 'shop' ? null : await latestSubscription(user.id, user.role),
    plan: user.accountMode === 'shop' ? null : await activePlan(user.id, user.role), ...settingsResponse(await settings(), payroll && user.role === 'admin'), rideOfferSeconds,
    ...(profiles && shadow && { profilePreview: profiles }), ...(accountProfile && { accountProfile }),
    capabilities: { enabledServices, pooling: enabledServices.includes('ride'), ...(await presenceOffered() ? {} : { driverPresence: false }),
      ...(accountModes && { accountProfiles: true }),
      emailVerification: emailReady,
      ...(firebaseEmail.verificationEnabled ? { emailVerificationLink: true } : {}),
      ...(firebaseEmail.resetEnabled ? { emailResetLinkProof: true } : {}),
      ...(offerRecoveryEmail ? { offerRecoveryEmail: true } : {}), ...(await scopeAvailable(persistence) ? { declaredScope: true } : {}) } };
}

// Email (Cloudflare Email Service REST API): a 6-digit code verifies the address, resets a forgotten password, and lets
// support confirm a caller owns the account. Off until all three settings exist; the app then shows these flows.
const emailFrom = process.env.WIND_EMAIL_FROM?.trim();
const cloudflareAccount = process.env.CLOUDFLARE_ACCOUNT_ID?.trim(), cloudflareToken = process.env.CLOUDFLARE_EMAIL_TOKEN?.trim();
const emailReady = !!(emailFrom && cloudflareAccount && cloudflareToken);
const cloudflareApi = (process.env.CLOUDFLARE_API_BASE ?? 'https://api.cloudflare.com/client/v4').replace(/\/$/, '');
const CODE_TTL = 15 * 60_000, CODE_GAP = 60_000, CODE_TRIES = 5;
const firebaseEmail = firebaseEmailService(persistence, firebaseReset, emailReady ? undefined : firebaseContinuationUrl());
if (process.env.WIND_FIREBASE_EMAIL_LINKS === '1' && !emailReady && !firebaseEmail.verificationEnabled)
  console.error('Firebase email settings are invalid: recovery links stay off');
async function clearFirebaseReset(userId: number) {
  await retireFirebaseEmail(persistence, userId);
}
async function revokeUserAccess(userId: number) {
  await run('DELETE FROM sessions WHERE user_id = ?', userId);
  await run('DELETE FROM push_subscriptions WHERE user_id = ?', userId);
  await clearFirebaseReset(userId);
}
async function endRoleBenefits(userId: number) {
  // Keep paid revenue history while ending benefits belonging to the previous role.
  await run("UPDATE subscriptions SET ends_at = MIN(ends_at, ?) WHERE user_id = ? AND status = 'active'", Date.now(), userId);
  await run("UPDATE subscriptions SET status = 'rejected' WHERE user_id = ? AND status = 'pending'", userId);
}
type CodePurpose = 'verify' | 'reset' | 'support';
const codeMail: Record<CodePurpose, (code: string) => [string, string[]]> = {
  verify: code => [`رمز ويند ${code} · Wind code`, [`رمز تأكيد بريدك في ويند: ${code}`, 'ينتهي خلال 15 دقيقة. إن لم تطلبه فتجاهل هذه الرسالة.', '',
    `Your Wind email confirmation code: ${code}`, 'It expires in 15 minutes. If you did not ask for it, ignore this email.']],
  reset: code => [`رمز إعادة كلمة المرور ${code} · Wind password code`, [`رمز إعادة تعيين كلمة مرور ويند: ${code}`, 'ينتهي خلال 15 دقيقة. لا تشاركه مع أحد، فريق ويند لن يطلبه منك.', '',
    `Your Wind password reset code: ${code}`, 'It expires in 15 minutes. Never share it; Wind staff will never ask for it.']],
  support: code => [`رمز التحقق للدعم ${code} · Wind support check`, [`دعم ويند يتحقق من هويتك. الرمز: ${code}`, 'اقرأه لموظف الدعم فقط إن كنت أنت من تواصل مع ويند. ينتهي خلال 15 دقيقة.', '',
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
const codeHash = (r: Row, purpose: CodePurpose, code: string, sessionHash?: string) =>
  createHmac('sha256', codeKey).update(`${purpose}:${r.id}:${String(r.email).toLowerCase()}:${code}:${sessionHash ?? ''}`).digest('hex');
async function reserveEmailCode(r: Row, purpose: CodePurpose, sessionHash?: string) {
  if (purpose === 'verify' && !sessionHash) throw new Error('Email verification needs an initiating session');
  if (!r.email) fail(409, 'no_email');
  const last = (await one('SELECT sent_at FROM email_codes WHERE user_id = ? AND purpose = ?', r.id, purpose));
  if (last && Date.now() - last.sent_at < CODE_GAP) fail(429, 'code_recently_sent');
  (await limit(identityKey(`email-${purpose}`, r.id), 5, 60 * 60_000));
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0'), now = Date.now();
  const hash = codeHash(r, purpose, code, sessionHash);
  (await run(`INSERT INTO email_codes (user_id, purpose, code_hash, sent_at, expires_at, tries) VALUES (?, ?, ?, ?, ?, 0)
    ON CONFLICT(user_id, purpose) DO UPDATE SET code_hash = excluded.code_hash, sent_at = excluded.sent_at, expires_at = excluded.expires_at, tries = 0`,
  r.id, purpose, hash, now, now + CODE_TTL));
  return async () => {
    const generation = [r.id, purpose, hash, now];
    const where = 'WHERE user_id = ? AND purpose = ? AND code_hash = ? AND sent_at = ?';
    if (!await one(`SELECT 1 FROM email_codes ${where} AND expires_at > ?`, ...generation, Date.now())) return false;
    const [subject, lines] = codeMail[purpose](code);
    try { await sendEmail(r.email, subject, lines); }
    catch (error) { await run(`DELETE FROM email_codes ${where}`, ...generation); throw error; }
    return true;
  };
}
// A code works once, for 15 minutes, for the address it was sent to; five wrong tries void it.
async function useCode(r: Row, purpose: CodePurpose, input: unknown, consume = true, sessionHash?: string) {
  const row = (await one('SELECT * FROM email_codes WHERE user_id = ? AND purpose = ? AND expires_at > ?', r.id, purpose, Date.now())) ?? fail(400, 'code_expired');
  const code = typeof input === 'string' ? input.trim() : '';
  if (!/^\d{6}$/.test(code) || !timingSafeEqual(Buffer.from(codeHash(r, purpose, code, sessionHash), 'hex'), Buffer.from(row.code_hash, 'hex'))) {
    const spent = row.tries + 1 >= CODE_TRIES;
    if (spent) (await run('DELETE FROM email_codes WHERE user_id = ? AND purpose = ?', r.id, purpose));
    else (await run('UPDATE email_codes SET tries = tries + 1 WHERE user_id = ? AND purpose = ?', r.id, purpose));
    fail(400, spent ? 'code_expired' : 'wrong_email_code'); // wrong_code is the handover code's
  }
  if (!consume) return row.code_hash as string;
  // A reset runs outside the request transaction while hashing. Two requests
  // may read the same code; only the request that atomically consumes it wins.
  if (!(await run('DELETE FROM email_codes WHERE user_id = ? AND purpose = ? AND code_hash = ? AND expires_at > ? AND tries < ?',
    r.id, purpose, row.code_hash, Date.now(), CODE_TRIES)).changes) fail(400, 'code_expired');
  return row.code_hash as string;
}

async function lockEmailAccount(id: number) {
  const row = await one(`SELECT * FROM users WHERE id = ?${persistence.backend === 'postgres' ? ' FOR UPDATE' : ''}`, id);
  return row && row.status !== 'blocked' ? row : fail(401, 'unauthorized');
}
async function currentEmailProfile(id: number, req?: IncomingMessage) {
  if (accountModes && req) return emailTransaction(() => sessionProfile(req));
  return me(await toUser((await one('SELECT * FROM users WHERE id = ?', id))!));
}
async function sessionProfile(req: IncomingMessage, payroll = false) {
  const token = bearer(req) ?? fail(401, 'unauthorized');
  return me(await authenticate(req, false) ?? fail(401, 'unauthorized'), payroll, sha(token));
}
async function emailTransaction<T>(work: () => Promise<T>) {
  await persistence.exec('BEGIN IMMEDIATE');
  try {
    const result = await work();
    await persistence.exec('COMMIT');
    return result;
  } catch (error) { return persistence.rollbackAfterError(error); }
}
async function recoveryEmailSessionActive(account: Row, sessionHash: string) {
  const now = Date.now();
  const session = await one(`SELECT 1 FROM sessions WHERE token_hash = ? AND user_id = ? AND created_at > ?
    AND COALESCE(last_seen_at, created_at) > ?${persistence.backend === 'postgres' ? ' FOR SHARE' : ''}`,
  sessionHash, account.id, now - SESSION_DAYS * DAY, now - SESSION_IDLE_DAYS * DAY);
  return session && await sessionEligible(account);
}
async function emailAuthority({ user, body, req }: Ctx & { user: User }) {
  if (body.current === undefined && body.idToken === undefined) fail(426, 'client_update_required');
  const key = identityKey('recovery-email-auth', user.id);
  await limit(key, 20, 10 * 60_000);
  const token = bearer(req) ?? fail(401, 'unauthorized');
  const sessionHash = sha(token);
  const snapshot = await one('SELECT password, entra_oid FROM users WHERE id = ?', user.id) ?? fail(401, 'unauthorized');
  const proof = await entraProof('recovery-email', token, body, snapshot.entra_oid);
  if (!proof && !await checkPassword(typeof body.current === 'string' ? body.current : '', snapshot.password))
    fail(401, body.idToken ? 'invalid_token' : 'wrong_password');
  const check = async () => {
    const account = await lockEmailAccount(user.id);
    const now = Date.now();
    if (!await recoveryEmailSessionActive(account, sessionHash)) fail(401, 'unauthorized');
    if (account.password !== snapshot.password) fail(401, 'wrong_password');
    if (proof) {
      if (account.entra_oid !== proof.oid || proof.expiresAt <= now || !proof.authenticatedAt || proof.authenticatedAt < now - 5 * 60_000 - 999)
        fail(401, 'invalid_token');
      await spendEntraProof(proof);
    }
    return account;
  };
  return { sessionHash, check };
}
async function limitEmailSend(purpose: 'verify' | 'reset', recipient: string, address: string) {
  await limit(identityKey(`recovery-${purpose}-recipient`, recipient.toLowerCase()), 5, 60 * 60_000);
  await limit(identityKey(`recovery-${purpose}-address`, address), 20, 60 * 60_000);
}

route('POST', '/api/me/email/code', async ctx => {
  if (!emailReady) fail(503, 'email_unavailable');
  const { check, sessionHash } = await emailAuthority(ctx);
  const address = clientAddress(ctx.req);
  const send = await emailTransaction(async () => {
    const current = await check();
    if (await recoveryEmailVerified(persistence, current)) fail(409, 'already_verified');
    await limitEmailSend('verify', current.email ?? fail(409, 'no_email'), address);
    return reserveEmailCode(current, 'verify', sessionHash);
  });
  if (!await send()) fail(409, 'user_changed');
  return { sent: true };
});
route('POST', '/api/me/email', async ctx => {
  const { check } = await emailAuthority(ctx);
  const email = normalizeEmail(ctx.body.email) ?? fail(400, 'invalid_email');
  await emailTransaction(async () => {
    const account = await check();
    if (await recoveryEmailVerified(persistence, account)) fail(409, 'already_verified'); // verified addresses change through support
    if (account.email === email) return;
    if (await one('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id <> ?', email, account.id)) fail(409, 'email_taken');
    await run('UPDATE users SET email = ?, email_verified_at = NULL WHERE id = ?', email, account.id);
    await run('DELETE FROM recovery_email_proofs WHERE user_id = ?', account.id);
    await run('DELETE FROM email_codes WHERE user_id = ?', account.id);
    await clearFirebaseReset(account.id);
  });
  return currentEmailProfile(ctx.user.id, ctx.req);
});
route('POST', '/api/me/email/verify', async ctx => {
  if (!emailReady) fail(503, 'email_unavailable');
  const { check, sessionHash } = await emailAuthority(ctx);
  await emailTransaction(async () => {
    const account = await check();
    if (!await recoveryEmailVerified(persistence, account)) {
      // Committing an invalid code's try counter preserves the lockout even when validation fails.
      let refusal: HttpError | undefined;
      try { await useCode(account, 'verify', ctx.body.code, true, sessionHash); }
      catch (error) {
        if (!(error instanceof HttpError)) throw error;
        refusal = error;
      }
      if (refusal) return refusal;
      await recordRecoveryEmailProof(persistence, account.id, account.email, 'cloudflare-code');
    }
  }).then(refusal => { if (refusal) throw refusal; });
  return currentEmailProfile(ctx.user.id, ctx.req);
});

// The same response for missing and eligible accounts. Only a current, proven address can receive recovery mail.
const accountFor = async (identifier: unknown) => {
  const value = String(identifier ?? '').trim(), phone = normalizePhone(value), email = normalizeEmail(value);
  const account = phone ? await one('SELECT * FROM users WHERE phone = ?', phone)
    : email ? await one('SELECT * FROM users WHERE email = ? COLLATE NOCASE', email) : undefined;
  return account && account.status !== 'blocked' && account.role !== 'admin' && await recoveryEmailVerified(persistence, account)
    ? account : undefined;
};
route('POST', '/api/auth/reset/code', ({ body, req }) => {
  if (!emailReady) fail(503, 'email_unavailable');
  const address = clientAddress(req);
  firebaseEmail.background(async () => {
    const account = await accountFor(body.identifier);
    if (!account) return;
    await limitEmailSend('reset', account.email, address);
    const send = await emailTransaction(async () => {
      const current = await lockEmailAccount(account.id);
      if (current.email !== account.email || current.password !== account.password || current.role === 'admin'
        || !await recoveryEmailVerified(persistence, current)) return;
      return reserveEmailCode(current, 'reset');
    });
    await send?.();
  });
  return { ok: true };
}, true);

const requestResetLink: Handler = ({ body, req }) => {
  if (!firebaseEmail.resetEnabled) fail(503, 'email_unavailable');
  const address = clientAddress(req);
  firebaseEmail.background(async () => {
    const account = await accountFor(body.identifier);
    if (!account) return;
    await limitEmailSend('reset', account.email, address);
    await limit(identityKey('firebase-reset-send-gap', account.id), 1, CODE_GAP);
    await limit(identityKey('firebase-reset-send', account.id), 5, 60 * 60_000);
    const dispatch = await emailTransaction(async () => {
      const current = await lockEmailAccount(account.id);
      if (current.email !== account.email || current.password !== account.password || current.role === 'admin'
        || !await recoveryEmailVerified(persistence, current)) return;
      return firebaseEmail.reserve(current, 'reset', null, body.lang === 'en' ? 'en' : 'ar', address);
    });
    dispatch?.();
  });
  return { ok: true };
};

const requestVerificationLink: Handler = async ctx => {
  if (!firebaseEmail.verificationEnabled) fail(503, 'email_unavailable');
  const { sessionHash, check } = await emailAuthority(ctx);
  const id = ctx.user.id;
  const address = clientAddress(ctx.req);
  const dispatch = await emailTransaction(async () => {
    const account = await check();
    if (await recoveryEmailVerified(persistence, account)) fail(409, 'already_verified');
    const email = account.email ?? fail(409, 'no_email');
    await limit(identityKey('firebase-email-send-gap', id), 1, CODE_GAP);
    await limit(identityKey('firebase-email-send', id), 5, 60 * 60_000);
    await limitEmailSend('verify', email, address);
    return firebaseEmail.reserve(account, 'verify', sessionHash, ctx.body.lang === 'en' ? 'en' : 'ar', address);
  });
  dispatch();
  return { sent: true };
};
const confirmVerificationLink: Handler = async ctx => {
  if (!firebaseEmail.verificationEnabled) fail(503, 'email_unavailable');
  const { sessionHash, check } = await emailAuthority(ctx);
  await limit(identityKey('firebase-email-confirm', ctx.user.id), 10, 60_000);
  const account = await one('SELECT * FROM users WHERE id = ?', ctx.user.id);
  const attempt = account && await firebaseEmail.pending(account, 'verify', ctx.body.mailboxProof, sessionHash);
  if (!attempt || !await firebaseEmail.checkVerification(attempt).catch(() => false)) fail(400, 'wrong_email_code');
  await emailTransaction(async () => {
    const current = await check();
    if ((await firebaseEmail.pending(current, 'verify', ctx.body.mailboxProof, sessionHash, true))?.uid !== attempt!.uid)
      fail(400, 'wrong_email_code');
    await recordRecoveryEmailProof(persistence, current.id, current.email, 'firebase-link');
  });
  return currentEmailProfile(ctx.user.id, ctx.req);
};

const adoptResetLink: Handler = async ({ body }) => {
  if (!firebaseEmail.resetEnabled) fail(503, 'email_unavailable');
  const password = newPassword(body.password);
  const deny = () => fail(400, 'wrong_email_code');
  if (!validMailboxProof(body.mailboxProof)) deny();
  const account = await accountFor(body.identifier) ?? deny();
  const attempt = await firebaseEmail.pending(account, 'reset', body.mailboxProof, null) ?? deny();
  if (!await firebaseEmail.checkPassword(attempt, password).catch(() => false)) deny();
  const hashed = await hashPassword(password);
  await persistence.atomic({ id: account.id }, () => emailTransaction(async () => {
    const current = await lockEmailAccount(account.id);
    if (current.role === 'admin' || !await recoveryEmailVerified(persistence, current)
      || (await firebaseEmail.pending(current, 'reset', body.mailboxProof, null, true))?.uid !== attempt.uid) deny();
    await run('UPDATE users SET password = ? WHERE id = ?', hashed, current.id);
    await revokeUserAccess(current.id);
    for (const id of [current.phone, current.email].filter(Boolean)) await run('DELETE FROM request_limits WHERE key = ?', identityKey('login', String(id).toLowerCase()));
    await run("INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, NULL, 'FIREBASE_PASSWORD_RESET', '{}', ?)", current.id, Date.now());
  }));
  firebaseEmail.background(() => firebaseEmail.sweep({ userId: account.id }));
  return { ok: true };
};
registerRecoveryEmailRoutes(route, {
  challenge: recoveryChallenge('recovery-email'), requestVerificationLink, confirmVerificationLink, requestResetLink, adoptResetLink,
});

route('POST', '/api/auth/reset', async ({ body }) => {
  const password = await hashPassword(newPassword(body.password)); // before the lookup: the same checks whether or not it exists
  // One answer for every miss (no account, no code, wrong or spent code), so failures say nothing about the account.
  const r = (await accountFor(body.identifier)) ?? fail(400, 'wrong_email_code');
  let codeHash: string;
  try { codeHash = await useCode(r, 'reset', body.code, false); }
  catch (error) { throw error instanceof HttpError && error.status === 400 ? new HttpError(400, 'wrong_email_code') : error; }
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    const current = await one(`SELECT * FROM users WHERE id = ?${persistence.backend === 'postgres' ? ' FOR UPDATE' : ''}`, r.id);
    if (!current || current.password !== r.password || current.email !== r.email || !await recoveryEmailVerified(persistence, current)
      || current.status === 'blocked' || current.role === 'admin') fail(400, 'wrong_email_code');
    // Claim the code with the password and session writes. A failed write must leave a retryable code.
    if (!(await run('DELETE FROM email_codes WHERE user_id = ? AND purpose = ? AND code_hash = ? AND expires_at > ? AND tries < ?',
      r.id, 'reset', codeHash, Date.now(), CODE_TRIES)).changes) fail(400, 'wrong_email_code');
    (await run('UPDATE users SET password = ? WHERE id = ?', password, r.id));
    (await run('DELETE FROM sessions WHERE user_id = ?', r.id)); // a reset ends the session on every device
    (await run('DELETE FROM push_subscriptions WHERE user_id = ?', r.id));
    await clearFirebaseReset(r.id);
    for (const id of [r.phone, r.email].filter(Boolean)) (await run('DELETE FROM request_limits WHERE key = ?', identityKey('login', String(id).toLowerCase())));
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  return { ok: true }; // the app then signs in normally, through every login gate
}, true);

route('POST', '/api/auth/logout', async ({ user, req }) => {
  if (accountModes && user.role !== 'admin') return emailTransaction(async () => {
    const current = await authenticate(req, false);
    if (!current) return { ok: true };
    const hash = sha(bearer(req)!);
    if (current.accountMode === 'captain') await setCaptainOffline(persistence, current.id);
    await run('DELETE FROM sessions WHERE user_id = ? AND token_hash = ?', current.id, hash);
    return { ok: true };
  });
  forgetDriver(user.id); // off the nearby-cars map at once (nearby.ts)
  (await run('DELETE FROM sessions WHERE user_id = ?', user.id));
  (await run('DELETE FROM push_subscriptions WHERE user_id = ?', user.id)); // every session ended, so every browser stops alerting
  return { ok: true };
});
route('GET', '/api/me', async ({ user, query, req }) => {
  const token = bearer(req);
  if (!accountModes) return me(user, query.get('payroll') === '1', token && sha(token));
  const sessionHash = sha(token!);
  const current = await authenticate(req, false) ?? fail(401, 'unauthorized');
  // only the launch reset writes, so plain polls skip the write lock
  if (current.accountMode !== 'captain' || query.get('launch') !== '1')
    return me(current, query.get('payroll') === '1', sessionHash);
  return emailTransaction(async () => {
    const locked = await authenticate(req, false) ?? fail(401, 'unauthorized');
    if (locked.accountMode === 'captain')
      await setCaptainOffline(persistence, locked.id, await captainOfflineReason(persistence, locked.id, sessionHash, Date.now(), true));
    return me(locked, query.get('payroll') === '1', sessionHash);
  });
});

async function changeSessionMode({ user, body, req }: Pick<Ctx, 'body' | 'req'> & { user: { id: number } }) {
  if (!accountModes) fail(404, 'not_found');
  const mode = body.mode;
  if (!supportedMode(mode) || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) fail(400, 'invalid_input');
  const token = bearer(req) ?? fail(401, 'unauthorized');
  const sessionHash = sha(token);
  return emailTransaction(async () => {
    if (!await authenticate(req, false)) fail(401, 'unauthorized');
    await switchSessionMode(persistence, sessionHash, user.id, mode, body.expectedRevision, enabledServices.includes('shop'), fail);
    return sessionProfile(req);
  });
}

async function changeCaptainAvailability({ user, body, req }: Pick<Ctx, 'body' | 'req'> & { user: { id: number } }) {
  if (!accountModes) fail(404, 'not_found');
  if (typeof body.online !== 'boolean' || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) fail(400, 'invalid_input');
  const token = bearer(req) ?? fail(401, 'unauthorized');
  const sessionHash = sha(token);
  return emailTransaction(async () => {
    if (!await authenticate(req, false)) fail(401, 'unauthorized');
    await setCaptainAvailability(persistence, sessionHash, user.id, body.expectedRevision, body.online, fail);
    return sessionProfile(req);
  });
}

async function endOtherSessions({ user, body, req }: Pick<Ctx, 'body' | 'req'> & { user: { id: number } }) {
  if (!accountModes) fail(404, 'not_found');
  if ((await authenticate(req, false))?.role === 'admin') fail(403, 'forbidden');
  const hash = sha(bearer(req) ?? fail(401, 'unauthorized'));
  await limit(identityKey('other-phones', user.id), 5, 10 * 60_000);
  const account = await one('SELECT password FROM users WHERE id = ?', user.id);
  if (!await checkLoginPassword(String(body.password ?? ''), account?.password)) fail(401, 'wrong_credentials');
  await emailTransaction(async () => {
    const locked = await one('SELECT password FROM users WHERE id = ?', user.id);
    if (locked?.password !== account?.password || !await authenticate(req, false)) fail(401, 'unauthorized');
    if (await one("SELECT 1 FROM sessions WHERE user_id = ? AND active_mode = 'captain' AND token_hash <> ?", user.id, hash))
      await setCaptainOffline(persistence, user.id);
    const removed = await run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', user.id, hash);
    await run('DELETE FROM push_subscriptions WHERE user_id = ? AND auth_session_hash IS NULL', user.id);
    if (removed.changes) await run("INSERT INTO security_events(actor_id,action,detail,created_at) VALUES (?,'OTHER_SESSIONS_ENDED',?,?)", user.id,
      JSON.stringify({ workInHand: await captainHasWork(persistence, user.id) }), Date.now());
  });
  return { ok: true };
}

async function createCaptainApplication(userId: number, vehicle: Vehicle, plate: string | null) {
  const inserted = await run(`INSERT INTO captain_profiles(user_id, state, vehicle, plate, legacy_role, legacy_status, application_id)
    VALUES (?, 'under_review', ?, ?, 'customer', 'active', ?) ON CONFLICT (user_id) DO NOTHING`, userId, vehicle, plate, randomBytes(16).toString('hex'));
  if (inserted.changes) await queuePush(await adminIds(), 'attention', 0, '/admin');
}

async function applyAsCaptain({ req, body }: Pick<Ctx, 'body' | 'req'>) {
  if (!accountModes) fail(404, 'not_found');
  const user = await authenticate(req, false) ?? fail(401, 'unauthorized');
  need(user, 'customer'); needActive(user);
  if (!vehicles.includes(body.vehicle)) fail(400, 'invalid_vehicle');
  const account = await one('SELECT role FROM users WHERE id = ?', user.id);
  if (account?.role !== 'customer') fail(409, 'profile_exists');
  await createCaptainApplication(user.id, body.vehicle, text(body.plate, 12, false) || null);
  return me(user, false, sha(bearer(req)!));
}

registerModeRoutes(route, { switchMode: changeSessionMode, availability: changeCaptainAvailability, endOtherSessions,
  apply: applyAsCaptain, notification: resolveProfileNotification });

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

// A Microsoft account never saw its placeholder password. A fresh Microsoft sign-in, bound to this session by a one-use nonce
// issued for this one purpose, stands in for it; each proof works once, inside the transaction it authorizes.
type EntraPurpose = 'delete' | 'password' | 'recovery-email';
type EntraProof = { oid: string; challengeHash: string; tokenHash: string; expiresAt: number; authenticatedAt?: number };
async function entraProof(purpose: EntraPurpose, token: string, body: Row, oid: unknown): Promise<EntraProof | undefined> {
  if (!entra || !oid || typeof body.idToken !== 'string' || typeof body.nonce !== 'string' || !/^[a-f0-9]{64}$/.test(body.nonce)) return undefined;
  let claims: EntraClaims | undefined;
  try { claims = await verifyEntraIdToken(body.idToken, entra, { nonce: body.nonce, maxAuthAgeSeconds: 300 }); }
  catch (error) { if (error instanceof EntraUnavailableError) fail(503, 'entra_unavailable'); }
  if (claims?.oid !== oid) return undefined;
  return { oid: claims.oid, challengeHash: sha(`${purpose}-challenge:${token}:${body.nonce}`), tokenHash: sha(claims.tokenId || body.idToken),
    expiresAt: claims.expiresAt, authenticatedAt: claims.authenticatedAt ?? undefined };
}
async function spendEntraProof(proof: EntraProof) {
  if (!(await run('DELETE FROM entra_replay WHERE token_hash=? AND expires_at>? AND expires_at<=?', proof.challengeHash, Date.now(), proof.authenticatedAt! + 5 * 60_000 + 999)).changes) fail(401, 'invalid_token');
  if (!(await run('INSERT INTO entra_replay(token_hash,expires_at) VALUES(?,?) ON CONFLICT(token_hash) DO NOTHING', proof.tokenHash, proof.expiresAt)).changes) fail(401, 'invalid_token');
}

route('POST', '/api/me/password', async ({ user, body, req }) => {
  const key = identityKey('password', user.id);
  (await limit(key, 5, 10 * 60_000, false));
  const account = (await one('SELECT password, entra_oid FROM users WHERE id = ?', user.id))!;
  const stored = account.password;
  const currentToken = /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')![1];
  const proof = await entraProof('password', currentToken, body, account.entra_oid);
  // Without a verified Entra proof the typed password decides: count the attempt before checking it, so parallel
  // guesses (with or without a junk idToken) cannot all pass a check-only gate (release review, 18 Nov).
  if (!proof) (await limit(key, 5, 10 * 60_000));
  if (!proof && !await checkPassword(String(body.current ?? ''), stored)) fail(401, body.idToken ? 'invalid_token' : 'wrong_password');
  const password = await hashPassword(newPassword(body.password));
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    const locked = await lockEmailAccount(user.id);
    if (!await recoveryEmailSessionActive(locked, sha(currentToken))) fail(401, 'unauthorized');
    if (locked.password !== stored || (proof && locked.entra_oid !== account.entra_oid)) fail(401, 'wrong_password');
    if (proof) await spendEntraProof(proof);
    // Re-check the exact credential the KDF approved: a concurrent change must not be overwritten.
    if (!(await run('UPDATE users SET password = ? WHERE id = ? AND password = ?', password, user.id, stored)).changes) fail(401, 'wrong_password');
    (await run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', user.id, sha(currentToken)));
    // A browser here cannot be told from the one that made this change, and a stolen session's browser must stop alerting. This one subscribes again when Account next opens.
    (await run('DELETE FROM push_subscriptions WHERE user_id = ?', user.id));
    await clearFirebaseReset(user.id);
    (await run('DELETE FROM request_limits WHERE key = ?', key));
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  return { ok: true };
});

// Store rules require in-app account deletion. Orders stay for accounting, stripped of personal data.
// Migration 36 lets the quote guard accept only this scrub: personal fields to ''/NULL, the fare untouched.
const scrubQuotesSql = `UPDATE quotes SET pickup_note = '', dropoff_note = '', contact = '', pickup_contact = NULL, recipient_name = NULL,
  recipient_phone = NULL, detail = '', pickup_lat = NULL, pickup_lng = NULL, dropoff_lat = NULL, dropoff_lng = NULL, itinerary_hash = ''`; // the hash covers the phones
export async function scrubDeletedQuotes(customerId?: number) { // exported for the quotes test
  const target = customerId === undefined ? "customer_id IN (SELECT id FROM users WHERE phone LIKE 'deleted-%')" : 'customer_id = ?';
  return (await run(`WITH due AS (SELECT id FROM quotes WHERE ${target} AND (contact <> '' OR pickup_note <> '' OR dropoff_note <> '' OR detail <> ''
    OR pickup_lat IS NOT NULL OR dropoff_lat IS NOT NULL OR pickup_contact IS NOT NULL OR recipient_phone IS NOT NULL OR recipient_name IS NOT NULL OR itinerary_hash <> '')
    LIMIT 200 FOR UPDATE SKIP LOCKED) ${scrubQuotesSql.replace('UPDATE quotes SET', 'UPDATE quotes q SET')} FROM due WHERE q.id = due.id`,
    ...(customerId === undefined ? [] : [customerId]))).changes;
}
// A quote nobody booked holds a customer's notes, phones and pins for no purpose once it has expired: keep a day, then delete.
// Only unconsumed quotes (an order or payment references consumed ones); the guard blocks UPDATE, not DELETE.
export async function purgeExpiredQuotes(now = Date.now()) {
  return (await run('WITH due AS (SELECT id FROM quotes WHERE consumed_at IS NULL AND expires_at < ? LIMIT 500 FOR UPDATE SKIP LOCKED) DELETE FROM quotes q USING due WHERE q.id = due.id', now - DAY)).changes;
}

async function deleteAccount(user: User, actorId: number | null, proof?: { sessionHash: string; passwordHash?: string } & Partial<EntraProof>) {
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    await phoneIdentity.serialize();
    const current = await one(`SELECT * FROM users WHERE id = ?${persistence.backend === 'postgres' ? ' FOR UPDATE' : ''}`, user.id);
    if (current?.role === 'admin') fail(409, 'cannot_change_self');
    if (proof) {
      const now = Date.now();
      const session = await one(`SELECT 1 FROM sessions WHERE user_id=? AND token_hash=? AND created_at>? AND COALESCE(last_seen_at,created_at)>?${persistence.backend === 'postgres' ? ' FOR SHARE' : ''}`,
        user.id, proof.sessionHash, now - SESSION_DAYS * DAY, now - SESSION_IDLE_DAYS * DAY);
      if (!current || !session || !await sessionEligible(current)) fail(401, 'unauthorized');
      if (proof.passwordHash !== undefined && current?.password !== proof.passwordHash) fail(401, 'wrong_password');
      if (proof.oid !== undefined && (current?.entra_oid !== proof.oid || !proof.challengeHash || !proof.tokenHash || !proof.expiresAt || proof.expiresAt <= now || !proof.authenticatedAt || proof.authenticatedAt < now - 5 * 60_000 - 999)) fail(401, 'invalid_token');
    }
    (await cashSettled(user.id));
    if ((await one(`SELECT id FROM orders WHERE (customer_id = ? OR driver_id = ?) AND status IN ('requested','searching',${activeSql})`, user.id, user.id)))
      fail(409, 'active_orders');
    if (proof?.oid) await spendEntraProof(proof as EntraProof);
    (await run(`UPDATE users SET name = '—', phone = ?, email = NULL, phone_verified_at = NULL, email_verified_at = NULL, entra_oid = NULL,
      approved_at = NULL, consent_at = NULL, consent_version = NULL, password = '', status = 'blocked', vehicle = NULL, plate = NULL WHERE id = ?`, `deleted-${user.id}`, user.id));
    await run('DELETE FROM captain_profiles WHERE user_id = ?', user.id);
    await run('UPDATE users SET captain_state = NULL WHERE id = ?', user.id);
    await phoneIdentity.forget(user.id, current?.phone, actorId);
    (await run(`UPDATE orders SET contact = '', pickup_contact = '', recipient_name = '', recipient_phone = NULL, handover_code = NULL, pickup_note = '', dropoff_note = '', detail = '', pickup_lat = NULL, pickup_lng = NULL, dropoff_lat = NULL, dropoff_lng = NULL, share_token_hash = NULL
      WHERE customer_id = ?`, user.id));
    // T33: the privacy scrub follows the capability on both backends (destination_changes hosts proposals).
    if ((await destinationAvailable(persistence))) await run("UPDATE destination_changes SET original = '[]', dropoff_note = '', dropoff_lat = NULL, dropoff_lng = NULL WHERE customer_id = ?", user.id);
    (await run('DELETE FROM driver_locations WHERE driver_id = ?', user.id));
    (await run('DELETE FROM saved_places WHERE user_id = ?', user.id));
    (await run('DELETE FROM email_codes WHERE user_id = ?', user.id));
    await clearFirebaseReset(user.id);
    await run('DELETE FROM recovery_email_proofs WHERE user_id = ?', user.id);
    (await run('DELETE FROM push_subscriptions WHERE user_id = ?', user.id));
    (await run('UPDATE referral_codes SET active = 0 WHERE user_id = ?', user.id)); // the code stops working and is never reissued
    (await run("UPDATE checkpoint_reports SET note = '' WHERE reporter_id = ?", user.id));
    (await run("UPDATE order_messages SET body = '—' WHERE sender_id = ?", user.id));
    (await run("UPDATE support_messages SET body = '—' WHERE sender_id = ?", user.id)); // their words to support go too
    (await run("UPDATE support_threads SET status = 'closed', closed_at = ? WHERE user_id = ? AND status = 'open'", Date.now(), user.id));
    // Release review, 18 Nov: four more places held a deleted customer's words, phones or positions.
    (await run("UPDATE order_disputes SET reason = '—' WHERE customer_id = ?", user.id));
    (await run("UPDATE safety_incidents SET note = '', lat = NULL, lng = NULL WHERE reporter_id = ?", user.id));
    if (persistence.backend === 'postgres') {
      if ((await one("SELECT to_regclass('command_results') AS t"))?.t) {
        (await run('DELETE FROM command_results WHERE actor_id = ?', user.id)); // replies hold full order JSON
        // A replay keeps its decision and rereads the redacted order through current authorization.
        // ponytail: scans every stored order reply (captains, admins and merchants all hold some); deletion is rare. Add an order_id
        // column to command_results if this ever shows in deletion latency.
        (await run(`WITH order_replies AS MATERIALIZED (
          SELECT actor_id, command_id, CASE WHEN pg_input_is_valid(response, 'jsonb') THEN response::jsonb END AS body
          FROM command_results WHERE http_status = 200 AND response LIKE '%"pickupCity"%'
        )
        UPDATE command_results c SET response = json_build_object('redactedOrderId', o.id)::text
        FROM orders o JOIN order_replies r ON r.body ->> 'id' = o.id::text
        WHERE o.customer_id = ? AND r.body ->> 'pickupCity' IS NOT NULL AND c.actor_id = r.actor_id AND c.command_id = r.command_id`, user.id));
      }
      // A quote held by an in-flight booking is skipped, not waited on (the deletion must not stall behind it);
      // scrubDeletedQuotes() below catches it once that booking ends.
      if ((await quotesAvailable(persistence))) while ((await scrubDeletedQuotes(user.id)) === 200) { /* every unlocked quote of this customer, 200 at a time */ }
    }
    (await run("DELETE FROM subscriptions WHERE user_id = ? AND status = 'pending'", user.id));
    (await run('DELETE FROM sessions WHERE user_id = ?', user.id));
    if (actorId !== null && actorId !== user.id) (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, NULL, 'ACCOUNT_DELETED_BY_ADMIN', ?, ?)`,
      actorId, JSON.stringify({ targetId: user.id }), Date.now()));
    (await persistence.exec('COMMIT'));
  } catch (error) {
    (await persistence.exec('ROLLBACK'));
    throw error;
  }
  return { ok: true };
}
route('POST', '/api/me/delete', async ({ user, body, req }) => {
  if (user.role === 'admin') fail(409, 'cannot_change_self');
  const token = /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')?.[1] ?? fail(401, 'unauthorized');
  const key = identityKey('delete-auth', user.id);
  await limit(key, 5, 10 * 60_000, false);
  const current = await one('SELECT password,entra_oid FROM users WHERE id=?', user.id) ?? fail(401, 'unauthorized');
  // A typed password is counted before it is checked (parallel guesses); it is tried first, so an Entra outage cannot refuse it.
  if (typeof body.password === 'string') {
    await limit(key, 5, 10 * 60_000);
    if (body.password.length <= 100 && await checkPassword(body.password, current.password))
      return persistence.atomic({ id: user.id }, () => deleteAccount(user, user.id, { sessionHash: sha(token), passwordHash: current.password }));
  }
  const proof = await entraProof('delete', token, body, current.entra_oid);
  if (proof) return persistence.atomic({ id: user.id }, () => deleteAccount(user, user.id, { sessionHash: sha(token), ...proof }));
  if (typeof body.password !== 'string') await limit(key, 5, 10 * 60_000); // a failed Entra-only attempt counts too
  fail(401, body.idToken ? 'invalid_token' : 'wrong_password');
});

// Saved and recent places (SPEC-saved-places.md): landmarks are the address here, so a repeat booking reuses them.
const MAX_PLACES = 10;
async function places(user: User) {
  const saved = (await all("SELECT id, label, city, note, lat, lng FROM saved_places WHERE user_id = ? ORDER BY CASE label WHEN 'home' THEN 0 WHEN 'work' THEN 1 ELSE 2 END, id", user.id));
  const seen = new Set(saved.map(p => `${p.city}
${p.note}`));
  const recent: { city: string; note: string; point?: Point }[] = [];
  const pinned = new Map<string, Point>(); // where this customer's own orders put a landmark: re-booking it needs no second pin
  for (const o of (await all('SELECT pickup_city, pickup_note, pickup_lat, pickup_lng, dropoff_city, dropoff_note, dropoff_lat, dropoff_lng FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 30', user.id)))
    for (const [city, note, latitude, longitude] of [[o.pickup_city, o.pickup_note, o.pickup_lat, o.pickup_lng], [o.dropoff_city, o.dropoff_note, o.dropoff_lat, o.dropoff_lng]]) {
      const key = `${city}
${note}`;
      if (latitude != null && !pinned.has(key)) pinned.set(key, { latitude, longitude });
      if (note && !seen.has(key) && recent.length < 5) { seen.add(key); recent.push({ city, note, ...(latitude != null && { point: { latitude, longitude } }) }); }
    }
  // The place's own pin wins (research #6); a place saved without one borrows where this customer's recent orders put it.
  // `pinSaved` tells the app the pin is the place's own, so it can offer to save one when the pin is only borrowed.
  const located = saved.map(({ lat, lng, ...p }: Row) => {
    if (lat != null && lng != null) return { ...p, point: { latitude: Number(lat), longitude: Number(lng) }, pinSaved: true };
    const point = pinned.get(`${p.city}
${p.note}`);
    return point ? { ...p, point } : p;
  });
  return { saved: located, recent };
}
route('GET', '/api/me/places', async ({ user, query }) => {
  need(user, 'customer');
  const result = await places(user);
  if (query.get('shopDelivery') !== '1') return result;
  const town = query.get('town');
  if (town !== null && !isCity(town)) fail(400, 'invalid_input');
  const address = await one(`SELECT id, dropoff_city, dropoff_note, dropoff_lat, dropoff_lng FROM orders
    WHERE customer_id=? AND service='shop' AND status<>'cancelled' AND dropoff_lat IS NOT NULL AND dropoff_lng IS NOT NULL
    AND dropoff_note<>''${town ? ' AND dropoff_city=?' : ''} ORDER BY id DESC LIMIT 1`, user.id, ...(town ? [town] : []));
  return { ...result, shopDelivery: address ? { id: Number(address.id), city: address.dropoff_city, note: address.dropoff_note,
    point: { latitude: Number(address.dropoff_lat), longitude: Number(address.dropoff_lng) } } : null };
});
route('POST', '/api/me/places', async ({ user, body }) => {
  need(user, 'customer');
  if (!['home', 'work', 'other'].includes(body.label) || !isCity(body.city)) fail(400, 'invalid_input');
  const note = text(body.note, 200);
  const point = bookedPoint(body.point, body.city); // optional; a pin must sit inside the city it is saved under
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    const existing = (await one('SELECT id FROM saved_places WHERE user_id = ? AND city = ? AND note = ?', user.id, body.city, note));
    if (body.label !== 'other') (await run('DELETE FROM saved_places WHERE user_id = ? AND label = ? AND id IS NOT ?', user.id, body.label, existing?.id ?? null)); // one Home, one Work
    // Re-saving without a pin keeps the pin the place already has.
    if (existing) (await run('UPDATE saved_places SET label = ?, lat = COALESCE(?, lat), lng = COALESCE(?, lng) WHERE id = ?', body.label, point?.latitude ?? null, point?.longitude ?? null, existing.id));
    else {
      if ((await one('SELECT COUNT(*) n FROM saved_places WHERE user_id = ?', user.id))!.n >= MAX_PLACES) fail(409, 'places_full');
      (await run('INSERT INTO saved_places (user_id, label, city, note, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', user.id, body.label, body.city, note, point?.latitude ?? null, point?.longitude ?? null, Date.now()));
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
  if (price < 2) fail(409, 'promo_not_applicable'); // the fare never drops below ₪1, so nothing would be discounted
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
// Personal codes: invite codes (W…) and inviter rewards (R…) share the promo namespace.
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
/** A one-use code only `ownerId` can apply, valid 90 days: invite rewards (R…) and goodwill credits (C…). */
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
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    if (!(await run('UPDATE promo_codes SET active = 0 WHERE id = ? AND active = 1', Number(params[0]))).changes) fail(404, 'not_found');
    (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, NULL, 'PROMO_DEACTIVATED', ?, ?)`,
      user.id, JSON.stringify({ promoId: Number(params[0]) }), Date.now()));
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  return (await Promise.all((await all(adminPromos)).map(promoRow)));
});

// Web Push (SPEC-web-push.md): opt-in per browser, no provider account. The payload carries a kind and an order id,
// never names or addresses; the service worker words it in the subscriber's language.
type PushKind = 'assigned' | 'at_pickup' | 'in_transit' | 'completed' | 'returned' | 'message' | 'job' | 'released' | 'cancelled'
  | 'offer' | 'offer_accepted' // SPEC-offer-alerts.md
  | 'on_hold' | 'returning' | 'decided' // SPEC-exception-push.md
  | 'approved' | 'support' | 'support_reply' | 'cash' | 'attention' | 'safety' | 'plan'
  | 'destination_request' | 'destination_accepted' | 'destination_declined' | 'admin_assigned' | 'admin_unassigned' | 'dispatch_assigned' // WP-02
  | 'merchant_order' | 'shop_consent' | 'shop_update' // shop delivery (SRS §7)
  | 'office' | 'captain_offline' | 'captain_idle'; // SHIP-19 returned goods at the office
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
const queuePush = async (userIds: (number | null)[], kind: PushKind, order: number, path?: string, changeId?: number) => {
  const ids = userIds.filter((id): id is number => id != null);
  if (ids.length && persistence.backend === 'postgres') { await enqueuePush(persistence, ids, kind, order, path); return; }
  if (ids.length) persistence.defer(async () => (await sendPush(ids, kind, order, path, changeId)));
};

type ProfileNotice = { userId: number; mode: AccountMode; kind: PushKind; orderId: number; expiresAt: number; waiting?: boolean; changeId?: number };
const profileNotices = new Map<string, ProfileNotice>();

async function waitingProfileUpdates(userId: number) {
  let ref: string | null = null;
  const updates = new Set<string>();
  for (const [key, notice] of [...profileNotices]) {
    if (notice.userId !== userId || !notice.waiting) continue;
    if (!await profileNoticeCurrent(notice)) { profileNotices.delete(key); continue; }
    ref = key;
    updates.add(`${notice.mode}:${notice.orderId}:${notice.kind}:${notice.changeId ?? 0}`);
  }
  return { count: updates.size, ref };
}

function profileNoticeUrl(userId: number, mode: AccountMode, kind: PushKind, orderId: number, changeId?: number) {
  const ref = randomBytes(18).toString('base64url');
  if (profileNotices.size >= 2048) profileNotices.delete(profileNotices.keys().next().value!);
  profileNotices.set(ref, { userId, mode, kind, orderId, changeId, expiresAt: Date.now() + (kind === 'job' ? 5 : 60) * 60_000 });
  return `/profiles?notice=${ref}`;
}

function clearWaitingProfileNotice(target: ProfileNotice) {
  for (const notice of profileNotices.values()) {
    if (notice.userId === target.userId && notice.mode === target.mode && notice.kind === target.kind
        && notice.orderId === target.orderId && notice.changeId === target.changeId)
      notice.waiting = false;
  }
}

async function profileNoticeCurrent(notice: ProfileNotice) {
  if (notice.expiresAt <= Date.now()) return false;
  const account = notice.mode === 'captain' ? await one('SELECT role, status, captain_state, vehicle FROM users WHERE id = ?', notice.userId) : null;
  if (notice.mode === 'captain' && (!account || !captainGrant(account))) return false;
  const owner = notice.mode === 'shop' && enabledServices.includes('shop')
    ? await one('SELECT id, status, paused_new FROM merchants WHERE owner_user_id = ?', notice.userId) : null;
  if (notice.mode === 'shop' && !owner) return false;
  if (!notice.orderId) return true;
  const order = await one('SELECT id, customer_id, driver_id, service, status, scheduled_for FROM orders WHERE id = ?', notice.orderId);
  if (!order) return false;
  if (notice.kind === 'job') {
    return !!account && account.captain_state === 'active' && order.status === 'searching' && order.customer_id !== notice.userId
      && enabledServices.includes(order.service) && servesFor(account.vehicle).includes(order.service)
      && (order.scheduled_for == null || order.scheduled_for <= Date.now() + RELEASE_BEFORE)
      && !await one('SELECT 1 FROM order_releases WHERE order_id = ? AND driver_id = ?', order.id, notice.userId)
      && (order.service !== 'shop' || !await shop.driverExcluded(order.id, notice.userId));
  }
  if (owner) {
    const shopOrder = await one('SELECT merchant_state, accept_deadline FROM shop_orders WHERE order_id = ? AND merchant_id = ?', order.id, owner.id);
    return !!shopOrder && (notice.kind !== 'merchant_order' || (order.status === 'requested' && shopOrder.merchant_state == null
      && shopOrder.accept_deadline > Date.now() && owner.status === 'active' && !owner.paused_new));
  }
  if (notice.kind === 'shop_consent' && !await one(`SELECT 1 FROM shop_orders s JOIN shop_changes c ON c.order_id = s.order_id
    WHERE s.order_id = ? AND c.id = ? AND s.merchant_state = 'awaiting_approval' AND c.status = 'pending' AND c.expires_at > ?`,
  order.id, notice.changeId ?? null, Date.now())) return false;
  return (notice.mode === 'captain' ? order.driver_id : order.customer_id) === notice.userId;
}

async function resolveProfileNotification({ req, query }: Pick<Ctx, 'req' | 'query'>) {
  return emailTransaction(async () => {
    const user = await authenticate(req, false) ?? fail(401, 'unauthorized');
    const ref = query.get('ref') ?? '';
    const notice = (accountModes ? profileNotices.get(ref) : undefined) ?? fail(404, 'not_found');
    if (notice.userId !== user.id || !user.accountMode) return fail(404, 'not_found');
    const unavailable = () => { profileNotices.delete(ref); return fail(404, 'not_found'); };
    if (!await profileNoticeCurrent(notice)) return unavailable();
    if (user.accountMode !== notice.mode) {
      notice.waiting = true;
      return { mode: notice.mode, path: null };
    }
    if (notice.orderId) {
      if (notice.kind === 'job' && !await captainOnline(persistence, user.id)) {
        clearWaitingProfileNotice(notice);
        return { mode: 'captain', path: '/driver' };
      }
      try { await getOrder(notice.orderId, user); }
      catch (error) {
        if (error instanceof HttpError && error.status === 404) return unavailable();
        throw error;
      }
      clearWaitingProfileNotice(notice);
      return { mode: notice.mode, path: notice.mode === 'shop' ? `/merchant/order/${notice.orderId}` : `/order/${notice.orderId}` };
    }
    clearWaitingProfileNotice(notice);
    return { mode: notice.mode, path: notice.mode === 'captain' ? '/driver/earnings' : notice.mode === 'shop' ? '/merchant' : '/' };
  });
}

async function livePushSession(userId: number, sessionHash: string | null) {
  const now = Date.now();
  const session = await one(`SELECT s.active_mode, u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.user_id = ? AND (? IS NULL OR s.token_hash = ?) AND s.created_at > ?
      AND COALESCE(s.last_seen_at, s.created_at) > ? LIMIT 1`,
  userId, sessionHash, sessionHash, now - SESSION_DAYS * DAY, now - SESSION_IDLE_DAYS * DAY);
  return session && await sessionEligible(session) ? session : undefined;
}

async function profilePushTarget(userId: number, sessionHash: string | null, kind: PushKind, orderId: number, url: string, changeId?: number) {
  const full = { kind, order: orderId, url };
  if (!accountModes) return full;
  const neutral = (kind: string) => ({ kind, order: 0, url: '/profiles' });
  const session = await livePushSession(userId, sessionHash);
  if (!session) return null;
  if (session.role === 'admin') return sessionHash ? full : { kind: 'account_update', order: 0, url: '/admin' };
  const scoped = (mode: AccountMode, quietKind: string, id = orderId) => ({
    ...(sessionHash && session.active_mode === mode ? full : neutral(quietKind)),
    url: profileNoticeUrl(userId, mode, kind, id, changeId),
  });
  if (kind === 'job') {
    const order = await one("SELECT id, service FROM orders WHERE id = ? AND status = 'searching'", orderId);
    if (!order || await profileAssignmentRefusal({ id: order.id, service: order.service }, userId)) return null;
    return scoped('captain', 'captain_profile_update');
  } else if (url.startsWith('/merchant')) {
    const shopOrder = await one(`SELECT 1 FROM shop_orders s JOIN merchants m ON m.id = s.merchant_id
      WHERE s.order_id = ? AND m.owner_user_id = ?`, orderId, userId);
    if (orderId && !shopOrder) return null;
    return scoped('shop', 'shop_profile_update');
  } else if (url.startsWith('/driver')) {
    return sessionHash && session.active_mode === 'captain' ? full : scoped('captain', 'captain_profile_update', 0);
  } else if (orderId) {
    const order = await one('SELECT customer_id, driver_id FROM orders WHERE id = ?', orderId);
    if (order?.driver_id === userId) return scoped('captain', 'captain_profile_update');
    if (order?.customer_id === userId) return scoped('personal', 'profile_update');
    return kind === 'admin_unassigned' ? scoped('captain', 'captain_profile_update', 0) : null;
  }
  return sessionHash ? full : neutral('profile_update');
}
rideLifecycle.onBoardingLocked = async orderId => { await queuePush((await adminIds()), 'attention', orderId, '/admin/orders'); };
rideLifecycle.onNoShow = async (orderId, customerId) => { await queuePush([customerId], 'cancelled', orderId); };
const adminIds = async () => (await all("SELECT id FROM users WHERE role = 'admin' AND status = 'active'")).map(a => a.id as number);
const flushPush = () => persistence.flushEffects();
// T46: the backup job touches this marker after its off-VM copy succeeds. Silence is the failure, so the API watches for it.
const backupMarker = process.env.WIND_BACKUP_MARKER ?? (production && persistence.backend === 'sqlite' ? resolve(dirname(process.env.DB_PATH!), 'backups', 'last-ok') : null);
// How old the marker may get before admins are told: 26 hours (a day plus slack) suits a nightly job; a host that backs up
// hourly sets a few hours (WIND_BACKUP_MAX_AGE_HOURS), so a broken backup is noticed the same morning. Unset means 26; any other
// value that is not 1 to 336 hours, an empty one included, stops startup rather than quietly changing the alarm (Haiku PR #103 L4, L5).
const backupMaxAgeHours = process.env.WIND_BACKUP_MAX_AGE_HOURS === undefined ? 26 : Number(process.env.WIND_BACKUP_MAX_AGE_HOURS);
if (!(backupMaxAgeHours >= 1 && backupMaxAgeHours <= 14 * 24)) throw new Error('WIND_BACKUP_MAX_AGE_HOURS must be a number of hours from 1 to 336');
const lastBackupAt = () => {
  try { return backupMarker ? Math.floor(statSync(backupMarker).mtimeMs) : null; } catch { return null; }
};
const backupAgeLimitMs = backupMaxAgeHours * 60 * 60_000;
const isBackupStale = (now: number, savedAt: number | null) => savedAt === null || now - savedAt > backupAgeLimitMs;
const backupStale = () => !!backupMarker && isBackupStale(Date.now(), lastBackupAt());
/** One alert per outage, at most one a day. The dashboard keeps saying it until a backup succeeds, because a push can be missed. */
export async function alertMissedBackup(now = Date.now()) {
  if (!backupMarker) return false;
  const savedAt = lastBackupAt();
  const alertKey = identityKey('backup-alert', 'system');
  const sent = await persistence.atomic({ purpose: 'backup_alert' }, async () => {
    if (!isBackupStale(now, savedAt)) {
      await run('DELETE FROM request_limits WHERE key = ?', alertKey);
      return false;
    }
    // A successful backup ends the outage even if it was never fresh during a sweep. A newer alert keeps its allowance.
    if (savedAt !== null) await run('DELETE FROM request_limits WHERE key = ? AND until < ?', alertKey, savedAt + DAY);
    const admins = await adminIds();
    if (!admins.length) return false; // an admin added later today still gets the day's alert
    try { await limit(alertKey, 1, DAY); } catch { return false; }
    await queuePush(admins, 'attention', 0, '/admin');
    return true;
  });
  if (sent) await flushPush();
  return sent;
}
async function sendPush(userIds: number[], kind: PushKind, order: number, path?: string, changeId?: number) {
  const url = path ?? (kind === 'job' ? '/driver' : `/order/${order}`);
  const ids = userIds.map(() => '?').join(',');
  const urgent = URGENT_KINDS.includes(kind), ttl = kind === 'job' ? 300 : kind === 'offer' ? OFFER_TTL / 1000 : 3600;
  for (const s of (await all(`SELECT * FROM push_subscriptions WHERE user_id IN (${ids})`, ...userIds)))
    void persistence.detached(() => capped(() => deliverWebPush(s, kind, order, url, urgent ? 'high' : 'normal', ttl, changeId)));
  // Ending a session removes its token (foreign key), and blocking an account ends its sessions, so each row here is live.
  for (const t of (await all(`SELECT * FROM native_push_tokens WHERE user_id IN (${ids})`, ...userIds)))
    if (!nativeSuppression(t.prefs_json, kind, t.disabled_at))
      void persistence.detached(() => capped(async () => {
        const current = await one('SELECT * FROM native_push_tokens WHERE token_hash=? AND user_id=? AND auth_session_hash=? AND device_hash=?',
          t.token_hash, t.user_id, t.auth_session_hash, t.device_hash);
        if (current && !nativeSuppression(current.prefs_json, kind, current.disabled_at)) {
          const target = await profilePushTarget(current.user_id, current.auth_session_hash, kind, order, url, changeId);
          if (target) await deliverNative(current, JSON.stringify({ ...target, lang: current.lang }), ttl, urgent);
        }
      }));
}

let pushInFlight = 0; const pushWaiters: (() => void)[] = [];
async function capped(delivery: () => Promise<void>) {
  if (pushInFlight >= 8) await new Promise<void>(done => pushWaiters.push(done));
  pushInFlight++;
  try { await delivery(); } finally { pushInFlight--; pushWaiters.shift()?.(); }
}
// ponytail: reads the send ticket only; Expo receipts catch later failures, add them when the pilot shows stale tokens.
async function deliverNative(t: Row, message: string, ttl: number, urgent: boolean) {
  try { await sendExpoPush(t, message, ttl, urgent); }
  catch (error) { if (isDeviceNotRegistered(error)) await run('DELETE FROM native_push_tokens WHERE token_hash=? AND user_id=? AND auth_session_hash=? AND device_hash=?', t.token_hash, t.user_id, t.auth_session_hash, t.device_hash); /* otherwise best effort, like web push */ }
}
async function deliverWebPush(original: Row, kind: PushKind, order: number, url: string, urgency: string, ttl: number, changeId?: number) {
  try {
    const { privateKey, publicRaw } = await pushKeys();
    // SQLite serializes the final authority read with launching the provider request. Await the network outside the lock.
    const attempt = await persistence.transaction(async () => {
      const sessionHash = original.auth_session_hash ?? null;
      const s = await one('SELECT * FROM push_subscriptions WHERE endpoint = ? AND user_id = ? AND auth_session_hash IS ?',
        original.endpoint, original.user_id, sessionHash);
      if (!s) return;
      let target;
      if (accountModes) target = await profilePushTarget(s.user_id, sessionHash, kind, order, url, changeId);
      else if (await livePushSession(s.user_id, sessionHash))
        target = sessionHash ? { kind, order, url } : { kind: 'account_update', order: 0, url: '/' };
      if (!target) return;
      const message = JSON.stringify({ ...target, kind: webPushKind(target.kind), lang: s.lang });
      const response = fetch(s.endpoint as string, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
        body: encrypt(Buffer.from(message), Buffer.from(s.p256dh as string, 'base64url'), Buffer.from(s.auth as string, 'base64url')),
        headers: { TTL: String(ttl), Urgency: urgency, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: vapid(s.endpoint as string, publicRaw, privateKey, PUSH_SUBJECT()) } }).catch(() => null);
      return { s, response };
    }, { commandId: randomUUID() });
    const res = await attempt?.response;
    if (!res || !attempt) return;
    await res.body?.cancel();
    const { s } = attempt;
    if (res.status === 404 || res.status === 410) await run(`DELETE FROM push_subscriptions
      WHERE endpoint = ? AND user_id = ? AND auth_session_hash IS ? AND created_at = ?`,
    s.endpoint, s.user_id, s.auth_session_hash ?? null, s.created_at); // leave a registration that replaced this one in flight
  } catch { /* best effort: the app still shows everything on next open */ }
}
/** A new job reaches free, approved drivers whose vehicle can take it (at most 100 per order). */
async function profileAssignmentRefusal(order: Pick<RefusalOrder, 'id' | 'service'>, driverId: number) {
  if (!accountModes) return null;
  if (await one('SELECT 1 FROM orders WHERE id = ? AND customer_id = ?', order.id, driverId)) return 'own_order';
  if (order.service === 'shop' && await shop.driverExcluded(order.id, driverId)) return 'shop_job_unavailable';
  return await captainOnline(persistence, driverId) ? null : 'captain_offline';
}

async function newJobPush(service: Service, orderId: number, customerId: number, exceptDriver = 0) {
  // Booking is never refused for this, but one account cannot keep 100 drivers' phones ringing: 5 job alerts per 10 minutes.
  try { (await limit(identityKey('job-push', customerId), 5, 10 * 60_000)); } catch { return false; }
  const job = await one('SELECT shared, option FROM orders WHERE id = ?', orderId);
  const next = { shared: !!Number(job?.shared ?? 0), option: job?.option == null ? null : String(job.option) };
  const fits = vehicles.filter(v => vehicleServices[v].includes(service) && canTake([], service, next, v));
  if (!fits.length) return false;
  const reachable = (await nativePushAvailable(persistence))
    ? '(EXISTS(SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id) OR EXISTS(SELECT 1 FROM native_push_tokens n WHERE n.user_id = u.id AND n.disabled_at IS NULL))'
    : 'EXISTS(SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)';
  // RIDE-13: a parcel or a shared ride also reaches drivers whose load can share (parcels, shared riders); seats are counted below.
  const pooled = poolable({ service, shared: next.shared });
  const candidates = (await all(`SELECT u.id, u.vehicle FROM users u WHERE u.role = 'driver' AND u.status = 'active' ${production && selfService ? 'AND u.approved_at IS NOT NULL' : ''}
    AND u.vehicle IN (${fits.map(() => '?').join(',')}) AND ${reachable}
    AND u.id <> ? AND NOT EXISTS(SELECT 1 FROM order_releases r WHERE r.order_id = ? AND r.driver_id = u.id)
    AND (u.heading_city IS NULL OR u.heading_until <= ? OR u.heading_city = (SELECT dropoff_city FROM orders WHERE id = ?))
    AND ${pooled // a parcel or shared ride reaches drivers whose whole load can share; the rest need an empty vehicle
    ? `NOT EXISTS(SELECT 1 FROM orders o WHERE o.driver_id = u.id AND o.status IN (${activeSql}) AND NOT ${poolableSql('o')})`
    : `NOT EXISTS(SELECT 1 FROM orders o WHERE o.driver_id = u.id AND o.status IN (${activeSql}))`} ORDER BY random() LIMIT ${pooled ? 400 : 100}`, ...fits, exceptDriver, orderId, Date.now(), orderId)); // ponytail: random fairness; nearest-first when driver positions are kept between jobs
  // Seats are counted after the random draw, so the pooled draw is wider and the 100 alerts come from cars that fit.
  let drivers = candidates;
  if (pooled && candidates.length) { // one query for every candidate's load, not one each
    const loads = new Map<number, { service: Service; shared: boolean; option: string | null }[]>();
    for (const o of await all(`SELECT driver_id, service, shared, option FROM orders WHERE status IN (${activeSql}) AND driver_id IN (${candidates.map(() => '?').join(',')})`, ...candidates.map(d => d.id)))
      loads.set(Number(o.driver_id), [...(loads.get(Number(o.driver_id)) ?? []), { service: o.service as Service, shared: !!Number(o.shared ?? 0), option: o.option == null ? null : String(o.option) }]);
    drivers = candidates.filter(d => canTake(loads.get(Number(d.id)) ?? [], service, next, (d.vehicle ?? null) as Vehicle | null)).slice(0, 100);
  }
  if (accountModes) {
    const candidates = await Promise.all(drivers.map(async driver => await profileAssignmentRefusal({ id: orderId, service }, driver.id) ? null : driver));
    drivers = candidates.filter(driver => driver !== null);
  }
  await queuePush(drivers.map(d => d.id as number), 'job', orderId);
  return true;
}
/** WP10: a ride starts a deterministic dispatch round when enabled; otherwise the legacy broadcast is unchanged. */
async function dispatchOrBroadcast(service: Service, orderId: number, customerId: number, exceptDriver = 0) {
  if (service === 'ride' && await dispatch.startRound(orderId)) return true;
  return newJobPush(service, orderId, customerId, exceptDriver);
}
/** An order back in the pool after a driver left it, by release or block. That driver is excluded; a ride needs a new round, since the old one closed as matched. */
async function reofferReleased(service: Service, orderId: number, customerId: number, driverId: number) {
  if (service === 'ride' && dispatch.enabled()) {
    await dispatch.recordRelease(orderId, driverId);
    if (await dispatch.startRound(orderId)) return;
  }
  await newJobPush(service, orderId, customerId, driverId);
}
/** Scheduled orders reach drivers when they are released (30 minutes before pickup), once. */
/** SHIP-19: the daily office reminders, with each push and its OFFICE_REMINDED record in one transaction. */
export async function remindOfficeJobs(now = Date.now()) {
  return persistence.atomic({ purpose: 'office_reminders' }, () => remindOffice(persistence, queuePush, now));
}
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
    const staleWhere = `status = 'searching' AND service <> 'shop' AND driver_id IS NULL AND COALESCE(scheduled_for, created_at) < ?
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
route('POST', '/api/push/subscribe', async ({ user, body, req }) => {
  const endpoint = pushEndpoint(body.endpoint) ?? fail(400, 'invalid_input');
  const key = Buffer.from(String(body.p256dh ?? ''), 'base64url'), auth = Buffer.from(String(body.auth ?? ''), 'base64url');
  if (key.length !== 65 || key[0] !== 4 || auth.length !== 16) fail(400, 'invalid_input');
  try { createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64url(key.subarray(1, 33)), y: b64url(key.subarray(33)) }, format: 'jwk' }); }
  catch { fail(400, 'invalid_input'); } // a point off the curve would fail on every send
  const bind = persistence.backend === 'sqlite';
  const subscribe = async () => {
    if (bind && !await authenticate(req, false)) fail(401, 'unauthorized');
    // The updated client records local ownership before asking for session-specific alerts. Older tabs
    // may keep their opt-in and receive neutral alerts without asserting a browser credential.
    const sessionHash = bind && body.bindSession === true ? sha(bearer(req)!) : null;
    await run(`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, lang, created_at${bind ? ', auth_session_hash' : ''})
      VALUES (?, ?, ?, ?, ?, ?${bind ? ', ?' : ''})
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang,
      created_at = excluded.created_at${bind ? ', auth_session_hash = excluded.auth_session_hash' : ''}`,
    endpoint, user.id, b64url(key), b64url(auth), body.lang === 'en' ? 'en' : 'ar', Date.now(), ...(bind ? [sessionHash] : []));
    await run('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint NOT IN (SELECT endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5)', user.id, user.id);
    return { ok: true };
  };
  return bind ? emailTransaction(subscribe) : subscribe();
});
route('POST', '/api/push/unsubscribe', async ({ user, body, req }) => {
  const bind = persistence.backend === 'sqlite';
  await run(`DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?${bind ? ' AND (auth_session_hash IS NULL OR auth_session_hash = ?)' : ''}`,
    String(body.endpoint ?? ''), user.id, ...(bind ? [sha(bearer(req)!)] : []));
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
// Set on map opens at the customer's position, so confirming the destination unmoved books a trip to nowhere.
// ponytail: 50 m straight line, a guess; widen if the pilot shows it too small.
const apartPins = (a: unknown, b: unknown) => { const from = pointOf(a), to = pointOf(b); if (from && to && crowKm(from, to) < 0.05) fail(400, 'same_place'); };
function bookedPoint(p: unknown, id: CityId) {
  const point = pointOf(p);
  if (point && crowKm(city(id), point) > SERVICE_KM) fail(400, 'outside_area');
  return point;
}

// Smart recommended price (SPEC-driver-offers.md): the checkpoint-aware road route the map draws, plus Wind's own live
// road reports (/api/roads). Without routing, straight km × 1.3 at 50 km/h.
async function recommend(user: User, b: Row) {
  const service = services.includes(b.service) && b.service !== 'shop' ? b.service as Service : fail(400, 'invalid_service');
  if (!enabledServices.includes(service)) fail(409, 'service_unavailable');
  if (!isCity(b.pickupCity) || !isCity(b.dropoffCity)) fail(400, 'invalid_city');
  const option = optionsFor(service).includes(String(b.option)) ? String(b.option) : fail(400, 'invalid_option');
  const shared = sharedRide(service, b.shared);
  const priority = bookingPriority(service, b.priority, fail, b.scheduledFor ?? null);
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
    plus: (await activePlan(user.id, 'customer')) === 'plus', shared });
  await guardCashCeiling(price); // the price screen and a destination change hear it before anyone commits
  return { price, km, minutes, delayMinutes, night: isNight(at), slow, closed, avoids: trip?.avoids ?? [], estimated: !trip, standard: service === 'parcel', ...(service === 'parcel' && { priority }), ...(shared && { shared }), line: trip?.line ?? null, at };
}
/** RIDE-13: only a ride may be shared, and only while rides run; anything else asking for it is refused, as before. */
function sharedRide(service: Service, value: unknown) {
  if (value == null || value === false) return false;
  if (value !== true || service !== 'ride' || !enabledServices.includes('ride')) fail(409, 'pooling_unavailable');
  return true;
}
route('POST', '/api/price', async ({ user, body }) => {
  need(user, 'customer');
  needActive(user);
  (await limit(identityKey('price', user.id), 120, 10 * 60_000));
  apartPins(body.pickupPoint, body.dropoffPoint); // a booking only: a trip under way may head back to its pickup
  const base = (await recommend(user, body));
  checkPriorityCutoff(base.priority ?? 'standard', fail);
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
  const tariffSnapshot = settingsResponse(await settings(), false).settings;
  const tariffVersion = tariffVersionFor(tariffSnapshot);
  const tariffBps = tariffBasisPoints(tariffSnapshot);
  const priceMinor = minorUnits(base.price);
  const commissionRate = (await activePlan(user.id, 'driver')) === 'pro' ? (tariffSnapshot.proCommission as number) : (tariffSnapshot.commission as number);
  const commissionMinor = Number.isFinite(commissionRate) ? minorUnits(commissionOn(base.price, commissionRate as number)) : null;
  const feasibility = (await evaluateQuoteFeasibility(persistence, { service, routeLine: base.line, estimated: base.estimated, pickup: point ?? null, dropoff: dropoff ?? null }));
  if (feasibility.verdict.feasibility === 'infeasible') fail(409, 'route_prohibited');
  // WP12: a quote may carry the customer-declared scope it will commit.
  const declaredScope = body.declaredScope === undefined || body.declaredScope === null ? null
    : validateDeclaredScope(service, body.declaredScope, fail);
  if (service === 'freight' && declaredScope && (!pickupPin || !dropoffPin)) fail(400, 'freight_pins_required');
  const input = {
    customerId: user.id,
    service,
    priority: base.priority ?? 'standard',
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
const positiveInt = (value: string | undefined, fallback: number) => { const n = Math.floor(Number(value)); return Number.isFinite(n) && n >= 1 ? n : fallback; };
const SEARCHING_LIMIT = positiveInt(process.env.WIND_SEARCHING_LIMIT, 5);
const SEARCH_EXPIRY_MS = Math.max(Number(process.env.WIND_SEARCH_EXPIRY_MS) || 86_400_000, 3_600_000); // 24 h
// Booked-ahead orders do not count toward the cap above (a customer may plan the week), but each one releases to
// drivers when due, so they get their own bound (release review, 18 Nov). Same message: too many open orders.
const SCHEDULED_LIMIT = positiveInt(process.env.WIND_SCHEDULED_LIMIT, 10);
async function guardScheduledCap(customerId: number) {
  const n = Number(((await one("SELECT COUNT(*) AS n FROM orders WHERE customer_id = ? AND status IN ('searching','requested') AND scheduled_for IS NOT NULL", customerId)) as { n: number }).n);
  if (n >= SCHEDULED_LIMIT) fail(409, 'too_many_searching');
}

async function guardOpenRide(customerId: number, service: Service) {
  if (service === 'ride' && await one(`SELECT id FROM orders WHERE customer_id=? AND service='ride'
    AND (status IN (${activeSql}) OR (status='searching' AND scheduled_for IS NULL)) LIMIT 1`, customerId))
    fail(409, 'ride_already_active');
}

async function lockCustomerDemand(customerId: number) {
  if (persistence.backend === 'postgres') await run("SELECT pg_advisory_xact_lock(hashtextextended('wind_searching_cap', ?))", customerId);
}

async function guardRideAssignment(orderId: number) {
  const ride = await one("SELECT customer_id FROM orders WHERE id=? AND service='ride'", orderId);
  if (!ride) return;
  await lockCustomerDemand(Number(ride.customer_id));
  if (await one(`SELECT 1 FROM orders WHERE customer_id=? AND id<>? AND service='ride' AND status IN (${activeSql}) LIMIT 1`, ride.customer_id, orderId))
    fail(409, 'rider_ride_active');
}

async function createOrder(user: User, body: Row, smart?: { price: number; km: number }, authorize?: () => Promise<User>) {
  // T21: the cap check and the insert share the caller's write transaction — every booking path enters
  // createOrder inside BEGIN IMMEDIATE (SQLite) or persistence.atomic (PostgreSQL), and PostgreSQL takes a
  // per-customer advisory lock so concurrent creates cannot slip past the count under READ COMMITTED.
  await lockCustomerDemand(user.id);
  // A placed shop order counts while it waits on the shop too, or one customer could queue baskets without end.
  const searching = (await one("SELECT COUNT(*) AS n FROM orders WHERE customer_id = ? AND status IN ('searching','requested') AND scheduled_for IS NULL", user.id)) as { n: number };
  if (Number(searching.n) >= SEARCHING_LIMIT) fail(409, 'too_many_searching');
  if (body.service === 'shop') {
    if (body.quoteId != null || body.quotedPrice != null) fail(400, 'invalid_input'); // the server prices a basket itself
    if (authorize) user = await authorize();
    return (await getOrder(await shop.place(user, body), user));
  }
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
    const flatFare = quoted.service === 'parcel'; // a parcel's price does not depend on where its pins are
    const fillPoint = (quotedLat: unknown, quotedLng: unknown, bodyValue: unknown, cityId: unknown) => {
      const quoted = quotedLat != null ? { latitude: Number(quotedLat), longitude: Number(quotedLng) } : null;
      if (bodyValue === undefined || bodyValue === null) return quoted;
      const supplied = bookedPoint(bodyValue, cityId as CityId);
      if (!supplied) return quoted;
      // A ride or load is priced by distance: a pin its quote never saw would redraw the route at the old fare
      // (a 4 km city-centre quote booked as a 40 km trip). The app always quotes with its pins (release review, 18 Nov).
      if (!quoted && !flatFare) fail(409, 'itinerary_changed');
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
    apartPins(effPoint, effDropoffPoint);
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
    if (Number(quoted.shared) === 1) sharedRide(service, true);
    const priority = bookingPriority(quoted.service, body.priority, fail, quoted.scheduled_for ?? null);
    if (priority !== (quoted.priority ?? 'standard')) fail(409, 'itinerary_changed');
    const price = Number(quoted.price_minor) / 100;
    await guardCashCeiling(price); // the ceiling may have been lowered since the quote
    const nowTs = Date.now();
    const promo = body.promoCode == null ? null : (await promoFor(user, body.promoCode, price));
    if (promo && body.expectedDiscount != null && Number(body.expectedDiscount) !== promo.discount) fail(409, 'promo_changed');
    const scheduledFor = quoted.scheduled_for as number | null;
    if (scheduledFor !== null && !(Number.isInteger(scheduledFor) && scheduledFor >= nowTs + RELEASE_BEFORE && scheduledFor <= nowTs + 7 * DAY)) fail(400, 'invalid_schedule');
    if (scheduledFor !== null) await guardScheduledCap(user.id);
    else await guardOpenRide(user.id, service);
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
    checkPriorityCutoff(priority, fail); // re-judged at the write: a route wait may have crossed noon
    if (authorize) user = await authorize();
    const id = Number((await run(`INSERT INTO orders (customer_id, service, shared, pickup_city, dropoff_city, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
    pickup_note, dropoff_note, contact, pickup_contact, detail, option, loading_help, price, status, handover_code, created_at, updated_at, scheduled_for, discount, recommended_price, route_km,
    recipient_name, recipient_phone, quote_id, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'searching', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::uuid, ?)`,
    user.id, service, Number(quoted.shared), quoted.pickup_city, quoted.dropoff_city,
    point?.latitude ?? null, point?.longitude ?? null, dropoff?.latitude ?? null, dropoff?.longitude ?? null,
    effPickupNote, effDropoffNote, contact,
    pickupContact ?? contact,
    effDetail,
    quoted.option as string, Number(quoted.loading_help), price, String(randomInt(1000, 10000)), nowTs, nowTs, scheduledFor, promo?.discount ?? null,
    service === 'parcel' ? null : price, null, recipientName, recipientPhone, quoteId, priority)).lastInsertRowid);
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
      if (service === 'freight' && committedScope && (!point || !dropoff)) fail(400, 'freight_pins_required');
      if (committedScope) await saveDeclaredScope(persistence, fail, id, service, committedScope);
    }
    // Mark quote consumed atomically within the same order transaction.
    (await run('UPDATE quotes SET consumed_at=?, consumed_order_id=? WHERE id=?::uuid', nowTs, id, quoteId));
    if (scheduledFor == null) { (await run('UPDATE orders SET job_alerted_at = ? WHERE id = ?', nowTs, id)); (await dispatchOrBroadcast(service, id, user.id)); }
    return (await getOrder(id, user));
  }
  const service = services.includes(body.service) && body.service !== 'shop' ? body.service as Service : fail(400, 'invalid_service');
  // Parcels have one standard price: nothing to offer on, so no recommendation (SPEC-parcel-standard.md).
  const recommended = service === 'parcel' ? undefined : smart?.price;
  if (!enabledServices.includes(service)) fail(409, 'service_unavailable');
  sharedRide(service, body.shared);
  if (!isCity(body.pickupCity) || !isCity(body.dropoffCity)) fail(400, 'invalid_city');
  const option = optionsFor(service).includes(String(body.option)) ? String(body.option) : fail(400, 'invalid_option');
  const contact = normalizePhone(String(body.contact ?? '')) ?? fail(400, 'invalid_phone');
  const point = bookedPoint(body.pickupPoint, body.pickupCity), dropoff = bookedPoint(body.dropoffPoint, body.dropoffCity);
  if (service === 'freight' && body.declaredScope != null && (!point || !dropoff)) fail(400, 'freight_pins_required');
  apartPins(body.pickupPoint, body.dropoffPoint);
  const shared = !!body.shared, loadingHelp = service === 'freight' && !!body.loadingHelp;
  // Who receives a parcel or load (SPEC-parcel-recipient.md); optional, never on a ride.
  const recipientPhone = body.recipientPhone == null || body.recipientPhone === '' ? null
    : service === 'ride' ? fail(400, 'invalid_input') : normalizePhone(String(body.recipientPhone)) ?? fail(400, 'invalid_phone');
  const recipientName = recipientPhone ? text(body.recipientName ?? '', 60, false) : '';
  // Smart orders arrive with their recommendation; Souq and apps before 1.0.8 keep the fixed tariff.
  const priority = bookingPriority(service, body.priority, fail, body.scheduledFor ?? null);
  const price = recommended ?? quote((await settings()), { service, pickupCity: body.pickupCity, dropoffCity: body.dropoffCity, option, loadingHelp, shared,
    plus: (await activePlan(user.id, 'customer')) === 'plus' });
  // The app shows a price before commitment; if tariffs or the plan changed since, make the customer re-confirm.
  if (body.quotedPrice != null && Number(body.quotedPrice) !== price) fail(409, 'price_changed');
  await guardCashCeiling(price);
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
  if (scheduledFor !== null) await guardScheduledCap(user.id);
  else await guardOpenRide(user.id, service);
  checkPriorityCutoff(priority, fail);
  if (authorize) user = await authorize();
  if (accountModes && service === 'ride' && (scheduledFor === null || scheduledFor <= now + 2 * 60 * 60_000)) {
    if (await captainHasWork(persistence, user.id)) fail(409, 'work_in_hand');
    if (await captainOnline(persistence, user.id, now)) {
      if (body.confirmCaptainOffline !== true) fail(409, 'captain_confirm_offline');
      await setCaptainOffline(persistence, user.id, 'ride_due');
    }
  }
  const id = Number((await run(`INSERT INTO orders (customer_id, service, shared, pickup_city, dropoff_city, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
    pickup_note, dropoff_note, contact, pickup_contact, detail, option, loading_help, price, status, handover_code, created_at, updated_at, scheduled_for, discount, recommended_price, route_km,
    recipient_name, recipient_phone, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'searching', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    user.id, service, shared ? 1 : 0, body.pickupCity, body.dropoffCity,
    point?.latitude ?? null, point?.longitude ?? null, dropoff?.latitude ?? null, dropoff?.longitude ?? null,
    text(body.pickupNote, 200), text(body.dropoffNote, 200), contact,
    body.pickupContact == null ? contact : normalizePhone(String(body.pickupContact)) ?? fail(400, 'invalid_phone'),
    text(body.detail, 500, service !== 'ride'),
    // Every order gets its code; a ride's ends the trip once the rider has paid (owner, 23 Nov 2026, D-7).
    option, loadingHelp ? 1 : 0, price, String(randomInt(1000, 10000)), now, now, scheduledFor, promo?.discount ?? null,
    recommended ?? null, smart?.km ?? null, recipientName, recipientPhone, priority)).lastInsertRowid); // the km the price used, shown on the driver's job card
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
  requireModeRevision(user, req);
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
  const authorize = async (lock = false) => {
    if (lock && persistence.backend === 'postgres') {
      // Match revocation's user -> session order; keep authority stable through the insert and commit.
      await one('SELECT id FROM users WHERE id=? FOR SHARE', user.id);
      const token = /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')?.[1] ?? fail(401, 'unauthorized');
      await one('SELECT token_hash FROM sessions WHERE user_id=? AND token_hash=? FOR SHARE', user.id, sha(token));
    }
    const current = (await authenticate(req, false)) ?? fail(401, 'unauthorized');
    if (lock) requireModeRevision(current, req);
    need(current, 'customer');
    needActive(current);
    return current;
  };
  if (requestId == null) {
    const recommended = input.quoteId ? undefined : await smart();
    user = (await authorize());
    (await persistence.exec('BEGIN IMMEDIATE'));
    try { const order = (await createOrder(user, input, recommended, () => authorize(true))); (await persistence.exec('COMMIT')); return order; } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  }
  if (typeof requestId !== 'string' || !uuid.test(requestId)) fail(400, 'invalid_request_id');
  // A command can commit only until its own deadline, so a missing receipt after it is a real absence.
  // Replays of a committed command still return their order; only a new commit is refused.
  if (commandExpiresAt !== undefined && (!Number.isSafeInteger(commandExpiresAt) || (commandExpiresAt as number) > Date.now() + BOOKING_COMMAND_TTL_MS + 60_000)) // a minute of device clock skew
    fail(400, 'invalid_command_deadline');
  const expired = () => commandExpiresAt !== undefined && Date.now() > (commandExpiresAt as number);
  const hash = payloadHash(priorityIdentity(input)); // omitted and explicit standard are the same command
  const replay = async () => {
    // Authority comes first: the promo limiter can wait past revocation, and even an absent receipt must not reach routing or expiry.
    user = await authorize();
    const existing = (await one('SELECT * FROM order_commands WHERE user_id = ? AND request_id = ?', user.id, requestId));
    if (!existing) {
      // A12: a cutoff refusal is terminal for its key; the same key cannot succeed later because the clock moved.
      const rejected = (await one('SELECT payload_hash, error FROM order_command_rejections WHERE user_id = ? AND request_id = ?', user.id, requestId));
      if (rejected) { user = await authorize(); fail(409, rejected.payload_hash === hash ? rejected.error : 'idempotency_conflict'); }
      return null;
    }
    // The receipt read can wait on a committing writer: authority is re-read after it, so a logout or reset during that wait
    // is a 401, never the stored private result (and never a payload comparison for a revoked session).
    user = await authorize();
    if (existing.payload_hash !== hash) fail(409, 'idempotency_conflict');
    return (await getOrder(existing.order_id, user));
  };
  const done = (await replay()); // a retried command returns its order even if today's price moved
  if (done) return done;
  if (expired()) fail(409, 'booking_command_expired');
  const recommended = input.quoteId ? undefined : await smart();
  user = (await authorize());
  (await persistence.exec('BEGIN IMMEDIATE'));
  let order: Order;
  try {
    const raced = (await replay()); // the same command may have committed while routing was awaited
    if (raced) { (await persistence.exec('ROLLBACK')); return raced; }
    if (expired()) fail(409, 'booking_command_expired');
    order = (await createOrder(user, input, recommended, () => authorize(true)));
    (await run('INSERT INTO order_commands (user_id, request_id, payload_hash, order_id) VALUES (?, ?, ?, ?)', user.id, requestId, hash, order.id));
  } catch (error) {
    (await persistence.exec('ROLLBACK'));
    // The winner can consume the quote or fill the searching cap before we reach the unique insert.
    user = await authorize();
    if ((error as { message?: string }).message === 'priority_cutoff') {
      (await persistence.exec('BEGIN IMMEDIATE'));
      try {
        const winner = await one('SELECT order_id FROM order_commands WHERE user_id = ? AND request_id = ?', user.id, requestId);
        if (!winner) (await run('INSERT INTO order_command_rejections (user_id, request_id, payload_hash, error, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, request_id) DO NOTHING', user.id, requestId, hash, 'priority_cutoff', Date.now()));
        (await persistence.exec('COMMIT'));
      } catch (recordError) { (await persistence.exec('ROLLBACK')); throw recordError; }
    }
    const won = await replay();
    if (won) return won;
    throw error;
  }
  // Commit uncertainty is never an idempotent replay: preserve the unexpected-500 support reference.
  (await persistence.exec('COMMIT'));
  return order;
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
  bookedPoint(body.pickupPoint, body.pickupCity); bookedPoint(body.dropoffPoint, body.dropoffCity); apartPins(body.pickupPoint, body.dropoffPoint);
  const priority = bookingPriority('parcel', body.priority, fail);
  checkPriorityCutoff(priority, fail);
  const price = quote((await settings()), { service: 'parcel', pickupCity: body.pickupCity, dropoffCity: body.dropoffCity,
    option: body.option, shared: body.shared === true });
  await guardCashCeiling(price); // the seller hears it before the buyer agrees
  return { currency: 'ILS', priority, price };
}, true);

route('POST', '/api/partner/orders', async ({ req, body }) => {
  partner(req);
  const ref = text(body.externalRef, 150);
  if (!Number.isSafeInteger(body.quotedPrice) || body.quotedPrice < 1) fail(400, 'invalid_input');
  const identity = priorityIdentity(body); // a stored omitted-priority hash still matches an explicit standard
  const hash = payloadHash(identity);
  const existing = (await one('SELECT * FROM partner_orders WHERE external_ref = ?', ref));
  if (existing) {
    if (existing.payload_hash !== hash) {
      if (existing.payload_hash !== sha(JSON.stringify(identity))) fail(409, 'idempotency_conflict');
      (await run('UPDATE partner_orders SET payload_hash = ? WHERE external_ref = ?', hash, ref));
    }
    return (await getOrder(existing.order_id, (await partnerUser())));
  }
  const user = await partnerUser(); // its one-time placeholder KDF must precede the transaction
  // Same short atomic boundary the HTTP envelope used, including the partner_api audit purpose.
  let bookingFailed = false;
  try {
    return await persistence.atomic({ purpose: 'partner_api', correlationId: randomUUID() }, async () => {
      const { promoCode: _code, expectedDiscount: _discount, ...input } = body; // Wind promos are for Wind customers only
      await persistence.exec('BEGIN IMMEDIATE'); // SQLite also needs the order and its reference to commit together.
      let order: Order;
      try {
        order = (await createOrder(user, { ...input, service: 'parcel' }));
        (await run('INSERT INTO partner_orders (external_ref, payload_hash, order_id) VALUES (?, ?, ?)', ref, hash, order.id));
      } catch (error) { bookingFailed = true; await persistence.exec('ROLLBACK'); throw error; }
      // A real SQLite COMMIT failure is not a booking race; leave bookingFailed false.
      await persistence.exec('COMMIT');
      return order;
    });
  } catch (error) {
    // Replay only callback failures: an outer commit failure has an unknown outcome and keeps its 500 reference.
    if (!bookingFailed) throw error;
    // A concurrent retry can fill the searching cap before we reach the unique insert.
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
async function cancelBeforePickup(id: number, reviewReason: PickupReview['reason'], actorId: number) {
  const row = (await one(`SELECT * FROM orders WHERE id = ?${persistence.backend === 'postgres' ? ' FOR UPDATE' : ''}`, id)) ?? fail(404, 'not_found');
  if (!cancellable.includes(row.status)) fail(409, 'cannot_cancel');
  // On PostgreSQL the active GPS trigger can delete the validated fix when the order leaves the active set.
  if (row.status !== 'searching') await pickupPay(row, actorId, reviewReason);
  if (!(await run("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ? AND status IN ('searching', 'assigned', 'at_pickup')", Date.now(), id)).changes) fail(409, 'cannot_cancel');
}
route('POST', '/api/partner/orders/:id/cancel', async ({ req, params }) => {
  const order = (await partnerOrder(req, Number(params[0])));
  if (order.status === 'cancelled') return order;
  if (!cancellable.includes(order.status)) fail(409, 'cannot_cancel');
  // The KDF carve-out runs partner routes outside the HTTP envelope, so the cancelled push needs its
  // own mutation transaction (enqueuePush refuses without one); same short boundary as partner create.
  return (await persistence.atomic({ purpose: 'partner_api', correlationId: randomUUID() }, async () => {
    await persistence.exec('BEGIN IMMEDIATE');
    try {
      await cancelBeforePickup(order.id, 'partner_cancelled', (await partnerUser()).id);
      const cancelled = await partnerOrder(req, order.id);
      if (cancelled.driverId) await queuePush([cancelled.driverId], 'cancelled', order.id);
      await persistence.exec('COMMIT');
      return cancelled;
    } catch (error) { await persistence.exec('ROLLBACK'); throw error; }
  }));
}, true);

route('GET', '/api/orders', async ({ user, query, req }) => {
  need(user, 'customer', 'driver', 'admin');
  if (user.accountMode === 'captain') await captainActivity(persistence, user.id, sha(bearer(req)!));
  const status = query.get('status'), before = query.get('before');
  const where = user.role === 'admin' ? '1 = 1' : user.role === 'driver' ? 'o.driver_id = ?' : 'o.customer_id = ?';
  const args: SQLInputValue[] = user.role === 'admin' ? [] : [user.id];
  const filter = status ? (args.push(status), ' AND o.status = ?') : '';
  const open = `o.status IN ('requested','searching',${activeSql})`;
  // Load more: the next page of ended orders below the oldest one the client holds. Open work is never paged.
  if (before !== null) {
    const id = /^[1-9]\d{0,14}$/.test(before) ? Number(before) : fail(400, 'invalid_input');
    return toOrders(await all(`${orderSelect} WHERE ${where}${filter} AND NOT (${open}) AND o.id < ? ORDER BY o.id DESC LIMIT ${HISTORY_PAGE}`, ...args, id), user);
  }
  // First page: every open order, however much newer history there is, plus the newest page of ended ones.
  const newest = `SELECT o.id FROM orders o WHERE ${where}${filter} AND NOT (${open}) ORDER BY o.id DESC LIMIT 1 OFFSET ${HISTORY_PAGE - 1}`;
  return toOrders(await all(`${orderSelect} WHERE ${where}${filter} AND (${open} OR o.id >= COALESCE((${newest}), 0)) ORDER BY o.id DESC`, ...args, ...args), user);
});

async function withMeasuredScopes<T extends {id:number}>(orders:T[]) {
  const scopes=await measuredScopes(persistence,orders.map(order=>order.id));
  return orders.map(order=>({...order,measuredScope:scopes[order.id]??null}));
}
function recoveryMetadata(row: Row) {
  const version = Number(row.version);
  return { schemaVersion: 1 as const, version, assignmentEpoch: row.assignment_epoch ?? null };
}
route('GET', '/api/orders/:id', async ({ user, params, query }) => {
  const orderId = Number(params[0]);
  if (query.get('protocol') === '1') return orderProtocol(user, orderId, query);
  const read = () => getOrder(orderId, user, query.get('liveProtocol') === '1', query.get('recoveryProtocol') === '1');
  if (query.get('capacityProtocol') !== '1') return read();
  return persistence.transaction(async () => {
    if (persistence.backend === 'postgres') await run('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const [order] = await withMeasuredScopes([await read()]);
    return query.get('journeyProtocol') === '1' ? journeyOrder(persistence, rideLifecycle, order!, user) : order;
  }, { commandId: randomUUID() });
});
// Live driver fix (long-poll): answers the moment a fix newer than `since` lands, else after LIVE_HOLD with what it has.
route('GET', '/api/orders/:id/live', async ({ user, params, query, req }) => {
  let limited = false;
  return (await liveFix(async () => {
    // A held request must not retain a session revoked while waiting for the next fix.
    const viewer = (await authenticate(req)) ?? fail(401, 'unauthorized');
    const o = await getOrder(Number(params[0]), viewer, true);
    // Counted after the lookup: a stranger polling must not write to the database.
    if (!limited) { (await limit(identityKey('order-live', user.id), 2400, 10 * 60_000)); limited = true; }
    return { orderId: o.id, driverId: o.driverId, driverKey: o.driverId == null || o.driverTrackingEnded ? null : String(o.driverId),
      assignmentEpoch: o.assignmentEpoch, fix: o.driverLocation ?? null };
  }, query, req, true));
});

route('POST', '/api/orders/:id/cancel', async ({ user, params }) => {
  const order = (await getOrder(Number(params[0]), user));
  if (order.service === 'shop') {
    if (user.id !== order.customerId) fail(409, user.role === 'admin' ? 'use_shop_cancel' : 'cannot_cancel');
    return shop.customerCancel(user, order.id);
  }
  if (order.status === 'cancelled' && (user.role === 'admin' || user.id === order.customerId)) return order;
  const allowed = (user.role === 'admin' || user.id === order.customerId) && cancellable.includes(order.status);
  if (!allowed) fail(409, 'cannot_cancel');
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    await cancelBeforePickup(order.id, user.role === 'admin' ? 'support_cancelled' : 'customer_cancelled', user.id);
    if (user.role === 'admin') (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'ORDER_CANCELLED_BY_ADMIN', '{}', ?)`, user.id, order.id, Date.now()));
    const cancelled = (await getOrder(order.id, user));
    if (cancelled.driverId) await queuePush([cancelled.driverId], 'cancelled', order.id);
    if (user.role === 'admin') await queuePush([order.customerId ?? null], 'cancelled', order.id); // support cancelled it for the sender
    (await persistence.exec('COMMIT'));
    return cancelled;
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
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
  if (!(await run("UPDATE orders SET scheduled_for = ?, updated_at = ? WHERE id = ? AND status = 'searching' AND scheduled_for > ?", at, now, order.id, now + RELEASE_BEFORE)).changes) fail(409, 'cannot_reschedule');
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
// stored, and the public view is an explicit allowlist — no phones, notes, codes, price or customer identity.
const SHARE_GRACE = DAY; // a finished trip's final status stays readable for a day
async function shareOrder(id: number, customerId: number) {
  const r = (await one('SELECT id, status FROM orders WHERE id = ? AND customer_id = ?', id, customerId)) ?? fail(404, 'not_found');
  if (!['requested', 'searching', ...activeStatuses].includes(r.status)) fail(409, 'cannot_share');
  const token = randomBytes(32).toString('hex');
  (await run('UPDATE orders SET share_token_hash = ?, share_created_at = ? WHERE id = ?', sha(token), Date.now(), r.id));
  return { token, path: `/track/${token}` };
}
route('POST', '/api/orders/:id/share', async ({ user, params }) => {
  if (user.accountMode) need(user, 'customer');
  return shareOrder(Number(params[0]), user.id);
});
// Souq keeps the returned link for its buyer and seller; a new call rotates it.
route('POST', '/api/partner/orders/:id/share', async ({ req, params }) => (await shareOrder((await partnerOrder(req, Number(params[0]))).id, (await partnerUser()).id)), true);
route('POST', '/api/orders/:id/share/revoke', async ({ user, params }) => {
  if (user.accountMode) need(user, 'customer');
  if (!(await run('UPDATE orders SET share_token_hash = NULL, share_created_at = NULL WHERE id = ? AND customer_id = ?', Number(params[0]), user.id)).changes)
    fail(404, 'not_found');
  return { ok: true };
});
const shareRefKey = randomBytes(32); // in memory only: public driver refs must not be invertible from the link itself
// Per link and per assignment: A, then B, then A again gives a new ref, so a follower never redraws A's earlier fix (Sol M5).
const shareDriverRef = (token: string, r: Row) => createHmac('sha256', shareRefKey).update(`${token}:${r.driver_id}:${r.assigned_at ?? ''}`).digest('hex').slice(0, 12);
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
  const open = r.status === 'requested' || r.status === 'searching' || activeStatuses.includes(r.status);
  if (!open && Date.now() - r.updated_at > SHARE_GRACE) fail(404, 'not_found');
  const supportHasGoods = r.status === 'returning' && r.service !== 'ride' && (await returnCustody(persistence, r)).supportHasGoods;
  const driver = r.driver_id && open && !supportHasGoods ? { firstName: String(r.driver_name ?? '').trim().split(/\s+/)[0], vehicle: r.driver_vehicle ?? null,
    ref: shareDriverRef(token, r) } : null; // opaque per link: tells a reassignment apart, names no one
  const fresh = driver && activeStatuses.includes(r.status) && r.loc_lat != null && Date.now() - r.loc_at <= 120_000;
  return { orderId: r.id, driverId: r.driver_id as number | null, row: r, view: {
    orderCode: orderCode(r.id), status: r.status, service: r.service, pickupCity: r.pickup_city, dropoffCity: r.dropoff_city,
    updatedAt: r.updated_at, scheduledFor: r.scheduled_for ?? null, // the recipient's page says booked ahead, as the sender's does
    driver,
    driverLocation: fresh ? { latitude: r.loc_lat, longitude: r.loc_lng, updatedAt: r.loc_at, heading: r.loc_heading ?? null } : null,
  } };
}

// One dispute per finished order, opened by its customer within a week. Resolution is a recorded
// decision only; refunds and cash corrections belong to cash settlement.
route('POST', '/api/orders/:id/dispute', async ({ user, params, body }) => {
  if (user.accountMode) need(user, 'customer');
  const r = (await one('SELECT * FROM orders WHERE id = ? AND customer_id = ?', Number(params[0]), user.id)) ?? fail(404, 'not_found');
  const reason = text(body.reason, 1000);
  if (reason.length < 10) fail(400, 'invalid_input');
  // One dispute per order. A double tap or a resend after a lost reply (same customer, same reason) gets the dispute it
  // already opened, not an error, even once the reporting window has closed; only the insert that wins alerts support.
  const resent = async () => {
    const opened = await one('SELECT customer_id, reason FROM order_disputes WHERE order_id = ?', r.id);
    if (!opened) return false;
    if (opened.customer_id !== user.id || opened.reason !== reason) fail(409, 'dispute_exists');
    return true;
  };
  if (await resent()) return (await getOrder(r.id, user));
  if (!finishedStatuses.includes(r.status) || Date.now() - (r.completed_at ?? r.updated_at) > 7 * DAY) fail(409, 'cannot_dispute');
  const inserted = (await run('INSERT INTO order_disputes (order_id, customer_id, reason, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(order_id) DO NOTHING',
    r.id, user.id, reason, Date.now())).changes;
  if (!inserted) await resent(); // a concurrent tap won the insert: replay it or refuse a different reason
  else await queuePush((await adminIds()), 'attention', r.id, '/admin/orders');
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
const safetyFree = async (orderId: number, proof?: Row) => {
  const hold = (await one(`SELECT MAX(id) latest, COUNT(*) FILTER (WHERE status = 'open') open_count
    FROM safety_incidents WHERE order_id = ?`, orderId))!;
  if (hold.open_count > 0) fail(409, 'safety_hold');
  if (!proof) return;
  // A settled hold keeps its proof version through other order edits, including a wrong-code retry.
  const current = hold.latest == null ? null : Number(hold.latest);
  if (current !== null && proof.expectedProofVersion === undefined) fail(426, 'client_update_required');
  if (proof.expectedProofVersion !== undefined && proof.expectedProofVersion !== current) fail(409, 'order_changed');
};
async function invalidateSafetyProof(order: Row) {
  // The order row is locked by both incident transitions and each proof write.
  await run('UPDATE orders SET version = version + 1 WHERE id = ?', order.id);
  if (order.service === 'ride' && ['assigned', 'at_pickup'].includes(order.status)) await rideLifecycle.invalidateBoardingProof(order.id);
}
route('POST', '/api/orders/:id/sos', async ({ user, params, body }) => {
  if (!safetyKinds.includes(body.kind)) fail(400, 'invalid_input');
  const note = text(body.note, 300, false);
  const orderId = Number(params[0]);
  await persistence.exec('BEGIN IMMEDIATE');
  try {
    const r = (await one(`SELECT o.id, o.status, o.service, o.customer_id, o.driver_id, l.lat, l.lng, l.updated_at loc_at
      FROM orders o LEFT JOIN driver_locations l ON l.driver_id = o.driver_id AND l.updated_at >= COALESCE(o.assigned_at, 0)
      WHERE o.id = ?${persistence.backend === 'postgres' ? ' FOR UPDATE OF o' : ''}`, orderId)) ?? fail(404, 'not_found');
    const role = r.customer_id === user.id && (!user.accountMode || user.accountMode === 'personal') ? 'customer'
      : r.driver_id === user.id && (!user.accountMode || user.accountMode === 'captain') ? 'driver'
      : user.role === 'admin' ? null : fail(404, 'not_found');
    if (!role || !activeStatuses.includes(r.status)) fail(409, 'cannot_report');
    if (!(await one("SELECT id FROM safety_incidents WHERE order_id = ? AND reporter_id = ? AND status = 'open'", r.id, user.id))) {
      await limit(identityKey('sos', user.id), 10, DAY);
      const fresh = r.lat != null && Date.now() - r.loc_at <= 10 * 60_000;
      const id = Number((await run(`INSERT INTO safety_incidents (order_id, reporter_id, reporter_role, kind, note, lat, lng, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, r.id, user.id, role, body.kind, note, fresh ? r.lat : null, fresh ? r.lng : null, Date.now())).lastInsertRowid);
      await invalidateSafetyProof(r);
      await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'SAFETY_REPORTED', ?, ?)`,
        user.id, r.id, JSON.stringify({ incident: id, kind: body.kind }), Date.now());
      await queuePush(await adminIds(), 'safety', r.id, '/admin/orders');
    }
    await persistence.exec('COMMIT');
  } catch (error) { await persistence.exec('ROLLBACK'); throw error; }
  return getOrder(orderId, user);
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
    const order = (await one(`SELECT id, service, status, customer_id, driver_id FROM orders WHERE id = ?${persistence.backend === 'postgres' ? ' FOR UPDATE' : ''}`,
      incident.order_id))!;
    if (!(await run("UPDATE safety_incidents SET status = 'resolved', resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ? AND status = 'open'",
      resolution, user.id, Date.now(), incident.id)).changes) fail(409, 'cannot_resolve');
    await invalidateSafetyProof(order);
    (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'SAFETY_RESOLVED', ?, ?)`,
      user.id, incident.order_id, JSON.stringify({ incident: incident.id, resolution }), Date.now()));
    await queuePush([order.customer_id, order.driver_id], 'support', incident.order_id); // the frozen driver may continue
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  return { ok: true };
});

// In-trip chat (SPEC-in-app-chat.md): the two parties write while the order is active and read for a day after;
// administrators read for support. Never part of the public tracking view.
async function chatAccess(user: User, id: number) {
  const r = (await one('SELECT id, status, customer_id, driver_id, updated_at FROM orders WHERE id = ?', id)) ?? fail(404, 'not_found');
  const role = r.customer_id === user.id && (!user.accountMode || user.accountMode === 'personal') ? 'customer'
    : r.driver_id === user.id && (!user.accountMode || user.accountMode === 'captain') ? 'driver'
    : user.role === 'admin' ? 'admin' : fail(404, 'not_found');
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
  ['حاجز عنبتا - عيناف · Anabta-Einav', ['tulkarm', 'nablus'], 32.2904, 35.1357],
  ['حاجز شوفة · Shufa', ['tulkarm'], 32.2803, 35.0668],
  ['حاجز أفني حيفتس · Avnei Hefetz', ['tulkarm'], 32.2812, 35.0757],
  ['حاجز الطيبة · Taybeh', ['tulkarm'], 32.2890, 35.0152],
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
route('GET', '/api/jobs', async ({ user, query, req }) => {
  need(user, 'driver');
  needActive(user);
  if (!servesFor(user.vehicle).length) fail(409, 'no_vehicle'); // say why the list is empty
  const allowed = servesFor(user.vehicle).filter(service => enabledServices.includes(service));
  const oversized = allowed.includes('ride') ? optionsFor('ride').filter(option => !canTake([], 'ride', { option }, user.vehicle)) : [];
  const paging = query.get('page') === '1';
  const pageSize = paging ? 20 : 50; // keep legacy responses stable while bounding mobile rendering and per-request work
  if (accountModes) await captainActivity(persistence, user.id, sha(bearer(req)!));
  if (!allowed.length || (accountModes && !await captainOnline(persistence, user.id, Date.now(), sha(bearer(req)!))))
    return paging ? { version: 1, jobs: [], nextCursor: null } : [];
  // Scheduled orders wait until shortly before pickup, then queue by pickup time like any other.
  // A driver heading somewhere sees only jobs going there (SPEC-driver-destination.md). Once the device says where it is, that
  // widens to jobs along the way (RIDE-13): Tulkarm → Ramallah also shows a rider from Anabta to Nablus, never one going back.
  const heading = user.heading?.city ?? '';
  const [nearLat, nearLng] = (query.get('near') ?? '').split(',').map(Number);
  const here = finite(nearLat, 90) && finite(nearLng, 180) ? { latitude: nearLat, longitude: nearLng } : null;
  const origin = heading && here ? nearestCity(here) : null;
  const way = origin && heading ? onTheWay(origin, heading as CityId) : [];
  const after = query.get('after');
  let cursor: [number, number] | undefined;
  if (after !== null) {
    if (!/^\d{1,16}:\d{1,16}$/.test(after)) fail(400, 'invalid_input');
    const [at, id] = after.split(':').map(Number);
    if (!Number.isSafeInteger(at) || !Number.isSafeInteger(id) || id < 1) fail(400, 'invalid_input');
    cursor = [at, id];
  }
  const rows = await all(`${orderSelect} WHERE o.status = 'searching' AND o.service IN (${allowed.map(() => '?').join(',')})
    ${oversized.length ? `AND (o.service <> 'ride' OR COALESCE(o.option, '1') NOT IN (${oversized.map(() => '?').join(',')}))` : ''}
    AND (o.scheduled_for IS NULL OR o.scheduled_for <= ?) AND (? = '' OR o.dropoff_city = ?${way.length ? ` OR (o.pickup_city IN (${way.map(() => '?').join(',')}) AND o.dropoff_city IN (${way.map(() => '?').join(',')}))` : ''})
    AND NOT EXISTS(SELECT 1 FROM order_releases r WHERE r.order_id = o.id AND r.driver_id = ?)
    ${accountModes ? `AND o.customer_id <> ? AND NOT EXISTS (SELECT 1 FROM shop_orders s JOIN merchants m ON m.id = s.merchant_id
      WHERE s.order_id = o.id AND (m.owner_user_id = ? OR s.paused_at IS NOT NULL OR s.merchant_state = 'awaiting_approval'))` : ''}
    ${cursor ? 'AND (COALESCE(o.scheduled_for, o.created_at) > ? OR (COALESCE(o.scheduled_for, o.created_at) = ? AND o.id > ?))' : ''}
    ORDER BY COALESCE(o.scheduled_for, o.created_at), o.id LIMIT ${paging ? pageSize + 1 : pageSize}`, ...allowed, ...oversized, Date.now() + RELEASE_BEFORE, heading, heading, ...way, ...way, user.id,
    ...(accountModes ? [user.id, user.id] : []), ...(cursor ? [cursor[0], cursor[0], cursor[1]] : []));
  // The town list keeps a job whose two ends are on the way; the direction check drops one that would go backwards.
  const fits = (r: Row) => !origin || r.dropoff_city === heading || alongTheWay(origin, heading as CityId, { pickupCity: r.pickup_city as CityId, dropoffCity: r.dropoff_city as CityId });
  const page = rows.slice(0, pageSize), visible = page.filter(fits);
  if (here) sawDriver(user.id, here, user.vehicle); // an approved, active driver with the board open (nearby.ts)
  const cards = await jobCardData(visible, user.id);
  const lang = query.get('lang') === 'en' ? 'en' : 'ar';
  // In one town the city names say nothing. A driver deciding sees the neighbourhoods and how far the pickup is;
  // the exact pins, notes and contacts still wait until the job is taken.
  // The device says where it is for this answer; nearby customers see an unnamed car there for a few minutes (nearby.ts).
  const jobs = await Promise.all(visible.map(async r => {
    const job = await toOrder(r, user, cards);
    const pickup = r.pickup_lat != null ? { latitude: r.pickup_lat, longitude: r.pickup_lng } : null, dropoff = r.dropoff_lat != null ? { latitude: r.dropoff_lat, longitude: r.dropoff_lng } : null;
    return { ...job, pickupArea: pickup ? areaName(pickup, lang) : '', dropoffArea: dropoff ? areaName(dropoff, lang) : '',
      pickupKm: here && pickup ? Math.max(1, Math.round(crowKm(here, pickup))) : null }; // whole km: three queries from three spots must not reveal the pin
  }));
  const result = query.get('capacityProtocol') === '1' ? await withMeasuredScopes(jobs) : jobs;
  if (!paging) return result;
  const last = page.at(-1); // the page read, so a job the direction check dropped is not read again
  const nextCursor = rows.length > pageSize && last ? `${last.scheduled_for ?? last.created_at}:${last.id}` : null;
  return { version: 1, jobs: result, nextCursor };
});

route('POST', '/api/jobs/:id/accept', async ({ user, params, body }) => {
  need(user, 'driver');
  needActive(user);
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
  const freshDriver = (await one('SELECT id, role, status, vehicle, approved_at FROM users WHERE id = ?', user.id));
  if (!freshDriver || freshDriver.role !== 'driver' || freshDriver.status !== 'active') fail(403, 'blocked');
  user.vehicle = freshDriver!.vehicle;
  if (body.offerId !== undefined || body.leaseNonce !== undefined) {
    const dispatched = await dispatch.acceptOffer({ driverId: user.id, orderId: Number(params[0]), offerId: body.offerId, leaseNonce: body.leaseNonce, capacityProtocol: body.capacityProtocol, expectedRequirementsRevision: body.expectedRequirementsRevision }, guardRideAssignment, async () => {
      const offered = (await getOrder(Number(params[0]), user));
      if (!enabledServices.includes(offered.service)) fail(409, 'service_unavailable');
      if (!servesFor(user.vehicle).includes(offered.service)) fail(409, 'wrong_vehicle');
      const carryingOffer = (await activeLoad(user.id));
      if (!canTake(carryingOffer, offered.service, offered, user.vehicle)) fail(409, 'vehicle_busy');
      const offeredRate = await driverRate(user.id);
      await guardCashCap(user.id, offered.price, offeredRate);
      const changedOffer = (await run(`UPDATE orders SET driver_id = ?, commission = ?, status = 'assigned', updated_at = ?, assigned_at = ? WHERE id = ? AND status = 'searching' AND NOT EXISTS(SELECT 1 FROM order_releases WHERE order_id = ? AND driver_id = ?)`, user.id, commissionOn(offered.price, offeredRate), Date.now(), Date.now(), offered.id, offered.id, user.id)).changes;
      if (!changedOffer) fail(409, 'already_taken');
      await run('UPDATE orders SET commission_rate = ? WHERE id = ?', offeredRate, offered.id); // T33: both backends bind the rate snapshot
      await rideLifecycle.ensureAssignment(offered.id, user.id, 'dispatch');
      (await run(`DELETE FROM order_offers WHERE order_id = ?${poolable(offered) ? '' : ' OR driver_id = ?'}`, offered.id, ...(poolable(offered) ? [] : [user.id])));
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
  // ponytail: one active job until inspected aggregate load/route policy supports batching.
  const carrying = (await activeLoad(user.id));
  const rate = await driverRate(user.id);
  if (order.status !== 'searching') fail(409, 'already_taken'); // say so before any cash message; the UPDATE below still decides
  // The driver checks shared with the admin assign (driver-refusal.ts). Parcels stack up to PARCEL_LOAD; rides and freight are exclusive.
  const refused = await driverRefusal({ one, enabledServices, servesFor, canTake, activeLoad, guardCashCap, permanentApprovalRequired: production && selfService, releaseBefore: RELEASE_BEFORE, modeRefusal: profileAssignmentRefusal },
    { id: order.id, service: order.service, price: order.price, scheduled_for: order.scheduledFor, shared: order.shared, option: order.option }, freshDriver!, rate);
  if (refused) fail(409, refused);
  await guardRideAssignment(order.id);
  const now = Date.now();
  if (shippingOrder(order)) await recordAssignedFrom(order.id, user.id, user.id, body.position);
  const changed = (await run(`UPDATE orders SET driver_id = ?, commission = ?, status = 'assigned', updated_at = ?, assigned_at = ?
    WHERE id = ? AND status = 'searching' AND NOT EXISTS(SELECT 1 FROM order_releases WHERE order_id = ? AND driver_id = ?)`,
  user.id, commissionOn(order.price, rate), now, now, order.id, order.id, user.id)).changes;
  if (!changed) fail(409, 'already_taken');
  await run('UPDATE orders SET commission_rate = ? WHERE id = ?', rate, order.id); // T33: both backends bind the rate snapshot
  await rideLifecycle.ensureAssignment(order.id, user.id, 'legacy');
  // Settled. Taking exclusive work makes the driver busy, so their other offers end; a shared ride or a parcel leaves room (RIDE-13).
  (await run(`DELETE FROM order_offers WHERE order_id = ?${poolable(order) ? '' : ' OR driver_id = ?'}`, order.id, ...(poolable(order) ? [] : [user.id])));
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
  const order = (await getOrder(Number(params[0]), user)); // 404 unless an open job this driver may take
  if (order.status !== 'searching') fail(409, 'already_taken');
  const recommended = order.recommendedPrice ?? fail(409, 'fixed_price'); // Souq and older apps: accept at the shown price
  if (!enabledServices.includes(order.service) || !servesFor(user.vehicle).includes(order.service)
    || (order.service === 'ride' && !order.shared && !canTake([], order.service, order, user.vehicle))) fail(409, 'wrong_vehicle');
  if (!canTake((await activeLoad(user.id)), order.service, order, user.vehicle)) fail(409, 'vehicle_busy');
  const [min, max] = offerRange(recommended);
  if (!Number.isInteger(body.price) || body.price < min || body.price > max) fail(400, 'invalid_offer');
  await guardCashCeiling(body.price, order.id); // a driver's own price may not take the order past the ceiling either
  await guardCashCap(user.id, body.price, await driverRate(user.id));
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
    if (!servesFor(f.vehicle).includes(r.service) || await profileAssignmentRefusal({ id: r.id, service: r.service }, Number(f.id))) fail(409, 'offer_expired');
    // Offers outlive a driver's next job while they can still pool (RIDE-13): one that no longer fits the vehicle has lapsed.
    const offerCarrying = await activeLoad(Number(f.id));
    if (!canTake(offerCarrying, r.service, { shared: !!Number(r.shared ?? 0), option: r.option == null ? null : String(r.option) }, f.vehicle as Vehicle | null)) fail(409, 'offer_expired');
    await guardRideAssignment(r.id);
    await guardCashCeiling(Number(f.price), r.id); // lowered since the driver offered, or a goods COD added since
    const rate = await driverRate(f.id);
    await guardCashCap(Number(f.id), Number(f.price), rate, 'offer_expired'); // the driver went over the cash cap since offering
    const now = Date.now();
    if (shippingOrder(r)) await recordAssignedFrom(r.id, Number(f.id), user.id);
    // A promo or credit never discounts more than the fare minus ₪1 (as at booking).
    (await run(`UPDATE orders SET driver_id = ?, price = ?, discount = CASE WHEN discount IS NULL THEN NULL ELSE MIN(discount, ? - 1) END,
      commission = ?, status = 'assigned', updated_at = ?, assigned_at = ? WHERE id = ? AND status = 'searching'`, f.id, f.price, f.price, commissionOn(f.price, rate), now, now, r.id));
    await run('UPDATE orders SET commission_rate = ? WHERE id = ?', rate, r.id); // T33: both backends bind the rate snapshot
    await rideLifecycle.ensureAssignment(r.id, Number(f.id), 'legacy');
    const pooled = poolable({ service: r.service as Service, shared: !!Number(r.shared ?? 0) });
    (await run(`DELETE FROM order_offers WHERE order_id = ?${pooled ? '' : ' OR driver_id = ?'}`, r.id, ...(pooled ? [] : [f.id])));
    if (!offerCarrying.length) (await run('DELETE FROM driver_locations WHERE driver_id = ?', f.id)); // their other riders still follow this fix
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
// Shop delivery (SRS §7): hidden unless WIND_ENABLED_SERVICES lists `shop` (ONE-13).
const shop = registerShop(route, { db: persistence, need, needActive, fail, text, bookedPoint, normalizePhone, settings,
  enabled: () => enabledServices.includes('shop'), queuePush, getOrder, adminIds,
  dispatch: (orderId, customerId) => dispatchOrBroadcast('shop', orderId, customerId), limit, identityKey,
  owedCents: async driverId => (await cashBalances('u.id = ?', driverId))[0]?.owedCents ?? 0, flushPush, journal: postShopJournal,
  driverCommand: (user, id, body, apply) => driverCommand(user, id, body, apply), safetyFree, profileModes: accountModes });
/** One pass of the shop timers; the server runs it each minute and tests call it with a chosen time. */
export const shopSweep = (now = Date.now()) => shop.sweep(now);

route('POST', '/api/orders/:id/release', async ({ user, params }) => {
  need(user, 'driver'); needActive(user);
  const order = await (async () => {
    (await persistence.exec('BEGIN IMMEDIATE'));
    try {
      if (persistence.backend === 'postgres') await one('SELECT id FROM orders WHERE id = ? FOR UPDATE', Number(params[0])); // a concurrent goods COD waits (ADM-12)
      if ((await one('SELECT 1 FROM order_releases WHERE order_id = ? AND driver_id = ?', Number(params[0]), user.id))) {
        (await persistence.exec('COMMIT'));
        return null; // the original release succeeded, possibly before the connection dropped
      }
      const current = (await getOrder(Number(params[0]), user));
      if (current.driverId !== user.id || !['assigned', 'at_pickup'].includes(current.status)) fail(409, 'cannot_release'); // nothing collected yet
      await shop.guardCaptainExit({ id: current.id, service: current.service, status: current.status }, 'release');
      (await safetyFree(current.id));
      const now = Date.now();
      // Back to the recommendation, but never above a per-order cash ceiling lowered since the booking (ADM-12).
      const restoredPrice = await restoredFare(current.id, current.recommendedPrice ?? current.price, current.price);
      const discount = (await restoredDiscount(current.id, restoredPrice, current.discount));
      (await run(`UPDATE orders SET driver_id = NULL, commission = NULL, price = ?, discount = ?, status = 'searching',
        job_alerted_at = COALESCE(job_alerted_at, ?), updated_at = ? WHERE id = ?`, restoredPrice, discount, now, now, current.id)); // back to the recommendation
      (await run('INSERT OR IGNORE INTO order_releases (order_id, driver_id, released_at) VALUES (?, ?, ?)', current.id, user.id, now));
      await rideLifecycle.clearAssignment(current.id);
      if (accountModes) await closeCaptainIfSettled(user.id);
      (await persistence.exec('COMMIT'));
      return current;
    } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  })();
  if (!order) return { ok: true };
  await queuePush([order.customerId!], 'released', order.id);
  await reofferReleased(order.service, order.id, order.customerId!, user.id);
  return { ok: true };
});

async function advanceOrder(user: User, id: number, body: Row, requestId: string, oldCaptainApp = false) {
  // PostgreSQL: lock the row first, so a support takeover or custody recovery committing meanwhile is seen by the custody check
  // below instead of racing it (SQLite's BEGIN IMMEDIATE already serialises both; Sonnet L6 on PR #101, G-PG).
  const r = (await one(`SELECT * FROM orders WHERE id = ?${persistence.backend === 'postgres' ? ' FOR UPDATE' : ''}`, id)) ?? fail(404, 'not_found');
  if (r.driver_id !== user.id || !activeStatuses.includes(r.status)) fail(409, 'cannot_advance');
  if (body.expectedStatus !== r.status) fail(409, 'order_changed');
  const next = nextStatus(r.status);
  if (next === r.status) fail(409, 'cannot_advance'); // on_hold waits for an administrator decision
  // D-7: only the last step of a ride may end without the rider's trip code (see below); anywhere else the flag is refused.
  const noCode = body.noCode === true && r.service === 'ride' && next === 'completed';
  if (body.noCode !== undefined && !noCode) fail(400, 'invalid_input');
  if (r.service === 'ride' && next === 'completed' && r.handover_code && oldCaptainApp) fail(426, 'client_update_required'); // D-7: it cannot ask for the code
  if ((next !== 'completed' || (r.service !== 'parcel' && r.service !== 'shop')) && (body.collectedCents !== undefined || body.varianceReason !== undefined)) fail(400, 'invalid_input'); // A11: the parcel fee, or a shop order's goods and fees
  await shop.beforeAdvance(r, next, body, user.id);
  await safetyFree(r.id, body);
  const now = Date.now();
  await rideLifecycle.guardAdvance(r, user.id, next, body.boardingCode !== undefined ? body.boardingCode : body.code, body.expectedPinRevision);
  if (next === 'completed' || next === 'returned') {
    // Support holds the goods once it took them from this assignment's captain, or once that captain was blocked holding them: the
    // captain's old return code no longer closes the order as a sender handback (Sol full review 21 Nov, item 3).
    // A recovery by an eligibility build from before CUSTODY_TAKEN counts too (PostgreSQL only; Haiku M4 / Sol money 3 on PR #101).
    if (next === 'returned') {
      const { supportHasGoods, custodyBlocked } = await returnCustody(persistence, r);
      if (supportHasGoods || custodyBlocked) fail(409, 'cannot_advance');
    }
    // Delivery needs the recipient's handover code; a return needs the sender's return code.
    // A ride whose rider left without giving the trip code still ends, on the driver's word: the driver must not stay stuck
    // on it (a private ride takes the whole car). It is recorded and support is told, so the rider can be phoned (D-7).
    const expected = noCode ? null : next === 'completed' ? r.handover_code : r.return_code;
    if (!noCode && ((await one('SELECT failures FROM proof_attempts WHERE order_id = ?', r.id))?.failures ?? 0) >= 5) fail(409, 'proof_locked');
    if (expected && latinDigits(String(body.code ?? '').trim()) !== expected) {
      (await run(`INSERT INTO proof_attempts (order_id, failures) VALUES (?, 1) ON CONFLICT(order_id) DO UPDATE SET failures = proof_attempts.failures + 1`, r.id));
      (await run(`INSERT INTO security_events (actor_id, order_id, action, created_at) VALUES (?, ?, 'PROOF_FAILED', ?)`, user.id, r.id, now));
      if ((await one('SELECT failures FROM proof_attempts WHERE order_id = ?', r.id))?.failures === 5) await queuePush((await adminIds()), 'attention', r.id, '/admin/orders'); // the fifth miss locks it
      fail(400, 'wrong_code');
    }
    const rate = await driverRate(user.id);
    const door = next === 'completed' ? (r.service === 'shop' ? await shop.doorCash(r, body) : doorCash(r.price, r.discount, body, fail)) : null;
    await persistence.savepoint(async () => {
      // A11: the five door columns are one immutable fact, written here and nowhere else (write-once triggers in both schemas).
      // The status guard makes a concurrent advance that committed first win: PostgreSQL re-checks it after waiting on the row lock.
      if (!(await run(`UPDATE orders SET status = ?, commission = ?, completed_at = ?, updated_at = ?, collected_cents = ?, variance_reason = ?,
        door_expected_cents = ?, door_collected_by = ?, door_request_id = ? WHERE id = ? AND status = ?`,
        next, next === 'returned' ? 0 : r.commission ?? commissionOn(r.price, rate), // DRV-17: a return earns no commission
        now, now, door?.collectedCents ?? null, door?.varianceReason ?? null,
        door?.expectedCents ?? null, door ? user.id : null, door ? requestId : null, r.id, r.status)).changes) fail(409, 'order_changed');
      if (next === 'returned') { (await run(`INSERT INTO security_events (actor_id, order_id, action, created_at) VALUES (?, ?, 'RETURN_COMPLETED', ?)`, user.id, r.id, now)); await markNoFare(user.id, r.id); }
      else if (!noCode) (await rewardReferral(r.id, now)); // a ride ended on the driver's word proves no trip: no referral credit
      // Written once the ride has really ended, so a refused completion leaves no record and pages nobody (Haiku PR #117).
      if (noCode) (await run(`INSERT INTO security_events (actor_id, order_id, action, created_at) VALUES (?, ?, 'RIDE_ENDED_WITHOUT_CODE', ?)`, user.id, r.id, now));
      await shop.afterFinish(r, next, user.id, body);
      await shippingTripPay(r, next, user.id);
      await postOrderJournals(r.id); // T29: balanced commission/discount journals in the same transaction
    });
  } else (await run('UPDATE orders SET status = ?, updated_at = ?, picked_up_at = COALESCE(picked_up_at, ?) WHERE id = ?', next, now, next === 'in_transit' ? now : null, r.id));
  await rideLifecycle.markVerified(r, next);
  if (noCode) await queuePush((await adminIds()), 'attention', r.id, '/admin/orders'); // support phones the rider (D-7)
  if (next === 'at_pickup' || next === 'in_transit' || next === 'completed' || next === 'returned') await queuePush([r.customer_id], next, r.id);
  return (await getOrder(r.id, user));
}

async function reportException(user: User, id: number, body: Row) {
  const r = (await one(`SELECT * FROM orders WHERE id = ?${persistence.backend === 'postgres' ? ' FOR UPDATE' : ''}`, id)) ?? fail(404, 'not_found');
  if (r.driver_id !== user.id || !['at_pickup', 'in_transit'].includes(r.status) || r.service === 'ride') fail(409, 'cannot_report');
  if (body.reason === 'wrong_or_missing_item' && r.service !== 'shop') fail(400, 'invalid_input');
  // SHIP-16/17: only a parcel or freight pickup can be refused, and only at the pickup check.
  const refusal = body.reason === pickupRefusal;
  if (refusal && (r.status !== 'at_pickup' || !['parcel', 'freight'].includes(r.service))) fail(409, 'cannot_report');
  await shop.guardCaptainExit(r, 'exception');
  await safetyFree(r.id, body);
  if (body.expectedStatus !== r.status) fail(409, 'order_changed');
  const now = Date.now();
  if (r.status === 'at_pickup') {
    // Nothing was collected, so there is nothing to hold or return: the pickup fails and the sender is told why.
    await persistence.savepoint(async () => {
      await pickupPay(r, user.id, body.reason);
      (await run("UPDATE orders SET status = 'cancelled', exception_reason = ?, exception_detail = ?, updated_at = ? WHERE id = ?", body.reason, refusal ? body.detail : null, now, r.id));
      (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'PICKUP_FAILED', ?, ?)`,
        user.id, r.id, JSON.stringify({ reason: body.reason, ...(refusal && { detail: body.detail }), note: text(body.note, 200, false) }), now));
    });
    await queuePush([r.customer_id], 'cancelled', r.id);
    return (await getOrder(r.id, user));
  }
  if (r.service === 'shop') await shop.recordSeals(r, body, 'fail', user.id);
  (await run("UPDATE orders SET status = 'on_hold', exception_reason = ?, updated_at = ? WHERE id = ?", body.reason, now, r.id));
  (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'DELIVERY_EXCEPTION', ?, ?)`,
    user.id, r.id, JSON.stringify({ reason: body.reason, note: text(body.note, 200, false), assignmentEpoch: r.assignment_epoch }), now));
  await queuePush([r.customer_id], 'on_hold', r.id); // SPEC-exception-push.md
  await queuePush((await adminIds()), 'attention', r.id, '/admin/orders'); // support calls both sides and decides
  return (await getOrder(r.id, user));
}

route('POST', '/api/orders/:id/exception', async ({ user, params, body }) => {
  need(user, 'driver'); needActive(user);
  if (body.reason === pickupRefusal ? !pickupRefusalDetails.includes(body.detail) : !shop.exceptionReasons.includes(body.reason) || body.detail != null) fail(400, 'invalid_input');
  text(body.note, 200, false);
  return (await driverCommand(user, Number(params[0]), body, reportException));
});

route('POST', '/api/admin/orders/:id/resolve', async ({ user, params, body, req }) => {
  need(user, 'admin');
  const reason = text(body.reason, 500);
  // Use a distinct command so an older server refuses an office receipt instead of silently omitting the additional leg.
  const action = typeof body.action === 'string' ? body.action : fail(400, 'invalid_input');
  if (body.handoff !== undefined) fail(400, 'invalid_input'); // typed handbacks use separate commands, including on retry
  // 'support_takeover': support collects the goods from the captain during the return, before any office or sender closure. It
  // changes no status; it records custody for the current assignment, so the captain's code can no longer close the order and
  // the captain is paid the trip so far (Sol recheck of PR #101, HIGH 1: SQLite had no way to record that hand-over).
  const takeover = action === 'support_takeover';
  const deliveredToOffice = action === 'confirm_office_return';
  const deliveredToSender = action === 'confirm_sender_return';
  const confirmsReturn = action === 'confirm_return' || deliveredToOffice || deliveredToSender;
  // Who carried the goods to the office decides the captain's office leg; it is recorded, never assumed (Kimi, Haiku review of
  // the Sol lead commits). A markerless confirm_return from this release on is neither office nor sender: it keeps its one-leg
  // price, and office intake needs the typed command (historical rows without a handoff keep their old meaning).
  // 'support': support collected the goods from the captain before the office, so the captain's pay stops at the trip so far
  // (DRV-17); SQLite has no other way to record that transfer (Sol full review 21 Nov, item 2).
  const officeCarrier = deliveredToOffice ? body.carrier : undefined;
  if (deliveredToOffice ? officeCarrier !== 'captain' && officeCarrier !== 'staff' && officeCarrier !== 'support' : body.carrier !== undefined) fail(400, 'invalid_input');
  // A plain confirmation is priced as a sender handback and cannot be told apart from an office one. An installed build older
  // than this release gets the update screen for it in production, as for cash writes, instead of a price it cannot correct
  // (Sol full review 21 Nov, item 1). Scripts and tests elsewhere send no build.
  if (action === 'confirm_return' && cashClientFenced(req.headers['x-wind-client'], production)) fail(426, 'client_update_required');
  const officeLeg = officeCarrier === 'captain';
  const from = confirmsReturn || takeover ? 'returning' : action === 'reattempt' || action === 'return' ? 'on_hold' : null;
  const to = confirmsReturn ? 'returned' : action === 'reattempt' ? 'in_transit' : 'returning';
  if (reason.length < 5 || !from) fail(400, 'invalid_input');
  if (confirmsReturn || takeover) needStaff(await staffActor(persistence, user), fail, 'support');
  const id = Number(params[0]);
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    const order = (await one(`SELECT id, customer_id, driver_id, status, service, exception_reason, price, assignment_epoch, assigned_at FROM orders WHERE id = ?${persistence.backend === 'postgres' ? ' FOR UPDATE' : ''}`, id)) ?? fail(404, 'not_found');
    if (order.status !== from) fail(409, 'cannot_resolve');
    if (order.service === 'ride') fail(409, 'cannot_resolve'); // SRS §2.1: rides never hold or return
    await shop.guardResolve(id, confirmsReturn ? 'confirm_return' : action);
    if (body.action === 'reattempt' && (order.service === 'parcel' || order.service === 'freight') && exceptionReasons.includes(order.exception_reason)) {
      if (await orderDeliveryAttempts(id) >= 3) fail(409, 'reattempt_limit');
    }
    // Each update re-checks the state it leaves, so two concurrent resolves (a double submit, two admins) decide once:
    // PostgreSQL's BEGIN does not lock the row read above.
    const moved = (changes: number | bigint) => { if (!changes) fail(409, 'cannot_resolve'); };
    const { supportHasGoods, custodyBlocked } = order.status === 'returning'
      ? await returnCustody(persistence, order) : { supportHasGoods: false, custodyBlocked: false };
    const supportRequired = supportHasGoods || custodyBlocked;
    if (supportRequired && (deliveredToSender || deliveredToOffice && officeCarrier !== 'support')) fail(409, 'cannot_resolve');
    // When support is the only valid carrier, the compatible untyped command can only mean office intake.
    const supportConfirmation = action === 'confirm_return' && supportRequired;
    const carrier = supportConfirmation ? 'support' : officeCarrier;
    const handoff = deliveredToOffice || supportConfirmation ? 'office' : deliveredToSender ? 'sender' : action === 'confirm_return' ? 'unspecified' : undefined;
    const recordCustody = async () => {
      if (!supportHasGoods) (await run("INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'CUSTODY_TAKEN', ?, ?)",
        user.id, id, JSON.stringify({ assignmentEpoch: order.assignment_epoch, driverId: order.driver_id, reason }), Date.now()));
    };
    if (takeover) {
      if (supportHasGoods) fail(409, 'cannot_resolve'); // already recorded: a double submit decides once
      // The row write takes PostgreSQL's row lock and re-checks the state, as the other branches do.
      moved((await run("UPDATE orders SET updated_at = ? WHERE id = ? AND status = 'returning'", Date.now(), id)).changes);
      await recordCustody();
    }
    else if (body.action === 'reattempt') moved((await run("UPDATE orders SET status = 'in_transit', updated_at = ? WHERE id = ? AND status = 'on_hold'", Date.now(), id)).changes);
    else if (confirmsReturn) {
      moved((await run("UPDATE orders SET status = 'returned', commission = 0, completed_at = ?, updated_at = ? WHERE id = ? AND status = 'returning'", Date.now(), Date.now(), id)).changes); // DRV-17
      await markNoFare(user.id, id);
      if (carrier === 'support') await recordCustody();
      await shop.afterFinish(order, 'returned', user.id, {}, officeLeg);
      await shippingTripPay(order, 'returned', user.id, officeLeg);
      await postOrderJournals(id); // the cash screen counts this order, as it does a return the courier confirmed
    }
    else {
      moved((await run("UPDATE orders SET status = 'returning', return_code = ?, updated_at = ? WHERE id = ? AND status = 'on_hold'", String(randomInt(1000, 10000)), Date.now(), id)).changes);
      (await run('DELETE FROM proof_attempts WHERE order_id = ?', id)); // the return gets its own five attempts
    }
    (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'EXCEPTION_RESOLVED', ?, ?)`,
      user.id, id, JSON.stringify({ action: confirmsReturn ? 'confirm_return' : action, reason, handoff, ...(carrier && { carrier }) }), Date.now()));
    await queuePush([order.driver_id], 'decided', id); // SPEC-exception-push.md; ponytail: one generic line, the job card shows which decision
    if (!takeover) await queuePush([order.customer_id], to, id); // the sender's order is still returning
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  return (await getOrder(id, user));
});

route('POST', '/api/orders/:id/advance', async ({ user, params, body, req }) => {
  need(user, 'driver'); needActive(user);
  const oldCaptainApp = tripCodeClientTooOld(req.headers['x-wind-client'], production);
  return (await driverCommand(user, Number(params[0]), body, (u, id, input, requestId) => advanceOrder(u, id, input, requestId, oldCaptainApp)));
});

// Lost acknowledgements replay the stored outcome instead of applying a driver command twice.
async function driverCommand(user: User, id: number, body: Row, apply: (user: User, id: number, input: Row, requestId: string) => Promise<Order>) {
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
          const metadata = recoveryMetadata(current);
          if (Date.now() >= input.attemptExpiresAt) fail(409, 'command_expired');
          if (input.expectedAssignedAt !== (current.assigned_at ?? null)
            // SQLite gained assignment_epoch in this release; installed captain apps there never send it, so it binds only when sent.
            || (metadata.assignmentEpoch !== null && (persistence.backend === 'postgres' || input.expectedAssignmentEpoch !== undefined)
              && input.expectedAssignmentEpoch !== metadata.assignmentEpoch)
            || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== metadata.version) {
            // Older apps need the upgrade response even when the hold already invalidated their recovery envelope.
            if (input.expectedProofVersion === undefined && current.driver_id === user.id && activeStatuses.includes(current.status))
              await safetyFree(id, input);
            fail(409, 'order_changed');
          }
        }
        result = (await apply(user, id, input, requestId));
      }
      catch (error) { if (!(error instanceof HttpError)) throw error; failure = error; }
      (await run('INSERT INTO order_actions (user_id, request_id, payload_hash, order_id, http_status, error) VALUES (?, ?, ?, ?, ?, ?)',
        user.id, requestId, hash, id, failure?.status ?? 200, failure?.message ?? null));
    }
    if (input.recoveryProtocol === 1 && result) result = await getOrder(id, user, false, true);
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  if (failure) { await flushPush(); throw failure; } // a refused command is still committed, so its queued pushes go out too
  return result;
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
      WHERE u.id = ? AND u.role = 'driver' AND ${accountModes ? "s.active_mode = 'captain' AND u.status IN ('active','pending')" : "u.status = 'active'"} AND s.token_hash = ?
        AND s.created_at > ? AND COALESCE(s.last_seen_at, s.created_at) > ?
        AND (? = 0 OR u.phone_verified_at IS NOT NULL OR u.approved_at IS NOT NULL OR EXISTS (SELECT 1 FROM recovery_email_proofs p
          WHERE p.user_id = u.id AND p.email = u.email AND p.verified_at = u.email_verified_at))
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
    if (accountModes) await captainActivity(persistence, user.id, sha(bearer(req)!));
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
type LiveRead = { orderId: number; driverId: number | null; driverKey: string | null; assignmentEpoch?: number; fix: { updatedAt: number } | null };
async function liveFix(read: () => Promise<LiveRead>, query: URLSearchParams, req: IncomingMessage, authenticated = false) {
  const since = Number(query.get('since')) || 0;
  const want = query.get('driver'); // the driver the client already shows: a fix from another car is never returned
  const assignment = authenticated ? query.get('assignment') : null;
  const changed = (snapshot: LiveRead) => (want != null && want !== snapshot.driverKey)
    || (assignment != null && assignment !== String(snapshot.assignmentEpoch));
  const now = (await read());
  if (changed(now)) return { driverLocation: null, driverKey: now.driverKey, driverChanged: true };
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
  if (changed(after)) return { driverLocation: null, driverKey: after.driverKey, driverChanged: true };
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

const OUTSIDE_GRAPH_METRES = 2000; // a West Bank address is rarely 2 km from a mapped road; a point inside Israel is far more
class OutsideGraph extends Error {}
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
    // The graph holds West Bank roads only, and OSRM snaps any point to its nearest road: a start or end it had to move this far
    // is outside the graph (Tel Aviv lands kilometres away), so the answer is no road route rather than a confident wrong one.
    // Only the two ends: detour via points are placed off the road on purpose. OSRM itself is healthy (Haiku PR #104 M-2).
    // With a bearing hint OSRM may only snap the start to a segment facing that way, so a driver's start is not judged by it (third
    // pass 3). OSRM always returns waypoints for /route; an answer without them is judged by the checks above alone.
    const snapped = Array.isArray(j.waypoints) ? [...(extra.includes('bearings=') ? [] : [j.waypoints[0]]), j.waypoints.at(-1)] : [];
    if (snapped.some((w: any) => typeof w?.distance === 'number' && w.distance > OUTSIDE_GRAPH_METRES)) throw new OutsideGraph();
    return j.routes
      .map((r: any) => ({ distance: r.distance, duration: r.duration, line: r.geometry.coordinates.map(([x, y]: number[]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]),
        // Turn-by-turn for the driver's banner; only /api/route?steps=1 sends them.
        steps: (Array.isArray(r.legs) ? r.legs : []).flatMap((leg: any, index: number, legs: any[]) => (Array.isArray(leg?.steps) ? leg.steps : [])
          // A via point (a detour around a closed checkpoint) is not a stop: OSRM ends and starts a leg there, the driver only passes through.
          .filter((step: any) => !(step?.maneuver?.type === 'arrive' && index < legs.length - 1) && !(step?.maneuver?.type === 'depart' && index > 0))).flatMap((step: any) => {
          const [longitude, latitude] = Array.isArray(step?.maneuver?.location) ? step.maneuver.location : [];
          return finite(latitude, 90) && finite(longitude, 180) ? [{ type: String(step.maneuver.type ?? ''), latitude, longitude,
            ...(step.maneuver.modifier && { modifier: String(step.maneuver.modifier) }), ...(step.name && { name: String(step.name).slice(0, 80) }), ...(Number.isInteger(step.maneuver.exit) && { exit: step.maneuver.exit }) }] : [];
        }) }));
  } catch (error) {
    if (error instanceof OutsideGraph) fail(503, 'route_unavailable');
    routingHealth = { healthy: false, checkedAt: Date.now(), reason: 'route_unavailable' };
    throw error;
  }
}

// Best road route (SPEC-checkpoint-routing.md): OSRM's fastest (car profile, multi-level Dijkstra), unless it crosses a
// checkpoint drivers report closed — then the fastest alternative or forced detour that stays clear of every closed one.
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
          // Perpendicular to the route at the first blocking checkpoint, 1–8 km to either side.
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
  const lang = query.get('lang') === 'en' ? 'en' : 'ar';
  const result = query.get('steps') === '1' ? { ...line, steps: steps.map(step => step.name ? { ...step, name: streetName(step.name, lang) } : step) } : line;
  return query.get('journeyProtocol') === '1' ? { ...result, eta: etaProjection(result.minutes * 60, calculatedAt, calculatedAt + 30_000) } : result;
});

// Map search (real OpenStreetMap places, server/domain/place-search.ts).
registerPlaceSearchRoutes(route, { fail, limit, limitKey: id => identityKey('place-search', id) }, process.env.GEOCODER_URL || undefined);
registerNearbyRoutes(route, { fail, need, needActive, limit, limitKey: id => identityKey('nearby', id), enabledServices: () => enabledServices, servesFor,
  available: async (driverId, service, vehicle) => {
    const driver = await one('SELECT role, status FROM users WHERE id = ?', driverId);
    if (!driver || driver.role !== 'driver' || driver.status !== 'active' || (accountModes && !await captainOnline(persistence, driverId))) return false;
    // A car shows while it could take one more rider (idle, or a shared run with a seat free) or one more parcel.
    return canTake(await activeLoad(driverId), service, service === 'ride' ? { shared: true, option: '1' } : undefined, vehicle);
  } });
registerPlaceIndexRoutes(route, { fail, limit, limitKey: id => identityKey('place-suggest', id) });
registerPlaceLinkRoutes(route, { fail, limit, limitKey: id => identityKey('place-link', id) });

// T07/T08 Google display-route proxy: budgets, validation and the HTTP boundary live in the domain
// module; fares, feasibility and checkpoint policy keep reading the OSRM route, so it never sets money.
const googleRoutes = createGoogleRoutes({ apiKey: process.env.GOOGLE_MAPS_SERVER_KEY });
registerGoogleRouteRoutes(route, googleRoutes, { fail, limit, budgetKey: id => identityKey('google-route', id) });



// Public trip page: minutes and road lines from the fresh driver fix to the next stop's city (it never sees exact pins).
route('GET', '/api/track/([a-f0-9]{64})/eta', async ({ params, query }) => {
  const token = params[0]!, hash = sha(token);
  const { row: r, view } = await trackView(token); // validate the link and reuse the same snapshot
  (await limit(identityKey('track-eta', hash), 300, 10 * 60_000)); // after one lookup (a made-up token leaves no row)
  const driverKey = view.driver?.ref ?? null;
  if (query.has('driver') && query.get('driver') !== driverKey) return { minutes: null };
  if (query.has('status') && query.get('status') !== r.status) return { minutes: null };
  if (!view.driverLocation) return { minutes: null };
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
    // A returned order collected no fare (DRV-17); a shop return's failed-trip pay comes from the shop ledger.
    const r = (await one(`SELECT COUNT(*) jobs, COALESCE(SUM(CASE WHEN status = 'returned' THEN 0 ELSE price END), 0) gross, COALESCE(SUM(commission), 0) commission
      FROM orders WHERE driver_id = ? AND status IN (${finishedSql}) AND completed_at >= ?`, user.id, from))!;
    const trip = await shopTables(persistence) ? Number((await one(`SELECT COALESCE(SUM(amount_agorot), 0) n FROM shop_ledger WHERE book = 'captain' AND driver_id = ? AND created_at >= ?`, user.id, from))!.n) / 100 : 0;
    const gross = Math.round((Number(r.gross) + trip) * 100) / 100;
    const tripPayCents = await captainPayAvailable() ? Number((await one(`SELECT -COALESCE(SUM(amount_cents), 0) n FROM cash_entries WHERE driver_id = ?
      AND source IN ('trip_pay', 'pickup_pay') AND created_at >= ?`, user.id, from))!.n) : 0;
    // `net` stays gross − commission for installed captain builds. `earnedNet` adds trip and pickup pay for this build (R5-L3).
    const netCents = Math.round((gross - Number(r.commission)) * 100);
    return { jobs: r.jobs, gross, commission: r.commission, net: netCents / 100, earnedNet: (netCents + tripPayCents) / 100, tripPayCents };
  };
  const midnight = new Date().setHours(0, 0, 0, 0);
  return { today: (await since(midnight)), week: (await since(Date.now() - 7 * DAY)), all: (await since(0)) };
});

// Cash settlement: drivers collect every fare in cash and owe Wind the commission snapshot of each finished job.
// The ledger is append-only; a handover counts only after the driver confirms it (two-person check).
const cashSum = (filter: string) => `COALESCE((SELECT SUM(amount_cents) FROM cash_entries e WHERE e.driver_id = u.id AND ${filter}), 0)`;
const cashMinor = (column: 'commission' | 'discount') => persistence.backend === 'postgres' ? `${column}_minor` : `CAST(ROUND(${column} * 100) AS INTEGER)`;
// The four inputs of cashOwed, as columns of one row per driver `u`.
// All shop cash collected at completed shop doors above the delivery fee: goods, the service fee and any over-collection (DLV-15),
// less captain pay from the shop ledger (DRV-17).
const shopDue = (shop: boolean) => shop ? `COALESCE((SELECT SUM(CASE WHEN COALESCE(o.collected_cents, 0) - s.delivery_fee_agorot <= 0 THEN 0 ELSE COALESCE(o.collected_cents, 0) - s.delivery_fee_agorot END)
    FROM shop_orders s JOIN orders o ON o.id = s.order_id WHERE o.driver_id = u.id AND o.status = 'completed'), 0) - COALESCE((SELECT SUM(l.amount_agorot) FROM shop_ledger l WHERE l.book = 'captain' AND l.driver_id = u.id), 0)` : '0';
// DRV-17 (19 Nov): a return collects no fare, so it owes no commission and earns no promo relief. A return this release closed carries
// commission 0 and the RETURN_NO_FARE marker; any other return keeps what it was booked with.
const owedColumns = (shop: boolean) => `${shopDue(shop)} shop_due, COALESCE((SELECT SUM(${cashMinor('commission')}) FROM orders WHERE driver_id = u.id AND status IN (${finishedSql})), 0) commission,
    COALESCE((SELECT SUM(${cashMinor('discount')}) FROM orders WHERE driver_id = u.id AND (status = 'completed'
      OR (status = 'returned' AND NOT ${noFareSql('orders')}))), 0) discounts,
    ${cashSum("kind = 'adjustment'")} adjustments, ${cashSum("kind = 'remittance' AND status = 'confirmed'")} remitted`;
async function cashBalances(where: string, ...params: SQLInputValue[]) {
  const shopTablesReady = await shopTables(persistence);
  return (await all(`SELECT u.id, u.name, u.phone,
    ${owedColumns(shopTablesReady)},
    ${cashSum("kind = 'remittance' AND status = 'pending'")} pending,
    (SELECT MAX(created_at) FROM cash_entries e WHERE e.driver_id = u.id AND kind = 'remittance') last_remittance
    FROM users u WHERE u.role = 'driver' AND u.phone NOT LIKE 'deleted-%' AND ${where}`, ...params))
    .map(r => ({ driverId: r.id as number, name: r.name as string, phone: r.phone as string,
      commissionCents: r.commission as number, discountsCents: r.discounts as number, adjustmentsCents: r.adjustments as number, remittedCents: r.remitted as number,
      // Promo discounts are Wind's cost: the driver collected that much less cash, so it comes off what they owe.
      pendingCents: r.pending as number, shopCents: Number(r.shop_due), owedCents: cashOwed(r.commission, r.discounts, r.adjustments, r.remitted) + Number(r.shop_due), lastRemittanceAt: (r.last_remittance as number) ?? null }));
}
// The settled balance plus the full commission on active jobs (promo discounts on jobs in hand are not subtracted until they
// finish, so the cap errs early). A customer's destination change on a job in hand can raise it past the cap: the cap
// governs taking new work, never stranding a parcel already collected.
// The cash cap (settings.driverCashCap) is checked against this at accept, as Wolt, Careem and Cedar GO cap courier cash.
async function cashExposureCents(driverId: number) {
  // One statement, so PostgreSQL reads owed and in-hand from one snapshot: a job finishing between two reads cannot vanish from both.
  const shopReady = await shopTables(persistence);
  // A shop job in hand also holds the most cash its door can collect for Wind and the shop: the goods cap and the service fee.
  const r = (await one(`SELECT ${owedColumns(shopReady)},
    COALESCE((SELECT SUM(${cashMinor('commission')}) FROM orders WHERE driver_id = u.id AND status IN (${activeSql})), 0) active,
    ${shopReady ? `COALESCE((SELECT SUM(s.goods_cap_agorot + s.service_fee_agorot) FROM shop_orders s JOIN orders o ON o.id = s.order_id
      WHERE o.driver_id = u.id AND o.status IN (${activeSql})), 0)` : '0'} shop_hold
    FROM users u WHERE u.id = ?`, driverId));
  return r ? cashOwed(r.commission, r.discounts, r.adjustments, r.remitted) + Number(r.shop_due) + Number(r.active) + Number(r.shop_hold) : 0;
}
const driverRate = async (driverId: number) => (await activePlan(driverId, 'driver')) === 'pro' ? (await settings()).proCommission : (await settings()).commission;
/** Refuses work that would take a driver past settings.driverCashCap; `code` is what the caller is told. */
async function guardCashCap(driverId: number, price: number, rate: number, code = 'cash_cap_exceeded', orderId?: number) {
  const cap = Math.round((await settings()).driverCashCap * 100);
  const hold = orderId === undefined ? 0 : await shop.holdCents(orderId); // a shop job adds its door cash (CON-05)
  if ((await cashExposureCents(driverId)) + Math.round(commissionOn(price, rate) * 100) + hold > cap) fail(409, code);
}
function currentPickupReview(order: Row, review: Row) {
  return order.driver_id != null && review.driverId === order.driver_id && review.assignmentEpoch === order.assignment_epoch;
}
async function openPickupPayReviews(driverId?: number) {
  const events = await all(`SELECT o.id, o.driver_id, o.assignment_epoch, u.name AS driver_name, e.detail
    FROM orders o JOIN security_events e ON e.order_id = o.id LEFT JOIN users u ON u.id = o.driver_id
    WHERE o.status = 'cancelled' AND o.service IN ('parcel','freight') AND o.driver_id IS NOT NULL
      ${driverId === undefined ? '' : 'AND o.driver_id = ?'}
      AND e.action = 'PICKUP_PAY_REVIEW' AND NOT EXISTS (
        SELECT 1 FROM security_events newer WHERE newer.order_id = o.id AND newer.id > e.id
          AND newer.action IN ('PICKUP_PAY_REVIEW','PICKUP_PAY_DECIDED'))
    ORDER BY e.id`, ...(driverId === undefined ? [] : [driverId]));
  return events.flatMap(event => {
    const review = auditDetail(event);
    if (!currentPickupReview(event, review)) return [];
    return [{ orderId: Number(event.id), orderCode: orderCode(Number(event.id)), driverName: event.driver_name as string | null,
      suggestedCents: (review.suggestedCents ?? null) as number | null, reason: review.reason as PickupReview['reason'] }];
  });
}
// A driver leaves the ledger (deletion or role change) only once nothing is owed in either direction, nothing is waiting
// for confirmation, and no block review or pickup-pay review is still undecided (R5-H2). A decided review, including a denial, does not fence.
async function cashSettlementPending(userId: number) {
  const balance = (await cashBalances('u.id = ?', userId))[0];
  if (balance && (balance.owedCents !== 0 || balance.pendingCents > 0)) return 'cash_outstanding';
  if (await blockReviewsAvailable() && await one('SELECT 1 n FROM courier_block_reviews WHERE driver_id = ? AND decided_at IS NULL', userId)) return 'review_pending';
  return (await openPickupPayReviews(userId)).length ? 'review_pending' : null;
}
async function cashSettled(userId: number) {
  const pending = await cashSettlementPending(userId);
  if (pending) fail(409, pending);
}

// The caller owns the SQLite write transaction used by work and cash decisions.
async function closeCaptainIfSettled(userId: number) {
  if (!await one("SELECT 1 FROM users WHERE id = ? AND captain_state = 'closing'", userId)) return;
  if (await captainHasWork(persistence, userId) || await cashSettlementPending(userId)) return;
  await setCaptainOffline(persistence, userId);
  await run(`UPDATE sessions SET active_mode = 'personal', mode_revision = mode_revision + 1
    WHERE user_id = ? AND active_mode = 'captain'`, userId);
  await run(`UPDATE users SET role = 'customer', captain_state = NULL, vehicle = NULL, plate = NULL,
    heading_city = NULL, heading_until = NULL WHERE id = ?`, userId);
  await run('DELETE FROM captain_profiles WHERE user_id = ?', userId);
  await run("UPDATE subscriptions SET ends_at = MIN(ends_at, ?) WHERE user_id = ? AND plan = 'pro' AND status = 'active'", Date.now(), userId);
  await run("UPDATE subscriptions SET status = 'rejected' WHERE user_id = ? AND plan = 'pro' AND status = 'pending'", userId);
  await run("INSERT INTO security_events(actor_id,action,detail,created_at) VALUES (?,'CAPTAIN_CLOSED','{}',?)", userId, Date.now());
}
// Installed apps show `note` and ignore `source`. Trip and pickup pay keep the machine note in the ledger; the response carries both languages.
function cashEntryNote(r: Row) {
  if (r.source === 'trip_pay') return `Trip pay · أجر الرحلة · order ${r.order_id}`;
  if (r.source === 'pickup_pay') return `Pickup trip pay · أجر التوجّه إلى الاستلام · order ${r.order_id}`;
  return r.note;
}
const cashEntry = (r: Row) => ({ id: r.id, kind: r.kind, amountCents: r.amount_cents, note: cashEntryNote(r), status: r.status,
  ...(r.source != null && { source: r.source }),
  reference: r.source === 'payout' ? `P-${String(r.id).padStart(6, '0')}` : r.kind === 'remittance' ? `R-${String(r.id).padStart(6, '0')}` : null, createdAt: r.created_at, decidedAt: r.decided_at ?? null });
// T25: administrator resolution of pending cash handovers (additive module owns its route declarations).
async function lockCashDriver(driverId: number) {
  if (persistence.backend === 'postgres') await one('SELECT id FROM users WHERE id = ? FOR UPDATE', driverId);
}
async function settleableDriver(driverId: number) {
  return !!(await one(`SELECT id FROM users WHERE id = ? AND role = 'driver' AND phone NOT LIKE 'deleted-%'
    ${persistence.backend === 'postgres' ? 'FOR UPDATE' : ''}`, driverId));
}
const needCashFinance = async (user: User) => needStaff(await staffActor(persistence, user), fail, 'finance');
const cashSettlement = <T,>(work: () => Promise<T>) => persistence.inTransaction ? persistence.savepoint(work) : emailTransaction(work);
registerCashOpsRoutes(route, { one, all, run, fail, need, text, cashEntry, queuePush, postCashJournal, lockCashDriver, needCashFinance, settle: cashSettlement });
registerCashReceiptRoutes(route, { need, fail, uuid, one, cashEntry });
// In-app support inbox (SPEC-support-inbox.md): people write to support; admins with the support scope answer, close and tag.
const supportScoped = async (user: User) => ['support', 'platform_admin'].includes(staffRoleOf(await staffActor(persistence, user)) ?? '');
registerSupportRoutes(route, { one, all, run, fail, text, limit: (key, maximum, windowMs) => limit(key, maximum, windowMs),
  limitKey: id => identityKey('support', id), queuePush,
  holdPerson: async id => !!(await one(`SELECT id FROM users WHERE id = ? AND phone NOT LIKE 'deleted-%'${persistence.backend === 'postgres' ? ' FOR KEY SHARE' : ''}`, id)),
  // Only staff who can open the inbox hear about a new conversation (finance or dispatch admins would get a 403).
  staffIds: async () => (await Promise.all((await all("SELECT id, role, status FROM users WHERE role = 'admin' AND status = 'active'"))
    .map(async a => ({ id: a.id as number, ok: await supportScoped(a as never) })))).filter(a => a.ok).map(a => a.id),
  // PostgreSQL requests already run in the envelope transaction, where BEGIN opens a savepoint: a unique violation then rolls
  // back only this unit and the replay that follows still works (no 'current transaction is aborted').
  tx: work => persistence.scope(async () => {
    if (persistence.backend === 'sqlite' && persistence.inTransaction) return work();
    await persistence.exec(persistence.backend === 'postgres' ? 'BEGIN' : 'BEGIN IMMEDIATE');
    try { const value = await work(); await persistence.exec('COMMIT'); return value; }
    catch (error) { if (persistence.inTransaction) await persistence.exec('ROLLBACK'); throw error; }
  }),
  needSupport: async user => { need(user, 'admin'); needStaff(await staffActor(persistence, user), fail, 'support'); } });
// WP-02: admin assign / reassign, through the same guards as the driver accept.
registerAdminAssignRoutes(route, { one, all, run, db: persistence, fail, need, text, enabledServices, servesFor, canTake, activeLoad, driverRate, commissionOn, guardCashCap,
  safetyFree, hasOpenOffer: id => dispatch.hasOpenOffer(id), guardRideAssignment, ensureAssignment: (o, d, s) => rideLifecycle.ensureAssignment(o, d, s), assignedFrom: recordAssignedFrom, getOrder, queuePush,
  permanentApprovalRequired: production && selfService, releaseBefore: RELEASE_BEFORE,
  modeRefusal: accountModes ? profileAssignmentRefusal : undefined, eligibility, measured: () => measuredCapability(persistence) });

route('GET', '/api/driver/cash', async ({ user, query }) => {
  need(user, 'driver');
  const { owedCents, pendingCents, commissionCents, discountsCents, remittedCents, adjustmentsCents, shopCents } = (await cashBalances('u.id = ?', user.id))[0]!;
  const protocol = query.get('protocol') === '1' ? { durableCommands: persistence.backend === 'postgres', currency: 'ILS',
    entries: persistence.backend === 'postgres' ? await all('SELECT id,version,amount_cents AS amountCents FROM cash_entries WHERE driver_id=? AND status=\'pending\' ORDER BY id LIMIT 100',user.id) : [] } : undefined;
  return { owedCents, pendingCents, commissionCents, discountsCents, remittedCents, adjustmentsCents, ...(shopCents ? { shopCents } : {}), ...(protocol ? { protocol } : {}),
    capCents: Math.round((await settings()).driverCashCap * 100), exposureCents: await cashExposureCents(user.id),
    // The latest 50, plus every handover still waiting on the courier, so an older one is never lost behind newer history.
    entries: (await all(`SELECT * FROM cash_entries WHERE driver_id = ? AND (status = 'pending' OR id >= COALESCE(
      (SELECT id FROM cash_entries WHERE driver_id = ? ORDER BY id DESC LIMIT 1 OFFSET 49), 0)) ORDER BY id DESC`, user.id, user.id)).map(cashEntry) };
});

route('POST', '/api/driver/cash/:id/confirm', async ({ user, params, body }) => cashSettlement(async () => {
  need(user, 'driver');
  if (!['confirm', 'dispute'].includes(body.decision)) fail(400, 'invalid_input');
  const entry = (await one("SELECT * FROM cash_entries WHERE id = ? AND driver_id = ? AND kind = 'remittance'", Number(params[0]), user.id)) ?? fail(404, 'not_found');
  await lockCashDriver(entry.driver_id);
  if (!(await run("UPDATE cash_entries SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'",
    body.decision === 'confirm' ? 'confirmed' : 'disputed', Date.now(), entry.id)).changes) fail(409, 'already_decided');
  if (body.decision === 'dispute') await queuePush([entry.recorded_by], 'attention', 0, '/admin/cash'); // the admin who recorded it decides
  else await postCashJournal(entry.id); // T30: the confirmed handover settles in the same transaction
  return cashEntry((await one('SELECT * FROM cash_entries WHERE id = ?', entry.id))!);
}));

route('GET', '/api/admin/cash', async ({ user }) => {
  need(user, 'admin');
  return (await cashBalances('1 = 1')).sort((a, b) => b.owedCents - a.owedCents || a.driverId - b.driverId);
});


async function recordCash(user: User, body: Row, kind: 'remittance' | 'adjustment', client?: string | string[]) {
  need(user, 'admin');
  await needCashFinance(user);
  const amount = body.amountCents;
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) fail(400, 'invalid_amount');
  // `source: 'payout'` is this build's own typed-form alias for a payout; the installed bundle never sends a source (Haiku r8 N5).
  const legacyPayout = kind === 'adjustment' && body.source === 'payout';
  if (body.source !== undefined && (!legacyPayout || (body.intent !== undefined && body.intent !== 'payout'))) fail(400, 'invalid_input');
  const intent = legacyPayout ? 'payout' : body.intent;
  if (intent !== undefined && (kind !== 'adjustment' || (intent !== 'payout' && intent !== 'charge'))) fail(400, 'invalid_input');
  if (intent !== undefined && amount < 0) fail(400, 'invalid_amount');
  const positiveAdjustment = kind === 'adjustment' && amount > 0;
  const payout = intent === 'payout';
  const note = kind === 'adjustment' ? text(body.reason, 500, false) : text(body.note, 200, false);
  const requestId = body.requestId ?? null;
  if (requestId !== null && (typeof requestId !== 'string' || !uuid.test(requestId))) fail(400, 'invalid_request_id');
  // A completed request can replay across the admin app update, even if its original form did not send intent.
  const sameEntry = (saved: Row) => saved.recorded_by === user.id && saved.driver_id === Number(body.driverId) && saved.kind === kind
    // A same-id resend with another note is a different request, not a silent success (Haiku r6 F3).
    && saved.amount_cents === amount && (saved.note ?? '') === note
    && (intent === undefined || payout === (saved.source === 'payout'));
  const saved = requestId && (await one('SELECT * FROM cash_entries WHERE request_id = ?', requestId));
  if (saved) {
    // Only the recording admin replays an entry (A-01): another admin's id is a conflict, never their receipt.
    if (!sameEntry(saved)) fail(409, 'idempotency_conflict');
    return cashEntry(saved);
  }
  // An older cashier bundle cannot see this build's pending request ids and could re-enter a handover under a new one:
  // its fresh writes get the update screen it already shows. Same-id replay above still answers it.
  if (cashClientFenced(client, production)) fail(426, 'client_update_required');
  // A current cashier always names its request. Without an id a retried lost reply would write a second handover or charge
  // outside the unique index (Sol R25-M4), so a fresh entry from a build that says who it is needs one. In production a write
  // with no build is already fenced above; `production` stays here as defence if that fence changes (Haiku r24 L6). Scripts and
  // tests elsewhere send no build. A payout keeps its own refusal below.
  if (requestId === null && !payout && (production || client !== undefined)) fail(400, 'invalid_request_id');
  // After replay, so a saved entry still answers its own request id (Haiku r7 N-1): every new adjustment, payout included, names its reason.
  if (kind === 'adjustment' && note.length < 5) fail(400, 'invalid_input');
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    await lockCashDriver(Number(body.driverId));
    // The same request may have committed while this one waited for the lock: replay it here too, never a second entry.
    const raced = requestId && (await one('SELECT * FROM cash_entries WHERE request_id = ?', requestId));
    if (raced) {
      if (!sameEntry(raced)) fail(409, 'idempotency_conflict');
      (await persistence.exec('ROLLBACK'));
      return cashEntry(raced);
    }
    // An installed admin build cannot say payout or charge. 426 is the refusal it already understands: its update screen
    // (Sol R8-M1). This build always sends an intent. Same-request replay above still answers first.
    if (positiveAdjustment && intent === undefined) fail(426, 'client_update_required');
    const balance = (await cashBalances('u.id = ?', Number(body.driverId)))[0] ?? fail(404, 'not_found');
    const { owedCents: owed, pendingCents: pending } = balance;
    const available = owed - pending;
    if (kind === 'remittance' && (amount < 0 || amount > available)) fail(400, 'invalid_amount');
    if (payout) {
      if (requestId === null) fail(400, 'payout_request_id_required');
      if (pending > 0) fail(409, 'remittance_pending');
      if (amount > -owed) fail(400, 'invalid_amount');
      if (!(await captainPayAvailable())) fail(503, 'captain_pay_schema_required');
    }
    if (kind === 'adjustment' && amount < 0 && available + amount < 0) fail(400, 'invalid_amount');
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
    const id = Number((await run(`INSERT INTO cash_entries (driver_id, kind, amount_cents, note, status, recorded_by, created_at, request_id${payout ? ', source' : ''})
      VALUES (?, ?, ?, ?, ?, ?, ?, ?${payout ? ", 'payout'" : ''})`, balance.driverId, kind, amount, note, kind === 'remittance' ? 'pending' : 'confirmed', user.id, Date.now(), requestId)).lastInsertRowid);
    if (kind === 'adjustment') await postCashJournal(id); // T30: adjustments settle as they are recorded
    await queuePush([balance.driverId], 'cash', 0, '/driver/earnings');
    (await persistence.exec('COMMIT'));
    return cashEntry((await one('SELECT * FROM cash_entries WHERE id = ?', id))!);
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
}
route('POST', '/api/admin/cash/remittance', async ({ user, body, req }) => (await recordCash(user, body, 'remittance', req.headers['x-wind-client'])));
route('POST', '/api/admin/cash/adjustment', async ({ user, body, req }) => (await recordCash(user, body, 'adjustment', req.headers['x-wind-client'])));

// Subscriptions: requested in-app, paid in cash / bank transfer, activated by an admin.
route('POST', '/api/subscriptions', async ({ user, req }) => {
  need(user, 'customer', 'driver');
  const plan = planForRole[user.role] ?? fail(403, 'forbidden');
  if ((await latestSubscription(user.id, user.role))) fail(409, 'already_subscribed');
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
  return me(user, false, sha(bearer(req)!));
});

// Admin
route('POST', '/api/admin/orders/:id/proof-reset', async ({ user, params, body }) => {
  need(user, 'admin');
  needStaff(await staffActor(persistence, user), fail, 'support');
  const reason = text(body.reason, 500);
  if (reason.length < 5) fail(400, 'invalid_input');
  const order = (await getOrder(Number(params[0]), user));
  if (!['in_transit', 'returning'].includes(order.status)) fail(409, 'cannot_advance');
  await emailTransaction(async () => {
    needStaff(await staffActor(persistence, user, true), fail, 'support');
    (await run('DELETE FROM proof_attempts WHERE order_id = ?', order.id));
    (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'PROOF_RESET', ?, ?)`, user.id, order.id, JSON.stringify({ reason }), Date.now()));
    await queuePush([order.driverId ?? null], 'support', order.id); // the driver can enter the code again
  });
  return { ok: true };
});
route('GET', '/api/admin/stats', async ({ user }) => {
  need(user, 'admin');
  const orders = (await one(`SELECT COUNT(*) completed, COALESCE(SUM(price), 0) gmv, COALESCE(SUM(commission), 0) commission,
    COALESCE(SUM(CASE WHEN status = 'returned' AND ${noFareSql('orders')} THEN 0 ELSE discount END), 0) discounts FROM orders WHERE status IN (${finishedSql})`))!; // DRV-17 promo spend
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
  const pickupPayReviews = await openPickupPayReviews();
  return {
    gmv: orders.gmv, commission: orders.commission, subscriptions: subs.revenue, discounts: orders.discounts,
    // Promo discounts are Wind's cost (the driver's ledger credits them), so they come off the profit.
    profit: orders.commission - orders.discounts + subs.revenue,
    completed: orders.completed, activeSubscriptions: (await one("SELECT COUNT(*) n FROM subscriptions WHERE status = 'active' AND ends_at > ?", Date.now()))!.n,
    statuses: Object.fromEntries((await all('SELECT status, COUNT(*) n FROM orders GROUP BY status')).map(r => [r.status, r.n])),
    services: Object.fromEntries((await all(`SELECT service, COUNT(*) n FROM orders WHERE status IN (${finishedSql}) GROUP BY service`)).map(r => [r.service, r.n])),
    users: Object.fromEntries((await all("SELECT role, COUNT(*) n FROM users WHERE phone NOT LIKE 'deleted-%' AND phone NOT LIKE 'partner:%' GROUP BY role")).map(r => [r.role, r.n])),
    pendingDrivers: (await one(`SELECT COUNT(*) n FROM users u WHERE (u.role = 'driver' AND u.status = 'pending')
      ${accountModes ? "OR (u.role = 'driver' AND u.status = 'active' AND u.captain_state = 'review') OR (u.role = 'customer' AND u.status = 'active' AND EXISTS (SELECT 1 FROM captain_profiles p WHERE p.user_id = u.id AND p.state = 'under_review'))" : ''}`))!.n,
    // null for staff without the support scope: the app hides the Support tab and shortcut they could not open.
    openSupport: await supportScoped(user) ? (await one("SELECT COUNT(*) n FROM support_threads WHERE status = 'open' AND last_from = 'user'"))!.n : null,
    pendingSubscriptions: (await one("SELECT COUNT(*) n FROM subscriptions WHERE status = 'pending'"))!.n,
    // shop applications for the Approvals queue; 0 while the shop service is off or its tables are absent (PostgreSQL before 33)
    pendingShops: enabledServices.includes('shop') && await shopTables(persistence) ? (await one("SELECT COUNT(*) n FROM merchants WHERE status = 'pending'"))!.n : 0,
    openIncidents: (await one("SELECT COUNT(*) n FROM safety_incidents WHERE status = 'open'"))!.n,
    backupStale: backupStale(),
    // DRV-17: block reviews past their 2 working days; their trip pay stays unposted until a second admin decides.
    ...(await blockReviewsAvailable() ? { blockReviewsOverdue: Number((await one('SELECT COUNT(*) n FROM courier_block_reviews WHERE decided_at IS NULL AND due_at < ?', Date.now()))!.n) } : {}),
    // Undecided pickup-pay reviews whose driver and assignment still match the order (R5-M2).
    pickupPayReviewsOpen: pickupPayReviews.length,
    pickupPayReviews: pickupPayReviews.slice(0, 20),
    daily,
  };
});

route('GET', '/api/admin/users', async ({ user, query }) => {
  need(user, 'admin');
  const role = query.get('role'), q = `%${query.get('q') ?? ''}%`;
  const search = ['name','phone','email'].map(column => `${column} ${persistence.backend === 'postgres' ? "ILIKE ? ESCAPE ''" : 'LIKE ?'}`).join(' OR ');
  if (accountModes) {
    const rows = await all(`SELECT u.*, p.vehicle AS application_vehicle, p.plate AS application_plate,
      p.state AS profile_state, p.revision AS profile_revision, p.application_id
      FROM users u LEFT JOIN captain_profiles p ON p.user_id = u.id
      WHERE (? IS NULL OR u.role = ? OR (? = 'driver' AND u.role = 'customer' AND u.status = 'active' AND p.state = 'under_review'))
        AND (${search}) AND phone NOT LIKE 'deleted-%' AND phone NOT LIKE 'partner:%'
      ORDER BY (u.status = 'pending' OR u.captain_state = 'review' OR p.state = 'under_review') DESC, u.id DESC LIMIT 200`, role, role, role, q, q, q);
    return Promise.all(rows.map(async row => {
      const waiting = row.status === 'active' && (row.profile_state === 'under_review' || row.profile_state === 'review');
      const application = waiting && row.role === 'customer' && role === 'driver';
      const projected = await toUser(application ? { ...row, role: 'driver', status: 'pending', approved_at: null,
        vehicle: row.application_vehicle, plate: row.application_plate } : waiting && row.role === 'driver' ? { ...row, status: 'pending' } : row);
      return waiting ? { ...projected, captainApproval: { applicationId: row.application_id, revision: Number(row.profile_revision), state: row.profile_state } } : projected;
    }));
  }
  return (await Promise.all((await all(`SELECT * FROM users WHERE (? IS NULL OR role = ?) AND (${search}) AND phone NOT LIKE 'deleted-%' AND phone NOT LIKE 'partner:%'
    ORDER BY status = 'pending' DESC, id DESC LIMIT 200`, role, role, q, q, q)).map(toUser)));
});

// The partner:souq account owns every Souq delivery, so the admin user routes never list, edit, reset or delete it.
const editUser: Handler = async ({ user, params, body }) => {
  need(user, 'admin');
  const target = (await one("SELECT * FROM users WHERE id = ? AND phone NOT LIKE 'deleted-%' AND phone NOT LIKE 'partner:%'", Number(params[0]))) ?? fail(404, 'not_found');
  if (target.role === 'admin') fail(409, 'cannot_change_admin');
  // The role the editing admin saw: another admin's role change in between is refused, not silently reverted.
  if (body.expectedRole !== undefined && body.expectedRole !== target.role) fail(409, 'user_changed');
  const name = body.name === undefined ? target.name : text(body.name, 60);
  const phone = body.phone === undefined ? target.phone : normalizePhone(String(body.phone)) ?? fail(400, 'invalid_phone');
  const email = body.email === undefined ? target.email ?? null : body.email === null || body.email === '' ? null : normalizeEmail(body.email) ?? fail(400, 'invalid_email');
  const statuses = accountModes ? ['active', 'blocked'] : ['active', 'pending', 'blocked'];
  let status = body.status === undefined ? target.status : statuses.includes(body.status) ? body.status : fail(400, 'invalid_status');
  const role = body.role === undefined ? target.role : ['customer', 'driver'].includes(body.role) ? body.role : fail(400, 'invalid_role');
  const addingCaptain = accountModes && role === 'driver' && target.role === 'customer';
  const closingCaptain = accountModes && role === 'customer' && target.role === 'driver';
  const storedRole = closingCaptain ? 'driver' : role;
  const vehicle = closingCaptain ? target.vehicle : role === 'driver'
    ? vehicles.includes(body.vehicle ?? target.vehicle ?? 'car') ? body.vehicle ?? target.vehicle ?? 'car' : fail(400, 'invalid_vehicle') : null;
  const plate = closingCaptain ? target.plate : role === 'driver'
    ? (body.plate === undefined ? target.plate ?? null : text(body.plate, 12, false) || null) : null;
  if ((await one('SELECT id FROM users WHERE phone = ? AND id <> ?', phone, target.id))) fail(409, 'phone_taken');
  if (email && (await one('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id <> ?', email, target.id))) fail(409, 'email_taken');
  const identityChanged = phone !== target.phone || email !== (target.email ?? null);
  const roleChanged = role !== target.role;
  const vehicleChanged = vehicle !== target.vehicle || (accountModes && plate !== (target.plate ?? null));
  const recheck = identityChanged || (!addingCaptain && vehicleChanged) || (status !== target.status && status === 'pending');
  const identityOrRoleChange = recheck || (!accountModes && roleChanged);
  if (!accountModes && selfService && role === 'driver' && (identityChanged || roleChanged || vehicleChanged) && status === 'active') status = 'pending';
  if (production && selfService && role === 'driver' && status === 'active' && !target.approved_at
      && !addingCaptain && !(accountModes && hasCaptainProfile(target))) fail(409, 'pending_approval');
  let carrying: Row[] = [], prelocked: number[] = [];
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    // Re-checked inside the write transaction: a job accepted after the reads above must not be stranded by this edit.
    // The driver's active orders lock before the driver row: an advance holds its order and the assignment trigger then wants the
    // driver row, so locking the driver first could deadlock against it (review 19 Nov).
    if (persistence.backend === 'postgres' && target.role === 'driver')
      prelocked = (await all(`SELECT id FROM orders WHERE driver_id = ? AND status IN (${activeSql}) ORDER BY id FOR UPDATE`, target.id)).map(r => Number(r.id));
    if (persistence.backend === 'postgres') await one('SELECT id FROM users WHERE id=? FOR UPDATE', target.id);
    // Every decision below came from the read before the lock: another admin's block or approval in between must not be silently reverted.
    const locked = (await one(`SELECT name, phone, email, status, role, vehicle, plate, approved_at, phone_verified_at, email_verified_at
      ${accountModes ? ', captain_state' : ''} FROM users WHERE id = ?`, target.id)) ?? fail(404, 'not_found');
    if (Object.keys(locked).some(key => (locked[key] ?? null) !== (target[key] ?? null))) fail(409, 'user_changed');
    if (identityOrRoleChange &&
      (await one(`SELECT id FROM orders WHERE (driver_id = ? AND status IN (${activeSql})) OR (customer_id = ? AND status IN ('requested','searching',${activeSql}))`, target.id, target.id))) fail(409, 'active_orders');
    if (!accountModes && roleChanged && target.role === 'driver') (await cashSettled(target.id));
    // A blocked customer loses the handover code, so a courier on the way could never finish. Support cancels or waits first.
    if ((target.role === 'customer' || accountModes) && status === 'blocked' && target.status !== 'blocked'
      && (await one(`SELECT id FROM orders WHERE customer_id = ? AND status IN ('requested','searching',${activeSql})`, target.id))) fail(409, 'customer_active_order');
    // Blocking a courier mid-job must not strand what they carry, and support says so explicitly (recovery: 'return').
    if (target.role === 'driver' && status === 'blocked' && target.status !== 'blocked') {
      // An assignment that committed between the order locks above and the captain lock is not waited on while holding the
      // captain row (its advance would wait on that row: a deadlock, Sol R2-H1); the admin retries and the scan above takes it.
      if (persistence.backend === 'postgres' && (await all(`SELECT id FROM orders WHERE driver_id = ? AND status IN (${activeSql})`, target.id)).some(r => !prelocked.includes(Number(r.id)))) fail(409, 'order_changed');
      carrying = (await all(`SELECT id, status, service, customer_id, driver_id, price, discount, recommended_price, assignment_epoch, assigned_at FROM orders WHERE driver_id = ? AND status IN (${activeSql})${persistence.backend === 'postgres' ? ' FOR UPDATE' : ''}`, target.id)); // a goods COD waits (ADM-12)
      // Orders whose goods support already took (CUSTODY_TAKEN) strand nothing: they need no recovery choice (Sol recheck 3).
      for (const o of carrying) o.supportHolds = o.status === 'returning' && (await returnCustody(persistence, o)).supportHasGoods;
      if (carrying.some(o => !o.supportHolds) && body.recovery !== 'return') fail(409, 'carrying_parcels');
    }
    const priorCaptain = accountModes && storedRole === 'driver' ? target.captain_state : null;
    const captainState = closingCaptain || priorCaptain === 'closing' ? 'closing'
      : !priorCaptain && !addingCaptain ? null : status === 'blocked' ? 'paused'
      : recheck || (priorCaptain === 'paused' && target.status === 'blocked') ? 'review' : addingCaptain ? 'active' : priorCaptain;
    const accountStatus = accountModes && status === 'pending' ? 'active' : status;
    const approvedAt = addingCaptain && captainState !== 'review' ? Date.now()
      : identityChanged || (!accountModes && roleChanged) || (vehicleChanged && !addingCaptain)
        ? null : target.approved_at ?? null;
    (await run(`UPDATE users SET name = ?, phone = ?, email = ?, status = ?, role = ?, vehicle = ?, plate = ?,
      phone_verified_at = ?, email_verified_at = ?, approved_at = ? WHERE id = ?`,
      name, phone, email, accountStatus, storedRole, vehicle, plate, phone !== target.phone ? null : target.phone_verified_at ?? null,
      email !== (target.email ?? null) ? null : target.email_verified_at ?? null,
      approvedAt, target.id));
    if (accountModes && storedRole === 'driver') {
      await run('UPDATE users SET captain_state = ? WHERE id = ?', captainState, target.id);
      await run(`INSERT INTO captain_profiles (user_id,state,vehicle,plate,approved_at,legacy_role,legacy_status,application_id)
        VALUES (?,?,?,?,?,'driver',?,?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state, vehicle=excluded.vehicle,
          plate=excluded.plate, approved_at=COALESCE(excluded.approved_at,captain_profiles.approved_at), revision=captain_profiles.revision+1`, target.id,
      captainState === 'active' ? 'approved' : captainState ?? 'under_review', vehicle, plate, approvedAt, target.status, randomBytes(16).toString('hex'));
      if (captainState !== 'active') await setCaptainOffline(persistence, target.id);
      if (closingCaptain) await run("INSERT INTO security_events(actor_id,action,detail,created_at) VALUES (?,'CAPTAIN_CLOSING',?,?)",
        user.id, JSON.stringify({ targetId: target.id }), Date.now());
      if (addingCaptain && captainState === 'active') await run("INSERT INTO security_events(actor_id,action,detail,created_at) VALUES (?,'USER_APPROVED',?,?)",
        user.id, JSON.stringify({ targetId: target.id, role: 'driver' }), Date.now());
    }
    if (!accountModes && roleChanged) await endRoleBenefits(target.id);
    if (accountModes && storedRole === 'customer' && (identityChanged || accountStatus !== target.status))
      await run('UPDATE captain_profiles SET revision = revision + 1 WHERE user_id = ?', target.id);
    const emailChanged = email !== (target.email ?? null);
    if (emailChanged) await run('DELETE FROM email_codes WHERE user_id = ?', target.id);
    if (body.status !== undefined || identityChanged || (!accountModes && roleChanged) || (vehicleChanged && !addingCaptain))
      await revokeUserAccess(target.id);
    if (emailChanged) await run('DELETE FROM recovery_email_proofs WHERE user_id = ?', target.id);
    const now = Date.now();
    const auditFields = [
      name !== target.name ? 'name' : null,
      phone !== target.phone ? 'phone' : null,
      email !== (target.email ?? null) ? 'email' : null,
      status !== target.status ? 'status' : null,
      storedRole !== target.role ? 'role' : null,
      vehicle !== (target.vehicle ?? null) ? 'vehicle' : null,
      plate !== (target.plate ?? null) ? 'plate' : null,
    ].filter(Boolean);
    if (auditFields.length) (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, NULL, 'USER_UPDATED', ?, ?)`,
      user.id, JSON.stringify({ targetId: target.id, fields: auditFields, identityChanged, roleChanged: storedRole !== target.role }), now));
    for (const o of carrying) {
      // Support already took the goods from this captain mid-return (supportHolds, above): nothing is stranded with the captain, so
      // the block is not a custody block and the order closes as support's takeover (Sol second recheck of PR #101).
      const handedOver = o.service === 'shop' && (await one("SELECT 1 FROM shop_orders WHERE order_id = ? AND merchant_state = 'handed_over'", o.id));
      o.requeued = (o.status === 'assigned' || o.status === 'at_pickup') && !handedOver;
      if (o.requeued) { // not collected yet: back to the pool, as a release would
        const backPrice = await restoredFare(Number(o.id), (o.recommended_price ?? o.price) as number, o.price as number); // ADM-12, as a release
        const backDiscount = (await restoredDiscount(Number(o.id), backPrice, o.discount as number | null));
        (await run(`UPDATE orders SET driver_id = NULL, commission = NULL, price = ?, discount = ?, status = 'searching',
          job_alerted_at = COALESCE(job_alerted_at, ?), updated_at = ? WHERE id = ?`, backPrice, backDiscount, now, now, o.id));
        await rideLifecycle.clearAssignment(Number(o.id));
      }
      else if (o.service === 'ride') {
        // SRS §2.1: the rider pays nothing; the captain's trip so far waits on the block review.
        // ponytail: trip so far = half the booked fare; measured distance comes with the active GPS route.
        if (persistence.backend === 'postgres' && await blockReviewsAvailable()) await run(`INSERT INTO courier_block_reviews (order_id, driver_id, blocked_by, service, from_status, trip_pay_cents, blocked_at, due_at)
          VALUES (?, ?, ?, 'ride', ?, ?, ?, ?) ON CONFLICT (order_id) DO NOTHING`, o.id, target.id, user.id, o.status,
          Math.floor(Math.round((Number(o.price) - Number(o.discount ?? 0)) * 100) / 2), now, twoWorkingDays(now));
        await run("UPDATE orders SET status = 'cancelled', commission = NULL, return_code = NULL, updated_at = ? WHERE id = ?", now, o.id);
        await run("INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'ORDER_CANCELLED_BY_ADMIN', ?, ?)",
          user.id, o.id, JSON.stringify({ reason: 'courier_block' }), now);
      }
      else if (o.supportHolds) { /* support holds the goods: the order stays returning for office intake */ }
      else { // in custody: support recovers it and confirms the return to the sender
        // DRV-17: a shop captain's trip so far (one delivery fee) waits on the block review; the return leg is support's. A captain
        // blocked while already returning gets the same review (Sol R2-H3): the return leg was not finished.
        const reviewAvailable = o.service === 'shop' ? await blockReviewsAvailable() : shippingOrder(o) && await captainPayAvailable();
        if (reviewAvailable) await createDeliveryBlockReview(o, target.id, user.id, o.status, now);
        if (o.status !== 'returning') {
          (await run("UPDATE orders SET status = 'returning', return_code = ?, updated_at = ? WHERE id = ?", String(randomInt(1000, 10000)), now, o.id));
          (await run('DELETE FROM proof_attempts WHERE order_id = ?', o.id));
        }
      }
      (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'COURIER_BLOCKED', ?, ?)`,
        user.id, o.id, JSON.stringify({ driverId: target.id, from: o.status, assignmentEpoch: o.assignment_epoch, custody: !o.requeued && o.service !== 'ride' && !o.supportHolds }), now));
    }
    if (closingCaptain) await closeCaptainIfSettled(target.id);
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  for (const o of carrying) {
    if (o.requeued) { await queuePush([o.customer_id], 'released', o.id); await reofferReleased(o.service as Service, Number(o.id), Number(o.customer_id), target.id); }
    else if (o.service === 'ride') await queuePush([o.customer_id], 'cancelled', o.id);
    else if (o.status !== 'returning') await queuePush([o.customer_id], 'returning', o.id);
  }
  if (addingCaptain && !recheck && status === 'active') await queuePush([target.id], 'approved', 0, '/profiles');
  else if (role === 'driver' && status === 'active' && target.status !== 'active') await queuePush([target.id], 'approved', 0, '/driver');
  return (await toUser((await one('SELECT * FROM users WHERE id = ?', target.id)) ?? fail(404, 'not_found')));
};
// PostgreSQL 39 can review rides and shop orders. Shipping reviews require SQLite's additive table or PostgreSQL 40.
const blockReviewsAvailable = async () => persistence.backend === 'sqlite'
  || persistence.memo('blockReviews', async () => !!(await one('SELECT version FROM schema_migrations WHERE version = 39')));
/** Two working days on the operating calendar (Asia/Hebron), Friday and Saturday off (Sol R2-L1).
 * ponytail: 24 h steps, so a daylight-saving change in between moves the deadline by its hour. */
const hebronWeekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Hebron', weekday: 'short' });
const twoWorkingDays = (at: number) => { let t = at; for (let n = 0; n < 2;) { t += DAY; if (!['Fri', 'Sat'].includes(hebronWeekday.format(t))) n++; } return t; };
async function createDeliveryBlockReview(order: Row, driverId: number, blockerId: number, from: string, blockedAt: number, dueAt = twoWorkingDays(blockedAt)) {
  const pay = order.service === 'shop'
    ? Number(((await one('SELECT delivery_fee_agorot FROM shop_orders WHERE order_id = ?', order.id)) ?? fail(409, 'shop_state')).delivery_fee_agorot)
        * (await shop.shopReattempted(order.id, order.assigned_at) ? 2 : 1)
    : Math.max(1, await shippingDeliveryAttempts(order)) * fareCents(order);
  return (await run(`INSERT INTO courier_block_reviews (order_id, driver_id, blocked_by, service, from_status, trip_pay_cents, blocked_at, due_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (order_id) DO NOTHING`, order.id, driverId, blockerId, order.service, from, pay, blockedAt, dueAt)).changes;
}
// Best effort: a database this release cannot read yet (a legacy file mid-migration) logs and starts; nothing is lost, the next start retries.
export const recoverBlockReviews = () => persistence.scope(async () => {
  if (!(await blockReviewsAvailable())) return;
  const services = await captainPayAvailable() ? "('parcel','freight','shop')" : "('shop')";
  // Recover missed delivery reviews at startup, including blocks an older binary recorded during a rollback.
  const missing = await all(`SELECT o.id, o.service, o.price, o.driver_id, o.assignment_epoch, o.assigned_at, e.actor_id, e.detail, e.created_at
    FROM security_events e JOIN orders o ON o.id = e.order_id
    WHERE e.action = 'COURIER_BLOCKED' AND o.service IN ${services} AND o.driver_id IS NOT NULL
      AND o.status IN ('returning','returned') AND NOT EXISTS (SELECT 1 FROM courier_block_reviews b WHERE b.order_id = o.id)
    ORDER BY e.id DESC`);
  const recoveredAt = Date.now();
  const dueAt = twoWorkingDays(recoveredAt); // from the recovery, not the original block (R5-L2)
  for (const order of missing) {
    const from = custodyBlockFrom(order, { detail: order.detail, created_at: order.created_at });
    if (!from) continue;
    const context = { orderId: order.id, driverId: order.driver_id };
    try {
      await persistence.exec('BEGIN IMMEDIATE');
      if (!(await settleableDriver(order.driver_id))) logServerError('block_review_driver_departed', undefined, context);
      else if (order.service !== 'shop' || !(await one("SELECT 1 FROM shop_ledger WHERE order_id = ? AND kind = 'trip_pay'", order.id))) {
        // blocked_at stays the original audit time. The recovered marker commits with the review.
        const inserted = await createDeliveryBlockReview(order, order.driver_id, order.actor_id, from, order.created_at, dueAt);
        if (inserted) await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'BLOCK_REVIEW_RECOVERED', ?, ?)`,
          order.actor_id, order.id, JSON.stringify({ driverId: order.driver_id, dueAt, recoveredAt }), recoveredAt);
      }
      await persistence.exec('COMMIT');
    } catch (error) {
      if (persistence.inTransaction) await persistence.exec('ROLLBACK');
      logServerError('maintenance_failed', error, context);
    }
  }
}).catch(error => logServerError('maintenance_failed', error));
if (!modeRollback) await recoverBlockReviews();
const blockReviewView = (r: Row) => ({ dueAt: Number(r.due_at), tripPayCents: Number(r.trip_pay_cents), decidedAt: r.decided_at == null ? null : Number(r.decided_at),
  cleared: r.cleared == null ? null : !!r.cleared, paidCents: r.paid_cents == null ? null : Number(r.paid_cents), blockedBy: Number(r.blocked_by) });
registerBlockReviewRoutes(route, async ({ user, params, body }) => {
  need(user, 'admin');
  if (!(await blockReviewsAvailable())) fail(409, 'block_review_unavailable');
  // The decision posts money, so on duty-scoped PostgreSQL it is a finance (or platform admin) decision (Sol R2-H7, ADM-10).
  needStaff(await staffActor(persistence, user as never), fail, 'finance');
  if (typeof body.cleared !== 'boolean') fail(400, 'invalid_input');
  const note = text(body.note, 500);
  if (note.length < 5) fail(400, 'invalid_input');
  const id = Number(params[0]);
  await persistence.exec('BEGIN IMMEDIATE');
  try {
    const review = (await one(`SELECT * FROM courier_block_reviews WHERE order_id = ?${persistence.backend === 'postgres' ? ' FOR UPDATE' : ''}`, id)) ?? fail(404, 'not_found');
    if (review.decided_at != null) {
      if (!!review.cleared === body.cleared && Number(review.decided_by) === user.id && review.note === note) {
        await persistence.exec('COMMIT');
        return blockReviewView(review);
      }
      fail(409, 'review_decided');
    }
    if (body.cleared && !(await settleableDriver(review.driver_id))) fail(409, 'driver_departed');
    // The admin who blocked does not also judge the block: a second admin decides, as a forgiven debt needs a second approver.
    if (Number(review.blocked_by) === user.id) fail(409, 'second_admin_required');
    const now = Date.now(), driverId = Number(review.driver_id), pay = Number(review.trip_pay_cents);
    let paid = 0;
    // One rollback boundary: a ledger or cash refusal after the local inserts leaves the review pending with nothing posted (Sol R2-H4).
    if (body.cleared && pay > 0) {
      if (review.service === 'shop') { await shop.blockTripPay(id, driverId, pay, user.id); paid = pay; }
      // Rides, parcels and freight: the full trip so far as DRV-17 trip pay (owed may go below zero: Wind owes the captain).
      else { await captainPay(id, driverId, pay, 'trip_pay', user.id); paid = pay; }
    }
    await run('UPDATE courier_block_reviews SET decided_at = ?, decided_by = ?, cleared = ?, paid_cents = ?, note = ? WHERE order_id = ? AND decided_at IS NULL',
      now, user.id, persistence.backend === 'sqlite' ? Number(body.cleared) : body.cleared, paid, note, id);
    await run("INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'BLOCK_REVIEW_DECIDED', ?, ?)",
      user.id, id, JSON.stringify({ driverId, cleared: body.cleared, tripPayCents: pay, paidCents: paid }), now);
    if (paid) await queuePush([driverId], 'cash', 0, '/driver/earnings');
    if (accountModes) await closeCaptainIfSettled(driverId);
    const result = blockReviewView((await one('SELECT * FROM courier_block_reviews WHERE order_id = ?', id))!);
    await persistence.exec('COMMIT');
    return result;
  } catch (error) { await persistence.exec('ROLLBACK'); throw error; }
});
route('POST', '/api/admin/users/:id', editUser); // existing clients
route('PATCH', '/api/admin/users/:id', editUser);
route('POST', '/api/admin/users/:id/approve', async ({ user, params, body }) => {
  need(user, 'admin');
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    const target = (await one("SELECT * FROM users WHERE id = ? AND phone NOT LIKE 'deleted-%' AND phone NOT LIKE 'partner:%'", Number(params[0]))) ?? fail(404, 'not_found');
    if (target.role === 'admin') fail(409, 'cannot_change_admin');
    if (accountModes) {
      const profile = await one('SELECT state, revision, application_id, vehicle, plate FROM captain_profiles WHERE user_id = ?', target.id);
      const eligible = !!profile && target.status === 'active' && (target.role === 'customer' && profile.state === 'under_review'
        || target.role === 'driver' && target.captain_state === 'review' && profile.state === 'review');
      if (!eligible || profile.application_id !== body.expectedApplicationId || profile.revision !== body.expectedRevision
          || profile.state !== body.expectedState) fail(409, 'user_changed');
      const approvedAt = Date.now();
      await run(`UPDATE users SET role = 'driver', captain_state = 'active', vehicle = ?, plate = ?, approved_at = ? WHERE id = ?`,
        profile!.vehicle, profile!.plate, approvedAt, target.id);
      await run("UPDATE captain_profiles SET state = 'approved', approved_at = ?, revision = revision + 1 WHERE user_id = ?", approvedAt, target.id);
      await run(`INSERT INTO security_events(actor_id, action, detail, created_at) VALUES (?,'USER_APPROVED',?,?)`, user.id,
        JSON.stringify({ targetId: target.id, role: 'driver', from: profile!.state }), approvedAt);
      await queuePush([target.id], 'approved', 0, '/profiles');
      await persistence.exec('COMMIT');
      return toUser((await one('SELECT * FROM users WHERE id = ?', target.id))!);
    }
    // Unblocking a courier must not skip what blocking enforces. The admin users screen sends
    // this route to clear a block, so without this check a blocked driver holding parcels came
    // back to 'active' in one call, bypassing the carrying_parcels guard in editUser.
    if (target.role === 'driver' && target.status === 'blocked') {
      const carrying = await all(`SELECT id, status, driver_id, assignment_epoch, assigned_at FROM orders WHERE driver_id = ? AND status IN (${activeSql})`, target.id);
      const stranded = [];
      for (const o of carrying) if (!(o.status === 'returning' && (await returnCustody(persistence, o)).supportHasGoods)) stranded.push(o);
      if (stranded.length && body.recovery !== 'return') fail(409, 'carrying_parcels');
    }
    (await run("UPDATE users SET status = 'active', approved_at = COALESCE(approved_at, ?) WHERE id = ?", Date.now(), target.id));
    // This route also unblocks customers: the row says what changed, not that a driver was approved.
    (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, NULL, 'USER_APPROVED', ?, ?)`,
      user.id, JSON.stringify({ targetId: target.id, role: target.role, from: target.status }), Date.now()));
    if (target.role === 'driver' && target.status !== 'active') await queuePush([target.id], 'approved', 0, '/driver');
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  return (await toUser((await one('SELECT * FROM users WHERE id = ?', Number(params[0]))) ?? fail(404, 'not_found')));
});
route('DELETE', '/api/admin/users/:id', async ({ user, params }) => {
  need(user, 'admin');
  const target = (await one("SELECT * FROM users WHERE id = ? AND phone NOT LIKE 'deleted-%' AND phone NOT LIKE 'partner:%'", Number(params[0]))) ?? fail(404, 'not_found');
  if (target.role === 'admin') fail(409, 'cannot_change_admin');
  return (await deleteAccount((await toUser(target)), user.id));
});

// What a support reset must show. An account the app can email has to pass the code check: a receipt from identity-check, bound
// to this admin, this account and its current password, so it dies with the reset it buys. With no email path (no provider, or no
// verified address) nothing can prove the caller, so the admin writes down what they checked, and that line goes in the audit.
const SUPPORT_PROOF_TTL = 10 * 60_000;
const supportProof = (adminId: number, r: Row, at: number) => createHmac('sha256', codeKey).update(`support-proof:${adminId}:${r.id}:${r.password}:${at}`).digest('hex');
async function resetVerification(adminId: number, target: Row, body: Row) {
  if (emailReady && await recoveryEmailVerified(persistence, target)) {
    const [at, signature] = String(body.proof ?? '').split('.');
    const confirmedAt = Number(at), age = Date.now() - confirmedAt;
    const expected = Buffer.from(supportProof(adminId, target, confirmedAt), 'hex'), given = Buffer.from(signature ?? '', 'hex');
    if (!Number.isSafeInteger(confirmedAt) || age < 0 || age > SUPPORT_PROOF_TTL || given.length !== expected.length || !timingSafeEqual(given, expected)) fail(403, 'identity_check_required');
    return { method: 'email_code', confirmedAt };
  }
  const note = typeof body.attestation === 'string' ? body.attestation.trim() : '';
  // The security log outlives a deleted account, so it says what was checked, never the number.
  if (note.length < 10 || note.length > 300 || holdsPhoneNumber(note)) fail(400, 'attestation_required');
  return { method: 'attested', note };
}

// No SMS provider yet: support verifies the caller, resets, and reads the temporary password out to them.
route('POST', '/api/admin/users/:id/password', async ({ user, params, body }) => {
  need(user, 'admin');
  needStaff(await staffActor(persistence, user), fail, 'support');
  (await limit(identityKey('support-password', user.id), 20, 60 * 60_000));
  const target = (await one("SELECT * FROM users WHERE id = ? AND role != 'admin' AND phone NOT LIKE 'deleted-%' AND phone NOT LIKE 'partner:%'", Number(params[0]))) ?? fail(404, 'not_found');
  const verification = await resetVerification(user.id, target, body);
  const password = randomBytes(12).toString('base64url');
  const hashed = await hashPassword(password);
  // Keep the envelope's actor on the journaled security event: the route no longer runs inside it.
  await persistence.atomic({ id: user.id, correlationId: randomUUID() }, () =>
    emailTransaction(async () => {
      needStaff(await staffActor(persistence, user, true), fail, 'support');
      // The password the check was bound to, or two requests racing one proof would both win.
      if (!(await run('UPDATE users SET password = ? WHERE id = ? AND password = ?', hashed, target.id, target.password)).changes) fail(409, 'identity_check_required');
      (await run('DELETE FROM sessions WHERE user_id = ?', target.id));
      (await run('DELETE FROM push_subscriptions WHERE user_id = ?', target.id));
      await clearFirebaseReset(target.id);
      (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, NULL, 'SUPPORT_PASSWORD_RESET', ?, ?)`,
        user.id, JSON.stringify({ targetId: target.id, sessionsRevoked: true, verification }), Date.now()));
    }));
  return { password };
});

// Caller identity for support: a one-time code goes to the account's verified email; the caller reads it back.
const supportTarget = async (id: unknown) => (await one("SELECT * FROM users WHERE id = ? AND role != 'admin' AND phone NOT LIKE 'deleted-%' AND phone NOT LIKE 'partner:%'", Number(id))) ?? fail(404, 'not_found');
route('POST', '/api/admin/users/:id/identity-code', async ({ user, params }) => {
  need(user, 'admin');
  needStaff(await staffActor(persistence, user), fail, 'support');
  const target = (await supportTarget(params[0]));
  if (!await recoveryEmailVerified(persistence, target)) fail(409, 'email_not_verified');
  if (!await (await reserveEmailCode(target, 'support'))()) fail(409, 'user_changed');
  return { sent: true };
});
route('POST', '/api/admin/users/:id/identity-check', async ({ user, params, body }) => {
  need(user, 'admin');
  needStaff(await staffActor(persistence, user), fail, 'support');
  const target = (await supportTarget(params[0]));
  if (!await recoveryEmailVerified(persistence, target)) fail(409, 'email_not_verified');
  (await useCode(target, 'support', body.code));
  const at = Date.now();
  return { confirmed: true, at, proof: `${at}.${supportProof(user.id, target, at)}` };
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
    (await persistence.exec('BEGIN IMMEDIATE'));
    try {
      const sub = (await one("SELECT * FROM subscriptions WHERE id = ? AND status = 'pending'", Number(params[0]))) ?? fail(404, 'not_found');
      if (body.action === 'activate') {
        const target = (await one('SELECT id, role, status, approved_at, captain_state FROM users WHERE id = ?', sub.user_id))!;
        const eligible = accountModes
          ? (sub.plan === 'plus' && target.role !== 'admin') || (sub.plan === 'pro' && captainGrant(target))
          : sub.plan === planForRole[target.role as User['role']];
        if (!eligible) fail(409, 'invalid_action');
        if (!(await run("UPDATE subscriptions SET status = 'active', activated_at = ?, ends_at = ? WHERE id = ? AND status = 'pending'", Date.now(), Date.now() + 30 * DAY, sub.id)).changes)
          fail(409, 'subscription_decided');
      }
      else if (body.action === 'reject') {
        if (!(await run("UPDATE subscriptions SET status = 'rejected' WHERE id = ? AND status = 'pending'", sub.id)).changes)
          fail(409, 'subscription_decided');
      }
      else fail(400, 'invalid_action');
      (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, NULL, 'SUBSCRIPTION_DECIDED', ?, ?)`,
        user.id, JSON.stringify({ subscriptionId: sub.id, decision: body.action }), Date.now()));
      const holder = (await one('SELECT role FROM users WHERE id = ?', sub.user_id))!;
      await queuePush([sub.user_id], 'plan', 0, holder.role === 'driver' ? '/driver/account' : '/account');
      (await persistence.exec('COMMIT'));
      return { ok: true };
    } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  }));
});

route('POST', '/api/admin/settings', async ({ user, query, body: { expected, ...body } }) => {
  need(user, 'admin');
  const payroll = query.get('payroll') === '1';
  if (Object.hasOwn(body, 'pickupPayPerKm')) {
    if (!payroll) fail(400, 'invalid_setting');
    needStaff(await staffActor(persistence, user), fail, 'finance');
  }
  // `expected` is the value each changed key had when this admin's review was built. If the stored value has moved
  // since, another admin saved first: refuse, so a review is never written over a change it did not show.
  // Clients that predate it send no `expected` and keep the old behaviour.
  if (expected !== undefined && (!expected || typeof expected !== 'object' || Array.isArray(expected))) fail(400, 'invalid_setting');
  for (const key of Object.keys(expected ?? {})) if (!(key in body)) fail(400, 'invalid_setting');
  if (expected !== undefined) for (const key of Object.keys(body)) if (!(key in expected)) fail(400, 'invalid_setting');
  for (const [key, value] of Object.entries(body)) {
    if (key === 'pickupPayPerKm' && typeof value !== 'number' && !(typeof value === 'string' && value.trim()))
      fail(400, 'invalid_setting:pickupPayPerKm');
    const n = Number(value);
    if (!Object.hasOwn(defaultSettings, key) || !Number.isFinite(n) || n < 0 || (fractionSettings.includes(key as keyof Settings) && n >= 1)) fail(400, 'invalid_setting');
  }
  // The admin form and API share the bounds in model.ts.
  const bad = invalidSetting(Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Number(v)])));
  if (bad) fail(400, `invalid_setting:${bad}`);
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    // Serialize saves before the snapshot, including keys that have no stored row yet.
    if (persistence.backend === 'postgres') await one("SELECT pg_advisory_xact_lock(hashtextextended('wind:admin_settings',0))");
    const previous = await settings();
    for (const [key, value] of Object.entries(expected ?? {})) if (previous[key as keyof Settings] !== Number(value)) fail(409, 'settings_changed');
    const changes = Object.fromEntries(Object.entries(body).filter(([key, value]) => previous[key as keyof Settings] !== Number(value))
      .map(([key, value]) => [key, { old: previous[key as keyof Settings], new: Number(value) }]));
    const next = { ...previous, ...Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Number(v)])) } as Settings;
    // Only a save that touches either value is refused, so other settings stay editable while an old pair is fixed.
    if (enabledServices.includes('shop') && ('orderCashCeiling' in body || 'driverCashCap' in body) && next.orderCashCeiling > next.driverCashCap) fail(409, 'ceiling_above_cap');
    for (const [key, value] of Object.entries(body)) (await run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, Number(value)));
    (await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, NULL, 'SETTINGS_UPDATED', ?, ?)`,
      user.id, JSON.stringify({ changes }), Date.now()));
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  const result = settingsResponse(await settings(), payroll);
  return payroll ? result : result.settings;
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
    const snapshot = { ...await getOrder(id, user, false, query.get('recoveryProtocol') === '1'), protocol: { version: order.version, assignmentEpoch: order.assignment_epoch,
      events: events.filter(event => event.type !== 'fare.changed' || fareVisible(event)).map(publicEvent), nextCursor: events.at(-1)?.sequence ?? after, snapshotRequired: true, serverTime: Date.now() } };
    const measured = query.get('capacityProtocol') === '1' ? (await withMeasuredScopes([snapshot]))[0] : snapshot;
    return query.get('journeyProtocol') === '1' ? journeyOrder(persistence, rideLifecycle, measured, user) : measured;
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

const bearer = (req: IncomingMessage) => /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')?.[1];
function requireModeRevision(user: User, req: IncomingMessage) {
  if (user.accountMode && req.headers['x-wind-mode-revision'] !== String(user.modeRevision)) fail(409, 'mode_changed');
}
const sessionEligible = async (r: Row) => r.status !== 'blocked' && await contactAllowed(r)
  && (!production || (selfService ? r.role !== 'admin' || r.phone_verified_at || r.approved_at : r.phone_verified_at));
async function userInMode(row: Row, mode: unknown, revision: number): Promise<User> {
  if (!accountModes || row.role === 'admin') return toUser(row);
  const accountMode = mode === 'captain' && captainGrant(row) ? 'captain'
    : mode === 'shop' && enabledServices.includes('shop') && await one('SELECT 1 FROM merchants WHERE owner_user_id = ?', row.id) ? 'shop' : 'personal';
  const user = await toUser({ ...row, role: accountMode === 'captain' ? 'driver' : 'customer' });
  return { ...user, accountMode, modeRevision: revision };
}
async function authenticate(req: IncomingMessage, touch = true, lockSession = false): Promise<User | null> {
  const token = bearer(req);
  if (!token) return null;
  const now = Date.now();
  const r = (await one(`SELECT u.*, s.created_at AS session_created_at, s.last_seen_at AS session_last_seen_at
    ${accountModes ? ', s.active_mode AS session_mode, s.mode_revision AS session_mode_revision' : ''}
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.created_at > ? AND COALESCE(s.last_seen_at, s.created_at) > ?${lockSession ? ' FOR KEY SHARE OF s' : ''}`,
    sha(token), now - SESSION_DAYS * DAY, now - SESSION_IDLE_DAYS * DAY));
  if (!r || !await sessionEligible(r)) return null;
  if (touch && now - Number(r.session_last_seen_at ?? r.session_created_at) > 60 * 60_000)
    void run('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?', now, sha(token)).catch(() => {});
  return userInMode(r, r.session_mode, Number(r.session_mode_revision));
}

let draining = false;
// Per client address, per 10 minutes, before any password or email work.
const publicAuthLimits: Record<string, number> = { '/api/auth/login': 50, '/api/auth/register': 20, '/api/auth/entra': 30, '/api/auth/reset/code': 10, '/api/auth/reset': 20, '/api/auth/reset/link/code': 10, '/api/auth/reset/link': 20 };
export const server = createServer({ maxHeaderSize: 16_384 }, async (req, res) => {
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('Access-Control-Allow-Origin', '*'); // Bearer [REDACTED], no cookies: open CORS is safe
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Wind-Client, X-Wind-Mode-Revision');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  let url: URL;
  try { url = new URL(req.url ?? '/', 'http://localhost'); }
  catch { res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'invalid_request_target' })); return; }
  let status = 200, payload: unknown;
  const correlationId = randomUUID();
  try {
    await persistence.scope(async () => {
    if (draining) fail(503, 'unavailable');
    if (url.pathname.startsWith('/api/') && clientUpdateRequired(req.headers['x-wind-client'])) fail(426, 'client_update_required');
    if (req.method === 'GET' && url.pathname === '/recovery-email') {
      res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'sha256-${recoveryPageScriptHash}'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(recoveryPage);
      return;
    }
    const page = req.method === 'GET' ? publicPages.get(url.pathname) : undefined;
    if (page) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page); return; }
    if (req.method === 'GET' && serveWeb(url.pathname, req, res)) return;
    const match = routes.map(([method, pattern, handler, isPublic]) => ({ method, m: pattern.exec(url.pathname), handler, isPublic }))
      .find(r => r.method === req.method && r.m) ?? fail(404, 'not_found');
    if (!match.isPublic && !(await authenticate(req))) fail(401, 'unauthorized');
    const body = req.method === 'POST' || req.method === 'PATCH' ? await readBody(req) : {};
    let user = (await authenticate(req)); // a slow body cannot retain authority revoked while it was uploading
    if (!match.isPublic && !user) fail(401, 'unauthorized');
    const perAddress = publicAuthLimits[url.pathname];
    if (perAddress) (await limit(identityKey(url.pathname, clientAddress(req)), perAddress, 10 * 60_000));

    const invoke = async () => {
      const target = /^\/api\/(?:orders|jobs|admin\/orders)\/(\d+)(?:\/|$)/.exec(url.pathname);
      // Release checks its saved acknowledgement before it reads the live order.
      if (user?.accountMode && target && url.pathname.startsWith('/api/orders/') && !url.pathname.endsWith('/release')
        && ['POST','PATCH','DELETE'].includes(req.method ?? ''))
        await getOrder(Number(target[1]), user);
      if (persistence.backend === 'postgres' && persistence.inTransaction && target && ['POST','PATCH','DELETE'].includes(req.method ?? '')) {
        // Handler-owned authorization/replay ordering is part of the installed-client contract.
        await one('SELECT id FROM orders WHERE id=? FOR UPDATE', Number(target[1]));
      }
      const driverWork = /^\/api\/jobs\/(\d+)\/(accept|offer)$/.exec(url.pathname);
      const customerOffer = /^\/api\/orders\/(\d+)\/offers\/(\d+)\/accept$/.exec(url.pathname);
      const submittingQuote = req.method === 'POST' && driverWork?.[2] === 'offer';
      if (submittingQuote) {
        need(user!, 'driver'); needActive(user!);
        await limit(identityKey('offer', user!.id), 30, 10 * 60_000); // invalid quotes still count when the write rolls back
      }
      // Sol R2-H2: the HTTP envelope commits handled refusals, so the measured preflight writes (reservation, run revision, stops)
      // and the handler share one savepoint: any refusal after them, in the preflight or the handler, rolls all of them back.
      // SQLite quotes also need a write transaction so a concurrent vehicle edit cannot overtake the capacity check.
      const boundary = submittingQuote || (req.method === 'POST' && persistence.backend === 'postgres' && !!(driverWork || customerOffer));
      if (boundary) await persistence.exec('BEGIN IMMEDIATE');
      try {
      if (req.method === 'POST' && driverWork) {
        need(user!, 'driver'); needActive(user!);
        // Lock order everywhere: order row (above), then the rider's ride fence, then the eligibility policy row (Dispatch.acceptOffer
        // and admin assign do the same). The fence also refuses before eligibility.guard writes any reservation (review 19 Nov).
        const work = await getOrder(Number(driverWork[1]), user!); // authorize first: a hidden ride answers 404, never the fence (Sol R2-M1)
        if (driverWork[2] === 'accept') await guardRideAssignment(Number(driverWork[1]));
        const legacyWork = driverWork[2] === 'offer' || (body.offerId === undefined && body.leaseNonce === undefined);
        if (legacyWork && boundary) {
          // Lock the captain after the order and rider fence, before checking capacity or writing eligibility.
          // SQLite accepts take their own write transaction and re-read the captain in the handler.
          if (persistence.backend === 'postgres') await one('SELECT id FROM users WHERE id = ? FOR UPDATE', user!.id);
          const current = (await authenticate(req, false, persistence.backend === 'postgres')) ?? fail(401, 'unauthorized');
          need(current, 'driver'); needActive(current);
          user = current;
          if (work.service === 'ride' && !work.shared && !canTake([], 'ride', work, current.vehicle)) fail(409, 'wrong_vehicle');
          if (driverWork[2] === 'accept') await guardCashCap(current.id, work.price, await driverRate(current.id));
        }
        if (legacyWork) await eligibility.guard(user!.id, Number(driverWork[1]), driverWork[2] as 'accept'|'offer', body.capacityProtocol, body.price, body.expectedRequirementsRevision);
      } else if (req.method === 'POST' && customerOffer) {
        need(user!, 'customer'); needActive(user!);
        const order = await one('SELECT id,service FROM orders WHERE id=? AND customer_id=?', Number(customerOffer[1]), user!.id) ?? fail(404, 'not_found');
        if (!enabledServices.includes(order.service)) fail(409, 'service_unavailable');
        await guardRideAssignment(Number(order.id)); // same lock order and refuse-before-write as a driver accept
        const offer = await one('SELECT price FROM order_offers WHERE order_id=? AND driver_id=?', Number(customerOffer[1]), Number(customerOffer[2]));
        if (offer) await guardCashCap(Number(customerOffer[2]), Number(offer.price), await driverRate(Number(customerOffer[2])), 'offer_expired');
        if (persistence.backend === 'postgres') await one('SELECT id FROM users WHERE id = ? FOR UPDATE', Number(customerOffer[2])); // captain before policy (Sol R2-H1)
        await eligibility.guard(Number(customerOffer[2]), Number(customerOffer[1]), 'offer_accept', body.capacityProtocol, undefined, body.expectedRequirementsRevision);
      } else if (req.method === 'POST' && url.pathname === '/api/orders' && body.capacityProtocol !== undefined) {
        // An installed booking may be measured by an operator; it cannot assert its own verified load.
        await eligibility.available(); fail(409, 'operator_order_assessment_required');
      }
      const result = await match.handler({ user: user!, body, params: match.m!.slice(1), query: url.searchParams, req });
      if (boundary) await persistence.exec('COMMIT');
      return result;
      } catch (error) { if (boundary) return persistence.rollbackAfterError(error); throw error; }
    };
    const profileWrite = user?.accountMode && ['POST','PATCH','DELETE'].includes(req.method ?? '')
      && /^\/api\/(?:orders|jobs|location|driver|captain|merchant|roads|subscriptions|promos|me\/places)(?:\/|$)/.test(url.pathname)
      && url.pathname !== '/api/orders' && !/^\/api\/orders\/[^/]+\/payments(?:\/|$)/.test(url.pathname);
    if (profileWrite) {
      let refusal: HttpError | undefined;
      payload = await persistence.sqliteModeWrite(async () => {
        if (body.commandId !== undefined) fail(409, 'durable_protocol_unavailable');
        user = await authenticate(req, false) ?? fail(401, 'unauthorized');
        requireModeRevision(user, req);
        try { return await invoke(); }
        catch (error) { if (!(error instanceof HttpError)) throw error; refusal = error; }
      });
      if (refusal) throw refusal;
    } else if (req.method === 'POST' && /^\/api\/driver\/presence\//.test(url.pathname)) {
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
      (/^\/api\/(?:auth\/(?:login|register|reset(?:\/(?:code|link(?:\/code)?))?|entra)|me\/(?:password|delete|email(?:\/(?:code|verify|link(?:\/confirm)?))?)|admin\/users\/\d+\/password)$/.test(url.pathname)
        || /^\/api\/partner\//.test(url.pathname))) {
      // These routes own short transactions. Hashing credentials or waiting for a mail provider
      // inside the envelope would hold a pooled connection for that external work.
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
    if (user?.accountMode && req.method === 'GET' && /^\/api\/(?:orders|jobs|driver|merchant)(?:\/|$)/.test(url.pathname)) {
      const latest = await authenticate(req, false) ?? fail(401, 'unauthorized');
      if (latest.accountMode !== user.accountMode || latest.modeRevision !== user.modeRevision) fail(409, 'mode_changed');
    }
    if (url.searchParams.get('journeyProtocol') === '1' && user && /^\/api\/(orders|jobs|admin\/orders)(?:\/|$)/.test(url.pathname)) {
      const viewer = await authenticate(req, false) ?? fail(401, 'unauthorized');
      const decorate = async (value: unknown) => {
        if (!value || typeof value !== 'object' || !('service' in value) || !('id' in value)) return value;
        if ('journey' in value) return value; // already projected in its detail or cursor snapshot
        const authorized = await getOrder(Number((value as Order).id), viewer, false, 'recovery' in value);
        return journeyOrder(persistence, rideLifecycle, { ...value as Order, ...authorized, offers: authorized.offers,
          proofVersion: authorized.proofVersion, driverTrackingEnded: authorized.driverTrackingEnded }, viewer);
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
    const verb = /^\/api\/jobs\/\d+\/accept$/.test(url.pathname) ? 'accept'
      : /^\/api\/offers\/[a-f0-9-]+\/decline$/i.test(url.pathname) ? 'decline' : undefined;
    if (verb && url.searchParams.get('journeyProtocol') === '1') payload = { error: code, offerFailure: offerFailure(verb, code, status) };
    if (status >= 500 && !(error instanceof HttpError && ['route_unavailable', 'email_unavailable'].includes(error.message))) {
      logServerError('http_request_failed', error, { correlationId, httpStatus: status });
      // An unexpected failure tells the person its log id, so a report to support finds this line.
      // Deliberate refusals (unavailable, draining) keep their plain body.
      if (!(error instanceof HttpError)) payload = { ...(payload as object), reference: correlationId };
    }
  }
  if (status === 429 || status === 503) res.setHeader('Retry-After', '60');
  if (draining) res.setHeader('Connection', 'close');
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
let firebaseSweepTimer: ReturnType<typeof setInterval> | undefined;
let firebaseSweepJob: Promise<void> = Promise.resolve();
let firebaseSweepRunning = false;
server.on('listening', () => {
  const minimumBuild = process.env.WIND_MIN_CLIENT_BUILD;
  if (minimumBuild && !(Number.isSafeInteger(Number(minimumBuild)) && Number(minimumBuild) > 0))
    console.warn('WIND_MIN_CLIENT_BUILD is not a positive build number, so the forced-upgrade gate is off');
  if (production) void persistence.scope(async () => { const users = Number((await one('SELECT COUNT(*) n FROM users'))?.n ?? 0); if (!users) console.error('Wind API: production database has no users yet. If this is not a first boot, check that the persistent volume is mounted at DB_PATH.'); }).catch(() => undefined);
  const sweep = () => {
    if(presenceSweepRunning || draining)return;
    presenceSweepRunning=true;
    presenceSweepJob = presenceSweepJob.then(() => persistence.detached(async () => {
      if (accountModes) await emailTransaction(async () => {
        await expireCaptainAvailability(persistence, (id, reason) => queuePush([id], reason === 'idle' ? 'captain_idle' : 'captain_offline', 0, '/driver'));
        for (const { id } of await all("SELECT id FROM users WHERE captain_state = 'closing'")) await closeCaptainIfSettled(id);
      });
      else for(let batch=0;batch<10;batch++) if(await presence.sweep()<100)break;
    })).catch(error => { logServerError('presence_maintenance_failed',error); }).finally(() => { presenceSweepRunning=false; });
  };
  sweep();
  presenceSweepTimer=setInterval(sweep,15_000);
  presenceSweepTimer.unref();
  const sweepFirebase = () => {
    if (firebaseSweepRunning || draining) return;
    firebaseSweepRunning = true;
    firebaseSweepJob = persistence.detached(sweepFirebaseResets).catch(error => { logServerError('firebase_maintenance_failed', error); })
      .finally(() => { firebaseSweepRunning = false; });
  };
  sweepFirebase();
  firebaseSweepTimer = setInterval(sweepFirebase, 60_000);
  firebaseSweepTimer.unref();
});

export async function pruneExpired() {
  (await run('DELETE FROM sessions WHERE created_at < ? OR COALESCE(last_seen_at, created_at) < ?', Date.now() - SESSION_DAYS * DAY, Date.now() - SESSION_IDLE_DAYS * DAY));
  (await run('DELETE FROM push_subscriptions WHERE user_id NOT IN (SELECT user_id FROM sessions)')); // the last session gone, no browser should keep alerting
  (await run('DELETE FROM request_limits WHERE until < ?', Date.now()));
}

async function rollbackSqliteProfiles() {
  if (accountModes || persistence.backend !== 'sqlite') throw Object.assign(new Error('Profile rollback requires SQLite and disabled profile switching'), { code: 'PROFILE_ROLLBACK_CONFIG' });
  return emailTransaction(async () => {
    if (await shop.legacyPayoutChanges()) throw Object.assign(new Error('The older release would change shop payouts'), { code: 'PROFILE_ROLLBACK_LEGACY_PAYOUT' });
    // Older writers update subscriptions by endpoint without maintaining the session binding.
    if ((await all('PRAGMA table_info(push_subscriptions)')).some(column => column.name === 'auth_session_hash'))
      await run('UPDATE push_subscriptions SET auth_session_hash = NULL WHERE auth_session_hash IS NOT NULL');
    if (!await one('SELECT 1 FROM settings WHERE key = ?', modeActivationKey)) return;
    const deferred = await all(`SELECT u.id, u.status, u.captain_state, p.vehicle, p.plate FROM users u JOIN captain_profiles p ON p.user_id = u.id
      WHERE u.phone NOT LIKE 'deleted-%' AND u.phone NOT LIKE 'partner:%'
        AND ((u.role = 'customer' AND p.state = 'under_review')
          OR (u.role = 'driver' AND u.captain_state IN ('review','paused','closing')))`);
    // The old client has one inbox per stored role. Preserve the current database if any live work would lose its inbox.
    if (await one(`SELECT 1 FROM users u WHERE u.role = 'driver' AND EXISTS (SELECT 1 FROM orders o
      WHERE o.customer_id = u.id AND o.status IN ('requested','searching',${activeSql})) LIMIT 1`)
      || await one(`SELECT 1 FROM merchants m JOIN users u ON u.id = m.owner_user_id
        JOIN shop_orders s ON s.merchant_id = m.id JOIN orders o ON o.id = s.order_id
        WHERE u.role = 'driver' AND o.status IN ('requested','searching',${activeSql}) LIMIT 1`))
      throw Object.assign(new Error('Multi-profile work is still open'), { code: 'PROFILE_ROLLBACK_WORK_OPEN' });
    const inaccessibleShops = await all(`SELECT m.id FROM merchants m JOIN users u ON u.id = m.owner_user_id
      LEFT JOIN captain_profiles p ON p.user_id = u.id
      WHERE (u.role = 'driver' AND COALESCE(u.captain_state, '') <> 'closing')
        OR (u.role = 'customer' AND p.state = 'under_review')`);
    for (const shop of inaccessibleShops) {
      const balance = (await one("SELECT COALESCE(SUM(amount_agorot),0) AS n FROM shop_ledger WHERE book = 'merchant' AND merchant_id = ?", shop.id))!.n;
      if (Number(balance) !== 0) throw Object.assign(new Error('Shop balance would lose its legacy inbox'), { code: 'PROFILE_ROLLBACK_SHOP_CASH' });
      await run('UPDATE merchants SET paused_new = 1, updated_at = ? WHERE id = ? AND paused_new = 0', Date.now(), shop.id);
    }
    for (const user of deferred) {
      if (await one(`SELECT 1 FROM orders o WHERE (o.customer_id = ? OR o.driver_id = ? OR EXISTS (
        SELECT 1 FROM shop_orders s JOIN merchants m ON m.id = s.merchant_id WHERE s.order_id = o.id AND m.owner_user_id = ?))
        AND o.status IN ('requested','searching',${activeSql}) LIMIT 1`, user.id, user.id, user.id)
        || await cashSettlementPending(user.id))
        throw Object.assign(new Error('Profile work or cash is still open'), { code: 'PROFILE_ROLLBACK_WORK_OPEN' });
      if (user.captain_state === 'closing') { await closeCaptainIfSettled(user.id); continue; }
      await run(`UPDATE users SET role = 'driver', status = ?, vehicle = ?, plate = ?, approved_at = NULL WHERE id = ?`,
        user.status === 'blocked' ? 'blocked' : 'pending', user.vehicle, user.plate, user.id);
      await run('DELETE FROM sessions WHERE user_id = ?', user.id);
      await run('DELETE FROM push_subscriptions WHERE user_id = ?', user.id);
    }
    await run(`UPDATE sessions SET active_mode = 'personal', captain_online_at = NULL, mode_revision = mode_revision + 1
      WHERE active_mode IN ('captain','shop')`);
    await run('DELETE FROM settings WHERE key = ?', modeActivationKey);
  });
}
export async function sweepFirebaseResets() {
  await run('DELETE FROM firebase_resets WHERE requested_at <= ?', Date.now() - 60 * 60_000);
  await firebaseEmail.sweep();
}
export async function shutdown() {
  if (draining) return;
  draining = true;
  if(presenceSweepTimer)clearInterval(presenceSweepTimer);
  if(firebaseSweepTimer)clearInterval(firebaseSweepTimer);
  fixWaiters.forEach(set => set.forEach(wake => wake())); // live watchers answer now instead of holding the close
  const force = setTimeout(() => server.closeAllConnections(), 10_000);
  force.unref();
  try { await new Promise<void>(resolve => server.close(() => resolve())); }
  finally { clearTimeout(force); await presenceSweepJob; await firebaseSweepJob; await firebaseEmail.drain(); await phoneIdentity.drain(); await closePasswordHasher(); await persistence.close(); db.close(); }
}

// Phones aren't verified by SMS, so admin rights are granted from the server shell, never over the API.
export async function promote(input: string) {
  const phone = normalizePhone(input) ?? fail(400, 'invalid_phone');
  return persistence.scope(async () => {
    await persistence.exec('BEGIN IMMEDIATE');
    try {
      const target = await one(`SELECT id, role, phone_verified_at FROM users WHERE phone = ?
        ${persistence.backend === 'postgres' ? 'FOR UPDATE' : ''}`, phone)
        ?? (production ? fail(409, 'verify phone ownership through operator enrollment first') : fail(404, 'register this number in the app first'));
      if (production && !target.phone_verified_at) fail(409, 'verify phone ownership through operator enrollment first');
      if (target.role === 'driver') {
        if (await one(`SELECT id FROM orders WHERE driver_id = ? AND status IN (${activeSql}) LIMIT 1`, target.id))
          fail(409, 'active_orders');
        await cashSettled(target.id);
      }
      await run(`UPDATE users SET role = 'admin', status = 'active', vehicle = NULL, plate = NULL,
        approved_at = CASE WHEN role = 'admin' THEN approved_at ELSE NULL END WHERE id = ?`, target.id);
      if (target.role !== 'admin') {
        await endRoleBenefits(target.id);
        await revokeUserAccess(target.id);
      }
      await persistence.exec('COMMIT');
      return phone;
    } catch (error) { await persistence.exec('ROLLBACK'); throw error; }
  });
}

if (import.meta.main) {
  if (modeRollback) {
    try {
      await persistence.scope(rollbackSqliteProfiles);
      console.log('SQLite profile rollback complete');
    } catch (error) { logAccountCommandFailure(error); process.exitCode = 1; }
    finally { db.close(); }
  } else if (process.argv[2] === 'delete-account') {
    try {
      if (process.argv[4] !== '--phone-verified') throw Object.assign(new Error('Operator attestation required'), { code: 'OPERATOR_REQUEST_PROOF_REQUIRED' });
      const phone = normalizePhone(process.argv[3] ?? '') ?? fail(400, 'invalid_phone');
      const account = (await one('SELECT * FROM users WHERE phone = ?', phone)) ?? fail(404, 'not_found');
      await persistence.scope(async () => deleteAccount(await toUser(account), null));
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
      const hashed = await hashPassword(password);
      await persistence.scope(() => emailTransaction(async () => {
        const application = accountModes && role === 'driver';
        const inserted = await run('INSERT INTO users (phone, name, password, role, status, vehicle, created_at, phone_verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          phone, name, hashed, application ? 'customer' : role, role === 'driver' && !application ? 'pending' : 'active', application ? null : vehicle, Date.now(), Date.now());
        if (application) await createCaptainApplication(Number(inserted.lastInsertRowid), vehicle as Vehicle, null);
      }));
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
    (await pruneExpired());
    const maintenance = async () => { try { (await pruneExpired()); (await alertMissedBackup()); } catch (error) { logServerError('maintenance_failed', error); } };
    // Five minutes after start too, so a restart does not wait an hour to notice a stale backup (and a stale alert allowance is
    // cleared before the next outage; Haiku PR #103 recheck 5). An install's dry run is stopped within about four minutes (60 tries
    // of a 3 s probe and 1 s pause), so it never gets here; even if it did, its database copy has every push target removed.
    setTimeout(maintenance, 5 * 60_000).unref();
    setInterval(maintenance, 60 * 60_000).unref(); // expired throttles never pile up
    const port = Number(process.env.PORT ?? 4000);
    server.listen(port, process.env.HOST ?? (production ? '127.0.0.1' : '0.0.0.0'), () => console.log(`Wind API on :${port}`));
    setInterval(async () => { try { (await alertReleasedJobs()); } catch (error) { logServerError('maintenance_failed', error); } }, 60_000).unref(); // scheduled-job release alerts
    setInterval(async () => { try { (await shopSweep()); } catch (error) { logServerError('maintenance_failed', error); } }, 60_000).unref(); // shop accept, consent, dispatch and licence timers
    setInterval(async () => { try { (await remindOfficeJobs()); } catch (error) { logServerError('maintenance_failed', error); } }, 60 * 60_000).unref(); // SHIP-19 daily office reminders
    setInterval(async () => { try { const n = (await expireStaleDemand()); if (n) console.log(`T21: ${n} stale searching orders expired`); } catch (error) { logServerError('maintenance_failed', error); } }, 60_000).unref(); // T21 stale searching demand leaves the board, at most 50 a minute
    // A quote an in-flight booking held when its customer was deleted is scrubbed once the lock is gone (PostgreSQL quotes only).
    if (persistence.backend === 'postgres') setInterval(async () => {
      if (draining) return;
      try { if (await quotesAvailable(persistence)) { await scrubDeletedQuotes(); await purgeExpiredQuotes(); } } catch (error) { logServerError('maintenance_failed', error); }
    }, 60_000).unref();
    process.once('SIGTERM', async () => { shutdown().catch(error => { logServerError('shutdown_failed', error); process.exitCode = 1; }); });
    process.once('SIGINT', async () => { shutdown().catch(error => { logServerError('shutdown_failed', error); process.exitCode = 1; }); });
  }
}
