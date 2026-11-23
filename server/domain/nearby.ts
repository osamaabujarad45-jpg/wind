// Nearby cars (owner, 23 Nov 2026: "can I see the drivers?"). A customer about to book sees unnamed cars of approved drivers
// who have their job board open near them, the way Uber and Careem show cars around the pickup before a request.
// Privacy: positions live in this process's memory for three minutes and are never written down (an idle driver's
// position is still not stored), the map gets a spot rounded to about 200 m, and no name, plate or id leaves the server.
// What remains (Haiku review, PR #117): someone polling could follow an unnamed car's rough moves while its board is open.
// That is the price of the feature every ride app has; the rate limit keeps it to one look every ten seconds, signing out
// takes the car off at once, and a blocked or busy car is never shown.
// ponytail: one API process. Several processes would each see only the boards polled through them; share it then.
import { crowKm, type Point, type Service, type Vehicle } from '../../src/model.ts';

type Register = (method: string, path: string, handler: (ctx: { user: any; query: URLSearchParams }) => Promise<unknown>) => unknown;
type Deps = {
  fail: (status: number, code: string) => never;
  need: (user: any, ...roles: any[]) => void;
  needActive: (user: any) => void;
  limit: (key: string, maximum: number, windowMs: number) => Promise<unknown>;
  limitKey: (userId: number) => string;
  enabledServices: () => string[];
  servesFor: (vehicle: unknown) => string[];
  /** Whether this driver could take one more job of the service now (free seats, a load that can share), and is still active. */
  available: (driverId: number, service: Service, vehicle: Vehicle | null) => Promise<boolean>;
};

export const NEARBY_TTL_MS = 3 * 60_000, NEARBY_KM = 8, NEARBY_MAX = 12;
const GRID = 0.002; // about 200 m of latitude: enough to show "a car is close", never which house
type Seen = { point: Point; vehicle: Vehicle | null; at: number };
const seen = new Map<number, Seen>();

const round = (value: number) => Math.round(value / GRID) * GRID;
const prune = (now: number) => { for (const [id, s] of seen) if (now - s.at > NEARBY_TTL_MS) seen.delete(id); };

/** The job board was polled from here: remember the driver as a car on the map for a few minutes. */
export function sawDriver(driverId: number, point: Point, vehicle: Vehicle | null, now = Date.now()) {
  prune(now);
  seen.set(driverId, { point, vehicle, at: now });
}
/** Taken off the map at once on sign-out (server/main.ts); blocked and busy cars are left out when the map is asked. */
export function forgetDriver(driverId: number) { seen.delete(driverId); }
/** Tests only. */
export function clearNearby() { seen.clear(); }

export function registerNearbyRoutes(route: Register, deps: Deps): void {
  route('GET', '/api/drivers/nearby', async ({ user, query }) => {
    deps.need(user, 'customer');
    deps.needActive(user);
    await deps.limit(deps.limitKey(user.id), 60, 10 * 60_000); // one look every ten seconds; the home map asks every fifteen
    const [lat, lng] = (query.get('near') ?? '').split(',').map(Number);
    if (!(Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180)) deps.fail(400, 'invalid_location');
    const service = (query.get('service') ?? 'ride') as Service;
    if (!['ride', 'parcel'].includes(service)) deps.fail(400, 'invalid_service');
    if (!deps.enabledServices().includes(service)) return { cars: [], count: 0, withinKm: NEARBY_KM };
    const now = Date.now(), here = { latitude: lat, longitude: lng };
    prune(now);
    const near = [...seen.entries()]
      .map(([id, s]) => ({ id, s, km: crowKm(here, s.point) }))
      .filter(({ s, km }) => km <= NEARBY_KM && deps.servesFor(s.vehicle).includes(service))
      .sort((a, b) => a.km - b.km);
    const cars: { latitude: number; longitude: number; vehicle: Vehicle | null }[] = [];
    let nearestKm: number | null = null;
    for (const { id, s, km } of near) {
      if (cars.length >= NEARBY_MAX) break;
      if (!(await deps.available(id, service, s.vehicle))) continue;
      nearestKm ??= Math.max(1, Math.round(km)); // whole km, nearest first: "a car about 2 km away", never a fake ETA
      cars.push({ latitude: Number(round(s.point.latitude).toFixed(4)), longitude: Number(round(s.point.longitude).toFixed(4)), vehicle: s.vehicle });
    }
    return { cars, count: cars.length, withinKm: NEARBY_KM, nearestKm };
  });
}
