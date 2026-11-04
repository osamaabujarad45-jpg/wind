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
const line = steps.map(step => [step.longitude, step.latitude]);
const at = (latitude, longitude) => ({ latitude, longitude });

assert.equal(nextManeuver([], at(32.31, 35.02), line), null, 'no list, no banner');
assert.equal(nextManeuver(steps.slice(0, 1), at(32.31, 35.02), line), null, 'a depart alone says nothing');
assert.equal(nextManeuver(steps, at(32.3105, 35.0200), line).step.type, 'turn', 'at the start, the first turn is next');
assert.ok(Math.abs(nextManeuver(steps, at(32.3105, 35.0200), line).metres - 166) < 5, 'distance to it in metres');
assert.equal(nextManeuver(steps, at(32.31201, 35.0200), line).step.type, 'roundabout', 'on the turn, the following maneuver is next');
assert.equal(nextManeuver(steps, at(32.3120, 35.0215), line).step.type, 'roundabout', 'past the turn but not at the roundabout');
assert.equal(nextManeuver(steps, at(32.3130, 35.0240), line).step.type, 'arrive', 'past the roundabout');
assert.equal(nextManeuver(steps, at(32.3150, 35.0240), line).metres, 0, 'at the end, the arrival at no distance');

// From the phone in Tulkarm: the stop is 166 m away across a field, the road goes round. The nearer stop must not read as next.
const round = [
  { type: 'depart', latitude: 32.3125, longitude: 35.0480 },
  { type: 'turn', modifier: 'left', latitude: 32.3125, longitude: 35.0500 },
  { type: 'turn', modifier: 'right', latitude: 32.3110, longitude: 35.0500 },
  { type: 'arrive', latitude: 32.3110, longitude: 35.0480 },
];
const roundLine = round.map(step => [step.longitude, step.latitude]);
const start = nextManeuver(round, at(32.3125, 35.0480), roundLine);
assert.equal(start.step, round[1], 'the first turn, though the arrival is nearer in a straight line');
assert.ok(Math.abs(start.metres - 188) < 5, 'and its distance along the road');
assert.equal(nextManeuver(round, at(32.3112, 35.0500), roundLine).step, round[2], 'halfway round, the next turn');
assert.ok(Math.abs(nextManeuver(round, at(32.3110, 35.0490), roundLine).metres - 94) < 5, 'on the last road, the road distance left');

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
