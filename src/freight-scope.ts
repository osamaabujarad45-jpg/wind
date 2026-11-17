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

// One rule per declared field: the scope builder and the per-field feedback read the same numbers.
export type FreightFieldKey = 'pieces' | 'lengthCm' | 'widthCm' | 'heightCm' | 'massKg' | 'crew' | 'value';
export type FreightFieldProblem = 'required' | 'invalid';
const rules: Record<FreightFieldKey, { decimals: number; max: number; min: number }> = {
  pieces: { decimals: 0, max: 200, min: 1 },
  lengthCm: { decimals: 1, max: 100_000, min: 1 },
  widthCm: { decimals: 1, max: 100_000, min: 1 },
  heightCm: { decimals: 1, max: 100_000, min: 1 },
  massKg: { decimals: 3, max: 1_000_000_000, min: 1 },
  crew: { decimals: 0, max: 20, min: 1 },
  value: { decimals: 2, max: Number.MAX_SAFE_INTEGER, min: 0 },
};
const parse = (text: string, key: FreightFieldKey) => {
  const rule = rules[key];
  return scaled(text, rule.decimals, rule.max, rule.min);
};

export function freightScope(draft: FreightDraft, start: number, hours: number): FreightScope | null {
  const itemCount = parse(draft.pieces, 'pieces'), lengthMm = parse(draft.lengthCm, 'lengthCm');
  const widthMm = parse(draft.widthCm, 'widthCm'), heightMm = parse(draft.heightCm, 'heightCm');
  const massGrams = parse(draft.massKg, 'massKg'), crewCount = parse(draft.crew, 'crew');
  const declaredValueMinor = draft.value.trim() ? parse(draft.value, 'value') : undefined;
  if (itemCount === null || lengthMm === null || widthMm === null || heightMm === null || massGrams === null || crewCount === null || declaredValueMinor === null) return null;
  const result = { itemCount, lengthMm, widthMm, heightMm, massGrams, crewCount, loadingAfter: start,
    loadingBefore: start + hours * 3_600_000, equipment: [...draft.equipment].sort(), accessConstraints: [],
    ...(declaredValueMinor === undefined ? {} : { declaredValueMinor }) };
  return validFreightScope(result) ? result : null;
}

/** What is wrong with one declared field: required while it still needs a value, invalid when the value is not usable. */
export function freightFieldProblem(draft: FreightDraft, key: FreightFieldKey): FreightFieldProblem | null {
  if (key === 'value' && !draft.value.trim()) return null; // the declared value stays optional
  if (parse(draft[key], key) !== null) return null;
  return draft[key].trim() ? 'invalid' : 'required';
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
