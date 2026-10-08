# SPEC: run-sheet (courier route sheet)

Status: loop 18, 8 Oct 2026, owner standing instruction (courier parity; loop without asking).

## Problem (measured)

Production Wind is parcels only and a courier may carry up to `PARCEL_LOAD` (200) parcels (owner: 100+). The driver's
Trips screen listed active orders flat, newest first, so a courier with 40 parcels for five cities scrolled one list
to find "everything for Nablus" or "what do I still have to collect". Courier companies hand drivers a run sheet
grouped by stop.

## Design (client only)

- `runSheet(orders)` (src/model.ts, shared): active orders grouped by stage, then city:
  pickups (`assigned`, `at_pickup`) by pickup city; deliveries (`in_transit`, `on_hold`) by drop-off city; returns
  (`returning`) by the sender's pickup city. Stages in that order; inside a stage the biggest city group first;
  orders by id. Finished orders are left out.
- Trips screen: a heading per group, «تسليم في نابلس · 12», with the same order rows under it.

## Acceptance criteria

1. Unit test covers stage mapping, grouping, ordering, empty input (mutation-checked).
2. Trips screen shows the groups in Arabic and English; tsc, lint, `npm test`, screenshots.
