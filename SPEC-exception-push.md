# SPEC: exception-push (push for delivery problems and returns)

Status: loop 49, 8 Oct 2026. Follow-up to SPEC-delivery-exceptions.md and SPEC-web-push.md. Module `push-offers`
of CAPABILITY-MAP.md (status pushes).

## Problem (measured in the code, 8 Oct 2026)

`delivery-exceptions` added three moments where someone waits on someone else, and none of them queues a push
(`server/main.ts`: `reportException`, `POST /api/admin/orders/:id/resolve`):

1. A driver reports a delivery problem → the order goes `on_hold`; the sender hears nothing.
2. Support resolves it → `reattempt` puts the job back in the driver's hands silently; `return` moves the order to
   `returning`, where the sender must give the driver a return code they only see in the app.
3. `confirm_return` closes the order as `returned`; the sender hears nothing.

## Design

Same payload rules as today: `{ kind, order, url, lang }`, no names, places, prices or reasons. Pushes leave only after
the commit (the existing outbox).

| Kind | To | When | Words (en / ar) | Urgency |
|---|---|---|---|---|
| `on_hold` (new) | sender | driver reports a problem | "Delivery problem: support will contact you" / "تعذّر التسليم؛ سيتصل بك الدعم" | high |
| `in_transit` (existing) | sender | `reattempt` | existing line | normal |
| `returning` (new) | sender | `return` | "Your order is being returned: open the app for the return code" / "سيُعاد الطلب إلى المرسل؛ افتح التطبيق لرمز الإرجاع" | high |
| `returned` (existing) | sender | `confirm_return` | existing line | normal |
| `decided` (new) | assigned driver | every admin decision | "Support decided on a delivery problem" / "قرر الدعم في مشكلة التسليم" | high |

The driver line is one generic `decided` kind: the job card already shows which decision was made.

## Acceptance criteria

1. Reporting a problem queues `on_hold` to the sender only; a replayed report queues nothing.
2. `reattempt` queues `decided` to the driver, then `in_transit` to the sender.
3. `return` queues `decided` to the driver, then `returning` to the sender.
4. `confirm_return` queues `decided` to the driver, then `returned` to the sender.
5. The service worker words the three new kinds in Arabic and English (a missing word would fall back to the generic
   "new message" line, so a test checks the file).
6. Tests: a block in `tests/push-server.test.mjs` captures the outbox for each rule; mutation-check that dropping one
   queue call fails the test.

## Out of scope

Native push (needs the owner's EAS and FCM setup); SMS to the recipient (provider-gated).
