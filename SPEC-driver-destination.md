# SPEC: driver-destination (Uber Driver "destination filter")

Status: loop 12, 8 Oct 2026, owner standing instruction (Uber/Careem parity; loop without asking).

## Problem (measured)

Wind is intercity: a Nablus driver who brought a parcel to Ramallah drives home empty unless a Nablus job happens to
be on screen. `/api/jobs` lists every job the vehicle can take, and job alerts (`newJobPush`) ring for all of them,
so the driver has to scan and ignore the wrong-way ones. Uber and Careem let a driver set a destination and only
offer trips heading there.

## Design

- `users.heading_city`, `users.heading_until` (additive). `POST /api/driver/heading { city }` (driver only; a known
  city id, or `null` to clear) sets the city for 3 hours. `user.heading` on `/api/me` is `{ city, until }` while
  active, else `null`.
- While active, `/api/jobs` lists only jobs whose drop-off city is that city, and new-job alerts skip the driver for
  jobs going elsewhere. Accepting is unchanged (a job already on screen can still be taken).
- Jobs screen: a «متجه إلى» row of chips (Any + each city) under the online card; the chosen chip says until when.

Owner decision (agent default): 3 hours, no daily limit (Uber limits uses because it has surge supply; Wind needs
drivers on intercity roads), drop-off city only (pickup is wherever the driver is).

## Acceptance criteria

1. Set/clear; unknown city, non-driver refused; expires after 3 hours.
2. Jobs list and job alerts follow the destination; other drivers unaffected.
3. Chips on the jobs screen in Arabic and English.
4. Tests: `node --test`-style server test (mutation-checked); tsc, lint, `npm test`; screenshots refreshed.
