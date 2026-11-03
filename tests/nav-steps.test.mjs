// The driver's next turn: which maneuver is ahead of a position, and how it reads in both languages.
import assert from 'node:assert/strict';
import { maneuverDistance, maneuverIcon, maneuverText, nextManeuver } from '../src/nav-steps.ts';
import { copy } from '../src/copy.ts';

const steps = [
  { type: 'depart', latitude: 32.3100, longitude: 35.0200, name: 'شارع نابلس' },
  { type: 'turn', modifier: 'left', latitude: 32.3120, longitude: 35.0200, name: 'شارع السكة' },
  { type: 'roundabout', modifier: 'right', exit: 2, latitude: 32.3120, longitude: 35.0240 },
  { type: 'arrive', latitude: 32.3150, longitude: 35.0240 },
];
const at = (latitude, longitude) => ({ latitude, longitude });

assert.equal(nextManeuver([], at(32.31, 35.02)), null, 'no list, no banner');
assert.equal(nextManeuver(steps.slice(0, 1), at(32.31, 35.02)), null, 'a depart alone says nothing');
assert.equal(nextManeuver(steps, at(32.3105, 35.0200)).step.type, 'turn', 'at the start, the first turn is next');
assert.ok(Math.abs(nextManeuver(steps, at(32.3105, 35.0200)).metres - 166) < 5, 'distance to it in metres');
assert.equal(nextManeuver(steps, at(32.31201, 35.0200)).step.type, 'roundabout', 'on the turn, the following maneuver is next');
assert.equal(nextManeuver(steps, at(32.3120, 35.0215)).step.type, 'roundabout', 'past the turn but not at the roundabout');
assert.equal(nextManeuver(steps, at(32.3130, 35.0240)).step.type, 'arrive', 'past the roundabout');

const ar = copy.ar, en = copy.en;
assert.equal(maneuverText(steps[1], en), 'Turn left onto شارع السكة');
assert.equal(maneuverText(steps[1], ar), 'انعطف يساراً إلى شارع السكة');
assert.equal(maneuverText(steps[2], en), 'At the roundabout, take exit 2');
assert.equal(maneuverText(steps[3], ar), 'وصلت');
assert.equal(maneuverText({ type: 'new name', modifier: 'straight', latitude: 0, longitude: 0, name: 'Main' }, en), 'Continue straight onto Main');
assert.equal(maneuverText({ type: 'end of road', modifier: 'sharp right', latitude: 0, longitude: 0 }, en), 'Sharp right');
assert.equal(maneuverDistance(1250, en), 'In 1.3 km');
assert.equal(maneuverDistance(234, ar), 'بعد 230 م');
assert.equal(maneuverDistance(3, en), 'In 10 m', 'never "in 0 m"');
assert.equal(maneuverIcon(steps[1]), 'arrow-back');
assert.equal(maneuverIcon(steps[2]), 'sync');
assert.equal(maneuverIcon(steps[3]), 'flag');
assert.equal(maneuverIcon({ type: 'turn', modifier: 'slight right', latitude: 0, longitude: 0 }), 'arrow-forward');
assert.equal(maneuverIcon({ type: 'turn', modifier: 'uturn', latitude: 0, longitude: 0 }), 'return-up-back');
console.log('Driver navigation: next maneuver by position, Arabic and English wording, distances and icons passed');
