# Fastship root — all-work review handoff

Updated **2026-11-25** from thread `61cc8c8d-db40-419d-b03e-7d91529e19c0` ([Code Quality Review](t3-thread://v2/df03bf3c-4d3a-48a0-99d2-0f5d8252ce8d/61cc8c8d-db40-419d-b03e-7d91529e19c0), runs 1–29) to hand over the full session context and verified working-tree state for the next agent to review all work.

## 1. Repository & boundary

- **Repository root:** `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship`
- **Branch:** `master`
- **HEAD:** `b60922952d607f698eee24b9c68ac3394daecd3c` (`docs(rea): full claims verification + reconciliation`) — intentionally kept as-is (do **not** commit, push, merge, reset, rebase, or deploy).
- **Working-tree size (verified directly on disk):**
  - `git status --short`: **389 entries** (**258** modified tracked ` M` + **131** untracked `??`; **102** entries touch `docs/screens`).
  - `git diff --shortstat`: **258 files changed, 4,150 insertions(+), 9,288 deletions(-)**.
  - `git diff --shortstat -- . ':!docs/screens/**'`: **159 files changed, 4,127 insertions(+), 9,286 deletions(-)**.
  - Product/test/script/contract/dependency subset (`server/ src/ tests/ scripts/ vendor/ package.json package-lock.json docs/implementation/contracts/`): **124 tracked files changed, 3,436 insertions(+), 9,175 deletions(-)**, plus untracked runtime/test/script files.
- **Review rule:** This is a multi-workstream dirty tree, not one single-feature diff. Split the review by ownership (Section 6) and exclude `docs/screens/**` from line diffs.

---

## 2. Session chronology & what was completed

1. **Runs 1–5 (Initial full-tree review):** Reviewed the dirty working tree vs `HEAD` (`b609229`) with parallel reviewers (failing over from `nvidia-kimi/kimi-k3.1-pro` to `codex/gpt-6.2-sol` and `claudeAgent/claude-sonnet-5-5`). Found **1 Critical**, **14 Required**, **8 Optional**, and **1 Nit**, plus a blocked default gate (`tests/admin-review.test.mjs` was 0-byte and unregistered).
2. **Runs 6–17 (All fixes + follow-up review + contract baselines):** Implemented fixes across the Critical/Required/Optional findings, resolved 4 follow-up findings (SQLite booking retry race, COD `payoutRef` validation, ETag `If-None-Match` handling, SQLite `orders.version` migration test), and re-recorded the declared contract baselines ([schema.json](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/implementation/contracts/schema.json), [fixtures.json](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/implementation/contracts/fixtures.json), [additive-endpoints.json](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/implementation/contracts/additive-endpoints.json)).
3. **Run 18:** Wrote the initial [HANDOFF-2026-11-25-ROOT-ALL-WORK-REVIEW.md](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/HANDOFF-2026-11-25-ROOT-ALL-WORK-REVIEW.md) while full integration & PG18 were still queued.
4. **Runs 19–20 (Full integration pass + PG18 import fix + sandbox blockers):**
   - Full integration gate (**107 suites**), `typecheck`, `lint`, and `check:audit` passed prior to the PG18 import change.
   - Running persistence on PG 18.3 (`sandbox-pg18-host`, port `55474`) exposed a real reconciliation failure in [tests/pg-import.mjs:71](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/pg-import.mjs#L71) (`orders.version` trigger drift between SQLite snapshot and PG target).
   - Fixed in [server/migrate.ts:25-26](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/migrate.ts#L25-L26) (`stable()` excludes derived `version` from row comparison hashes) and updated [tests/pg-import.mjs:70-73](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/pg-import.mjs#L70-L73). `pg-import` passed in isolation; the subsequent full `test:persistence` run on PG18 hit sandbox disk exhaustion and container stop/refusal.
5. **Runs 21–29 (Cleanup & handoff verification):** Removed leftover debug files (`.review-pg-import-debug.mjs`, `review-pg18-cleanup.bash`, remote `tests/pg-import.debug.mjs`) and verified current file states and line numbers directly for this handoff.

---

## 3. Verified code-change inventory (with exact line refs)

### Critical & Required items verified in current source
1. **Malformed request target crash (`//[::1`):** [server/main.ts:3159-3162](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/main.ts#L3159-L3162) & [server/main.ts:3282-3285](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/main.ts#L3282-L3285) — parses `URL` once into `parsedUrl` and guards catch-block `offerFailure` decoration on `parsedUrl`; raw-socket regression at [tests/deployment.test.mjs:106-142](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/deployment.test.mjs#L106-L142).
2. **Default gate orphaned empty test:** [tests/admin-review.test.mjs](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/admin-review.test.mjs) (207 lines, 4 UI regressions) is implemented and registered in [scripts/run-tests.mjs:27](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/scripts/run-tests.mjs#L27).
3. **Stored command boarding PIN disclosure:** [server/domain/commands.ts:44-65](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/domain/commands.ts#L44-L65) strips `ride.boardingCode` and `journey.boarding.pin` (`shouldShow: false`) on replay when `!ownPassenger`; regression at [tests/commands.mjs:65-83](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/commands.mjs#L65-L83).
4. **Booking vs. account deletion race:** [server/main.ts:864-865](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/main.ts#L864-L865) (`deleteAccount`) and [server/main.ts:1334-1336](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/main.ts#L1334-L1336) (`createOrder`) share the per-customer lock (`pg_advisory_xact_lock(hashtextextended('wind_searching_cap', ?))` inside `BEGIN IMMEDIATE` / `persistence.atomic`), and [server/main.ts:1562-1565](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/main.ts#L1562-L1565) re-runs `authorize()` after acquiring the lock; regression at [tests/booking-auth.test.mjs:189-205](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/booking-auth.test.mjs#L189-L205).
5. **Reassigned driver `fare.changed` leak:** [server/main.ts:3102-3106](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/main.ts#L3102-L3106) filters `fare.changed` events by `Number(event.payload.assignmentEpoch) === Number(order.assignment_epoch)` for the assigned driver; regression at [tests/journey.mjs:60-101](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/journey.mjs#L60-L101).
6. **Concurrent booking retry `quote_consumed` race:** [server/main.ts:1562-1575](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/main.ts#L1562-L1575) re-checks `replay()` inside the lock (`afterLock`) and replays on PG unique violation `23505`; SQLite concurrent retry test at [tests/booking-auth.test.mjs:161-187](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/booking-auth.test.mjs#L161-L187).
7. **SQLite recovery versions:** [server/db/sqlite-schema.ts:133](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/db/sqlite-schema.ts#L133) & [server/db/sqlite-schema.ts:140-143](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/db/sqlite-schema.ts#L140-L143) add `orders.version` and `orders_recovery_revision` trigger; [server/main.ts:1698-1702](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/main.ts#L1698-L1702) reads `row.version`; tested at [tests/driver-recovery-api.test.mjs:30-70](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/driver-recovery-api.test.mjs#L30-L70) and [tests/sqlite-review.test.mjs:65-77](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/sqlite-review.test.mjs#L65-L77).
8. **Password reset atomic code consumption:** [server/main.ts:800-817](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/main.ts#L800-L817) validates first (`consume=false`), then atomically deletes `email_codes`, checks `users` (`FOR UPDATE` on PG), updates password, revokes `sessions`, and clears login rate limits in one transaction; tested in [tests/pg-dialect.mjs:69](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/pg-dialect.mjs#L69).
9. **COD remittance `payoutRef` idempotency & validation:** [server/domain/payments.ts:187](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/domain/payments.ts#L187) checks `isWellFormed()` + length `<= 200`, binds `${requestId}#${encodeURIComponent(payoutRef)}`, rejects mismatched retries with `409 idempotency_conflict`, and replays bound `payout_ref`; tested at [tests/payments.mjs:214-237](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/payments.mjs#L214-L237).
10. **Decoder lockfile & nested vendor nit:** [package-lock.json:12256-12259](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/package-lock.json#L12256-L12259) declares `vendor/decode-uri-component` at `0.5.1`; the duplicate nested `vendor/decode-uri-component/decode-uri-component/package.json` has been removed.
11. **Saved driver command vs. new intent:** [src/driver-recovery.ts:8-9](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/driver-recovery.ts#L8-L9) & [src/driver-recovery.ts:29](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/driver-recovery.ts#L29) enforce `sameIntent(saved, action, payload)` and throw `409 driver_command_pending` on mismatch.
12. **Sign-out token cleanup on keystore failure:** [src/session.tsx:76-77](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/session.tsx#L76-L77) falls back to `endedCredential` on `storage.get('token')` failure and catches `storage.set('token', null)` errors so `forget` never rejects.
13. **Admin 5-tab bar:** [src/app/admin/_layout.tsx:9](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/app/admin/_layout.tsx#L9) hides `['cash', 'account']`; tested at [tests/admin-review.test.mjs:66-84](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/admin-review.test.mjs#L66-L84).
14. **Expired phone challenge error visibility:** [src/phone-card.tsx:232-233](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/phone-card.tsx#L232-L233) keeps `<ErrorText>{error}</ErrorText>` outside `!expired`; tested at [tests/admin-review.test.mjs:143-204](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/admin-review.test.mjs#L143-L204).
15. **Map ETag & PG18 import reconciliation:** [server/main.ts:125-127](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/main.ts#L125-L127) & [tests/map-cache.test.mjs:23-24](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/map-cache.test.mjs#L23-L24); [server/migrate.ts:25-26](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/migrate.ts#L25-L26) & [tests/pg-import.mjs:70-73](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/pg-import.mjs#L70-L73).

### Optional review items verified fixed
- [src/road.tsx:44-53](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/road.tsx#L44-L53): 1 Hz clock runs only when `foreground && hasDriver`.
- [src/offline-recovery.ts:33](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/offline-recovery.ts#L33): skips re-encrypt/write when cached `actorId`, `role`, and `orders` match.
- [src/session.tsx:165-169](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/session.tsx#L165-L169): restarts `startDiagnosticDelivery()` on `[actorId, actorRole, actorStatus]`.
- [src/map-provider-boundary.tsx:39-65](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/map-provider-boundary.tsx#L39-L65): exhausted-state recovery (`online` / `AppState` active) and overlaid Retry button live in the boundary.
- [src/runtime-config.ts:36](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/runtime-config.ts#L36): rejects `initialMapProvider === 'google'` without `'baseline'` in `fallbackMapProviders`.
- [src/app/admin/index.tsx:90-136](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/app/admin/index.tsx#L90-L136): newest profit bar reports `onLayout` to `Rail`'s `reveal` ([tests/admin-review.test.mjs:114-139](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/admin-review.test.mjs#L114-L139)).
- [src/parts.tsx:464](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/parts.tsx#L464): hides self-delete for `admin` ([tests/admin-review.test.mjs:88-110](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/admin-review.test.mjs#L88-L110)).

---

## 4. Open defect / discrepancy found during handoff check

- **Original Required item #13 is still present in [src/app/driver/index.tsx:45-51](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/app/driver/index.tsx#L45-L51):**
  - `useFocusEffect` still has `[hasDispatch]` in its `useCallback` dependency list (`focusRevision.current++` runs on setup and cleanup whenever `hasDispatch` changes).
  - If polling removes the last dispatch offer while `accept()` (`lines 75-110`) or `offer()` (`line 113+`) is in flight, `current()` returns `false`, causing the catch block (`lines 95, 100`) to exit early without showing `actionError` or reconciling an ambiguous commit.
  - Note: [tests/driver-presence-card.test.mjs:94-97](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/driver-presence-card.test.mjs#L94-L97) asserts every `useEffect` in `src/app/driver/index.tsx` matches `announceForAccessibility`, so keep focus revision purely on screen focus/blur (empty `[]` deps on `useFocusEffect`) and manage the `hasDispatch` 1s ticker without tripping that rule (e.g. a dedicated hook/helper or updating the test rule if adding a separate `useEffect`).

---

## 5. Gate status & exact environment blockers

- **Last green run (Run 17–18, *before* the Run 19 edit to [server/migrate.ts](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/migrate.ts) and [tests/pg-import.mjs](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/tests/pg-import.mjs)):**
  - `npm run typecheck`, `npm run lint`, `npm run check:audit` (13 moderate, 0 high/critical), and all **107 integration suites** (`scripts/run-tests.mjs`) passed in the Docker sandbox.
  - **Action required:** Re-run `powershell.exe -NoProfile -File .\test.ps1` so the final tree (including `server/migrate.ts` + `tests/pg-import.mjs`) has a fresh post-edit gate pass.
- **PostgreSQL 18 persistence (`npm run test:persistence`) — NOT green due to Docker sandbox environment blockers:**
  - Sandbox (`sbx_001m7sknp49sr4g8bytx182r0z2@sbx_cloud`, remote tree `/home/agent/workspace/wind`):
    - Default `sandbox-pg-host` is **PostgreSQL 16.4** (`postgis/postgis:16-3.4`, Up 5 days). Persistence requires **PostgreSQL 18**.
    - `sandbox-pg18-host` (`postgis/postgis:18-3.6`, port `55474`) is in **`Exited (1)`** state, and `ECONNREFUSED 127.0.0.1:55474` occurs on connection.
    - Sandbox overlay disk is full: `overlay 30G 30G 11M 100% /` (caused PG `PANIC 53100: could not write to file pg_wal/xlogtemp.339: No space left on device` during `tests/commands.mjs`). Leftover `Created` containers `blissful_wilson` and `vigorous_mahavira` also exist.
  - **Recovery steps for PG18 persistence** (after owner/admin frees space on the sandbox overlay, e.g., pruning unused containers/images/volumes, and starts `sandbox-pg18-host`):
    ```sh
    docker start sandbox-pg18-host
    docker exec sandbox-pg18-host pg_isready -U fastship_test -h 127.0.0.1
    export PATH=/home/agent/node24/bin:$PATH
    cd /home/agent/workspace/wind
    export WIND_TEST_DATABASE_URL=postgresql://fastship_test@127.0.0.1:55474/fastship_test
    npm run test:persistence
    ```
  - **Full default gate** (runs on `sbx_001m7sknp49sr4g8bytx182r0z2`, never run `npm ci` or `npm install` in the sandbox and never run the automated suite directly on Windows):
    ```powershell
    powershell.exe -NoProfile -File .\test.ps1
    ```

---

## 6. How the next agent should review all work

Split the review by ownership using scoped diffs (excluding `docs/screens/**`):

1. **Server, DB & Contracts:**
   - `git diff -- server/ docs/implementation/contracts/`
   - Inspect [server/main.ts](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/main.ts), [server/migrate.ts](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/migrate.ts), [server/db/sqlite-schema.ts](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/db/sqlite-schema.ts), [server/db/postgres-schema.ts](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/db/postgres-schema.ts), `server/domain/*` (including untracked `booking-receipts.ts`, `driver-receipts.ts`, `journey.ts`, `opencode.ts`, `runtime-readiness.ts`), and `docs/implementation/contracts/*.json`.
   - Verify whether ignoring `version` in `stable()` ([server/migrate.ts:26](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/migrate.ts#L26)) could mask unintended `version` drift on non-`orders` tables (e.g., `cash_entries`), or should be scoped specifically to `orders` / trigger-derived fields.
2. **Client (Recovery, Maps, Auth, Admin, Driver, UI):**
   - `git diff -- src/` plus untracked `src/*.ts(x)` and `src/app/admin/account.tsx`.
   - Fix or flag [src/app/driver/index.tsx:45-51](file:///C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/app/driver/index.tsx#L45-L51) (`hasDispatch` still inside `useFocusEffect`).
3. **Tests & Runners:**
   - `git diff -- tests/ scripts/` plus untracked `tests/*.test.mjs`, `tests/journey.mjs`, `scripts/check-*.mjs`.
   - Confirm `package-lock.json` diff (beyond `decode-uri-component`) is intentional before merging/committing.
4. **Infra, Dependencies, Docs & Screenshots:**
   - `git diff -- package.json package-lock.json vendor/ Dockerfile infra/ eas.json plugins/ .github/workflows/ci.yml`
   - Review `docs/screens/**` (102 entries) visually if needed rather than via text diff; treat `docs/`, `reports/`, `research/`, `research_notes/` untracked archives separately from runtime code.

### Hard project constraints
- **No commits, pushes, PRs, deployments, or production migrations** unless explicitly requested.
- **Automated tests run only in the Docker cloud sandbox (`.\test.ps1`)**, never directly on Windows, and never `npm ci` / `npm install` in the sandbox.
- **Physical device rule:** Never start an emulator; physical acceptance uses attached Android phone `SM-A5360` (`adb` serial `R5CTB0FJP9Z`) with `adb reverse`.

---

## 7. Closure — 25 Nov 2026, 20:35 UTC (Claude Opus 5.5)

Sections 4 and 5 above are **superseded**. HEAD is still `b609229`; nothing was committed, pushed or deployed.

**Fixes after the handoff**
- `src/app/driver/index.tsx` focus revision (§4): fixed by the original thread after this file was written (`useFocusEffect` deps `[]`; 1 Hz clock via `useSecondTick(focused && hasDispatch)` in `src/parts.tsx`). Its regression in `tests/admin-review.test.mjs` could not run (the React stub had no `useMemo`); stub fixed. Mutation-checked: putting `[hasDispatch]` back makes the case fail (`acceptance error must surface after hasDispatch flips: []`).
- `.dockerignore` / `.railwayignore`: `!scripts/runtime-sources.mjs` added by the original thread (the Dockerfile copies it); covered by `tests/deployment.test.mjs`.
- `server/migrate.ts` (§6.1 question): `stable()` is a pure serializer again. Only `orders.version` is left out of **row-content** comparison (`DERIVED_COLUMNS`); `keyOf` identities, the financial comparison and every other table compare all imported columns. `tests/pg-import.mjs` proves both directions inside a rolled-back transaction (orders.version drift = 0 mismatches; a `users.name` change = exactly one `users` mismatch).
- `package-lock.json`: restored the `node_modules/@emnapi/core` and `@emnapi/runtime` entries (1.10.0, identical to HEAD). `@unrs/resolver-binding-wasm32-wasi` still pins them; dropping them left an incomplete lockfile that breaks `npm ci` on other npm versions. Remaining lock diff = `decode-uri-component` 0.5.0→0.5.1 plus npm `peer`/`libc` metadata.
- Runner `~/.docker-sandbox/sbx_sync.sh`: the dependency rsync excluded `'./decode-uri-component'` etc., which rsync never matches. The local junctions were sent as non-regular files and rsync aborted after `--delete` had removed the remote copy. Patterns are now root-anchored (`'/decode-uri-component'`, …); backup in the session scratchpad.

**Gates (Docker cloud sandbox `sbx_001m7sknp49sr4g8bytx182r0z2`, final tree)**
- `npm test`: **107 integration suites passed** (includes clean-checkout typecheck, contracts, audit gate, Azure IaC).
- `npm run lint`, `npm run typecheck`, `npm run check:audit`: exit 0.
- `test:persistence` on **PostgreSQL 18** (`sandbox-pg18-host`, :55474): all **52 suites** + legacy PostgreSQL suites passed (first 33 in one run, the remaining 19 + legacy after the disk fix below; `pg-import` re-run alone: `ok:true`).

**Sandbox environment**
- The overlay is ~99% full of other projects' images (`smartstore-*`, `souq-*`, `pool-work-*`, `android-sdk:36`) and `workspace/projects-verification` (6.5 GB). Those were left alone.
- Freed only regenerable space: unused Docker build cache (543 MB) and the sandbox npm cache (588 MB; the gate never installs there).
- `sandbox-pg18-host`: `ALTER SYSTEM SET max_wal_size='256MB', min_wal_size='80MB'` (default 1 GB of WAL is what filled the disk). Test-only container; persists across restarts.
- About 420 MB free after the runs. The next large job needs the owner to prune the other projects' images.
