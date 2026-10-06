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
export const safetyKinds: SafetyKind[] = ['unsafe_driving', 'harassment', 'accident', 'threat', 'other'];
export type Plan = 'plus' | 'pro';
export type Point = { latitude: number; longitude: number };

export const services: Service[] = ['parcel', 'ride', 'freight'];
export const vehicles: Vehicle[] = ['motorcycle', 'bicycle', 'car', 'van', 'truck'];
export const statusFlow: OrderStatus[] = ['searching', 'assigned', 'at_pickup', 'in_transit', 'completed'];
// on_hold and returning keep the driver assigned: they still hold the item.
export const activeStatuses: OrderStatus[] = ['assigned', 'at_pickup', 'in_transit', 'on_hold', 'returning'];
// Both end states the driver is paid for: delivered, or handed back to the sender.
export const finishedStatuses: OrderStatus[] = ['completed', 'returned'];
// Motorcycles can carry small parcels and licensed passenger rides. Bicycles stay parcel-only:
// they never enter the passenger-ride pool, so dispatch does not create an unsafe assignment.
export const vehicleServices: Record<Vehicle, Service[]> = {
  motorcycle: ['parcel', 'ride'], bicycle: ['parcel'], car: ['parcel', 'ride'], van: ['parcel', 'freight'], truck: ['freight'],
};
export const planForRole: Partial<Record<Role, Plan>> = { customer: 'plus', driver: 'pro' };
export const sharedCapacity = 4;

export function optionsFor(service: Service): string[] {
  return service === 'ride' ? ['1', '2', '3', '4'] : ['small', 'medium', 'large'];
}

// Admin-editable; stored server-side. Discounts and commissions are fractions.
export const defaultSettings = {
  parcelBase: 12, parcelPerKm: 0.8, parcelLarge: 10,
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

export type User = {
  id: number; phone: string; name: string; role: Role; status: UserStatus;
  vehicle: Vehicle | null; rating: number | null; createdAt: number;
  priceRating?: number | null; trips?: number; // drivers only
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
  id: number; customerId: number; driverId: number | null; service: Service; shared: boolean;
  pickupCity: CityId; dropoffCity: CityId; pickupPoint: Point | null; dropoffPoint?: Point | null;
  pickupNote: string; dropoffNote: string; contact: string | null; pickupContact: string | null; detail: string;
  option: string; loadingHelp: boolean; price: number; commission: number | null;
  status: OrderStatus; handoverCode: string | null; rating: number | null;
  returnCode: string | null; exceptionReason: ExceptionReason | null; dispute: Dispute | null; sharing: boolean; scheduledFor: number | null; discount: number;
  safetyHold: boolean; safetyReport: { status: 'open' | 'resolved'; kind: SafetyKind; resolution: string | null } | null;
  createdAt: number; updatedAt: number;
  customerName?: string; driverName?: string; driverPhone?: string; driverVehicle?: Vehicle | null;
  driverLocation?: (Point & { updatedAt: number; ageSeconds: number; heading?: number | null; accuracy?: number | null }) | null;
  // Driver offers (SPEC-driver-offers.md): null for fixed-price orders (Souq, apps before 1.0.8).
  recommendedPrice?: number | null; priceRating?: number | null;
  myOffer?: { price: number; createdAt: number } | null; // the viewing driver's pending offer
  offers?: Offer[]; // the customer's open offers, cheapest first
};
export type DriverStats = { rating: number | null; priceRating: number | null; trips: number };
export type Offer = DriverStats & { driverId: number; name: string; vehicle: Vehicle | null; price: number; createdAt: number };
/** What booking shows next to the recommended price. */
export type PriceQuote = { price: number; km: number; minutes: number; delayMinutes: number; night: boolean; slow: string[]; closed: string[]; avoids: string[]; estimated: boolean };

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

// ponytail: straight-line km x1.3 road factor; swap for a routing API once West Bank road data is validated.
export function distanceKm(a: Point, b: Point): number {
  const rad = (deg: number) => deg * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 1.3 * 10) / 10;
}

export function quote(s: Settings, o: {
  service: Service; pickupCity: CityId; dropoffCity: CityId; option: string;
  loadingHelp?: boolean; shared: boolean; plus?: boolean;
}): number {
  const km = distanceKm(city(o.pickupCity), city(o.dropoffCity));
  const large = o.option === 'large';
  let total = o.service === 'parcel' ? s.parcelBase + s.parcelPerKm * km + (large ? s.parcelLarge : 0)
    : o.service === 'ride' ? s.rideBase + s.ridePerKm * km
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
  const large = o.option === 'large';
  let total = o.service === 'parcel' ? s.parcelBase + s.parcelPerKm * o.km + (large ? s.parcelLarge : 0)
    : o.service === 'ride' ? s.rideBase + s.ridePerKm * o.km
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

// Palestinian mobiles (Jawwal 059, Ooredoo 056). Accepts Arabic-Indic digits, spaces, dashes,
// and +970 / 00970 / 0 prefixes. Returns canonical 05XXXXXXXX or null.
export function normalizePhone(input: string): string | null {
  const ascii = input.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[\s-]/g, '');
  const match = /^(?:(?:\+|00)?970|0)?(5[69]\d{7})$/.exec(ascii);
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
