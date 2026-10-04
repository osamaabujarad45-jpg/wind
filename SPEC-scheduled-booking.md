# Spec: scheduled-booking (Wind)

Module of [CAPABILITY-MAP.md](CAPABILITY-MAP.md). Approved under the standing go-ahead of 2026-10-04.

## Objective

Careem/Uber "Schedule" lets a customer book a pickup for later (an early ride to the
checkpoint, a parcel collected after work). Wind only books "now".

1. **Book for later:** on the booking screen choose *Now* or *Later*; Later offers the next
   7 days and times every 30 minutes, at least 60 minutes ahead. The price is quoted and fixed
   at booking time, as today.
2. **Release:** a scheduled order stays `searching` but is invisible to drivers until 30 minutes
   before pickup; then it appears in the jobs list like any other order (with its pickup time).
3. **Manage:** the customer sees "Scheduled for <day, time>" on the order and can cancel until a
   driver accepts (existing rule).
4. **Server rule:** `scheduledFor` must be an integer epoch-ms between now+30 min and now+7 days
   (the extra 30 min of client margin absorbs slow submits); otherwise `400 invalid_schedule`.

## API / data

`POST /api/orders` accepts optional `scheduledFor`. Orders expose `scheduledFor: number | null`.
Additive column `orders.scheduled_for`; `user_version` stays 3. Jobs and driver order reads apply
`scheduled_for IS NULL OR scheduled_for <= now + 30 min`.

Rollback note: the previous build ignores the column and would show scheduled orders to drivers
immediately — roll back only when no future scheduled orders exist.

## Testing

`tests/schedule.test.mjs`: bounds (too soon, too far, non-integer); stored and returned; hidden from
driver jobs and direct reads until release; visible after; accept works; customer cancel; immediate
orders unchanged.

## Success criteria

Tests, typecheck, lint, screenshots, browser check of Now/Later and the scheduled order card.
