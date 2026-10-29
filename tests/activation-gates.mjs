import assert from 'node:assert/strict';
import { ledgerConfig } from '../server/domain/ledger.ts';
import { paymentsConfig } from '../server/domain/payments.ts';
import { objectsConfig } from '../server/domain/private-objects.ts';
import { eligibilityDefaults, dispatchEnabled } from '../server/domain/eligibility.ts';
import { boardingEnabled } from '../server/domain/ride-lifecycle.ts';

assert.deepEqual(ledgerConfig(), { projectedCashCapMinor: 100000, cashCapActivated: false });
assert.deepEqual(paymentsConfig({}), { testFake: false });
assert.deepEqual(objectsConfig({}), { testFake: false, blobConfigured: false });
for (const key of ['cashCapActivated', 'futureDispatchActivated', 'futureBoardingChallengeActivated', 'insertionOptimization', 'guaranteedReservation']) {
  assert.equal(eligibilityDefaults[key], false, `${key} must default to off`);
}
assert.equal(eligibilityDefaults.projectedCashCapMinor, 100000);

for (const [flag, enabled] of [
  ['WIND_PAYMENTS_TEST_ONLY', env => paymentsConfig(env).testFake],
  ['WIND_OBJECTS_TEST_ONLY', env => objectsConfig(env).testFake],
  ['WIND_DISPATCH_TEST_ONLY', dispatchEnabled],
  ['WIND_BOARDING_TEST_ONLY', boardingEnabled],
]) {
  for (const env of [{}, { NODE_ENV: 'test' }, { [flag]: '1' },
    { NODE_ENV: 'production', [flag]: '1' }, { NODE_ENV: 'test', [flag]: '0' }]) {
    assert.equal(enabled(env), false, `${flag} requires both test environment and explicit 1`);
  }
  assert.equal(enabled({ NODE_ENV: 'test', [flag]: '1' }), true, `${flag} enables only the test path`);
}
console.log('activation gates: defaults off and test-only overrides verified');
