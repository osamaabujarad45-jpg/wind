# Handoff for GPT-6.1 Terra — 29 October 2026

Branch `master`, tree clean at `39d6794`. `node scripts/run-tests.mjs` → **83 suites, exit 0**.
Both typechecks clean (`tsc --noEmit`, `tsc --noEmit -p tsconfig.server.json`).

Read in this order:
1. `reports/REVIEW-2026-10-29-multiagent.md` — findings, severity, fix order
2. `reports/verify-2026-10-29/EVIDENCE.md` — what was **executed** vs read
3. `reports/verify-2026-10-29/MUTATION.md` — whether the tests catch regressions
4. `reports/feature-audit-2026-10-29.md` — the author's own feature inventory (newer than the review)

---

## Already done — do not redo

| Commit | What |
|---|---|
| `2e19745` | Reschedule ownership guard asserted (mutation-proven) |
| `ed301b7` | Gate fails on an unselected/unexempted `*.test.mjs`; 78 → 80 suites |
| `484e0ce` | Admin settings refuse blank (`0`) and over-ceiling values, by field name. Shared `settingCeilings`/`invalidSetting` in `src/model.ts` |
| `c2184eb` | **P1 #3** per-address limits key on the nearest trusted hop (`clientAddress`) |
| `3590b7e` | **P2 #8** unblocking a courier cannot skip the `carrying_parcels` guard |
| `39d6794` | Author's: terminal-access guard, logging/pg test hardening |

`P2 #6/#7` are **not** done — see below. `P1 #2`, `#4` are done. `P1 #5` folds into the IaC item.

---

## Left for Terra, in priority order

### 1. IaC cannot be satisfied by following its own docs — `P1 #1`
`infra/main.bicep`, `docs/operations/deploy.md`

Re-verified absent from every file under `infra/` today:

| Missing | Effect |
|---|---|
| `SUPPORT_CONTACT` | `server/main.ts:59` throws at module load |
| `WIND_IDENTITY_MODE` | `main.ts:60` throws |
| `WIND_DATABASE_URL` | `server/worker.ts:221` throws on start |
| `OSRM_URL` | silent straight-line fallback: measured 46.3 km vs ~54.5 km real |
| `/data` volume | `DB_PATH=/data/wind.db` dies with the revision |

The owner-gate comment at `main.bicep:292` names only two (`Key Vault DB URL`, `AcrPull`). `enableWorkloads`
defaults `false` and `deploy.md:3` blocks activation — so this is an **unfollowable instruction**, not a
live outage. Fix the module params, the comment, then add a boot test that renders the Bicep to env vars
and asserts the five keys are non-empty. `tests/deployment.test.mjs` already has the render harness.

### 2. CI never runs the Postgres half
`.github/workflows/ci.yml` still runs exactly: `npm ci`, `typecheck`, `lint`, `npm test`, `npm audit`,
`expo export`. Nothing else.

`test:persistence` (50 files — pg adapter, `outbox.mjs`, `native-push.mjs`) is in no workflow. Every
`(PG)` finding and the `PUSH_KINDS` change ship ungated. Needs a `postgres` service container, a
`WIND_TEST_DATABASE_URL`, and `npm run test:persistence`. Also worth adding: a real `docker build`.

`scripts/run-tests.mjs` already **names** its two Postgres exemptions (`requiresPostgres`), so this is the
only remaining hole in test selection.

### 3. The audit trio — `P2 #6`, `P2 #7`  ⚠ blocked on a schema decision
Both are live, takeover-shaped, and ungated:

- `main.ts:2631` support password reset returns a **plaintext password** in the response, no audit row.
- `editUser` (`main.ts:2547`) rewrites phone/email, clears verification, kills sessions — no audit row.
  Its *guards* are good (stranded-order recheck `:2570`, `recovery:'return'` `:2574`); only the audit is missing.

**The blocker, verified:** `security_events.order_id` is `INTEGER NOT NULL REFERENCES orders(id)`
(`sqlite-schema.ts:53`). An account-level event has no `order_id`. `staff_actions` exists in
`server/domain/ops.ts` queries but is **not created in either schema file** (`grep` over
`sqlite-schema.ts` and `postgres-schema.sql` finds no `CREATE TABLE staff_actions`).

Decide one, then implement:
- **(a)** relax `security_events.order_id` to nullable (migration + both schemas), or
- **(b)** add a `staff_actions` table with `target_user_id` and no `order_id`.

(a) is smaller and reuses existing readers; pick it unless the Postgres cutover makes migrations expensive.

### 4. Debt forgiveness has no second approver — `P2 #14`
`ops.ts:73-82` already implements `requestApproval` / `decideApproval` and `financial_approvals`, but
`recordCash` (`main.ts:2443`) never calls it. Executed evidence: with ₪13 500 owed, one admin forgave
₪10 000 in one call, no approver. Damage is bounded by the `≤ ₪10 000` cap (`:2446`) and the
no-negative-balance rule (`:2464`) — only the *approval* is missing. Needs the `financial_approvals` table
on SQLite first (same schema question as item 3).

### 5. The `(PG)` five — deliberately deferred, do not start
P2 #1–#4 and #5 (refund `pending`→`rejected`, import-time ledger snapshot, partial COD, card-vs-cash,
`servesFor` scope leak). Unreachable until `runtime.ts:20` opens. Their **gates** are verified
(`/admin/ledger` → 409, `/orders/:id/scope` → 409). Fix them when the cutover is scheduled, not before.

### 6. Docs — cheap, no risk
`CAPABILITY-MAP.md` says destination change is "Built"; it runs on SQLite (executed: 200) and would 409
after cutover. `SYSTEM.md:162` says COD is not built when collection exists (payout does not). Four docs
still say native push is unimplemented.

---

## Traps (learned the hard way this session)

1. **The orphan guard is strict.** Any new `tests/*.test.mjs` missing from `scripts/run-tests.mjs` fails
   the gate *by name* — including one you just wrote. That is the point; add it to the list.
2. **`tests/*.test.mjs` are ESM, not TypeScript.** A stray `(x: T)` annotation is a `SyntaxError`, not a
   type error. `tsc` will not catch it.
3. **Never inline JS through PowerShell here.** `node -e "…"` gets mangled by quoting. Use the `edit`
   tool or write a file under `reports/verify-2026-10-29/`.
4. **Mutation-test before believing a test.** Every fix above was proven by breaking the guard and
   watching the suite go red. Scripts in `reports/verify-2026-10-29/mutation-*.mjs` all back up and
   restore in `finally`.
5. **`npm test` takes ~58 s.** Not a hang.
6. **The tree may change under you.** Concurrent commits happened repeatedly this session.
   `git status` before assuming your edit is the only one.
7. **Probe quirks:** a driver holds one job (`vehicle_busy` — register a second driver), and order
   creation requires `pickupNote` + `dropoffNote` (else `400 invalid_input`, which reads like a rejection).

---

## Verified good — do not regress

- `POST /api/driver/cash/:id/confirm`: concurrent double-tap → `[200, 409]`, one decision;
  confirm-then-dispute → `409 already_decided`; foreign driver → `404`
  (`probe-cash-decision.mjs`). This was the last untraced route; it is now closed.
- `canSee` (`main.ts:317-324`) is correct for every route that uses it. The one id-bearing surface that
  does not is `resource-scope.getScope` — that is P2 #5, deliberately deferred.
- 11/13 mutation-tested guards are caught by the suite.

## Honest limits of the review

- ~33 P3 items were never executed; only those a route or a count could falsify were tested.
- Client-side findings (font-scale clipping, one-way pending booking, driver-provider re-renders) need a
  device. The author's `feature-audit-2026-10-29.md` records that a physical Samsung SM-A5360 is now the
  test device and emulators are not permitted — use that.
- Mutation coverage is a 13-guard **sample**, not a score. Guards in `server/domain/*.ts` were never
  mutated because their tests do not run in the default suite.
- **Open at the deployment level:** nobody has probed whether the Azure ingress sets `X-Forwarded-For`
  at all. `clientAddress` is correct for both append and replace, but if the header is absent the limit
  keys on the socket address and every client behind that hop shares one bucket. One request against a
  deployed host settles it.
