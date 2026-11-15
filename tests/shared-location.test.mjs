import assert from 'node:assert/strict';

// GEO-03: shared locations. Plus Code vectors are from the Open Location Code test data
// (google/open-location-code test_data: decodingTests, encodingTests, shortCodeTests, validityTests).
const { parseSharedLocation, decodePlusCode, plusCodeArea, encodePlusCode, recoverPlusCode, isAllowedMapHost } = await import('../src/shared-location.ts');
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const pointOf = text => parseSharedLocation(text)?.point;
const TULKARM = { latitude: 32.3116, longitude: 35.0279 };
const RAMALLAH = { latitude: 31.9038, longitude: 35.2034 };

// Coordinates: decimal pairs, comma or space, Arabic-Indic digits and the Arabic decimal and comma marks.
for (const good of ['32.3116, 35.0279', '32.3116 35.0279', '32.3116,35.0279', '٣٢٫٣١١٦، ٣٥٫٠٢٧٩', '٣٢٫٣١١٦ ٣٥٫٠٢٧٩', '32.3116 , 35.0279']) {
  assert.deepEqual(pointOf(good), TULKARM, good);
  assert.equal(parseSharedLocation(good).source, 'coordinates', good);
}
// Out of range, and outside the one served area (Haifa is 50 km from Tulkarm and Qalqilya).
assert.deepEqual(parseSharedLocation('95.0, 35.0'), { error: 'out_of_range' });
assert.deepEqual(parseSharedLocation('32.3, 185.0'), { error: 'out_of_range' });
assert.deepEqual(parseSharedLocation('32.7940, 34.9896'), { error: 'outside_area' });
// Ordinary search text is not a location, and neither is a pair still being typed.
for (const text of ['', '   ', 'Ramallah', 'بيت لحم', '12 34', '32.3, 35', '+972597127547', '849VCWC8+R']) assert.equal(parseSharedLocation(text), null, text);

// Google Maps links: the @ path form and the q=, ll= and query= forms, on google.com, its regional hosts and maps.google.com.
assert.deepEqual(pointOf('https://www.google.com/maps/place/Ramallah/@31.9038,35.2034,17z/data=!3m1'), RAMALLAH);
assert.deepEqual(pointOf('https://maps.google.com/?q=32.3116,35.0279'), TULKARM);
assert.deepEqual(pointOf('https://www.google.ps/maps?ll=32.2211,35.2544'), { latitude: 32.2211, longitude: 35.2544 });
assert.deepEqual(pointOf('https://google.com.ps/maps/search/?api=1&query=31.9038,35.2034'), RAMALLAH);
assert.equal(parseSharedLocation('https://www.google.com/maps/@31.9038,35.2034,17z').source, 'map_link');
// Refused: hosts off the allowlist, plain http, a non-map Google path, a Maps link without a point, and a point outside the area.
for (const text of ['https://evil.example/maps/@31.9038,35.2034,17z', 'http://www.google.com/maps/@31.9038,35.2034,17z', 'https://www.google.com/search?q=32.31,35.02', 'https://www.google.com/maps', 'https://google.evil.example/maps/@31.9038,35.2034,17z'])
  assert.deepEqual(parseSharedLocation(text), { error: 'bad_link' }, text);
assert.deepEqual(parseSharedLocation('https://www.google.com/maps/@32.7940,34.9896,17z'), { error: 'outside_area' });
// Short links are not read here; the server follows them. A bare host still being typed is not a link yet.
assert.deepEqual(parseSharedLocation('https://maps.app.goo.gl/AbC123'), { shortLink: 'https://maps.app.goo.gl/AbC123' });
assert.deepEqual(parseSharedLocation('maps.app.goo.gl/AbC123'), { shortLink: 'https://maps.app.goo.gl/AbC123' });
assert.deepEqual(parseSharedLocation('https://goo.gl/maps/AbC123'), { shortLink: 'https://goo.gl/maps/AbC123' });
assert.equal(parseSharedLocation('https://maps.app.goo.gl/'), null);
assert.equal(parseSharedLocation('https://www.goog'), null);

// Allowlisted map hosts.
for (const host of ['google.com', 'www.google.com', 'google.ps', 'www.google.ps', 'google.co.il', 'google.com.ps', 'maps.google.com', 'maps.app.goo.gl', 'goo.gl'])
  assert.ok(isAllowedMapHost(host), host);
for (const host of ['google.com.evil.example', 'notgoogle.com', 'maps.google.evil.example', 'evil.example', 'www.google.com.au.evil.example', 'mail.google.com.evil.example'])
  assert.equal(isAllowedMapHost(host), false, host);

// Full Plus Codes: the official cell bounds, padding, and the encoder back to the same code.
const cell = code => plusCodeArea(code);
const lo = [20.37, 2.782125], hi = [20.370125, 2.78225];
let area = cell('7FG49QCJ+2V');
near(area.latitudeLo, lo[0]); near(area.longitudeLo, lo[1]); near(area.latitudeHi, hi[0]); near(area.longitudeHi, hi[1]);
area = cell('7FG49QCJ+2VX'); // eleventh digit: the grid refines the cell
near(area.latitudeLo, 20.3701); near(area.longitudeLo, 2.78221875); near(area.latitudeHi, 20.370125); near(area.longitudeHi, 2.78225);
area = cell('7FG49Q00+'); // padded: the cell is 0.05 degrees
near(area.latitudeLo, 20.35); near(area.longitudeLo, 2.75); near(area.latitudeHi, 20.4); near(area.longitudeHi, 2.8);
// The Googleplex, Mountain View: 849VCWC8+R9 is 37.4220 N, 122.0841 W.
const plex = decodePlusCode('849VCWC8+R9');
near(plex.latitude, 37.422, 0.0002); near(plex.longitude, -122.0841, 0.0002);
assert.equal(encodePlusCode({ latitude: 37.422, longitude: -122.0841 }), '849VCWC8+R9');
assert.equal(encodePlusCode({ latitude: 0, longitude: 0 }), '6FG22222+22');
assert.equal(encodePlusCode({ latitude: 20.3700625, longitude: 2.7821875 }), '7FG49QCJ+2V');
// Full codes that are not codes: a letter outside the alphabet, a single trailing character, padding in the middle, out of range.
for (const bad of ['8FWC2345+G', '8FWC2300+G6', 'WC2345+G', '84900000+', 'FFFFFFFF+FF']) assert.equal(decodePlusCode(bad), null, bad);
// A Ramallah point, encoded to its full code, gives back the same cell.
const full = encodePlusCode(RAMALLAH);
assert.equal(full.length, 11);

// Short codes: the reference point supplies the leading characters (official shortCodeTests: 9C3W9QCJ+2VX from CJ+2VX).
const short = recoverPlusCode('CJ+2VX', { latitude: 51.3701125, longitude: -1.217765625 });
const wanted = decodePlusCode('9C3W9QCJ+2VX');
near(short.latitude, wanted.latitude); near(short.longitude, wanted.longitude);
// Official recovery edge: the nearest cell is off the earth, so the centre stays where it is.
near(recoverPlusCode('CFX22222+22', { latitude: 89.6, longitude: 0 }).latitude, 89.0000625);
// A short code is read against its town. Shortening the Ramallah code keeps the cell, so the town gives back the point.
const shortRamallah = full.slice(4); // four characters, the separator and two more
const recovered = pointOf(`${shortRamallah} Ramallah`);
near(recovered.latitude, decodePlusCode(full).latitude); near(recovered.longitude, decodePlusCode(full).longitude);
assert.deepEqual(pointOf(`${shortRamallah} رام الله`), recovered);
assert.equal(parseSharedLocation(`${shortRamallah} رام الله`).source, 'plus_code');
// A full code takes no town, and its locality is ignored.
assert.equal(parseSharedLocation(`${full} Ramallah`).source, 'plus_code');
// Refused: a short code with no town, with a town we do not serve, and a full code that names no place on the earth.
assert.deepEqual(parseSharedLocation('CWC8+R9'), { error: 'short_plus_code' });
assert.deepEqual(parseSharedLocation(`${shortRamallah} Tel Aviv`), { error: 'short_plus_code' });
assert.deepEqual(parseSharedLocation('FFFFFFFF+FF'), { error: 'bad_plus_code' });
// Full codes served by the app: a point on the Tulkarm side, and one outside the area.
assert.equal(parseSharedLocation(encodePlusCode(TULKARM)).source, 'plus_code');
assert.deepEqual(parseSharedLocation(encodePlusCode({ latitude: 32.794, longitude: 34.9896 })), { error: 'outside_area' });

console.log('Shared location checks passed');
