# Claude handoff — 18 November 2026 — restore seams and the picomatch follow-up

Continues `HANDOFF-2026-11-18-CLAUDE-NEW-KNOWLEDGE-REA-BUILDS.md` §7.1 and the open item left by the 17 Nov integration session (`HANDOFF-2026-11-17-OPUS-INTEGRATION.md`). New facts only.

Labels: `[ran]` command this session · `[k5]` DESKTOP-S2JKMK5 over SSH · `[read]` source opened · `[I]` inference.

## 1. Restore-seam audit (REA §5.1–5.3 applied to Fastship)

`[read]` Every client restore boundary that parses saved JSON:

| Seam | Shape on load | Verdict |
|---|---|---|
| `src/booking.ts` `readBooking` | strict; optional fields defaulted by `book.tsx` (`p.priority ?? 'standard'`, recipients `?? ''`) | sound |
| `src/driver-command.ts` `readDriverCommand` | strict; wp01/SHIP-17/seal fields optional and validated when present; 1 h TTL | sound |
| `src/protected-recovery.ts` envelope | strict; invalid record deleted and its deadline cancelled | sound |
| `src/offline-summary.ts` `readOfflineSummary` | strict, rebuilds allowlisted shape, `scheduledFor ?? null` (field added 12 Nov, after the pilot started) | sound — the Fastship example of the right pattern |
| `src/client-diagnostics.ts`, `src/chat-outbox.ts`, `src/driver-presence-runtime.ts`, `src/phone/command.ts` | strict filters | sound |
| `src/shop-cart.ts` | **accepted a cart missing fees, city, names, byWeight or policy** — Captain-shaped hole | fixed (#89) |
| `src/app/admin/cash.tsx` | unparseable slot threw `SyntaxError` on every visit, never cleared | fixed (#89) |

`[read]` No false drops: every cart writer (`setQuantity` from `merchantView`/`itemView`, `replaceCart` from `POST /api/orders/:id/shop/again`) produces fields `readCart` accepts; the shop schema has names `NOT NULL`, fees `>= 0`, prices `>= 1`, policy `CHECK (policy IN ('remove','ask_first','similar'))` (`server/db/postgres-shop.sql`, `sqlite-shop.ts`).

Server `command_results` replay stores a response for the command TTL only; not a long-lived forward-migration risk `[I]`.

Rule for new persisted fields (also written into `readCart`'s comment): backfill at the load boundary (`saved.x ?? default`) when a truthful default exists, otherwise reject at the boundary or move to a new key. Never accept and let a screen read a missing field.

`tests/legacy-restore.test.mjs` pins blobs as earlier versions wrote them.

## 2. PRs

| PR | What | State |
|---|---|---|
| #88 picomatch hardening (17 Nov follow-up) | guard + audit waiver; three Haiku rounds this session: `+(a+)`, regex `+` after `)`/`}`, nocase folds (both cases, any truthy `nocase`), escaped classes `\d`/`\w` not literals, first-character rule restores `*.+(png\|jp?g)` and case-sensitive `+(a\|A)` | fixes at cabb184d; merge once CI is green (`gh pr view 88` for the outcome) |
| #89 restore seams | §1; Haiku: unknown city id, empty cart, `parseCashSlot` tested directly; re-review clean | lands with this file |

## 3. Evidence

- `[k5]` `D:\wind-lead-1115\rb18` (#89 head c406c1a5, `node_modules` junction to `D:\wind-master-bcc0c97-codex`): `legacy-restore`, `admin-cash-command`, `driver-command`, `protected-recovery`, `booking-schedule-restore`, `booking-recovery-actions`, `chat-outbox`, `shop-flow`, `presentation`, `large-text` all exit 0; `npx expo lint` 0; `tsc --noEmit` 0.
- `[k5]` Red run `D:\wind-lead-1115\rb18r`: the same test against master's `shop-cart.ts` (old validator exposed as `readCart`) fails `a cart without city is dropped, not shown as NaN`, exit 1. The test is not vacuous.
- `[k5]` `rb18b` (#89 at 398cc7ef): same 10 suites 0, lint 0, tsc 0.
- `[k5]` `pm88c` (#88 at cabb184d): picomatch shape/behaviour test 0 on both majors, lint 0; red run against 69318a9e fails `+(\d|1) backtracked`; earlier red against c2e8091b failed `+(a+) backtracked`. `audit-gate` passes every fixture case; its last assertion (repository lockfile) and the consumer-resolution test need `npm ci`, so CI is their evidence.
- Tree pins recomputed with an independent Python replica of `treeHash` that reproduces the previous pins exactly.
- Full suites: GitHub Actions on each PR head (`verify`, `persistence`, `image`).
- Trap: this shell's heredocs collapse doubled backslashes; write scripts with the Write tool (two escaping bugs were caught that way).

## 4. Phone walk on the A53 (later on 18 Nov) — #90

Closes the 17 Nov handoff's "phone acceptance NOT RUN" for A-01, the chat outbox and the receipt. `[phone]` physical SM-A5360, Chrome 157, phone sandbox built from master d77dadc6 on the test PC (`D:\wind-lead-1115\walk18`).

- **Rig.** Another session's sandbox (PID 5156, 16 Nov) holds 4191 on the test PC and was left alone; this walk's copy listens on 4192 (`walk18-build.cmd` rewrites the port in its own copy only). Phone path: `ssh -N -L 14191:127.0.0.1:4192 k5`, `adb reverse tcp:4191 tcp:14191`, Chrome at `http://127.0.0.1:4191`. Cutting the tunnel = losing the network. `TaskStop` on the backgrounded ssh leaves `ssh.exe` alive: stop the PID (`Get-CimInstance Win32_Process` with `-L 14191`).
- **Driving.** `uiautomator dump` is killed (exit 137) on this phone, so taps come from DevTools element rectangles (`adb forward tcp:9228 localabstract:chrome_devtools_remote`; device y = css y × dpr + (2400 − 135 − innerHeight × dpr)), typing from `adb shell input text`. Android Chrome refuses `/json/new`; reuse the active tab. Native `confirm()` blocks DevTools evaluation until tapped. Never press Back on the sign-in page (it left the app tab), and Chrome offers to save the sandbox password under the owner's Google account: never tap Save; tap page text to dismiss. Evidence: `C:\Users\osama\OneDrive\Documents\wind-evidence\walk-20261118\` (helpers `cdp.mjs`, `tap.sh`). Screens that showed the owner's private data (Messages, autofill email) were deleted.
- **A-01 PASS.** Offline send → "Can't reach Wind", form locked, `adminCash.3` saved → reload online: restored locked, receipt empty → resend: R-000001 recorded once → Mark disputed: server `disputed`.
- **Chat outbox PASS.** Offline send → "Not sent yet · Resend · Discard" → reload: kept, server 0 → Resend: server 1, outbox cleared → same request id re-injected: dropped on load, server still 1.
- **Receipt PASS.** Truthful cash line (#84); no breakdown without a stored suggestion (#86).
- **Fixed in #90:** status words as admin action buttons; resolve form that did not name its decision; Shops tab shown with shop off (custom TabBar ignored `href: null`, production-visible); "Dashboar/d" label break; disabled fields that looked typeable; Arabic names flipping English lines (receipt, tracking, assign, resolve caption, role-change sentence) via a shared `isolate()`.

## 5. Not done / open

- Phone update-install test (REA §5.3: `install -r` over existing data) for Fastship: NOT RUN. The shop line is off in production (D-2), and the admin cash screen is web. A release that changes a persisted shape should get one on the A53 before shipping.
- Merges are not deploys; production is unchanged.
- REA §6 items (map tiles in the demo apps, WindRide/WindBazaar signer mismatch) are owner-side and untouched.

## 6. Research priorities #5–#10 against master (later 18 Nov, Opus)

Priority map: `wind-competitors/CLAUDE-INTEGRATION.md` §2. #1–#4 shipped 17 Nov (#79/#81/#82, #84, #86, #85). `[read]` master `bb6a3d0d`:

| # | Area | Verdict |
|---|---|---|
| 8 | Server-held proof | Already met: handover/return codes held server-side, owner-only view (`server/main.ts` `handoverCode: owner ? …`), 5 bounded guesses then `proof_locked` with an admin attention push, `PROOF_FAILED`/`PROOF_RESET` security events with reason, support identity check (`SUPPORT_PROOF_TTL`), boarding PIN revisions in `server/domain/ride-lifecycle.ts`. No slice. |
| 7 | Scheduling | Already met: `invalid_schedule` unless integer, ≥ release window and ≤ 7 days; quote/booking mismatch `itinerary_changed`; idempotent reschedule after a lost reply; release sweep; `scheduledFor ?? null` restore. No slice. |
| 9 | Earnings | Gap: the driver cash card showed one total though `GET /api/driver/cash` returned its parts. **#91** shows the parts (commission, shop cash, promo credits, adjustments, confirmed handovers) signed toward "owed to Wind", plus pending handovers as not counted; no breakdown when parts ≠ total. Disputed handovers are void, not totalled. |
| 5 | Map-first home / failure states | Not started. Partial today: map page reports `fail` on load/HTTP/WebGL loss, `windTileFailed` tracked, `pinUnavailable`/`mapUnavailable` copy. Next owner: one-tap resume of an active order from home, and actionable text for permission, approximate fix, stale fix, offline routing and tile failure. UI-heavy: sequence after the 18 Nov Haiku design review lands. |
| 6 | Addresses | Not started; read `SPEC-saved-places.md` first. |
| 10 | Accessibility / RTL | Ongoing across slices; the 18 Nov Haiku design review feeds it. |
