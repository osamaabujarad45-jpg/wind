import assert from 'node:assert/strict';
import { isValidPhone, nearestCity, nextStatus, sampleQuote, statusFlow } from '../src/model.ts';

for (const ok of ['0599123456', '056-912-3456', '+970599123456', '00970569123456', '٠٥٩٩١٢٣٤٥٦']) assert.ok(isValidPhone(ok), ok);
for (const bad of ['', '0521234567', '059912345', '+9705991234567']) assert.ok(!isValidPhone(bad), bad);

assert.equal(sampleQuote('parcel', 'ramallah', 'bireh', 'small'), 18);
assert.equal(sampleQuote('freight', 'nablus', 'hebron', 'large'), 270);
assert.equal(sampleQuote('freight', 'nablus', 'hebron', 'large', true), 162);
assert.equal(nextStatus('completed'), 'completed');
assert.equal(nextStatus('assigned'), 'at_pickup');
assert.equal(new Set(statusFlow).size, statusFlow.length);
assert.equal(nearestCity({ latitude: 31.9038, longitude: 35.2034 }), 'ramallah');
console.log('Model checks passed');
