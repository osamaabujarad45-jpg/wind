// Uses the isolated database configured by WIND_TEST_DATABASE_URL (local launcher by default).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const tests = ['journey.mjs', 'db-persistence.test.mjs', 'db-api.test.mjs', 'pg-dialect.mjs', 'pg-memo.mjs',
  'pg-contracts.mjs', 'pg-import.mjs', 'pg-migration-lock.mjs', 'pg-claims.mjs', 'pg-cash.mjs', 'pg-offers.mjs', 'pg-jobs-pagination.mjs',
  'pg-customer-rating.mjs', 'pg-email.mjs', 'database-logging.test.mjs',
  'cross-process-claims.test.mjs', 'runtime-dependencies.test.mjs',
  'commands.mjs', 'commands-sqlite.mjs', 'events.mjs', 'outbox.mjs',
  'coverage.mjs', 'capacity.mjs', 'eligibility.mjs', 'eligibility-legacy.mjs', 'eligibility-review.mjs', 'pg-live-commit.mjs',
  'phone-identity.mjs', 'phone-identity-limits.mjs', 'phone-identity-recovery.mjs', 'phone-identity-authority.mjs',
  'review-security-admission.mjs', 'review-security-lease.mjs', 'review-security-migration.mjs', 'presence-migration.mjs', 'presence.mjs', 'driver-presence-api.mjs', 'active-gps.mjs',
  'quotes.mjs', 'quotes-routing.mjs', 'native-push.mjs', 'realtime-auth.mjs',
  'dispatch-migration.mjs', 'dispatch.mjs', 'dispatch-races.mjs', 'ride-lifecycle.mjs', 'ride-lifecycle-races.mjs', 'resource-scope.mjs', 'private-objects.mjs', 'ledger.mjs', 'payments.mjs', 'ops.mjs'];
const filter = process.argv.find(value => value.startsWith('--filter='))?.slice('--filter='.length);
const selected = tests.filter(name => !filter || name.includes(filter));
if (!selected.length) throw new Error('No persistence tests match the filter');
for (const test of selected) {
  const result = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning',
    fileURLToPath(new URL(`../tests/${test}`, import.meta.url))], { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (!filter) {
  const legacy = spawnSync(process.execPath, [fileURLToPath(new URL('./check-postgres-legacy.mjs', import.meta.url))],
    { stdio: 'inherit', windowsHide: true });
  if (legacy.error) throw legacy.error;
  if (legacy.status !== 0) process.exit(legacy.status ?? 1);
}
