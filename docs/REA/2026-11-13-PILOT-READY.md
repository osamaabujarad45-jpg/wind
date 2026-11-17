# PILOT-READY — a measurable definition of done

**Purpose:** the current verdict is NO-GO, which says what is wrong. This says what *done* looks like,
in numbers and commands, so the verdict can flip on evidence rather than opinion.

**How to use it:** this is a **22-criterion readiness subset**, not a complete production-GO definition.
The connected release, update, product and operational gates in the final implementation brief are also required.
A gate is PASS only with the command and its output recorded beside it. "Should work", "covered by a test elsewhere" and "the code looks right" are FAIL.

---

## Gate 1 — Data can be recovered (the one that matters most)

| # | Criterion | How it is proven | Status |
|---|---|---|---|
| 1.1 | A backup is produced nightly without human action | an object in `s3://wind-backups-083712835043/` stamped with the previous 03:10Z slot, and `PRAGMA integrity_check` = `ok` on the decompressed copy | **PASS** — 13 Nov `wind-20261113T031001Z.db.gz`, integrity ok, 364,544 B |
| 1.2 | That backup actually **restores** | restore it into a throwaway directory, `PRAGMA integrity_check` = `ok`, row counts match the live baseline table by table; preserve evidence and disposable fixtures unless separately authorized for cleanup | **PARTIAL — local restore and API boot verified; live-host baseline and replacement-host recovery remain [U]** |
| 1.3 | A missed run is noticed within an hour | deliberately skip one run and confirm an alert arrives somewhere a human reads | **FAIL** — no proven human notification. The in-app `backupStale` mechanism exists, but the restored backup has zero `push_subscriptions`; no external Wind alarm/destination was demonstrated |
| 1.4 | The restored schema is the schema the code expects | document the exception set: exactly `firebase_resets` and `native_push_tokens`, both zero rows and preserved; no unexplained differences | **PASS with documented exceptions** — `native_push_tokens` is PostgreSQL-only/inactive on SQLite and `firebase_resets` is an orphaned zero-row legacy table. Both are preserved by decision, not deletion candidates |

Gate 1 is the whole pilot. Until 1.2 passes, everything else is a bet.

## Gate 2 — The core journey cannot lose an order

| # | Criterion | How it is proven | Status |
|---|---|---|---|
| 2.1 | A post-lock refusal keeps the persisted command | `node tests/booking-retry-race.test.mjs` exits 0 | **PASS** |
| 2.2 | The server-side retry race is raced for real | same suite, **Part A runs** rather than printing `SKIP` | **PASS — current local PostgreSQL 18.3 fixture: at the searching cap, the concurrent committed command returns HTTP 200 with the original order and receipt; revoked-session replay returns 401** |
| 2.3 | A customer whose command is ambiguous can recover | manual: force a 409 post-lock, confirm the pending card offers Retry and that Retry lands on the committed order | **PASS** — on version-29 `SM-A5360`, proxy 4194 injected one client 409 after upstream committed order 4; Retry reused requestId `a3c638bd-5489-476a-bf89-eb000bca838d`, returned order 4 with HTTP 200, and `/orders/commands/<requestId>` confirmed the same receipt. Evidence: `.expo/phone-qa-4194/device/ambiguous-results.json` |

## Gate 3 — Money is accountable

| # | Criterion | How it is proven | Status |
|---|---|---|---|
| 3.1 | The cash ledger cannot be rewritten | triggers `cash_entries_no_delete`, `cash_entries_no_edit` present; an `UPDATE`/`DELETE` attempt fails | **PASS** — trigger definitions present and `tests/cash.test.mjs` exercises the protected ledger in the integration gate |
| 3.2 | Payment state is unambiguous | either payments are **off by design and visibly so** in the UI, or a real provider is wired and `payment_intents` is reachable | **FAIL — neither.** No provider exists (`payments.ts:29-31`), and the SQLite gate returns 409 at runtime |
| 3.3 | Collected vs expected is reconciled per order | a collected amount below the total records a variance with a reason, and cannot be edited after | **FAIL** — A11 in the backlog |

## Gate 4 — Access is enforced

| # | Criterion | How it is proven | Status |
|---|---|---|---|
| 4.1 | No endpoint is reachable without the role it needs | `tests/driver-scope.test.mjs` and `tests/sqlite-review.test.mjs` exit 0, both registered in `npm test` | **PASS** — both green in the current 109-suite run |
| 4.2 | Two accounts cannot see each other's orders | `tests/booking-auth.test.mjs` exits 0 (it asserts exactly this) | **PASS** |

## Gate 5 — The release is installable and updates cleanly

| # | Criterion | How it is proven | Status |
|---|---|---|---|
| 5.1 | A signed APK installs on the target handset | install on `SM-A5360`, launch, complete one journey | **FAIL** — signed version 27 installed over version 24 and launched, but an authenticated production journey was not executed |
| 5.2 | Installing over the previous build preserves a pending command | install N+1 over N with a pending booking, confirm it restores | **PASS — automatic recovery** on `SM-A5360`: versionCode 27 → 28 preserved `firstInstallTime` and the command; the read-only receipt recovered order 6 with no second POST. Manual Retry was not offered because reconciliation completed first; that button-specific variant remains [U]. Evidence: `.expo/phone-qa-4193/device/upgrade-final-summary.json` |
| 5.3 | The typecheck and lint gates are measurable | `npx tsc --noEmit`, `-p tsconfig.server.json`, `npx expo lint` all exit 0 | **PASS** |
| 5.4 | The suite is green apart from declared environment gaps | full run, every failure named and classified | **PASS — current local fallback: all 109 integration suites exit 0; full persistence exits 0 with 52 selected suites plus legacy on fresh 55475. Earlier map, connection, presence, retry, partner and phone-identity failures remain documented; preferred remote SSH is refused** |

## Gate 6 — The test environment exists (currently the main blocker)

| # | Criterion | How it is proven | Status |
|---|---|---|---|
| 6.1 | A PostgreSQL fixture is reachable | `WIND_TEST_DATABASE_URL` set, or a cluster on `:55473` | **PASS — fresh remote `DESKTOP-S2JKMK5` PostgreSQL 18.3/PostGIS 3.6 on `127.0.0.1:55494`; the separate local-temp 55475 fixture also passed** |
| 6.2 | The four dark suites pass | `database-logging`, `db-api`, `db-persistence`, `subscription-migration` exit 0 | **PASS — all four exit 0 on the remote fixture; the complete persistence gate also exits 0 remotely and locally** |

## Gate 7 — The scope is honest

| # | Criterion | How it is proven | Status |
|---|---|---|---|
| 7.1 | The dialect decision is recorded | `2026-11-13-DIALECT-ADR.md` status is **Accepted** | **PASS — Option C accepted now, Option A next, Option B ruled out** |
| 7.2 | "What this pilot does not do" is written for operators | one page, naming each unreachable capability | **PASS — `2026-11-13-PILOT-SCOPE.md`** |
| 7.3 | Deferred capabilities fail visibly, not as surprise 409s | the twelve gated paths surface as disabled UI states or absent features | **FAIL** — they return `409 *_unavailable` at runtime |
| 7.4 | Arabic and RTL are correct on every shipped screen | screens captured in `ar` and reviewed | **PARTIAL** — screens exist in `docs/screens/ar/`; not re-reviewed this pass |

---

## Score today

Counting every criterion above: **15 PASS** (1.1, 1.4, 2.1, 2.2, 2.3, 3.1, 4.1, 4.2, 5.2, 5.3, 5.4, 6.1, 6.2, 7.1, 7.2),
**2 PARTIAL** (1.2, 7.4), **5 FAIL** (1.3, 3.2, 3.3, 5.1, 7.3).

The current local integration and persistence runs are green, and device gates 2.3 and 5.2 now pass. Gate 5.2 is automatic receipt recovery after the real 27 → 28 upgrade, not proof of a manual Retry button. The two legacy tables are documented exceptions, not a cleanup requirement. This subset does not close production authentication, human backup alerting, timed replacement recovery, collected-amount variance, visible disabled states, stable update distribution, or the full Arabic/TalkBack matrix.

**The minimum honest path to a GO verdict:**

1. Prove an authenticated production customer→driver→cash journey (5.1).
2. Complete live-host baseline and timed replacement recovery (1.2), plus one human missed-backup alert (1.3).
3. Preserve the two documented legacy-schema exceptions and recheck them during replacement-host recovery (1.4); do not delete history to make a diff empty.
4. Make payment/deferred-capability states visibly honest (3.2, 7.3), and implement A11 collected amount/variance (3.3).
5. Finish the remaining field and Arabic/TalkBack acceptance (7.4).
