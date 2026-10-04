# Spec: cash-settlement (Wind)

Module of [CAPABILITY-MAP.md](CAPABILITY-MAP.md). Approved under the standing go-ahead of 2026-10-04.

## Objective

Wind is cash-only. The driver collects the full fare from the customer and owes
Wind its commission. Today earnings are calculations only (SYSTEM.md §10: "not
evidence of paid or settled cash"). Careem runs this as a driver cash balance
that the driver settles with a cashier. Add the same for Wind:

1. **Driver** sees what they owe Wind: commission on finished jobs (completed or
   returned) minus confirmed remittances, ± admin adjustments. They also see
   pending remittances waiting for their confirmation.
2. **Admin (cashier)** sees every driver's balance (highest debt first), records a
   cash handover with a numbered receipt (`R-000123`), and records adjustments
   with a reason (for example an unpaid fare or a dispute outcome).
3. **Two-person check:** a remittance counts only after the driver confirms it in
   the app. The driver can instead dispute it; a disputed remittance never counts,
   and the cashier records a corrected one.
4. Ledger rows are never edited or deleted; corrections are new rows. Only the
   remittance status moves pending → confirmed | disputed, once, by that driver.

## Rules

- Money is integer agorot in the ledger (`amount_cents`). Commission comes from
  each order's immutable commission snapshot (`ROUND(commission * 100)`).
- `owedCents = commissionCents + adjustmentsCents − confirmedRemittancesCents`.
- A new remittance must be > 0 and ≤ `owedCents − pendingCents` (no overpayment).
- An adjustment is a non-zero signed amount (positive = driver owes more), with a
  5–500 character reason, max ±₪10,000.
- Only drivers have balances; the target must be a driver account (any status).

## API

| Method + path | Who | Body / result |
|---|---|---|
| `GET /api/driver/cash` | driver | `{ owedCents, pendingCents, commissionCents, remittedCents, adjustmentsCents, entries[≤50] }` |
| `POST /api/driver/cash/:id/confirm` | that driver | `{ decision: 'confirm' \| 'dispute' }` on a pending remittance |
| `GET /api/admin/cash` | admin | `[{ driverId, name, phone, owedCents, pendingCents, lastRemittanceAt }]` |
| `POST /api/admin/cash/remittance` | admin | `{ driverId, amountCents, note? }` → entry with `reference` |
| `POST /api/admin/cash/adjustment` | admin | `{ driverId, amountCents, reason }` → entry |

## Data (additive, `user_version` stays 3)

`cash_entries(id, driver_id → users, kind CHECK remittance|adjustment, amount_cents INTEGER CHECK != 0,
note, status CHECK pending|confirmed|disputed, recorded_by → users, created_at, decided_at)`.
Adjustments are inserted as `confirmed`.

## UI

- Driver Earnings: "Cash with Wind" card: amount owed, pending handovers with
  Confirm / Dispute, last entries with receipt numbers.
- Admin: new "Cash" tab: driver balances, record handover, record adjustment.
- Arabic + English copy; 44-point targets; amounts in ₪.

## Commands

`npm test` · `npm run typecheck` · `npm run lint` (Expo SDK 57, Node 24, no new deps).

## Testing

`tests/cash.test.mjs` (real server, temp DB): balance from completed + returned
commission; remittance pending doesn't count until confirmed; dispute never
counts; overpay rejected; other driver cannot confirm; second decision 409;
adjustment signs and validation; role checks; admin list ordering.

## Boundaries

- Always: integer money in the ledger, server-side role checks, append-only rows.
- Ask first: payouts to drivers, digital payments, deleting ledger rows.
- Never: edit amounts after recording; count unconfirmed cash.

## Success criteria

Stories pass as API tests; `npm test`, typecheck and lint pass; additive schema.

## Open questions (defaults chosen)

1. The driver collects every fare in cash (no Wind-side collection yet).
2. No due date or blocking for unpaid balances; the cashier follows up manually.
