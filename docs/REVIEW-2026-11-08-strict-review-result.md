# Strict review result — 8 November 2026

Branch `fix/strict-review-20261108`, baseline `92b1cd2`, review window `747f601..92b1cd2`. All changes are **uncommitted** in this worktree; nothing was committed, pushed or deployed.

## Gates (k5, DESKTOP-S2JKMK5, isolated folders, own PostgreSQL ports)

| Source | Folder / PG port | lint | typecheck (app + server) | npm test | persistence | Azure IaC |
|---|---|---|---|---|---|---|
| Baseline `92b1cd2` (hash-verified tar) | `C:\wq-strict-review-1108` / 55513 | pass | pass | 128/129 ran; `azure-infra` failed only because k5 had no Bicep; rerun with Bicep 0.48.1: `azure-infra` + `ops-sqlite` pass | pass | pass |
| Fixed source (final) | `D:\wq-strict-fix-1108` / 55514 | pass | pass | **129/129** | every suite passes; 5 load flakes passed on isolated rerun (below) | pass (in npm test) |

The final run on the last edits is recorded in `logs\gate.log` of the fixed folder. One intermediate fixed-source run failed persistence in `eligibility-review` with `Connection terminated due to connection timeout`; `logs\pg.log` shows a 266 s checkpoint (sync 102 s, later 492 s) at that moment — k5's disk, not code. The final run starts that disposable test database with `fsync=off, synchronous_commit=off, full_page_writes=off` so disk stalls cannot trip the 1 s pool connect budget.

**Final source, final run:** lint pass, typecheck pass, npm test 129/129. Persistence: during the last runs k5 sat at 68–100 % CPU from another session's SmartStore Playwright/Electron gate and another Wind PostgreSQL (55485), so `check-persistence` (which stops at the first failure) hit random API-child connect timeouts. A runner that continues past failures (`persist-rest.mjs`) on fresh pgdata passed 52 of 55 suites; the 3 failures (`phone-identity-authority`, `pg-cancel-race`, `ride-lifecycle`, all "Connection terminated unexpectedly" in the API child) passed when rerun alone. The legacy check failed `promo` (connect timeout) and `route` (`/track/…/eta` 500 under load, local fake OSRM); both passed alone. One of my own reruns also collided with an earlier one on the same pgdata (my error), and was discarded. Logs: `D:\wq-strict-fix-1108\logs\persist-fresh.log`, `persist-retry.log`, `persist-legacy.log`. k5's C: drive had ~1 GB free, so fixed-source work lives on D:. No browser/screenshot gate was run (see "Not done").

## Reviewers

| Requested | How it ran | Result |
|---|---|---|
| Haiku 5.5 (UI/booking) | Claude subagent, xhigh | 17 findings |
| Step 5 Preview (booking races) | `opencode run --agent plan -m nvidia/stepfun-ai/step-5-preview#max` | 4 × P3, no P0–P2 |
| Mistral Large (security/data/evidence) | `opencode … nvidia/mistralai/mistral-large-4-1t-a52b#high` | 6 × P3, no P0–P1 |
| Kimi K3.1 Pro (design) | `opencode … kimi-pool/kimi-k3.1-pro#high` | **Blocker reproduced**: `invalid JSON body` whenever it opens a PNG. Text-only rerun succeeded: 8 findings |
| (extra) Sonnet 5.5 (server security) | Claude subagent, max | 14 findings, none critical |

T3 `delegate_task`/`device_open` are not exposed in Claude Code; reviewers ran through the opencode CLI and the phone through adb.

## Fixed (each with a regression check that fails on the old source)

| Issue | Source | Fix | Check |
|---|---|---|---|
| Lost-connection booking said "can't reach Wind", never "saved on this device", and never armed the deadline re-check, so Edit/Discard stayed locked | Haiku 1+3 | `book.tsx`: `ApiError('network')` treated as transport; any uncertain failure reads the receipt | `booking-session-actions` (2 new cases); phone: offline submit → saved card → Retry → one order |
| Freight window shown ≠ window declared and priced | Haiku 5 | one `windowStart` for both | `booking-freight-fields` |
| Recovery status changes silent to screen readers | Haiku 9 | live region | `booking-recovery-actions` |
| Order actions (accept/cancel/arrive) could double-send on two fast taps | Haiku 16 | synchronous ref guard | `phone-ui` |
| Map canvas label told phone users to "use arrow keys" and to place a pin on route maps | Haiku 15 | mode-aware label | `map-security` |
| Screenshots captured blank maps / "calculating" prices | Handoff, Haiku 7/8 | `screens.mjs` waits for loaded tiles (re-checks late-mounting maps) and for the price | syntax + review (not run, see below) |
| Booking error rendered after the last field, far from the pending card | Kimi 1 | error moved to sheet header | `map.test` |
| Booked-ahead order: closed sheet was a bare grip | Phone (A53) | booked time in header until pickup (also Kimi 5) | `map.test`; phone screenshot |
| Booked time vanished in last 30 min | Kimi 5 | same header row keyed on `scheduledFor` | `map.test` |
| Failed quote still said drivers can accept "this price" | Kimi 7 | hint hidden on failure | review |
| Arabic route labels announced → | Kimi 8 | ← in RTL | review |
| Chat/stars/Send/Recenter/Apple Retry < 48 dp | Kimi 2/3 | 48 dp | `phone-ui` |
| Pin modal promised a search box it lacks | Kimi 4 | modal-specific copy (AR/EN) | `phone-ui` |
| "Complete the marked fields" banner stayed after the field was fixed | Phone (A53) | clears with last marked field | `map.test`; phone before/after |
| Home "current order" hid a live trip behind a newer booked-ahead search | Phone (A53) | live trips sort first | `phone-ui`; phone screenshot |
| Recovery 409 reloaded the order twice | Step 1 | one reload in catch | `phone-ui` |
| `clear()` ordering invariant undocumented | Step 4 | comment | — |
| Restore: Ctrl-C/SSH drop after `docker stop` left service down | Mistral 4 | signal trap → put back | `backup.test`; `sh -n` |
| Reset deleted any Firebase user with the email | Mistral 3 | only `wind-*` users; create fails closed otherwise | `firebase-reset` |
| README claimed reset needs a verified email | Sonnet 2 | corrected | — |
| Second-pass review of this diff (Haiku 5.5, xhigh): restore trap stayed armed during the readiness wait and could undo a good restore | Haiku R2-1 | `trap -` right after the swap | `backup.test` |
| Screens tile guard trusted `areTilesLoaded()`, which counts errored tiles | Haiku R2-2 | map.html exposes `windBaseTile` (the same flag the app trusts); screens waits on it | review |
| Narrow booking capture accepted a failed quote | Haiku R2-3 | assert no `quote_failed` | review |
| Home-sort check re-implemented the comparator locally | Haiku R2-4 | removed; source assertion kept | — |
| Roads pin failure told admins to "describe the landmark" (no such field) | Haiku R2-5 | `roadPinUnavailable` (AR/EN) | `phone-ui` |
| Reset create failing closed was silent | Haiku R2-6 | logged as `email_provider_failed` | review |
| Banner clear compared translated text | Haiku R2-8 | ref flag, reset on each submit | `map.test` |

## Refuted / answered (no change)

- Kimi K3.1 "invalid JSON" was not a prompt problem: provider rejects image payloads.
- Haiku 10 (quote failure twice): second copy only under an opened promo field, by design.
- Step "toOrders may drop a batch": `Promise.all` rejects the whole request; nothing silent.
- Kimi 6 (map loading silent): overlay is decorative; the only map-dependent control announces its wait reason.
- Mistral 1 / Sonnet 14 (24 h cache on `/map/v1/map.html`): deliberate (`362e739`, production probe pins it). A map.html fix reaches phones within a day unless the path version is bumped — applies to this branch's map.html change.
- Parcel tile "opened freight": my scripted tap, not a bug.

## Open, needs owner decision

1. **Staff roles not enforced on broad admin routes** (Sonnet 3; WP15 gate G6): any admin can reset any user's password or record cash. Needs a role→route policy.
2. **Firebase reset with unverified email** (Sonnet 1, owner-accepted for pilot): mistyped email can lose the account.
3. Firebase cross-process double send (Mistral 2), adoption-race 401 (Mistral 6), deletion retention vs privacy page (Sonnet 7), PG-only paths untested on PG (Sonnet 8), phone guard bypass (Sonnet 10), release workflow dispatch, OSRM supply chain, operator deletion audit, map hash per request.
4. Haiku 2 (unreadable saved booking cleared without receipt), 4 (keychain read error → signed out), 6 (other order's saved command dropped silently), 11, 12, 13, 14, 17; Step 2 (tap dropped on `other_settled`, intended), Step 3 (no Web Locks on plain http).
5. Cancel dialog uses system `Alert`: buttons in caps and title right-aligned in English (P3; needs an in-app dialog).

## Physical acceptance (SM-A5360, Android 16, R5CTB0FJP9Z; no emulator)

Fresh APKs from the fixed source, installed with `install -r` (data and sign-in kept): customer `57a99ff1…`, driver `19aa9dff…`, admin `a64d0410…`. QA server: fixed source on k5 4191 with a copy of the V11 sandbox (originals untouched; V11 server PID 12656 stopped, record in `D:\wq-strict-fix-1108\.expo\qa-switch\`).

Booking, Arabic: service tiles, current-location pickup, recent place → pin confirm, quoting → quoted with road route, validation (header + field), scheduling (day/slot), freight switch, invalid promo, offline submit → "saved on this device" → Retry → exactly one order, searching screen, cancel dialog → cancelled receipt with tiles, order again, swap with notice.
Booking, English: same-spot quote failure with its reason, pin move, quote, ride submit, cancel, banner clear before/after.
Other targets: home (AR/EN), booked-order header, orders list, delivered order, profile, road status (empty), help, account/language; two-role trip — driver jobs, accept, turn banner + route, arrive, pick up, customer live map with tiles (refits to route ≈15 s after open, public OSRM), handover code in closed sheet, code typed with keyboard up, delivered; driver trips/earnings; admin dashboard/orders/users/cash/settings; home shows live trip first.

The installed APKs predate the second-pass client edits (banner flag refactor, roads failure text, map `windBaseTile`); the banner behaviour verified on the phone is the same in one language, the roads text was not seen on the phone.

Evidence: `.expo/evidence/strict-review-20261108/` (81 screenshots, reviewer outputs, APKs + hashes).

## Browser suites and screenshots

- `test:scenarios` on k5: pass.
- `test:android-browser` needs the phone's adb, which is attached to this PC, so it ran **locally (labelled fallback)** against the A53's Chrome with k5's web export (one `api-client` copy verified). Run 1 timed out: the map iframe intercepted a click during a cold Chrome start. Run 2 passed all 5 checks (signup, GPU map and pin picker, booking to searching, Arabic tiles with live marker, pinch stops follow).
- `npm run screens` on k5: 96 screenshots, every map waited for a real basemap tile (one reload allowed for a slow tile server). `docs/screens/` refreshed (44 changed); `order-live` now shows tiles, closing the handoff's blank-map finding. First attempts failed for environmental reasons that are fixed: a `node_modules` junction across drives broke `expo export` (replaced with a same-lock copy), and one 30 s tile timeout under k5 load (reload retry added).

## Later phone findings, fixed

| Issue | Fix | Check |
|---|---|---|
| Driver saw the customer twice on a live trip (sheet header and body card) | body card keeps only extra contacts while live | `phone-ui` |
| Open sheet said the booked time twice (header row and card title) | card title only off the map | `map.test`; refreshed screenshot |

Gate on these edits (k5): lint pass, typecheck pass, npm test 129/129. Server code unchanged since the persistence pass.

## Further phone targets walked

Password change (inline form, disabled Save with reason), account deletion (password re-check, not submitted), safety panel (emergency numbers, not dialled), driver order body (release/help), home scrolled (recent routes).

## Final APKs (latest source) and last phone pass

Rebuilt on k5 from the final source and installed with `install -r`: customer `3fbda0c3…`, driver `8333c2a1…`, admin `d2621a17…` (`.expo/evidence/strict-review-20261108/apk-final-sha256.txt`). On these builds: driver live order shows the customer once; parcel trip W-00004 arrive → pick up → **wrong code refused with header error** → right code → delivered; Recenter re-frames after a pan; test orders W-00007/W-00008 cancelled; customer app returned to Arabic. W-00003 (original data) left untouched.

## Not walked on the phone, and why

- **Ride boarding PIN:** the sandbox driver drives a van, and vans don't do rides (`src/model.ts:74`). Changing the test driver's vehicle would change sandbox data, so I didn't. The browser scenario that covers ride boarding passed on k5.
- **Returns and disputes:** need an operator-side exception/return on an order. Not exercised on the phone; covered by `exceptions`/`parcels`/`credit` suites (pass).
- **Phone recovery:** the sandbox has no SMS provider; the screens are covered by `phone-*` suites and refreshed screenshots.
