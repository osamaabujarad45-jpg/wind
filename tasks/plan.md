# Plan: referral (SPEC-referral.md)

1. R1 (server): tables `referral_codes`, `referrals`, `promo_owners`; `promoFor` falls back to invite codes and enforces owned
   codes; `createOrder` records the referral; `advance` to completed issues the inviter's reward once; `GET /api/me/referral`;
   promo create refuses invite-code names; deletion drops the code. TDD with `tests/referral.test.mjs`.
2. R2 (client): AccountScreen invite card (code, Share, joined/earned, credits); booking chip to apply a credit; copy ar/en; docs; screens.
Checkpoint after each: npm test, tsc, lint, commit.
