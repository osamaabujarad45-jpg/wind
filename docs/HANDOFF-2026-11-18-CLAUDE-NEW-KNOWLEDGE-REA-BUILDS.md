# Claude handoff — 18 November 2026 (REA builds continuation) — NEW knowledge only

Companion to `HANDOFF-2026-11-18-CLAUDE-NEW-KNOWLEDGE.md`. That file records the earlier part of the day. **This file records only what this continuation session checked, built, fixed and tested.** It does not restate the 13–17 November REA studies, adopt lists, route maps or the earlier handoff's findings. Paths below are the ones a command or a change actually touched.

Evidence labels: `[ran]` command run this session · `[k5]` on `DESKTOP-S2JKMK5` over SSH · `[phone]` physical Samsung SM-A5360 `R5CTB0FJP9Z` · `[rea]` REA CLI 6.9.0 · `[read]` source opened this session. `[O]` observation, `[I]` inference, `[U]` unknown.

Legal framing: authorized competitive-architecture study of apps the owner is authorized to examine. The five apps are original local demos built from *patterns* only. No competitor code, artwork, strings, credentials or decompiled assets were copied into them or into Fastship.

## 1. What this session delivered

1. Finished the three outstanding **release APKs** (HAAT/WindBazaar, Shiply/WindParcel, Souq/WindMarket) on k5.
2. Diagnosed and fixed the **Captain-mode crash** that the earlier handoff left open: synced the already-written local fix to k5, rebuilt Captain, re-tested on the phone. Crash no longer reproduces.
3. Ran a fresh **REA signature pass** over all six release APKs (the five apps plus the pre-fix Captain artifact) and recorded evidence IDs.
4. Took over the phone from a stale other-session device forward, installed the new Shiply/Souq/Captain APKs **without uninstalling or clearing data**, and walked one primary screen per app with screenshot + UI-dump evidence.

No Fastship application code was changed. No commit, push, deploy, production migration or uninstall was done. Phone app data and Chrome profile were left in place.

## 2. New build artifacts — exact digests and REA evidence

All signed with the stable WindComp keystore alias `windcomp`. Certificate SHA-256 `759e72f764691396e51b91e4cb3f58fda476f81b18f79a6498ffbe94838bbcd6` (SHA-1 `57af6ddb3587c57e77e117b9426fc4a32ef9452f`, DN `CN=Wind Competitors, O=WindComp, C=PS`, serial `B9C0587674D546FC`). `[rea]` Every APK below reports schemes **v1+v2+v3**, `strongest_scheme=v3`, `self_consistent=true`, v2 `declared_digest.matches_apk=true`, v3 `min_sdk=24`, no rotation. This is declared-structure inspection, **not** cryptographic signature verification.

| App / package | k5 artifact | Bytes | SHA-256 | REA evidence id |
|---|---|---:|---|---|
| WindRide / `com.windcomp.windride` | `D:\b\n18\uber-release.apk` | 46,149,893 | `c9fe7d68cdb023d65795eb8a6feb8823261374ec81bfab628e37c3f06031de07d` | `ev_bf586a31a8644020836a398832296cff9b796cc6fcd03411384dfa54cda5185d` |
| WindCaptain / `com.windcomp.windcaptain` (**pre-fix, superseded**) | `D:\b\n18\careem-release.apk` | 46,601,151 | `b88192123253e08b8b33ab9e6f561ff562989900425cd2622c2a3e368c9ea331` | `ev_05ab5b7b248ab6059318dd55b36b65e73984b926435699fe7af48656768183da` |
| WindCaptain / `com.windcomp.windcaptain` (**fixed, current**) | `D:\b\n18\captain-release.apk` | 46,601,151 | `eb9dbf8238d92a485517a074a4aac26867d5b977f0315d152c91c0708d8ce7ef` | `ev_8a21a1e597608dd4be82fedcd7b3bce5f03a416872b655bbe6741468c27eb12c` |
| WindBazaar / `com.windcomp.windbazaar` | `D:\b\q\haat-release.apk` | 46,153,990 | `9032dc4e7bbcdcda96b075172e0946baca4d4ca3981f19e7850e212920348a66` | `ev_d31a71dd443617d8fedb3064aa61a19908115b43ad8c86f168d339c722056e75` |
| WindParcel / `com.windcomp.windparcel` | `D:\b\q\shiply-release.apk` | 46,108,933 | `6fbfede4a33b9b5ce8546b2cfe1e72ccde81a89112fa4182b392dd9b540a0313` | `ev_0a655d359247febd84fe09da8e5be5e56a4171cc3a29f2ca62af3e954b33309c` |
| WindMarket / `com.windcomp.windmarket` | `D:\b\q\souq-release.apk` | 46,158,085 | `5c06acdc9a6418d031f9f2fcd3cbf62d572d49fa2e1fdbd21b27f3cc9839b647` | `ev_1d2b6f21252127bb3b48542e634764f82d9a853d4a0ca3f109900bd66d920279` |

Local copies of all artifacts and all phone evidence are in `C:\Users\osama\OneDrive\Documents\wind-competitors\evidence\n18-final-20261118\`.

`[k5]` Build timings from the Gradle logs: HAAT `BUILD SUCCESSFUL in 23m 48s`, Shiply `19m 2s`, Souq `17m 44s`. All five apps' selfcheck/tsc/lint exited 0 in the earlier `D:\b\build-q.ps1` run; the Captain rebuild's selfcheck, tsc, lint, prebuild, Gradle, sign and verify all exited **0** (`D:\b\n18\captain-*.log`).

## 3. The Captain crash — root cause, fix, and phone proof (the main new knowledge)

### 3.1 Root cause (confirmed, not inferred)

`[read]` Careem-demo state restore has a **schema-version hole**:

- `wind-comp-careem/src/lib/config.ts:5` — `STATE_VERSION = 1`.
- `wind-comp-careem/src/services/localServer.ts:69-87` — `load()` restores a saved blob when `version === STATE_VERSION` and `addresses`, `history`, `earnings` are arrays. The pre-fix k5 copy assigned `state = saved.state;` with **no validation or backfill of `captainWallet`**.
- `wind-comp-careem/src/store/store.tsx:94-97` — `captainCashBlocked()` calls `captainCashDecision(state.captainWallet)`.
- `wind-comp-careem/src/lib/cash.ts:31-43` — `isCaptainCashBlocked(wallet)` / `captainCashDecision(wallet)` read `wallet.balanceCents` with no guard.
- `wind-comp-careem/src/app/captain.tsx:83,145-147` — three more direct `state.captainWallet.*` reads.

`[phone]` A version-1 saved blob written before `captainWallet` existed therefore reaches `balanceCents` on `undefined` and throws `TypeError: Cannot read property 'balanceCents' of undefined` when Captain mode mounts. A fresh install never hits it. `install -r` preserving the old blob does. This is a **persisted-state forward-migration** bug, not a UI bug.

### 3.2 The fix (smallest complete change)

The local tree already contained the intended fix (written at 01:42, after the crashing APK was built) but **k5 did not**. `[ran]` I synced exactly two files to `C:\windcomp\wind-comp-careem\` and hash-verified them:

- `src/services/localServer.ts:78-83` — on restore, spread `initialState` first and backfill the missing field: `captainWallet: saved.state.captainWallet ?? initialState.captainWallet`. One line covers **all** read sites, because every consumer receives the store's `state`.
- `scripts/selfcheck.mjs:152-157` — regression: strip `captainWallet` from `initialState`, write a version-1 blob, rebootstrap, assert restored wallet equals `INITIAL_CAPTAIN_WALLET` and `captainCashDecision(...)` returns `{allowed:true}`.

`INITIAL_CAPTAIN_WALLET` lives at `wind-comp-careem/src/lib/domain.ts:116`; `State.captainWallet` is declared at `domain.ts:58`. No other source file was changed.

`[k5]` Verification: `selfcheck` PASS on the synced source (including the legacy-blob case), then the full `D:\b\build-captain.ps1` rebuild — all exits 0, new hash `EB9DBF82…`, REA evidence `ev_8a21a1e5…`. The reusable rebuild script is `D:\b\build-captain.ps1` on k5 (local copy `C:\Users\osama\AppData\Local\Temp\opencode\build-captain.ps1`); it uses the same short-path staging, one Gradle worker, in-process Kotlin, 2 GB Serial-GC heap and the two-file `--ks-pass`/`--key-pass` workaround described in the earlier handoff.

### 3.3 Phone proof of the fix

`[phone]` Installed the fixed APK with `adb install -r` (cert token `229155fd`, scheme v3 — same signer), then pulled the installed APK: SHA-256 `EB9DBF82…` **exactly matches** the build artifact. Saved data survived (Net ₪939.50, In ₪949.50, Out ₪10.00; Float ₪125.00).

- Tapping **Captain mode** now opens the screen and stays in focus. No `JavascriptException`, no `balanceCents`, no FATAL in `logcat -d` or `logcat -b crash`.
- Tapping **Go online** renders two cash offers (Home→Cities Mall ₪21.50; Palestine Medical Complex→Work ₪36.00) with working Accept/Decline; the Cash Float card shows `Float ₪125.00 · Limit -₪500.00 · Active`. This exercises the exact `captainCashDecision` path that used to crash.
- Evidence: `captain-mode-result.png`, `captain-online-result.png` and installed-APK copy in `evidence\n18-final-20261118\`.

**Conclusion:** the crash reported at 01:10 is fixed and the fix is proven on the physical phone with the saved blob still present. No uninstall or data clear was used.

## 4. Phone acceptance this session (new builds, new evidence)

`[phone]` Takeover: two stale adb shell forwards from the other session (PIDs 23632 `agentdevice.snapshothelper`, 51536 `scrcpy`, both ~1 h old, ~0.03 s CPU, focus unchanged for minutes) were terminated; the adb server (PID 23104) was kept. Installed-then-pulled digests matched the k5 artifacts for all three updated apps.

| App | What was actually done | Result | Evidence |
|---|---|---|---|
| WindParcel (Shiply) | `install -r`; home; opened `SH-48216` | Arabic RTL home with intact wallet (متوقع/محصّل ₪180.00) and shipments SH-48216/SH-48210; shipment detail shows identity card + full custody timeline. Saved data intact. | `parcel-home-new.png/.xml`, `parcel-shipment-new.png/.xml` |
| WindMarket (Souq) | `install -r`; home; switched to زبون | Roles زبون/مندوب/مشرف, saved address, three Tulkarm stores, active order 4821 (₪46.00) all render correctly in RTL. | `market-home-new.png/.xml`, `market-customer-new.png/.xml` |
| WindCaptain (Careem) | `install -r`; home → Captain mode → Go online | Crash gone; see §3.3. | `captain-home-fixed.png`, `captain-mode-result.png`, `captain-online-result.png` |

Installed certificate tokens before updating: `windparcel`/`windmarket`/`windcaptain` all `229155fd` (release) — safe to `install -r`. `[O]` `com.windcomp.windride` token `46af224e` and `com.windcomp.windbazaar` token `51ed3f60` are **different signers**; their new release APKs were deliberately **not** installed and neither app was uninstalled. They remain the already-installed builds.

## 5. New knowledge for Claude / Fastship integration

These are facts discovered **this session**. The reuse-first integration map in `wind-competitors/CLAUDE-INTEGRATION.md` is still the authoritative *older* index; do not re-derive it from this file.

1. **Persisted-state forward migration is a real failure mode in this demo family.** `[I]` Fastship has its own versioned persistence (`server/domain/commands.ts`, `booking-receipts.ts`, `driver-receipts.ts`, `src/storage.ts`, `src/recovery-storage.ts`). When adding a field to a restored state object, backfill it at the load boundary (`saved.x ?? initial.x`) or bump the state version; a version-compatibility guard that checks only *other* arrays (as Careem did) is not sufficient. Add a regression that restores an old blob with the field stripped. This is the transferable pattern from §3 — not a request to copy Careem's store.
2. **One backfill at the boundary beats guarding every consumer.** `[O]` Careem had four read sites (`store.tsx:95`, `captain.tsx:83,145,146-147`) that would all throw on the same missing field. Fixing `localServer.ts:81` fixed all of them; no defensive checks were added to the screens. Prefer this shape in Fastship's restore seams.
3. **`install -r` preserving data is a test oracle, not just convenience.** `[O]` A fresh install masked the Careem bug; only the update path with the old blob reproduced it. Any Fastship change to persisted state needs an update-install test on the phone with pre-existing data, not only a fresh-install pass.
4. **Build/sign reproducibility on k5 is now proven for all five apps.** The long-path native failure (`ninja` >260 chars) and the `apksigner` password-file EOF issue are both worked around by `D:\b\build-q.ps1` / `D:\b\build-captain.ps1`: short `D:\` dependency junctions, staged copies under `D:\b\q` or `D:\b\n18`, one Gradle worker, in-process Kotlin, 2 GB Serial-GC, and two identical-content password files (`ks-store.pass`, `ks-key.pass`). Do not print those files.
5. **REA 6.9.0 is usable on this Windows host via `C:\Users\osama\AppData\Local\Temp\opencode\rea24.cmd`** (bare `rea` on PATH still fails the engine check — system Node is older). `rea inspect-apk-signature <apk> --format json` returns declared v1/v2/v3 schemes, signer certs, declared digests and `matches_apk`/`self_consistent` posture with a stable `evidence_id`. Remember its own limitation: no signature is cryptographically verified; a changed file can recompute the declared digest. Treat the IDs above as *artifact identity*, not authenticity.

## 6. Gates, limits and what remains UNPROVEN

- `[ran]` All gates recorded above are real exits, not claims from older reports. Phone results are from the physical A53 only. No emulator was used.
- **`[U]` Map tiles remain blank** in the competitor apps: beige surface with a clipped Google logo on Shiply shipment and Captain home. The earlier handoff's observation that the Fastship test-customer package could render tiles does **not** prove these packages/certs are authorized. Maps SDK enablement / package-certificate whitelisting is an owner-side console gate. Do not report maps as working.
- **`[U]` WindRide and WindBazaar were not re-tested against new APKs this session** because their installed signers differ. Their prior-session walk evidence stands on its own; the new release APKs exist and are REA-verified but were not installed.
- **`[U]` REA here is static artifact inspection only.** No competitor backend, account, live GPS, PSP or remote queue was contacted. Demo clocks are not production behavior. Card selection is not payment; a local receipt is not settlement; a labelled queue is not remote sync.
- **`[U]` No visual/a11y sign-off.** Screenshots were read for content/RTL/clipping in the walked screens only; full TalkBack, large-font, contrast and every route were not exercised this session.
- **`[U]` No Fastship build, test suite or phone run was performed in this session.** Do not cite these demo gates as Fastship results. Fastship changes still need their own k5 gates (`npm run typecheck`, `lint`, `test`, acceptance runners) and phone acceptance.
- Both Fastship delivery gates from the older REA work — the map-licensing firewall and the billing gate — are untouched and must not regress.

## 7. Suggested next actions for Claude

1. For the Captain pattern, integrate only the **boundary-backfill + update-install regression** idea (§5.1–5.3) into Fastship's own restore tests; do not transplant the demo store.
2. Use the §2 digest table to identify which artifact is on the phone before any further install; never `install -r` WindRide/WindBazaar over their installed signers and never uninstall to bypass a mismatch.
3. Keep Maps and any production capability as owner-gated items; the unproven list in §6 stays open until console-side evidence exists.
4. When you change Fastship, write a *new* dated handoff; do not append new facts into the 13–17 November studies or into `HANDOFF-2026-11-18-CLAUDE-NEW-KNOWLEDGE.md`.
