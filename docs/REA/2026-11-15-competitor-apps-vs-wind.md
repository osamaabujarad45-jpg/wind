# Competitor demo apps vs Wind — 15 November 2026

Source data: `C:\Users\osama\OneDrive\Documents\wind-competitors` (14–15 Nov). It holds five original public-demo apps, each
built to make one competitor's mechanisms concrete: WindRide (Uber), WindCaptain (Careem Captain), WindBazaar (HAAT),
WindParcel (Shiply) and WindMarket (Souq). Each has a `HANDOFF.md`, and there is also `FABLE-MISSION-ADDENDUM.md` and `LEDGER.md`.
No competitor code was copied. This page checks each mechanism against Wind's code at `origin/master` (b89f220), file by file.

**Bottom line:** Wind already implements almost every mechanism the five demos encode, usually with stronger server-side
enforcement than the demos. What remains is operations (hosting, APK, alerting), one search defect, and an
owner decision on the driver cash cap. Feature-count parity is not the release target (13 Nov cutoff, Batch 4.5).

| Mechanism (demo) | Wind today | Evidence | Action |
|---|---|---|---|
| Idempotent create, no automatic create retry (WindRide) | Done: a quote is consumed once (`409 quote_consumed` on reuse) and a committed replay returns the same order (FABLE addendum §7) | `server/main.ts:1515` | None |
| One active job per driver, resume after restart (WindRide, WindParcel) | Done on the driver side: one active job until batching is approved | `server/main.ts:2326` | None |
| Delivery proof code, lockout after N misses, admin reset (WindMarket) | Done: handover code shown only to the order's owner; 5 misses lock it and alert admins | `server/main.ts` `PROOF_FAILED`, `proof_locked` | None |
| Typed delivery failure → admin review → reattempt/return (WindMarket, WindParcel) | Done: `exceptionReasons`, `on_hold`, admin `reattempt / return / confirm_return`, sender return code | `server/main.ts` `reportException`, `/api/admin/orders/:id/resolve` | None |
| Cash on delivery: collect, remit, resolve, commission in the total (WindParcel) | Done: `/api/orders/:id/cod{,/collect,/remit,/resolve}` | `server/domain/payments.ts` | Keep card payments off (Batch 2.4) |
| Append-only cash ledger, actor and time server-side, corrections (WindMarket) | Done: balanced journals, pending/confirmed/disputed remittances, admin resolution with reason | `server/domain/ledger.ts`, `cash-ops.ts` | Finish the sandbox reconciliation run (Batch 4.2.1) |
| **Driver cash debt blocks new cash work** (WindCaptain arrears) | **Built, switched off**: `cashCapActivated: false`, cap ₪1,000; enforcement needs the PostgreSQL `FOR UPDATE` path | `server/domain/ledger.ts:113-116`, `eligibility.ts:21` | **Owner decision.** This is the strongest real-money control for a cash-only pilot. Activating it on SQLite needs a small enforcement change and a two-vendor review (money path) |
| Human, actor-named order states plus next step (WindBazaar) | Done: Arabic and English per role (`السائق عند نقطة الاستلام`), with `next_*` guidance | `src/copy.ts:358-379, 502-509` | None |
| Landmark-first address, confirm pin, saved places (WindBazaar, WindCaptain) | Done: landmark field, pin sheet, saved/recent places, a town tap forces a pin | `src/app/book.tsx`, `src/pin-sheet.tsx` | None |
| **Search finds the place people type** | **Defect**: English `bireh` never found Al-Bireh city | `server/domain/place-index.ts` | **Fixed in PR #32** |
| Weighted grocery items, substitutions (WindBazaar, WindMarket) | Not applicable: Wind delivers parcels, not shop baskets | — | None until a shop service is scoped |
| Hub custody scans (WindParcel) | Not applicable: point-to-point courier, no hubs | — | None |
| Ride tiers, surge (WindRide) | Rides exist; the pilot enables only `parcel` (`WIND_ENABLED_SERVICES=parcel`) | production env | None |
| Fail-fast Maps key, blank-map prevention (all five) | Wind's baseline map is MapLibre/OpenFreeMap and needs no key; Google is an opt-in with a build-time check | `app.config.js` | None. The five demos' blank maps are a Google key restriction on the owner's side (see `LEDGER.md`), not a Wind issue |

## What the demos taught that Wind should keep doing

- A timer never collects cash or creates driver income: only an explicit collection does (WindCaptain). Wind's ledger posts
  only on a confirmed handover.
- A role switch is not authentication (FABLE addendum §8). Wind's roles come from server sessions.
- A rejected command never returns a success ID, and a lost response is resolved by the server's idempotency, never by a
  client retry (all five).

## Owner-side items found in this data

- **Rotate the Google Maps key** that the other session's archive exposed (FABLE addendum §9). If the five demos should show
  maps, whitelist their five package/SHA-1 pairs (`LEDGER.md`). Wind itself does not use that key.
- **Cash cap:** decide whether drivers holding more than ₪1,000 (or another amount) of uncollected cash are blocked from
  new cash jobs. If yes, it is a small change plus a two-vendor review.
