# Spec: referral (Wind) — second slice of `promo-referral`

Module of [CAPABILITY-MAP.md](CAPABILITY-MAP.md). Approved under the standing go-ahead of 2026-10-04.

## Objective

Careem and Uber grow through "invite a friend, you both get a discount". Word of mouth is how services spread in
Palestinian towns, so Wind should reward it. This builds on promo codes (SPEC-promo-codes.md): every discount
is paid by Wind through the driver cash ledger, so drivers never lose money.

1. **Invite code:** every customer has a personal invite code (`W` + 5 letters/digits), shown on the account
   screen with a share button and how many friends joined and how many rewards were earned.
2. **Friend's first order:** a new customer types the invite code in the same booking field as promo codes.
   It applies only to their first order (no earlier non-cancelled order) and never to their own code. The friend
   gets ₪10 off (fare never below ₪1). A cancelled first order frees the invite for the next booking.
3. **Reward:** when that first order is completed (delivered with the handover code, or a finished ride), the
   inviter gets a personal one-use ₪10 code valid for 90 days. Only the inviter can use it. It is listed on
   their account and offered on the booking screen with one tap.
4. Invite codes and promo codes share one namespace; an admin cannot create a promo code equal to an invite code.
5. Account deletion removes the person's invite code (it stops working) and leaves past orders unchanged.

## API

| Method + path | Who | Result |
|---|---|---|
| `GET /api/me/referral` | customer | `{ code, reward, joined, earned, credits: [{code, amount, expiresAt}] }` |
| `POST /api/promos/check` | customer | accepts invite codes too |
| `POST /api/orders` `+ {promoCode, expectedDiscount}` | customer | accepts invite codes too |

Tables `referral_codes (user_id, code)`, `referrals (referee_id, referrer_id, order_id, reward_promo_id)`,
`promo_owners (promo_id, user_id)`. Additive; `user_version` 3.

## Testing

`tests/referral.test.mjs`: code is stable per user; own code refused; second-order refused; cancel frees;
discount and ledger; reward only on completion, once; reward code usable only by the inviter, once; promo
code cannot shadow an invite code; deletion disables the code; stats.

## Success criteria

Tests, typecheck, lint, screenshots; browser check of sharing, applying and the one-tap credit.

## Ship review changes

- Rewards are capped at 5 per inviter per 30 days (farming with throwaway accounts; phone verification is the real fix once SMS exists).
- A blocked or deleted inviter's code is refused; deleted codes are kept as tombstones and never reissued.
- Booking with a code shares the 20-per-hour code-check budget; a second order gets `invite_first_order_only`.
- A used credit leaves the booking chip after a refusal.
