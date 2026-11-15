# ADR-001 — Runtime dialect for the Wind pilot

**Status:** Accepted — Option C now, Option A as the next milestone, Option B ruled out · **Date:** 13 Nov 2026 · **Decider:** owner, through the explicit instruction to execute the recommendation · **Evidence:**
`2026-11-13-VERIFIED-ADDITIONS.md` §1 and §6, `2026-11-13-GAP-BACKLOG.md` B1

---

## 1. The situation

The codebase carries two storage implementations. Production runs one of them, and the other one
contains most of the sophisticated mechanism.

**What is measured, not inferred:**

- `server/db/runtime.ts:1-27` selects SQLite when `WIND_DATABASE_URL` is unset (`:9`), selects a
  Postgres schema called `wp16_staging` when `WIND_POSTGRES_STAGING=1` (`:11-18`), and throws for any
  other URL (`:20-21`) — the "WP03 schema/import parity" gate.
- The deployed pilot writes SQLite: the nightly host backup is a SQLite file (integrity `ok`, 364,544 B
  decompressed on 13 Nov), and the deployment is one EC2 host with SQLite. `user_version` on that
  database is **3**, and `sqlite-schema.ts:8` refuses to open anything newer.
- **Twelve** domain modules return "unavailable"/false on a non-postgres backend: `commands.ts:11`,
  `dispatch.ts:41`, `eligibility.ts:33`, `events.ts:35`, `ledger.ts:15`, `native-push.ts:26`,
  `ops.ts:14`, `payments.ts:36`, `private-objects.ts:48`, `quotes.ts:9`, `resource-scope.ts:30`,
  `ride-lifecycle.ts:24`.
- **18 of the 20 tables** those gates probe exist only in `server/db/postgres-*.sql`. Only `quotes` and
  `road_restrictions` exist in both — and `quotes.ts:9` still returns false on SQLite because it also
  requires `schema_migrations`.

**What that costs today.** On the dialect production actually runs, these are unreachable: the outbox
and `domain_events`, the durable command protocol, `payment_intents`, `custody_records`, the double-entry
ledger, `dispatch_rounds`/`dispatch_offers`, `eligibility_policy`/`driver_eligibility`,
`native_push_tokens`, `support_cases`, `private_objects`, `ride_lifecycle`/`assignment_history`. Older
inline paths in `main.ts` serve the shipped behaviour instead.

**Why this is an ADR and not a task.** Roughly a third of the gap backlog is blocked on it: A1, A8, A15
(dialect-dependent), A2 and A6 (`PG-ONLY`). Estimating any of them before the decision is guessing.

---

## 2. Options

### Option A — Finish the Postgres cutover; keep one dialect

Bring `WIND_DATABASE_URL` to production, close the WP03 parity gate, migrate the data, retire the
SQLite paths.

- **Gains:** every gate becomes reachable at once. One dialect to reason about, one set of invariants,
  eighteen tables already written. The double-entry ledger, the outbox and custody records — the three
  things most expensive to get wrong in a cash business — start working as designed.
- **Costs:** a real migration with a write freeze; `wp16_staging` is a *staging schema*, not a proven
  cutover path; four test suites currently cannot even run without a fixture, so the parity evidence is
  thinner than it looks; the deploy script restores code, not the database, so rollback semantics need
  designing. Also a new operational surface: backups, tuning, connection limits, on one EC2 host.
- **Risk:** the pilot is small (9 users, 2 cancelled orders). Migrating a near-empty database is
  cheap *now* and expensive later — but a failed cutover on a live cash system is not cheap at all.

### Option B — Port the twelve modules to SQLite

- **Gains:** no migration, no new operational surface, keeps the single-host model the deployment
  material already describes.
- **Costs:** eighteen tables plus their invariants written a second time — including an outbox, a
  double-entry ledger, a custody chain, `SELECT … FOR UPDATE SKIP LOCKED` semantics that SQLite does not
  have, and advisory-lock races that the booking Part A test exists to catch. That is not a refactor;
  it is a second product. And it is permanent: two dialects to keep in step forever.
- **Risk:** the invariants that matter (append-only money, exactly-once dispatch) are the hardest to
  reimplement correctly, and SQLite's concurrency model weakens several of them.

### Option C — Scope the pilot to the SQLite feature set, on purpose

Keep SQLite. Formally declare which capabilities the pilot does **not** have, remove or disable the
gated code paths so nobody mistakes them for working, and write that scope down where customers and
operators can see it.

- **Gains:** no migration, no second implementation, no false capability. The pilot ships on the
  narrow-but-real surface it already runs: orders, cash entries with trigger-enforced append-only,
  destination-change consent, handover-code proof, presence and stale tracking, idempotent orders.
  Everything blocked today moves to a post-pilot decision with a date.
- **Costs:** you give up the ledger, the outbox, dispatch rounds and custody records for now. Some of
  those are exactly what makes a cash business auditable at scale — acceptable at 9 users, not at 900.
- **Risk:** the scope declaration can rot. It only holds if the gated code is visibly disabled rather
  than silently returning 409 at runtime, and if the backlog keeps the deferred rows with their gates.

---

## 3. Recommendation

**C now, A as the planned next step, B never unless single-host SQLite becomes a hard requirement.**

Reasoning: the pilot has 9 users and 2 cancelled orders. Option A's migration risk is real but its
*timing* is currently free — which argues for doing it soon, not for pretending the gap does not exist.
Option C is the honest description of today and costs almost nothing to adopt; what it buys is that no
one plans against capabilities that return 409. Option B buys a permanent second implementation to avoid
a migration that must happen eventually anyway.

**Concretely:** adopt C this week (write the scope, disable the gated paths visibly), schedule A as the
next milestone with its own ADR and rehearsal, and rule B out explicitly so it stops reappearing in
planning conversations.

---

## 4. Consequences of adopting C (if chosen)

- `2026-11-13-GAP-BACKLOG.md` rows A2, A6, A1, A8, A15 become `DEFERRED (post-cutover)` rather than
  open work, and drop out of the current sequence.
- A short "what this pilot does not do" note is needed for operators, and the `409
  *_unavailable` responses must be reachable-from-UI states, not surprise errors.
- The twelve gates stay in place — they are the mechanism that makes the scope true rather than claimed.
- The payment story simplifies: `payments.ts:36` and the absent provider are both explained by the
  scope, so "activate payments" becomes a post-cutover item with two prerequisites, not a bug.

## 5. What would change this decision

- Usage moving past a few dozen real orders → the audit gaps start to bite, choose A.
- A requirement for custody disputes or driver settlement reconciliation → needs A.
- A decision to stay single-host permanently → reconsider B with a written invariant list, and budget it
  as a second product, not a port.

---

*This ADR is accepted: Option C governs the current SQLite pilot; Option A is the next separately
rehearsed milestone. Option B must not be scheduled. Any PostgreSQL cutover still requires its own
migration, restore, rollback, and acceptance evidence.*
