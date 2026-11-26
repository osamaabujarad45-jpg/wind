# VERIFIED ADDITIONS — 13 Nov 2026

> **Historical pass:** see `docs/REA/2026-11-13-RECONCILIATION.md` for the current status. In particular, A1/A5/A8/A9 are not safely classified as wholly absent, current payments enable only an explicit test fake, and this document's full-suite/deployment statements are not fresh release evidence. Note that §2 of this file has since been corrected on those A-rows (A9 is implemented; A1/A8 are partly Postgres-only) — read §2 together with the reconciliation.

**Compiled by:** leader pass, independent of the "Palestine Maps and Tracking Upgrade" thread.
**Adds to:** `docs/REA/2026-11-13-IMPLEMENTATION-HANDOFF.md` (call it *the handoff*).
**Rule of this file:** every line is either a command I ran with its exit code, or a file:line
I read. Anything I could not establish is named as unknown. Nothing here is copied from
another agent's report without being re-checked.

---

## 1. The headline: the deployed pilot writes SQLite, and twelve modules gate real work behind Postgres

This is the most consequential fact in the repository and it reframes the whole gap analysis.
Both earlier handoffs treat the advanced mechanisms as present. They are present **in the
Postgres dialect only**, and production does not use that dialect.

**Dialect selection** `[read]` `server/db/runtime.ts:1-27` — there are **three** branches, and an
independent check (`docs/REA/2026-11-13-INDEPENDENT-CHECK.md`) correctly caught that my first
version of this file overstated the second one:

| Condition | Result |
|---|---|
| `WIND_DATABASE_URL` unset | `return new Persistence({ sqlite })` (`:9`) — the live pilot |
| `WIND_POSTGRES_STAGING=1` **and** a valid non-loopback URL with `sslmode=verify-full` | Postgres, forced to `search_path=wp16_staging` (`:11-18`) — a **staging** path, not the production cutover |
| Any other URL | throws at `:20-21`: *"PostgreSQL API cutover is gated on WP03 schema/import parity; isolated tests require NODE_ENV=test and WIND_POSTGRES_TEST_ONLY=1"* |

So the accurate claim is **"the deployed pilot writes SQLite"**, not "the code can never use
Postgres". Two independent pieces prove the deployed state: the nightly host backup is a SQLite
file (verified `ok` in the 13 Nov run), and the deployment material is one EC2 host with SQLite.
The code's comment at `:4` still says *"PostgreSQL is an isolated test target until WP03
schema/import acceptance."* Do not state the dialect from the code alone — state it from the
deployment, and say which evidence you used.

**Modules that return "unavailable" on SQLite** `[read]`, each line verified:

| Module | Gate line | Consequence on production SQLite |
|---|---|---|
| `server/domain/commands.ts` | `:11` → `fail(409,'durable_protocol_unavailable')` | durable command protocol unavailable |
| `server/domain/dispatch.ts` | `:41` → `return false` | no `dispatch_rounds` / `dispatch_offers` |
| `server/domain/eligibility.ts` | `:33` → `return false` | no `eligibility_policy` / `driver_eligibility` |
| `server/domain/events.ts` | `:35` → `return false` | **no `domain_events`, no `outbox`** |
| `server/domain/ledger.ts` | `:15` → `return false` | **no double-entry journal** |
| `server/domain/native-push.ts` | `:26` → `return false` | no `native_push_tokens` path |
| `server/domain/ops.ts` | `:14` → `return false` | no `support_cases` |
| `server/domain/payments.ts` | `:36` → `return false` | **no `payment_intents`** |
| `server/domain/private-objects.ts` | `:48` → `return false` | no `private_objects` |
| `server/domain/quotes.ts` | `:9` → `return false` | no table-backed quotes |
| `server/domain/resource-scope.ts` | `:30`, `:33` → `return false` | **no `custody_records`** |
| `server/domain/ride-lifecycle.ts` | `:24`, `:53` → `return false` | no `ride_lifecycle`, no `assignment_history` |

**How to read this precisely.** It does **not** mean production is non-functional. `main.ts`
carries older inline SQLite paths — `cash_entries`, `proof_attempts`, `quotes`, `orders`,
`order_actions`, `order_commands` all exist in `server/db/sqlite-schema.ts` and are used. The
correct statement is a **dialect parity gap**: the newer, auditable, table-backed
implementations are dead code in production, and the shipped behaviour is the older inline
path. Any plan that says "we have an append-only ledger / an outbox / payment intents" is
describing the test dialect, not the pilot.

This also explains several NO-GO items in the other thread without needing a separate cause:
payment activation, outbox durability and custody records are all behind the same gate.

---

## 2. Confirmations and corrections to §4 of the handoff

I ran the named greps and read the files. These **replace** the corresponding rows in
*the handoff* §4. Where my earlier row said UNCONFIRMED, that was my own weak evidence and
it was wrong in one direction (I under-credited A10) and confirmed in another.

| Item | Confirmed status | Evidence |
|---|---|---|
| **A1** zone-first addressing | **ABSENT as a customer address model — but I was too broad; a service-area model does exist, Postgres-only** | The customer address model has no zone: `saved_places` is `{user_id, label home\|work\|other, city, note}`, and the only "zone" hit is the shortcut comment at `src/model.ts:185` ("20 km as the crow flies … stands in for real service zones"). Separately, `server/db/postgres-eligibility.sql` defines `service_areas`, `route_permissions`, `vehicle_runs`, `capacity_reservations`, `capacity_stops` and `order_requirements` — a real spatial/capacity model, gated to Postgres. Do not read "no zone on the address" as "no zones in the system" |
| **A5** shift + job board | **ABSENT as specified** | `dispatch.ts:284` (`already_taken`), `presence.ts:168` (`presence_active_job`). No shift lifecycle, no ready-queue, no vehicle scan |
| **A6** chain of custody | **POSTGRES-ONLY** | `resource-scope.ts:33` gates on `to_regclass('custody_records')`. `eligibility.ts:577` (`custody_required`), `:590` (`ELIGIBILITY_CUSTODY_RECOVERY`) are the SQLite-era concept only. No per-parcel human-readable log |
| **A8** zone fees + capacity windows | **PARTIAL — corrected: capacity exists, but Postgres-only and not as priced delivery windows on SQLite** | SQLite has only `scheduled_for` on the quote/order (`quotes.ts:48,151,203,240,265`) — no per-zone fee, no window, no daily cap. Postgres has the capacity machinery: `capacity_reservations`, `capacity_stops`, `vehicle_runs`, `order_requirements` (`postgres-eligibility.sql`). So "capacity" is not absent; what is missing on the dialect production runs is zone-priced windows with a per-window cap |
| **A9** consent-before-change | **PRESENT — my earlier "ABSENT" was a grep error, corrected by a second pass** | `destination_changes` in SQLite carries the state machine `quote \| pending \| accepted \| declined \| withdrawn` with `decided_at`, `expires_at`, `price`, `discount`, `commission`, `route_km`, `tariff_version` (`server/db/sqlite-schema.ts`). `destination-change.ts:25` pushes `destination_request` / `destination_accepted` / `destination_declined`, and `:58`/:80 look up the pending change and issue a quote. That is consent-before-change with counterparty notification. I missed it because I grepped for "approv\|consent\|release\|confirm" and the domain vocabulary is accept/decline/withdraw |
| **A10** tracking reports degradation | **PRESENT — this corrects my earlier row** | `src/location-state.ts:8-9`: stale ≥ 60 s, reconnecting 30–60 s, with the reasoning in a comment. `presence.ts:119` returns `location_stale`; `presence.ts:172` rejects fixes > 30 s. Good enough to call implemented |
| **A12** service level as parcel attribute | **ABSENT** | `partner_orders` is only `{external_ref, payload_hash, order_id}` — an idempotency map, no service level |
| **A14** alarm re-arm | **PARTIAL** | `src/background-location.ts:3,165` uses `expo-task-manager` `defineTask`. No boot / user-unlock / time-set / timezone / package-replaced handling |
| **A15** offline fallback | **PARTIAL** | `src/offline-summary.ts:2-13` is a versioned cached summary (`schemaVersion`, `actorId`, `role`, `maxAge`) — not a zones/fees/windows bundle |
| **A3** delivery proof as customer-held secret | **PRESENT — my earlier row was materially wrong, corrected** | `orders.handover_code` is the customer-held code, `return_code` the sender's on a return (`sqlite-schema.ts` orders table). `main.ts:2201` requires the expected code to complete, `:2265`/`:2948` and `eligibility.ts:583` generate return codes, and **`POST /api/admin/orders/:id/proof-reset`** exists at `main.ts:2826` writing a `security_events('PROOF_RESET', {reason})` audit row at `:2835`. Combined with `proof_attempts` and the five-strike `proof_locked`, this is A3 almost exactly. Missing only: a QR token, and the no-PII property is satisfied because the code is a 4-digit number |
| A2, A11, A13 | mostly unchanged, but **A2 is stronger than I recorded** | A2: `cash_entries` is append-only **by trigger** — `cash_entries_no_delete` (BEFORE DELETE) and `cash_entries_no_edit` (BEFORE UPDATE) at `sqlite-schema.ts:126,128` — so the ledger cannot be rewritten even by a bug; only the double-entry journal is Postgres-only (`ledger.ts:15`). A11 still has no `amountCollectedCents`/`discrepancyReason`. A13 still has no per-event channel |
| — | **Corrected by a second independent pass** | Three rows above were wrong in my first version and are fixed here: A9 was a grep false negative (domain vocabulary is accept/decline/withdraw, not approve/consent), A1 read "no zone on the address" as "no zones at all" when `service_areas` exists, and A8 called capacity absent when `capacity_reservations` exists in Postgres. The lesson is stated in the row: **a token grep proves what a name does not appear, never what the system does** |

**Net effect on the plan (revised twice).** **A3, A9 and A10 are already implemented** — drop them.
**A5 shift/job-board and A12 service level are genuinely absent.** **A1 and A8 are Postgres-only in
part**: the service-area and capacity models exist but the SQLite path production runs has neither, so
treat them as *dialect-parity* work, not greenfield. **A2's append-only property is enforced by
triggers**; only the double-entry journal is missing. **A6 is Postgres-only.** **A13 channels and A11's
collected-amount variance are genuinely missing.**

**Method lesson, worth more than any single row.** Three of the rows here were wrong in my first
version, all from the same cause: **a token grep proves a name does not appear; it never proves a
capability is missing.**
- A9 looked absent because I searched "approv|consent|confirm" and the code says accept/decline/withdraw.
- A3 looked absent because I searched `deliveryCode` and the column is `handover_code`.
- A8/A1 looked absent because I read the customer address model and never opened `postgres-eligibility.sql`.

Any future "absent" claim in this repo needs a capability read — the route, the table, the state
machine — or an explicit statement that a search was made and found nothing *under these names*.

---

## 3. Independent verification of the other thread's claims

Run by me, in this checkout, on 13 Nov 2026.

> **Read with section 7 and 8 in mind.** Two rows below record the state **as measured then**, before
> the fixes: the booking defect and the client typecheck. Both are now fixed — `booking-retry-race`
> exits 0 and `npx tsc --noEmit` exits 0 — so do not quote those two rows as today's state. They are
> kept because they are the evidence that the defects were real, measured independently.

| Claim | My verdict | Evidence |
|---|---|---|
| Canonical **server** typecheck passes | **CONFIRMED** | `npx tsc --noEmit -p tsconfig.server.json` → `EXIT_SERVER=0`, no output |
| `npx expo lint` passes | **CONFIRMED** | `EXIT_LINT=0`; only output is the `env: load .env.local` banner |
| The seven `opencode.ts` errors were an audit-config artifact | **CONSISTENT** | server typecheck with canonical `tsconfig.server.json` (`"types": ["node"]`) is clean; the errors only appear under a config carrying `expo/types` |
| Booking `409 quote_consumed` orphans an order | **CONFIRMED, independently** | `node tests/booking-retry-race.test.mjs` → **EXIT=1**, `AssertionError … "quote_consumed 409 means 'this attempt did not create an order', never 'this command does not exist'"`, at `tests/booking-retry-race.test.mjs:97` |
| — and the cause is in the client | **CONFIRMED by reading it** | `src/app/book.tsx:379-382`: on any `status < 500` that is not `401/408/429` and not `idempotency_conflict`, the persisted command is **deleted**. A `409 quote_consumed` satisfies that predicate. `:385` only bumps `priceTick`. The release comment at `:394` says a command may be dropped only when "the server has confirmed absent", which a 409 does not do |
| Expo moved `~57.0.31` → `~57.0.72` | **DOES NOT REPRODUCE — reconcile** | `package.json` in this checkout declares `expo: "~57.0.31"`, `react-native 0.86.3`, `react 19.2.3`. Either that claim came from a different tree (`.claude/worktrees/*`), or it described installed packages rather than the manifest. Do not carry it into the report until the source is named |

### 3.1 A gate the other thread did not have: the client typecheck could not run here — **now fixed**

> **Status today: fixed.** The narrowing described at the end of this section is implemented
> (section 8). `npx tsc --noEmit` exits 0 in 4.2 s and `tests/clean-typecheck.test.mjs` exits 0.
> Everything below is the measurement of the defect and the reasoning that produced the fix.

`npm run typecheck` is `tsc --noEmit && tsc --noEmit -p tsconfig.server.json`. The **first**
half did not pass — it died:

```
npx tsc --noEmit
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
EXIT_CLIENT=134
```

Cause, and it is fixable `[read]` `tsconfig.json`:

```json
"include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"],
"exclude": ["node_modules", ".artifacts", "android", "ios", "server"]
```

`**/*.ts(x)` with no exclusion for the research trees sweeps in:
- `research_notes/` — **≥ 5,000 `.ts`/`.tsx` files** (hit my 5,000 cap, so the real count is higher)
- `.claude/worktrees/` — **ten full checkout clones** (`.claude/worktrees/leftover-tasks-4716c1`, `…client-1105`, `…maps-not-working-f744ba`, and 7 more)
- `research/`, `vendor/`, `session-bridge/`

A recursive count over `.claude` alone exceeded a 180-second timeout. So the honest statement
was **not** "typecheck passes" but "server typecheck passes; the client typecheck is unrunnable
in this working tree because the project glob includes untracked research clones".

**Fixed since** — and not with the "one line" this section originally suggested. Adding excludes was
not enough: `tests/clean-typecheck.test.mjs` *replaces* the `exclude` list with its own absolute
paths, so it kept sweeping the research trees and timing out at 60 s. The fix that worked was
narrowing `include` to `src/**` (section 8). That is the detail worth carrying forward: in this repo
the exclude list is not the only gate on what gets typechecked.

---

## 4. Priority these findings imply

1. **P0 — dialect decision.** Choose one: port the twelve Postgres-gated modules to SQLite, or
   finish the Postgres cutover so production stops running the narrow path. Every other
   "do we have X?" question is downstream of this. Do not build new features on top until it
   is decided.
2. **P0 — booking command loss: DONE** (section 7). `src/app/book.tsx` retains the eight post-lock
   codes so a committed order keeps its pointer; Retry on the pending card is the recovery path.
   `booking-retry-race` and `booking-auth` both exit 0. A client-side commit window was implemented
   and removed — a review showed it can release an in-flight command.
3. **P1 — typecheck gate: DONE.** `tsconfig.json` narrowed to `src/**`; root `tsc` exits 0 in ~4 s
   and `clean-typecheck` exits 0. The exclude list alone was not enough (section 8).
4. **P1 — the adopt items that genuinely need work:** A5 shift/job-board and A12 service level are
   absent; A1 zone-addressing and A8 capacity windows are Postgres-only, so they are dialect work;
   A13 channels and A11's collected-amount variance are genuinely missing. **A3, A9 and A10 are
   already implemented** — A3 has `handover_code`/`return_code`, a five-strike lockout and an audited
   `proof-reset` route; A9 has the `destination_changes` consent machine with notifications; A10 has
   the stale/reconnecting states. Drop all three from the plan.
5. **P2 — A14 re-arm graph, A15 offline bundle.**

---

## 5. Still unknown — do not present these as done

- **Live AWS state.** Not re-verified in this pass; the other thread reports the owner login
  refresh token expired (`LoginRefreshRequired`). That is an owner action, not a code defect.
- **Production runtime behaviour.** Everything above is static source plus local test runs.
  Nothing was executed against the CloudFront deployment or the pilot database.
- **Physical-phone results.** Not collected in this pass. Device `SM-A5360` was not touched.
- **PostgreSQL fixture.** The four Postgres-dependent suites remain blocked without a
  reachable fixture at `127.0.0.1:55473`; I did not start one.
- **Competitor runtime behaviour.** The eight REA notes remain static studies; no competitor
  system was contacted.

---

## 6. The dialect decision, with the table inventory

For the P0-0 decision the owner needs to know how much of the gated surface actually exists
in each dialect. Measured `[ran]` by matching every table the twelve gates probe against
`server/db/sqlite-schema.ts` and `server/db/postgres-*.sql`:

| Table the gate needs | SQLite schema | Postgres schema |
|---|---|---|
| `dispatch_rounds` | **no** | yes |
| `dispatch_offers` | **no** | yes |
| `eligibility_policy` | **no** | yes |
| `driver_eligibility` | **no** | yes |
| `domain_events` | **no** | yes |
| `outbox` | **no** | yes |
| `ledger_accounts` | **no** | yes |
| `ledger_journals` | **no** | yes |
| `native_push_tokens` | **no** | yes |
| `support_cases` | **no** | yes |
| `payment_intents` | **no** | yes |
| `payment_attempts` | **no** | yes |
| `private_objects` | **no** | yes |
| `order_declared_scope` | **no** | yes |
| `custody_records` | **no** | yes |
| `ride_lifecycle` | **no** | yes |
| `ride_boarding_attempts` | **no** | yes |
| `assignment_history` | **no** | yes |
| `quotes` | yes | yes |
| `road_restrictions` | yes | yes |

**18 of 20 exist only in Postgres.** Only `quotes` and `road_restrictions` exist in both — and
`quotes.ts:9` still returns false on SQLite because it also requires `schema_migrations`.

**What that means for the choice.** "Port the twelve modules to SQLite" is not a refactor; it is
writing eighteen tables plus their invariants twice, including an outbox, a double-entry ledger
and a custody chain — the three things most expensive to get wrong in a cash business. The
cheaper and safer path is almost certainly to finish the Postgres cutover and keep one
dialect. But that is the owner's call, and it is now a costed decision rather than a slogan.

### 6.1 The deployed schema vs the DDL — corrected after tracing every table

My first version of this section called this "drift in both directions". Tracing each table in the
source shows that was overstated: **three of the five are by design**, and only two are genuinely
unexplained. Recording the correct version `[read]`:

| Table | Reality |
|---|---|
| `users_vehicle_upgrade` | **Not drift.** A temporary rename target: `DROP` → `CREATE` → `INSERT` → `ALTER TABLE users_vehicle_upgrade RENAME TO users` (`sqlite-schema.ts:249-261`). It does not exist after a migration by design |
| `security_events_audit_upgrade` | **Not drift.** Same pattern: `... RENAME TO security_events` (`sqlite-schema.ts:223-230`) |
| `opencode_jobs` | **Not drift.** Created only when `WIND_OPENCODE_ENABLED === '1'` **and** `NODE_ENV !== 'production'` (`sqlite-schema.ts:202`). Production absence is correct |
| `native_push_tokens` | **Unexplained.** Created only in `server/db/postgres-native-push.sql:4`. It exists in the production **SQLite** database with a full column set, but no SQLite DDL creates it. It is also probed by `events.ts:13` and `native-push.ts:27` |
| `firebase_resets` | **Orphan.** No reference anywhere under `server/`. It exists in production and nothing in the code creates or uses it |

**The accurate finding is much smaller than "drift".** Two tables sit in the live SQLite database
that the repository does not create: one is an orphan from a removed feature
(`firebase_resets`), and one is a table the code probes but never creates on this dialect
(`native_push_tokens`). Neither breaks anything today — `native_push_tokens` probing on SQLite is
guarded by the `backend === 'postgres'` gate in `native-push.ts:26`, so the branch is never taken.

**Why it still matters:** a backup restore is only proven if the restored schema is the schema the
code expects. These two tables are evidence that the live database has a history the repository
does not describe. Worth one command to settle, not a workstream. Save this as `schema_diff.py`
and run it against a **restored copy**, never the live database:

```python
import pathlib, re, sqlite3, sys
db = sys.argv[1]
schema = pathlib.Path("server/db/sqlite-schema.ts").read_text(encoding="utf-8")
prod = {r[0] for r in sqlite3.connect(db).execute(
    "select name from sqlite_master where type='table'") if not r[0].startswith("sqlite_")}
code = {m.group(2) for m in re.finditer(
    r"CREATE TABLE (IF NOT EXISTS )?([a-z_]+)", schema, re.I)}
print("in db, not in DDL :", sorted(prod - code))
print("in DDL, not in db :", sorted(code - prod))
```

Run against the 13 Nov backup it prints `in db, not in DDL : ['firebase_resets', 'native_push_tokens']`
and `in DDL, not in db : ['opencode_jobs', 'security_events_audit_upgrade', 'users_vehicle_upgrade']`
— verified in this pass. The second line is expected (see the table above); a different **first**
line means the deployed schema has moved further than this pass found.

---

## 7. P0 - booking command retention: fixed by retention alone, after a review killed my first fix

**Status: fixed and verified.** The fix is one change: the `book.tsx` catch block no longer deletes the
persisted command for the eight post-lock refusals. Nothing else was needed, and two attempts to add
more were removed after review.

| Command | Result |
|---|---|
| `node tests/booking-retry-race.test.mjs` | **EXIT 0** - "a refusal the quote-bound write can still produce keeps the persisted command for 8 codes" (Part A still SKIPs: no PostgreSQL) |
| `node tests/booking-auth.test.mjs` | **EXIT 0** - the receipt contract is unchanged |
| `npx tsc --noEmit` / `-p tsconfig.server.json` / `npx expo lint` | **EXIT 0** / **EXIT 0** / **EXIT 0** |

### 7.1 What the failing test asked for, and the fix

`tests/booking-retry-race.test.mjs` requires that a refusal from
`{quote_consumed, quote_expired, route_prohibited, service_unavailable, pooling_unavailable,
promo_changed, promo_used, invalid_schedule}` does **not** delete the persisted command, because a
first POST that this request retries may already have committed. Before the fix, `src/app/book.tsx`
deleted it for every `<500` that was not `401/408/429/idempotency_conflict`, so a committed order lost
its only on-device pointer and orphaned in `searching`. The fix adds those eight codes to the
exclusion at the catch block and changes nothing else.

### 7.2 I was wrong about the lockout, and the reason matters

My first write-up claimed retaining the command created a **permanent UI lockout**: `pending` freezes
the form, the only exits are Edit/Discard, those are gated on `releasable`, `releasable` needs outcome
`'absent'`, and `pendingOutcome` never returns `'absent'`. Every link in that chain is real, but the
conclusion was wrong because I missed a button.

**The pending card has a Retry button** (`src/app/book.tsx:439`) that calls `submit()` again with the
same `requestId`. The server replays the command idempotently: if the original committed, the replay
returns that order and the screen navigates to it; if it did not, the request executes. Retry is the
recovery path, and it is the correct one because it needs no guess about server state.

That also explains the design: Edit and Discard stay **disabled** for an `unknown` outcome on purpose
(`src/booking.ts:106-107`, "Editing or discarding is only safe on a server-confirmed absence"). Letting
a customer discard an ambiguous command is exactly what orphans orders.

### 7.3 My second attempt, and why it was removed

I then implemented a "commit window": `COMMIT_WINDOW_MS = 30_000` in `src/booking.ts` plus
`pendingOutcome(receipt, attemptedAt, now)` returning `'absent'` once that much wall-clock time had
passed, a `sentAt` fallback for commands without `attemptedAt`, a re-ask timer in the effect, and a new
`tests/booking-commit-window.test.mjs`. It passed every gate.

An independent Kimi review of that change returned **UNSOUND**, with two findings I accept:

1. **`sentAt` is not the attempt time.** It records the *first save* (`booking.ts:18`). Treating it as
   the attempt start can mark a command absent while a later POST is in flight — re-creating the very
   orphan the retention change exists to prevent.
2. **Client wall-clock elapsed time is not proof of server non-commit.** A null receipt is a
   point-in-time observation, not a tombstone. A POST stalled 31 s, or a phone clock that jumps
   forward, both release a command that can still commit. Worst case: discard orphans an order, or
   edit-plus-rebook produces two committed orders.

I removed the window, the timer, the `sentAt` fallback, the new test and its `run-tests.mjs` entry.
`pendingOutcome` is back to its original single-argument form, and its docblock now records why no
time-based upgrade belongs there: the recovery for an unknown command is Retry, never a release.

### 7.4 What this means for the remaining risk

- **Fixed:** a committed order no longer loses its pointer on a post-lock refusal.
- **Accepted by design:** a customer whose command did not commit must tap Retry to make progress. The
  card explains this (`bookingRetryHint`) and Retry is the primary action.
- **Still unproven:** Part A of `booking-retry-race` (the PostgreSQL lock/replay race) cannot run here,
  so the server-side half is asserted by the code and the test's own documentation, not by execution.
- **If a better fix is ever wanted,** it is server-side: make the receipt endpoint answer a definitive
  "this command is dead" state, so the client can unlock on proof instead of on elapsed time. That is a
  server change with its own tests, not a client heuristic.

### 7.5 What not to do

- Do not re-add a time-based `'absent'` upgrade in `pendingOutcome`. An independent review showed it
  can release an in-flight command.
- Do not make `pendingReleasable` return true for `'unknown'`. That re-introduces the orphan for every
  ambiguous refusal.
- Do not weaken or delete the assertions at `booking-retry-race.test.mjs:95-101` or
  `booking-auth.test.mjs:54-56`. Both encode real constraints and both pass as written.
- Do not use `sentAt` as a proxy for when the last POST started. It is the first-save time.

---

## 8. Work completed in this pass (so the next agent does not redo it)

| Item | Status | Evidence |
|---|---|---|
| Booking command loss (P0) | **FIXED - retention only; two extra attempts removed after review** | `src/app/book.tsx` catch block now excludes the eight post-lock codes, so a committed order keeps its on-device pointer. `booking-retry-race` **EXIT 0**, `booking-auth` **EXIT 0**, both typechecks **EXIT 0**, `expo lint` **EXIT 0**. A time-based `COMMIT_WINDOW_MS` release, its `sentAt` fallback and its re-ask timer were implemented and then **removed** when an independent review showed they can release an in-flight command (section 7.3) |
| Typecheck gate (P1) | **FIXED — and the fix had to go further than `exclude`** | Root `tsconfig.json` "include" narrowed from `**/*.ts(x)` to `src/**/*.ts`, `src/**/*.tsx`, `.expo/types/**/*.ts`, `expo-env.d.ts`; "exclude" also extended with `.claude`, `.commandcode`, `research`, `research_notes`, `session-bridge`, `project-media`, `reports`, `dist`. Narrowing `include` was the necessary half: `tests/clean-typecheck.test.mjs` **replaces** `exclude` with its own absolute list, so an exclude-only fix left that test sweeping the research trees and it timed out at 60 s. After the include change: `npx tsc --noEmit` → **EXIT 0 in 4.2 s** (was heap OOM, EXIT 134) and `node tests/clean-typecheck.test.mjs` → **EXIT 0** |
| Full suite, every `tests/*.test.mjs` file | **99 test files: 99 pass, 4 fail - all four environmental** | `node --test --test-concurrency=1` over all files, exit 1. The only failures are `database-logging`, `db-api`, `db-persistence`, `subscription-migration`, each dying on `Error: connect ECONNREFUSED 127.0.0.1:55473` **before reaching any assertion**. `booking-retry-race` and `booking-auth` **PASS**; `clean-typecheck` **PASSES**. **Zero product failures among executed tests; the four database-dependent files are unexecuted coverage, not proof of correctness** |
| Dialect inventory (§6) | **DONE** | table above |
| Schema drift (§6.1) | **RESOLVED - three of five were by design; two orphan tables remain** | corrected in §6.1, with a tested check script |
| PostgreSQL-dependent verification | **BLOCKED, proven** | `psql -U postgres -h 127.0.0.1 -p 5432 -w` → `fe_sendauth: no password supplied`, exit 2; same for `fastship_test`. Service `postgresql-x64-16` is Running and listening on 5432, but the tests default to `fastship_test@127.0.0.1:55473` which is not listening |

**What the tsconfig narrowing stopped covering: nothing that matters.** Outside `src/` (and excluding `server/` and the research trees) the only `.ts`/`.tsx` file is `vendor/deepmerge/index.d.ts`, a declaration file for a vendored third-party module that TypeScript still resolves through the import that uses it. There are no root-level `.ts` files, and `plugins`, `scripts`, `tests`, `public`, `infra`, `assets`, `docs` and `tasks` contain none.

**Owner action for the blocker:** either start the test cluster the suite expects on port
55473, or export `WIND_TEST_DATABASE_URL` pointing at a database whose password you hold. The
one command that verifies it afterwards:

```powershell
$env:WIND_TEST_DATABASE_URL="postgresql://<user>:<pass>@127.0.0.1:5432/<db>"
node tests/booking-retry-race.test.mjs      # Part A must run, not SKIP
```

Do not edit `pg_hba.conf` to trust: that weakens every database on the machine, not just this
test.

---

## 9. Containment audit: Postgres-only SQL does not leak onto the SQLite path

A reasonable worry after §1 is that Postgres-only syntax (`::uuid`, `::jsonb`, `to_regclass`,
`pg_advisory_xact_lock`, `FOR UPDATE SKIP LOCKED`, `append_domain_event`) might execute on
production SQLite and throw at runtime. I checked every file that contains any of those
markers `[ran]`:

| File | Backend guard | Markers |
|---|---|---|
| `commands.ts` | guarded | `pg_advisory` |
| `destination-change.ts` | guarded | `::jsonb`, `to_regclass`, `append_domain_event` |
| `dispatch.ts` | guarded | `::jsonb`, `::uuid` ×35, `to_regclass`, `pg_advisory` ×6 |
| `eligibility.ts` | guarded | `::jsonb` ×24, `to_regclass` ×4 |
| `events.ts` | guarded | `::jsonb`, `::uuid` ×2, `to_regclass` ×4 |
| `ledger.ts` | guarded | `::uuid` ×4, `to_regclass` ×2, `pg_advisory` |
| `native-push.ts` | guarded | `::jsonb` ×2, `to_regclass` ×2 |
| `opencode.ts` | guarded | `to_regclass` |
| `ops.ts` | guarded | `to_regclass` ×2 |
| `payments.ts` | guarded | `::uuid` ×44, `to_regclass` ×2, `pg_advisory` |
| `phone-identity.ts` | guarded | `::jsonb` ×2, `::uuid` ×22, `to_regclass`, `pg_advisory` |
| `presence.ts` | guarded | `::uuid` ×10, `to_regclass` ×2, `SKIP LOCKED` ×2 |
| `private-objects.ts` | guarded | `::uuid` ×6, `to_regclass` ×2 |
| `quotes.ts` | guarded | `::jsonb` ×7, `::uuid`, `to_regclass` ×2 |
| `resource-scope.ts` | guarded | `::jsonb` ×2, `to_regclass` ×4 |
| `ride-lifecycle.ts` | guarded | `to_regclass` ×6 |
| `main.ts` | guarded | `::uuid` ×7, `pg_advisory` ×2 |

**Result: no unguarded leak.** Every file carrying Postgres-only syntax also carries a
`backend === 'postgres'` / `!== 'postgres'` gate, so the design is "one codebase, two paths"
rather than "Postgres code that happens to fail on SQLite". That is a real quality signal for
this codebase and it should stop anyone proposing a large SQL-portability rewrite.

**One residual to keep an eye on, not a defect:** `enqueuePush` in `events.ts` uses
`append_domain_event(...)` and `::jsonb` in its own body without an internal gate; it is safe
only because its callers are on the Postgres path, and the file says so —
*"Called before the enclosing PG commit; SQLite deliberately retains its legacy adapter."*
If anyone ever calls it from a SQLite-reachable path, it will throw. A guard inside the
function would make that impossible by construction.

---

## 10. Peer-review record — what was attempted, and what actually ran

The owner asked for independent Kimi K3.1 reviews. Most attempts died on infrastructure, but **one
completed and it changed a shipped decision**, so the record is worth keeping in full.

| Attempt | Model | Outcome |
|---|---|---|
| A1 | `azure-terra/Kimi-K3.1-Pro` | **Failed** — invalid subscription key / wrong API endpoint. Not provisioned here |
| A2 | `baseten/moonshotai/Kimi-K3.1-Pro` with `variant: high` | **Failed** — that model exposes no `high` variant; the option was wrong |
| B1 | `amazon-bedrock/us.moonshotai.kimi-k3` | **Failed** — model unavailable |
| B2, B3, B4, B5 | `baseten/moonshotai/Kimi-K3.1-Pro` | **Failed** — rate limit exceeded. The pool admits roughly one concurrent task |
| C1 | `cometapi/kimi-k3.1-pro` | **Failed** — quota exhausted: 0.003 USD remaining, 0.128 USD required. Every `cometapi` model shares it |
| C2 | `baseten/moonshotai/Kimi-K3.1-Pro` | **Cancelled** after a long run with no output while two siblings rate-limited on the same model |
| **D** | `baseten/moonshotai/Kimi-K3.1-Pro`, run alone and narrowly scoped | **COMPLETED — verdict UNSOUND**, and it was right |

### 10.1 What review D caught, and what it cost

D was given only the booking change and asked to falsify it. It returned two HIGH findings and one
MEDIUM that were correct:

1. **`sentAt` is not the attempt time.** Using the first-save timestamp as a proxy for when the last
   POST started can mark a command absent while a later POST is still in flight — re-creating the
   orphan the change existed to prevent.
2. **Client wall-clock elapsed time is not proof of server non-commit.** A stalled POST or a forward
   clock jump both release a command that can still commit; worst case, two committed orders.
3. The one-shot re-ask timer was lossy (a read already in flight makes it a no-op with no reschedule).

**Consequence: the commit-window mechanism was removed** — constant, signature change, `sentAt`
fallback, timer and its test. D's verdict directly reversed something that had already passed every
gate, which is exactly what an independent review is for.

### 10.2 What D also proved about my own reporting

The same review forced a second correction. My previous conclusion — that retention creates a
**permanent lockout** — was wrong: the pending card has a Retry button (`book.tsx:439`) that resubmits
the same `requestId` for the server to replay. I had missed the exit that was on screen the whole time.
§7.2 records that.

### 10.3 What was verified directly, because the pool mostly failed

The twelve gates were opened line by line (section 1); payments' two blockers were traced through
`payments.ts` (section 1); the twenty tables were matched across both schema sources (section 6); every
test failure was classified against its actual error (section 8); the PostgreSQL blocker was reproduced
against a live server (section 8); and the tsconfig narrowing was checked for lost coverage (section 8).

**A second independent review also landed, from a different model.**
`docs/REA/2026-11-13-INDEPENDENT-CHECK.md` was produced by the other session and caught a real error in
this file: the `WIND_POSTGRES_STAGING` branch at `runtime.ts:11-18`. That correction is folded into
section 1 and reconciled at the foot of that file.

**Net: two independent reviews completed, both found real defects in my work, and both findings are
reflected in the code.** Five attempts were lost to rate limits, quota and unprovisioned endpoints —
an infrastructure fact, not a judgement on the model.
