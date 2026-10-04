# Tasks: delivery-exceptions

- [x] T1: Add `on_hold`, `returning`, `returned` to `OrderStatus`; `activeStatuses` includes on_hold/returning; server SQL active lists derive from it.
  - Acceptance: on-hold driver cannot accept another job; GPS accepted; account deletion blocked.
  - Verify: tests/exceptions.test.mjs, model test. Files: src/model.ts, server/main.ts
- [x] T2: `POST /api/orders/:id/exception` (idempotent) + `POST /api/admin/orders/:id/resolve` (reattempt|return), audited; return code generated on return.
  - Acceptance: rides rejected; only assigned driver; only from in_transit / on_hold; replay safe; customer cannot cancel.
  - Verify: tests/exceptions.test.mjs. Files: server/main.ts, tests/exceptions.test.mjs, package.json
- [x] T3: `advance` from `returning` → `returned` with return code, lockout + admin proof-reset; earnings/stats include returned.
  - Verify: tests/exceptions.test.mjs. Files: server/main.ts, src/model.ts
- [x] T4: Disputes: customer open (7 days, one per order), admin list + resolve.
  - Verify: tests/exceptions.test.mjs. Files: server/main.ts, src/model.ts
- [ ] T5: Client UI: driver report/return code, customer return code + dispute, admin on-hold resolve + disputes; AR/EN copy.
  - Verify: typecheck, lint, test, web export. Files: src/api.ts, src/copy.ts, src/driver-work.tsx, src/app/order/[id].tsx, src/app/admin/orders.tsx
