# Safety net & release review

## Verdict

The individual test files are unusually good — I could not find one that asserts nothing, skips itself, or swallows a failure — so the false green is in the *selection* layer: `npm test` runs a hand-maintained list, the whole PostgreSQL/outbox half of the suite is outside CI, and the Docker-copy guard that exists to prevent a repeat of the 5 Oct outage cannot see nested server modules. Release config is mostly sound (HTTPS guard, signing guard, SHA-pinned actions, `npm audit` currently 0 high), but the Android versionCode is not in the repo and no CI job ever builds the image it deploys. Fixing findings 1–3 converts the gate from "green because it looked at the wrong files" to green because it looked at all of them.

## Findings

### [P1] Docker module-copy guard never reads `server/domain/*.ts`, so the 5 Oct deploy failure can happen again with the guard green
- Where: `tests/deployment.test.mjs:43`, `tests/deployment.test.mjs:48`
- Code:
  ```js
  const needed = new Set(), queue = readdirSync(new URL('server/', root)).filter(f => f.endsWith('.ts')).map(f => `server/${f}`);
  ...
  if (target.startsWith('src/') && !needed.has(target)) { needed.add(target); queue.push(target); }
  ```
- Why it matters: the comment above it (`:38-39`) says this check exists because "a deploy failed its health check because server/main.ts started importing src/map-math.ts". The loop only ever *scans* the non-recursive `server/*.ts` files: any import whose target is not under `src/` is dropped instead of queued, so `server/domain/*.ts`, `server/db/*.ts` and `server/*` subdirectories are never opened. Five nested modules already import `../../src/model.ts` (`server/domain/statistics.ts:1`, `route-quality.ts:1`, `eligibility.ts:3`, `realtime.ts:5`, `destination-change.ts:3`); they pass only because `model.ts` happens to be copied for `main.ts`.
- Failure scenario: a developer adds `import { haversine } from '../../src/geo.ts'` to `server/domain/dispatch.ts`. `npm test` passes (the guard never reads that file), CI passes, `docker build` passes (the Dockerfile copies only `src/model.ts` and `src/map-math.ts`). The Railway container then dies at module resolution: `/api/ready` never returns 200, the health check fails, and the release is rolled back or the service is down for the duration.
- Fix: seed the queue with `readdirSync(new URL('server/', root), { recursive: true })` filtered to `.ts`, and push every relative `.ts` target (not only `src/`) so nested server files are scanned; finish with `assert.equal(scanned.size, allServerFiles.length)` so a future skip is visible.
- Confidence: HIGH

### [P1] `npm test` runs a hardcoded list of 78 names; four real `*.test.mjs` files and any new test file are silently never run
- Where: `scripts/run-tests.mjs:5`, `scripts/run-tests.mjs:88`
- Code:
  ```js
  const suites = [
    "model.test.mjs",
  ...
  for (const name of selected) {
  ```
- Why it matters: nothing globs `tests/`. A new `tests/settle-race.test.mjs` is invisible to `npm test`; it must be hand-added or it never runs. Four files whose names end in `.test.mjs` are already outside the list: `tests/db-persistence.test.mjs`, `tests/db-api.test.mjs`, `tests/database-logging.test.mjs`, `tests/azure-infra.test.mjs` (the last is run only by the path-filtered Azure workflow). The runner prints `Integration gate: 78 suites passed` while 130 `.mjs` files sit in `tests/`.
- Failure scenario: a fix for the Postgres adapter updates `tests/db-api.test.mjs` and `tests/db-persistence.test.mjs`; both are green on the author's machine (via `test:persistence`), `npm test` never executes them, CI is green, and the regression ships. Same for any newly added test file that the author forgets to register — the gate cannot tell the difference between "no test" and "test not run".
- Fix: `const files = readdirSync('tests').filter(f => f.endsWith('.test.mjs'))` plus an explicit `pgOnly` set (`db-api`, `db-persistence`, `database-logging`) for the alternate runner; assert the union of both lists equals the directory listing so an unregistered file fails the gate.
- Confidence: HIGH

### [P1] CI never runs `test:persistence`, so the PostgreSQL adapter and the outbox/push worker are ungated — including the uncommitted `server/worker.ts` change
- Where: `.github/workflows/ci.yml:22`, `scripts/check-persistence.mjs:5`
- Code:
  ```yaml
        - run: npm test
  ```
  ```js
  const tests = ['db-persistence.test.mjs', 'db-api.test.mjs', 'pg-dialect.mjs', 'pg-memo.mjs',
    'pg-contracts.mjs', 'pg-import.mjs', 'pg-claims.mjs', 'pg-cash.mjs', 'pg-offers.mjs',
  ```
- Why it matters: `npm test` is the SQLite/unit half (78 suites). The 52 files in `check-persistence.mjs` — the only place the real `Persistence` on PostgreSQL, `server/worker.ts` outbox delivery (`tests/outbox.mjs`), `tests/native-push.mjs`, `tests/pg-memo.mjs` and `tests/db-persistence.test.mjs` run — are invoked by no workflow; `grep` finds no `services:`/`postgres` in `.github/`. The current working-tree refactor replaces the webpush allow-list with `PUSH_KINDS` (`server/worker.ts:76`) and is tested only by `tests/outbox.mjs:110`.
- Failure scenario: a kind is dropped from `PUSH_KINDS`. `npm test` stays green because `native-push-sqlite.mjs` never enqueues the new kind; in production those pushes retry eight times and park as `attempts_exhausted`, so drivers silently stop receiving `destination_request`/`assignment` notifications. Nobody finds out until a support ticket.
- Fix: add `services: postgres: image: postgres:16, ports: ['55473:5432'], env: ...` to the `verify` job (the suites already default to `postgresql://fastship_test@127.0.0.1:55473/fastship_test`) and `- run: npm run test:persistence` after `npm test`, at minimum for PRs touching `server/**`, `tests/**` and `package-lock.json`.
- Confidence: HIGH

### [P2] No CI job builds the Docker image that is actually deployed
- Where: `.github/workflows/ci.yml:24`, `tests/deployment.test.mjs:17`
- Code:
  ```yaml
        - name: Export release bundles for Android, iOS and web
          run: npx expo export --platform all --output-dir .expo/ci-release
  ```
  ```js
  assert.match(build, /^ARG EXPO_PUBLIC_API_URL$/m, 'Release origin must be supplied by the deployment');
  ```
- Why it matters: the Dockerfile is validated by regexes over its text, never executed. Everything that differs between the CI host and the image — `.dockerignore` whitelist misses, `npm ci` against the `file:` vendor copies, `npx expo export` under `--max-old-space-size=768`, the `runtime-dependencies.mjs` copy — is discovered by Railway at deploy time, not by the gate.
- Failure scenario: `Dockerfile` gains `COPY scripts/some-check.mjs` but `.dockerignore` still whitelists only `scripts/runtime-dependencies.mjs`; `docker build` fails in Railway after the PR merged, so the release cannot ship until a second commit fixes the context. Or the 768 MB Metro heap OOMs on the image's Node 24 and the deploy loops.
- Fix: add a `docker` job after `verify`: `docker build --build-arg EXPO_PUBLIC_API_URL=https://ci.invalid -t wind:ci .` — no push, no secrets.
- Confidence: HIGH

### [P2] Five suites wait a fixed 50 ms for detached push delivery before asserting
- Where: `tests/push-server.test.mjs:23`, `tests/push-server.test.mjs:76`
- Code:
  ```js
  const settle = () => new Promise(resolve => setTimeout(resolve, 50));
  ...
  await settle();
  assert.deepEqual(sent.map(s => s.url), [fcm('d')]);
  ```
- Why it matters: the same helper is copy-pasted into `parcels.test.mjs:22`, `driver-scope.test.mjs:21`, `driver-destination.test.mjs:21`, `driver-signup-alert.test.mjs:20`, and `push-server.test.mjs` calls it ~35 times. The push is a `persistence.detached(...)` effect (`server/main.ts:917`), so the assertion races the event loop by design. A green run here took 4.1 s total, i.e. no margin statement — a buried runner simply returns one push late.
- Failure scenario: on a loaded 2-core GitHub runner the outbox flush occasionally lands after the 50 ms window; `sent` is `[]` and the suite fails with a diff that looks like a delivery bug. The standard response is "rerun", which is how a red gate stops being a signal.
- Fix: replace `settle()` with the poll already used in `tests/email.test.mjs:33-37` — `for (let i = 0; i < 100 && sent.length < n; i++) await new Promise(r => setTimeout(r, 20))` then assert, with a 2 s ceiling. Delete the five copies of the helper.
- Confidence: HIGH

### [P2] The Android release version is not in the repo: no `versionCode` in app.json, remote EAS counter, generated project says 1
- Where: `app.json:17`, `eas.json:3`, `android/app/build.gradle:95`
- Code:
  ```json
  "android": {
    "package": "ps.wind.app",
    "allowBackup": false,
  ```
  ```json
  "cli": { "appVersionSource": "remote" },
  ```
  ```gradle
          versionCode 1
          versionName "1.0.0"
  ```
- Why it matters: `app.json` says `version: "1.0.13"` but carries no `versionCode`; `android/` is git-ignored (`git check-ignore` / `.gitignore:46`), so the only version truth is EAS's remote counter. The `with-release-guard` plugin explicitly supports signing a local release from `WIND_KEYSTORE`/`WIND_STORE_PASSWORD`/... (`plugins/with-release-guard.js:7-14`), and every such `expo run:android`/prebuild build gets `versionCode 1` from the template. REVIEW-2026-10-07's "code 11" cannot be reproduced or audited from source.
- Failure scenario: an operator builds a signed release locally (the documented fallback when EAS is unavailable) and uploads it. Play rejects it as a duplicate versionCode if 1 was ever used, or, once EAS has incremented to 11+, rejects it as a downgrade — after the APK/AAB has been built and signed, at the last step of a release.
- Fix: add `"versionCode": 12` under `expo.android` in `app.json`, bump it with each release commit, and either set `appVersionSource: "local"` or document that local builds must pass `--version-code` explicitly.
- Confidence: MEDIUM

### [P2] Four browser gates hardcode port 4188 and share one build directory, so two of them cannot run at once
- Where: `scripts/check-scenarios.mjs:15`, `scripts/check-scenarios.mjs:19`, `scripts/check-readiness.mjs:12`, `scripts/check-readiness.mjs:16`, `scripts/check-customer-location.mjs:8`, `scripts/check-customer-location.mjs:14`
- Code:
  ```js
  const base = 'http://localhost:4188';
  process.env.WEB_ROOT = join(root, '.expo/location-review-web');
  ...
  await new Promise(r => server.listen(4188, '127.0.0.1', r));
  ```
- Why it matters: `test:scenarios`, `test:readiness`, `test:location` and `test:android-browser` all bind `127.0.0.1:4188` and all serve `.expo/location-review-web`. They are the only checks that exercise real UI journeys — and none of them is in a workflow, so the "browser checks cover Arabic/English sign-in, home, parcel booking..." claim in REVIEW-2026-10-07 rests on someone running them serially by hand.
- Failure scenario: a developer runs `npm run test:readiness` in one terminal while `npm run test:scenarios` rebuilds the bundle in another (`--clear` at `check-scenarios.mjs:24`). The second process dies with `EADDRINUSE`, or the readiness run serves a directory being deleted and fails on a blank page — a false red that costs an hour before anyone suspects the ports.
- Fix: `server.listen(0, '127.0.0.1')` then read `server.address().port` into `base` (the scripts already do exactly this for the OSRM fixture), and give each script its own directory (`.expo/scenarios-web`, `.expo/readiness-web`).
- Confidence: HIGH

### [P3] `presentation.test.mjs` imports another test file, so one suite runs twice per gate
- Where: `tests/presentation.test.mjs:2`
- Code:
  ```js
  import './customer-location.test.mjs';
  ```
- Why it matters: `customer-location.test.mjs` is already a registered suite (`scripts/run-tests.mjs:62`), so its assertions execute twice per gate; a failure inside it is reported under two different suite names, which makes triage and the "78 suites passed" count misleading. It also means presentation's process now depends on customer-location's top-level waits.
- Failure scenario: `customer-location.test.mjs` later needs a server or a temp DB; presentation.test.mjs starts failing at import with a side effect it never asked for, and the fix is not obvious from the failing suite's name.
- Fix: delete line 2. If the intent was to guarantee it runs, that belongs in the runner list, which already has it.
- Confidence: HIGH

### [P3] The DoS regression for the vendored URL decoder is enforced by a 3-second wall clock
- Where: `tests/url-decoder.test.mjs:15`
- Code:
  ```js
  const child = spawnSync(process.execPath, ['-e', `...`], { timeout: 3000, encoding: 'utf8' });
  ...
  assert.equal(child.error, undefined, child.error?.message);
  ```
- Why it matters: the test is the only thing standing between the app and GHSA-vcc3-ghjq-m6fr, and it fails on `child.error` — which is set for a timeout as well as for a real stall. Node start-up + `require` + a 25 000-iteration loop on a cold, shared runner can approach 3 s, so the security regression can fail for a reason unrelated to the fix, and the message (`child.error?.message`) does not distinguish "timed out" from "crashed".
- Failure scenario: CI on a throttled runner times out the child; the suite fails with `spawnSync ETIMEDOUT`; the next commit "fixes" it by deleting the test or raising the timeout without checking.
- Fix: raise to `10_000`, keep the process deadline, and assert `child.signal === null && child.status === 0` separately from `child.error` so a timeout is reported as a timeout.
- Confidence: MEDIUM

### [P3] Every persistence run creates a new Postgres schema and never drops it
- Where: `tests/db-persistence.test.mjs:8`, `tests/db-persistence.test.mjs:138`, `tests/db-api.test.mjs:8`
- Code:
  ```js
  const schema = `wp02_boundary_${randomUUID().replaceAll('-', '')}`;
  ...
  await bootstrap.run(`CREATE SCHEMA ${schema}`);
  ```
  ```js
  } finally { await pg.close(); }
  ```
- Why it matters: the comment on line 1 says schemas are retained "for inspection", but nothing ever removes them, and `db-api.test.mjs` does the same (`wp02_api_<uuid>`). Each `test:persistence` run leaves two full schemas (tables, sequences, triggers) in `fastship_test`. The `pg-import`/legacy suites use `pg_dump`-style enumeration, so this database grows monotonically on every developer machine and would grow on every CI run once finding 3 is fixed.
- Failure scenario: after a few hundred runs the local test database has hundreds of schemas; `test:persistence` slows down and `pg-import`'s 30 s `pg_dump` timeout (already recorded as a flake in `docs/implementation/WP10.md`) starts firing more often.
- Fix: in the same `finally`, `await new Persistence({ connectionString }).run('DROP SCHEMA ... CASCADE')` (or drop at start if present); keep the report/reconciliation JSON as the inspection artifact instead of the live schema.
- Confidence: HIGH

## Suspicions (unverified)

- **deepmerge's own `__proto__` key survives as data.** The patch (`vendor/deepmerge/index.js:58/67/69`) is a correct fix for the internal assignment, but it converts the payload into an own enumerable `__proto__` property — and `tests/dependency-security.test.mjs:21-22` asserts exactly that. Any downstream consumer that copies the merged object with `Object.assign(target, merged)` (rather than spread or JSON) will still hit the setter and set `target`'s prototype. Expo's config merge does not appear to do that, so I could not build an exploit; verify before treating the advisory as closed.
- **EAS submit has no non-interactive Android target.** `eas.json:16` is `"production": {}` with no `android.track`/`serviceAccountPath`, and the `pilot` profile at `:17-21` has no matching `build.pilot` profile. `eas submit --profile production -p android` will prompt for a track; scripted submissions will hang. Low impact if submission is always manual.
- **`react-native-maps` is added unconditionally** (`app.config.js:49`) while the Android map is MapLibre in a WebView and no key is normally set. `with-release-guard.js:43-47` strips the empty `com.google.android.geo.API_KEY` meta-data, but I did not verify on a device that the Google Maps SDK is not linked into the release AAB (size/permission surface).
- **`tests/dependencies.test.mjs` only proves `xcode.generateUuid()` formats a UUID.** It is the sole dependency test inside `npm test`; it never asserts the resolved `uuid` major, so a future dedupe back to uuid 7 would still pass this file (the consuming-interface behaviour might not).

## What I checked and found clean

- No `.skip`, `.only`, `todo`, or conditional `process.env` early-return anywhere in `tests/`; no empty `catch` around assertions (the only swallowed error is `tests/db-persistence.test.mjs:113`, immediately followed by the assertion that proves the transaction aborted).
- The runner does **not** aggregate: `scripts/run-tests.mjs:92` is `if (result.status !== 0) process.exit(result.status ?? 1)`, so the first failing child fails the gate (and a signal-killed child exits 1).
- Server-side booking double-submit is covered: `tests/api.test.mjs:77-82` fires two concurrent `POST /orders` with one `requestId` and asserts one id, a reordered body, and a 409 on a changed payload; `tests/commands.mjs:100-103` does the same across two API processes and asserts exactly one `command_results` row.
- Concurrent money settle is covered: `tests/commands.mjs:70-74` races two remittances and asserts `[200, 400]`; `tests/cash.test.mjs:137-140` settles and confirms with the owed balance reaching 0.
- Concurrency on dispatch/lifecycle: `tests/dispatch-races.mjs:55-66` (one winner of N), `tests/cross-process-claims.test.mjs:59-65`, `tests/ride-lifecycle-races.mjs:30-53`.
- Contract fixtures cannot self-update in CI: `tests/contracts.test.mjs:293-299` writes only with `--record`, otherwise `assert.deepEqual` against `docs/implementation/contracts/`.
- `tests/deployment-probe.test.mjs:38-48` genuinely fails six injected deployment defects (HTML `/ready`, old API shape, missing route, stale map, wrong bundle origin, external script).
- `tests/clean-typecheck.test.mjs` really re-runs `tsc` from a scratch config without `expo-env.d.ts`; `npm run typecheck` (9.7 s) and `npm run lint` both pass on this tree.
- Vendor overrides resolve and dedupe: `npm ls` shows `deepmerge@4.3.1 -> vendor`, `decode-uri-component@0.5.0 -> vendor`, `node-forge@1.4.0 -> vendor`, `zod@4.6.7` deduped; `node_modules/node-forge` is a junction whose `lib/rsa.js` hash equals `vendor/node-forge/lib/rsa.js`, so the patch reaches the consumer.
- The node-forge guard (`vendor/node-forge/lib/rsa.js:1176-1178`) is logically correct for `DigestAlgorithm ::= SEQUENCE { OID, params OPTIONAL }`, and the forgery vector is exercised behaviourally (`tests/dependency-security.test.mjs:98-105`), not just by source regex.
- The deepmerge patch is applied to both `dist/cjs.js` and `dist/umd.js`, and the test drives the real `@expo/config` consumer plus the browser bundle in a VM.
- The uncommitted `db.memo` change is safe: `Persistence.memo` is per-request (`server/db/persistence.ts:83,97-107`) and is cleared by `run` (`:153`), `exec` (`:172`) and scope end; a rejected read is evicted (`:104`).
- The uncommitted `server/worker.ts` refactor is behaviour-preserving: the removed inline webpush block and `validate()` (`server/worker.ts:72-93`) have identical user/kind/path/TTL/order guards.
- `npm audit --audit-level=high` is genuinely green (0 high, 0 critical, 7 low), so `ci.yml:23` is not a permanently red step.
- No secrets in workflows; both actions are commit-SHA pinned; `permissions: contents: read`.
- `.dockerignore`/`.railwayignore` order is asserted by `tests/deployment.test.mjs:21-34` (`**/node_modules` last, vendor included before `npm ci`).
- Test isolation is otherwise good: every DB suite uses `mkdtemp`, every API suite binds `:0`, and env mutation happens in child processes.
