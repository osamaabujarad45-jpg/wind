# Handoff for GPT-6.1 Terra — 29 October 2026

Branch `master`, tree clean at `fdf65b5`. `node scripts/run-tests.mjs` → **85 suites, exit 0**; `npm run test:persistence` also passed. Both typechecks clean. Re-verified at write time, not carried over from the earlier note.

Read in this order:
1. `reports/REVIEW-2026-10-29-multiagent.md` — findings, severity, fix order
2. `reports/verify-2026-10-29/EVIDENCE.md` — what was **executed** vs merely read
3. `reports/verify-2026-10-29/MUTATION.md` — whether the tests actually catch regressions
4. `reports/feature-audit-2026-10-29.md` — the author's feature inventory

> **This file replaced an earlier draft.** That draft listed the IaC gaps, the CI Postgres job and the
> audit trio as open. All three were implemented in `c0a5c37` while it was being written. Everything below
> was re-checked against the tree; nothing is copied from the stale version.

---

## Landed — do not redo

| Commit | What |
|---|---|
| `2e19745` | Reschedule ownership guard asserted (mutation-proven) |
| `ed301b7` | Gate fails on an unselected/unexempted `*.test.mjs` |
| `484e0ce` | Admin settings refuse blank (`0`) and over-ceiling values, by field name |
| `c2184eb` | **P1 #3** per-address limits key on the nearest trusted hop (`clientAddress`) |
| `3590b7e` | **P2 #8** unblocking a courier cannot skip the `carrying_parcels` guard |
| `39d6794` | Terminal-access guard; logging/pg test hardening |
| `c0a5c37` | **P1 #1** IaC bound · **CI Postgres gate** · **P2 #6/#7 audit rows** · schema migration |
| `0344d98` | Home search action fix |

Verified in this pass:

- `SUPPORT_CONTACT`, `WIND_IDENTITY_MODE`, `WIND_DATABASE_URL`, `OSRM_URL` are now all present under `infra/`.
- `.github/workflows/ci.yml` has a `postgres:` service and `WIND_TEST_DATABASE_URL`; `test:persistence` runs.
- `security_events.order_id` is nullable in both schemas, with an in-place rebuild for an existing DB
  (`sqlite-schema.ts`); `reports/verify-2026-10-29/migrate-audit.mjs` proves a legacy table is migrated and
  accepts an `order_id IS NULL` row. Ran it: passes.
- Audit rows now written for `editUser` (`main.ts:2641`) and support password reset (`:2701`,
  `action='SUPPORT_PASSW…'`, `order_id NULL`).
- Physical SM-A5360 pass: the home search row no longer stretches, its Arabic label is visible and the whole bar opens the booking sheet; the native order-detail map and a real share-link track screen render MapLibre with Arabic labels; `test:android-browser` passes on the real GPU.
- `test:load` was re-run uncontended: 60 concurrent requests, zero errors/timeouts, read p95 246.97 ms, mixed 346.74 ms (272 expected 429 limiter responses), populated jobs 244.39/344.17 ms, critical acknowledgement 293.61 ms. This is local SQLite evidence, not a PostgreSQL/production capacity claim.
- The MiniMax review completed late after earlier provider/auth retries; its nine findings were triaged against the code below. Antigravity still exposes no models.

### MiniMax review triage (nine findings)

Two were actionable and are fixed: the fixed `height: 56` could clip at a large font scale — now `minHeight` with the flex on the pressable container; and the staging runtime's hardcoded `wp16_staging` schema had no owner-run migration command — now `scripts/migrate-postgres.mjs` + `npm run db:migrate:staging -- --confirm`, documented in `deploy.md`.

Rejected with code evidence:

- **OSRM URL**: when `OSRM_URL` is unset the main server falls back to `router.project-osrm.org`; when a present URL fails, `roadRoute` returns `fallbackRoute` for any non-404 error. A booked quote therefore degrades to the marked estimate, not a 503. The internal `ingress.fqdn` is a deploy-time property and still needs one what-if check.
- **SQLite rebuild is dead code**: `git log -S 'order_id INTEGER NOT NULL REFERENCES orders(id)'` shows `c0a5c37` removed that exact clause; `reports/verify-2026-10-29/migrate-audit.mjs` rebuilds a legacy table and inserts a NULL-order audit row. The branch is real and tested.
- **`USER_UPDATED` outside a transaction**: the insert sits inside `editUser`'s `BEGIN IMMEDIATE` … `COMMIT` block, alongside the user update and courier-release writes.
- **Migration 21 ordering/idempotency**: `initializePostgres` applies base migration 3 first, then 21; `ALTER COLUMN … DROP NOT NULL` is a no-op on an already-nullable column. The rehearsal CLI also goes through `initializePostgres`.
- **CI PostGIS health**: `initializePostgres` itself runs `CREATE EXTENSION IF NOT EXISTS postgis`; `pg_isready` does not need to assert the extension.
- **`.invalid` image URL**: the `image` job builds a local smoke image and never pushes it; using a real host would be riskier.

Deployment traps, not code defects: the `osrm-graph` share must be populated before activation (an empty share crash-loops, already documented), and the internal OSRM FQDN must be confirmed in a staging what-if.

---

## Left for Terra, in priority order

### 1. Debt forgiveness has no second approver — `P2 #14`  ⚠ smaller than it reads
`server/main.ts:2443` (`recordCash`) vs `server/domain/ops.ts:73-82`.

**Correction, verified this pass:** `financial_approvals` is created in `server/db/postgres-ops.sql`, and
the whole ops module is gated by `opsAvailable()`, which returns `false` on any non-Postgres backend. So on
the shipped SQLite path there is no approval table and no approval route — it 409s, it does not silently
skip. What is actually true:

- On SQLite one admin can forgive up to ₪10 000 **per call**, bounded by the cap at `:2446` and the
  no-negative-balance rule at `:2464`. A second ₪10 000 forgiveness is rejected `400` (executed:
  `probe-fourth.mjs`, `probe-seventh.mjs`).
- `decideApproval` already blocks self-approval (`409 second_approver_required`, `ops.ts:81`) wherever it
  can run.

So this is not "no second approver anywhere". It is that **`recordCash` is ungated and never consults the
approval flow**, so the bounded-but-unreviewed path is the live one while the reviewed path only exists
after cutover. Decide:
- **(a) Keep the ₪10 000 cap as the control** and document that one admin can move that much per call.
  *(Recommended: smallest, and the cap is enforced and tested.)*
- **(b) Port `financial_approvals` to SQLite** and route adjustments above a threshold through it. This
  means ungating part of the ops module for one table — more surface than it sounds.

### 2. If (b) is chosen: `/api/admin/approvals` needs an HTTP test
No end-to-end test exists today. It would need to prove: an adjustment above threshold creates a pending
approval, a *different* admin can approve, the requester cannot self-approve, and the cash balance only
moves on approval. `ops.ts:81` covers the self-approval rule at domain level only.

### 3. The `(PG)` five — deliberately deferred, do not start
P2 #1–#5 (refund `pending`→`rejected`, import-time ledger snapshot, partial COD, card-vs-cash,
`servesFor` scope leak). Unreachable until `server/db/runtime.ts:20` opens. Their **gates** are verified
(`/admin/ledger` → 409, `/orders/:id/scope` → 409). Now that CI runs `test:persistence`, these are at
least exercised against Postgres — but the *logic* defects remain open by design.

### 4. Docs
`CAPABILITY-MAP.md` was updated in `c0a5c37`; re-read it before touching. Still stale per the review:
`SYSTEM.md:162` says COD is not built (collection exists, payout does not), and four docs say native push
is unimplemented.

### 5. Re-run the scenario gate, uncontended
`test:load` is now re-run alone and passes (numbers above). The earlier 690/740 ms figures were measured while other tests were running; they are superseded. `test:scenarios` still needs one clean rerun after the device work; the earlier booking-retry failure was also contended and is not a verdict.

---

## Owner rules in force (from `AGENTS.md`, 29 Oct 2026)

- **Never start an emulator.** Acceptance/UI testing uses the physical `SM-A5360` (adb serial
  `R5CTB0FJP9Z`). If it is not attached, **stop and ask**.
- **Run tests and GPU work on the `k5` PC over SSH** when reachable. As of 29 Oct the configured keys are
  refused (`Permission denied (publickey)`) — the owner must supply an authorized account/key. Local runs
  are a fallback and must be labelled as such; never claim remote evidence you did not get.
- Keep the phone's backend on `adb reverse` (QA sandbox binds `127.0.0.1`); do not clear its Chrome profile.

---

## Traps (cost real time this session)

1. **The orphan guard is strict.** A new `tests/*.test.mjs` missing from `scripts/run-tests.mjs` fails the
   gate *by name* — including one you just wrote. That is the point; add it to the list.
2. **`tests/*.test.mjs` are ESM, not TypeScript.** A stray `(x: T)` annotation is a `SyntaxError`, not a
   type error. `tsc` will not catch it.
3. **Never inline JS through PowerShell here.** `node -e "…"` gets mangled by quoting. Use the `edit` tool
   or a file under `reports/verify-2026-10-29/`.
4. **Mutation-test before believing a test.** Scripts in `reports/verify-2026-10-29/mutation-*.mjs` back up,
   mutate, run, restore in `finally`. One-off proofs (`migrate-audit.mjs`, `probe-*.mjs`) are **not** in the
   gate — run them by hand when touching the code they cover.
5. **`npm test` takes ~58 s.** Not a hang.
6. **The tree may change under you.** Commits landed concurrently four times this session, including one
   that absorbed an uncommitted handoff file. `git status` before assuming anything is yours.
7. **Probe quirks:** a driver holds one job (`vehicle_busy` — register a second driver), and order creation
   requires `pickupNote` + `dropoffNote` (else `400 invalid_input`, which reads like a rejection).

---

## Verified good — do not regress

- `POST /api/driver/cash/:id/confirm`: concurrent double-tap → `[200, 409]` one decision;
  confirm-then-dispute → `409 already_decided`; foreign driver → `404`
  (`reports/verify-2026-10-29/probe-cash-decision.mjs`). This was the last untraced route.
- `canSee` (`main.ts:317-324`) is correct for every route that uses it. The one id-bearing surface that
  does not is `resource-scope.getScope` — that is P2 #5, deferred.
- 11/13 mutation-tested guards are caught.

## Honest limits

- ~33 P3 items were never executed; only those a route or a count could falsify were tested.
- Client-side findings (font-scale clipping, one-way pending booking, driver-provider re-renders) need a
  device — use the SM-A5360, never an emulator.
- Mutation coverage is a 13-guard **sample**, not a score. Guards in `server/domain/*.ts` were never mutated.
- **Open at the deployment level:** nobody has probed whether the Azure ingress sets `X-Forwarded-For` at
  all. `clientAddress` is correct for both append and replace, but if the header is absent the limit keys on
  the socket address and every client behind that hop shares one bucket. One request against a deployed
  host settles it.
