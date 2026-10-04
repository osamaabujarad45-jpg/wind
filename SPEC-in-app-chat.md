# Spec: in-app-chat (Wind)

Module of [CAPABILITY-MAP.md](CAPABILITY-MAP.md). Approved under the standing go-ahead of 2026-10-04.

## Objective

Careem/Uber let rider and captain message inside the trip ("I'm at the gate", "2 minutes") without
calling — cheaper on Palestinian mobile plans, usable at checkpoints, and kept on record for support.
Wind only offers phone calls.

1. **Who:** the order's customer and its assigned driver. Administrators can read (support/disputes),
   not write.
2. **When:** sending is open while the order is active (`assigned` → `returning`). Afterwards the thread
   stays readable for the parties for 24 hours, and for administrators always.
3. **What:** text up to 500 characters; quick replies ("On my way", "I've arrived", "Please call me",
   "Running late"). No attachments or links preview.
4. **Limits:** 30 messages per person per 10 minutes.
5. **Privacy:** messages never appear on the public tracking link. Account deletion replaces the
   person's messages with a placeholder.

## API

| Method + path | Who | Result |
|---|---|---|
| `GET /api/orders/:id/messages` | parties (≤24 h after finish), admin | `[{ id, mine, role, body, createdAt }]` oldest first (≤200) |
| `POST /api/orders/:id/messages` `{body}` | parties, active order | the list; 409 `chat_closed` otherwise |

Table `order_messages` (additive; `user_version` stays 3).

## UI

Order screen card "Messages" for the parties during an active order: recent messages (role label,
time), quick-reply chips, input + send (≥44 px), polite live region for new messages; polls every 5 s
while focused. Admin order view shows the thread read-only.

## Testing

`tests/chat.test.mjs`: customer↔driver exchange; stranger/other driver 404; searching order 409; admin
read-only (POST 403); length/empty 400; rate limit 429; closed after finish; read window 24 h; deletion
placeholder; not exposed on /api/track.

## Success criteria

Tests, typecheck, lint, screenshots; browser check of a two-sided exchange.
