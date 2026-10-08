# SPEC: notification-audit (Wind)

Status: loop 50, 8 Oct 2026. Follow-up to SPEC-exception-push.md and SPEC-web-push.md. Audit: REVIEW-NOTIFICATIONS-2026-10-08.md
in the workspace root.

## Problem (measured in the code, 8 Oct 2026)

Every mutating route was read for "who waits on this change, and do they hear about it". These changes reached nobody:

1. A driver approved by support keeps waiting on the account screen.
2. A cash remittance or adjustment changes a driver's balance; a pending remittance needs the driver's confirmation.
3. A driver disputing a remittance leaves the admin who recorded it unaware.
4. A customer's dispute opens and is decided with no notice to either side; a new dispute reaches no admin.
5. A safety report (SOS) pages nobody; resolving it lifts the freeze on the driver with no word.
6. The fifth wrong handover code locks the order until an admin resets it; no admin hears of the lock, and a reset tells no driver.
7. A plan request waits for an admin; the plan result reaches nobody.
8. Support cancels a customer's order; the customer hears nothing.

## Design

Same payload rule as before: `{ kind, order, url, lang }`, no names, places, prices, reasons or codes. Pushes leave only
after the commit. A refused command still commits, so its pushes leave too (`driverCommand` flushes on failure).

| Kind | To | When | Opens | Urgency |
|---|---|---|---|---|
| `approved` | driver | admin approves a pending driver (or activates them) | `/driver` | normal |
| `support` | customer or driver | dispute decided; safety report resolved (both parties); proof reset (driver) | `/order/N` | normal |
| `cash` | driver | remittance or adjustment recorded | `/driver/earnings` | normal |
| `attention` | admins | on hold; fifth wrong code; dispute opened; plan requested | `/admin/orders`, `/admin/subscriptions` | high |
| `attention` | recording admin | driver disputes a remittance | `/admin/cash` | high |
| `safety` | admins | safety report opened | `/admin/orders` | high |
| `plan` | requester | plan activated or rejected | `/account` (driver: `/driver/account`) | normal |
| `cancelled` (existing) | customer | support cancels their order | `/order/N` | normal |

Words for every new kind are in `public/sw.js` (Arabic and English). The push test fails if a kind lacks either language.

## Acceptance criteria

1. Approving a pending driver queues `approved` to that driver only; re-approving an active driver queues nothing.
2. Recording a cash entry queues `cash` to the driver; disputing a remittance queues `attention` to the recording admin only.
3. Opening a dispute queues `attention` to every active admin; resolving it queues `support` to the customer.
4. A new safety report queues `safety` to every active admin; a repeat report queues nothing; resolving queues `support` to both parties.
5. The fifth wrong handover code queues `attention` to admins, and the four earlier misses queue nothing; a refused command still delivers it.
6. A proof reset queues `support` to the assigned driver.
7. A plan request queues `attention` to admins; activating or rejecting queues `plan` to the requester.
8. Support cancelling a customer's order queues `cancelled` to the customer.
9. Tests: `tests/push-server.test.mjs` reads each push's kind with the recipient's key; mutation-checked (removing the flush on refused commands fails the test).

## Out of scope

Native push (needs the owner's EAS and FCM setup); SMS; admin push for road reports, rating and location updates (no decision waits on them).
