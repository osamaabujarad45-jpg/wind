# Fable continuation — review fixes and current evidence, 14 November 2026

> **Next agent:** use [`../HANDOFF-2026-11-14-FABLE-5.2-FINAL-IMPLEMENTATION.md`](../HANDOFF-2026-11-14-FABLE-5.2-FINAL-IMPLEMENTATION.md) as the connected implementation guide; this file is the issue/evidence ledger.

**Production verdict: NO-GO.** This addendum records source changes and local verification after the independent Fable reviews. It does not authorize deployment, production migration, payment activation, paid AWS work, or a Git mutation. The current integration result is **109 suites passed**. Full persistence also completed **exit 0** with 52 selected suites plus the legacy runner on the final source.

## Current verification snapshot

| Check | Current result | Evidence |
|---|---|---|
| Typecheck | **LOCAL FALLBACK PASS**, exit 0 | `continuation/current-source-static-gates/typecheck.log` |
| Expo lint | **LOCAL FALLBACK PASS**, exit 0 | `continuation/current-source-static-gates/lint.log` |
| Dependency policy audit | **PASS**, `rejected:[]`; 13 moderate + 1 low remain reported | `npm run check:audit`; `.artifacts/dependency-audit/raw.json` |
| Full integration | **PASS — 109 suites**, exit 0 | `continuation/current-source-static-gates/integration-partner-fixes-final.log` |
| PostgreSQL frozen contracts | **PASS — 90 installed + 80 additive boundaries, 21 transitions, 174 exchanges, readiness schema 30** | direct `tests/pg-contracts.mjs` run |
| Import and old-snapshot compatibility | **PASS** — pre-change and current snapshots, terminal rejection preserved, `pg_dump`/`pg_restore`, exact reconciliation and HTTP parity | direct `tests/pg-import.mjs` runs and `legacy-report.json` in the disposable fixture |
| Full persistence | **PASS — exit 0, 52 selected suites plus legacy runner** | `continuation/current-source-static-gates/persistence-partner-fixes-final.log` |
| Preferred remote host | **UNAVAILABLE** — `Permission denied (publickey,password,keyboard-interactive)` | All results above are explicitly labelled local fallback |
| Production | **NO-GO** — no authenticated production journey, human alert, replacement-host recovery, or complete field/accessibility matrix | Remaining gates below |

The common evidence root is `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\`. `result.json` in `continuation/current-source-static-gates/` is valid structured evidence, replacing the earlier accidentally appended invalid form.

## Review findings and exact changes

| Finding | Exact change | Proof |
|---|---|---|
| Retry could lose a committed command at the searching cap | `server/main.ts` takes the customer advisory lock before transactional replay; the client retains `too_many_searching` | `tests/booking-retry-race.test.mjs` starts with four searching orders and proves one fifth order plus successful same-order replay |
| Quoted booking could commit after authority revocation during asynchronous work | `createOrder` accepts an authorize callback and revalidates immediately before quoted and legacy inserts | `tests/booking-quoted-authority.test.mjs`: logout, block, role change and deletion, with and without `requestId`, on real PostgreSQL quotes |
| Revoked session could receive replayed private order data after a lock wait | Reauthorize after the customer lock before raced replay, before terminal-rejection winner handling/recording, and before a 23505 replay return | Two-session regression: A changes password, preserving A and revoking B; B receives 401 while A retains the committed receipt |
| Genuine rejection could freeze the composer | Add `order_command_rejections` on SQLite/PostgreSQL; only `quote_expired` and `promo_used` become terminal. Receipt returns `present`/`absent`/`unknown`; null remains unknown; success wins over rejection; changed-payload keys conflict | `tests/booking-auth.test.mjs` covers `promo_used` on SQLite; `tests/booking-quoted-authority.test.mjs` covers `quote_expired` on PostgreSQL; immediate `checkPending` reconciles the foreground |
| Cash-trigger fix applied only to fresh schemas | PostgreSQL migration 30 replaces `immutable_cash` on old and fresh schemas while preserving amount and repeat-decision immutability | `tests/pg-cash.mjs` creates an old function with markers 3–29 and verifies one resolution plus protected failures |
| Older SQLite v3 snapshots lost compatibility | `server/migrate.ts` permits only `order_command_rejections` to be absent from older snapshots; when present it still imports and reconciles normally | `tests/pg-import.mjs` covers both absent and present rejection tables; no exclusion or dropped terminal outcomes |
| SQLite partner could persist an order after rejection | Partner creation now uses an explicit SQLite transaction covering both the order and external reference | `tests/partner-atomic.test.mjs`: rejected scope and injected reference failure leave both tables empty; valid replay maps exactly one order |
| Partner retry checked the cap before replay | External-reference replay now occurs under the customer advisory lock before creation/cap validation | `tests/partner-retry-race.test.mjs`: two concurrent calls at cap return one fifth order/reference; changed payload conflicts |
| Readiness accepted schemas too old for booking replay | `/api/ready` now requires migration 30 while preserving the existing 3–21 migration-count check | `tests/db-api.test.mjs`: schema 21 returns 503; migration 30 restores readiness and booking/receipt behavior |
| Additive contract gaps | Restore `POST /api/me/delete/challenge` (401) and declare `GET /api/orders/commands/([^/]+)` (401) | Frozen contracts now cover 80 additive boundaries |
| Untranslated sixth admin tab | Hide `account` and `cash` from the shared tab bar while preserving their routes | `tests/phone-ui.test.mjs` computes exactly five visible tabs and checks translated titles |
| Deliberate race exceeded the default 500 ms lock budget | `WIND_TEST_POSTGRES_LOCK_TIMEOUT_MS` configures only the isolated test pool; production default remains 500 ms; waiter selection targets `wind_searching_cap` | Cap and revoked-session races complete without converting arbitrary 503 responses into success |
| Contract fixtures drifted | Deliberately add only `order_command_rejections` to the SQLite schema fixture; readiness expects migration 30 | `docs/implementation/contracts/schema.json`, `tests/pg-contracts.mjs` |

All new regression cases failed before their corresponding fixes for the intended reason, except where a fixture first needed correction (schema-name length, immutable quote expiry, and OSRM import timing). Those fixture failures are retained under `continuation/tdd-red/`; green reruns are under `continuation/tdd-green/`.

## Evidence boundaries that must not be lost

- **N+1:** real versionCode 27 → 28 preserved the pending command and `firstInstallTime`; read-only receipt reconciliation automatically recovered order 6 with no second POST. Manual Retry was not offered and remains **[U]**.
- **C-01:** remains **FAIL** as acceptance. The `phoneTest` path deliberately skips normal saved-summary loading, so the result does not establish an ordinary-sign-in defect; production behavior remains **[U]** until a manual-sign-in QA run.
- **D-04 / X-05:** remain **PARTIAL** for presence, exact race windows and previous-account background-tracking proof.
- **D-05 / A-06:** only their documented scoped sandbox cases pass. They do not prove two physical clients, PostgreSQL dispatch leases, or production behavior.
- **Cash handover:** the 300-cent admin-record/driver-confirm flow is not A11 door-collected variance.
- **Restore:** app-level isolated readiness in 1.254967 seconds is not full replacement-host RTO/RPO.
- **Demos:** the earlier original-demo harness records **15/15 local package gates passing**, including Souq’s **24 earlier selfchecks**. It predates the APKs and newer uncommitted Maps/API/persistence work; installed APKs and current source are different revisions. This is static package evidence only, not runtime/device or production behavior. See `other-session/final-demos/summary.json`, `wind-comp-souq/05-selfcheck.stdout.log`, and [the redacted competitor inventory](COMPETITOR-THREAD-INVENTORY-2026-11-14.md).

## Native QA build and physical acceptance

- **Version-29 role builds:** customer SHA-256 `5a3f49e3bcb18ba6409f673f3941cc0c089ddc17508f75400369bc1d06bf0404`, driver `c93552161cf73b452a5eb38997af8270cb793b3f9b75b09e6071c1169adea811`, admin `384a72bff4575ea8fee367d32a46332766d27aa64f43700339a6628c4f7ff3c9`. ZIP CRCs, role configuration and loopback 4192 endpoints pass; production CloudFront and retired Azure hosts are absent. Evidence: `.expo/phone-qa-4192/apks-final-review-29/artifact-verification.json`.
- **Physical smoke:** all three roles cold-launch without sign-in or Metro and show the expected synthetic identities on `SM-A5360`.
- **Admin navigation:** five translated tabs are visible; Settings → Account → Back works. Evidence: `.expo/phone-qa-4192/device/admin-tabs-results.json` and its four screenshot/text pairs.
- **Cash:** admin recorded 300 cents; the driver confirmed the same entry and both role APIs report zero owed/pending. The note field was empty, so the fixture-specific script correctly refused it; the same pending entry was confirmed through the driver UI instead of weakening that assertion. Evidence: `.expo/phone-qa-4192/device/cash-final-results.json`.
- The first default-version-1 install was rejected as a downgrade and no app data was cleared. Version 29 then installed successfully over version 28. The first admin-account assertion used exact whole-node matching and was corrected after the screenshot proved the route was correct; the navigation check now passes.

- **Ambiguous booking recovery:** on version 29 through isolated proxy 4194, the first order committed upstream with HTTP 200, the client received a synthetic 409, and Retry reused requestId `a3c638bd-5489-476a-bf89-eb000bca838d` to return the same order **4** with a matching receipt. No duplicate order was created. Evidence: `.expo/phone-qa-4194/device/ambiguous-results.json` and its three screenshots. Artifact SHA-256: `8d3f7c633873706fc9def9a6d4c638c75fdb173109576fd2ca9bea4fdc4e3316`. Port 4193 belonged to an older acceptance proxy and was not stopped. No production journey is implied by these sandbox results.

## Independent review state

- Kimi independently reviewed report reconciliation and sensitive booking/auth/migration changes. Its findings led to replay authorization, immediate foreground reconciliation, receipt-contract and exact-tab checks. Its second-round recheck closed all four findings by inspection and explicitly preserved the residual limits: PostgreSQL cases skip without `WIND_TEST_DATABASE_URL`, the sliced client test does not render the full absent→Edit/Discard flow, and reported gates were not independently reproduced. Its partner-integrity recheck also found no definite correctness/security issue; the actual 109-suite log contains both partner checks.
- Codex `gpt-6.1-sol` at high effort reviewed the full mission and the fixes. Its findings led to cap replay, quoted authority, durable terminal outcomes, forward migration repair, revoked-session replay and old-snapshot compatibility fixes. Its focused second-round recheck found both P2 issues closed by code inspection, with no definite remaining correctness/security issue in that scope.
- The final broad Codex review identified SQLite partner atomicity, partner cap replay and readiness-version gaps. Its focused partner-integrity recheck closed all three with no definite remaining P1/P2 issue in scope. No final broad-review result is inferred beyond that recorded recheck.
- Codex `gpt-6.1-sol` at high effort also rechecked the corrected execution handoff. Its final bounded review found the local-fallback contradiction closed and no definite unsafe or contradictory execution instruction remaining. It judged the package suitable for Fable to continue scoped implementation, with fresh remote candidate verification, complete source inventory, owner decisions, physical/field acceptance, live operations, update distribution and authorized production journey still open. This was documentation inspection only, not runtime or production proof.

## Remaining release blockers

1. Authenticated production customer → driver → cash → admin → driver-confirmation journey with an owner-approved dedicated test account.
2. Live-host non-secret environment/digest/counts and a timed replacement-host restore with RTO/RPO.
3. One induced missed-backup alert received and acknowledged by a named human using an owner-approved destination/spend posture.
4. Stable APK hosting, `EXPO_PUBLIC_UPDATE_URL`, compatible `WIND_MIN_CLIENT_BUILD`, and an exercised old-build forced update.
5. A11 immutable door-collected amount and typed variance, A13 versioned notification channels, A12 priority, A14 alarm re-arm, A5 shift/queue/custody, and visible disabled states in the accepted sequence.
6. Remaining physical field matrix, including manual-sign-in C-01, background tracking, network/process lifecycle, Arabic/English maximum text, TalkBack, and notification token lifecycle.
Native QA rebuild/acceptance and independent review closure are **complete for this pass**. The current readiness subset is **15 PASS / 2 PARTIAL / 5 FAIL**, with two documented zero-row schema exceptions preserved by decision; it is not production approval. No production GO is implied by the current green integration, persistence and sandbox checks.
