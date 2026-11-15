# Handoff — Opus 5.5 lead session, 15 November 2026

Read this first. The plan and its reasoning are in `docs/REA/2026-11-15-PLAN-VS-FABLE-PATH.md`. This page holds the state: what is live, what merged, what is open, and how to run things.

## Production (as of 17:25 UTC, 15 Nov)

- **Live:** image `20261115-azure6` = master `ec6b951` (deployed 17:12 UTC; backup first; rollback container `wind-api-pre-20261115-azure6`). Health, ready and phone/capabilities return 200 on both the Azure host and CloudFront. Schema now has the door-cash columns, the write-once trigger and `priority`.
- **APK 1.1.1 (versionCode 30)** from `ec6b951`, built on EAS (same keystore, signer `5947bab0…`, bundle has only the Azure API and update URL). Published as `downloads/wind.apk` and `downloads/wind-30.apk` (sha256 `27175138…`). Installed over 29 on the owner's A53 with data kept. **Forced-update floor NOT set** (1.1.0 keeps working). Set `WIND_MIN_CLIENT_BUILD=10101` only when every user should be pushed.
- **The owner's admin is signed out on the phone.** The production sessions table was already empty at the 09:10 backup, before this session's deploys. `/api/auth/logout` ends every session of a user, and the earlier lead's API login→logout test did that. The owner signs in again with their password.

- Azure, new account (`osamaabujarad@birzeit822.onmicrosoft.com`, subscription "Azure subscription 1", rg `wind-prod`, Sweden Central). VM `wind-vm` (`Standard_D2als_v6`), `https://windapp-ps.swedencentral.cloudapp.azure.com`. SQLite, parcel only, cash only.
- Deploy: `gh workflow run release-image.yml --ref master -f tag=<tag>`, then the `sudo /srv/deploy.sh …` line from the workflow summary, run on the VM (backup first, digest + revision check). The runbook is in `docs/operations/deploy.md`, "Production host on Azure".
- SSH: `ssh -i ~/.ssh/wind-azure -o UserKnownHostsFile=~/.ssh/wind-azure.known windadmin@windapp-ps.swedencentral.cloudapp.azure.com` (passwordless sudo).
- Installed APK 29 / 1.1.0 (`ps.wind.app`, signed in as the owner's admin on the A53). Never clear or sign it out. CloudFront still forwards to Azure through the stopped AWS host's Caddy, for build-27 apps.
- Azure quota: the approved request is **Dlsv6 ×50 in Australia Central**, the wrong region, so it isn't used. Sweden Central `standardBasv2Family` is still 0, so the VM can't move to the cheaper B2als_v2 yet.

## Merged on 15 November (origin/master `7ca9ad2`)

#31–#38 (Azure move, search, cash cap, Expo patches, exact admin cash, plan, subscription review). After that, in this session: #40 WP-03 (blocked account told at sign-in), #45 plan-vs-Fable reconciliation plus the Fable docs in `docs/fable/`, #46 GEO-01 (reproducible OSRM build + manifest), #50 admin cash notice, #41 WP-07 (ordinary-sign-in test APK), #39 WP-06 / UX-04 (large text to 200%), #43 WP-02 (admin assign/reassign driver), #44 WP-11 (ETA ladder, no-change copy), #42 WP-01 / A11 (door cash with owner vocabulary, one immutable fact, PG migration 31), #48 UX-02 (settings and role review, plus the A-02 fix), #47 GEO-03 (shared map links, coordinates and Plus Codes), #49 A12 (same-day priority, PG migration 32), #51 UX-03 (booking pin without a drag gesture).

**Review honesty:** #42, #48, #49 and #51 merged on the lead's review plus CI and K5 checks. Haiku (Claude rate limit) and Codex (usage limit until 20:17 local) were unavailable. The exception is #42, whose A11 core Sol/Codex re-reviewed (a94da1b). **Next session: run a Codex gpt-6.1-sol second review of #47, #48, #49 and #51 against master and fix whatever it finds.**

## Preserved work

| What | Where |
|---|---|
| Fable 5.2 candidate6: the full Fable-graph implementation on the OLD lineage | Branch `backup/fable-candidate6-20261115` (3e5645f). The source worktree `…/opencode/worktree/b44bf6/fable-5.2-verification` is untouched |
| Agent WIP from interrupted runs | `C:\w\wip-backup-1115\` |
| Sol's QA evidence (bcc0c97 matrix) | `C:\Users\osama\AppData\Local\Temp\opencode\fastship-continuation-20261115\` (`sol-state.md`, `sol-matrix-bcc0c97/`, JSON/PNG) |
| OSRM reproducibility graphs | VM `/srv/osrm-geo01-{a,b,c}` (the live `/srv/osrm` is untouched; c was built by the merged script, with a manifest and route corpus) |

## Phone checks on the 7ca9ad2 QA build (this session, A53)

- **C-01, real result: FAIL.** The ordinary APK (#41) signs in through the normal screen and survives a cold relaunch (the old blocker is gone). But an offline cold launch shows only "Can't reach Wind" + Retry, with no read-only saved order, even with an active order W-00002 (reproduced twice). The code path exists (`cacheOrderSummaries` on `/orders` → protected `summary` slot → `_layout` `OfflineOrders`), but the summary never shows. Root cause unknown; the clocks are aligned (PC/phone/K5 within 2 s). This is Fable UX-01's product fix. Evidence: `C:\w\qa-evidence-7ca9ad2\c01-offline-coldlaunch-no-summary.png`. Ruled out: clock skew (all within 2 s), the `phoneTest` gate (the ordinary variant sets no `extra.phoneTest`), the `/orders` path regex, the AES native module (`expo-crypto` 57.0.4 ships `AesCryptoModule`). Every read/write failure in `offline-recovery.ts` and `protected-recovery.ts` is swallowed, so add a QA-only log there first.
- **C-07 (UX-03): partial PASS.** TalkBack sees Zoom in/out (they work without a gesture), the coordinate readout, the coordinate/link/Plus Code field, Move pin here and Confirm. Defect: the keyboard covered the panel, so the field and Move button were hidden while typing. Fixed in **PR #54** (panel lifts by keyboard height). Recheck on the next QA build.

## Phone matrix from Sol (QA APKs bcc0c97)

PASS: SEARCH-32, CASH-LIMIT-34, PARCEL-CASH-TRIP, C-03, D-07, A-06.
FAIL, fixed since: A-02 (#48), A-03 (#38), C-07 (#51), X-01 (#39), and the admin cash stale notice (#50).
BLOCKED-HARNESS: C-01 (needs the #41 ordinary APK), X-04 (release profiling), X-05 saved summary (bundled identity).
A-01: the lost-ack remittance can't be recovered in the UI (server is fine, exactly one receipt). Not fixed yet.

Known phone tricks:
- Samsung Edge-panel "covered" refusal: tap by coordinates, check focus, then type.
- Arabic input: agent-device `open --test-ime` on test packages only; restore the IME afterwards.

## Test PC (K5) recipe

- `C:\Users\osama\AppData\Local\Temp\claude\…\scratchpad\k5run.sh` (copy at `C:\w\wip-backup-1115`): git archive HEAD → `D:\wind-lead-1115\<label>`, node_modules junction to `D:\wind-master-bcc0c97-codex\node_modules` (only while the lockfile equals bcc0c97's), Node 24 at `D:\wind-verify-20261113\tools`.
- Release QA: `D:\wind-lead-1115\k5-rel.ps1`, launched via WMI so it outlives SSH. It starts the loopback sandbox (4191) from the release tree, then builds the scripted role APKs and the ordinary APK into `D:\wind-lead-1115\apks-<sha>`. The fault proxy (4201) from Sol is still up.
- Phone path: `adb reverse tcp:4191 tcp:4191` → this PC 4191 → SSH tunnel `-L 4191:127.0.0.1:4201` → K5 proxy 4201 → sandbox 4191.

## Next, in order

1. Codex second review of #47/#48/#49/#51/#52/#54 (after quota reset) and fixes. Merge #54.
1b. C-01 offline summary root cause (Fable UX-01). Start by reading the protected `summary` slot after an online `/orders` fetch on the device (e.g. a debug build or a temporary log line in a QA-only build).
2. A-01: done in #52 (in production `ec6b951`); needs a phone recheck on the next QA build.
3. Release-gate matrix on the new QA APKs: C-01 (ordinary APK), A-02/A-03/C-07/X-01 rechecks, and the remaining Appendix F cases.
4. Production APK 1.1.1: done (see Production). The next APK carries #54 and the C-01 fix. Upload with `az storage blob upload --auth-mode key` (login auth lacks a blob data role).
5. Fable ports still open: UX-05 (driver support status and multi-recipient), A14 (native deadline re-arm; dev build plus physical reboot/time-change proof), and the WP-09 re-scope (delivery failures separate from cash variance).
6. Owner-only: alert route (WP-08), SMS provider (WP-04), email domain (WP-05), Option A PostgreSQL rehearsal (A5), and Basv2 quota in Sweden Central if cost matters.
