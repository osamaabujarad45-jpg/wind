# SPEC: offer-alerts (push for driver offers)

Status: loop 15, 6 Oct 2026. Follow-up to SPEC-driver-offers.md, which left "push notification for a new offer" out of
scope.

## Problem (measured in the code, 6 Oct 2026)

`driver-offers` added two moments where someone is waiting on someone else, and neither sends a push:

1. A driver offers a price → the customer is only told if the order screen is open (it polls every 4 s).
2. The customer accepts an offer → `POST /api/orders/:id/offers/:driver/accept` assigns the driver but queues **no**
   push. Accepting at the recommended price (`/api/jobs/:id/accept`) pushes the customer `assigned`; the offer path
   tells nobody. The driver who offered has usually left the jobs screen and does not know the job is theirs, while the
   customer now waits for a driver who is not moving.

Web Push (SPEC-web-push.md) already reaches the web/home-screen app with no provider. Native apps still poll (Expo
push needs an EAS project: provider-gated, unchanged).

## Design

Two new push kinds, same payload rules as today (`{ kind, order, url, lang }`, no names, prices or places):

| Kind | To | When | Words (en / ar) | Urgency, TTL |
|---|---|---|---|---|
| `offer` | the customer | a driver makes a **new** offer on a searching order (a driver changing their own price does not re-alert) | "A driver offered a price" / "عرض سائق سعراً لطلبك" | high, 600 s (offers expire after 10 min) |
| `offer_accepted` | the driver | the customer accepts that driver's offer | "Your price was accepted: go to pickup" / "قُبل سعرك: توجّه إلى الاستلام" | high, 3600 s |

- Accepting an offer also pushes the customer nothing new (they just tapped it), and pushes no other driver: their
  offers are dropped silently, as an `already_taken` job is today.
- Notifications collapse per order (`tag order-N`), so five offers on one order show as one updated notification.
- `offer_accepted` opens `/order/N` (the driver's active job); `offer` opens the customer's `/order/N` (offer list).

## Acceptance criteria

1. A first offer from a driver queues `offer` to the customer; the same driver changing their price does not.
2. Accepting an offer queues `offer_accepted` to that driver only.
3. The payload carries no price, name or place; the service worker words both kinds in Arabic and English.
4. Existing kinds and the jobs/accept path are unchanged.
5. Tests: integration test captures the outbox (as push-server.test does) for both rules; mutation-check each rule.

## Out of scope

Native push (needs EAS project, owner); a sound or vibration pattern per kind.
