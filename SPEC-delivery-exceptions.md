# Spec: delivery-exceptions (Wind)

Module of [CAPABILITY-MAP.md](CAPABILITY-MAP.md). Status: **awaiting approval**. 2026-10-04.

## Objective

Today a parcel/freight order that cannot be delivered is stuck in `in_transit`:
the driver cannot finish it, cannot take another job, and support has no tool
(SYSTEM.md §9–10 calls this a launch blocker). Uber/Careem handle this with
"recipient unavailable → support decides → reattempt or return to sender", plus
a dispute channel after the job.

User stories:

1. **Driver**, in transit, recipient absent/refuses/unreachable/wrong address →
   reports a delivery problem with a reason → order goes `on_hold`. Driver keeps
   custody and location keeps reporting.
2. **Admin** sees on-hold orders, calls both sides, then chooses **reattempt**
   (back to `in_transit`, same handover code) or **return to sender**
   (`returning`). A written reason (≥5 chars) is required and audited.
3. **Driver**, returning → hands the item back to the sender, who gives a
   **return code** (shown only to the order owner) → order `returned` (terminal).
   Wrong code uses the existing 5-attempt lockout; admin proof-reset works here too.
4. **Customer**, on a `completed` or `returned` order within 7 days → opens one
   **dispute** with a description. Admin lists open disputes and resolves each with
   a written resolution. No automatic money movement (that is `cash-settlement`).

## State machine change

```
in_transit ──report──▶ on_hold ──reattempt──▶ in_transit
                          └──return──▶ returning ──code──▶ returned (terminal)
```

- `activeStatuses` gains `on_hold`, `returning` (driver stays busy, GPS allowed,
  account deletion/role edits blocked). Every hard-coded active-status SQL list in
  `server/main.ts` uses the shared list instead.
- Rides (`service = 'ride'`) cannot enter `on_hold`; they have no handover code.
- Customers cannot cancel `on_hold`/`returning` orders.
- Earnings/GMV: `returned` counts like `completed` at the original price (sender
  pays the fare; driver did the work). Commission snapshot unchanged.

## API (all under existing auth, roles checked server-side)

| Method + path | Who | Body | Rules |
|---|---|---|---|
| `POST /api/orders/:id/exception` | assigned driver | `requestId` (uuid), `expectedStatus: 'in_transit'`, `reason` ∈ `absent, refused, unreachable, wrong_address`, `note` ≤200 | Idempotent via `order_actions` like `/advance` |
| `POST /api/admin/orders/:id/resolve` | admin | `action` ∈ `reattempt, return`, `reason` 5–500 | only from `on_hold` |
| `POST /api/orders/:id/advance` | assigned driver | existing + `code` | from `returning` → `returned`, checks `return_code` |
| `POST /api/orders/:id/dispute` | order customer | `reason` 10–1000 | `completed`/`returned`, ≤7 days after `updated_at`, one per order |
| `GET /api/admin/disputes` | admin | — | open first, limit 200 |
| `POST /api/admin/disputes/:id/resolve` | admin | `resolution` 5–1000 | open → resolved |

Order JSON gains `returnCode` (owner only, only while `returning`),
`exceptionReason` (owner/assigned/admin), `dispute` (`{status, reason, resolution}` or null).

## Data (additive, no `user_version` bump — keeps rollback to the previous build possible)

- `orders.return_code TEXT`, `orders.exception_reason TEXT` via existing `ALTER` pattern.
- `order_disputes(id, order_id UNIQUE, customer_id, reason, status CHECK open|resolved, resolution, resolved_by, created_at, resolved_at)`.
- Audit: reuse `security_events` actions `DELIVERY_EXCEPTION`, `EXCEPTION_RESOLVED`, `RETURN_COMPLETED`, `DISPUTE_RESOLVED`.

## Cross-app requirement (Souq)

Souq's shipping bridge treats only `completed`/`cancelled` as terminal. It must
also treat `returned` as terminal, and show `on_hold`/`returning` as in progress.
Shipped together with the Souq module in this session.

## UI

- Driver job card (`src/driver-work.tsx`): "مشكلة في التسليم / Delivery problem" in
  `in_transit` → reason chooser + note; `on_hold` shows "بانتظار الدعم"; `returning`
  shows return-code entry.
- Customer order screen: labels for new states; return code card while `returning`;
  "فتح شكوى / Report a problem" on eligible orders.
- Admin orders: on-hold filter with Reattempt / Return actions; disputes list with resolve.
- Arabic + English copy in `src/copy.ts`; 44pt targets; screen-reader labels.

## Tech stack / commands

Expo SDK 57, React Native 0.86, Node 24 `node:http` + `node:sqlite` (no new deps).

```
npm test            # node test suites in tests/
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
npm run screens     # refresh docs/screens after UI change
```

## Project structure

`server/main.ts` API · `src/model.ts` shared types/state · `src/app/**` screens ·
`src/copy.ts` strings · `tests/*.test.mjs` node:test suites.

## Code style

Match `server/main.ts`: `route(...)` handlers, `fail(status, 'snake_code')`,
`BEGIN IMMEDIATE` around multi-row writes, no new abstractions.

## Testing strategy

Extend `tests/api.test.mjs` (real server + temp DB): report → hold → reattempt →
complete; report → return → wrong code ×5 lock → admin reset → returned; replayed
`requestId` does not double-transition; non-assigned driver/customer forbidden;
ride rejected; on-hold driver cannot accept another job; dispute window/one-per-order;
earnings include `returned`. `tests/model.test.mjs` for status lists.

## Boundaries

- Always: idempotent driver commands, server-side role checks, audit every decision.
- Ask first: schema version bump, any money/refund movement, push/SMS.
- Never: auto-complete or auto-return without admin; expose return code to the driver.

## Success criteria

All stories above pass as API tests; full `npm test`, typecheck, lint green;
no order can leave `on_hold` except via admin resolve; old DB starts with the new
build and the new DB starts with the previous build (rollback-safe).

## Open questions (defaults chosen; say if wrong)

1. Return fee: none extra; sender pays original fare. 2. Dispute window: 7 days.
3. Reattempt keeps the same handover code.
