// Shared by the app and the API server (server/main.ts). Keep it free of React Native imports.

export const cities = [
  { id: 'ramallah', ar: 'رام الله', en: 'Ramallah', latitude: 31.9038, longitude: 35.2034 },
  { id: 'bireh', ar: 'البيرة', en: 'Al-Bireh', latitude: 31.9107, longitude: 35.2164 },
  { id: 'nablus', ar: 'نابلس', en: 'Nablus', latitude: 32.2211, longitude: 35.2544 },
  { id: 'hebron', ar: 'الخليل', en: 'Hebron', latitude: 31.5326, longitude: 35.0998 },
  { id: 'bethlehem', ar: 'بيت لحم', en: 'Bethlehem', latitude: 31.7054, longitude: 35.2024 },
  { id: 'jenin', ar: 'جنين', en: 'Jenin', latitude: 32.4612, longitude: 35.3005 },
  { id: 'tulkarm', ar: 'طولكرم', en: 'Tulkarm', latitude: 32.3116, longitude: 35.0279 },
  { id: 'qalqilya', ar: 'قلقيلية', en: 'Qalqilya', latitude: 32.1960, longitude: 34.9810 },
  { id: 'jericho', ar: 'أريحا', en: 'Jericho', latitude: 31.8667, longitude: 35.4500 },
  { id: 'salfit', ar: 'سلفيت', en: 'Salfit', latitude: 32.0837, longitude: 35.1808 },
] as const;

export type CityId = typeof cities[number]['id'];
export type Service = 'parcel' | 'ride' | 'freight';
export type Role = 'customer' | 'driver' | 'admin';
export type Vehicle = 'motorcycle' | 'bicycle' | 'car' | 'van' | 'truck';
export type UserStatus = 'active' | 'pending' | 'blocked';
export type OrderStatus = 'searching' | 'assigned' | 'at_pickup' | 'in_transit' | 'completed' | 'cancelled'
  | 'on_hold' | 'returning' | 'returned';
export type ExceptionReason = 'absent' | 'refused' | 'unreachable' | 'wrong_address';
export const exceptionReasons: ExceptionReason[] = ['absent', 'refused', 'unreachable', 'wrong_address'];
export type Dispute = { status: 'open' | 'resolved'; reason: string; resolution: string | null; credit?: { code: string; amount: number } | null };
export type Road = { id: number; name: string; cities: CityId[]; point: Point | null; status: 'open' | 'slow' | 'closed' | null; note: string; reportedAt: number | null; agreeing: number };
/** Checkpoints touching either city with a recent slow/closed report: booking warning and live ETA wording. */
export const roadAlerts = (roads: Road[], ...on: CityId[]) =>
  roads.filter(r => (r.status === 'slow' || r.status === 'closed') && r.cities.some(c => on.includes(c)));
export type SavedPlace = { id: number; label: 'home' | 'work' | 'other'; city: CityId; note: string };
export type Places = { saved: SavedPlace[]; recent: { city: CityId; note: string }[] };
export type SafetyKind = 'unsafe_driving' | 'harassment' | 'accident' | 'threat' | 'other';
// "other" leads: it is the preselected chip, and a chip rail's far end starts off-screen (Safety in order/[id].tsx)
export const safetyKinds: SafetyKind[] = ['other', 'unsafe_driving', 'harassment', 'accident', 'threat'];
export type Plan = 'plus' | 'pro';
export type Point = { latitude: number; longitude: number };
export type DestinationChange = {
  id: string; city: CityId; point: Point | null; note: string;
  oldPrice: number; oldDiscount: number; price: number; discount: number;
  commission: number; expiresAt: number;
  road: { slow: string[]; closed: string[]; avoids: string[]; estimated: boolean; minutes: number };
};

export const services: Service[] = ['parcel', 'ride', 'freight'];
export const vehicles: Vehicle[] = ['motorcycle', 'bicycle', 'car', 'van', 'truck'];
export const statusFlow: OrderStatus[] = ['searching', 'assigned', 'at_pickup', 'in_transit', 'completed'];
// on_hold and returning keep the driver assigned: they still hold the item.
export const activeStatuses: OrderStatus[] = ['assigned', 'at_pickup', 'in_transit', 'on_hold', 'returning'];
// Both end states the driver is paid for: delivered, or handed back to the sender.
export const finishedStatuses: OrderStatus[] = ['completed', 'returned'];
export const isOpen = (o: Pick<Order, 'status'>) => o.status === 'searching' || activeStatuses.includes(o.status);
/** Ended orders per orders-list page (GET /orders, then ?before=<oldest ended id>); open work only comes on the first page. */
export const HISTORY_PAGE = 200;
/** The polled first page plus the older pages loaded below it: the first page wins for any order it still holds. */
export const withOlder = (latest: Order[], older: Order[]) => {
  const seen = new Set(latest.map(o => o.id));
  return [...latest, ...older.filter(o => !seen.has(o.id))].sort((a, b) => b.id - a.id);
};
/** Loaded older pages after a poll replaced the first page `was` with `now`: ended orders its window moved past stay listed.
 *  Null when an open order left it: that order ended below the window, maybe inside pages already loaded, so start over. */
export const keepOlder = (was: Order[], now: Order[], older: Order[]) => {
  const ids = new Set(now.map(o => o.id));
  return was.some(o => isOpen(o) && !ids.has(o.id)) ? null : withOlder(was.filter(o => !isOpen(o)), older);
};
// Motorcycles can carry small parcels and licensed passenger rides. Bicycles stay parcel-only:
// they never enter the passenger-ride pool, so dispatch does not create an unsafe assignment.
export const vehicleServices: Record<Vehicle, Service[]> = {
  motorcycle: ['parcel', 'ride'], bicycle: ['parcel'], car: ['parcel', 'ride'], van: ['parcel', 'freight'], truck: ['freight'],
};
export const planForRole: Partial<Record<Role, Plan>> = { customer: 'plus', driver: 'pro' };

export function optionsFor(service: Service): string[] {
  return service === 'ride' ? ['1', '2', '3', '4'] : ['small', 'medium', 'large'];
}

// Admin-editable; stored server-side. Discounts and commissions are fractions.
export const defaultSettings = {
  parcelPrice: 20, parcelLarge: 10, // standard parcel, any distance (SPEC-parcel-standard.md)
  rideBase: 15, ridePerKm: 1.1,
  freightBase: 70, freightPerKm: 2.5, freightLarge: 50, loadingHelp: 30,
  sharedDiscount: 0.4, plusDiscount: 0.15,
  commission: 0.15, proCommission: 0.05,
  plusPrice: 29, proPrice: 99,
  perMinute: 0.25, nightExtra: 0.2, // smart price (SPEC-driver-offers.md): extra minutes, night share
};
export type Settings = typeof defaultSettings;
export type Referral = { code: string; reward: number; joined: number; earned: number; credits: { code: string; amount: number; expiresAt: number }[] };
export const fractionSettings: (keyof Settings)[] = ['sharedDiscount', 'plusDiscount', 'commission', 'proCommission', 'nightExtra'];

// One ceiling per setting, shared by the admin form and the server. Without it a blank
// field saved 0 (commission 0 throws in minorUnits; a plan price of 0 is free) and a
// fat-fingered 2000 quoted every parcel at 2000. Fractions are capped below 1 because
// 100% commission or discount is never a real tariff.
export const settingCeilings: Record<keyof Settings, number> = {
  parcelPrice: 500, parcelLarge: 500, rideBase: 500, ridePerKm: 100, freightBase: 5000, freightPerKm: 100,
  freightLarge: 2000, loadingHelp: 1000, perMinute: 100, nightExtra: 1,
  sharedDiscount: 1, plusDiscount: 1, commission: 0.5, proCommission: 0.5,
  plusPrice: 1000, proPrice: 2000,
};
// Returns the offending key, or null when every value is storable. `Number.isFinite`
// rejects the NaN an empty or non-numeric field produces; `<= 0` rejects the 0 that a
// blank field becomes (no setting has a meaningful zero: free delivery and zero commission
// are not supported states, and minorUnits(0) throws).
export function invalidSetting(values: Record<string, number>): keyof Settings | null {
  for (const [key, value] of Object.entries(values)) {
    const ceiling = settingCeilings[key as keyof Settings];
    if (ceiling === undefined || !Number.isFinite(value) || value <= 0 || value > ceiling) return key as keyof Settings;
  }
  return null;
}

export type User = {
  id: number; phone: string; name: string; role: Role; status: UserStatus;
  vehicle: Vehicle | null; plate?: string | null; rating: number | null; createdAt: number;
  priceRating?: number | null; trips?: number; // drivers only
  heading?: { city: CityId; until: number } | null; // drivers only: destination filter (SPEC-driver-destination.md)
  email?: string | null; permanentlyApprovedAt?: number | null;
  phoneVerifiedAt?: number | null; emailVerifiedAt?: number | null;
};

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export type Subscription = { id: number; userId: number; plan: Plan; status: 'pending' | 'active' | 'expired' | 'rejected'; price: number; endsAt: number | null; createdAt: number; userName?: string; userPhone?: string };

export type Order = {
  id: number; customerId: number | null; driverId: number | null; service: Service; shared: boolean;
  pickupCity: CityId; dropoffCity: CityId; pickupPoint: Point | null; dropoffPoint?: Point | null;
  pickupNote: string; dropoffNote: string; contact: string | null; pickupContact: string | null; detail: string;
  recipientName?: string; recipientPhone?: string | null; // parcels and loads (SPEC-parcel-recipient.md)
  option: string; loadingHelp: boolean; price: number; commission: number | null;
  destinationChange?: DestinationChange | null; canChangeDestination?: boolean;
  status: OrderStatus; handoverCode: string | null; rating: number | null;
  returnCode: string | null; exceptionReason: ExceptionReason | null; dispute: Dispute | null; sharing: boolean; scheduledFor: number | null; discount: number;
  safetyHold: boolean; safetyReport: { status: 'open' | 'resolved'; kind: SafetyKind; resolution: string | null } | null;
  createdAt: number; updatedAt: number;
  assignedAt?: number | null; pickedUpAt?: number | null; completedAt?: number | null; // status timeline
  customerName?: string; driverName?: string; driverPhone?: string; driverVehicle?: Vehicle | null;
  driverPlate?: string | null; driverRating?: number | null;
  sharedRun?: boolean; // the driver carries other orders right now: no straight-to-you ETA (SPEC-courier-run-eta.md)
  driverLocation?: (Point & { updatedAt: number; ageSeconds: number; heading?: number | null; accuracy?: number | null }) | null;
  // Driver offers (SPEC-driver-offers.md): null for fixed-price orders (Souq, apps before 1.0.8).
  recommendedPrice?: number | null; priceRating?: number | null;
  routeKm?: number | null; // road km the recommended price used
  myOffer?: { price: number; createdAt: number } | null; // the viewing driver's pending offer
  offers?: Offer[]; // the customer's open offers, cheapest first
  customerRating?: number | null; // stars the driver gave the customer (driver and admin only)
  customerStats?: { rating: number | null; trips: number }; // drivers only; rating from 3 ratings (SPEC-customer-rating.md)
  dispatch?: { roundId: string; state: string; closeReason: string | null; offersIssued: number; deadlineAt: number; startedAt: number;
    myOffer?: { id: string; offerId: string; expiresAt: number; issuedAt: number; leaseNonce: string | null; pickupEtaSeconds: number; idleSeconds: number; idleCreditSeconds: number; rankScore: number; etaEstimated: boolean } | null } | null; // WP10 additive
  ride?: { arrivedAt: number | null; graceUntil: number | null; arrivalSource: string | null; boardingRequired: boolean; boardingLocked: boolean; boardingCode?: string } | null; // WP11 additive
  declaredScope?: { orderId: number; service: string; revision: number; itemCount: number | null; lengthMm: number | null; widthMm: number | null; heightMm: number | null;
    massGrams: number | null; volumeCm3: number | null; declaredValueMinor: number | null; equipment: string[]; crewCount: number | null;
    loadingAfter: number | null; loadingBefore: number | null; accessConstraints: string[]; pickupPromisedAfter: number | null;
    pickupPromisedBefore: number | null; dropoffPromisedBefore: number | null; sourceRef: string | null; createdAt: number; updatedAt: number } | null; // WP12 additive
};
export type DriverStats = { rating: number | null; priceRating: number | null; trips: number };
export type Offer = DriverStats & { driverId: number; name: string; vehicle: Vehicle | null; price: number; createdAt: number };
/** What booking shows next to the recommended price. */
export type PriceQuote = { price: number; km: number; minutes: number; delayMinutes: number; night: boolean; slow: string[]; closed: string[]; avoids: string[]; estimated: boolean;
  standard?: boolean; quoteId?: string; quoteExpiresAt?: number }; // a parcel: one standard price, no breakdown; quoteId only when the server locked the quote

export function city(id: CityId) {
  return cities.find(item => item.id === id)!;
}

export function isCity(id: unknown): id is CityId {
  return cities.some(item => item.id === id);
}

export function nearestCity(point: Point): CityId {
  return cities.reduce((nearest, candidate) => {
    const distance = (item: typeof cities[number]) =>
      (item.latitude - point.latitude) ** 2 + (item.longitude - point.longitude) ** 2;
    return distance(candidate) < distance(nearest) ? candidate : nearest;
  }).id;
}

// ponytail: 20 km as the crow flies from a served city centre stands in for real service zones; the app and the API share the one bound.
export const SERVICE_KM = 20;
export function servedCity(point: Point): CityId | null {
  const near = nearestCity(point);
  return crowKm(city(near), point) <= SERVICE_KM ? near : null;
}

/** Straight-line km (haversine). */
export function crowKm(a: Point, b: Point): number {
  const rad = (deg: number) => deg * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// ponytail: straight-line km x1.3 road factor; swap for a routing API once West Bank road data is validated.
export function distanceKm(a: Point, b: Point): number {
  return Math.round(crowKm(a, b) * 1.3 * 10) / 10;
}

/** Parcels cost the standard price wherever they go; a large one adds its extra (SPEC-parcel-standard.md). */
export function parcelFare(s: Settings, o: { option: string; plus?: boolean }): number {
  return Math.max(1, Math.round((s.parcelPrice + (o.option === 'large' ? s.parcelLarge : 0)) * (o.plus ? 1 - s.plusDiscount : 1)));
}

/** Parcels a driver may carry at once; rides and freight are exclusive. */
export const PARCEL_LOAD = 200; // ponytail: the owner said 100+; raise when a van route carries more
export const canTake = (active: { service: Service }[], service: Service) =>
  service === 'parcel' ? active.every(o => o.service === 'parcel') && active.length < PARCEL_LOAD : active.length === 0;

export function quote(s: Settings, o: {
  service: Service; pickupCity: CityId; dropoffCity: CityId; option: string;
  loadingHelp?: boolean; shared: boolean; plus?: boolean;
}): number {
  if (o.service === 'parcel') return parcelFare(s, o);
  const km = distanceKm(city(o.pickupCity), city(o.dropoffCity));
  const large = o.option === 'large';
  let total = o.service === 'ride' ? s.rideBase + s.ridePerKm * km
    : s.freightBase + s.freightPerKm * km + (large ? s.freightLarge : 0) + (o.loadingHelp ? s.loadingHelp : 0);
  if (o.shared) total *= (1 - s.sharedDiscount) * (o.service === 'ride' ? Number(o.option) || 1 : 1); // shared rides are per seat
  if (o.plus) total *= 1 - s.plusDiscount;
  return Math.max(1, Math.round(total));
}

// Smart recommended price (SPEC-driver-offers.md): road km, minutes beyond 50 km/h (town traffic and checkpoint delays),
// night, Plus. Drivers may accept it or offer their own price within OFFER_BAND of it.
export const SLOW_MINUTES = 15, CLOSED_MINUTES = 30; // ponytail: per slow / crossed-closed checkpoint; tune with driver reports
const hebronHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hebron', hour: '2-digit', hourCycle: 'h23' });
/** 22:00–05:59 Palestine time. */
export const isNight = (at: number) => { const h = Number(hebronHour.format(at)); return h >= 22 || h < 6; };
export function smartPrice(s: Settings, o: {
  service: Service; option: string; loadingHelp?: boolean; km: number; minutes: number; delayMinutes: number; at: number; plus?: boolean;
}): number {
  if (o.service === 'parcel') return parcelFare(s, o);
  const large = o.option === 'large';
  let total = o.service === 'ride' ? s.rideBase + s.ridePerKm * o.km
    : s.freightBase + s.freightPerKm * o.km + (large ? s.freightLarge : 0) + (o.loadingHelp ? s.loadingHelp : 0);
  total += s.perMinute * (Math.max(0, o.minutes - o.km * 1.2) + o.delayMinutes); // 1.2 min/km = 50 km/h, measured intercity
  if (isNight(o.at)) total *= 1 + s.nightExtra;
  if (o.plus) total *= 1 - s.plusDiscount;
  return Math.max(1, Math.round(total));
}
export const OFFER_BAND = [0.5, 2] as const; // ponytail: against typos, not a fare policy
export const offerRange = (recommended: number) =>
  [Math.max(1, Math.ceil(recommended * OFFER_BAND[0])), Math.max(1, Math.floor(recommended * OFFER_BAND[1]))] as const;

export function commissionOn(price: number, rate: number): number {
  return Math.round(price * rate * 100) / 100;
}

/** Arabic-Indic and Persian digits typed on an Arabic keyboard, as ASCII. */
export const latinDigits = (text: string) =>
  text.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
/** A number typed in a form: Arabic-Indic digits and the Arabic decimal separator (٫) or a comma are normal input here. */
export const typedNumber = (text: string) => Number(latinDigits(text.trim()).replace(/[٫,]/, '.'));

// Palestinian mobiles (Jawwal 059, Ooredoo 056). Accepts Arabic-Indic digits, spaces, dashes,
// and +970 / +972 / 00970 / 00972 / 0 prefixes. Returns canonical 05XXXXXXXX or null.
// A West Bank mobile (Jawwal 059, Ooredoo 056) is the same line written +970 or +972, so both map to one identity
// (owner decision 31 Oct 2026; docs/implementation/WP06.md). Israeli carrier blocks (050–055, 058) stay rejected.
// Contacts copied from an Arabic phone carry brackets, dots and invisible direction marks; they are not part of the number.
export function normalizePhone(input: string): string | null {
  const ascii = latinDigits(input).replace(/[\s\-().\u00ad\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, '');
  const match = /^(?:(?:\+|00)?97[02]|0)?(5[69]\d{7})$/.exec(ascii);
  return match ? `0${match[1]}` : null;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

export function nextStatus(status: OrderStatus): OrderStatus {
  if (status === 'returning') return 'returned';
  const index = statusFlow.indexOf(status);
  return index < 0 ? status : statusFlow[Math.min(index + 1, statusFlow.length - 1)];
}

export function orderCode(id: number): string {
  return `W-${String(id).padStart(5, '0')}`;
}

/**
 * Wrap an LTR token (order code, receipt number) in Unicode isolates so
 * first-strong bidi layout cannot visually reorder it inside an Arabic
 * sentence; brief §8 requires codes to keep their direction.
 */
export function ltr(text: string): string {
  return `\u2066${text}\u2069`;
}

// Run sheet (SPEC-run-sheet.md): a courier's active orders as courier companies print them, by stage then city.
export type RunStage = 'pickup' | 'deliver' | 'return';
export function runSheet<T extends Pick<Order, 'id' | 'status' | 'pickupCity' | 'dropoffCity'>>(orders: T[]) {
  const stageOf = (o: T): RunStage | null => o.status === 'assigned' || o.status === 'at_pickup' ? 'pickup'
    : o.status === 'in_transit' || o.status === 'on_hold' ? 'deliver' : o.status === 'returning' ? 'return' : null;
  const groups = new Map<string, { stage: RunStage; city: CityId; orders: T[] }>();
  for (const o of orders) {
    const stage = stageOf(o);
    if (!stage) continue;
    const at = stage === 'deliver' ? o.dropoffCity : o.pickupCity; // returns go back to the sender's pickup
    const key = `${stage}:${at}`;
    if (!groups.has(key)) groups.set(key, { stage, city: at, orders: [] });
    groups.get(key)!.orders.push(o);
  }
  const rank: Record<RunStage, number> = { pickup: 0, deliver: 1, return: 2 };
  return [...groups.values()]
    .map(g => ({ ...g, orders: g.orders.sort((a, b) => a.id - b.id) }))
    .sort((a, b) => rank[a.stage] - rank[b.stage] || b.orders.length - a.orders.length || a.city.localeCompare(b.city));
}
