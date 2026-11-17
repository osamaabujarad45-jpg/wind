# Spec: generic command receipts for the remaining writes

Status: partly shipped (17 Nov): server receipt #81, A-01 #79, chat outbox #82, dispute resend #80 merged; remaining items below are ready-for-agent

> Sequencing note (17 Nov, [I]): the owner's deploy notes for the 16 Nov student host list no `WIND_DATABASE_URL` in its environment, so production most likely runs SQLite; confirm on the host before relying on it. If so, the durable `commandId` protocol and `GET /api/commands/:id` (#81) stay inactive there until production moves to PostgreSQL. Do the SQLite-compatible pieces first, which reuse each route's existing `requestId` replay:
> 1. DONE in #82 (e53fb801). Chat outbox: persist unsent messages per order (account slot) with their `requestId`; the server already replays a resent `requestId` (`server/main.ts` chat route). Restart shows "not sent yet" + resend.
> 2. ~~Driver advance/exception fallback~~ not needed: the order screen always asks `?recoveryProtocol=1` and the server returns recovery metadata on SQLite and PostgreSQL, so advance/exception always use the saved, recoverable path (`src/driver-recovery.ts`).
> 3. Shop cart order: persist the cart's `requestId` like `booking.<userId>` and reuse `pendingOutcome` (shop is off in production; lower priority).
> The generic `commandId` client adoption below follows once PostgreSQL is live.
Source: Wind research priority #1 (command recovery and durable, actor-scoped receipts), 17 Nov 2026 grilling. Decision rule: what a professional ride/delivery company ships; no trade-off questions to the owner.

## Problem Statement

A person who taps a write in Wind (accept a job, release it, make or accept an offer, send a chat message, confirm or dispute a driver cash entry, record office custody, a shop handover or refund) and loses the reply cannot find out whether it happened once the app restarts. The request id lives in memory, or there is none. Booking, the driver's advance/exception, the admin's remittance (A-01, #79), dispute resends (#80) and chat messages (#82) recover; the remaining writes listed below do not.

## Solution

Every remaining write becomes a **command** with a request id saved on the device before it is sent. After a lost reply or a restart, the app asks the server for the sender's **command receipt** and shows the outcome; with no receipt yet the command stays an **unconfirmed command** and the only action is resending it with the same id. Nothing is shown as done or failed by guess.

## User Stories

1. As a driver, I want a job I accepted just before the network dropped to show as mine (or not) after I reopen the app, so that I neither lose it nor double-take.
2. As a driver, I want a release I sent to settle as released or refused after a restart, so that I know whether the parcel is still my responsibility.
3. As a driver, I want a price offer I sent to show whether the customer can see it, so that I do not send a second, different offer.
4. As a customer, I want accepting a driver's offer to survive a lost reply, so that I am not charged a different price or left without a driver.
5. As a customer or driver, I want an unsent chat message to stay in the conversation marked "not sent yet" after a restart, so that I can resend it without typing it again and without it appearing twice.
6. As a driver, I want my confirm or dispute of a cash entry to settle after a restart, so that my balance is never argued twice.
7. As an office clerk, I want a custody hand-in to recover after a lost reply, so that a parcel is never recorded twice or lost from the chain.
8. As a merchant, I want a handover or refund to recover after a lost reply, so that money moves once.
9. As any user, I want a command receipt to be readable only by me, so that nobody learns about my orders or money from a guessed id.
10. As support, I want every resend to return the stored outcome, so that logs and audits show one decision per command.

## Implementation Decisions

- **One generic receipt endpoint (shipped in #81)**: `GET /api/commands/:commandId`, sender-scoped, reading `command_results(actor_id, command_id)` written by `versionedCommand`. Returns `{ schemaVersion: 1, commandId, state: 'unknown' | 'applied' | 'rejected', httpStatus?, error? }`. It returns the decision only, never the stored response, so it deliberately does NOT re-check role or status (unlike the replay path, which returns the body): a demoted or pending actor can still learn whether their own command applied. Another actor's id reads as `unknown` (no existence leak). It answers 409 `durable_protocol_unavailable` whenever the durable protocol is off.
- **Capability-gated**: the client sends `commandId` only when `GET /api/runtime/capabilities` reports `durableCommands` available (Postgres). Otherwise it keeps today's per-route `requestId` behaviour; SQLite answers `durable_protocol_unavailable`.
- **Order paths carry `expectedVersion`** (the protocol requires it); the client takes it from the order it last rendered. A `VERSION_CONFLICT` is a definite refusal: reload and show the current order.
- **One client module** (like `src/admin-cash-command.ts`): save before send in the account's own secure slot, one unconfirmed command per account and flow, cross-tab lock, refusal set = statuses the server returns before replay can exist, receipt lookup on screen focus. Chat keeps a small per-order outbox instead of a single slot.
- Cancel, schedule and rate already return the same answer on resend (order state is their receipt) and stay as they are. Dispute resend is fixed separately (PR #80).
- Admin cash adjustments stay on the A-01 path (`/api/admin/cash/commands/:requestId`).

## Testing Decisions

- Server (Postgres suite, `tests/commands.mjs`, shipped in #81): receipt is sender-only; unknown id → `unknown`; applied after a committed command; rejected 409 VERSION_CONFLICT after a stale-version cancel; either id case; 409 when migration 4 is absent.
- Client (pure module test like `tests/admin-cash-command.test.mjs`): saved before send; lost reply → unconfirmed and kept; refusal clears; receipt applied → settled with zero resends; capability off → no `commandId` sent.
- Screen harness tests for the driver order screen and chat: restart restores the unconfirmed command, blocks a conflicting second command, settles from the receipt.
- Phone acceptance on the A53 for accept/release/offer and chat with airplane mode toggled mid-request.

## Out of Scope

Marketplace cart/substitution flows (separate product decision); a general offline queue that sends writes later without the user (writes stay user-initiated resends).
