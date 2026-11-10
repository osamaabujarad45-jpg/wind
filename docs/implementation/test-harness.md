# Test harness

Written 29 October 2026 after the review that found four silently skipped suites, duplicated
suite registrations and a fixed-delay push race. Applies to `tests/` and `scripts/`.

## Gates

| Command | Selects | Needs |
| --- | --- | --- |
| `npm test` | `scripts/run-tests.mjs`: one child per registered suite, first failure exits | SQLite, temp dirs and loopback PostgreSQL with PostGIS; subscription-migration and database-logging suites connect through `WIND_TEST_DATABASE_URL` |
| `npm run test:contracts` | the same runner with `--filter=contracts` (the four registered suites whose names contain `contracts`) | as `npm test` |
| `npm run test:persistence` | `scripts/check-persistence.mjs`, then `scripts/check-postgres-legacy.mjs` | this session's isolated loopback PostgreSQL, selected with `WIND_TEST_DATABASE_URL` |
| `test:scenarios`, `test:readiness`, `test:location`, `test:android-browser` | Playwright journeys | port 4188, the shared web export |
| `phone:server`, `phone:web`, `phone:check` | phone sandbox | port 4191, the attached SM-A5360 |

`npm test` is the only list of suites. `test:contracts` is a filter over it, not a second
registration, so the two gates cannot drift apart.

Use an isolated PostgreSQL instance, data directory and port per session (master plan §3 rule 9). Set
`WIND_TEST_DATABASE_URL=postgresql://fastship_test@127.0.0.1:<your-port>/fastship_test`; see
`local-database.md`. CI supplies PostgreSQL 18 / PostGIS 3.6 to both integration and persistence jobs.

## Selection discipline

- Every `tests/*.test.mjs` on disk must be in `suites`, or in `exempt` with the reason it cannot
  run here. The only exemptions are `db-persistence.test.mjs` and `db-api.test.mjs`: both need a
  live PostgreSQL and are run by `test:persistence`.
- The runner refuses to start when a file is neither selected nor exempt, or when a suite is
  registered twice. The final `Integration gate: N suites passed` is therefore a true count.
- To add a suite, add its filename to `suites` (non-`.test.mjs` suites are allowed there) and keep
  it self-contained: own temporary database or directory, bind port `0` for HTTP fixtures.
- Never import one test file from another. The importer runs its assertions and the runner runs
  them again under a second name. Shared helpers belong in `tests/support/`.

## Deterministic push assertions

`tests/push-server.test.mjs` used to sleep 50 ms after each request and then assert what had been
sent. Delivery runs after the HTTP response (`sendPush` hands each subscription to
`persistence.detached()`), so that wait was a race: a slow machine lost the push and a fast one
could hide an extra one. The suite now records every `persistence.detached()` promise and awaits
the set until no delivery is in flight. A regression that queues an unexpected push reaches
`sent` and fails the assertion instead of escaping after the check.

`scripts/check-postgres-legacy.mjs` generates a PostgreSQL copy of this suite: it injects the
fixture's `drainOutbox` and rewrites a marked fixed-delay line. The marker must stay in the source,
or the transform refuses it. The generated copy's `settle` calls `drainOutbox` when it exists and
waits for the durable outbox; the SQLite suite has no outbox and waits only for the detached
promises. The marker is compatibility, not dead code.

## PostgreSQL cleanup ownership

`tests/support/pg-test-server.mjs` creates one schema per legacy suite:
`wp03_legacy_<32 hex>`. `shutdown()` closes the server and fixture pools, then drops exactly that
schema with `DROP SCHEMA IF EXISTS ... CASCADE`. The initialization-failure path does the same. A
guard regex refuses any other name, and the database `fastship_test` and the `public` schema are
never touched. Suites outside this fixture manage their own schemas; do not add a shared
"drop everything" helper.

## Resource ownership and serialization

Each session owns its source/export directory and PostgreSQL instance. Within that session,
serialize gates that reuse ports or output directories. Check the machine's listeners before
starting a fixed-port server; a busy port is not permission to stop another session.

- **Port 4188** — `test:scenarios`, `test:readiness`, `test:location` and `test:android-browser` all
  bind `127.0.0.1:4188`. Never run two of them at once. `test:scenarios` also exports the shared
  bundle to `.expo/location-review-web` with `--clear`; the other three reuse it. Run
  `test:scenarios` first (or export manually), and do not export while another gate is serving it.
- **Port 4191** — `npm run phone:server` binds `127.0.0.1:4191`; `phone:web` builds against it and
  `phone:check` runs `adb reverse tcp:4191 tcp:4191`. One phone sandbox per machine. When the
  sandbox is on the test PC, SSH-forward it to the local port before applying the phone reverse.
- **PostgreSQL** — choose an unused loopback port and a new data directory. `55473` in older
  examples belongs to the historical shared setup; it is not a session allocation. The November 10
  Astra baseline owns `D:\wind-plan-20261110-astra` and port `55493` on `DESKTOP-S2JKMK5`.
  Set `WIND_TEST_DATABASE_URL=postgresql://fastship_test@127.0.0.1:<your-port>/fastship_test`.
  Run one persistence gate at a time against that instance. Start/stop only your own cluster;
  schema isolation does not make stopping a shared database safe. Keep the URL on loopback and
  the database named `fastship_test`; the legacy fixture rejects other targets.
- **`.expo/` output dirs** — `test:scenarios` (`.expo/location-review-web`, `.expo/scenarios`),
  `test:readiness` (`.expo/readiness`), `phone:web` (`.expo/phone-qa/web`), `test:access`
  (`.expo/access-regression-web`), `test:jobs-ui` (`.expo/jobs-pages-web`), the CI export
  (`.expo/ci-release`) and the legacy generated copies (`.expo/pg-legacy`). Two exporters writing
  the same directory produce a torn bundle or a blank page, so serialize builds as well as servers.

## Evidence rules

For `test:android-browser` on the test PC with the phone attached locally, reserve local and
remote port `4188` plus CDP port `9228`. From the PC the phone is attached to, forward local `4188` to the test PC's `4188`
(`ssh -L 4188:127.0.0.1:4188`), reverse the
phone's `4188` to local `4188`, forward local `9228` to `chrome_devtools_remote`, then SSH-reverse
local `9228` to the test PC's `9228` (`ssh -R 9228:127.0.0.1:9228`). Open Chrome's unique
`http://localhost:4188/auth?phoneCheck=<id>` URL with the harness-bound device command. Set
`WIND_ANDROID_BROWSER_TARGET` to that exact URL when running `npm run test:android-browser`
remotely; the runner navigates to it after starting its API and closes only that test tab.
Inspect existing listeners and forward mappings first; never replace another session's mapping.
The default local runner still launches through `adb`; agent sessions use the explicit target
and their supported device launcher. Neither path clears Chrome's profile.

- Run each gate as its own command and stop on the first failure.
- A local run is reported as "local worktree fallback". Remote evidence names the actual SSH
  machine, session directory, source SHA, command and exit code (`DESKTOP-S2JKMK5` for the
  November 10 baseline). An alias alone is not evidence of where a command ran.
- Phone acceptance uses the attached SM-A5360 only, never an emulator or simulator. Keep its backend
  on `adb reverse` and do not clear its Chrome profile.
