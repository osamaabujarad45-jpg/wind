# Wind money and state — verified source atlas

- **Canonical revision:** `b89f2205965523b5ab8545dff3940d1eacb6062c` (`git rev-parse origin/master`).
- **Basis:** behavior below is from `git show origin/master:<path>` at that revision, not the working tree.
- **Backend boundary:** the legacy `cash_entries` flow works on SQLite and PostgreSQL. The double-entry ledger, cash receipts, quotes, and several additive custody guards are PostgreSQL-gated; SQLite does not silently acquire those behaviors (`server/main.ts:559-567`, `server/domain/ledger.ts:14-25`, `server/domain/quotes.ts:8-12`).

## 1. Booking and the command model

### `POST /api/orders`: actual operation order

The following is the `requestId` path through the route itself. The optional outer `commandId` wrapper is separate and is covered below.

| Order | Operation | Source |
|---|---|---|
| 1 | Require an active customer; apply the promo-code attempt limit when present. Destructure `requestId` and `commandExpiresAt` out of the body; the remaining object is `input`. | `server/main.ts:1685-1689`; role/active guards are `server/main.ts:412-416`. |
| 2 | Prepare lazy smart pricing. Reject `quoteId` combined with either `quotedPrice` or `price`; validate the quote UUID and require the PostgreSQL quote capability before doing booking work. | `server/main.ts:1690-1697`. |
| 3 | Define `authorize`, which reauthenticates after asynchronous routing and rechecks customer/active status. With `lock=true` on PostgreSQL it takes user/session share locks before that recheck. | `server/main.ts:1698-1710`. |
| 4 | **No `requestId`:** compute smart pricing if requested, reauthorize, enter `BEGIN IMMEDIATE`, call `createOrder`, commit, and return. This legacy branch writes no `order_commands` receipt. | `server/main.ts:1711-1716`. |
| 5 | **With `requestId`:** require a UUID. If a deadline is supplied, require a safe integer no farther than `BOOKING_COMMAND_TTL_MS + 60s` in the future. A deadline is optional; `expired()` is false when it is absent. Hash canonicalized `input`, which excludes both `requestId` and `commandExpiresAt`. | `server/main.ts:1717-1723`; canonical key sorting/hash is `server/main.ts:232-235`; the client TTL is 10 minutes at `src/booking.ts:7-10`. |
| 6 | Define `replay()`: read `(user_id, request_id)` from `order_commands`; if found, reauthorize first, reject a different payload hash, then return `getOrder(existing.order_id, user)`. Thus this layer replays the order's **current** projection, not a frozen HTTP response. | `server/main.ts:1724-1730`. |
| 7 | **First replay happens before the first expiry check.** A committed command therefore returns its order even after its deadline or after tariffs changed. Only if no receipt exists does the route raise `409 booking_command_expired`. | `server/main.ts:1731-1733`. |
| 8 | Compute smart pricing (unless quote-bound), reauthorize, and begin the write transaction. | `server/main.ts:1734-1737`. |
| 9 | Inside the transaction, **replay a second time** to cover a competitor that committed while routing was awaited. A hit rolls back and returns that order. **The second expiry check follows this replay**, immediately before `createOrder`. | `server/main.ts:1738-1742`. |
| 10 | `createOrder` runs; on success the route inserts `(user_id, request_id, payload_hash, order_id)` into `order_commands` in the same transaction. | `server/main.ts:1742-1743`. |
| 11 | On an error inside that try, roll back, reauthorize, and **replay a third time** so a winning concurrent command can still be returned; otherwise rethrow the original error. | `server/main.ts:1744-1750`. |
| 12 | Commit is outside that try/catch, then return the order. The code explicitly does not turn uncertain commit failure into a synthetic idempotent success. There is no further deadline check between `createOrder` and `COMMIT`. | `server/main.ts:1752-1754`. |

### Booking receipt and recovery semantics

- `GET /api/orders/commands/<requestId>` requires a customer, validates the UUID, and returns `{orderId}` from the caller's own `order_commands` row, or `{orderId: null}`. A null response is only a point-in-time read, not proof that an in-flight POST cannot later commit (`server/domain/booking-receipts.ts:12-20`).
- The client creates one request ID and a server-clock deadline, retains the pending command per account, and omits `quotedPrice` for quote-bound requests (`src/booking.ts:22-27`, `src/booking.ts:38-52`). It treats a missing receipt as `unknown` until 30 seconds after the command deadline, then as `absent`; without a deadline it remains `unknown` (`src/booking.ts:105-118`).
- **Differing-payload rule for `order_commands`:** the same account + request ID with a different canonical `input` hash gets `409 idempotency_conflict`; the same payload replays. Since `requestId` and `commandExpiresAt` were removed before hashing, changing only the deadline is not an `order_commands` payload conflict (`server/main.ts:1689`, `server/main.ts:1723-1729`).
- Replay reauthenticates before returning private order data, so a stored receipt does not preserve revoked access (`server/main.ts:1725-1729`).
- The first and second replay-before-expiry checks are what make a committed retry safe after timeout. A new use of an already consumed quote is instead `409 quote_consumed`; an expired, unconsumed quote is `409 quote_expired` (`server/main.ts:1505-1516`, `server/main.ts:1731-1742`).

### `command_results` versus `order_commands`

These are two distinct idempotency mechanisms, not two names for one receipt table.

| Mechanism | Availability and key | Stored result and replay behavior | Source |
|---|---|---|---|
| `order_commands` | SQLite and PostgreSQL; primary key `(user_id, request_id)`; foreign keys to users and orders. | `user_id`, `request_id`, `payload_hash`, `order_id`. Only successful order creation gets this row. Replay re-fetches the current order. | SQLite columns/PK: `server/db/sqlite-schema.ts:43-45`; PostgreSQL columns/PK: `server/db/postgres-schema.sql:62-68`; insert/replay: `server/main.ts:1724-1749`. |
| `command_results` | PostgreSQL-only durable command protocol; primary key `(actor_id, command_id)`. | `actor_id`, `command_id`, `payload_hash`, `http_status`, `response`, `created_at`. Both successful responses and caught HTTP failures are stored and replayed. | Schema: `server/db/postgres-guards.sql:104-107`; reads/writes: `server/domain/commands.ts:20-21`, `server/domain/commands.ts:38-55`, `server/domain/commands.ts:79-86`. A SQLite `command_results` definition was **not found in the files read**. |

`versionedCommand` behavior:

- With no `commandId`, it directly invokes the installed handler. With one on SQLite it returns `409 durable_protocol_unavailable`; it also requires an authenticated user, a UUID v1–v5 command ID, and a supported command path (`server/domain/commands.ts:7-14`).
- It removes `commandId` and `clientRecordedAt`, optionally merges a nested `payload` with outer fields, then SHA-256 hashes canonical `{path, method, input}`. This is a different hash input from the booking-only `order_commands` hash (`server/domain/commands.ts:15-18`; compare `server/main.ts:1689`, `server/main.ts:1723`).
- It takes a PostgreSQL advisory transaction lock on `<actor>:<commandId>` before reading the saved result, serializing retries of that command (`server/domain/commands.ts:19-20`).
- A saved-result replay rechecks the actor's current role/status/approval and, when supplied, current session validity. A changed hash gives `409 idempotency_conflict`; saved non-200 outcomes are raised again; successful responses return the **stored JSON response**. Order-targeted results also recheck current resource access (`server/domain/commands.ts:21-55`).
- For a new order-targeted command it authorizes and locks the order, requires `expectedVersion`, and enforces `VERSION_CONFLICT`; it defaults a missing `expectedStatus` to the row status. Cash decisions have their own version and amount checks. ILS is the only accepted currency where currency is supplied (`server/domain/commands.ts:56-77`). The collection route `POST /api/orders` itself has no numeric order target, so this order-version block is not run for booking.
- Before invoking a handler, it sets `body.requestId = commandId` when no request ID was supplied. A durable booking can therefore have both a `command_results` row and an `order_commands` row; on retry the outer `command_results` replay returns before the booking route runs (`server/domain/commands.ts:75-84`, `server/main.ts:3532-3540`).
- Caught `HttpError`s become stored `{error}` responses; unexpected errors are rethrown without a `command_results` insert. The outer mutation envelope catches the intentional HTTP failure after the handler and lets the transaction finish before rethrowing it to the client (`server/domain/commands.ts:79-86`, `server/main.ts:3535-3540`).
- The generic durable-protocol schema/capability is required for PostgreSQL order/cash mutations before this wrapper runs (`server/main.ts:3532-3537`). The booking-specific `commandExpiresAt` checks remain in the booking handler, not in `versionedCommand` (`server/main.ts:1717-1742`).

### Quote-bound booking and retry interaction

- Quotes have a 120,000 ms TTL and are available only when the PostgreSQL quote/road-restriction capability exists (`server/domain/quotes.ts:6-12`, `server/domain/quotes.ts:188-191`). `POST /api/price` returns an unquoted base price when that capability is absent; otherwise it persists itinerary, minor-unit price/commission, tariff and evidence versions, ETA, feasibility, disclosures, scope, and expiry (`server/main.ts:1401-1482`, `server/domain/quotes.ts:250-275`).
- Quote storage includes `id`, `customer_id`, itinerary/contact/scope fields, `currency`, `price_minor`, `discount_minor`, `commission_minor`, tariff/evidence/ETA fields, `itinerary_hash`, `expires_at`, `created_at`, `consumed_at`, and `consumed_order_id` (`server/db/postgres-quotes.sql:40-85`; declared scope is inserted at `server/domain/quotes.ts:261-274`).
- On booking, `createOrder` locks the quote `FOR UPDATE`, checks ownership and feasibility, rejects an expired unconsumed quote and any already consumed quote, and verifies supplied itinerary fields against the quote. Omitted optional values can be filled at booking; conflicting supplied values produce `itinerary_changed` (`server/main.ts:1500-1566`).
- It re-evaluates current routing prohibition, verifies service/pooling availability, derives the order price from `price_minor`, applies promo/schedule checks, inserts the order with `quote_id`, and marks the quote consumed in the same order transaction (`server/main.ts:1567-1627`).
- Because `order_commands` replay precedes `createOrder`, a committed retry never reaches the consumed/expired quote rejection. A different command attempting to reuse that quote does reach it (`server/main.ts:1510-1516`, `server/main.ts:1731-1742`).
- `server/domain/quotes.ts` also exports a `consumeQuote` helper whose update includes `WHERE consumed_at IS NULL` and throws on zero changes (`server/domain/quotes.ts:284-287`). The examined `POST /api/orders` path uses its own locked read and direct consumption update instead (`server/main.ts:1505-1506`, `server/main.ts:1624-1625`).

## 2. The order state machine

### Status universe and database invariants

The shared application type has exactly nine order statuses: **`searching`, `assigned`, `at_pickup`, `in_transit`, `completed`, `cancelled`, `on_hold`, `returning`, `returned`** (`src/model.ts:27-28`). PostgreSQL enforces that same set with `orders_status_check` (`server/db/postgres-guards.sql:9-10`). SQLite declares `orders.status TEXT NOT NULL` without a status `CHECK` in the base schema (`server/db/sqlite-schema.ts:19-25`).

The transition helper and categories are:

```ts
statusFlow = ['searching', 'assigned', 'at_pickup', 'in_transit', 'completed']
activeStatuses = ['assigned', 'at_pickup', 'in_transit', 'on_hold', 'returning']
finishedStatuses = ['completed', 'returned']
nextStatus('returning') = 'returned'
nextStatus(s) = the next statusFlow entry; an out-of-flow or final entry returns itself
```

Source: `src/model.ts:52-56`, `src/model.ts:289-293`. `activeStatuses` keeps the driver assigned, including during hold/return; `finishedStatuses` is also the set used by cash totals (`src/model.ts:53-56`, `server/main.ts:2964-2974`).

PostgreSQL adds structural, not directional, invariants: every custody/finished status except `cancelled` and `searching` requires a driver; `searching` requires `driver_id IS NULL`; `completed` and `returned` require `completed_at` (`server/db/postgres-guards.sql:12-14`). A general SQL table of permitted old→new status pairs was **not found in the files read**; directional guards are in the routes below.

### Legal transitions and actors

| From → to | Who and route | Guard / write that implements it |
|---|---|---|
| *(new)* → `searching` | Active customer, `POST /api/orders`. | Both legacy and quote-bound inserts hard-code `status='searching'`; the route requires active customer authority (`server/main.ts:1599-1609`, `server/main.ts:1662-1672`, `server/main.ts:1685-1688`). |
| `searching` → `assigned` | Active driver, `POST /api/jobs/:id/accept`. | Requires driver/active, service/vehicle/load eligibility, then sets driver/commission/`assigned_at` only `WHERE status='searching'` and no prior release by that driver; zero changes becomes `already_taken` (`server/main.ts:2288-2305`, `server/main.ts:2317-2343`). |
| `searching` → `assigned` | Owning active customer accepting a driver offer, `POST /api/orders/:id/offers/:driver/accept`. | Requires an active driver, owned `searching` order, fresh eligible offer; updates only while still `searching` (`server/main.ts:2365-2392`). Standard parcels have no recommended price, while the driver-offer route requires one, so ordinary fixed-price parcel assignment uses job acceptance (`server/main.ts:1629-1632`, `server/main.ts:2347-2357`). |
| `assigned` → `at_pickup` | Assigned active driver, `POST /api/orders/:id/advance`. | `advanceOrder` requires the same `driver_id`, membership in `activeStatuses`, exact `expectedStatus`, no open safety incident, and `nextStatus` different from current; the update uses the computed next state (`server/main.ts:2435-2444`, `server/main.ts:2460-2463`, `server/main.ts:2525-2527`; safety guard `server/main.ts:2065-2070`). The additive boarding guard returns immediately for non-rides (`server/domain/ride-lifecycle.ts:238-251`). |
| `at_pickup` → `in_transit` | Assigned active driver, same advance route. | Same guards; this branch also sets `picked_up_at` with `COALESCE` (`server/main.ts:2435-2444`, `server/main.ts:2460-2462`). |
| `in_transit` → `completed` | Assigned active driver, same advance route. | Same guards plus proof checks: five failures lock proof; a stored handover code must match normalized input or a failure is recorded and `wrong_code` raised. Success sets `completed_at`, preserves/computes commission, and posts order journals (`server/main.ts:2444-2462`). Parcel creation assigns a four-digit handover code (`server/main.ts:1602-1609`, `server/main.ts:1665-1672`). |
| `returning` → `returned` | Assigned active driver, same advance route. | `nextStatus` special-cases returning; the return code gets the same five-attempt proof treatment, and success sets `completed_at` and records `RETURN_COMPLETED` (`src/model.ts:289-292`, `server/main.ts:2444-2459`). |
| `searching` → `cancelled` | Owning customer or admin, `POST /api/orders/:id/cancel`; partner principal, `POST /api/partner/orders/:id/cancel`; or the stale-demand worker. | Customer/admin cancel is CAS-limited to `searching/assigned/at_pickup`; already cancelled is an idempotent return only for owner/admin (`server/main.ts:1847-1848`, `server/main.ts:1910-1925`). Partner cancel uses the same three-state CAS (`server/main.ts:1849-1861`). `expireStaleDemand` cancels only still-unassigned stale `searching` rows (`server/main.ts:1303-1318`). |
| `assigned` → `cancelled` | Owning customer, admin, or partner cancellation routes above. | The shared `cancellable` list and CAS include `assigned`; no driver advance path accepts cancellation (`server/main.ts:1847-1856`, `server/main.ts:1910-1918`, `server/main.ts:2435-2440`). |
| `at_pickup` → `cancelled` | Owning customer/admin/partner cancellation; alternatively the assigned driver reports a pickup exception. | Cancellation uses the same CAS. `POST /api/orders/:id/exception` requires an active driver, a recognized reason, the assigned driver, exact expected status, no safety hold, and current `at_pickup`/`in_transit`; at pickup it writes `cancelled` and records `PICKUP_FAILED` (`server/main.ts:2466-2478`, `server/main.ts:2488-2492`). |
| `assigned` or `at_pickup` → `searching` | Assigned active driver, `POST /api/orders/:id/release`; or an admin blocking/editing the courier. | Release requires same driver, one of those two states, and no safety hold; it clears driver/commission, restores price/discount, records `order_releases`, and reoffers. A prior release row makes retry return success (`server/main.ts:2406-2432`). The admin courier-block path performs the same pre-custody return to the pool (`server/main.ts:3150-3153`, `server/main.ts:3215-3222`). |
| `in_transit` → `on_hold` | Assigned active driver via delivery exception, or admin via eligibility custody recovery. | Driver exception writes `on_hold` only from `in_transit` (at pickup cancels instead), with expected-status and safety guards (`server/main.ts:2466-2485`). Admin recovery requires admin, expected version, reason/evidence, and current `in_transit/on_hold/returning`; `hold` is allowed except from `returning` (`server/domain/eligibility.ts:572-591`). |
| `at_pickup` → `on_hold` (`exception_reason='scope_mismatch'`) | Assigned driver, `POST /api/orders/:id/pickup-check` on the PostgreSQL resource-scope capability. | Requires assigned driver, current `at_pickup`, no safety incident, known effective scope, and an actual load that fails `covers`; it records the check before writing hold (`server/domain/resource-scope.ts:282-311`; route registration `server/domain/resource-scope.ts:347-352`). |
| `on_hold` + scope mismatch → `at_pickup` | Customer supplying a conforming revised declaration, or admin resolving the scope exception. | Customer path is limited to that exact hold reason, no operator measurement, and actual load covered by the revised scope (`server/domain/resource-scope.ts:232-253`). Admin `scope/resolve` requires the same exact hold and either support reason or inspected capacity checks (`server/domain/resource-scope.ts:314-343`). Both call `resume`, which writes `at_pickup` and clears the exception (`server/domain/resource-scope.ts:224-229`). |
| `on_hold` → `in_transit` | Admin, `POST /api/admin/orders/:id/resolve`, `action='reattempt'`. | Requires reason of at least five characters and exact current state from the action map `{reattempt: on_hold → in_transit}`; mismatch gives `cannot_resolve` (`server/main.ts:2495-2507`). |
| `on_hold` → `returning` | Admin, same resolve route, `action='return'`; or admin eligibility recovery. | Main resolver maps `return: on_hold → returning`, generates a return code, and resets proof attempts (`server/main.ts:2495-2515`). Eligibility recovery also permits a return decision from `in_transit` or `on_hold`, with expected-version/reason/evidence guards (`server/domain/eligibility.ts:572-585`). |
| `in_transit` → `returning` | Admin eligibility recovery, or admin blocking a driver who is in custody. | Eligibility `return` accepts any starting state in `in_transit/on_hold/returning` and writes only if not already returning (`server/domain/eligibility.ts:576-585`). Courier blocking converts active custody other than pre-pickup/already-returning to `returning` and resets proof attempts (`server/main.ts:3215-3228`). |
| `returning` → `returned` without driver code | Admin, main resolve `action='confirm_return'` or eligibility recovery `confirm_return`. | Main resolver requires current `returning`, reason ≥5, sets `completed_at`, and posts order journals (`server/main.ts:2495-2517`). Eligibility recovery likewise requires `returning` and expected-version/evidence guards (`server/domain/eligibility.ts:572-591`). |
| `completed`, `returned`, `cancelled` → anything | No outgoing transition was **found in the files read**. | `completed` is the end of `statusFlow`; the other two are out of flow, and `advanceOrder` rejects statuses outside `activeStatuses`. The cancellation route only treats an already cancelled order as an idempotent read for owner/admin (`src/model.ts:289-293`, `server/main.ts:2435-2440`, `server/main.ts:1910-1914`). |

`on_hold` cannot be advanced by the driver: `nextStatus` returns the same out-of-flow state and `advanceOrder` explicitly rejects that case, leaving the decision to an administrator (`src/model.ts:289-293`, `server/main.ts:2439-2440`).

## 3. Cash

### Ledger/storage tables and columns

#### Legacy cash authority: `cash_entries` plus order money columns

| Backend | Columns and rules | Source |
|---|---|---|
| SQLite | `cash_entries(id, driver_id, kind, amount_cents, note, status, recorded_by, created_at, decided_at)`; `kind='remittance'|'adjustment'`, nonzero integer amount, `status='pending'|'confirmed'|'disputed'`. Additive columns are optional unique `request_id`, `resolved_by`, and `resolution_note`. | Base: `server/db/sqlite-schema.ts:60-65`; request ID: `server/db/sqlite-schema.ts:170-172`; resolution fields: `server/db/sqlite-schema.ts:286-288`. |
| PostgreSQL | Same legacy fields, with `request_id` in the base table, plus additive `resolved_by`, `resolution_note`, and `version`. Legacy kind/amount/status constraints match SQLite. | Base: `server/db/postgres-schema.sql:2-12`; checks: `server/db/postgres-schema.sql:321-323`; resolution fields: `server/db/postgres-ops.sql:9-13`; version: `server/db/postgres-events.sql:75-79`. |
| Order-derived amounts | SQLite order money uses `price`, `commission`, and additive `discount` as `REAL`; cash aggregation rounds commission/discount to integer minor units. PostgreSQL adds `price_minor`, `commission_minor`, `discount_minor`, maintained from the legacy amounts by the order trigger. | SQLite fields: `server/db/sqlite-schema.ts:19-25`, `server/db/sqlite-schema.ts:134-137`; PostgreSQL minor fields/trigger: `server/db/postgres-guards.sql:2-8`, `server/db/postgres-guards.sql:41-55`; aggregation selection: `server/main.ts:2966-2974`. |

SQLite append-only guards forbid deletes and reject edits when the old row is not pending or when amount/driver/kind changes (`server/db/sqlite-schema.ts:128-132`). PostgreSQL's `immutable_cash` is stricter: update is allowed only from a pending remittance to confirmed/disputed with `decided_at`, and every other field except `status` and `decided_at` must remain identical; delete/truncate is rejected (`server/db/postgres-guards.sql:79-89`).

#### PostgreSQL-only double-entry and receipt tables

`postgres-ledger.sql` explicitly says this layer is PG-only and SQLite's schema is frozen (`server/db/postgres-ledger.sql:1-5`).

| Table | Columns / important constraints | Source |
|---|---|---|
| `ledger_accounts` | `id`, unique `code`, `kind`, `owner_id`, `currency='ILS'`, `created_at`; kinds include platform revenue, driver receivable/payable, promo expense, provider clearing, customer receivable, merchant COD payable. | `server/db/postgres-ledger.sql:6-14`. |
| `ledger_journals` | `id`, unique `business_ref`, `kind`, `currency`, `order_id`, `cash_entry_id`, `actor_id`, `reason`, `rate_bps`, `reverses_journal_id`, `created_at`; reversal/adjustment reason rules. | `server/db/postgres-ledger.sql:16-32`. |
| `ledger_entries` | `id`, `journal_id`, `account_id`, `debit_minor`, `credit_minor`; exactly one side is positive. Deferred triggers require at least two lines and equal nonzero debits/credits. Accounts, journals, and entries are immutable. | `server/db/postgres-ledger.sql:34-66`. |
| `cash_receipts` | `id`, unique `order_id`, `driver_id`, `customer_id`, `due_minor`, `collected_minor`, `collector_id`, unique `receipt_ref`, `currency`, `status`, `created_at`, `collected_at`; status is `due/collected/partial/returned/settled`, and collected requires collected=due. | `server/db/postgres-ledger.sql:68-87`. |
| `cash_receipt_events` | `id`, `receipt_id`, `action`, `actor_id`, `amount_minor`, `note`, `created_at`; actions include recorded/collected/partial/returned/settled/disputed/confirmed; append-only events. | `server/db/postgres-ledger.sql:88-98`. |

Journal posting also validates safe integer one-sided lines, at least two entries, nonzero equal totals, and ILS before insertion. Reusing `business_ref` returns the prior journal only when metadata and normalized entry lines match; otherwise it raises `idempotency_conflict` (`server/domain/ledger.ts:40-64`).

### How fare collection and Wind's receivable are recorded

**Legacy/SQLite path:**

- `cash_entries.kind` has only `remittance` and `adjustment`; it is not a per-parcel fare-collection table (`server/db/sqlite-schema.ts:60-64`). The PostgreSQL cash-receipt layer is unavailable on SQLite, and no SQLite `cash_receipts` table was **found in the files read** (`server/db/postgres-ledger.sql:1`, `server/domain/ledger.ts:14-25`).
- The operational rule in code is that drivers collect the fare in cash and owe Wind the commission snapshot of each finished job. `cashBalances` derives that exposure from orders in `completed` or `returned`, not from gross fare collection rows (`server/main.ts:2964-2974`, `src/model.ts:55-56`).
- Assignment snapshots commission; terminal driver advance preserves the snapshot or computes it if absent, then sets `completed_at`. This is the legacy event that brings an order into the cash totals (`server/main.ts:2330-2335`, `server/main.ts:2454-2460`, `server/main.ts:2969-2974`).

**PostgreSQL cash-receipt path:**

1. `POST /api/orders/:id/cash-receipt` is callable by the assigned driver or admin. It requires an assigned driver, positive `price_minor`, a state other than searching/cancelled, and computes `dueMinor = price_minor - discount_minor`. It inserts a `due` receipt `CR-<orderId>` and a `recorded` event. Repeating with the same driver/due returns the existing receipt; reassignment is allowed only while still due with zero collected (`server/domain/ledger.ts:119-141`, `server/domain/ledger.ts:175-178`).
2. `POST /api/orders/:id/cash-receipt/collect` accepts the assigned driver or admin and a positive `amountMinor` (a supplied `collectorId` must equal the actor). It locks the receipt, requires `due` or `partial`, adds to the existing total, rejects overflow beyond due, then stores cumulative `collected_minor`, actual collector, `collected_at`, and `partial` or `collected`; it appends an event containing this call's amount (`server/domain/ledger.ts:145-170`). No `requestId` replay check exists inside this `collect` method (`server/domain/ledger.ts:145-170`).
3. The same collect route with `{action:'return'}` requires a partial/collected receipt, changes status to `returned`, and appends a returned event with the collected amount (`server/domain/ledger.ts:149-155`).
4. The receipt collection method itself does not post a double-entry journal; it updates receipt facts/events (`server/domain/ledger.ts:145-170`). Commission/discount journals are instead posted when the order reaches completed/returned (`server/main.ts:2454-2460`, `server/main.ts:566-577`). A `cash_collection` journal construction was **not found in the files read**, although that kind is allowed by the schema (`server/db/postgres-ledger.sql:19`).

**Order journals on PostgreSQL:**

- Positive commission: debit `driver:<id>:receivable`, credit `platform:revenue`, under stable `order:<id>:commission` (`server/main.ts:566-574`).
- Positive promo discount: debit `platform:promo_expense`, credit the driver's receivable, under `order:<id>:discount`; this reduces the driver's debt because Wind funded the discount (`server/main.ts:575-576`, `server/main.ts:2977-2979`).
- Posting is skipped unless the PostgreSQL ledger is ready; a posting failure fails the enclosing money transition (`server/main.ts:559-567`). Legacy import uses the same stable business references to deduplicate later import (`server/domain/ledger.ts:66-91`).

### Driver outstanding balance / debt

The legacy total is computed per driver as:

```text
owedCents = commissionCents - discountsCents + adjustmentsCents - remittedCents
```

This exact BigInt formula, including safe-integer checks, is `server/domain/money.ts:1-8`.

- `commissionCents`: sum of order commission for completed + returned orders.
- `discountsCents`: sum of discounts on those orders, subtracted as Wind-funded cost.
- `adjustmentsCents`: sum of every adjustment entry; positive increases debt, negative relieves it.
- `remittedCents`: sum of **confirmed** remittances only.
- `pendingCents`: separate sum of pending remittances; it is not subtracted from `owedCents`, but a new handover is capped at `owedCents - pendingCents`.

All sums and the mapping to API fields are in `cashBalances` (`server/main.ts:2966-2979`); handover caps are in `recordCash` (`server/main.ts:3037-3044`). Driver deletion/role change is refused with `cash_outstanding` when owed is nonzero or any handover is pending (`server/main.ts:2981-2984`).

On the PostgreSQL double-entry read path, the driver's balance is instead `SUM(debit_minor - credit_minor)` over that driver's `driver_receivable` account. `GET /api/driver/ledger` returns it to the driver; `GET /api/admin/ledger` returns every account balance to finance staff (`server/domain/ledger.ts:94-102`, `server/domain/ledger.ts:173-181`). Confirmed positive remittances credit the driver receivable and debit provider clearing; positive adjustments debit the receivable, and negative amounts reverse direction (`server/main.ts:578-593`). The configurable projected cash cap exists but `cashCapActivated` defaults to false (`server/domain/ledger.ts:12-13`, `server/domain/ledger.ts:104-117`).

### Handover and settlement routes

| Route | Actual behavior | Source |
|---|---|---|
| `POST /api/admin/cash/remittance` | Admin records a positive handover, at most `owed-pending` (and absolute amount ≤1,000,000 minor units), as a **pending** `cash_entries` row. Optional UUID `requestId` replays the saved entry; same ID with different driver/kind/amount gives `idempotency_conflict`. | `server/main.ts:3019-3039`, `server/main.ts:3060-3069`. |
| `POST /api/driver/cash/:id/confirm` | Driver chooses `confirm` or `dispute` for their own remittance. CAS allows only a pending row; confirmation makes it `confirmed` and posts its journal, dispute makes it `disputed` and alerts the recording admin. A second decision gives `already_decided`. | `server/main.ts:3002-3010`. |
| `GET /api/admin/cash/pending` | Admin lists up to 100 pending remittances with driver name/phone/status. | `server/domain/cash-ops.ts:29-35`. |
| `POST /api/admin/cash/:id/resolve` | Admin fallback for a pending handover: `confirm` or `dispute`, mandatory reason ≥5, optional evidence reference, actor/reason stored, CAS on pending; confirmation posts the journal. | `server/domain/cash-ops.ts:37-50`. |
| `POST /api/admin/cash/adjustment` | Admin inserts an immediately confirmed positive or negative adjustment. It may not drive the available balance below zero. Negative adjustment/debt forgiveness requires an approved, subject/amount-bound financial approval decided by someone other than requester and recording admin; PostgreSQL consumes it atomically once. | `server/main.ts:3019-3028`, `server/main.ts:3037-3065`. Finance approval request/decision guards are `server/domain/ops.ts:82-90`. |
| `GET /api/driver/cash` | Driver gets all balance components and latest 50 entries plus every still-pending handover; protocol view also exposes pending entry versions on PostgreSQL. | `server/main.ts:2991-3000`. |
| `GET /api/admin/cash` | Admin gets `cashBalances` for all non-deleted drivers, sorted by descending owed amount then driver ID. | `server/main.ts:3013-3015`. |

Only confirmed handovers reduce `remittedCents` and produce a cash-remittance journal; pending and disputed handovers stay unsettled (`server/main.ts:2972-2979`, `server/main.ts:578-593`). The admin UI creates a fresh request ID per opened handover/adjustment form and displays remittance references returned by the server (`src/app/admin/cash.tsx:19-39`, `server/main.ts:2986-2987`).

**Cutover guard discrepancy visible in source:** PostgreSQL `immutable_cash` excludes only `status` and `decided_at` from its “everything else unchanged” comparison, while the admin resolver also writes `resolved_by` and `resolution_note`. Those extra writes do not satisfy the trigger predicate as defined; no replacement definition of `immutable_cash` was **found in the files read** (`server/db/postgres-guards.sql:79-89`, `server/domain/cash-ops.ts:43-47`). SQLite's pending-row update trigger does not impose that same all-other-columns comparison (`server/db/sqlite-schema.ts:128-132`).

### Where admin-screen money totals come from

- **Cash screen:** the app polls `/admin/cash` and `/admin/cash/pending` (`src/app/admin/cash.tsx:12-18`). Per-driver owed/pending values therefore come from `cashBalances`, not from `Ledger.adminBalances`; the UI shows absolute owed, labels negative owed as Wind owing the driver, and separately shows pending cash (`server/main.ts:2966-2979`, `server/main.ts:3013-3015`, `src/app/admin/cash.tsx:60-72`).
- **Dashboard:** the app polls `/admin/stats` and displays profit, commission, subscription revenue, promo cost, GMV, and completed count (`src/app/admin/index.tsx:13-18`, `src/app/admin/index.tsx:24-48`). The server computes, over completed + returned orders: `gmv=SUM(price)`, `commission=SUM(commission)`, `discounts=SUM(discount)`; subscription revenue is `SUM(price)` where `activated_at` is non-null; `profit = commission - discounts + subscriptionRevenue` (`server/main.ts:3104-3108`, `server/main.ts:3125-3129`). These dashboard values are in the legacy major-unit order fields, not the cent-valued driver balance API.
- **Fourteen-day dashboard chart:** the server groups order commission by `completed_at` and subscription price by `activated_at` into local-calendar-day buckets (`server/main.ts:3109-3124`); the UI stacks those two series (`src/app/admin/index.tsx:90-129`).
- **PostgreSQL account screen/API alternative:** `GET /api/admin/ledger` computes each account's balance as debits minus credits and requires finance staff (`server/domain/ledger.ts:99-102`, `server/domain/ledger.ts:179-181`). The examined `src/app/admin/cash.tsx` uses `/admin/cash`, not this endpoint (`src/app/admin/cash.tsx:17-18`).

### Separate merchant-goods COD records (PostgreSQL, not the driver commission debt)

- `merchant_cod` tracks `id`, `order_id`, `beneficiary`, `goods_minor`, `collected_minor`, `remitted_minor`, `collector_id`, `status`, `remittance_due_at`, `payout_ref`, and `created_at`; `merchant_cod_events` tracks `id`, `cod_id`, `action`, `actor_id`, `amount_minor`, `request_id`, and `created_at` (`server/db/postgres-payments.sql:9-10`).
- The assigned driver/admin collects through `POST /api/orders/:id/cod/collect`; collection is cumulative and request-ID replay checks actor and amount before returning the existing row (`server/domain/payments.ts:50-52`, `server/domain/payments.ts:164-182`, route at `server/domain/payments.ts:198-201`).
- Finance remits all collected-not-yet-remitted goods value through `POST /api/orders/:id/cod/remit`; this updates `remitted_minor` and writes a remittance event. This goods-value flow is separate from `cashBalances`' commission-minus-discount driver debt (`server/domain/payments.ts:184-190`; compare `server/main.ts:2964-2979`).
