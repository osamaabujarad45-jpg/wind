# Fastship / Wind — final classification report

**Report date:** 2026-11-13  
**Mode:** read-only independent audit; local fallback runs on Windows, Node v24.12.0; not k5, CI, physical device, or production  
**Audited root:** branch `master`, HEAD `b60922952d607f698eee24b9c68ac3394daecd3c` (dirty tree with pre-existing modifications)  
**Overall decision (CONFIRMED, stands):** NO-GO for trusted release, payment activation, production PostgreSQL cutover, or multi-instance scaling.

---

## 1. Classification table — material report findings

Legend: **[F]** fresh execution, **[S]** source inspection, **[B]** blocked/environment, **[I]** inference, **[R]** public research.

| # | Finding | Classification | Exact citations | Evidence class |
|---|---------|----------------|-----------------|----------------|
| 1 | Seven TypeScript errors in `server/domain/opencode.ts` (spawn child-process handle typed as `never`) | **CONFIRMED** (diagnostic scan only) | `typecheck-current.log:1-14` — TS2769 line 54 (`NODE_ENV` missing in `ProcessEnv`); TS2339 `never` property errors at lines 59 (`kill`), 61 (`stdout`), 62 (`stderr`), 63 (`kill`), 67 (`once`), 68 (`once`). Source: `server/domain/opencode.ts:53-68` (`spawn(...)` result used as `cp.kill`, `cp.stdout.on`, `cp.stderr.on`, `cp.once`). | [F] isolated `tsc -p tsconfig.audit.json --noEmit`; [S] source inspection |
| 2 | Booking command-loss defect — catch block clears persisted command for broad 4xx including post-lock `quote_consumed` (409), orphaning an order a first POST may already have committed | **CONFIRMED** (reproducible product defect) | `integration-current.log:102-114` — `AssertionError ... quote_consumed 409 ... true !== false` at `tests/booking-retry-race.test.mjs:97:12`. Source: `src/app/book.tsx:371-385` (catch clears command for `e.status < 500` excluding only `401,408,429,idempotency_conflict` at line 379-381). | [F] fresh regression; [S] source inspection |
| 3 | `clean-typecheck.test.mjs` fails with `spawnSync ... ETIMEDOUT` after ~60s, `signal: SIGTERM`, `pid 9908` | **CONFIRMED** as harness/resource failure; **REFUTED** as typecheck evidence | `integration-current.log:141-168` — `Error: spawnSync C:\Program Files\nodejs\node.exe ETIMEDOUT` at `tests/clean-typecheck.test.mjs:18:3`, duration `60451.3211ms`. | [F] fresh execution |
| 4 | Four PostgreSQL suites blocked by `ECONNREFUSED 127.0.0.1:55473` | **CONFIRMED** as environment-blocked (not product defects) | `integration-current.log:235-247` (database-logging, persistence.ts:187/265/85, test:21), `:259-270` (db-api, persistence.ts:141/159, test:10), `:283-294` (db-persistence, test:10), `:726-740` (subscription-migration, postgres-schema.ts:14, pg-support.mjs:14, test:56). | [F] fresh execution; [B] blocked |
| 5 | `parcels.test.mjs` flaky — initial parallel run `read ECONNRESET`; isolated rerun passes | **CONFIRMED** as unresolved flakiness; **REFUTED** as reliably passing | `integration-current.log:507-528` — `Test request failed: /orders`, `read ECONNRESET` at `tests/support/api.mjs:18` / `tests/parcels.test.mjs:100`, duration `9952.1296ms`. `parcels-rerun.log` — isolated rerun `pass 1, fail 0, 2087ms`. | [F] fresh execution (both runs) |
| 6 | NO-GO decision | **CONFIRMED** (stands) | `HANDOFF.md:5` — NO-GO for trusted release, payment activation, production PostgreSQL cutover, multi-instance scaling. | [S]/[I] audit conclusion |
| 7 | `typecheck-application.mjs` exists and is the typecheck gate | **REFUTED** | File does not exist — glob of `research_notes/fable-52-verified-execution-2026-11-13/` confirmed absent. Canonical typecheck is `tsc --noEmit && tsc --noEmit -p tsconfig.server.json`. | [S] file-system check |
| 8 | Direct `node --test` over all 99 root `tests/*.test.mjs` is the canonical release gate | **REFUTED** | Noncanonical: includes registry-exempt PostgreSQL files (`db-api`, `db-persistence`, `database-logging`, `subscription-migration`) and excludes registry-only `.mjs` suites (`phone-provider.mjs`, `native-push-sqlite.mjs`, `dispatch-sqlite.mjs`, `ride-lifecycle-sqlite.mjs`, `resource-scope-sqlite.mjs`, `ledger-sqlite.mjs`, `payments-sqlite.mjs`, `activation-gates.mjs`). Canonical gate = 106-entry fail-fast registry in `scripts/run-tests.mjs`. | [S] `scripts/run-tests.mjs:6-127` |
| 9 | Canonical typecheck passes / `clean-typecheck` proves only seven errors exist | **REFUTED** | Canonical `npm run typecheck` OOMs (heap limit) and, with increased heap, reaches unrelated `research_notes` errors because root `tsconfig.json` includes `**/*.ts`/`**/*.tsx`. `clean-typecheck` times out (finding 3). Isolated seven-error scan is diagnostic, not a canonical pass. | [F]/[B] fresh attempts; [S] config inspection |
| 10 | AWS access operational (`GetCallerIdentity` succeeds) | **REFUTED** | `HANDOFF.md:68` — historical `GetCallerIdentity` returned `InvalidClientTokenId`; latest shell reported `aws` is not recognized. No credential value recorded. | [B] blocked |

### Non-classified / open (not product findings, tracked as execution gaps)
- `parcels.test.mjs` repeat canonical suite needed to determine contention vs startup/teardown race (finding 5).
- Booking Part A (PostgreSQL lock/replay race) not executed — `WIND_TEST_DATABASE_URL` unset (finding 4).
- `tests/integration/` does not exist; earlier invalid-path attempt produced zero tests, not application evidence (`HANDOFF.md:48`).

---

## 2. Test counts and direct-test labeling (verified)

| Item | Verified value | Source |
|------|----------------|--------|
| `tests/*.test.mjs` files on disk | **99** | glob of `tests/` (all `.test.mjs`) |
| Canonical fail-fast registry entries | **106** | `scripts/run-tests.mjs:6-127` (`suites` array lines 7-112) |
| Registry entries that are `.test.mjs` | **98** | of 106; 8 are `.mjs` non-test entries |
| Registry `.test.mjs` exempted (not run here) | **2** | `db-persistence.test.mjs`, `db-api.test.mjs` (`run-tests.mjs:116-119`) |
| Registry-only `.mjs` suites excluded from direct run | **8** | `phone-provider.mjs`, `native-push-sqlite.mjs`, `dispatch-sqlite.mjs`, `ride-lifecycle-sqlite.mjs`, `resource-scope-sqlite.mjs`, `ledger-sqlite.mjs`, `payments-sqlite.mjs`, `activation-gates.mjs` |
| Direct `node --test` over 99 files | **103 results: 96 pass / 7 fail / 0 cancelled / 0 skipped / 0 todo**, duration `60842.9563ms` | `integration-current.log:766-773` |
| The 7 failing suites | booking-retry-race, clean-typecheck, database-logging, db-api, db-persistence, parcels, subscription-migration | `integration-current.log:775-803` |
| `npx expo lint` | **PASS, exit 0** | `lint-current.log` (env setup only) |
| Direct-run labeling | **Noncanonical** — not the 106-entry fail-fast registry; bypasses the orphan guard (`run-tests.mjs:120-124`) | `scripts/run-tests.mjs` |

> Correction: an earlier context note described the registry as "110-entry"; file verification confirms **106 entries** (`scripts/run-tests.mjs` lines 7-112). `HANDOFF.md` table row also states "canonical 106-entry fail-fast registry."

---

## 3. Missed P0/P1/P2 issues (acceptance implications only; no code fixes proposed)

These are gaps/issues not captured as material findings in the prior report, identified during this verification:

- **Root `tsconfig.json` pollutes canonical typecheck** — includes `**/*.ts`/`**/*.tsx`, so `research_notes/` reverse-engineering contaminants reach the project-wide scan. Canonical `npm run typecheck` cannot establish an application pass until layout/config is corrected. Acceptance implication: typecheck gate is not truthful today (P0-3).
- **`package.json` lacks `"type": "module"`** — every ESM file reparse emits `MODULE_TYPELESS_PACKAGE_JSON` warnings (`integration-current.log:1-3` et al.). No test failure, but noisy clean builds and a latent module-resolution hazard.
- **`scripts/readiness/full-suite.mjs` absent** — not runnable; must not be cited as a current gate (`HANDOFF.md:34`).
- **Immediate-capture settlement gap** — `server/domain/payments.ts:53-63` stores/returns provider outcome `captured` from `createIntent` without invoking `settlementGate` (gate runs later at lines 78/91). Test fake provider; not a live PSP exploit. Acceptance implication: payment activation remains blocked until atomic settlement is proven (P0-5).
- **Registry/orphan guard is real and useful** — `run-tests.mjs:120-124` fails the gate if any on-disk `.test.mjs` is neither selected nor exempt. The direct 99-file run bypasses this gate and is therefore not acceptable as release evidence.

---

## 4. Exact blockers (owner actions needed)

| Blocker | Why it blocks | Owner action needed | Verification after restoration |
|---------|---------------|---------------------|-------------------------------|
| Local PostgreSQL refused `127.0.0.1:55473` | Booking Part A (server race) + 4 PG suites unexecuted | Provide isolated loopback PostgreSQL/PostGIS fixture + client tools; set `WIND_TEST_DATABASE_URL` | `npm run test:persistence` passes; `npm test -- --filter=booking-retry-race` runs Part A (not `SKIP`) |
| Canonical typecheck OOM / polluted by `research_notes`; 7 isolated source errors | No canonical compile gate | Engineering fixes `server/domain/opencode.ts` + tsconfig layout under P0-3; no `@ts-ignore`/skipped tests | `npm run typecheck` exit 0 on canonical tree; `clean-typecheck` exits normally |
| AWS CLI not recognized / `InvalidClientTokenId` | No live AWS identity/inventory/cost | Restore AWS CLI + valid owner-authorized access for profile `osama-abujarad`; confirm project/Region in AWS Settings | Read-only caller identity + inventory return expected account/Region (no secrets printed) |
| k5 remote testing unavailable | No remote GPU/test execution | Owner supplies authorized account/key (configured keys refused) | Bounded remote identity/environment check, labelled host/folder/port |
| Device launch `Unexpected launch result for ps.wind.app.testdriver` | No physical device matrix | Attach/prepare SM-A5360 (serial `R5CTB0FJP9Z`), signed test/release build, preserve Chrome profile + test-backend `adb reverse` | Fresh P0-8 matrix records actual launch and journeys |

---

## 5. What this audit established vs. did not establish

**Established (fresh):** lint passes; isolated application typecheck fails on seven current `opencode.ts` errors; direct 99-file run = 96 pass / 7 fail; booking command loss reproducible; parcels passes only in isolation (flake unresolved); Node 24.12.0 `node:sqlite` execution works locally; canonical registry = 106 entries; direct run is noncanonical.

**Not established:** canonical full-suite pass, canonical typecheck pass, live AWS identity/state/cost, deployed revision, current CI, physical release matrix, live provider capture, representative production restore, production load/SLOs, numeric RPO/RTO, production readiness.

---

**Method note:** all classifications are read-only; no file modification, Git mutation, install, AWS access, secret exposure, or server/emulator startup was performed. Report date 2026-11-13.