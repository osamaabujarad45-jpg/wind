# Spec: web-push (Wind) — notifications without a provider account

Module `push-offers` of [CAPABILITY-MAP.md](CAPABILITY-MAP.md). Native push needs an EAS project (the owner's choice);
the web app (also the iPhone home-screen app) can use standard Web Push today with self-generated VAPID keys.
Approved under the standing go-ahead of 2026-10-04.

1. **Opt in per browser** from the account screen ("Notifications on this device"), only where the browser supports
   Web Push (iPhone: after adding Wind to the Home Screen). Turning it off, signing out or deleting the account stops it.
2. **Customers** hear when a driver accepts, arrives at pickup, starts the trip, delivers or returns, and on new chat messages.
   **Drivers** hear about chat messages and new jobs their vehicle can take while they have no active job (up to 100 drivers a job).
3. **Privacy:** the encrypted payload holds only a kind, an order number and a link; the service worker words it in the
   language chosen when subscribing. No names, addresses or message text.
4. **Safety:** subscriptions are accepted only for the browsers' push services (no arbitrary URLs: SSRF); pushes are sent
   only after the request's transaction commits; gone subscriptions (404/410) are removed; failures never affect the request.

## API

`GET /api/push/key` (public) → `{ key }`; `POST /api/push/subscribe` `{endpoint, p256dh, auth, lang}`; `POST /api/push/unsubscribe` `{endpoint}`.
Tables `push_keys`, `push_subscriptions` (at most 5 per user). Encryption RFC 8291 (aes128gcm), VAPID RFC 8292, in `server/push.ts`.

## Testing

`tests/push.test.mjs`: RFC 8291 Appendix A vector, VAPID signature, endpoint allowlist; subscribe validation; events reach the
right people (mocked push service) only after commit; 410 removes; unsubscribe.
