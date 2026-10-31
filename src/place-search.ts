// Local place search (T16): the towns in model.ts and the customer's saved places are the whole corpus.
// It is pure and offline-safe — nothing here calls Google Places — and a hit is only ever a proposal:
// the accepted place and its pin change on explicit confirmation, never on a search tap.
import { cities, city, servedCity, type CityId, type Point, type SavedPlace } from './model.ts';

/** A place the booking form could accept: a town, a saved landmark, or a confirmed map pin. */
export type PlaceCandidate = { city: CityId; note: string; point: Point | null };

/** A search hit. `saved` is null for a served town; `detail` is set for a map (OpenStreetMap) place. */
export type PlaceChoice = PlaceCandidate & { key: string; saved: SavedPlace | null; detail?: string };

/** A real place from the server's map search (GET /api/places/search). */
export type MapHit = { name: string; detail: string; latitude: number; longitude: number };

/** Map search hits as choices: each carries its exact point and becomes the pin; anything outside the area is dropped. */
export const mapChoices = (hits: readonly MapHit[]): PlaceChoice[] => hits.flatMap((hit, i) => {
  const point = { latitude: hit.latitude, longitude: hit.longitude }, near = servedCity(point);
  return near ? [{ key: `map:${i}:${hit.latitude},${hit.longitude}`, city: near, note: hit.name, point, saved: null, detail: hit.detail }] : [];
});

/** A hit waiting for the customer's explicit confirmation; `keptPin` says the current pin rides along. */
export type PlaceProposal = PlaceCandidate & { keptPin: boolean };

/** Why a search list is empty. `offline` means local choices only, not that the place does not exist. */
export type PlaceFeedback = 'empty' | 'no_match' | 'offline';
export type PlaceSearchResult = { choices: PlaceChoice[]; feedback: PlaceFeedback | null; offline: boolean };

// Arabic keyboards produce hamza/alef and ta-marbuta variants and often omit diacritics; fold them so
// أريحا and اريحا are the same place. English is case-insensitive.
const fold = (text: string) => text.trim().toLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');

/** Towns and saved places that match a query. Saved places lead, as in the booking city list. */
export function searchPlaces(query: string, saved: readonly SavedPlace[] = [], online = true): PlaceSearchResult {
  const term = fold(query);
  if (!term) return { choices: [], feedback: 'empty', offline: !online };
  const choices: PlaceChoice[] = [];
  for (const place of saved) {
    const placeCity = city(place.city);
    if (fold(`${place.note} ${placeCity.ar} ${placeCity.en}`).includes(term))
      choices.push({ key: `saved:${place.id}`, city: place.city, note: place.note, point: null, saved: place });
  }
  for (const item of cities) {
    if (fold(item.ar).includes(term) || fold(item.en).includes(term))
      choices.push({ key: `city:${item.id}`, city: item.id, note: '', point: null, saved: null });
  }
  return { choices, feedback: choices.length ? null : online ? 'no_match' : 'offline', offline: !online };
}

/** A map pin or GPS fix, bounded by the repo's one service rule (servedCity: 20 km from a city centre). */
export function placeAt(point: Point, note = ''): PlaceCandidate | { error: 'outside' } {
  const near = servedCity(point);
  return near ? { city: near, note, point } : { error: 'outside' };
}

/**
 * Choosing a hit only proposes it. A hit without its own pin keeps the accepted pin in the same city
 * and drops it only on an explicit confirmation elsewhere, so a pinned pickup is never silently moved.
 */
export function proposePlace(accepted: PlaceCandidate | null, choice: PlaceCandidate): PlaceProposal {
  if (choice.point) return { ...choice, keptPin: false };
  const keep = accepted && accepted.point && accepted.city === choice.city ? accepted.point : null;
  return { ...choice, point: keep, keptPin: keep !== null };
}

/** The customer's explicit tap: the proposal, and only it, becomes the accepted place. */
export const confirmPlace = ({ city: placeCity, note, point }: PlaceProposal): PlaceCandidate => ({ city: placeCity, note, point });
