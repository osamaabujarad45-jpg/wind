# GAP BACKLOG — 13 Nov 2026

**What this is:** the Phase 1 deliverable the implementation handoff names. One row per real gap, in
our own words, with the evidence that established it, a size, the user impact, and — the part that
was missing — **acceptance criteria** and what blocks it.

**Supersedes:** the status tables in `2026-11-13-IMPLEMENTATION-HANDOFF.md` §4 and
`2026-11-13-VERIFIED-ADDITIONS.md` §2. Those hold the evidence; this holds the work.
**Read with:** `2026-11-13-RECONCILIATION.md`, which independently re-baselined the same rows, and
`2026-11-13-gap-backlog-source-audit.md`, the row-by-row source audit of this file.

**What that audit changed here:** it corrected **A7 from `DONE` to `PARTIAL`** — the durable protocol is
opt-in and allowlisted, not universal — and that correction is applied below. It also proposed that
`cash_entries` stores expected/collected amounts; **that does not reproduce** — `cash_receipts`, which
holds `collected_minor`, is created only in `postgres-ledger.sql:70`, so the pilot records no collected
amount. A11 stays `PARTIAL` with that evidence stated. Every other verdict in the audit matched this
file and is left as written.

---

## 1. How to read this

**Status vocabulary** — use exactly these, because the difference is the whole point:

| Status | Means | Do |
|---|---|---|
| `DONE` | Works on the backend production actually runs, verified by reading the route/table/state machine | Drop from the plan |
| `PG-ONLY` | Implemented, but only in the Postgres dialect. Unreachable in the pilot | Parity work, after the dialect decision |
| `PARTIAL` | Some mechanism exists; a named piece does not | Finish the named piece only |
| `ABSENT` | Read the routes, tables and state machines and found nothing | Build |
| `UNVERIFIED` | Status read from source, no acceptance test run | Test before planning further |

**Size** is engineering effort for one competent developer: **S** ≤ 1 day, **M** 2–4 days, **L** 1–2 weeks.
**No status here is `DONE` on runtime evidence** — every row is source-read, which is why acceptance
criteria are mandatory rather than optional.

---

## 2. The backlog

### 2.1 Blockers — settle before any feature work

| ID | Item | Status | Where | Required behaviour | Size | Impact | Blocked by |
|---|---|---|---|---|---|---|---|
| **B1** | Dialect decision | **DECIDED — Option C now, A next, B ruled out** | `2026-11-13-DIALECT-ADR.md` | Keep the current SQLite pilot scope; rehearse the later PostgreSQL cutover separately. Every PG-ONLY row below is deferred to that cutover | M (decision) + L (execution) | Prevents accidental reliance on gated features | Owner accepted |
| **B2** | Confirm the deployed dialect on the host | OPEN | host | Record variable presence and a safely derived dialect/staging classification plus `PRAGMA user_version` (expect `3`). **Never print `WIND_DATABASE_URL`, credentials, or the full environment file.** Today "production is SQLite" is inferred from a backup file and deployment material, not observed | S | If this is wrong, §2 of both documents is wrong | Owner access |
| **B3** | Restore drill | **PARTIAL — local restore/API boot verified; live-host baseline and replacement-host recovery pending** | backup; `docs/verification/production-safety-audit-2026-11-15.md` | Newest backup decompressed, integrity `ok`, foreign keys clean, `user_version=3`, zero row-count differences against the prior backup, API boots and reports schema 3. Live-host environment/counts remain blocked by SSM/EC2 permissions | S | Restorability is locally proven; replacement-host/live baseline is not | Owner host access |
| **B4** | Schema orphan decision | **DECIDED — preserve for pilot; optional owner cleanup later** | `firebase_resets`, `native_push_tokens`; `docs/verification/production-safety-audit-2026-11-15.md` | Both zero-row legacy tables are preserved. `native_push_tokens` is PostgreSQL-only and inactive on SQLite; `firebase_resets` has no `server/` reference. Do not invent SQLite DDL or delete history during a restore drill | S | Restore compatibility is known; speculative deletion is unnecessary | B3 |

### 2.2 Adopt items

| ID | Item | Status | Where | Required behaviour | Size | Impact | Blocked by |
|---|---|---|---|---|---|---|---|
| **A1** | Zone-first addressing | `PARTIAL` | `saved_places`; `src/model.ts:185` | Customer address = structured zone + free-text line + landmark + label + default. Replaces the 20 km radius shortcut. `service_areas` already exists in the Postgres eligibility model and can be the zone source | M | Driver finds the door; delivery fee becomes computable instead of flat | B1 (only if zones come from the PG model) |
| **A3** | Delivery proof | `DONE` (needs test) | `orders.handover_code`, `main.ts:2201`, `:2826` | Customer-held code required to complete, five-strike lockout, audited admin reset — all present. Only a QR token is absent, and it is optional | S (QR only) | Cash reaches the right hand | — |
| **A5** | Shift + job board | `ABSENT` | `dispatch.ts:284`, `presence.ts:168`; external benchmark `research_notes/REA-2026-11-13-reference-apps/HAAT-DRIVER.md` §2.1–2.3 | Driver starts a shift → a ready queue they pick from → custody by scan. Today there is offer acceptance and an active-job guard, not a shift lifecycle. HAAT resources now verify registered shifts and timed accept/reject flows. Souq separately verifies ready-queue/custody-scan and door variance patterns in `research_notes/Wind verified research atlas/souq-tulkarm-feature-implementation.md`; server enforcement remains unknown | L | The operational model the business actually runs on | — |
| **A7** | Idempotent, durable writes | `PARTIAL` — corrected from `DONE`; my label was wrong | `server/domain/commands.ts:7-19` | The durable protocol is **opt-in**: `:10` passes through unchanged when `body.commandId` is absent; `:11` returns `409 durable_protocol_unavailable` when a `commandId` is supplied on a non-postgres backend; `:14` allowlists only `/api/orders`, `/api/jobs/`, `/api/admin/orders/`, `/api/admin/cash`, `/api/driver/cash`. So on the pilot, durability exists for booking creation and driver advance/exception via `order_commands`/`order_actions`, and **not** as a general outbox for every mutation. Enumerate the covered commands and their retry semantics before promising offline writes | S (enumerate) → M (extend) | 3G/2G reality: only some writes survive a lost answer | — |
| **A8** | Zone fees + capacity windows | `PARTIAL` | `quotes.ts` (`scheduled_for` only); `postgres-eligibility.sql` | Per-zone fee, delivery window with a per-window daily cap. The capacity model exists in Postgres; the SQLite path has none | M | "When can we actually deliver" becomes a capacity answer | B1 |
| **A9** | Consent-before-change | `DONE` (needs test) | `destination_changes`, `destination-change.ts:25` | Five-state machine with counterparty notification already implements it | — | Trust at the door | — |
| **A10** | Tracking reports degradation | `DONE` (needs test) | `src/location-state.ts:8-9`, `presence.ts:119,172` | Stale ≥ 60 s and reconnecting 30–60 s are already states the counterparty sees | — | A stale pin is worse than an honest "off" | — |
| **A11** | Collected-amount variance | `PARTIAL` — and the collected amount does not exist on SQLite at all | `cash_entries`; `postgres-ledger.sql:70`; external boundary `research_notes/REA-2026-11-13-reference-apps/HAAT-DRIVER.md` §2.4 | `cash_entries` has only `kind remittance\|adjustment`, `amount_cents`, `note`, `status` — no expected or collected amount. `cash_receipts` (with `collected_minor`) is created **only** in `postgres-ledger.sql:70`, so on the pilot the amount collected at the door is not recorded. HAAT verifies balance/history/refund surfaces, not expected/collected variance. Souq separately supplies `amountCollectedCents` + typed `discrepancyReason` in `research_notes/Wind verified research atlas/souq-tulkarm-feature-implementation.md`; server invariants remain unknown. Required: collected amount + typed variance reason per order, immutable after the fact; under/over-collection both covered and independent discount approval retained. A narrow SQLite implementation is a scope amendment requiring explicit owner approval before activation, not an automatic pilot inclusion | M | Cash reconciliation without a spreadsheet | Explicit owner scope amendment; Option A if `cash_receipts` is reused |
| **A12** | Service level as parcel attribute | `ABSENT` | `partner_orders` | Same-day/priority is an attribute of the parcel, not a second order type. `partner_orders` is only an idempotency map | S | Add priority without forking the state machine | — |
| **A13** | Notification channels per event | `ABSENT` | `native-push.ts` | Per-event channel with a version suffix so a changed definition is recreated, not silently reused | S | Push that a user can mute per concern | — |
| **A14** | Alarm re-arm graph | `PARTIAL` | `background-location.ts:3,165` | Boot, user-unlock, time-set, timezone-change and package-replaced handlers. Today only a task-manager definition exists | M | A deadline survives a reboot | — |
| **A15** | Offline fallback bundle | `PARTIAL` | `offline-summary.ts:2-13` | Bundle today's zones, fees, windows and saved addresses, not only a cached summary | M | A driver on a dead SIM still works | B1 (fees/windows) |
| **A16** | Typed delivery failures | `PARTIAL` | `safety_incidents.kind` exists; `order_disputes.reason` is free text; `research_notes/Wind verified research atlas/souq-tulkarm-feature-implementation.md` | Safety incident kinds and cash-variance reasons are not a complete delivery-failure taxonomy. Required: typed failure reason and next action per failed delivery, separate from cash variance and safety incidents, with recovery/reattempt semantics | M | Driver/customer knows what failed and what happens next; no generic failure label | SCOPE |
| **A2** | Append-only cash ledger | `PARTIAL` | `cash_entries` triggers; `ledger.ts:15` | Append-only is enforced by trigger already. Missing piece is the double-entry journal, Postgres-only | L | Audit-grade accounting | B1 |
| **A6** | Chain of custody | `PG-ONLY` | `resource-scope.ts:33` | Per-parcel append-only event log proving who carried what and when | M | Dispute resolution | B1 |

### 2.3 Inherited defects

| ID | Item | Status | Where | Required behaviour | Size | Impact | Blocked by |
|---|---|---|---|---|---|---|---|
| **D1** | Booking command retention | `DONE` | `src/app/book.tsx` catch; `tests/booking-retry-race.test.mjs` | Eight post-lock codes retain the command; Retry replays it. Server-side race Part A now runs on PostgreSQL 18.3 and exits 0 | S | A committed order keeps its pointer | PostgreSQL fixture |
| **D2** | Typecheck gate | `DONE` | `tsconfig.json` `include`; `package.json` | Root `tsc` exits 0; `clean-typecheck` passes | — | The release gate is measurable again | — |
| **D3** | PostgreSQL fixture | `DONE` | fresh remote `DESKTOP-S2JKMK5:55494`; separate local-temp `:55475` | PostgreSQL 18.3/PostGIS 3.6 fixtures are reachable. The four dark suites pass, and the final complete remote persistence run on 55494 exits 0 with 52 selected suites plus legacy; the local-temp fixture also passes | S | Previously unexecuted coverage now runs | — |

---

## 3. Sequence

1. **B1 decided**: Option C now, Option A next, Option B ruled out. Do not sequence PostgreSQL-only work into the current pilot.
2. **B2** — live-host dialect/environment remains blocked by SSM/EC2 permissions; `schema=3` is verified at the public readiness endpoint and in the restored backup.
3. **B3** — local restore and API boot are proven; the live-host baseline and timed replacement-host recovery remain open and must not be inferred from a local restore.
4. **B4** — preserve both zero-row legacy tables for the pilot; optional owner cleanup later.
5. **D3** — fresh PostgreSQL fixtures exist on the remote PC and local temp; the four dark suites and D1 Part A pass, and the final complete remote persistence run on 55494 exits 0 with 52 selected suites plus legacy.
6. **A11, A13, A12, A16** — independent remaining feature/contract gaps.
7. **A5** — the largest genuine gap and the one that changes how the business operates.
8. **A1/A8/A2/A6/A15** are deferred to the rehearsed PostgreSQL cutover. A7 audit and A14 remain independent work.

---

## 4. Acceptance criteria — the part that makes a row closable

Each row above closes only when its test exists and passes on the backend production runs:

- **A3** — a test that completes an order with the wrong code fails, with the right code succeeds, five failures lock the order, and an admin `proof-reset` writes a `PROOF_RESET` audit row.
- **A9** — a test that a destination change cannot take effect until the counterparty accepts, and that both sides get a notification either way.
- **A10** — a test that a 61-second-old fix reports `location_stale` to the counterparty rather than a stale position.
- **A11** — a test that a collected amount below the expected total records a variance with a reason and cannot be edited afterwards.
- **A13** — a test that a bumped channel version produces a new channel and the old one is not reused.
- **A5** — a test that a driver with no active shift sees no queue, that starting a shift exposes it, and that custody scan events are recorded per parcel.
- **A16** — each typed delivery-failure reason has a distinct next action and acceptance test; it cannot be replaced by a generic failure or confused with a cash-variance reason.

If a row cannot be tested on SQLite, that is evidence for B1, not a reason to defer the test.

---

## 5. Deliberately excluded

The skip list from the competitor index still stands: card/wallet payment and card commission, the
marketplace/community layer, the B2B catalogue, the Capacitor-shell architecture, shipping credentials
in app config, `allowBackup` for address data, ad-storage analytics defaults, permission sprawl,
always-on background location, chat-with-canned-replies at launch, and Web Push instead of FCM. The
defer list (D1–D14 in that index) keeps its evidence gates; none of them is in this backlog.
