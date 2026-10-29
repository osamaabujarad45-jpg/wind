# Server core correctness and data integrity review

## Verdict

The order state machine and the cash-entry ledger are better guarded than the code reads at first glance: every order-state mutation serializes on the order row on Postgres (via `invoke`'s `FOR UPDATE`) and on `BEGIN IMMEDIATE` on SQLite, promo budgets take a real row lock, and `cash_entries` is append-only in both schemas. The real gaps are elsewhere: the double-entry ledger is a one-shot import that silently stops matching the authoritative cash sums, the refund state machine records "unknown" as "rejected" (a double-payout window), and several check-then-write paths (subscriptions, first-order promos, cash decisions, the card-vs-cash receipt) have no guard at all. No P0 found; the working-tree delta itself is sound.

## Findings

### [P1] A refund whose provider outcome is `pending` or `timeout` is recorded as `rejected`, and can be paid a second time
- Where: `server/domain/payments.ts:97-101` (cap check at `:89`, route at `:105`)
- Code:
  ```ts
  let result: Result; try { result = await provider.refund(intentId, amount); } catch { result = { outcome: 'timeout', providerRef: '' }; }
  ...
  if (result.outcome === 'captured') { await this.db.run("UPDATE refunds SET status='completed' ..."); ... }
  else await this.db.run("UPDATE refunds SET status='rejected' WHERE id=?::uuid", id);
  ```
- Why it matters: `Outcome` is `'pending' | 'captured' | 'failed' | 'voided' | 'timeout'`. Only `captured` means "money moved", but everything else is written as the terminal `rejected`. `pending` is the normal answer for an asynchronous card/BOP refund, and `timeout` means the provider may well have committed. The cap at `:89` counts `status IN ('requested','approved','completed')`, so a `rejected` row reserves nothing of the captured amount. `refundOrder` (`:105`) also forwards `body.requestId` which is optional, so a client retry is a brand-new `business_ref`.
- Failure scenario: an admin refunds 120 ILS of a 200 ILS capture; the provider accepts but replies `pending` (or the 10 s fetch times out after the provider committed). Wind writes `refunds.status='rejected'`, leaves `payment_intents.status='partially_refunded'`, and nothing in the API can transition that row again. A second 120 ILS refund now passes the cap (0 completed/requested) and executes: the customer receives 240 ILS against a 200 ILS capture, and the audit trail claims one was rejected. Same outcome if the process dies between the reservation commit (`:94`) and the settle transaction: the row stays `requested` forever with no operator path to resolve it.
- Fix: map `captured→completed`, `failed|voided→rejected`, and `pending|timeout→` a new `unknown`/`pending` refund status that keeps reserving the amount; refuse any further refund on that intent until the unknown row is reconciled (re-query the provider, or a `finance` staff decision). Make `requestId` mandatory in `refundOrder` so the retry window is actually covered by a stable `business_ref`.
- Confidence: HIGH (traced; reachable today only with `WIND_BOP_*`/`WIND_PAYMENTS_TEST_ONLY` set, because `createPayments` leaves `provider = null` otherwise — `server/domain/payments.ts:116`).

### [P1] The double-entry ledger is an import-time snapshot; every later order and cash row is invisible to it
- Where: `server/domain/ledger.ts:66-93` (the only writer) and `:94-97`, `:99-103`, `:104-109`, `:168`
- Code:
  ```ts
  async importLegacy(actor: Actor) { ... const orders = await this.db.all("SELECT * FROM orders WHERE driver_id IS NOT NULL AND status IN ('completed','returned') ORDER BY id"); ... }
  async driverBalance(driverId: number) { ... "SELECT COALESCE(sum(e.debit_minor-e.credit_minor),0) AS balance FROM ledger_accounts a LEFT JOIN ledger_entries e ON e.account_id=a.id WHERE a.kind='driver_receivable' AND a.owner_id=?" ... }
  ```
- Why it matters: `postJournal` (`:40`) is called from exactly one place, `importLegacy` (`:73`). Nothing posts a journal when `advanceOrder` completes an order (`server/main.ts:1949`), when `recordCash` books a remittance/adjustment (`server/main.ts:2465`), or when the driver confirms one (`server/main.ts:2432`). Meanwhile the number the driver app actually shows, `owedCents`, is a *derived* sum over `orders`/`cash_entries` (`server/main.ts:2407`). So the repo now has two authoritative balances that diverge as soon as one order completes after the import. `projectedExposure` (`:104-109`) builds the cash-cap exposure from the stale ledger balance plus active commissions, so it under-counts by every completed-but-not-imported job.
- Failure scenario: an operator runs `POST /api/admin/ledger/import` on Monday. On Tuesday a driver completes five parcels (15 ILS commission each). `GET /api/driver/ledger` still returns Monday's `balanceMinor`; `GET /api/admin/ledger` shows `platform:revenue` frozen; `GET /api/driver/cash` shows a different, correct number. Then the cap is switched on (`PROJECTED_CASH_CAP_MINOR` exists, `cashCapActivated` is hard-coded `false` at `:13`, and `guardAcceptance` is not called from the accept path at all — grep shows only tests), and a driver whose debt is 300 ILS post-import still sees 0 and can accept more work.
- Fix: post the same `business_ref` shapes the import uses at the source of truth — `order:{id}:commission` / `order:{id}:discount` from `advanceOrder`'s completion branch, `cash-entry:{id}` from `recordCash` and from the confirm transition — inside those existing transactions (the ids are already idempotent, so a retry is safe). If the ledger is meant to stay an archive, stop exposing `driverBalance` as a balance and compute `GET /api/driver/ledger` from the same query as `cashOwed`.
- Confidence: HIGH.

### [P2] The admin's "reattempt" decision after a proof lock leaves the five failures in place, so the delivery can never complete
- Where: `server/main.ts:1999` vs `:2001-2003`; the lock is enforced at `:1941`
- Code:
  ```ts
  if (body.action === 'reattempt') (await run("UPDATE orders SET status = 'in_transit', updated_at = ? WHERE id = ?", Date.now(), id));
  ...
  else { (await run("UPDATE orders SET status = 'returning', return_code = ?, updated_at = ? WHERE id = ?", ...)); await run('DELETE FROM proof_attempts WHERE order_id = ?', id); }
  ```
- Why it matters: `proof_attempts` is keyed by `order_id` (`sqlite-schema.ts:52`, `postgres-schema.sql` proof_attempts) and outlives status changes. `advanceOrder` refuses any completion while `failures >= 5` (`main.ts:1941`), and the only other clear is `POST /api/admin/orders/:id/proof-reset` (`main.ts:2495`). The "try delivering again" decision, which is exactly the case where the driver needs a fresh budget, leaves the counter at 5.
- Failure scenario: the courier mistypes the recipient's 4-digit handover code five times at `in_transit` (the fifth failure is stored as `failures = 5`), so the sixth attempt is 409 `proof_locked`; the courier reports an exception (allowed from `in_transit`) → `on_hold`; support picks **reattempt** → 200, order back to `in_transit`; the courier's very next attempt is 409 `proof_locked` again. The parcel is stuck in custody, the customer never receives it, and support must separately call `proof-reset` — nothing in the 200 response hints at that.
- Fix: in the `reattempt` branch add `await run('DELETE FROM proof_attempts WHERE order_id = ?', id)` and a `PROOF_RESET`-style `security_events` row, exactly as the `return` branch already does.
- Confidence: HIGH.

### [P2] A double-tapped "Subscribe" creates two pending subscriptions; the admin can activate both and charge twice for one month
- Where: `server/main.ts:2476-2481`; no constraint in `server/db/sqlite-schema.ts:31-34` or the Postgres `subscriptions` table
- Code:
  ```ts
  if ((await latestSubscription(user.id))) fail(409, 'already_subscribed');
  const s = (await settings());
  (await run("INSERT INTO subscriptions (user_id, plan, status, price, created_at) VALUES (?, ?, 'pending', ?, ?)", user.id, plan, ...));
  ```
- Why it matters: check-then-insert with no transaction and no uniqueness behind it. `latestSubscription` (`:213-218`) returns at most one row, so it cannot see a row that is being inserted in parallel. Both requests insert `pending` rows and both queue an `attention` push.
- Failure scenario: a driver double-taps Subscribe (two parallel POSTs, both read `null`) → two pending 99 ILS rows. `/api/admin/subscriptions` lists both as separate requests; the admin activates both (`:2675` sets `ends_at = now + 30*DAY` on each) → the driver is charged 198 ILS in cash for a single 30-day period, and `activePlan` only ever reports one plan.
- Fix: add `CREATE UNIQUE INDEX subscriptions_one_pending ON subscriptions(user_id) WHERE status='pending'` to both schemas, wrap the check+insert in `persistence.exec('BEGIN IMMEDIATE')`, and return 409 when the insert conflicts (or use `INSERT ... SELECT ... WHERE NOT EXISTS`).
- Confidence: HIGH.

### [P2] A pending cash remittance can only be decided by the driver, so blocking the driver strands the debt forever
- Where: `server/main.ts:2428-2433` (driver-only decision), `:2410-2412` (`cashSettled`), `:2574-2576` (blocking), `:2742` (blocked users cannot authenticate)
- Code:
  ```ts
  route('POST', '/api/driver/cash/:id/confirm', async ({ user, params, body }) => {
    need(user, 'driver');
    ...
    if (!(await run("UPDATE cash_entries SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'", ...
  ```
  and
  ```ts
  if (balance && (balance.owedCents !== 0 || balance.pendingCents > 0)) fail(409, 'cash_outstanding');
  ```
- Why it matters: `cash_entries` is append-only and the *only* status transition in the codebase is this driver route (grep: one `UPDATE cash_entries`). `recordCash` only inserts. An admin deleting a driver hits `cashSettled`, which refuses while `pendingCents > 0`; a role change hits the same check (`:2572`). So a pending remittance with an incapacitated driver is a permanent block.
- Failure scenario: the admin records a 200 ILS handover for driver X (status `pending`). X is then blocked for an unrelated safety report — `editUser` allows blocking a driver who owes nothing outstanding (`:2574` only guards carrying parcels). X can no longer authenticate, so no one can ever confirm or dispute the 200 ILS: `pendingCents` stays 200 forever, `GET /api/admin/cash` shows it, and `DELETE /api/admin/users/X` / any role change is refused with `cash_outstanding`. The same happens if the driver simply uninstalls the app.
- Fix: add `POST /api/admin/cash/:id/decide` gated by `needStaff(..., 'finance')` that applies the identical `WHERE status='pending'` transition and records `decided_by`, and call it (or auto-dispute the pending rows) when a driver is blocked or deleted.
- Confidence: HIGH.

### [P2] The "first order only" rule is a count on `orders` taken outside any customer lock; the referral path takes no lock at all
- Where: `server/main.ts:804`, `:810`, `:1276-1284`
- Code:
  ```ts
  if ((await one("SELECT id FROM orders WHERE customer_id = ? AND status <> 'cancelled'", user.id))) fail(409, 'invite_first_order_only');
  ...
  if (promo?.id) { const promoRow = (await one(... 'SELECT * FROM promo_codes WHERE id=? FOR UPDATE' ...)) ... }
  ```
- Why it matters: the only lock taken before applying a discount is on `promo_codes`. Two *different* first-order promos, or a referral code (`promo.id === null`, so the `if (promo?.id)` block is skipped entirely), serialize against nothing. Each transaction reads "this customer has no orders", then inserts its own order with `discount` set.
- Failure scenario: a new customer submits their first booking twice in parallel (double tap, two devices, or a retried POST without `requestId`) using invitation code `WABCDE` and a first-order promo `WELCOME`. Both orders are created with `discount = 10`; `referrals` has a PK on `referee_id` so only one referral row survives, but **both orders keep the discount** — Wind funds 20 ILS of first-order credit for one invited customer, and the invite's "one free first delivery" is spent twice. On SQLite this is masked by `BEGIN IMMEDIATE`; on Postgres (`/api/orders` runs inside `atomic`, which locks nothing) it is open.
- Fix: take a per-customer lock before evaluating promos — `SELECT id FROM users WHERE id=? FOR UPDATE` at the top of `createOrder` on Postgres (it is already inside the envelope), or `pg_advisory_xact_lock(hashtextextended('customer:<id>',0))` — and re-evaluate `promoFor` after it. `UNIQUE(referee_id)` cannot express "one discounted order", so the lock is the guard.
- Confidence: HIGH (code path traced; backend-conditional as noted).

### [P2] Card payment and cash settlement of the same order are unlinked: an order paid by card can still be settled as cash
- Where: `server/domain/ledger.ts:125-133` and `server/domain/payments.ts:50-53`
- Code:
  ```ts
  if (order.driver_id == null || !Number.isSafeInteger(order.price_minor) || order.price_minor <= 0) this.fail(409, 'receipt_unavailable');
  if (['searching', 'cancelled'].includes(order.status)) this.fail(409, 'receipt_unavailable');
  ```
  (no `payment_intents` read) and, on the other side, `createIntent` checks only `Number(order.price_minor) !== body.amountMinor`.
- Why it matters: the two settlement records for one order are independent. A captured card intent does not mark the order as "not cash", and a cash receipt does not block a card intent. `advanceOrder` does not reconcile them either.
- Failure scenario: the customer pays the 40 ILS fare by card (`payment_intents.status='captured'`); at the door the courier opens the receipt screen (offered for any non-`searching`/non-`cancelled` order) and records 40 ILS collected in cash. Both succeed: the customer paid twice, the platform holds the card capture, and the courier's cash balance is untouched (the 40 ILS goes straight into their pocket). No endpoint reports the conflict.
- Fix: in `createReceipt`, refuse when `SELECT 1 FROM payment_intents WHERE order_id=? AND status IN ('captured','partially_refunded')` exists; in `createIntent`, refuse when a `cash_receipts` row exists with `status <> 'due'`. One query each, inside the existing transactions.
- Confidence: MEDIUM (both code paths traced; the double charge requires `WIND_BOP_*` to be enabled, as above).

### [P2] Dispatch offers issued by the expiry worker are silent — the worker's `Dispatch` has no `onOffer`
- Where: `server/worker.ts:122` vs `server/domain/dispatch.ts:196`; `onOffer` is only wired at `server/main.ts:911`
- Code:
  ```ts
  return new Dispatch(this.db, new Eligibility(this.db, fail), fail).processExpiries();   // worker.ts:122 — 5th arg omitted
  if (this.onOffer) await this.onOffer(candidate.driverId, Number(order.id));            // dispatch.ts:196
  ```
- Why it matters: every offer issued by `expireOne → issueNext` in the worker skips the push/outbox write entirely, because `onOffer` is `undefined` on that instance. Only offers issued from the API process (round start, decline) notify the driver.
- Failure scenario: a ride round offers to driver A; A's phone is asleep and the offer expires. `processExpiries` → `issueNext` offers the ride to driver B — with no notification, so B only learns of it if the app happens to poll inside the 20 s offer window. The shortlist is walked to `dispatchMaxOffers` with at most one driver ever notified; the round exhausts and the customer's ride is never matched.
- Fix: pass the callback in `DurableWorker.processDispatchExpiries`, e.g. `new Dispatch(this.db, new Eligibility(this.db, fail), fail, undefined, (driverId, orderId) => enqueuePush(this.db, [driverId], 'offer', orderId))` — `enqueuePush` is already imported in `worker.ts`, and `processExpiries` wraps each expiry in `db.atomic`, so the transaction requirement holds.
- Confidence: HIGH.

### [P2] Any single admin can forgive up to 10,000 ILS of a driver's debt with no second approver, although the approval table exists
- Where: `server/main.ts:2443-2446` and `:2463-2465`; `server/domain/ops.ts:73-82` is the unimplemented control
- Code:
  ```ts
  async function recordCash(user: User, body: Row, kind: 'remittance' | 'adjustment') {
    need(user, 'admin');
    const amount = body.amountCents;
    if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) fail(400, 'invalid_amount');
  ```
  and `if (kind === 'adjustment' && balance.owedCents - balance.pendingCents + amount < 0) fail(400, 'invalid_amount');` — a negative adjustment is accepted.
- Why it matters: a negative `adjustment` is a credit that reduces what the driver owes; a single admin call moves real money and only needs a 5-character reason. `financial_approvals` (`postgres-ops.sql:5`) plus `Ops.requestApproval`/`decideApproval` (which even enforces `second_approver_required`) exist, but grep shows `financial_approvals` is never read or written outside `ops.ts` — `recordCash` never consults it.
- Failure scenario: a dishonest or compromised admin account records `{driverId: 42, amountCents: -300000, reason: "goodwill"}` → driver 42's `owedCents` drops by 3,000 ILS, the driver keeps the cash they already collected, and the only audit trail is the `cash_entries.note` written by the same admin.
- Fix: for adjustments above a threshold (and for all negative ones), require a `financial_approvals` row with `status='approved'`, `subject_type='cash_adjustment'`, `subject_id` = the driver and the same amount, decided by a *different* admin; record its id on the entry.
- Confidence: HIGH (the control is absent; the impact is a policy judgement, not a crash).

### [P3] Rescheduling never re-checks that the order is still `searching`, so an accepted order can be re-dated into the future
- Where: `server/main.ts:1497-1500`
- Code:
  ```ts
  if (order.service !== 'parcel' || order.status !== 'searching' || order.scheduledFor == null || order.scheduledFor <= now + RELEASE_BEFORE) fail(409, 'cannot_reschedule');
  ...
  (await run('UPDATE orders SET scheduled_for = ?, updated_at = ? WHERE id = ?', at, now, order.id));
  ```
- Why it matters: the status test is on a read; the write has no `AND status = 'searching'` guard and no transaction around it, while `/api/jobs/:id/accept` commits `status='assigned'` in a separate transaction. Nothing re-validates after the acceptance.
- Failure scenario: the customer reschedules a parcel for tomorrow morning; the driver accepts in the same instant (accept only requires `status='searching'`). The reschedule's update lands after the accept commits → an `assigned` parcel whose `scheduled_for` is 18 hours away, with a courier already en route and `alertReleasedJobs` never firing for it. The courier must release (and eat the release) or sit on the parcel.
- Fix: `... WHERE id = ? AND status = 'searching' AND scheduled_for = ?` and return 409 `cannot_reschedule` when `changes === 0`.
- Confidence: HIGH.

### [P3] `minorUnits(0)` throws, so an admin setting commission to 0 breaks `/api/price` with a 500
- Where: `server/main.ts:1061`, `server/domain/quotes.ts:58-63`, settings validation at `server/main.ts:2688`
- Code:
  ```ts
  const commissionMinor = Number.isFinite(commissionRate) ? minorUnits(commissionOn(base.price, commissionRate)) : null;
  ...
  if (!Number.isSafeInteger(minor) || minor < 1 || minor > Number.MAX_SAFE_INTEGER) throw new RangeError('unsafe minor amount');
  ```
- Why it matters: `/api/admin/settings` accepts `commission: 0` (`n < 0` fails, `fractionSettings` only requires `n < 1`). `commissionOn(price, 0) === 0`, and `minorUnits` rejects 0 with a `RangeError` — not an `HttpError`, so the request is answered 500 and logged as `http_request_failed`.
- Failure scenario: an operator runs a zero-commission weekend; every `POST /api/price` on Postgres returns 500, so no quote is issued and no quote-bound booking can be made. The admin screen reports success.
- Fix: allow `minor >= 0` when the amount is a commission (`minorUnits(commissionOn(...), { allowZero: true })`), or map a zero commission to `null` (which the column already allows).
- Confidence: HIGH (the settings route and the throw are both direct reads; Postgres-only because `quotesAvailable` gates the branch).

### [P3] `GET /api/orders` still runs four to six queries per row; the memo in this diff only removes the availability probe
- Where: `server/main.ts:248-250`, `:289-293`, `:1449-1455`; memo at `server/domain/dispatch.ts:43`, `server/domain/ride-lifecycle.ts:25`
- Code:
  ```ts
  const dispatchInfo = await dispatch.summary(r.id, ...);
  const rideInfo = await rideLifecycle.summary(r.id, viewer, r);
  const scopeInfo = await resourceScope.summary(r.id, viewer, r);
  ```
- Why it matters: the working-tree change caches `dispatchAvailable`/`rideLifecycleAvailable`/`scopeAvailable` per request (6 of ~10 queries per row), which is a real win, but each row still issues ~4-6 statements (`dispatch.summary` round + offer, `rideLifecycle.summary` row + attempts, `resourceScope.summary`, `customerStats`/`myOffer`), on one synchronous SQLite connection, for up to `HISTORY_PAGE` = 200 rows. The route has no `limit()`. While the loop runs, every other request (including driver location uploads) waits on the event loop / the SQLite mutex.
- Failure scenario: a long-tenured customer opens the app: one `GET /api/orders` prepares and runs ~1,000 statements, blocking the single SQLite connection for the duration; concurrent drivers' `/api/location` posts are answered late (or time out) for the whole page build. A client that polls this route makes it continuous.
- Fix: batch the per-order summaries for the page (`WHERE order_id IN (...)`, grouped once) and skip `dispatch`/`ride`/`scope` for terminal rows; or cap the first page's terminal rows.
- Confidence: HIGH (query counts traced; no measured latency).

### [P3] `sessions` has no index on `user_id`, behind every logout and password change
- Where: `server/db/postgres-schema.sql:237-240` (only `token_hash` PK) and `server/main.ts:685`, `:715`, `:2588`
- Code: `CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL ..., created_at BIGINT NOT NULL);` and `(await run('DELETE FROM sessions WHERE user_id = ?', user.id));`
- Why it matters: sessions are append-only between hourly prunes and grow with every login, so each logout, password change, reset and admin edit is a sequential scan of the whole table. The SQLite schema has the same gap.
- Failure scenario: after a year of logins the table is large; `POST /api/me/password` and `POST /api/auth/reset` (which must also delete every session) become progressively slower on the single connection, and the admin user-edit path scans it inside its write transaction while holding `BEGIN IMMEDIATE`.
- Fix: `CREATE INDEX sessions_user ON sessions(user_id);` in both schemas (and `(user_id, created_at)` if the prune uses it).
- Confidence: HIGH.

## Suspicions (unverified)

- `server/domain/payments.ts:50-61`: `createIntent` inserts the intent, then calls the provider *outside* any transaction, and on a replay (`!created`) returns the prior row without re-querying the provider. A provider `create` that times out leaves the intent `pending` with `provider_ref = NULL` and no retry path; only `GET`/`query` (`:62-63`) ever refreshes it. Not traced to a user-visible failure.
- `server/main.ts:1945`: the lock notification is sent only on `failures === 5` exactly; two concurrent wrong codes can land 5 and 6 and the `attention` push is skipped (SQLite serializes, Postgres does not). Same class as the `proof_locked` finding but narrower.
- `server/main.ts:2059-2079` / `server/db/postgres-active-gps.sql`: `POST /api/orders/:id/payments/refund` and the payments webhook are handled outside `persistence.atomic` (`main.ts:2820-2823`), so `invoke`'s `SELECT ... FOR UPDATE` at `:2787` runs outside a transaction and locks only for the implicit statement. Harmless today; it will matter if payments routes ever call `queuePush`/`enqueuePush` (which throws outside a transaction).
- `server/db/sqlite-schema.ts:126-130`: the SQLite `cash_entries_no_edit` trigger compares only `amount_cents`, `driver_id`, `kind` and `OLD.status`, so an UPDATE of a `pending` row can also rewrite `note`, `recorded_by` and `created_at`. The Postgres equivalent (`postgres-guards.sql:82-84`) forbids that via a full-row comparison. No route does this today.
- `server/db/postgres-schema.sql:2` `cash_entries.amount_cents` has no `<> 0` in the base DDL but `postgres-schema.sql:322` adds it — fine; however `postgres-schema.sql:321` (`kind IN ('remittance','adjustment')`) is what makes the ledger import's negative-remittance branch (`ledger.ts:86-89`) reachable only from history. Not a bug, just a dead branch for new data.
- `server/main.ts:806`/`:812`: the discount is `min(amount, price - 1)` in whole shekels while `orders.price` is a float derived from `price_minor/100`; a promo worth exactly `price - 1` leaves a 1 ILS fare, which is probably intended but is not written down.
- `server/main.ts:1038-1040`: `/api/price` is limited to 120/10 min per customer but `/api/orders` (which recomputes `recommend()` including up to 11 OSRM round-trips) has no limit at all; a booking loop is a cheaper OSRM DoS than the price endpoint.
- `server/main.ts:2684-2695`: settings are written key-by-key inside one transaction but validated against `defaultSettings` before the transaction; a settings row added by a newer build makes an older build reject the whole update. Low.

## What I checked and found clean

- The working-tree delta (`dispatch.ts`, `native-push.ts`, `resource-scope.ts`, `ride-lifecycle.ts`, `main.ts`, `worker.ts`, `tests/outbox.mjs`): `Persistence.memo` is per-request, cleared by `run()` and by every transaction boundary (`persistence.ts:97-107`, `:153`, `:172`), so the cached availability booleans cannot survive a write in the same request. `PUSH_KINDS` exactly matches the `PushKind` union in `main.ts:888-892` (23 = 23), and the worker's `subscription()` now shares `validate()` with `expoTarget`, which is the same check the removed block performed. `npx tsc -p tsconfig.server.json --noEmit` is clean (regression check).
- `tests/outbox.mjs`'s new `PUSH_KINDS` loop: `notification(0, kind)` enqueues with `order = 0` → `append_domain_event(NULL, ...)` → `work.order_id` is null, so `validate()` skips every order/kind guard. The loop proves the allow-list, not the guard logic; a `destination_request` push with a real order id is not covered.
- `persistence.exec()` translates `BEGIN IMMEDIATE` to plain `BEGIN` on Postgres (`persistence.ts:184-197`), so the SQLite-flavoured `BEGIN IMMEDIATE` scattered through `main.ts` is not a Postgres syntax error; inside `atomic` it becomes a savepoint (`:173-183`) and an unclosed savepoint aborts the envelope (`:236`).
- Order mutation serialization: `/api/(orders|jobs|admin/orders)/:id` POSTs take `SELECT ... FOR UPDATE` before the handler on Postgres (`main.ts:2785-2788`), and `commands.ts:61` re-locks plus checks `version` for `commandId` clients. The accept path additionally locks the driver row (`main.ts:1812-1815`) and `postgres-guards.sql:17-18` backs it with a partial unique index on `orders(driver_id)` for ride/freight, plus the `assignment_guard` trigger for parcel/ride mixing. Double-assign is closed at both layers.
- Double-settle of a remittance: `UPDATE cash_entries ... WHERE id=? AND status='pending'` plus the append-only triggers in both schemas; a second confirm/dispute returns 409.
- Promo budget: `promo_codes` row lock + recount of `promo_redemptions` inside the same transaction on Postgres (`main.ts:1279-1283`), and `BEGIN IMMEDIATE` on SQLite; `UNIQUE(order_id)` exists on both backends (`sqlite-schema.ts:80`, `postgres-schema.sql:333`).
- `Refund` reservation/settle: the reservation transaction (`payments.ts:84-94`) locks the intent and the cap query counts `requested|approved|completed`, so two *concurrent* refunds cannot both be reserved; only the outcome mapping (F1) is wrong.
- `collectCod` / `remitCod` / `collect`/`return` receipt transitions: every write is `FOR UPDATE` + `WHERE status IN (...)` inside a transaction (`payments.ts:113-114`, `ledger.ts:151-165`), and `merchant_cod` has a real `CHECK(collected_minor <= goods_minor)`.
- Cash math: `cashOwed` (`money.ts`) does integer BigInt arithmetic and rejects unsafe inputs; `cashBalances` casts both backends to integer cents (`main.ts:2396`) and `MIN(discount, …)`/`LIMIT` rewrites are covered by `postgresSql()` (`persistence.ts:32-44`). I found no float-rounding or sign error in the derived balance.
- `snapshotSqlite`/`readSnapshot`/`reconcile`/`importSnapshot`: the freeze handle takes `BEGIN IMMEDIATE` before `backup()` (else the call throws), `user_version` and `integrity_check` are enforced, the import is a single advisory-locked transaction with `SAVEPOINT import_row` per row, `SET CONSTRAINTS ALL IMMEDIATE`, sequence re-`setval`, and a full reconciliation before commit. Non-idempotent DDL is not an issue: every migration is guarded by its `schema_migrations` row and wrapped in `pg_advisory_xact_lock` (`postgres-schema.ts:14`).
- Migrations are additive on SQLite: `initializeSqlite` guards every `ALTER TABLE` with `PRAGMA table_info`, runs `foreign_key_check` at the end, and refuses a database with `user_version > 3`; `migrateVehicleChoices` only rebuilds when the old CHECK is present and preserves ids.
- Order state machine: `advanceOrder` requires `expectedStatus === r.status`, `activeStatuses` excludes every terminal state, `nextStatus('on_hold')` returns `on_hold` so the generic advance cannot skip the admin decision, and `release`/`cancel`/`accept` all carry `WHERE status = ...` guards. `proof_attempts` is the one counter that outlives a decision (F3).
- `worker.claim`/`finish` leases: `FOR UPDATE ... SKIP LOCKED`, lease-owner matching on finish, `consumer_inbox` dedupe, and the retry backoff are correct; `validate()` is one authority check for both transports.
- Coverage note: `server/domain/eligibility.ts` (54 KB) was only spot-checked at `guard`/`base`/`coverage`/`lockPolicy`/`audit`. Every entry point first calls `measuredCapability`, which is false for SQLite and for a Postgres schema without the WP05 tables, so the live path never enters it; a full read of that file is the one part of this lens I did not complete. `server/db/postgres-schema.sql` (25 KB) was reviewed by targeted search (orders/users/sessions/promo/refund/constraints + index inventory) rather than line by line.
