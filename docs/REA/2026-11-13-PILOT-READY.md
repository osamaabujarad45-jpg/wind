# PILOT-READY — a measurable definition of done

**Purpose:** the current verdict is NO-GO, which says what is wrong. This says what *done* looks like,
in numbers and commands, so the verdict can flip on evidence rather than opinion.

**How to use it:** the pilot is ready when **every gate below is PASS**. A gate is PASS only with the
command and its output recorded beside it. "Should work", "covered by a test elsewhere" and "the code
looks right" are FAIL.

---

## Gate 1 — Data can be recovered (the one that matters most)

| # | Criterion | How it is proven | Status |
|---|---|---|---|
| 1.1 | A backup is produced nightly without human action | an object in `s3://wind-backups-083712835043/` stamped with the previous 03:10Z slot, and `PRAGMA integrity_check` = `ok` on the decompressed copy | **PASS** — 13 Nov `wind-20261113T031001Z.db.gz`, integrity ok, 364,544 B |
| 1.2 | That backup actually **restores** | restore it into a throwaway directory, `PRAGMA integrity_check` = `ok`, row counts match the live baseline table by table, then delete | **PARTIAL — local restore and API boot verified; live-host baseline blocked by SSM/EC2 permissions** |
| 1.3 | A missed run is noticed within an hour | deliberately skip one run and confirm an alert arrives somewhere a human reads | **FAIL** — no proven human notification. The in-app `backupStale` mechanism exists, but the restored backup has zero `push_subscriptions`; no external Wind alarm/destination was demonstrated |
| 1.4 | The restored schema is the schema the code expects | `schema_diff.py` (additions §6.1) reports an empty "in db, not in DDL" set | **FAIL — preserve two documented zero-row legacy tables; optional owner cleanup remains. `native_push_tokens` is PG-only on SQLite; `firebase_resets` is orphaned** |

Gate 1 is the whole pilot. Until 1.2 passes, everything else is a bet.

## Gate 2 — The core journey cannot lose an order

| # | Criterion | How it is proven | Status |
|---|---|---|---|
| 2.1 | A post-lock refusal keeps the persisted command | `node tests/booking-retry-race.test.mjs` exits 0 | **PASS** |
| 2.2 | The server-side retry race is raced for real | same suite, **Part A runs** rather than printing `SKIP` | **PASS — fresh PostgreSQL 18.3 fixture; concurrent committed-command replay returns 409 `quote_consumed` while its receipt exists** |
| 2.3 | A customer whose command is ambiguous can recover | manual: force a 409 post-lock, confirm the pending card offers Retry and that Retry lands on the committed order | **FAIL** — never executed on a device |

## Gate 3 — Money is accountable

| # | Criterion | How it is proven | Status |
|---|---|---|---|
| 3.1 | The cash ledger cannot be rewritten | triggers `cash_entries_no_delete`, `cash_entries_no_edit` present; an `UPDATE`/`DELETE` attempt fails | **PASS** — trigger definitions present and `tests/cash.test.mjs` exercises the protected ledger in the integration gate |
| 3.2 | Payment state is unambiguous | either payments are **off by design and visibly so** in the UI, or a real provider is wired and `payment_intents` is reachable | **FAIL — neither.** No provider exists (`payments.ts:29-31`), and the SQLite gate returns 409 at runtime |
| 3.3 | Collected vs expected is reconciled per order | a collected amount below the total records a variance with a reason, and cannot be edited after | **FAIL** — A11 in the backlog |

## Gate 4 — Access is enforced

| # | Criterion | How it is proven | Status |
|---|---|---|---|
| 4.1 | No endpoint is reachable without the role it needs | `tests/driver-scope.test.mjs` and `tests/sqlite-review.test.mjs` exit 0, both registered in `npm test` | **PASS** — both green in the 99-file run |
| 4.2 | Two accounts cannot see each other's orders | `tests/booking-auth.test.mjs` exits 0 (it asserts exactly this) | **PASS** |

## Gate 5 — The release is installable and updates cleanly

| # | Criterion | How it is proven | Status |
|---|---|---|---|
| 5.1 | A signed APK installs on the target handset | install on `SM-A5360`, launch, complete one journey | **FAIL** — signed version 27 installed over version 24 and launched, but an authenticated production journey was not executed |
| 5.2 | Installing over the previous build preserves a pending command | install N+1 over N with a pending booking, confirm it restores | **FAIL** — not executed |
| 5.3 | The typecheck and lint gates are measurable | `npx tsc --noEmit`, `-p tsconfig.server.json`, `npx expo lint` all exit 0 | **PASS** |
| 5.4 | The suite is green apart from declared environment gaps | full run, every failure named and classified | **PASS — preferred remote `DESKTOP-S2JKMK5`: all 106 integration suites exit 0; complete persistence passes on the separate local-temp fixture. The clean remote rerun uses the fresh 55494 cluster; earlier shared-fixture failures remain documented** |

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

Counting every criterion above: **11 PASS** (1.1, 2.1, 2.2, 3.1 — source-verified, 4.1, 4.2, 5.3, 5.4, 6.1, 6.2, 7.1, 7.2),
**2 PARTIAL** (1.2, 7.4), **9 FAIL** (1.3, 1.4, 2.3, 3.2, 3.3, 5.1, 5.2, 7.3).

**1.3** still requires one alert proven to reach a person. **7.3** still requires explicit disabled UI states. Device flows and the
complete persistence gate are assessed separately below; no earlier isolated pass is silently substituted for them.

**The minimum honest path to a GO verdict:**

1. Give the test environment a database (Gate 6.1) → unblocks 6.2 and 2.2.
2. Run the restore drill and the schema diff (1.2, 1.4) → Gate 1 passes.
3. Add one outside check that alerts on a missed backup (1.3).
4. Accept the dialect ADR and write the scope note (7.1–7.3).
5. Install the APK and walk three journeys on the phone (5.1, 5.2, 2.3).

Nothing in that list is a feature. That is the point: the pilot is blocked on **proof and scope**, not
on build.
