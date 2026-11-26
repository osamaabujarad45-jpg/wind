# Handoff for the next Claude session — 16 November 2026

Start here. This file is the verified cutoff for the competitor-app corpus and for the Fastship REA rows. It tells Claude how to call Grok 4.7 as a T3 subagent. Every factual line is marked.

Evidence labels: `[read]` a file opened this turn · `[ran]` a command this turn · `[child]` a read-only Grok 4.7 child this turn, then spot-checked where noted · `[U]` not rechecked this turn.

No commit, push, merge, deploy, or production change was made.

## 0. How to call Grok from Claude (T3)

Call `orchestrator_capabilities` once in the thread before the first `delegate_task`. Do not poll a running child. Use `mode: "wait"` when the turn needs the result. A new review is a new `delegate_task`.

This turn verified this target. The provider id `grok` is disabled. Do not use it.

```json
{
  "target": {
    "providerInstanceId": "acpRegistry_grok_build",
    "model": "grok-4.7",
    "options": { "reasoning_effort": "xhigh" }
  },
  "role": "research",
  "mode": "wait"
}
```

Cursor also lists `grok-4.7` with `reasoning_effort` `xhigh`. This session's children ran on `acpRegistry_grok_build`.

Children used this turn:

- [Verify five competitor apps](t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/thread:delegated-task:command%3Amcp%3A38fd4c48-f370-4804-a4d8-2f2dfac3b41a%3Adelegate-task%3Averify-windcomp-2026-11-16)
- [Re-read Fastship REA rows](t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/thread:delegated-task:command%3Amcp%3A38fd4c48-f370-4804-a4d8-2f2dfac3b41a%3Adelegate-task%3Averify-fastship-rea-2026-11-16)

Parent thread: [Resume Prior Session Work](t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/66ec7d00-7ca1-44e1-bd62-3b1ae90cc4c0). The corpus was built in [Documents wind-competitors , INEED YOU TO CONTINUE...](t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/e942a415-652c-49d5-9c82-040ea449f262).

## 1. Where Claude actually stopped

`[ran]` newest Fastship Claude transcript, by file mtime:

`C:\Users\osama\.claude\projects\C--Users-osama-OneDrive-Documents-ChatGPT-Fastship\625fc039-60a9-4d8c-8566-ea9f63f052cd.jsonl`

| Fact | Value |
|---|---|
| Session id | `625fc039-60a9-4d8c-8566-ea9f63f052cd` |
| Model | `claude-opus-5-5` |
| CLI | `2.1.325` |
| cwd | `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship` |
| Last assistant time | `2026-11-16T08:28:47.931Z` |
| Last assistant claim | PR #70 merged as `ad0a1faf` |

`[ran]` `git rev-parse origin/master` is `ad0a1faf7b4b7d413ee5e1b901d5d44b330d22bb`. `git log -1 origin/master` is `docs(requirements): owner decisions D-1..D-3 (cash, shop delivery and refunds, ride-offer timing) (#70)`. That part of the transcript matches the remote-tracking ref. This turn did not re-open GitHub.

The 13 Nov cutoff named session `78352bbb-38c6-4674-a032-c9c325a5f39f`. That is not the latest transcript.

The compaction note inside `625fc039` said the next step was `errorText()` in `src/copy.ts`. That step is already on `origin/master`: `[ran]` `origin/master:src/copy.ts:2491` exports `errorText`, and `origin/master:src/ui.tsx:67` calls it. Do not rebuild it.

`[ran]` `C:\w\wind-scope` is branch `claude/scope-audit` at `40abfc3b` (`Merge master into scope-audit`). `[ran]` `gh pr list` for the Wind repo shows one open PR: #9, `claude/ui-ux-audit-2026-11-07b`, opened 7 Nov 2026. This turn did not review or merge it.

## 2. Two trees. Do not mix them.

`[ran]` in the Fastship root:

| | |
|---|---|
| HEAD | `b60922952d607f698eee24b9c68ac3394daecd3c` `docs(rea): full claims verification + reconciliation` |
| origin/master | `ad0a1faf7b4b7d413ee5e1b901d5d44b330d22bb` |
| merge-base | `83533e39c286d792bd257da70284649599e2d929` |
| relation | `master` is **ahead 6, behind 448** |
| `git diff --shortstat origin/master` | **525 files changed, 8581 insertions, 26952 deletions** |

The six commits on HEAD that are not on `origin/master` are documentation commits (`docs(rea)` / handoff docs), not the product delta. The product delta is the dirty working tree plus the 448 commits on `origin/master` that this checkout does not contain.

Do not `reset`, `checkout`, or merge this root onto `origin/master` to "get current." The root holds the owner's uncommitted work. A new implementation branch starts from `origin/master` in its own worktree. Replay onto it only the local edits that are still absent there, with a file-level diff, not a blind merge.

`[U]` This turn did not diff all 525 files. Absence claims below are about **this working tree**, not about `origin/master`, unless the row says `origin/master`.

## 3. The five apps — verified

Entry file, still the working copy: `C:\Users\osama\OneDrive\Documents\wind-competitors\CLAUDE-INTEGRATION.md`.

Layer files per app (`SPEC.md`, `DESIGN.md`, `FRONTEND.md`, `BACKEND.md`, `STUDY.md`, `HANDOFF.md`): `[child]` all 30 paths exist. Each app is its own git repo. The parent `wind-competitors` folder is not a git repo. In every repo, `HANDOFF.md` is modified and the five layer docs are untracked. Only Captain also has uncommitted `src/app/index.tsx`, `src/app/captain.tsx`, and `src/lib/domain.ts`.

`[ran]` `Get-FileHash` SHA-256, this PC, matches `CLAUDE-INTEGRATION.md` section 3:

| APK | SHA-256 |
|---|---|
| WindRide-1.0.0.apk | `3B30D895F6E31DFC72A44B97DC6DE6F04C85BE419A656C7DE30AE046F8DDE0BA` |
| WindCaptain-1.0.0.apk | `CFD49B7CFEED8F330DF1A1777C5B39AF962D439542020A9716824B0C3AD11372` |
| WindCaptain-1.0.0-before-rolefix.apk | `2BEFD81D5831F98FBA12005E326ECDF3A02A8F4D1F8C44F669288819CB15F276` |
| WindBazaar-1.0.0.apk | `1090CC625E9A5EC77E77AA10B4DCF6AEB7ACC739BFEFF889C038681D620CFA78` |
| WindParcel-1.0.0.apk | `6E4B8A179AA1BF27C5C090B896A8A2E7DB6E14F52FA233489A86B04A66AD8A7A` |
| WindMarket-1.0.0.apk | `DCF01DAAC1C49D50331E584B78703AB0C779234607136F8D53B2E1CD98D4E32C` |

`[read]` Captain role fix, local source `wind-comp-careem\src\lib\domain.ts:195-199`: `settleArrears` clears `arrearsCents` only when `state.role === 'rider'`. Home and Captain call `setRole` from `useFocusEffect` (`index.tsx` and `captain.tsx`). `[ran]` the same three spots are on k5 at `D:\src\wind-comp-careem\` (domain case at the `settleArrears` arm, home `setRole('rider')`, captain `setRole('captain')`). k5 has no `git` on PATH. `[child]` the other four apps do not have this arrears bug.

`[ran]` unzip of `WindCaptain-1.0.0.apk` → `assets/index.android.bundle` (2,806,036 bytes). The bytes `settleArrears` and `arrearsCents` occur once each, inside a concatenated identifier table (`anon_0_settleArrearsNowarnOnce`, `signal_cellular_2_barrearsCents...`). The comment `No amount crosses` is absent. **This search does not prove the guard is in the APK.** The k5 source that still sits at `D:\src\wind-comp-careem` does contain the guard. The earlier phone screenshot that showed the arrears banner gone was not repeated this turn. `[U]` phone.

`[child]` each `plugins/withMapsKey.js` throws when `WIND_GOOGLE_MAPS_API_KEY` is empty and writes only that env value. No `TODO` / `FIXME` under the five `src` trees. Map tiles are still blank until the shared certificate is allowed in Google Cloud. Certificate SHA-1 recorded in the integration file: `57:AF:6D:DB:35:87:C5:7E:77:E1:17:B9:42:6F:C4:A3:2E:F9:45:2F`. This turn did not call Google.

`ssh k5` to `192.168.1.6` still is the wrong address. `[ran]` `ssh -o HostName=desktop-s2jkmk5 k5` answered. k5 `D:\src` contains the five app trees and does **not** contain a Fastship checkout.

Rules to copy into Fastship, in order, are `CLAUDE-INTEGRATION.md` section 1. They are not marked done. Read Fastship before copying one: several already exist here under other names (section 4).

## 4. Fastship REA rows — this working tree, 16 Nov

Source of the old labels: `docs/REA/2026-11-13-GAP-BACKLOG.md`. Re-read by the child against current files. Parent spot-check: `[read]` `tests/api.test.mjs:185-197` and `[read]` `domain.ts` as above.

| ID | This tree | Test | Note |
|---|---|---|---|
| A3 proof | Code present. `handover_code`, five-strike lock, admin reset writes `PROOF_RESET` at `server/main.ts:2826-2835` `[child]` | Wrong code, lock, and success are in `tests/api.test.mjs:185-197` `[read]`. **No test asserts the `PROOF_RESET` row.** | QR token still absent. Optional. |
| A4 failure reasons | Request rejects anything outside `absent\|refused\|unreachable\|wrong_address` `[child]` | `tests/exceptions.test.mjs` rejects `bored` `[child]` | Column is still free text. Backlog has no A4 row. |
| A5 shift / job board | **Absent.** Offer accept and an active-job guard only `[child]` | None | Largest product gap. Do not invent it on this diverged tree. |
| A7 durable commands | **Partial.** Opt-in; SQLite with a `commandId` returns `409`; allowlist is orders, jobs, admin orders, admin cash, driver cash `[child]` | `tests/commands-sqlite.mjs`, `tests/commands.mjs` `[child]` | Not a general outbox. |
| A9 consent | **Present.** Accept changes the order; decline does not `[read]` `tests/change-destination.test.mjs:59-103` | Propose push `destination_request` is asserted. **`destination_accepted` / `destination_declined` are not.** | |
| A10 stale tracking | Client `stale` at ≥ 60 s, `reconnecting` from 30 s `[child]` | Presentation test covers 29/30/59/60. Presence rejects an upload older than 30 s. Customer pin is kept until 120 s (`server/main.ts` around the 61 s / 121 s cases in `tests/api.test.mjs`) `[child]` | The backlog sentence "the counterparty sees `location_stale` at 61 s" is **false for this tree**. Do not "fix" the 120 s pin to match the backlog without a new decision. |
| A11 collected variance | **Partial.** SQLite `cash_entries` has no collected amount. `cash_receipts.collected_minor` is Postgres-only and is updated in place, with no discrepancy reason `[child]` | No immutability test | Blocked on the SQLite pilot if the design reuses `cash_receipts`. |
| A12 service level | **Absent** `[child]` | None | `orders.service` is parcel/ride/freight, not a priority. |
| A13 channel version | **Absent.** No `channelId` `[child]` | None | |
| A14 boot re-arm | **Partial.** Task manager only. No boot, unlock, time, timezone, or package-replaced receiver in `app.json` or the config plugins `[child]` | None | |
| A1, A8, A2 journal, A6, A15 | Still the Postgres-cutover set | — | Dialect decision stays Option C: SQLite pilot now. `docs/REA/2026-11-13-DIALECT-ADR.md` `[U]` not re-opened this turn; the backlog still says that. |
| B2 live dialect, B3 live host | **Open. Owner access.** | — | Not observed this turn. |
| D1 booking retention, D2 typecheck | Not re-run | — | Do not claim today's suite. k5 has no Fastship tree, so this turn did not run `npm test`. |

`origin/master` SRS decisions, file `docs/requirements/SRS-2026-11-16-wind-one-app.md` `[ran]` grep, not a full read:

- **D-1** cash, including goods money at the door, ₪500 per order, for the shop and goods-COD pilot.
- **D-2** shop pilot in one town; cancel and refund rules in DLV-11, DLV-21, DLV-22, DLV-23, DLV-25.
- **D-3** is in the commit subject (ride-offer timing). This turn did not open the D-3 paragraph.

Those decisions are requirements. They are not evidence that shop, goods COD, or the cash ceiling are implemented in either tree.

## 5. What is still open, and why it was not coded here

Coding A5, A11, A12, A13, or A14 into this root would add features on a tree that is 448 commits behind `origin/master` and 525 files different. That is a second product, not a fix. The next implementation worktree starts at `origin/master`.

| Leftover | Who can close it | Next action |
|---|---|---|
| Which tree is the implementation base | Owner, if the dirty root must be kept as-is | Diff the local product files you mean to keep against `origin/master`. Do not merge the root. |
| A3 `PROOF_RESET` assertion | Next session, on the chosen base | After the admin reset in the proof test, assert one `security_events` row with action `PROOF_RESET`. Run that file on k5 after the tree exists there. |
| A9 decision pushes | Next session | Clear the push sink, accept, assert `destination_accepted`. Same for decline. |
| A5, A12, A13, A14, A11 on SQLite | Next session, after the base is chosen | A5 changes how captains work. Spec it against the SRS before coding. A11 must not pretend Postgres `cash_receipts` runs on the pilot. |
| A10 backlog sentence | Docs only | Correct the backlog. Do not change the 120 s customer pin in the same edit. |
| Captain APK contains the role guard | Rebuild from the known source, then install | k5 source has the guard. The APK string search does not. Phone was not walked this turn. |
| Blank map tiles | Owner, Google Cloud | Allow the certificate SHA-1 above for Maps SDK for Android. The apps already refuse a missing key. |
| WindParcel and WindMarket phone walk | Phone session | Not repeated after the earlier research shots. |
| B2, B3, production APK host | Owner AWS/host access | Nov 13 said the installed Fastship APK still called the retired Azure host. **This turn did not re-extract that APK or call the API.** Treat that host claim as `[U]` until a new read. |
| PR #9 | Separate review | Left open. Not part of this cutoff. |
| Commit the five-app docs and the Captain role fix | Owner asked for a handoff, not a commit | Do not commit unless asked. |

## 6. Read order for the next session

1. This file.
2. `C:\Users\osama\OneDrive\Documents\wind-competitors\CLAUDE-INTEGRATION.md` for the five apps.
3. `origin/master`:`docs/requirements/SRS-2026-11-16-wind-one-app.md` §16a before any shop or cash work.
4. `docs/REA/2026-11-13-GAP-BACKLOG.md` and `docs/REA/2026-11-13-RECONCILIATION.md` for the pilot gaps, then re-grep before trusting a line number. Section 4 above is the 16 Nov re-read of this working tree.
5. `docs/CURRENT-WORK.md` only for history. Its 3 Nov test claims were not re-run.

Phone, when a walk is required: `SM-A5360`, adb serial `R5CTB0FJP9Z`. No emulator. Builds and tests on `DESKTOP-S2JKMK5` via `ssh -o BatchMode=yes -o HostName=desktop-s2jkmk5 k5`. Do not use `ssh k5` alone while it still targets `192.168.1.6`.

## 7. Closed after this handoff (16 Nov 2026, later session)

- **A3 `PROOF_RESET` assertion** and **A9 decision pushes**: PR #71, merged to `origin/master` as `e03367a1`. Worktree `C:\w\wind-a3a9`, branch `claude/a3-a9-test-assertions`. Full gate on DESKTOP-S2JKMK5 at `29d8f27f`: tsc 0, lint 0, `npm test` 144 suites. Grok 4.7 xhigh review: nothing blocking; its one note (assert accept push after the replayed accept) fixed in `f0955815` and re-run there. CI 6/6 green.
- **A10 backlog sentence**: corrected in `docs/REA/2026-11-13-GAP-BACKLOG.md` (root working tree only; `docs/REA/` is untracked here). 120 s pin unchanged.
- Still open: everything else in section 5.

## 8. Second pass, 16 Nov 2026: competitor features into Wind

Owner asked: implement the handoff and bring every competitor feature in, deciding by recommendation. Merged to `origin/master`:

| PR | What | Verification |
|---|---|---|
| #72 `251fbd58` | ADM-12 per-order cash ceiling (default ₪500, D-1) on every price path, plus release, courier block and goods COD | Full test-PC gate, 145 suites. Grok 4.7 review; all findings fixed. CI green. |
| #73 `3c21e091` | **Shop delivery line** (SRS §7 DLV, §7.1 MER): shops, catalogue, cart, consent, packing, dispatch, the shop's own pickup code, seals, door cash, return to the shop, fault/refund/unsellable, `shop_ledger`, payouts, merchant mode, admin Shops tab, regenerated screens. Spec and decisions: `docs/REA/2026-11-16-SHOP-LINE.md`. | Full test-PC gate, 148 suites. `tests/pg-shop.mjs` plus the whole PostgreSQL persistence suite on the test PC. Grok review (19 findings) and re-check (3 more); all fixed or answered on the PR. CI green. |

Still open:
- The shop line is **off in production** by design (D-2: PostgreSQL, off-host backup and a restore drill first).
- The phone walk of the shop screens was **not** done. The A53 was attached but held by another T3 session (`DEVICE_IN_USE`, session `t3-50e0a64f15c41108d4715631`). Repeat it with the walk recipe:
  1. On DESKTOP-S2JKMK5, build the web export of master with `EXPO_PUBLIC_API_URL=http://localhost:4188`.
  2. Start the server with `WEB_ROOT`, `WIND_ENABLED_SERVICES=parcel,shop`, `PORT=4188`.
  3. Connect with `ssh -L 4188`, then run `adb reverse tcp:4188 tcp:4188`.
- Section 5 items needing the owner are unchanged: the Google Maps certificate, the B2/B3 host, the Captain demo APK.
