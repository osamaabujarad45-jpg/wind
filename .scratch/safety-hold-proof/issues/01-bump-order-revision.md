Status: ready-for-agent

# A safety pause must invalidate proof gathered before it

Found 28 Nov 2026 by two independent delta reviews of the design branch. The behaviour predates that branch.

## Problem

Opening and resolving a safety report changes `safety_incidents` only (`server/main.ts`, `POST /api/orders/:id/sos` and
`POST /api/admin/incidents/:id/resolve`). The order row, its recovery revision and the boarding PIN revision stay the
same. So anything gathered before a pause is still accepted after support lifts it:

- a typed PIN or delivery code, a door-cash amount and reason, and shop seal checks, still on the captain's screen
  (`src/app/order/[id].tsx`);
- a saved recovery command that replays after reconnecting (`src/driver-command.ts`);
- an already open "the rider has no code" confirmation, whose Yes completes the ride;
- a screen that was offline for the whole pause and never saw it.

## Why this is not a screen fix

A client-side reset was tried (commit 0322816f) and removed: it cannot see a pause it missed, does not reach saved
commands or open dialogs, and cleared a PIN while the plain send path still held the field locked for a retry.

## Wanted

The server refuses any advance whose intent started before a safety pause. A revision bump alone is not enough:

- the plain advance sends only `expectedStatus` and, for boarding, the PIN revision; the server checks
  `expectedVersion` for recovery commands only (`server/main.ts`);
- the recovery path fetches a fresh order and stamps the command with its new version (`src/driver-recovery.ts`), so a
  confirmation opened before the pause would still pass;
- the screen's draft key (`proofContext`) does not include the recovery version.

So each path (plain request, recovery command, typed drafts, open confirmation) has to carry, from the moment the
captain started the action, a value that a pause changes (a safety or order revision), and the server has to check it.
Bump the boarding PIN revision too, or require a fresh proof. Needs tests for the recovery path, the plain path, the
no-code completion opened before the pause, and a shop handover. The client change that sends the original value is
part of this work.

## Owner

Server lane (the F5 session under the 27 Nov split).

## Comments
