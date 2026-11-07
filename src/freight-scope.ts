import { latinDigits } from './model.ts';

export type FreightScope = {
  itemCount: number; lengthMm: number; widthMm: number; heightMm: number;
  massGrams: number; crewCount: number; loadingAfter: number; loadingBefore: number;
  equipment: string[]; accessConstraints: string[]; declaredValueMinor?: number;
};
export type FreightDraft = {
  pieces: string; lengthCm: string; widthCm: string; heightCm: string; massKg: string;
  crew: string; value: string; equipment: string[];
};
export const emptyFreightDraft = (): FreightDraft => ({ pieces: '1', lengthCm: '', widthCm: '', heightCm: '', massKg: '', crew: '1', value: '', equipment: [] });
export const freightDraftFromScope = (s: FreightScope): FreightDraft => ({ pieces: String(s.itemCount), lengthCm: String(s.lengthMm / 10),
  widthCm: String(s.widthMm / 10), heightCm: String(s.heightMm / 10), massKg: String(s.massGrams / 1000), crew: String(s.crewCount),
  value: s.declaredValueMinor === undefined ? '' : String(s.declaredValueMinor / 100), equipment: [...s.equipment] });

// Decimal text is converted with integer arithmetic, never rounded into another load.
function scaled(text: string, decimals: number, max: number, min = 1) {
  const normalized = latinDigits(text).trim().replace('٫', '.');
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${Math.max(1, decimals)}})?$`).test(normalized) || decimals === 0 && normalized.includes('.')) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const value = Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, '0'));
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

export function freightScope(draft: FreightDraft, start: number, hours: number): FreightScope | null {
  const itemCount = scaled(draft.pieces, 0, 200), lengthMm = scaled(draft.lengthCm, 1, 100_000);
  const widthMm = scaled(draft.widthCm, 1, 100_000), heightMm = scaled(draft.heightCm, 1, 100_000);
  const massGrams = scaled(draft.massKg, 3, 1_000_000_000), crewCount = scaled(draft.crew, 0, 20);
  const declaredValueMinor = draft.value.trim() ? scaled(draft.value, 2, Number.MAX_SAFE_INTEGER, 0) : undefined;
  if (itemCount === null || lengthMm === null || widthMm === null || heightMm === null || massGrams === null || crewCount === null || declaredValueMinor === null) return null;
  const result = { itemCount, lengthMm, widthMm, heightMm, massGrams, crewCount, loadingAfter: start,
    loadingBefore: start + hours * 3_600_000, equipment: [...draft.equipment].sort(), accessConstraints: [],
    ...(declaredValueMinor === undefined ? {} : { declaredValueMinor }) };
  return validFreightScope(result) ? result : null;
}

export function validFreightScope(raw: unknown): raw is FreightScope {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const s = raw as FreightScope;
  const integer = (n: unknown, lo: number, hi: number) => Number.isSafeInteger(n) && Number(n) >= lo && Number(n) <= hi;
  const tokens = (v: unknown) => Array.isArray(v) && v.length <= 30 && v.every(t => typeof t === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(t));
  return integer(s.itemCount, 1, 200) && [s.lengthMm, s.widthMm, s.heightMm].every(n => integer(n, 1, 100_000))
    && integer(s.massGrams, 1, 1_000_000_000) && integer(s.crewCount, 1, 20)
    && integer(s.loadingAfter, 0, Number.MAX_SAFE_INTEGER) && integer(s.loadingBefore, s.loadingAfter + 1, Number.MAX_SAFE_INTEGER)
    && (s.declaredValueMinor === undefined || integer(s.declaredValueMinor, 0, Number.MAX_SAFE_INTEGER))
    && Math.ceil(s.lengthMm * s.widthMm * s.heightMm / 1000) * s.itemCount <= 1_000_000_000
    && tokens(s.equipment) && tokens(s.accessConstraints);
}
