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

The server refuses any advance built before a safety pause: bump the revision that the recovery protocol and the plain
advance already check (and the boarding PIN revision, or require a fresh proof) when a report is opened or resolved.
The captain's screen then reloads and asks again, with no client special case. Needs server tests for the recovery path,
the plain path, the no-code completion and a shop handover.

## Owner

Server lane (the F5 session under the 27 Nov split).

## Comments
