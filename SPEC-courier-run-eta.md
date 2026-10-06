# Spec: courier-run-eta (Wind) — honest arrival times when a courier carries many parcels

Loop 19, 6 Oct 2026. Wrong logic found under the owner's standing "fix wrong logic wherever found" instruction.

## Problem (measured in code)

Loop 17 (SPEC-parcel-standard.md) lets a courier carry up to 200 parcels at once. Arrival times were still built for
one job per driver: the customer's order page (`useRoad` → `/api/route` from the driver fix to *this* order's stop) and
the public tracking page (`/api/track/:token/eta`) both show "Driver arrives in 3–6 min" and a blue straight-to-you
approach line, even when the courier has 40 other stops first. Wind has no stop order to compute a true ETA from.

## Design

- Server: each order carries `sharedRun: boolean`, true while its driver has **other** active orders
  (`assigned`, `at_pickup`, `in_transit`, `on_hold`, `returning`). Shown to the order's customer and driver only.
  It reveals no count and nothing about the other orders.
- Customer order page: with `sharedRun` no minute ETA and no approach line (the live driver position and the trip's
  road line stay); one line instead: "The courier is delivering other parcels on this run. Follow them on the map."
- Public tracking page: `/eta` returns `{ minutes: null, sharedRun: true, road }` (no approach line) and the page shows
  the same line.
- When the other orders finish, `sharedRun` turns false and the normal ETA comes back on the next refresh.
- Rides and freight are exclusive (canTake), so this only affects parcels. Driver screens are unchanged.
- `ponytail:` no stop sequencing; a real "N stops before you" needs the driver to order the run (later, if asked).

## Acceptance criteria

1. A courier with two parcels: both customers' orders say `sharedRun: true`; their `/track/.../eta` gives
   `minutes: null`, `sharedRun: true`, no `approach`.
2. After the other parcel is delivered, the remaining order says `sharedRun: false` and `/eta` returns minutes again
   (with OSRM; without OSRM routing is skipped as today).
3. A driver with one job: `sharedRun: false` (unchanged behaviour).
4. App: order page and public page show the run line and no minutes with `sharedRun`; English and Arabic copy.
5. Tests in `tests/parcels.test.mjs`; mutation-checked.
