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
export type OrderStatus = 'requested' | 'searching' | 'assigned' | 'at_pickup' | 'in_transit' | 'completed';

export type Booking = {
  id: string;
  service: Service;
  pickupCity: CityId;
  pickupPoint?: { latitude: number; longitude: number };
  dropoffCity: CityId;
  pickupNote: string;
  dropoffNote: string;
  contact: string;
  detail: string;
  option: string;
  payment: 'cash' | 'digital';
  shared: boolean;
  samplePrice: number;
  status: OrderStatus;
  createdAt: number;
};

export const statusFlow: OrderStatus[] = ['requested', 'searching', 'assigned', 'at_pickup', 'in_transit', 'completed'];

export function city(id: CityId) {
  return cities.find(item => item.id === id)!;
}

export function nearestCity(point: { latitude: number; longitude: number }): CityId {
  return cities.reduce((nearest, candidate) => {
    const distance = (item: typeof cities[number]) =>
      (item.latitude - point.latitude) ** 2 + (item.longitude - point.longitude) ** 2;
    return distance(candidate) < distance(nearest) ? candidate : nearest;
  }).id;
}

export function sampleQuote(service: Service, pickupCity: CityId, dropoffCity: CityId, option: string, shared = false): number {
  const intercity = pickupCity !== dropoffCity &&
    !(['ramallah', 'bireh'].includes(pickupCity) && ['ramallah', 'bireh'].includes(dropoffCity));
  const base = service === 'freight' ? 90 : service === 'ride' ? 20 : 18;
  const distance = intercity ? (service === 'freight' ? 120 : 45) : 0;
  const size = service === 'freight' && option === 'large' ? 60
    : service === 'parcel' && option === 'large' ? 12 : 0;
  const total = base + distance + size;
  // ponytail: flat 40% off when pooled; real split needs the dispatch service to know who shares the route.
  return shared ? Math.round(total * 0.6) : total;
}

// Palestinian mobiles (Jawwal 059, Ooredoo 056); accepts Arabic-Indic digits from Arabic keyboards.
export function isValidPhone(input: string): boolean {
  const ascii = input.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[\s-]/g, '');
  return /^(?:(?:\+|00)?970|0)?5[69]\d{7}$/.test(ascii);
}

export function nextStatus(status: OrderStatus): OrderStatus {
  return statusFlow[Math.min(statusFlow.indexOf(status) + 1, statusFlow.length - 1)];
}
