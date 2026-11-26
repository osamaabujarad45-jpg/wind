# Opus 5.5 independent proposal (written before reading GPT 6.2 Sol's)

> Kept as written, as evidence for the merged design. Corrections from the Haiku 5.5 review (26 Nov) are in docs/design/FLOWS-2026-11-26-one-app-profiles.md; where they differ, the design wins.

## Evidence from source
- One role per account: `users.role CHECK IN ('customer','driver','admin')`, `phone UNIQUE` (server/db/sqlite-schema.ts:14-15). A captain cannot book a ride or send a parcel with their own number; they need a second phone.
- Role is chosen at sign-up with vehicle + plate on the same form (src/app/auth.tsx:235-245; docs/screens/en/sign-up.png). Sign-up asks 6-9 fields before the person has seen a price.
- Root layout mounts separate stacks per role (src/app/_layout.tsx:127-143). Merchant mode is already inside the customer stack (MER-05) but reached only through Account → "My shop" (src/parts.tsx:525), the 10th row of the account page.
- Home shows 4 service tiles (Items & parcels, Ride, Large load, Shop delivery) under "Where to?" (docs/screens/en/home.png). "Large load" is a size of Send, not its own job.
- Merchants table already links an owner: `merchants.owner_user_id UNIQUE` (server/db/postgres-shop.sql:14). One shop per person today.

## Decisions
1. One person, one account, many profiles. Customer always exists. Captain profile (0..1) and Shop profile (0..1 now, n later) are added from inside the app and approved by an admin. Admin stays a separate, operator-enrolled account (least privilege; never a switchable profile on a personal phone).
2. Server: new `user_profiles(user_id, kind captain|merchant, status pending|active|suspended|rejected, vehicle, plate, approved_at, ...)`; `sessions.active_mode`; `POST /api/session/mode`. Every route authorizes from `sessions.active_mode` + an active profile; the client never decides. Legacy `users.role` stays as the migration source and is derived during a transition window.
3. Switch rules: captain online with no job → switching to Customer takes them offline (one confirm); captain with a job in hand → switch is refused ("Finish or release W-00042 first"); customer with an active ride → cannot go online as captain. Shop mode can switch freely (orders keep alerting on the merchant channel).
4. Switcher UI: the greeting chip on the map (already top-left of home) becomes the identity chip: avatar + mode name. Tap → bottom sheet "Switch profile" listing profiles with live badges (Captain: Offline / 2 jobs nearby; Shop: 3 new orders), plus "Drive with Wind" / "Open your shop" when absent. Long-press Account tab also opens it. A 300 ms identity transition ("You're now in Captain") with each mode's own ground: Customer = Day, Captain = Night, Shop = Day with clay accent.
5. Sign-up: everyone signs up as a person (name, phone, password; email optional). Vehicle, plate, documents move to the in-app "Drive with Wind" application. Shop details move to "Open your shop".
6. Customer home: 3 lines, not 4: Ride · Send · Shop. Large load folds into Send as the largest size. Destination-first: "Where to?" → results show ride options and send options to that place in one list (the relation between services).
7. Tabs: Customer Home/Activity/Account; Captain Drive/Earnings/Account; Shop Orders/Menu/Shop. Three each.
8. Speed: one SceneMap instance lives above the tab navigators and survives mode switches; warm map.html during the intro; cached `me` + last orders paint before network; prefetch quote when the destination is chosen; mode switch is optimistic with server confirmation.
