# Completion evidence register

## Planning baseline — 29 October 2026

- Baseline revision: `85b5a3a`; initial `git status --short` clean.
- Scope: read-only app/source audit and documentation changes. No application implementation.
- Remote attempt: `ssh -o BatchMode=yes -o ConnectTimeout=8 k5 exit` refused with `Permission denied (publickey,password,keyboard-interactive)`. No remote execution claimed.
- Local fallback: `npm run lint` passed; `npm run typecheck` passed (app and server).
- Device inventory: SDK adb executable lists `R5CTB0FJP9Z device`, model `SM_A5360`. No UI/acceptance test performed.
- Checked official SDK 57 map docs and Google Routes/Places policies; references in plan.md.
- The first oversized shell documentation-generation request was rejected by Windows command-length limits before execution. Documentation was then written with apply_patch; no application files were changed.
- Historical full-suite, cloud and native-device results belong to their recorded revisions, not this planning turn.
- Plan validation passed: 55 unique tasks, all dependency IDs exist and precede their dependents, required task fields present, 18 intermediate checkpoints, final checkpoint, and original plan/checklist text preserved against git HEAD.
- `git diff --check` passed after documentation generation. Final changes are limited to tasks/plan.md, tasks/todo.md, tasks/HANDOFF.md and tasks/evidence.md.
- Plan review status: prepared for owner review; application implementation has not started.

## Per-task evidence template

## Implementation continuation — T03/T04

- See [map contract](maps-contract.md) and [map implementation evidence](maps-implementation-evidence.md) for the prepared synthetic corpus and pickup cache implementation/checks. T04 native acceptance remains open; no parent completion is claimed.
- Requested DeepSeek V4.1 Flash 1017 was discovered and launched through T3 (`opencode_fireworks`, dedicated Fireworks model). Its T01/T02 delegate failed before work with `getaddrinfo ENOTFOUND api.fireworks.ai`. No delegate result or remote evidence is claimed and no provider substitution was made.

## T02 — characterization checkpoint, 29 October 2026

- Detailed actual-versus-required outcomes and every remaining status rule: [T02-completion.md](../reports/verify-2026-10-29/T02-completion.md). Fresh isolated PostgreSQL probe reproduces T27 scope privacy, T28 unknown refund/cap release, T29/T30 missing lifecycle journals, T31 card/cash double collection and T32 partial COD remittance. T17 malformed hash reproduced before its fix and passed after it. Remaining source-only claims retain unverified behavioral status and owner mappings from T01; no device, ingress, live provider or field claim was promoted.
- Commands, explicitly local fallback: local-postgres start 0; first persistence run 1 (T05 endpoint inventory mistake); corrected pg-contracts 0; full persistence rerun 0 (51 listed suites plus legacy parity); final extended t02-pg-reproduce 0; npm test 0 (85 suites). Lint 0. Earlier T04/T05/T17 app/server typechecks were 0; a later typecheck during the active T18 delegate exited 1 because its async conversion was not finished. T18 owns that temporary failure, and final common gates must be rerun after it finishes.
- Identity: baseline 85b5a3a plus uncommitted T04/T05/T17 changes, then the independently active T18 changes. Full-suite passes above are the pre-T18 checkpoint, not final T18 candidate acceptance. Parent T02 stays open until the common gates are re-established after active editing.
- DeepSeek delegation: T01 retry completed successfully. Subsequent Fireworks T02 run failed on suspended account. User approved another configured provider; Cloudflare rejected 1017 on Free plan. Modal 1017 T18 delegate is active. No provider payment, upgrade, commit, push, deployment or live message occurred.
- T03 specification/corpus complete; T04 implementation awaits native acceptance; T05 observation endpoint is implemented with additive inventory and passing fixture/PG boundary checks, but staging DNS/graph/version acceptance remains open. T06–T16 depend on unfinished map/provider acceptance; independent T17 server-format fix is complete.

## T01 — baseline reconciliation, 29 October 2026 — COMPLETE

### Identity, host and commands

- Revision: `85b5a3a4f3c6fc3044dc2aaaa5f95db1782f873d` (`docs(handoff): point at the current HEAD`). Node v24.12.0, npm 11.11.0.
- Dirty files at this turn (all preserved, none reset or overwritten):

  | File | Owner | State |
  |---|---|---|
  | `src/app/book.tsx` | parent, T04 | modified (+15/−4): `cachedPickup` pin hint, `gpsAt`, `pinRequest` abort, landmark no longer wiped on GPS city change |
  | `src/customer-location.ts` | parent, T04 | modified (+19): `cachedPickup` |
  | `tests/customer-location.test.mjs` | parent, T04 | modified (+13/−1): cache age/accuracy/timeout/abort cases |
  | `tasks/plan.md` | planning turn | modified (+251) |
  | `tasks/todo.md` | planning turn | modified (+1650) |
  | `tasks/HANDOFF.md`, `tasks/evidence.md`, `tasks/maps-contract.md`, `tasks/maps-implementation-evidence.md` | planning/parent | untracked |

- Remote attempt (once): `ssh -o BatchMode=yes -o ConnectTimeout=8 k5 exit` → `ssh: Could not resolve hostname desktop-s2jkmk5.local: No such host is known.`, exit **255**. This turn's failure is host/DNS resolution, not the recorded `Permission denied (publickey)`; both block remote work. **No remote evidence is claimed.**
- Local fallback, explicitly labelled, run sequentially:
  - `npm run lint` → exit **0**
  - `npm run typecheck` (`tsc --noEmit && tsc --noEmit -p tsconfig.server.json`) → exit **0**; covers app and server
  - `git diff --check` → exit **0** (one pre-existing `LF will be replaced by CRLF` warning on the parent's `src/app/book.tsx`; no whitespace error)
  - `npm test` (`node scripts/run-tests.mjs`) → exit **0**, `Integration gate: 85 suites passed`
- Device inventory only: `adb devices -l` lists `R5CTB0FJP9Z device product:a53xzh model:SM_A5360`. No device acceptance, no emulator, no UI interaction was performed.
- Tier of everything below: **source review plus deterministic local fixture suites**. No isolated-integration, physical-browser, native-binary, real-provider or field evidence is produced by T01.

### Re-derived baseline counts (measured this turn, not copied)

| Quantity | Measurement | Historical claim | Note |
|---|---|---|---|
| Route declarations | 163 (90 `server/main.ts` + 73 `server/domain/*.ts`) | 163 | agrees |
| Unique route paths | 149 | n/a | 14 duplicate method-less paths (e.g. `/api/admin/eligibility` GET+POST) |
| Additive endpoints in contract | 73 | n/a | `docs/implementation/contracts/additive-endpoints.json` |
| `tests/*.test.mjs` on disk | 78 | 130 test files | 130 counts all `tests/*.mjs` (137 now incl. helpers) |
| Suites selected by `npm test` | 76 + 2 PostgreSQL-exempt = 78 | 78 listed / 69 `*.test.mjs` | guard now fails on any unselected, unexempted file (`scripts/run-tests.mjs:101-105`) |
| Persistence suites | 51 listed, all present on disk | 50 | drift is additive, no missing file |
| `src/copy.ts` keys | 893 per locale, **0** asymmetric | 886 | count differs by extraction method; drift claim holds |
| PostgreSQL indexes | 13 in `postgres-schema.sql`, `sessions` has **none** on `user_id` | same | `postgres-presence.sql:2` adds `(token_hash,user_id)`, which is not a `user_id` lookup index |
| `SPEC-*.md` files | 161 | 33 | 161 includes `research_notes/` copies; 33 in repo root/docs |

### Deployment claim split (current vs historical)

- **Current, verified as configuration only:** `infra/main.bicep` defaults `enableWorkloads` to `false` (`:11`), compiles and lints in the suite, and gates the API/worker/OSRM modules. The gated module now binds `SUPPORT_CONTACT` (`:353`), `WIND_IDENTITY_MODE` (`:354`), `OSRM_URL` (`:356`), `DB_PATH=/data/wind.db` (`:357`) on a `wind-data` Azure Files mount (`:368-369`) and the `database-url` Key Vault secret as `WIND_DATABASE_URL` (`:366`). That is a template, not a deployment: no what-if, no apply, no running revision, no populated OSRM graph was checked here.
- **Current, verified as source:** `server/db/runtime.ts` has three gates — SQLite fallback, a restricted `WIND_POSTGRES_STAGING=1` non-loopback `sslmode=verify-full` branch (`:11-19`), and the test-only loopback branch (`:20-26`). The old review's "production runtime categorically refuses PostgreSQL" is therefore **stale**; the accurate statement is that no unrestricted production branch exists.
- **Historical, not reproducible in this clone:** the Railway deploy claims, including `loop 19 ship (deploy eb841dcb)` in the preserved checklist. `git cat-file -t eb841dcb` → `fatal: Not a valid object name`. Railway, Cloudflare and the older native artifact claims stay historical.
- **Historical commits still in history:** `2e19745`, `484e0ce`, `c2184eb`, `3590b7e`, `c0a5c37`, `0302c2d`, `2b61fc4`, `ed301b7`, `39d6794`, `0344d98`, `d99ed22`, `378e37c`, `5f941fd`, `b7d3c97`, `308eadf` all exist and are ancestors of HEAD (`git merge-base --is-ancestor` → 0 each). Their *landing* is verified; their test outcomes are not re-run selectively here.

### Status decision

T01 acceptance criteria are met: every P1/P2/P3 assertion, every prose assertion in the corrections/killed/downgraded/executed sections, and every old-unchecked checklist item is mapped below with a current source symbol, a status, an owner task and a reason. No existing edit or unchecked item was removed. Statuses are deliberately conservative — `source confirmed` means the code still shows the defect, not that a test passed; `unverified` and `historical` rows stay open with an owner.

### T01 working register — historical review P1

Reviewed at `b7d3c97`; dispositions are source inspection at `85b5a3a`, not fresh behavioural verification. Line numbers were re-read, never trusted from the report.

| # | Historical assertion | Current source symbol | Status at `85b5a3a` | Task | Evidence / reason |
|---|---|---|---|---|---|
| P1.1a | IaC gate omits `SUPPORT_CONTACT` | `infra/main.bicep:353`, `:56` | **fixed** | T47 | bound as `checkedSupportContact`; compile fails when blank under `enableWorkloads` |
| P1.1b | IaC gate omits `WIND_IDENTITY_MODE` | `infra/main.bicep:354` | **fixed** | T47 | `identityMode` parameter, asserted by `tests/azure-infra.test.mjs:89` |
| P1.1c | Worker module gets no `WIND_DATABASE_URL` | `infra/main.bicep:397`, `server/worker.ts` | **fixed** | T47 | worker Key Vault secret binding present |
| P1.1d | `OSRM_URL` in no IaC file | `infra/main.bicep:356` | **fixed** | T05/T47 | internal ingress FQDN; resolves to a real OSRM app only after deployment |
| P1.1e | No volume mount, `/data` dies with revision | `infra/main.bicep:233-241`, `:368-369` | **fixed in template** | T46/T50 | `wind-data` share mounted at `/data`; durability unproven until a staged revision survives restart |
| P1.1f | Owner-gate comment names two gaps, not five | `infra/main.bicep:333-334` | **reworded, not enumerated** | T47/T48 | comment now names cutover/migration/identity gates, drops the "two missing" framing but still lists no gap count; not a regression, no false instruction |
| P1.2a | Blank admin field saves `0` | `src/model.ts:104-109`, `src/app/admin/settings.tsx`, `server/main.ts:2757-2758` | **fixed** | T02 re-check | one shared `settingCeilings`/`invalidSetting`; `<= 0` rejected on both sides |
| P1.2b | No upper bound on settings | `src/model.ts:94-99` | **fixed** | T02 re-check | per-key ceiling, `commission ≤ 0.5`, `plusPrice ≤ 1000` |
| P1.2c | `commission: 0` → 500 at `minorUnits` (latent) | `server/main.ts:1069`, `server/domain/quotes.ts:minorUnits` | **source unchanged, now unreachable** | T05/T34 | `invalidSetting` refuses `0` at the write boundary, so the latent 500 needs a hand-edited DB, not a form |
| P1.3a | Per-address limits key on attacker-chosen headers | `server/domain/client-address.ts:12-21` | **fixed** | T47 | rightmost `X-Forwarded-For` hop, `X-Real-IP` ignored; used at `main.ts:1570`, `:2846`, `phone-identity.ts:49` |
| P1.3b | Whether the ingress rewrites the hop is unknown | `infra/main.bicep:363` sets `WIND_TRUST_PROXY=1` | **unverified** | T47 | needs one request against a deployed host; no deployment this turn |
| P1.3c | `README` advises trusting `X-Real-IP` | `README.md:139` | **stale doc** | T48 | still says "private proxy that overwrites `X-Real-IP`"; the code ignores that header |
| P1.4a | `npm test` runs a hand-maintained list | `scripts/run-tests.mjs:6-92` | **partly fixed** | T44 | list retained, but `:101-105` fails the gate on any unselected, unexempted `*.test.mjs`; 78/78 accounted for |
| P1.4b | Three suites ran in neither gate | `scripts/check-persistence.mjs:5-14`, `.github/workflows/ci.yml:81-82` | **fixed** | T44 | `database-logging`, `db-*` selected; persistence job runs in CI |
| P1.4c | `azure-infra.test.mjs` ran nowhere | `scripts/run-tests.mjs:90` | **fixed** | T44 | selected in the main gate; passed this turn |
| P1.4d | Docker guard cannot see nested `server/domain/*.ts` imports | `tests/deployment.test.mjs:43-52` | **source confirmed** | T44 | queue starts from `server/*.ts` only, follows only `src/`-prefixed targets, regex matches single quotes only |
| P1.4e | Five `server/domain` modules import `src/model.ts` | `server/domain/*.ts` | **real, currently passing** | T44 | `Dockerfile` copies `src/model.ts` and `src/map-math.ts` explicitly; guard is luck-adjacent, as the review said |
| P1.5a | `OSRM_URL` in no deploy doc | `docs/operations/deploy.md:39,43` | **fixed** | T05/T48 | documented, including the staging FQDN confirmation requirement |
| P1.5b | Documented deploy path cannot enable routing | `server/main.ts:474`, `:2318` | **template fixed, runtime unproven** | T05 | `roadRoute` fails `503 route_unavailable` when unset; graph population and internal DNS are staging checks |
| P1.5c | Silent straight-line × 1.3 fallback on the quote path | `server/main.ts:1050`, `:1062` `estimated: !trip` | **by design, still present** | T05/T13 | labelled estimate with `estimated` flag; no invented road line. Not a defect unless the flag is dropped |
| P1.6a | Five findings latent behind a gate production refuses | `server/db/runtime.ts:20-21` | **restated** | T27-T32 | test-only branch unchanged; the new `WIND_POSTGRES_STAGING` branch (`:11-19`) does not open the API to unrestricted PG |
| P1.6b | Twelve P2s live on SQLite | P2 rows below | **still accurate** | T17-T25 | #6-#14 are ungated `main.ts` routes; re-confirmed per row |
| P1.6c | Report's own first-pass "whole P2 block latent" | — | **historical error, corrected** | — | retained as history; do not reopen |

### T01 working register — historical review P2

| # | Historical assertion | Current source symbol | Status at `85b5a3a` | Task | Evidence / reason |
|---|---|---|---|---|---|
| P2.1 (PG) | `pending`/`timeout` refund stored terminal `rejected`, cap released | `server/domain/payments.ts:104` | **source confirmed** | T28 | `if (captured) … else UPDATE refunds SET status='rejected'`; no `timeout`/`pending` branch; cap counts `requested/approved/completed` (`:92`), so a rejected row frees it |
| P2.2 (PG) | Ledger is an import-time snapshot; `postJournal` has one caller | `server/domain/ledger.ts:40`, `:73` | **source confirmed** | T29/T30 | `postJournal` referenced only at `:40` (definition) and `:73` (inside `importLegacy`); `cashCapActivated: false` at `:13` |
| P2.3 (PG) | Partial COD can never be remitted | `server/domain/payments.ts:116-117` | **source confirmed** | T32 | `collectCod` writes `'partial'`; `remitCod` fails `409 cod_unavailable` unless `row.status === 'collected'`; nothing transitions `partial` |
| P2.4 (PG) | Card capture and cash settlement unlinked | `server/domain/ledger.ts:125-166`, `payments.ts:50-66` | **unverified** | T31 | no cross-read found between `cash_receipts`/`collect` and `payment_intents`; absence of a join is not a proven double-settle, so T02 must reproduce |
| P2.5 (PG) | Any driver reads a searching order's `declaredValueMinor`/`sourceRef` | `server/domain/resource-scope.ts:250-257` | **source confirmed** | T27 | `searchingDriver` short-circuits `participant()`; no `servesFor`, `enabledServices`, `order_releases` or `viewer.status` filter |
| P2.6a | Support reset returns a plaintext password | `server/main.ts:2698`, `:2708` | **source confirmed, by design** | T35/T36 | generated password returned in the body; comment `:2693` states support reads it aloud until SMS exists |
| P2.6b | Support reset writes no audit row | `server/main.ts:2704` | **fixed** | T48 | `SUPPORT_PASSWORD_RESET` with `order_id NULL`, inside the same transaction as the hash write and session delete |
| P2.7a | `editUser` writes no `security_events` row | `server/main.ts:2635-2645` | **fixed** | T48 | `USER_UPDATED` with changed-field list, inside `BEGIN IMMEDIATE`…`COMMIT` |
| P2.7b | `editUser` lets an admin rewrite identity unguarded | `server/main.ts:2626-2633` | **guarded, audited** | T41/T48 | re-checks stranded orders in-transaction; clears verification; kills sessions; now audited. Behaviour acceptance stays T41 |
| P2.8 | `approve` skips the `carrying_parcels` guard | `server/main.ts:2678-2681` | **fixed** | T02 re-check | guard present for `driver` + `blocked`; `tests/unblock-custody.test.mjs` covers it |
| P2.9 | `scryptSync` on the single event loop | `server/main.ts:182`, `:187` | **source confirmed** | T17/T18 | reachable from login `:567`, register `:547`, reset `:737`, support reset `:2699`; 26 ms/hash was the review's measurement, not re-measured here |
| P2.10 | `checkPassword` throws on a hash without `salt:hash` | `server/main.ts:185-187` | **source confirmed** | T17 | `stored.split(':')` yields `undefined`; `Buffer.from(undefined,'hex')` throws `TypeError` → 500 |
| P2.11 | Pending remittance decidable only by the driver | `server/main.ts:2473-2481`, `:2488-2518` | **source confirmed** | T25 | decision route requires `driver`; admin routes only record remittance/adjustment; no admin decision or expiry path exists |
| P2.12 | `subscriptions` has no unique index; double tap could double-charge | `server/db/sqlite-schema.ts:31-34`, `server/db/postgres-schema.sql:246` | **constraint absent; race not reproduced** | T22 | no unique index in either schema; the review's 760-attempt probe found 0 duplicates under one process. Missing constraint is the defect |
| P2.13a | One customer can bury the job board | `server/main.ts:1794-1821` | **pagination present, abuse limit absent** | T21 | `page=1` → 20, legacy 50, cursor returned; no per-customer active-search quota on `/api/orders` create |
| P2.13b | Searching orders never swept | `server/main.ts:998-999` | **source confirmed** | T21 | only scheduled orders are released; no stale-search expiry |
| P2.14a | One admin forgives debt with no second approver | `server/main.ts:2488-2516` | **source confirmed** | T23/T24 | `recordCash` never consults `financial_approvals`; `Math.abs(amount) > 1_000_000` cents and the no-negative guard are the only limits |
| P2.14b | `decideApproval` already blocks self-approval | `server/domain/ops.ts:81` | **present, gated** | T24 | `409 second_approver_required`; unreachable on SQLite (`opsAvailable`) |
| P2.14c | `financial_approvals` does not exist on SQLite | `server/db/sqlite-schema.ts` table list; `server/db/postgres-ops.sql:5` | **accurate** | T24 | zero occurrences in the SQLite schema and one `CREATE TABLE` in `postgres-ops.sql`; it is listed in `NON_LEGACY_TABLES` (`server/migrate.ts:16`), i.e. a PostgreSQL-only table never imported from SQLite |
| P2.15 | Destination change is SQLite-only | `server/domain/destination-change.ts:63`, `server/migrate.ts:19` | **source confirmed** | T33 | `sqliteOnly()` on all four routes; `commission_rate` in `SQLITE_ONLY_COLUMNS` |
| P2.16 | No CI job builds the deployed image | `.github/workflows/ci.yml:89-90` | **fixed** | T02 re-check | local smoke build, never pushed; a build job existing is not proof it passes on this revision |
| P2.17a | Booking idempotent only if the client volunteers `requestId` | `server/main.ts:1357-1362` | **source confirmed** | T20 | `requestId == null` branch creates with no command row |
| P2.17b | Partner path never sends a `requestId` | `server/main.ts:1421-1439` (`/api/partner/orders`) | **review framing incomplete** | T20 | partners do not use `requestId`; they dedupe on `externalRef` in `partner_orders` (`:1426-1432`), so the omission is by design. Residual risk for T20: `SELECT`-then-`createOrder`-then-`INSERT` runs under `BEGIN` and relies on the `external_ref` primary key to reject a concurrent duplicate, which would surface as a raw constraint error rather than `409`. Not reproduced |

### T01 working register — historical review P3 and prose

| Assertion | Current source symbol | Status | Task | Evidence / reason |
|---|---|---|---|---|
| Proof-lock `reattempt` leaves the five failures | `server/main.ts:2042` vs `:2046` | **source confirmed** | T26 | `reattempt` sets `in_transit` and does not clear `proof_attempts`; only the `return` branch deletes them. A reattempt at ≥5 stays locked |
| Rating check-then-write, no `WHERE rating IS NULL` | `server/main.ts:1537-1539`, `:1543` | **source confirmed** | T26 | predicate in JS only; concurrent requests can both pass |
| Reschedule `searching` re-check absent | `server/main.ts:1524` | **refuted, do not reopen** | — | status is re-checked; 40 races produced no double-success. Residual TOCTOU: read `:1520` outside the write `:1527`, no status predicate on `UPDATE` |
| Reschedule ownership guard unasserted | `tests/schedule.test.mjs:82-87` | **fixed** | — | admin token + slot beyond `RELEASE_BEFORE` isolates `:1522`; asserts `409 cannot_reschedule` and an unchanged row |
| First-order promo race | `server/main.ts:822-839` | **unverified** | T26 | `promoFor` reads inside the create transaction, but uniqueness rests on `promo_redemptions`; concurrency untested here |
| `sessions` has no `user_id` index (PostgreSQL) | `server/db/postgres-schema.sql:237-240`, `postgres-sessions.sql:1` | **source confirmed** | T43 | only `last_seen_at` added; `postgres-presence.sql:2` indexes `(token_hash,user_id)` |
| `GET /api/orders` is 4–6 queries per row | `server/main.ts:1467-1483` → `toOrder:248-300` | **source confirmed** | T43 | `toOrder` awaits `dispatch.summary`, `rideLifecycle.summary`, `resourceScope.summary`, optional `pendingDestination`, plus joins; count unmeasured |
| Pending booking is a one-way door | `src/app/book.tsx:70`, `:126-131`, `:246-258` | **source confirmed** | T19 | `locked` while `pending`; discard only on a non-5xx/non-401/408/429 server refusal (`:255`); survives sign-out because the key is `booking.<userId>` |
| Admin cash/dispute/block commit on one tap | `src/app/admin/cash.tsx`, `orders.tsx:95-100` | **source confirmed** | T41 | no `confirm` import in either file; users.tsx already confirms block/approve/reset/delete (`:34`, `:108`, `:126`, `:129`) |
| Activate/Reject can both be in flight | `src/app/admin/subscriptions.tsx:14-26` | **source confirmed** | T41 | `busy` is keyed `${id}${action}`, so each button keeps its own spinner and neither is disabled |
| Fixed `lineHeight`, no `maxFontSizeMultiplier` | `src/ui.tsx:167-173` | **source confirmed** | T42 | six fixed line heights; zero `maxFontSizeMultiplier` in `src/` |
| Push tapped at cold start drops its link | `src/native-push.ts:14` | **source confirmed** | T37 | listener only; no `getLastNotificationResponse()` |
| Driver provider polls 3 s and re-reads SecureStore | `src/driver-work.tsx:321`, `:314-316`; `src/background-location.ts:108-114` | **source confirmed** | T39 | `setInterval(status, 3_000)` → `backgroundLocationState` → `read()` ×2 + `SecureStore.getItemAsync('token')` |
| `scheduleSlots()` runs per render | `src/app/book.tsx:63`, `src/booking.ts:scheduleSlots` | **source confirmed** | T40 | called in the render body; no memo; ~227 `Intl` calls was the review's estimate, not re-measured |
| Arabic literals and "فلسطين" live outside `copy.ts` | `src/ui.tsx` (4 runs), `src/app/order/[id].tsx:32` | **source confirmed** | T42 | inline `'Decrease'/'Increase'` labels and the maps query suffix |
| "Use my location" wipes the typed landmark | `src/app/book.tsx:114` | **fixed in the parent's T04 diff** | T04 | the `setPickupNote('')` line is removed in the working tree; city-picker resets at `:493-494` remain correct behaviour |
| Schedule freshness validated on a different value | `src/app/book.tsx:211` vs `:230` | **not reproduced at source** | T40 | both now read `scheduledFor`; the report's `:208`/`:232` split does not exist. Keep as unverified, do not "fix" a non-defect |
| Five suites wait a fixed 50 ms for push | `tests/push-server.test.mjs:23` | **source confirmed** | T44 | `settle()` = `setTimeout(resolve, 50)`, 35 call sites |
| `presentation.test.mjs` re-imports a registered suite | `tests/presentation.test.mjs:2` | **source confirmed** | T44 | `import './customer-location.test.mjs'` and both names are in `run-tests.mjs` |
| `check-contracts.mjs` duplicates two suites | `scripts/check-contracts.mjs:4` | **source confirmed** | T44 | re-runs `contracts-money`/`contracts`, both also in the main gate |
| URL-decoder DoS gate uses a 3 s wall clock | `tests/url-decoder.test.mjs:15` | **source confirmed** | T44 | `spawnSync(..., { timeout: 3000 })` |
| Persistence runs leave their schema behind | `tests/support/pg-test-server.mjs:18-20` | **source confirmed** | T44 | `wp03_legacy_<uuid>` created and initialised; zero `DROP SCHEMA` in `tests/` |
| Four browser gates share port 4188 and one export dir | `check-scenarios.mjs:15,19`, `check-readiness.mjs:12,16`, `check-customer-location.mjs`, `check-android-browser.mjs:12,15` | **source confirmed** | T44 | all bind `127.0.0.1:4188` on `.expo/location-review-web`; must stay serialized. `check-jobs-pages.mjs` uses 4198 |
| No `versionCode` in the repo | `app.json` (absent), `eas.json:3` `appVersionSource: remote` | **source confirmed** | T49 | remote counter; a locally signed release is rejected by Play |

### T01 working register — historical review "docs" prose

| Assertion | Current source symbol | Status | Task | Evidence / reason |
|---|---|---|---|---|
| "no npm dependencies" is false | `README.md:11`; `server/db/persistence.ts:3` | **doc still false** | T48 | README line intact; `import { Pool } from 'pg'` static |
| Four docs say native push is unimplemented | `docs/SYSTEM.md:143`, `docs/QA-2026-10-21.md:35`, `:269`, `docs/QA-WORKFLOW-2026-10-21.md:176` | **source confirmed** | T37/T48 | `src/native-push.ts` + `server/domain/native-push.ts` exist; delivery still needs EAS/FCM, so "unimplemented" is wrong in kind and right in outcome |
| WP17 lists destination change as OFF | `docs/implementation/WP17.md:9` | **source confirmed** | T48 | the table row also names `ride-lifecycle`/`resource-scope`, not `destination-change.ts`; two inaccuracies |
| VAPID `sub` defaults to the Railway host | `server/worker.ts:203` | **source confirmed** | T37/T48 | `'https://wind-production-72aa.up.railway.app'`; impact on delivery unverified |
| Worker hard-codes `Urgency:'high'` | `server/worker.ts:202`; `server/domain/native-push.ts:17` | **source confirmed** | T37 | `URGENT_KINDS` exists but the web-push sender does not read it |
| Cash formula omits the promo credit | `docs/SPEC-cash-settlement.md:28` vs `server/domain/money.ts:cashOwed` | **source confirmed** | T48 | spec: `commission + adjustments − remitted`; code subtracts `discounts` too, and `main.ts:2451-2452` says why |
| SQLite creates Postgres-only tables no SQLite code reads | `server/db/sqlite-schema.ts:176-192`; `server/domain/quotes.ts:9-14` | **source confirmed** | T48 | `road_restriction_policy`, `road_restrictions`, `quotes` are created on SQLite; `quotesAvailable` returns false before reading them |
| 52 of 163 routes have no client caller | route inventory (163 declarations / 149 paths) | **re-derived, historical number not matched** | T48 | my prefix match yields 93 clientless paths, which over-counts (no call-site parsing). The report's own caveat stands: classify per route, do not treat either number as a finding |
| Two specs cite files that do not exist | `SPEC-android-map.md`, `SPEC-live-map.md`, `SPEC-order-again.md` … | **mostly extension drift** | T48 | e.g. `src/route-map.android.ts` vs the real `.tsx`, `src/app/book.ts` vs `book.tsx`. 55 raw misses across SPEC files; sampled ones are extension-only, so "nonexistent" is overstated |
| Screenshots predate the 29 October UI change | `docs/screens/ar`, `docs/screens/en` | **source confirmed** | T42/T49 | directories dated 2026-10-27, index/manifest 2026-10-28 |

### T01 working register — review "killed / downgraded / corrected" (retained so nothing is silently reopened)

| Item | Current source | Disposition | Task |
|---|---|---|---|
| Road-report authz "deny-list" claim | `src/model.ts:18` `Role = 'customer' \| 'driver' \| 'admin'` | **killed — do not reopen** | — |
| Postgres has no `role` CHECK | `server/db/postgres-schema.sql:261` | **confirmed, no finding** | T43/T48 |
| `/api/ready` takes the SQLite write lock | `server/main.ts:506-521` | **downgraded, unchanged** | T43 |
| Phone-recovery flood | `server/domain/phone-identity.ts:22`, `:117-125` | **downgraded; policy exists** | T21/T35 |
| Entra client-supplied nonce | `server/domain/entra.ts:125` | **downgraded; nonce-bound** | T35 |
| Account-deletion free text | `server/main.ts:750` `deleteAccount` | **downgraded** | T41/T48 |
| COD collection vs payout | `server/domain/payments.ts:117` `payout_ref` free text | **downgraded; `docs/SYSTEM.md:162` is the false sentence** | T32/T48 |
| 52 clientless routes | see docs table | **downgraded** | T48 |
| Corrupt pending booking screen deadlock | `src/api.ts:28` (`null` deletes the key) | **downgraded** | T19 |
| Admin one-tap money caps already exist | `server/main.ts:2496-2508`, `:2477` | **downgraded; missing piece is the dialog** | T41 |
| Font clipping threshold unmeasured | `src/ui.tsx:167-173` | **downgraded; still open** | T42/T49 |
| `WIND_BOP_*` could enable payments | `server/domain/payments.ts:32-33` | **gone** — `paymentsConfig` returns only `testFake` | T31 |
| P1 #2's `minorUnits` 500 fires today | `server/main.ts:1069` | **refuted/latent** | T05/T34 |
| P2 #12 double charge reproduces | `server/db/persistence.ts` mutex | **refuted** | T22 |
| P3 "reschedule never re-checks searching" | `server/main.ts:1524` | **refuted** | — |
| ~26 ms per hash, not ~50 ms | `server/main.ts:182` | **measurement correction; not re-measured** | T18 |

### T01 working register — old unchecked checklist and handoff items

| Historical item | Current status | Task | Reason |
|---|---|---|---|
| `todo.md` Preserved checklist `[ ]` A53 physical matrix D01–D15 and rebuilt APK run | **open** | T49 | device attached (`R5CTB0FJP9Z`) but no acceptance run this turn |
| `[ ]` "API not deployed (Railway build pause, fresh backup, Cloudflare domain)" | **superseded, not satisfied** | T47/T50 | active origin story is Azure (readiness report); Railway commands in old runbooks are stale, and no deployment exists |
| `[ ]` "Fresh verified backup once SSH connectivity returns" | **open** | T46 | SSH unreachable this turn (DNS), and backup restore was never rehearsed |
| `[ ]` "Owner: deploy the API to Railway" | **superseded** | T50 | Azure IaC is the current path; keep as history |
| `[ ]` "Owner: Cloudflare DNS + Email Sending, `WIND_EMAIL_FROM`, `CLOUDFLARE_*`" | **open** | T36 | `emailReady` still gates; no sending domain evidence |
| `[ ]` "Complete rebuilt native APK/iOS checks and provider integrations" | **open** | T49/T37/T35 | provider delivery and iOS remain separate physical/provider gates |
| `loop 19 ship (deploy eb841dcb)` | **unverifiable in this clone** | — | commit absent from object database; historical only |
| HANDOFF "Landed — do not redo" commits `2e19745`…`2b61fc4` | **landed, ancestors of HEAD** | — | no reimplementation needed; regression tests kept |
| HANDOFF "Left for Terra" #1 dual-control forgiveness | **open, decision pending** | T23/T24 | cap remains the only live control; owner must choose (a) or (b) |
| HANDOFF #2 no HTTP test for `/api/admin/approvals` | **open** | T24 | no end-to-end test found |
| HANDOFF #3 the (PG) five, "do not start" | **superseded by plan** | T27-T32 | this plan schedules them before cutover with gates closed |
| HANDOFF #4 stale docs (`SYSTEM.md:162`, native push) | **open** | T48 | confirmed above |
| HANDOFF #5 re-run `test:scenarios` uncontended | **open** | T44/T50 | browser gates share 4188; not run this turn |
| HANDOFF traps: orphan guard, ESM tests, PowerShell quoting, mutation tests, ~58 s suite, concurrent commits, probe quirks | **still true** | all | observed this turn: ESM + orphan guard confirmed, `npm test` ran ~58 s in one pass |
| HANDOFF "open at deployment level: is `X-Forwarded-For` set at all?" | **open** | T47 | `clientAddress` falls back to the socket address, which shares one bucket behind a hop |

### Remaining gaps recorded by T01 (not acceptance failures, owner tasks)

1. No isolated PostgreSQL run (`npm run test:persistence`), no `test:contracts`, no browser/scenario, no load, no device acceptance this turn. T02/T34/T44/T49 own those.
2. P2 #4 (card vs cash), the first-order promo race and the schedule-freshness claim are **unverified**, not fixed and not refuted. T02 must reproduce or dismiss each. P2 #17b is resolved in kind (partner `externalRef` dedupe), with a remaining concurrent-duplicate error-mapping question for T20.
3. `README.md:139` still instructs trusting `X-Real-IP`, which the code now ignores. Doc fix belongs to T48, not to this task.
4. SSH remains unavailable: host resolution failed this turn. Remote-only work stays blocked until the owner supplies an authorized account/key.

### Txx — title

- Status: pending / in progress / blocked / complete.
- Revision and changed-file identity:
- Source finding and reproduction:
- Issue → change → verification:
- Commands and exit codes:
- Host: k5 / explicitly labelled local fallback.
- Tier: source / fixture / isolated integration / physical Chrome / native / provider / field.
- Artifact paths (redacted):
- Unmet criteria / required access:
- Next exact step:

## Historical finding register template (T01 expands every assertion)

| Finding | Current source symbol | Disposition | Task | Evidence / reason |
|---|---|---|---|---|
| Last-known pickup GPS has no freshness bound | src/app/book.tsx openPin | Source confirmed; behavior test pending | T04 | Read during planning |
| Malformed hash can reach timingSafeEqual with invalid bytes | server/main.ts checkPassword | Source confirmed; behavior test pending | T17 | Read during planning |
| Synchronous scrypt blocks HTTP event loop | server/main.ts hashPassword/checkPassword | Source confirmed; load measurement pending | T18 | Read during planning |
| Searching-driver scope shortcut skips eligibility | server/domain/resource-scope.ts getScope | Source confirmed; isolated PG reproduction pending | T27 | Read during planning |
| Pending/timeout refund stored rejected | server/domain/payments.ts refund | Source confirmed; isolated PG reproduction pending | T28 | Read during planning |
| Ledger has import-only journal posting | server/domain/ledger.ts importLegacy | Source confirmed; lifecycle integration pending | T29/T30 | Read during planning |
| Partial COD lacks remittance path | server/domain/payments.ts remitCod | Source confirmed; lifecycle integration pending | T32 | Read during planning |

Do not use this initial sample as the completed all-findings register. T01 must include every grouped/prose item from the prior review and all unresolved historical checklist entries.

> **Superseded 29 Oct 2026:** T01 is complete. The authoritative register is the expanded set at the top of this file (`## T01 — baseline reconciliation`, sections "historical review P1" through "old unchecked checklist"). The sample and the two partial working registers below are retained as history only. Two rows here are now stale in one respect: last-known pickup GPS is bounded in the parent's uncommitted T04 diff (`src/customer-location.ts` `cachedPickup`, `src/app/book.tsx` `gpsAt`), and `editUser`/support-password audit rows have landed. Neither is device-verified.

### T01 working register — historical review P1/P2

The old review was against `b7d3c97`; dispositions below describe source inspection at `85b5a3a`, not fresh behavioral verification. Open entries require T02 reproduction or the named task's tests. Historical deployments and tests are not current acceptance evidence.

| Finding | Current source | Disposition / next task |
|---|---|---|
| P1.1 Missing workload bindings and durability | `infra/main.bicep` workload modules | Identity, database secret and OSRM bindings now present; runtime/deployment and storage acceptance remain T34/T46/T47/T50. |
| P1.2 Blank/zero/uncapped settings | `src/app/admin/settings.tsx`, `server/main.ts` admin settings | Bounds fix reported in `484e0ce`; recheck focused tests in T02. |
| P1.3 Spoofable proxy address | `server/domain/client-address.ts` | Nearest-hop helper present; actual ingress behavior remains unverified, T47. |
| P1.4 Missing CI persistence, image and selection guard | `.github/workflows/ci.yml`, `scripts/run-tests.mjs`, `tests/deployment.test.mjs` | Persistence/image jobs and orphan guard present; source still shows the Docker guard queues only `src/` targets and matches single-quoted static imports, so nested server imports remain uncovered; T44. |
| P1.5 Routing unavailable on deployed stack | `infra/main.bicep`, `server/main.ts` roadRoute | URL now configured; graph, DNS and operational health remain T05. |
| P1.6 PostgreSQL gate and live-vs-dormant claims | `server/db/runtime.ts` | Restricted staging branch exists; production readiness not established, T34/T50. |
| P2.1 Unknown refund rejected | `server/domain/payments.ts` refund | Source confirmed; isolated reproduction T02, fix T28. |
| P2.2 Live ledger stale | `server/domain/ledger.ts` postJournal/importLegacy | Import call present; verify all writers T02, fixes T29/T30. |
| P2.3 Partial COD cannot remit | `server/domain/payments.ts` remitCod | Source confirmed; T02/T32. |
| P2.4 Card/cash settlement authority | `server/domain/ledger.ts`, `server/domain/payments.ts` | Unverified integration; T02/T31. |
| P2.5 Searching-driver scope privacy | `server/domain/resource-scope.ts` getScope | Source finding carried forward; T02/T27. |
| P2.6 Support password response and audit | `server/main.ts` support password handler | Audit insert present; handler still returns a generated plaintext temporary password for support to read aloud. Existing operator-verified recovery remains until T35/T36 establish a safer verified delivery path; do not claim it is fixed. |
| P2.7 Admin user edit lacks audit | `server/main.ts` editUser | `USER_UPDATED` audit insert present; focused regression T02. |
| P2.8 Approve bypasses custody guard | `server/main.ts` approve handler | `carrying_parcels` guard present; focused regression T02. |
| P2.9 Blocking password hashing | `server/main.ts` hashPassword/checkPassword | `scryptSync` present; T02/T18. |
| P2.10 Corrupt hash throws | `server/main.ts` checkPassword | No format guard visible; T02/T17. |
| P2.11 Lost-driver remittance | `server/main.ts` recordCash and cash decision routes | Unverified current recovery path; T02/T25. |
| P2.12 Concurrent subscriptions | `server/main.ts` subscription routes | Historical single-process race was not reproduced; constraint/parity review T02/T22. |
| P2.13 Job board starvation and abuse | `server/main.ts` jobs and booking | Historical pagination fix does not establish abuse limits; T02/T21. |
| P2.14 Single-admin forgiveness | `server/main.ts` recordCash; `server/domain/ops.ts` | Policy and fail-closed approval work T23/T24; per-call cap is not second approval. |
| P2.15 Destination-change PostgreSQL parity | `server/domain/destination-change.ts` sqliteOnly | SQLite-only guard present; T02/T33. |
| P2.16 No CI image build | `.github/workflows/ci.yml` image job | Build job present; actual job outcome unverified, T02. |
| P2.17 Optional booking idempotency | `server/main.ts` booking handler | Optional requestId branch present; partner contract T20. |

### T01 working register — historical review P3

| Finding | Source / current disposition | Task |
|---|---|---|
| Proof-lock reattempt | `server/main.ts` reattempt changes status; failure-counter behavior needs reproduction | T02/T26 |
| Rating check/write race | `server/main.ts` rating updates lack a rating predicate; concurrency unverified | T02/T26 |
| Reschedule race | `server/main.ts` reschedule; historical 40-race probe did not reproduce | T02/T26 |
| First-order promo race | `server/main.ts` promoFor checks order existence; transaction boundary unverified | T02/T26 |
| Missing session user index | `server/db/postgres-schema.sql` sessions; inspect migrations too | T43 |
| Per-row order queries | `server/main.ts` order serialization; measure current query count | T43 |
| Pending booking cannot be discarded | `src/app/book.tsx` pending/locked; recovery must preserve idempotency | T19 |
| One-tap sensitive admin actions | `src/app/admin/cash.tsx`, `orders.tsx`, `users.tsx`; device behavior unverified | T41 |
| Opposing subscription actions | `src/app/admin/subscriptions.tsx`; concurrent submissions unverified | T22 |
| Arabic large-text clipping | `src/ui.tsx` fixed line heights; physical threshold unverified | T42 |
| Cold-start push deep link | `src/native-push.ts` response listener; cold-start handling unverified | T37 |
| Driver provider rerenders and repeated secure reads | `src/driver-work.tsx` polling; measure before change | T39 |
| Schedule recalculates per render | `src/app/book.tsx` scheduleSlots call; performance unmeasured | T40 |
| Arabic literals outside copy | `src/ui.tsx`; classify current literals | T42 |
| Location clears typed landmark | `src/app/book.tsx` location flow; reproduce | T04/T40 |
| Schedule freshness checks different value | `src/app/book.tsx` submit; reproduce | T40 |
| Fixed 50 ms push waits | `tests/push-server.test.mjs` settle helper present | T44 |
| Presentation suite re-import | `tests/presentation.test.mjs`; inspect runner selection | T44 |
| Duplicate contract suites | `scripts/check-contracts.mjs`; inspect runner selection | T44 |
| Decoder wall-clock regression | `tests/url-decoder.test.mjs` timeout remains | T44 |
| Persistence schemas left behind | `tests/support/pg-test-server.mjs`; verify lifecycle against isolated DB | T44 |
| Browser suites share port/export directory | test scripts; run sequentially until isolation established | T44 |
| Reschedule ownership assertion | Reported fixed in `2e19745`; verify current test in T02 | T02/T26 |
| Remote EAS version vs local release code | `app.json`, EAS config; exact accepted artifact required | T49 |
| Incorrect no-dependency claim | `server/db/persistence.ts`, docs; reconcile | T48 |
| Native push described as absent | push docs and `src/native-push.ts`; reconcile capability vs configured delivery | T37/T48 |
| Destination change described inconsistently | `server/domain/destination-change.ts`, WP17; distinguish SQLite and PostgreSQL | T33/T48 |
| Old VAPID subject | `server/worker.ts` Railway default remains; actual provider impact unverified | T37/T48 |
| Push urgency ignores shared list | `server/worker.ts` hardcoded high; policy and sender behavior unverified | T37/T48 |
| Cash formula omits promo | `server/main.ts` cashBalances and operations docs; reconcile | T48 |
| SQLite tables unused | SQLite schema and call sites; classify before removal | T48 |
| Clientless routes | Route inventory; classify internal, callback, admin, gated and missing separately | T48 |
| Specs cite nonexistent files | Spec inventory; identify each before correcting | T48 |
| Stale screenshots | Historical visual artifacts; physical acceptance needed | T42/T49 |

Other downgraded assertions: readiness lock and query performance → T43; phone recovery flood → T21/T35; Entra nonce → T35; deletion free text → T41/T48; COD collection versus payout → T32/T48; corrupt pending storage path → T19; role allow-list claim was historically rejected and must not be reopened without a new reproduction. Historical Railway and prior native checks remain historical; current Azure, exact binary and provider status are T47/T49/T50.

## Continuation — leader verification and delegation wave, 29 October 2026

- Identity: baseline `85b5a3a` plus dirty T04/T05/T17/T18-final/T23-doc tree; host: explicit local fallback (k5 still unreachable per T01; no remote claim).
- Commands, run sequentially, each exit 0: `npm run test -- --filter=customer-location` (1 suite), `npm run test -- --filter=route` (2 suites), `npm run lint`, `npm run typecheck` (app + server). This re-establishes common gates on the T18-final tree for the focused suites; the FULL `npm test` / `npm run test:persistence` rerun is deferred to the checkpoint window because five delegate worktrees currently share the machine's fixed test ports and the loopback PostgreSQL (lock protocol issued to every child).
- Checklist updated: T04 split into T04.1 (complete, unit-accepted) and T04.2 (A53 device acceptance, batched D05 pass); T05.1 marked complete (route fixtures here + pg-contracts boundary in the T02 report); T02 characterization confirmed complete, parent closes at the full-gate rerun.
- Delegation (provider: Modal DeepSeek dedicated, model `modal-deepseek/deepseek-ai/DeepSeek-V4.1-Flash-1017`, per owner choice after the Fireworks suspension and Cloudflare Free-plan rejection): wave 1 = T07+T08 Google routing proxy/budgets, T16 local place search, T27 declared-scope authorization, T44 test-harness debt; wave 2 = T28 refund uncertain outcomes. All five run in isolated worktrees, async, full-access runtime; each child carries the PostgreSQL lock protocol, file-scope limits and a commit instruction. No child may touch tasks/*.md, package files, server/main.ts, src/copy.ts or scripts/run-tests.mjs (T44 owns the latter two by exception). Integration, suite registration and merge-conflict resolution remain leader work at each wake.
- No deployment, commit on master, push, provider payment or live message occurred.

## T16 — local place search, 29 October 2026 — COMPLETE (T16.1; T16.2 device pass open)

- Delegate: T16 child on Modal DeepSeek dedicated (DeepSeek-V4.1-Flash-1017), worktree branch t3/9015813b commit `58492d8`; summary claimed all acceptance bullets met with fake-corpus unit tests. Leader review: module logic conformant (reuses servedCity, no new radius, no Places calls); component renamed to place-search-panel.tsx on integration (`.ts` shadows `.tsx`).
- Integration (leader, shared checkout): panel embedded in CityPicker sheet; saved/recent rows and forget preserved; pin-safe keptPin semantics also applied to legacy onPlace taps; six copy keys ar+en; suite registered; runner selection discipline satisfied.
- Commands, local fallback, each exit 0: `npm run test -- --filter=place-search` (1 suite), `--filter=presentation` (1), `--filter=booking-auth` (1), `--filter=customer-location` (1, earlier this turn), `npm run lint`, `npm run typecheck`. First typecheck run exit 1 (module shadowing) — fixed, rerun 0.
- Limitations: offline prop unconnected (no connectivity sensor in repo; unit-covered); device sheet checks (Arabic long labels, keyboard overlap, TalkBack) deferred to T16.2 in the D02 pass; no mutation testing of the new suite.

## Delegation wave 1-2 results and T18 liveness fix, 29 October 2026

- Provider per owner choice: Modal DeepSeek dedicated, model DeepSeek-V4.1-Flash-1017. Six children ran in isolated worktrees (T07+T08, T16, T27, T44, T28, T19); every child labelled its runs 'local worktree fallback'; none touched deployment, keys or live services.
- Landing map (delegate commit -> master integration): T16 `58492d8` -> a0efd0d; T07+T08 `db3e5b4` and T28 `c366293` -> 75d4d15; T27 `e3399ed`, T44 child work, T19 `5b66a48` and the KDF fix -> c07848b/e157554 squashed commit; T18-final leftovers and untracked routing-status -> cdda307. Checklist children record per-task evidence; integration gates re-run by leader on master.
- T44 honesty note: the child's summary cited commit 6b64010 but its worktree had an empty log with uncommitted changes; the leader committed the reviewed diff itself (62d1f5d) and treated the child's claims as unverified until re-run here.
- T18 follow-up defect (found by the leader, root-caused with minimal repros): after the async KDF conversion, CLI commands (enroll/verify-phone/delete-account) and therefore tests/deployment.test.mjs hung post-success — Node 24 on Windows re-refs a worker_threads port once it has carried a message, so spawn-time unref() never frees the loop. Fix in server/domain/passwords.ts: ref the worker only while a job runs, unref again when idle (`shortcut:` comment records the platform-specific assumption). Repro commands before fix exit-hung (60 s kill); after fix the hash/verify one-liner exits immediately and the deployment suite passes (2 suites, exit 0). This also unblocked the full-gate run that had appeared to 'time out' earlier today: the stall was this hang inside the deployment suite, not machine contention.
- Checkpoint gate (full `npm test`, `npm run test:persistence`, `npm run test:contracts`) runs sequentially in background on master after cdda307; results appended to this file when the run reports.

## T02 — close-out and partner-cancel regression fix, 29 October 2026 — COMPLETE

- Revision: `082b05b` (T20 committed) → T06 tree; host: explicitly labelled local fallback (k5 `ssh -o BatchMode=yes -o ConnectTimeout=8 k5 exit` → `Permission denied (publickey,password,keyboard-interactive)`, exit 255; no remote claim).
- Issue → change → verification: the full-gate rerun that closes T02 caught a regression the filtered gates had missed. **Issue:** the T18 KDF carve-out routes every `/api/partner/*` POST outside the HTTP envelope, but only partner *create* was given its own `persistence.atomic`; partner **cancel**'s `queuePush` then ran without a mutation transaction, and on PostgreSQL `enqueuePush` throws `Durable push requires the mutation transaction` → `500 server_error` (`/partner/orders/7/cancel` in the PG legacy-pickup parity suite; SQLite's legacy `defer` adapter hides it, so only PG caught it). **Change:** `server/main.ts` wraps the partner cancel mutation (UPDATE + queuePush + response read) in `persistence.atomic({ purpose: 'partner_api', correlationId })`, the same short boundary as partner create; `shareOrder` needs nothing (single-statement UPDATE, no push). **Verification:** reproduction first — `node scripts/check-postgres-legacy.mjs --filter=pickup` FAIL 500 both before the fix and deterministically; after the fix PG legacy pickup PASS, SQLite `--filter=pickup` PASS, and the full `npm run test:persistence` rerun exit **0** (51 suites + 21 legacy-parity suites).
- Full gates on the integrated tree, sequential, all exit 0: `npm test` (87 suites), `npm run test:persistence`, `npm run test:contracts` (90 installed + 75 additive boundaries, 174 exchanges), `npm run lint`, `npm run typecheck` (app + server).
- Tier: isolated integration (loopback PostgreSQL) + deterministic fixtures. No production data, device, provider or field claim.

## T06 — provider-aware route contract, 29 October 2026 — COMPLETE

- New `src/map-provider.ts`: `MapRenderer`/`RouteProvider` types; `platformRenderers` capability table (what is baked into the binary per `Platform.OS`); `selectRenderer` falls back to the `maplibre` baseline for unknown platforms; `routeProvider` normalizes absent (legacy) → `osrm`, `'google-routes'` string and the T07 proxy metadata object → `google`, unknown values stay unknown; `canShowOnRenderer` allows Google geometry only on a Google renderer and fails closed otherwise; `approachKey` binds kept route/ETA state to order, driver, stop and provider.
- `src/road.tsx` (`useRoad`): resolves the platform renderer once, drops any route/approach whose provenance the renderer may not show (Google content cannot reach MapLibre/Apple overlays; unknown provenance draws nothing), and keys the kept ETA by `approachKey` so a provider change drops cached state like an order/driver/stop change does.
- `server/main.ts`: `RoadRoute` gains additive `provider: 'osrm'` on the success path (old clients ignore the extra field; `tests/route.test.mjs` exact-match fixture updated deliberately). T07's Google proxy already carries provider metadata; `/api/route/google` remains a separate endpoint and none of this touches quote/feasibility/checkpoint policy.
- Tests: `tests/map.test.mjs` gains the renderer-selection matrix (unknown platform → baseline), the showability matrix (Google never on MapLibre/Apple; unknown provider nowhere), provenance normalization (absent/string/metadata/unknown) and kept-key identity assertions, plus source-wiring asserts in the style of the vendoring asserts. `tests/route.test.mjs` response fixture updated for the additive field.
- Commands, sequentially, exit 0 (local fallback): `npm run test -- --filter=map` (1 suite), `npm run test -- --filter=route` (2 suites), `npm run lint`, `npm run typecheck`, full `npm run test:persistence` 0 including PG legacy map/route parity.
- Tier: fixture + isolated integration. Device visual checks ride the D06 physical pass; no provider call was made (`GOOGLE_MAPS_SERVER_KEY` unset everywhere).

## T09 + T10.1 — Google build capability and Android Google renderer, 29 October 2026

- Host: explicitly labelled local fallback (k5 refused, exit 255, checked once this session). Revision: T02/T06 tree (38e5093) plus these changes.
- **T09** (`app.config.js`, `tests/phone-test-build.test.mjs`, `docs/implementation/native-environment.md`): separate restricted platform keys with the legacy single-key secret mapped to Android; `WIND_GOOGLE_MAPS=1` opt-in fails the build early for a missing platform key (`EAS_BUILD_PLATFORM`/`WIND_BUILD_PLATFORM`; unknown platform demands both); phone-test loopback apps cannot opt in; keys reach only the react-native-maps plugin manifest, `extra.googleMaps` bakes `{android, ios}` capability booleans; `GOOGLE_MAPS_SERVER_KEY` stays server-only. Suite cases cover all of the above including the no-key-leak assert on `extra`.
- **T10.1** (`src/google-map.native.tsx` new, `src/route-map.android.tsx`, `src/map-provider.ts`, `src/map-mode.ts` new, `src/route-map.native.tsx`, `tests/map.test.mjs`): native Google renderer with tile-loaded readiness (`onMapLoaded`, `onMapReady` asserted absent), failure unmount clearing overlays, diagram+Retry fallback, recenter/follow camera, provider-agnostic gliding `Car` reused from the Apple renderer; `selectRenderer` extended with baked-capability + preference (Google only when the binary contains it); SecureStore-backed mode defaulting to baseline; Android `RouteMap`/`PinMap` selection wired through the capability gate with the MapLibre WebView page as fallback.
- `react-native-maps` 1.27.2 exports `PROVIDER_GOOGLE` as a plain constant (`src/ProviderConstants.ts`), not `Provider.PROVIDER_GOOGLE`; typecheck caught the stale API from memory before commit.
- Commands, sequential, exit 0: `npm run test -- --filter=phone-test-build` (1 suite), `--filter=map` (1 suite), `npm run lint`, `npm run typecheck` (app + server).
- Tier: fixture/source. Physical Google-tile acceptance requires a rebuilt binary with restricted keys — blocked on Google keys, owned by T10.2/T49 (D06/D01). No emulator used; no provider call made.

## T11.1 + T12.1 — remaining Google renderer wiring and scenario-harness repair, 29 October 2026

- Host: explicitly labelled local fallback (k5 refused). T11.1 (`src/route-map.native.tsx`, `tests/map.test.mjs`): iOS resolves the renderer from the baked capability plus the stored mode; the shared native Google renderer is reused and the Apple baseline stays the default/fallback; source-asserted in the map suite. T11.2 (physical iPhone, signed build) remains blocked on hardware/signing access — never a simulator.
- **Scenario-harness repair (uncontended `npm run test:scenarios` rerun, HANDOFF #5):** two stale assumptions had broken the suite since earlier landings. (1) T19 removed the `confirmBooking` copy keys and made reconciliation automatic, while `check-scenarios.mjs` still clicked a button named `^undefined` — the lost-response branch now reloads and lets the T19 recovery find the committed order on its own (it navigates to `/order/:id`; the scenario also asserts exactly one new order row and an emptied `booking.*` storage key). (2) The driver-acceptance stage asserted the first in-flight `/api/location` upload returns `accepted: false` — reproducibly false-negative on the current tree because the first fix's age relative to the grace window decides acceptance (deterministically unit-covered in the location suites); the browser scenario now pins only its unique guarantee, that a fresh fix delivered mid-flight is uploaded next and never discarded. Full suite: 15/15 groups PASS, exit 0.
- Commands, sequential, exit 0: `npm run test -- --filter=map` (1 suite), `--filter=phone-test-build` (1 suite), `npm run test:scenarios` (15 groups), `npm run lint`, `npm run typecheck`.
- Tier: fixture + browser automation. Physical renderer acceptance (Google-keyed Android rebuild, A53 Chrome Arabic labels, iPhone) remains with T10.2/T12.2/T11.2 and the D-passes.

## T08.2 + T13 + T14 + T15 — paid-call client policy and renderer integration, 29 October 2026

- Host: explicitly labelled local fallback (k5 refused). Revision: c2e65bc plus these changes.
- **T08.2** (`src/api.ts`, `src/road.tsx`, `src/app/book.tsx`): `useApi` gains `refetchOnFocus:false` (default true keeps every free endpoint unchanged); `useRoad` builds a Google approach URL from the last billed fix — preview once per stop, then `movement&foreground=1&metres=N` at the server's 250 m `SIGNIFICANT_MOVEMENT_METRES` (mirrored client-side, equality asserted by a source read in both directions), no URL at all while backgrounded; the booking screen bills a first shown preview or a changed pin pair.
- **T13** (`src/app/book.tsx`, `src/map-provider.ts`): renderer-selected booking preview with typed-Google-failure fallback to the free OSRM line; `googlePreviewPath` URL encoding pinned by tests; money paths untouched (booking-auth 0).
- **T14** (`src/road.tsx`): provider-selected approach with the billing state machine; stale-GPS freshness, shared-run suppression, stop identity and revoked-access clearing are the existing tested behaviors (presentation 0); kept state stays bound to order/driver/stop/provider.
- **T15** (`src/route-preview.tsx`, all three renderer entries, `src/app/track/[token].tsx`): `forceBaseline` honored everywhere; the anonymous track page makes zero Google calls even in a Google-keyed build; the server ETA stays OSRM-only (share 0, route 0).
- During this wave the background checkpoint run caught a transient self-inflicted test bug (a reintroduced `notEqual` in the map suite) between edits; it was fixed and the full persistence gate rerun clean: `npm run test:persistence` exit **0** (51 suites + 21 legacy-parity suites), `npm run test:contracts` exit **0**.
- Commands, sequential, exit 0 on the wave tree: `--filter=map`, `--filter=presentation`, `--filter=booking-auth`, `--filter=share`, `npm run typecheck`, `npm run lint` (0 errors). Full `npm test` + `test:scenarios` run at the C05 window.
- Tier: fixture + browser automation. Physical Google-enabled booking/tracking acceptance needs a Google-keyed rebuild (T10.2) and rides D06/D07/D10/D12.
