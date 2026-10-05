# SPEC: road-aware-eta (Wind)

Follow-up of SPEC-routing-eta.md / SPEC-road-status.md listed first in HANDOFF-2026-10-05.md. Lifecycle: spec → plan → build → test → review → ship.

## Problem
The order screen says "Driver arrives in 12–18 min" from OSRM road time. Drivers already report checkpoints as
`slow`/`closed` (Roads screen), and the booking screen warns about them — but once the trip is live the ETA ignores
them. A customer whose driver is stuck at a closed checkpoint sees a confident range that is wrong.

## Design
- Order screen, while the ETA line is shown: read `/api/roads` (already public to signed-in users, 60 s poll) and pick
  checkpoints touching the trip's pickup or drop-off city with a recent `slow`/`closed` report — the same rule the
  booking screen uses, moved into one helper `roadAlerts(roads, cities)` in `src/road.ts` and used by both screens.
- With an alert, the ETA wording changes: the upper bound is dropped ("Driver arrives in 12+ min" /
  "يصل السائق خلال 12+ د"), and one caption line under it names the checkpoints ("Huwwara: Closed · Za'tara: Slow"),
  tappable to Roads. No extra server work, no new data exposure (same list Roads already shows).
- No alert → today's wording unchanged.
- Public tracking page (no account): unchanged. ponytail: add a `delay` flag to `/api/track/:token/eta` if recipients ask.

## Acceptance
- AC1 `roadAlerts` returns only `slow`/`closed` checkpoints touching either city (unit test, also covers `open`/null/unrelated).
- AC2 Booking warning behaves as before (screenshot unchanged).
- AC3 Order screen with a closed checkpoint on the route shows "N+ min" and the checkpoint line; without, the range.
- AC4 Verified on the connected Samsung A53 (`R5CTB0FJP9Z`) with a debug build talking to a **local** API over
  `adb reverse` and seeded local accounts — never production.
- AC5 `npm test`, `npx tsc --noEmit`, `npx expo lint`, `npm run screens` green.
