// Keep the original suite order; every child failure stops the integration gate.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const suites = [
  "journey-contracts.test.mjs",
  "runtime-config.test.mjs",
  "driver-command.test.mjs",
  "protected-recovery.test.mjs",
  "wire-contracts.test.mjs",
  "map-policy.test.mjs",
  "client-diagnostics.test.mjs",
  "driver-recovery-api.test.mjs",
  "model.test.mjs",
  "presentation.test.mjs",
  "driver-presence-card.test.mjs",
  "driver-presence.test.mjs",
  "driver-presence-runtime.test.mjs",
  "api-client.test.mjs",
  "api-focus.test.mjs",
  "road-approach.test.mjs",
  "opencode.test.mjs",
  "google-maps-loader.test.mjs",
  "api.test.mjs",
  "privacy-location.test.mjs",
  "admin-settings.test.mjs",
  "admin-stats-daily.test.mjs",
  "client-address.test.mjs",
  "unblock-custody.test.mjs",
  "deployment.test.mjs",
  "deployment-probe.test.mjs",
  "registration.test.mjs",
  "entra.test.mjs",
  "entra-result.test.mjs",
  "session-idle.test.mjs",
  "session-recovery.test.mjs",
  "phone-acs.test.mjs",
  "entra-exchange.test.mjs",
  "vehicle-migration.test.mjs",
  "job-alert-migration.test.mjs",
  "exceptions.test.mjs",
  "pickup.test.mjs",
  "courier-block.test.mjs",
  "cash.test.mjs",
  "share.test.mjs",
  "map.test.mjs",
  "map-cache.test.mjs",
  "map-security.test.mjs",
  "route.test.mjs",
  "routing-policy.test.mjs",
  "route-quality.test.mjs",
  "safety.test.mjs",
  "places.test.mjs",
  "schedule.test.mjs",
  "roads.test.mjs",
  "chat.test.mjs",
  "promo.test.mjs",
  "referral.test.mjs",
  "credit.test.mjs",
  "push.test.mjs",
  "push-server.test.mjs",
  "offers.test.mjs",
  "review-fixes.test.mjs",
  "parcels.test.mjs",
  "booking-auth.test.mjs",
  "driver-scope.test.mjs",
  "sqlite-review.test.mjs",
  "customer-rating.test.mjs",
  "driver-destination.test.mjs",
  "jobs-pagination.test.mjs",
  "subscription-migration.test.mjs",
  "change-destination.test.mjs",
  "recipient.test.mjs",
  "driver-signup-alert.test.mjs",
  "email.test.mjs",
  "dependencies.test.mjs",
  "clean-typecheck.test.mjs",
  "background-location.test.mjs",
  "active-gps-client.test.mjs",
  "active-gps-native.test.mjs",
  "location-web-clock.test.mjs",
  "location-permission-timeout.test.mjs",
  "background-permission.test.mjs",
  "customer-location.test.mjs",
  "place-search.test.mjs",
  "place-index.test.mjs",
  "nav-steps.test.mjs",
  "google-routing.test.mjs",
  "google-map-lifecycle.test.mjs",
  "url-decoder.test.mjs",
  "background-registration.test.mjs",
  "phone-test.test.mjs",
  "phone-test-build.test.mjs",
  "phone-test-state.test.mjs",
  "phone-ui.test.mjs",
  "contracts-money.test.mjs",
  "contracts.test.mjs",
  "cross-process-claims.test.mjs",
  "dependency-security.test.mjs",
  "audit-gate.test.mjs",
  "runtime-dependencies.test.mjs",
  "phone-provider.mjs",
  "native-push-sqlite.mjs",
  "dispatch-ranking.test.mjs",
  "dispatch-sqlite.mjs",
  "ride-lifecycle-sqlite.mjs",
  "resource-scope-sqlite.mjs",
  "ledger-sqlite.mjs",
  "payments-sqlite.mjs",
  "activation-gates.mjs",
  "database-logging.test.mjs",
  "azure-infra.test.mjs",
  "ops-sqlite.mjs"
];
// Exempt with the reason it cannot run here. A new tests/*.test.mjs must be listed above or
// exempted here; the guard below fails the gate if one is silently orphaned.
const exempt = new Map([
  ['db-persistence.test.mjs', 'needs live PostgreSQL (WIND_TEST_DATABASE_URL); npm run test:persistence'],
  ['db-api.test.mjs', 'needs live PostgreSQL (WIND_TEST_DATABASE_URL); npm run test:persistence'],
]);
// Selection discipline: every *.test.mjs on disk must be selected or explicitly exempt.
// This is what silently skipped four real suites (REVIEW-2026-10-29, P1 #4).
const onDisk = readdirSync(new URL('../tests/', import.meta.url)).filter(f => f.endsWith('.test.mjs'));
const orphaned = onDisk.filter(f => !suites.includes(f) && !exempt.has(f));
if (orphaned.length) throw new Error('Test files are not selected and not exempt: ' + orphaned.join(', '));
// A repeat would run one suite twice and inflate the gate count.
const repeated = suites.filter((name, index) => suites.indexOf(name) !== index);
if (repeated.length) throw new Error('Suites registered twice: ' + [...new Set(repeated)].join(', '));

const filter = process.argv.find(value => value.startsWith('--filter='))?.slice('--filter='.length);
const selected = suites.filter(name => !filter || name.includes(filter));
if (!selected.length) throw new Error('No tests match the requested filter');
for (const name of selected) {
  const result = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning',
    fileURLToPath(new URL('../tests/' + name, import.meta.url))], { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Integration gate: ' + selected.length + ' suites passed');
