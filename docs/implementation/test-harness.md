# Test harness

Written 29 October 2026 after the review that found four silently skipped suites, duplicated
suite registrations and a fixed-delay push race. Applies to `tests/` and `scripts/`.

## Gates

| Command | Selects | Needs |
| --- | --- | --- |
| `npm test` | `scripts/run-tests.mjs`: one child per registered suite, first failure exits | SQLite, temp dirs and loopback PostgreSQL with PostGIS; `phone-provider.mjs` uses `WIND_TEST_DATABASE_URL` |
| `npm run test:contracts` | the same runner with `--filter=contracts` (the two frozen contract suites) | as `npm test` |
| `npm run test:persistence` | `scripts/check-persistence.mjs`, then `scripts/check-postgres-legacy.mjs` | the isolated PostgreSQL on `127.0.0.1:55473` |
| `test:scenarios`, `test:readiness`, `test:location`, `test:android-browser` | Playwright journeys | port 4188, the shared web export |
| `phone:server`, `phone:web`, `phone:check` | phone sandbox | port 4191, the attached SM-A5360 |

`npm test` is the only list of suites. `test:contracts` is a filter over it, not a second
registration, so the two gates cannot drift apart.

Use an isolated PostgreSQL instance and port per session (`AGENTS.md`). The examples below describe
the older shared local setup, not permission to use or stop another session's database. Set
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

## Shared resources: serialize these

The local PostgreSQL is shared across worktrees and the browser gates share one port and one build
directory. These resources are process-exclusive:

- **Port 4188** — `test:scenarios`, `test:readiness`, `test:location` and `test:android-browser` all
  bind `127.0.0.1:4188`. Never run two of them at once. `test:scenarios` also exports the shared
  bundle to `.expo/location-review-web` with `--clear`; the other three reuse it. Run
  `test:scenarios` first (or export manually), and do not export while another gate is serving it.
- **Port 4191** — `npm run phone:server` binds `127.0.0.1:4191`; `phone:web` builds against it and
  `phone:check` runs `adb reverse tcp:4191 tcp:4191`. One phone sandbox per machine.
- **Port 55473** — the single local PostgreSQL. Run one `test:persistence` at a time, including
  filtered runs and the legacy harness. Take the machine-wide lock first:

  ```pwsh
  $lock = 'C:\Users\osama\AppData\Local\Temp\opencode\wind-pg-lock'
  $got = $false
  for ($i = 0; $i -lt 240; $i++) {
    if (New-Item -ItemType Directory -Path $lock -ErrorAction SilentlyContinue) { $got = $true; break }
    Start-Sleep 5
  }
  if (-not $got) { throw 'pg lock timeout' }
  npm run test:persistence
  Remove-Item -Recurse -Force $lock
  ```

  Keep `WIND_TEST_DATABASE_URL` on `127.0.0.1`/`localhost` and the `fastship_test` database; the
  legacy fixture rejects anything else.
- **`.expo/` output dirs** — `test:scenarios` (`.expo/location-review-web`, `.expo/scenarios`),
  `test:readiness` (`.expo/readiness`), `phone:web` (`.expo/phone-qa/web`), `test:access`
  (`.expo/access-regression-web`), `test:jobs-ui` (`.expo/jobs-pages-web`), the CI export
  (`.expo/ci-release`) and the legacy generated copies (`.expo/pg-legacy`). Two exporters writing
  the same directory produce a torn bundle or a blank page, so serialize builds as well as servers.

## Evidence rules

- Run each gate as its own command and stop on the first failure.
- A local run is reported as "local worktree fallback". Only the `k5` SSH run is remote evidence;
  never present local output as remote.
- Phone acceptance uses the attached SM-A5360 only, never an emulator or simulator. Keep its backend
  on `adb reverse` and do not clear its Chrome profile.
