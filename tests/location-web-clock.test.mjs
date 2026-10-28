import assert from 'node:assert/strict';
import { createLocationWebClock } from '../src/location-web-clock.ts';

const clock = createLocationWebClock();
clock.observe(100_000);
clock.attempted(1_000);
clock.accepted(100_000, 1_000);
assert.equal(clock.isNew(100_000), false);
assert.equal(clock.observe(40_000), true);
assert.equal(clock.isNew(40_000), true, 'new measurements resume after wall clock rollback');
assert.equal(clock.sinceAttempt(2_000), 1_000, 'rollback cannot bypass monotonic request cadence');
assert.equal(clock.sincePublished(16_000), 15_000, 'heartbeat follows elapsed time');
clock.accepted(40_000, 16_000);
assert.equal(clock.isNew(40_000), false, 'duplicate filtering resumes after rollback');
console.log('PASS web location monotonic pacing and clock rollback');
