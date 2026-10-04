# Spec: trip-share-link (Wind)

Module of [CAPABILITY-MAP.md](CAPABILITY-MAP.md). Approved under the standing go-ahead of 2026-10-04.

## Objective

Uber/Careem let a rider or sender share a live trip link; the recipient follows it
in a browser without an account. PRODUCT.md U6: "share a ride or delivery tracking
link; recipient does not need an account".

1. **Customer** on an open order (searching → returning) taps "Share tracking". The
   server issues a random link token (256-bit); the app opens the phone's share sheet
   with `https://<wind origin>/track/<token>`. Sharing again rotates the token, so an
   old link stops working. "Stop sharing" revokes it.
2. **Anyone with the link** sees: status, service, pickup/drop-off *cities*, driver
   first name and vehicle type, live driver position when fresh (≤120 s, active
   statuses only), last-update age. Never: phones, notes/landmarks, codes, prices,
   customer name, exact pickup pin.
3. After the order finishes (completed, returned, cancelled) the link shows only the
   final status for 24 hours, then returns 404.

## API

| Method + path | Who | Result |
|---|---|---|
| `POST /api/orders/:id/share` | order customer | `{ token, url }` — rotates; 409 on finished orders |
| `POST /api/orders/:id/share/revoke` | order customer | `{ ok }` |
| `GET /api/track/<64 hex>` | public | limited view above; 404 for unknown/revoked/expired |

Only the SHA-256 of the token is stored (`orders.share_token_hash`, unique),
plus `share_created_at`. Additive columns, `user_version` stays 3.

## UI

- Order screen (customer, open order): "مشاركة التتبع / Share tracking" + "إيقاف المشاركة".
- Public web route `/track/[token]`: calm status card, progress, map/diagram, driver
  first name + vehicle, "updated N s ago", polls every 10 s, AR/EN by device.

## Testing

`tests/share.test.mjs`: owner-only creation; rotation invalidates old token; revoke;
public view has no PII fields; location only when fresh and active; terminal → status
only; 24 h expiry; malformed token 404; finished order cannot be shared.

## Boundaries

- Always: hash tokens at rest; public view is an allowlist of fields.
- Never: expose phones, codes, notes, price or customer identity publicly.

## Success criteria

Tests pass; typecheck/lint; web export; browser check of the public page signed out.
