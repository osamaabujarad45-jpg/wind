// The place index: instant, per-keystroke, Palestine-wide. Runs against the real data file, so a rebuild that loses a
// town shows up here.
import assert from 'node:assert/strict';
import { foldPlace, pinLabel, suggestPlaces } from '../server/domain/place-index.ts';

const tulkarm = { latitude: 32.3116, longitude: 35.0279 }, ramallah = { latitude: 31.9038, longitude: 35.2034 };
assert.equal(foldPlace('أَريحا'), 'اريحا', 'hamza and vowel signs fold');
assert.equal(foldPlace('مدرسة ٣'), 'مدرسه 3', 'ta marbuta and Arabic-Indic digits fold');

const names = (q, near, lang = 'ar') => suggestPlaces(q, lang, near).map(h => h.name);
assert.ok(names('طولكرم', null)[0].includes('طولكرم'), 'the town name finds the town');
assert.ok(names('tulk', tulkarm, 'en').some(n => /tulk/i.test(n)), 'an English prefix matches while typing');
assert.ok(names('خضوري', tulkarm).some(n => n.includes('خضوري')), 'Kadoorie university in Tulkarm');
assert.ok(names('ارتاح', tulkarm).length, 'a Tulkarm suburb, typed without hamza');
assert.ok(names('المستشفى', tulkarm).length >= 3 || names('مستشفى', tulkarm).length >= 3, 'hospitals, with or without ال');

for (const q of ['نابلس', 'جنين', 'الخليل', 'قلقيلية', 'طوباس', 'غزة', 'خان يونس', 'رفح', 'بيت لحم', 'رام الله'])
  assert.ok(names(q, null).some(n => n.includes(q)), `${q} is searchable`);

const first = (q, near) => suggestPlaces(q, 'ar', near)[0];
const fromTulkarm = first('مسجد', tulkarm), fromRamallah = first('مسجد', ramallah);
assert.notDeepEqual([fromTulkarm.latitude, fromTulkarm.longitude], [fromRamallah.latitude, fromRamallah.longitude], 'closest first');
assert.ok(Math.abs(fromTulkarm.latitude - tulkarm.latitude) < 0.2, 'a mosque near Tulkarm for a Tulkarm user');
assert.equal(suggestPlaces('طولكرم', 'ar', tulkarm).every(h => h.detail !== h.name), true, 'the detail line never repeats the name');
for (const hit of suggestPlaces('شارع', 'ar', tulkarm)) assert.equal(hit.kind, 'street');
assert.doesNotMatch(JSON.stringify(suggestPlaces('حي', 'ar', ramallah)), /[֐-׿]/, 'no Hebrew-only places');
assert.deepEqual(suggestPlaces('   ', 'ar', null), [], 'nothing typed, nothing found');
assert.deepEqual(suggestPlaces('qqqqzzzz', 'en', tulkarm), []);

const pin = pinLabel(tulkarm, 'ar');
assert.ok(pin.name, 'a pin in central Tulkarm has a name');
assert.ok(`${pin.name} ${pin.detail}`.includes('طولكرم'), `the label ends in the served town: ${pin.name} / ${pin.detail}`);
const english = pinLabel(tulkarm, 'en');
assert.ok(`${english.name} ${english.detail}`.includes('Tulkarm') || /[؀-ۿ]/.test(english.name), 'English label');
assert.deepEqual(pinLabel({ latitude: 29.5, longitude: 34.9 }, 'ar'), { name: '', detail: '' }, 'outside the service area there is nothing to say');
const started = performance.now();
for (let i = 0; i < 20; i++) suggestPlaces('مستشفى الزكاة', 'ar', tulkarm);
assert.ok((performance.now() - started) / 20 < 60, 'fast enough for every keystroke');
console.log('Place index: Arabic folding, Palestine-wide towns, closest-first, Tulkarm places and pin labels passed');
