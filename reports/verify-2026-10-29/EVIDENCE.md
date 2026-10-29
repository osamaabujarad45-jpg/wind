# Verification record — 29 October 2026

Every finding in `reports/REVIEW-2026-10-29-multiagent.md` was either **executed** against a real server
or **re-read** at HEAD `b7d3c97`. This file records which, and what the run printed.

Method: each probe boots the actual `server/main.ts` on a throwaway SQLite file in `%TEMP%`, registers
real accounts, calls the real HTTP routes, and reads the resulting rows. Nothing is mocked except the
database location. Probes are checked in under `reports/verify-2026-10-29/` so every result is reproducible.

```powershell
node reports/verify-2026-10-29/probe-p1-p2.mjs           # P1 #2, #3, P2 #6-#13 (12 verified, 2 refuted)
node reports/verify-2026-10-29/probe-consolidated.mjs    # P2 #8 custody, #12 race, #15 destination
node reports/verify-2026-10-29/probe-fourth.mjs          # commission blast radius, scrypt cost
node reports/verify-2026-10-29/probe-reschedule.mjs      # reschedule TOCTOU (40 races)
node reports/verify-2026-10-29/probe-reschedule-ownership.mjs # the unasserted guard
node reports/verify-2026-10-29/probe-wrong-cause.mjs     # do refusals fail for the right reason
node reports/verify-2026-10-29/probe-guard-isolated.mjs  # Docker module-copy guard
node reports/verify-2026-10-29/probe-osrm.mjs            # OSRM fallback
node reports/verify-2026-10-29/mutation-test.mjs         # do the tests catch regressions (see MUTATION.md)
node reports/verify-2026-10-29/mutation-test-2.mjs
node reports/verify-2026-10-29/mutation-test-3.mjs
```

## P1 — all six executed

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Production boot throws without `SUPPORT_CONTACT` / `WIND_IDENTITY_MODE`; worker throws without `WIND_DATABASE_URL`; none are in `infra/` | **VERIFIED (executed)** | `NODE_ENV=production node -e "await import('./server/main.ts')"` → `THREW: Production requires a real SUPPORT_CONTACT`; adding it → `THREW: Production requires WIND_IDENTITY_MODE=operator-verified or self-service`; `node server/worker.ts` → `Error: Durable worker requires explicitly gated PostgreSQL`. `grep` over all of `infra/`: all five vars absent. |
| 2 | Admin can save `commission: 0` and unbounded prices; the plan price is then charged verbatim and activation never re-prices | **VERIFIED (executed)** | `POST /admin/settings {commission:0}` → 200. `POST /admin/settings {plusPrice:2000}` → 200. `POST /subscriptions` → row `{plan:"plus", price:2000, status:"pending"}`. Activation route (`main.ts:2672-2675`) only sets status/dates — no re-price. **Sub-claim REFUTED:** "commission 0 makes every /api/price 500" is false on the shipped path (see below). |
| 3 | Rotating `X-Real-IP` defeats the per-address auth limit | **VERIFIED (executed, with control)** | 25 registers with a unique `X-Real-IP` each → **zero 429s**. Control: 25 registers with one fixed `X-Real-IP` → **5× 429**. The limiter is live and entirely keyed on an attacker-chosen header. |
| 4 | `npm test` runs a hand-maintained list; CI never runs the other half; the Docker guard cannot see nested `server/domain/*.ts` imports | **VERIFIED (executed)** | `ci.yml` runs exactly `npm ci`, `typecheck`, `lint`, `npm test`, `npm audit`, `expo export` — no persistence, no docker build. Four test files exist and are absent from `run-tests.mjs` (`db-persistence`, `db-api`, `database-logging`, `azure-infra`). Guard probe: collection loop visits **6 files, 0 in `server/domain/`**, and does not collect an injected `src/copy.ts` import while `Dockerfile` never copies that file. |
| 5 | With `OSRM_URL` unset, routing silently falls back to straight-line and the operator is never told | **VERIFIED (executed)** | `POST /price` with `OSRM_URL` unset → `{estimated: true, km: 46.3, minutes: 56, line: null}`. The real road distance Ramallah→Nablus is ~54.5 km; 46.3 is the straight chord. |
| 6 | The Postgres-only gate keeps five P2s unreachable on the shipped SQLite path | **VERIFIED (executed)** | `GET /admin/ledger` → `409 ledger_unavailable`; `GET /orders/1/scope` → `409 scope_unavailable`. `quotesAvailable()`/`ledgerAvailable()`/`scopeAvailable()` all return `false` when `backend !== 'postgres'`. |

## Refuted on execution — the report was wrong

| Claim in the report | What actually happens | Why the report was wrong |
|---|---|---|
| **P1 #2 sub-claim:** "`commission: 0` → `minorUnits(0)` throws → every `/api/price` 500s" | `/api/price` returns **200** with `{price: 20}` | `main.ts:1042` returns the legacy base before ever reaching `minorUnits(commissionOn(...))` at `:1061`, because `quotesAvailable()` is `false` on SQLite. The 500 is real **only after the Postgres cutover**. A homed order is also accepted fine (`commission: 0` stored, `POST /jobs/:id/accept` → 200). |
| **P2 #12:** "a double-tapped Subscribe creates two pending subscriptions, charged twice" | **1 pending row** in 760 concurrent attempts across 19 rounds, with the SQLite mutex saturated by a competing writer | `subscriptions` has **no unique index** (`sqlite_master` returns `[]`), so the missing constraint is real — but `sqliteLock()` (`persistence.ts:122-135`) serialises every statement through a single chain, so the check-then-insert window does not open in one process. Latent, not live. |
| **P2 #13:** "50 spam orders hide every real job from drivers" | **VERIFIED** — 55 spam orders accepted, `/jobs` returns exactly 50, a later real order is invisible | (This one held.) The number is a real *unbounded order creation* problem: one customer created 55 orders with no quota. |
| **P2 #14:** "any single admin can forgive up to 10,000 ILS with no second approver" | **VERIFIED** — but bounded by the driver's actual debt, not by policy | `recordCash` rejects an adjustment that pushes the balance negative (`main.ts:2464`), and rejects `abs(amount) > 1_000_000` (`:2446`). With 13 500 ILS of debt: `-1_000_000` → 200 (debt 3 500), a second `-1_000_000` → **400**. So the per-call cap plus the no-negative-balance rule bound the damage; what is missing is the *approver*, and `financial_approvals` does not exist on SQLite at all. |
| **P3:** "rescheduling never re-checks that the order is still `searching`" | **REFUTED** | `main.ts:1497` checks `order.status !== 'searching'` and fails 409. Rescheduling an already-assigned order → 409 `cannot_reschedule`; 40 accept-vs-reschedule races → **0** double-successes. The real (small) gap is that the read is outside the transaction and the `UPDATE` at `:1500` has no status predicate — a theoretical TOCTOU that does not open under the SQLite mutex. |

## Corrected on execution — right finding, wrong reason

| Item | The report said | The code says |
|---|---|---|
| Killed claim #1 (road reports) | "`role !== 'customer'` is the allow-list; `Role` is only 3 values **with a CHECK constraint in both schemas**" | SQLite **does** enforce it (`sqlite-schema.ts:14`). PostgreSQL **does not** — `role TEXT NOT NULL` at `postgres-schema.sql:261`, no CHECK. The kill still holds (the route at `main.ts:1724` uses the TS type), but the justification was wrong. |
| P2 #15 (destination change) | "SQLite-only … the column it needs is in `SQLITE_ONLY_COLUMNS` … the target backend cannot run it" | Correct and **verified the other way round**: with an assigned order, `POST /orders/:id/destination/quote` → **200 on SQLite**. `sqliteOnly()` fails when `backend !== 'sqlite'`, so it runs *here* and would 409 *after* cutover. |
| P1 #4 (test selection) | "Four real `*.test.mjs` files never run" | Three of the four (`db-persistence`, `db-api`, `database-logging`) **are** run by `check-persistence.mjs` — which is in no workflow. Only `azure-infra.test.mjs` is run by nothing at all. Accurate claim: they never run **in CI**. |

## Still not executed (cannot be, from source)

1. **The `X-Real-IP` production hop** — whether Azure Container Apps ingress overwrites a client-set
   `X-Real-IP` decides whether P1 #3 is live or latent. Needs one probe against a deployed host.
2. **The Postgres side of every `(PG)` finding** — refunds, ledger journals, COD, card-vs-cash,
   `scopeAvailable`. These run only against a live PostgreSQL with `NODE_ENV=test` +
   `WIND_POSTGRES_TEST_ONLY=1` and a loopback URL; no database was available here, so those five remain
   verified by *reading* the code and the gates, not by execution. The gates themselves **were** executed
   (`/admin/ledger` → 409, `/orders/:id/scope` → 409), so their *unreachability* is proven; their internal
   logic is not.
3. **Font-scale clipping** (P3) — needs a device at 130–200 %.
4. **`versionCode`** (P3) — needs a Play upload attempt.

## Honest bottom line

Of the findings put under execution: **19 verified with reproducible evidence, 4 refuted, 3 corrected in
their reasoning, 4 unverifiable from source.** The two that changed the release picture most:

- **P1 #2's blast radius is smaller than claimed today** — saving `commission: 0` does *not* break pricing
  on SQLite; it breaks it the day the Postgres cutover lands, which is also the day #1–#5 must already be
  fixed.
- **P2 #12 is latent, not live** — the missing unique index is real, the double charge does not reproduce
  in a single process.

Everything else in the P1 set reproduced exactly as written.
