# Cross-critique: server-core-correctness (R1) and authentication-authorization-abuse (R2)

Verified against HEAD `5f941fd`. Every cited site was opened at HEAD. The only working-tree change
is `server/migrate.ts` (not touched by either report); no source was modified by this review.

## Environment facts that drive almost every severity call

These are not findings, but three of the reports' severities only make sense against them.

1. **Production is SQLite.** `server/db/runtime.ts:5-26`: `WIND_DATABASE_URL` with no
   `WIND_POSTGRES_STAGING=1` requires `NODE_ENV=test && WIND_POSTGRES_TEST_ONLY=1`, a loopback host
   and a `wp0*_` test schema, or it throws. `reports/release-readiness-2026-10-29.md:32-37` names the
   live host and records a SQLite snapshot. Everything behind `db.backend !== 'postgres' → false`
   is therefore **dead in the deployed product**: payments, ledger, quotes (`/api/price` WP12 branch),
   declared scope, phone identity, dispatch, durable commands, readiness' migration branch.
2. **The live host is a VM, not the Container App.** `reports/release-readiness-2026-10-29.md:30-39`
   gives `https://windapi236.swedencentral.cloudapp.azure.com` as the served origin and says the
   Container App endpoint "still returns Azure's unavailable page". `infra/main.bicep` is a
   non-serving template; `server/main.ts:2932` binds `127.0.0.1` in production, so an unspecified
   local reverse proxy fronts the API.
3. **A payment provider is never constructed outside tests.** `paymentsConfig().testFake` is
   `NODE_ENV === 'test' && WIND_PAYMENTS_TEST_ONLY === '1'` (`payments.ts:30`), and `createPayments`
   only passes the fake in that case (`:116`). `WIND_BOP_ENABLED/MERCHANT_ID/SECRET` are read into
   `configured` and then **never used**. `docs/implementation/WP14.md:20` says the same.

## Adjudication table

| # | Finding | Verdict | Corrected severity | One-line reason |
|---|---|---|---|---|
| R1-1 | Refund `pending`/`timeout` recorded as `rejected`, cap released, double payout | CONFIRMED-DOWNGRADE | P2 (was P1) | State-machine bug is real and a second **HTTP** refund passes the cap, but no provider exists outside `NODE_ENV=test`, payments are PG-only, and there is no admin refund UI |
| R1-2 | Double-entry ledger is an import snapshot; later orders/cash invisible | CONFIRMED-DOWNGRADE | P2 (was P1) | `postJournal` really has one caller and `/api/driver/ledger` really reads the stale balance, but the ledger is PG-only, the cap is hard-off, and no client calls the route |
| R1-3 | `reattempt` leaves the 5 proof failures, delivery cannot complete | CONFIRMED-DOWNGRADE | P3 (was P2) | Real, but `proof-reset` (`main.ts:2487`) clears it and is the documented escape; "never completes" overstates it |
| R1-4 | Double-tapped Subscribe creates two pending rows, both can be activated | CONFIRMED | P2 | Check-then-insert across two awaits, no unique index, and `activate` does not look for an existing active plan. Live on SQLite |
| R1-5 | Pending remittance is driver-decidable only; blocking strands the debt | CONFIRMED | P2 | Only `UPDATE cash_entries` transition is the driver route; `cashSettled` then blocks delete/role change forever. Live |
| R1-6 | First-order promo check outside a customer lock | CONFIRMED-DOWNGRADE | P3 (was P2) | Real, but SQLite wraps `createOrder` in `BEGIN IMMEDIATE`; only the undeployed PG path is open, for 10 ILS |
| R1-7 | Card capture and cash receipt are unlinked | CONFIRMED-DOWNGRADE | P3 (was P2) | Both sides are PG + provider gated, so both 409 in production |
| R1-8 | Worker `Dispatch` has no `onOffer`, expiry offers are silent | CONFIRMED-DOWNGRADE | P3 (was P2) | Real (`worker.ts:122` omits the 5th arg), but `dispatchAvailable` is Postgres-only, so no round runs on the live SQLite backend |
| R1-9 | Any single admin can forgive 10,000 ILS with no second approver | CONFIRMED | P2 | Negative adjustment accepted (`main.ts:2464`), `financial_approvals` exists but `recordCash` never consults it. Live |
| R1-10 | Reschedule does not re-check `searching` | CONFIRMED | P3 | Read-then-`UPDATE ... WHERE id=?` with no transaction; reachable on SQLite against `accept`'s `BEGIN IMMEDIATE` |
| R1-11 | `minorUnits(0)` throws, commission 0 breaks `/api/price` with 500 | CONFIRMED | P3 | Settings accepts 0, `commissionOn(...,0)=0`, `minorUnits` throws a `RangeError`; PG-only because of `quotesAvailable` |
| R1-12 | `/api/orders` still ~4-6 queries per row and blocks SQLite | CONFIRMED-DOWNGRADE | P3 → informational | On SQLite all three summaries short-circuit on memoized availability: the "~1,000 statements on the SQLite mutex" claim is false |
| R1-13 | `sessions` has no `user_id` index | CONFIRMED | P3 | True in both schemas; behind logout/password/reset/admin-edit |
| R2-1a | Per-address auth limits keyed on attacker-chosen headers | CONFIRMED | P1 **if** the front hop appends XFF/passes `X-Real-IP`; P2 otherwise | Code defect certain (`main.ts:2778-2780`); also defeats the public `/api/track` limiter. Deployment half below |
| R2-1b | "Production sets `WIND_TRUST_PROXY=1` via `infra/main.bicep:317`" | UNVERIFIABLE | — | The bicep is not the serving deployment; the live VM's proxy and env were not captured. See detail |
| R2-2 | `scryptSync` blocks the event loop on auth paths | CONFIRMED-DOWNGRADE | P2 (was P1) | Blocking and pre-lookup hashing on `/api/auth/reset` are real; the outage needs R2-1a to get past 50/10min per address |
| R2-3 | Any driver can read any searching order's declared value and `sourceRef` | CONFIRMED-UPGRADE | P2, PG-only | Real and it also bypasses `order_releases` and `viewer.status==='active'`, which `getOrder` enforces |
| R2-4 | Public phone-recovery verify: no limit, one row + global lock per request | CONFIRMED-DOWNGRADE | P3 (was P2) | Mechanism real (failed commands persist, global advisory lock), but it 409s/503s unless PG + an SMS provider are configured |
| R2-5 | Support password reset returns a plaintext password and writes no audit | CONFIRMED | P2 | Real; the premise "every other admin action is audited" is false, which makes the gap wider, not smaller |
| R2-6 | `/api/ready` is unauthenticated, unlimited, takes the SQLite write lock | CONFIRMED-DOWNGRADE | P3 (was P2) | Public + `BEGIN IMMEDIATE` confirmed; it is one short lock turn, no lock is held, and `schema` is hardcoded `3` on SQLite |
| R2-7 | Account deletion leaves user free text on the anonymised account | CONFIRMED-DOWNGRADE | P3 (was P2) | Code is as described, but the published policy discloses exactly this retention (`server/account-deletion.html:21`) |
| R2-8 | Entra `nonce` is compared against a client-read value | CONFIRMED-DOWNGRADE | P3 (was P2) | Mechanism real; `entra_replay` is the actual guard and Entra is unconfigured in production |
| R2-9 | Any driver sees a searching customer's rating/trip count | CONFIRMED | P3 | `main.ts:292` gates on `searching` only; live |
| R2-10 | `GET /api/route` has no role/active gate | CONFIRMED-DOWNGRADE | Informational | Gate really missing, but OSRM is self-hosted and unconfigured on the live VM, so no billable quota |
| R2-11 | Road-report authorization is a deny-list | KILL | — | `Role` is exactly `customer`/`driver`/`admin` and the DB CHECK enforces it; `!== 'customer'` **is** the allow-list |
| R2-12 | `checkPassword` throws 500 on a hash without `salt:hash` | CONFIRMED | P3 (latent) | Real throw; unreachable today because deleted rows are unfindable by phone |

## Kills and downgrades (detail)

### R1-1 — refund `pending`/`timeout` → `rejected` (real bug, wrong reachability and severity)

**What must be true:** (a) `pending`/`timeout` is possible, (b) a `rejected` row reserves nothing, (c) a
second refund can pass the cap, (d) the first refund can actually have paid out.

(a)-(c) are true. `payments.ts:97-101` maps only `captured` to `completed` and everything else to
`rejected`; the cap at `:89` counts `status IN ('requested','approved','completed')`; `refundOrder`
(`:105`) forwards `body.requestId`, which is optional (`:82`), and the insert at `:91` falls back to a
fresh UUID, so a second HTTP call is a new `business_ref`.

**Question the brief asks: is a duplicate refund reachable from HTTP, or only a worker retry?**
There is **no worker retry of refunds anywhere** (`rg '\.refund\('` → only `payments.ts`, tests, and the
`provider.refund` interface). The duplicate is reachable **only from HTTP**, by a finance-scoped staff
member issuing a second `POST /api/orders/:id/payments/refund`. `needStaff(..., 'finance')`
(`ops.ts:9-12`) passes any plain admin via `staffRoleOf`'s `platform_admin` default, and there is **no
admin refund screen in `src/`**, so in practice it needs curl/Postman.

(d) fails at HEAD for money. `paymentsAvailable` requires Postgres (`payments.ts:32-36`), and
`createPayments` builds a provider only when `NODE_ENV === 'test' && WIND_PAYMENTS_TEST_ONLY === '1'`
(`:116`, `:30`) — `WIND_BOP_ENABLED/MERCHANT_ID/SECRET` are collected into `configured` and never read.
So every production refund is `409 payments_unavailable`, and the only place the bad mapping executes
is the loopback PG test fixture. `tests/payments.mjs:46-51` even asserts the bug (`timeout → 'rejected'`).

**What the reviewer should have seen:** their own caveat is wrong in the direction that matters. They
wrote "reachable today only with `WIND_BOP_*`/`WIND_PAYMENTS_TEST_ONLY` set"; `WIND_BOP_*` alone does
nothing. Corrected severity **P2**: a genuine money bug that fires the day a PSP is wired (and the
reservation leaves `requested` forever if the process dies between `:94` and `:98`, which has no
reconciler), but not a live P1.

### R1-2 — ledger is an import snapshot (real, but not a live P1)

**What must be true:** `postJournal` has one caller; `/api/driver/ledger` derives no balance elsewhere;
`projectedExposure` feeds something live.

- `rg -n postJournal` → `ledger.ts:40` (definition) and `:73` (`importLegacy`). Confirmed, one caller.
- `driverLedger` (`:168`) returns `{ balanceMinor: await this.driverBalance(actor.id) }`, and
  `driverBalance` (`:94-98`) sums `ledger_entries`. It is a stale snapshot, not derived from `cashOwed`.
- `projectedExposure` (`:104-110`) really is `driverBalance + active commissions`, and
  `guardAcceptance` is called **only from tests** (`rg guardAcceptance` → `ledger.ts:111` + tests).
  `cashCapActivated` is hard `false` (`:13`).

**Why the severity falls:** `ledgerAvailable` returns false on SQLite, so on the live host
`POST /api/admin/ledger/import`, `GET /api/admin/ledger` and `GET /api/driver/ledger` all return
`409 ledger_unavailable`. The driver app never calls `/api/driver/ledger` (`rg 'driver/ledger' src/` →
nothing); the app uses `/api/driver/cash`, which is correct. So there is no user-visible wrong number
today: the divergence only appears after a PG cutover, and the "under-counts exposure" consequence only
exists after someone also flips `cashCapActivated`. Corrected **P2**: the design is wrong and must be
fixed before the cap is switched on, as its own fix note says.

What the reviewer got right and should be kept: the two-authority-balance diagnosis, the exact
`business_ref` shapes, and the observation that `guardAcceptance` is not wired to accept.

### R1-3 — `reattempt` does not clear `proof_attempts`

`main.ts:1999` reattempts to `in_transit` and does not delete the counter; `:2003` (the `return`
branch) does; `:1941` refuses any `completed`/`returned` while `failures >= 5`. So the next attempt with
the *correct* code still gets `409 proof_locked`. Confirmed.

**Why P3:** `POST /api/admin/orders/:id/proof-reset` (`:2487-2501`) deletes the row, requires a reason,
writes `PROOF_RESET`, and `resolve` returns the order to `in_transit`, so support has a working second
action. The parcel is not stranded forever; support is. Also note the lock is per `order_id` and the
`return`/blocking paths delete it (`:2003`, `:2599`), so reassignment cannot carry it over. Keep the
finding, fix the branch, but it is a workflow bug, not a delivery blocker.

### R1-4 — duplicate subscriptions (confirmed P2)

`main.ts:2478` check, `:2480` insert, no transaction on SQLite (the route is a POST under `atomic`,
which is `scope()` only on SQLite, `persistence.ts:226`), and no unique index in either schema
(`sqlite-schema.ts:31-34`, `postgres-schema.sql:246`). Two awaits between check and insert let a second
request through. `POST /api/admin/subscriptions/:id` (`:2671-2675`) selects a pending row by id and
activates it with no "already active" check, so both rows can become active and `activePlan` returns
one. Money is collected outside the app, so this is a billing-integrity bug — P2 is right.

### R1-5 — pending remittance is driver-only (confirmed P2)

The only `UPDATE cash_entries` transition in the codebase is `main.ts:2432` behind
`need(user,'driver')`. `cashSettled` (`:2410-2412`) refuses while `pendingCents > 0`; `editUser`
blocks a driver when they carry no parcels (`:2574-2576` only checks `activeSql` orders), then deletes
their sessions (`:2588`); `authenticate` rejects `status === 'blocked'` (`:2742`). A negative
`adjustment` cannot clear `pendingCents` (it only reduces `owedCents`, `:2464`), and a remittance cannot
be negative (`:2463`). So the row is permanently undecidable and the user permanently undeletable
without SQL. Confirmed P2; this is the strongest of R1's live findings.

### R1-6 — first-order promo race (PG-only)

`promoFor` reads "no orders for this customer" at `:804`/`:810`; the only lock is on `promo_codes`
(`:1279`) and only when `promo.id` is set, so the referral branch locks nothing. But
`POST /api/orders` wraps `createOrder` in `BEGIN IMMEDIATE` (`:1333`, `:1347`), which on SQLite is a
real global write lock, so the read+insert cannot interleave. On PG it is a savepoint in `atomic`, and
the only per-order lock is `SELECT ... FOR UPDATE` at `:2785`, which does not lock the customer.
Confirmed for PG; the impact is 10 ILS, because the second order keeps its `discount` and the referral
row is upserted (`ON CONFLICT(referee_id) DO UPDATE`, `:1238`). **P3**, not P2.

### R1-7 — card capture vs cash receipt (PG + provider only)

`ledger.createReceipt` (`:125-143`) never reads `payment_intents`, and `payments.createIntent`
(`:50-61`) never reads `cash_receipts`. Real. But `ledgerAvailable`/`paymentsAvailable` are both
Postgres-gated and the provider is test-only, so in production both calls `409`. Latent **P3**.

### R1-8 — the worker's `Dispatch` has no `onOffer`

`worker.ts:122` `new Dispatch(this.db, new Eligibility(this.db, fail), fail).processExpiries()` —
5th constructor arg omitted; `dispatch.ts:55` defaults it to `undefined`, `:196` guards
`if (this.onOffer)`. The API instance *is* wired (`main.ts:911 dispatch.onOffer = ...`), so the claim
"only API-issued offers notify" is correct. Confirmed. But `Dispatch.requireAvailable` gates on
`dispatchAvailable`, which returns false for any non-Postgres backend (`dispatch.ts:40-45`), so on the
live SQLite host `startRound` fails and no round ever issues an offer. **P3** until the PG cutover.

### R1-9 — single-admin debt forgiveness (confirmed P2)

`recordCash` (`:2443-2446`) caps `|amount|` at 1,000,000 minor = 10,000 ILS, and `:2464` accepts a
negative adjustment as long as it does not push the balance below zero. `financial_approvals` exists
(`postgres-ops.sql:5`) and `Ops.requestApproval/decideApproval` enforce a different approver
(`ops.ts:73-82`), but `rg financial_approvals server/` shows only `ops.ts`; `recordCash` never consults
it. Live on SQLite. P2 is right (insider/policy risk, not an external attacker).

### R1-10 — reschedule race (live)

`main.ts:1497` checks `status === 'searching'` on the `getOrder` read; `:1500` writes
`UPDATE orders SET scheduled_for = ? WHERE id = ?` with no status predicate and no transaction. The
accept path takes `BEGIN IMMEDIATE` (`:1784`) and commits `assigned`, so a schedule that read before
that commit lands after it. On PG the request-wide `FOR UPDATE` (`:2785`) holds the row to COMMIT, so
PG is safe; SQLite is not. Confirmed P3.

### R1-11 — `minorUnits(0)` (confirmed, PG-only)

`main.ts:2688` accepts any `n >= 0` and rejects only `n >= 1` for fraction settings, so
`commission: 0` is valid. `/api/price` then computes `minorUnits(commissionOn(price, 0))` at `:1061`;
`quotes.ts:58-62` rejects `minor < 1` with a `RangeError`, which `main.ts:2838` maps to 500. Confirmed,
but `:1042` returns the legacy quote unless `quotesAvailable` (PG). P3.

### R1-12 — `/api/orders` per-row cost (the SQLite impact claim is false)

Per row `toOrder` calls `dispatch.summary`, `rideLifecycle.summary`, `resourceScope.summary`
(`:248-250`), `customerStats` (`:292`), `myOffer` (`:289`), `safetyReport` (`:275-277`). On PG each of
the first three issues 1-2 statements. On **SQLite all three return null before their first query**:
`dispatch.summary` and `rideLifecycle.summary` start with `if (!(await this.available())) return null`
(memoized per request, `persistence.ts:97-107`), and `declaredScopeRow` returns null on non-PG
(`resource-scope.ts:38-41`). So the "~1,000 statements blocking the single SQLite connection" scenario
does not occur on the live backend; a customer's terminal rows cost the base `orderSelect` plus at
most `customerStats`/`myOffer`/`safetyReport` where they apply. This is a PG-cutover performance item.
**Keep the batching suggestion; drop the SQLite-blocking severity.** P3/informational.

### R1-13 — `sessions` index (confirmed)

`sqlite-schema.ts:17-18` and `postgres-schema.sql:237-241` have only the `token_hash` primary key. The
hourly prune (`main.ts:2926`) deletes by `created_at` either way, so the index is only for
logout/reset/admin edit. Real, P3.

### R2-1a / R2-1b — the rate-limit key (certain half vs uncertain half)

**Certain (code).** `main.ts:2778-2780`:

```js
const forwarded = req.headers['x-real-ip'] ?? (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0]?.trim() : undefined);
const address = process.env.WIND_TRUST_PROXY === '1' && typeof forwarded === 'string' ? forwarded : req.socket.remoteAddress ?? 'unknown';
```

The leftmost `X-Forwarded-For` element is by construction the value the client sent; nothing
authenticates the header. If the front hop appends (standard proxy behaviour) or omits `X-Real-IP`
and passes a client-supplied one, every request lands in a fresh bucket. The same expression is at
`:1543` for the public `/api/track` limiter (600/10min), so the bypass also removes the only cap on the
heaviest unauthenticated query (`trackView`, one `orderSelect` + HMAC per request). `phone-identity.ts:48`
does *not* have the XFF fallback (R2's "same pattern" is imprecise) — it trusts `x-real-ip` only.

**Uncertain (deployment).** R2 cites `infra/main.bicep:317` `WIND_TRUST_PROXY='1'` and
`infra/main.bicep:306-307` Container Apps. At HEAD, `infra/main.bicep` builds a module with
`ingressEnabled: true` / `external: true` (`infra/modules/container-app.bicep:33`), but
`reports/release-readiness-2026-10-29.md:38-39` says that endpoint "still returns Azure's unavailable
page" and that the VM is the served origin. The VM's inspected env list (`:41-44`) does not mention
`WIND_TRUST_PROXY`, and the front proxy on the VM is not in the repo (README:114 only says "HTTPS in
front"). **UNVERIFIABLE from this repo.** To settle it: one request to the live host with
`X-Forwarded-For: 203.0.113.9` and an invalid password, repeated 6 times, then check whether the 6th
is 429 (keyed on the real address) or 401 (keyed on the forged one). If the 6th is 401, R2-1a is a live
P1. If it is 429, the code defect is latent and P2.

R2's confidence note ("MEDIUM on whether `X-Real-IP` survives") is the right instinct, but the
decisive question is whether the proxy sets `X-Real-IP` *at all*; if it does, the XFF fallback never
runs. Do not ship the fix R2 proposes (`rightmost` XFF) without knowing that — a rightmost hop is the
proxy itself on a single-hop deployment and would collapse every client into one bucket, the bug the
`df43da8` commit was fixing ("was global bucket behind ingress", `reports/fastship-auth-tracking-validation-2026-10-28.md`).

### R2-2 — `scryptSync` (real, but P2 without R2-1a)

`main.ts:178-186` uses `scryptSync(password, salt, 32)` with Node's defaults (N=16384, r=8, p=1) and
`timingSafeEqual`. Hot paths: register `:520`, login `:540` (only when the identifier resolves to a
row — the `!r ||` short-circuit skips it for unknown users), `/api/auth/reset` `:669` **before**
`accountFor` at `:671`, `/api/me/password` `:709-710`, admin reset `:2636`, and phone recovery after a
valid proof (`phone-identity.ts:287`). So the reset path really does burn a KDF for an unauthenticated
request with no account.

**Why P2:** the 50/10min per-address bucket at `:2750` and the 5/10min per-identity failure bucket at
`:535-541` bound the damage unless R2-1a lets the attacker mint buckets. A single IP gets 50 logins
per 10 minutes ≈ 2 s of CPU (and only for existing identifiers), plus 20 resets ≈ 0.8 s. That is a
latency bug, not an outage. It becomes an outage exactly when R2-1a is live: 5 attempts per existing
username × the whole table, with one KDF each, is tens of CPU-minutes per 10-minute window. Correct
fix (async `scrypt` via `promisify`, and hash after `useCode` succeeds) regardless.

Also correct but unstated: this blocks only the **API process**. `server/worker.ts` is a separate
process (`infra/main.bicep:328-343`, `node server/worker.ts`) with its own event loop.

### R2-3 — declared scope leak (confirmed, upgraded in precision)

`resource-scope.ts:250-256`:

```js
const searchingDriver = actor.role === 'driver' && order!.status === 'searching';
if (!searchingDriver) this.participant(order!, actor);
```

No `enabledServices`, no `servesFor`, no `order_releases` check, no `status === 'active'` check.
`serializeScope` (`:114-125`) returns `declaredValueMinor` and `sourceRef`. Compare `getOrder`'s
`canSee` (`main.ts:321-323`), which requires all four. So the finding is real, and it is worse than
stated in two ways: a driver who **released** the order (excluded by `getOrder`'s `released` check,
`:319-320`) can still read it, and a **pending** driver (no `needActive` on the route) can read it.
Reachable by any authenticated account whose `role === 'driver'`, including one that just registered
when `WIND_IDENTITY_MODE=self-service`.

`summary` (`:184-189`) does put the same object into `toOrder`, but `toOrder` only runs after
`getOrder`/the filtered `/api/jobs` query, so that path is confined to orders the driver may already
see; it still leaks `sourceRef` where only dimensions are needed. PG-only (`requireAvailable` and
`declaredScopeRow` return false/null on SQLite), which is why this is latent on today's deployment.
**P2, keep.**

### R2-4 — phone recovery verify flood (mechanism real, unreachable now)

`prove` (`:258-314`) calls `this.available()` (`:264`) before `command(...)`, which 409s when
`phoneSchemaAvailable` is false (SQLite) and 503s when no provider is configured; the live VM has no
SMS provider (`release-readiness...:41-44`). When it *is* enabled: `bad()` is
`{status:400,body:{error}}` with no `persist:false` (`:17`), and `command` inserts a
`phone_command_results` row whenever `response.persist !== false` (`:82`), so a bogus `challengeId`
does persist a 400 row; `reconcileStale` (`:212-222`) never deletes old rows; and every call takes the
global `identity_commands` advisory lock (`:73`). All true. P3 until the SMS + PG cutover; then it is a
P2 and should be fixed with the rate limit and the "look up the challenge before locking" change R2
proposes.

### R2-5 — support password reset audit (confirmed P2; premise wrong)

`main.ts:2631-2644` returns `{password}` and writes nothing. `rg security_events server/main.ts` shows
inserts only for disputes, incidents, proof failures/resets, exceptions and courier blocks — **not**
for this route, and `rg staff_actions server/` shows writes only inside `ops.ts`. So R2's statement
"every other sensitive admin action on this server writes an audit trail" is false: `editUser`
(`:2547-2611`), `approve` (`:2615-2621`), `DELETE /api/admin/users/:id` (`:2623-2628`), the cash
endpoints and settings have no `security_events`/`staff_actions` row either. That makes the finding
*more* important, not less. P2 confirmed.

### R2-6 — `/api/ready` (confirmed, lower severity)

`main.ts:479-495`, registered `}, true)` → public. On SQLite it runs `accessSync` twice, a
`SELECT COUNT(*) FROM sqlite_schema`, then `BEGIN IMMEDIATE`/`ROLLBACK` (`:491`), which takes the
`sqliteLock` and the SQLite RESERVED lock (`persistence.ts:193-196`). Confirmed. Two corrections:
(i) the lock is taken and released in two statements; nothing is held, so this is contention, not a
lock-up; (ii) `schema` is hardcoded `3` on SQLite (`:480`), so the "reveals the migration level" claim
is false for the live backend (true on PG, `:487-489`). Also `/api/health?protocol=1` is an equally
unauthenticated DB read with no limiter (`:477`), so `/api/ready` is not a unique lever. **P3.**

### R2-7 — deletion retention (code confirmed, policy disclosed)

`deleteAccount` (`:723-749`) clears name/phone/email/password/vehicle/orders' personal fields/
`checkpoint_reports.note`/`order_messages.body`, but not `order_disputes.reason`,
`safety_incidents.note`, `order_scope_checks`, or `security_events.detail`. Confirmed. However
`server/account-deletion.html:21` says: "Order/plan records, internal identifiers, request hashes and
operational/security records remain; staff proof-reset notes may contain personal text. Retained
records have no automatic expiry", and `server/privacy.html:41` repeats it. The claim that "the
statement it makes is false" does not hold; the gap is disclosed. The remaining issue is that the
disclosure does not name dispute/incident narratives specifically and there is no expiry, so **P3**:
a retention design gap, not a policy violation. (Product judgement: disputes and incidents are the
records you *want* to keep; the right fix is naming them and adding a retention period, not blanking
them.)

### R2-8 — Entra nonce (mechanism confirmed, P3)

`main.ts:360-362` takes `body.nonce` and `verifyEntraIdToken` compares it to `claims.nonce`
(`entra.ts:125`); both come from the caller, and the JWT payload is readable, so the comparison only
proves the caller read the token. `entra_replay` on `sha(claims.tokenId || idToken)` (`:372-375`) is
the real single-use guard, and it is inserted before any session is minted, so a leaked token's first
exchange wins but a replay loses. Impact is defence-in-depth only; Entra is unconfigured on the live
VM. **P3**; the finding's own "hence P2 not P1" is one notch too high.

### R2-9 — customer stats on searching orders (confirmed P3)

`main.ts:292` spreads `customerStats` for `viewer.role === 'driver' && (assigned || r.status === 'searching')`.
`customerStatistics` (`statistics.ts:18-24`) returns `rating` (only with ≥3 ratings) and `trips`.
Correction to R2: both callers of `toOrder` that reach a searching order — `getOrder` (`main.ts:321-323`)
and `/api/jobs` (`:1773`) — already apply `enabledServices` + `servesFor` + the `order_releases` filter,
so R2's "a driver whose vehicle cannot serve the service" is **not** reachable here (that part is only
true of `/api/orders/:id/scope`, R2-3). What remains is that every eligible driver who never bid sees
the customer's rating and trip count. Coarse profiling, live, P3.

### R2-10 — `/api/route` gate (informational)

`:2338-2343` has no `need`/`needActive`; any authenticated account, including `pending`, can call it,
120/10min per user. Confirmed. But OSRM is a self-hosted Container App (`infra/main.bicep:345-354`) and
the live VM has **no `OSRM_URL`** (`release-readiness...:42`), so `roadRoute` falls back/`503`s and there
is no billable third-party quota to burn. Add `needActive` for hygiene; not a P3 finding.

### R2-11 — road-report deny-list (KILL)

`main.ts:1724` `if (user.role === 'customer') fail(403,'forbidden'); needActive(user);`. `Role` is
exactly `'customer' | 'driver' | 'admin'` (`src/model.ts:18`), and both schemas enforce it:
`postgres-schema.sql:342` `CHECK (role IN ('customer','driver','admin'))`, and the SQLite `users`
table has the same CHECK. There is no `merchant`, `partner` (`partner:souq` is a *customer* row,
`main.ts:1371-1372`) or `support` role — `staff_role` is a separate column on admin rows. So the
deny-list is today *identical* to `need(user,'driver','admin')`, and the "future role" is hypothetical.
No exploit, no present defect. This is a style preference, not a review finding.

### R2-12 — `checkPassword` throw (confirmed, latent)

`main.ts:183-186` `stored.split(':')` → `hash` can be `undefined`; `Buffer.from(undefined,'hex')`
throws; `timingSafeEqual` throws on a length mismatch. `deleteAccount` writes `password = ''`
(`:731`), so an unparseable row exists by design, but its phone becomes `deleted-<id>` (`:731`) and
the login lookup (`:537-538`) and `phoneIdentity.loginAccount` (`phone-identity.ts:94-99`, joins
`u.phone = m.legacy_phone`) can no longer find it. Confirmed and correctly caveated. P3, latent.

## Upgrades

1. **R2-3 reach and precision (P2, was P2 but under-described).** The `/scope` fast path bypasses
   `order_releases` and `viewer.status === 'active'` as well as the service/vehicle filters, so a driver
   who released a job and a not-yet-approved driver can still read `declaredValueMinor`/`sourceRef`.
   Cite `resource-scope.ts:250-256` against `main.ts:319-323`; this is the clearest "a guard R2 says
   exists, that is missing" item in the pair, and it is in R2's own clean-list route family.
2. **R2-5's audit gap is wider than reported.** `editUser` (`main.ts:2547-2611`) lets any admin change
   a non-admin user's phone and email (`:2552-2553`), clears `phone_verified_at`, `approved_at` and
   every session (`:2578-2588`), with no `security_events`/`staff_actions` row. Changing the phone is a
   stronger takeover primitive than the password route R2 reported (the victim's login identifier is
   rewritten), and it is equally invisible. Treat the finding as "admin identity actions are
   unaudited", not "the password route is unaudited".
3. **R2-1a also removes the public `/api/track` limit.** `main.ts:1543-1545` uses the same address
   expression for `track-view` (600/10min), which R2 lists in "already fixed" (the `df43da8` commit).
   If the header key is spoofable, that fix is void and the unauthenticated `trackView` query
   (`orderSelect` + HMAC, `:1557-1568`) is unmetered. Fold it into the finding.

## Contradictions between the reviewers

- **Backend.** R1 treats the ledger, payments, quotes, scope, dispatch and durable commands as live and
  assigns P1/P2 accordingly. R2 correctly says the PG cutover is not done (and its `/api/ready` and
  phone findings are predicated on SQLite). Neither noticed that `server/db/runtime.ts:20-21` makes
  Postgres effectively **test-only** unless `WIND_POSTGRES_STAGING=1`, which is the single most
  important severity fact in either report. R1's two P1s and four P2s are PG-gated; R2's three P1/P2s
  that are not (headers, scrypt, ready) are the only findings that touch the deployed product.
- **Ingress.** R2 cites the Container Apps bicep as production. The Oct 29 deployment record says the
  Container App is down and the VM is serving. R2's `WIND_TRUST_PROXY=1` is therefore a template claim,
  not a production fact (R2-1b, UNVERIFIABLE).
- **`getOrder` as the chokepoint.** R2's clean list says `getOrder`'s `canSee`/`released` gate "is used
  by ... advance, exception, release". It is not: `advanceOrder` (`:1930`), `reportException` (`:1959`)
  and `release` (`:1908`) query `orders` directly and check `driver_id` themselves. The authorization
  outcome is equivalent, so this is an accuracy error in the clean list, not a bug — but it is exactly
  the kind of assumption that let the `/scope` handler ship without the gate.
- **Refund reachability.** R1's caveat says `WIND_BOP_*` enables the path; it does not. R2 does not
  discuss payments. Neither is right about what is live.
- **Audit coverage.** R2's premise "every other sensitive admin action writes an audit trail" is
  contradicted by `editUser`, `approve`, `deleteAccount` (admin path) and `recordCash`, none of which
  write one. R1's `recordCash` finding describes the missing control but does not connect it to the
  same gap.

## Genuinely missed (max 5)

1. **One customer can freeze the job board for every driver, indefinitely.** `POST /api/orders` has no
   rate limit and no cap on open orders (`main.ts:1310-1313` only calls `needActive`), `GET /api/jobs`
   returns `ORDER BY COALESCE(o.scheduled_for, o.created_at), o.id LIMIT 50` (`:1773-1776`), and
   searching orders are never expired or swept (the only order cleanup in the process is
   `alertReleasedJobs`, `:962-963`; the hourly prune is sessions/request_limits only, `:2924-2927`).
   An active self-service customer creates 50 immediate orders; every real immediate job of that
   service created after them sorts behind the flood and is invisible to every driver who serves it,
   until an admin cancels the flood by hand. P2 (P1-availability for the marketplace) and it is on
   the live backend.
2. **`POST /api/admin/users/:id/approve` unblocks anyone, bypassing the block controls.**
   `main.ts:2615-2621` selects the target with no `status` predicate and runs
   `UPDATE users SET status='active', approved_at=...`. It has no `security_events` row, and it skips
   the `carrying_parcels`/`recovery: 'return'` guard that `editUser` enforces before a block
   (`:2573-2576`) and the custody handling at `:2590-2599`. An admin can un-block a driver blocked for
   a safety incident with one call; if the block had set their parcels to `returning`, they are now
   active again with custody. P2/P3.
3. **Booking is not idempotent unless the client volunteers a `requestId`.** `main.ts:1330-1335`
   takes the unprotected path whenever `requestId == null` (the shipped client does send one,
   `src/booking.ts:31-36`, but the API contract still allows omission and the partner path never sends
   one). Two parallel identical bookings create two `searching` orders and can be assigned two
   drivers; the per-driver guard only stops one driver taking two orders, not one customer having two.
   P3 (P2 for older clients / partner integration).
4. **Rating is a check-then-write with no transaction on SQLite.** `main.ts:1512`/`:1519`: the guard
   reads `order.rating`/`priceRating` from the `getOrder` snapshot and the `UPDATE` has no
   `WHERE rating IS NULL` predicate; two concurrent conflicting submissions (a double-tap from two
   devices, or a retry with a changed value) both pass the "not yet rated" check and the second
   `UPDATE` wins, so the 409 that prevents a changed rating is bypassable. P3, live.
5. **Admin `settings` accepts `commission: 0` and nothing renders a warning.** `main.ts:2688` treats
   `n < 0` as the only failure; `:1061` then throws on every `/api/price`. This is R1-11's trigger
   reachable entirely from the admin UI, but neither report checked what the UI allows and R1 rated
   only the server consequence. Worth listing as the operator-facing half of R1-11.

## What the reviewers got right (keep it)

- R1: the refund reservation/cap structure and the `requestId` analysis; the ledger's two-authority
  diagnosis and the exact `business_ref` shapes; the `proof_attempts` lifecycle (including that
  `return` and blocking delete it); the cash-append-only + `WHERE status='pending'` double-settle
  guard; the core of `advanceOrder`'s `expectedStatus` contract (verified: it is inside
  `driverCommand`'s `BEGIN IMMEDIATE`, `:2027`, and the PG `FOR UPDATE` at `:2785`, so it really is
  serialized); the `sessions` index; the `minorUnits(0)` trace; and the clean-list items
  `persistence.memo` invalidation, `BEGIN IMMEDIATE`→savepoint translation, promo row lock, and
  snapshot/import reconciliation. The proof-lock and reschedule findings are both genuinely there.
- R2: the `/scope` handler trace (the best find of the two documents); the `scryptSync`-before-lookup
  detail on `/api/auth/reset` and the correct note that a uniform answer already hides the account; the
  `bad()`/`command()` row-persistence and global-lock analysis (verified: `bad()` sets no
  `persist:false`); the `/api/ready` write-probe trace; the `checkPassword` throw; the bearer-only/no-CSRF
  analysis; the `order_releases`/session-lifecycle checks; and the `partner` key constant-time compare.
  Their "already fixed" list (track limiter, HMAC driver ref, Entra boot guard) still holds in code.

## Net: what survives

Against the deployed (SQLite, VM) product, in severity order:

1. **P1 (conditional): the address-keyed auth limiter** — real code defect, live only if the front hop
   lets a client-supplied address through; the 6-request probe above settles it. If it is live, it
   also voids the `/api/track` limiter and turns R2-2 into an outage.
2. **P2: single-admin debt forgiveness** (R1-9, live, 10,000 ILS/call, no approval row).
3. **P2: pending remittance is driver-only** (R1-5, live, permanently strands the debt and the user).
4. **P2: duplicate subscriptions** (R1-4, live, double billing after one double-tap).
5. **P2: unaudited admin identity/password actions** (R2-5 + the `editUser` upgrade; live).
6. **P2 (new): unbounded order creation freezes `/api/jobs`** for every driver, with no cleanup.
7. **P2: `scryptSync` on the reset/login path** (availability; P1 only with #1).
8. P3s: proof-reattempt, reschedule race, rating race (all live); `customerStats`, `checkPassword`,
   `/api/ready`, deletion retention, `/api/route` (live but low impact).
9. **Latent until the Postgres cutover, then fix before switching anything on:** the refund outcome
   map, the ledger's one-shot import, `/scope`, the phone-verify flood, the worker's missing
   `onOffer`, the promo/card-cash races, `minorUnits(0)`, and the PG-only N+1.
10. **Killed:** R2-11 (roads deny-list). **Unverifiable:** R2-1b (the deployed `WIND_TRUST_PROXY` and
    proxy behaviour).

**Was there a P1 hiding between the two reports?** No. The guard R2 asserts and R1 assumes —
`getOrder`'s `canSee` — is genuinely bypassed by `GET /api/orders/:id/scope`, but that is R2's own P2
and it is Postgres-only. The strongest item that sits between them is the audit gap: R1 finds a
money-moving admin action with no second approver, R2 finds an unaudited admin password reset, and
neither noticed that `editUser` rewrites a victim's login identifier with no audit and no second
check. That is P2, not P1, and it is listed under Upgrades. Everything else that would be P1 is
gated by the SQLite/Postgres boundary one of the two reports got wrong.
