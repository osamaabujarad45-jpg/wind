// T16 local place search: the model's towns and the customer's saved places are searchable in Arabic and
// English, empty/offline/out-of-area are answered, and choosing a hit only proposes it — a confirmed pin
// survives until an explicit confirmation.
import assert from 'node:assert/strict';
import { cities } from '../src/model.ts';
import { confirmPlace, placeAt, proposePlace, searchPlaces } from '../src/place-search.ts';

const places = [
  { id: 1, label: 'home', city: 'ramallah', note: 'Al-Manara' },
  { id: 2, label: 'work', city: 'nablus', note: 'Near Al-Najah gate' },
];

// Every served town is in the corpus under both of its names.
for (const item of cities) {
  assert.ok(searchPlaces(item.en).choices.some(c => c.key === `city:${item.id}`), `English: ${item.en}`);
  assert.ok(searchPlaces(item.ar).choices.some(c => c.key === `city:${item.id}`), `Arabic: ${item.ar}`);
}
assert.deepEqual(searchPlaces('طولكرم').choices.map(c => c.key), ['city:tulkarm']);
// Arabic keyboard forms fold together: bare alef for hamza, ha for ta marbuta.
assert.deepEqual(searchPlaces('اريحا').choices.map(c => c.key), ['city:jericho']);
assert.deepEqual(searchPlaces('البيره').choices.map(c => c.key), ['city:bireh']);
// Saved places match on their landmark and their city, and lead the list.
assert.deepEqual(searchPlaces('manara', places).choices.map(c => c.key), ['saved:1']);
assert.deepEqual(searchPlaces('najah', places).choices.map(c => c.key), ['saved:2']);
assert.deepEqual(searchPlaces('NABL', places).choices.map(c => c.key), ['saved:2', 'city:nablus']);

// Empty query, no match, and offline are distinct answers.
assert.deepEqual(searchPlaces('   ', places), { choices: [], feedback: 'empty', offline: false });
assert.deepEqual(searchPlaces('atlantis', places), { choices: [], feedback: 'no_match', offline: false });
assert.deepEqual(searchPlaces('atlantis', places, false), { choices: [], feedback: 'offline', offline: true });
const offline = searchPlaces('hebron', places, false);
assert.deepEqual(offline.choices.map(c => c.key), ['city:hebron']);
assert.equal(offline.feedback, null, 'an offline hit is still a hit');
assert.equal(offline.offline, true);

// A pin is accepted only inside the served area; the note travels with it.
const pin = { latitude: 31.9038, longitude: 35.2034 };
assert.deepEqual(placeAt(pin, 'Gate'), { city: 'ramallah', note: 'Gate', point: pin });
assert.equal(placeAt({ latitude: 31.9038, longitude: 35.0734 }).city, 'ramallah'); // 12 km out, inside 20
assert.deepEqual(placeAt({ latitude: 31.40, longitude: 34.40 }), { error: 'outside' });
assert.deepEqual(placeAt({ latitude: NaN, longitude: NaN }), { error: 'outside' });

// Choosing a hit proposes it: the accepted place and its pin are untouched.
const accepted = { city: 'ramallah', note: 'Al-Manara', point: pin };
const snapshot = { ...accepted, point: { ...pin } };
const sameCity = proposePlace(accepted, searchPlaces('manara', places).choices[0]);
assert.equal(sameCity.keptPin, true);
assert.deepEqual(sameCity.point, pin, 'a saved place in the same city keeps the confirmed pin');
assert.deepEqual(accepted, snapshot, 'a proposal never mutates the accepted place');
assert.deepEqual(confirmPlace(sameCity), { city: 'ramallah', note: 'Al-Manara', point: pin });

const otherCity = proposePlace(accepted, searchPlaces('najah', places).choices[0]);
assert.equal(otherCity.city, 'nablus');
assert.equal(otherCity.keptPin, false);
assert.equal(otherCity.point, null, 'another city drops the pin only as a proposal');
assert.deepEqual(accepted, snapshot);

// A town hit is its centre, not a pin, and a pin candidate carries its own point.
const town = proposePlace(null, searchPlaces('hebron').choices[0]);
assert.equal(town.point, null);
assert.equal(town.keptPin, false);
const pinned = proposePlace(accepted, placeAt(pin));
assert.equal(pinned.keptPin, false);
assert.deepEqual(pinned.point, pin);
assert.deepEqual(confirmPlace(pinned), { city: 'ramallah', note: '', point: pin });

console.log('Place search: corpus, Arabic/English matching, empty/offline/outside feedback and pin safety passed');
