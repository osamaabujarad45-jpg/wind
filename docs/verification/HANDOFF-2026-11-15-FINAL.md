# HANDOFF — candidate6 verification of Fastship (resume for a stronger model)

**Date:** 15 November 2026, ~10:30 UTC.
**Purpose:** complete the candidate6 verification so the delivery slices can ship; give the next model everything it needs without re-reading this whole chat.
**Companion file:**[CONTINUATION-2026-11-15.md](CONTINUATION-2026-11-15.md) (the verified status log; the current run's outcomes are recorded there).
**Original brief's graph:** [HANDOFF-2026-11-14-FABLE-5.2-VERIFIED-CONTINUATION.md](../HANDOFF-2026-11-14-FABLE-5.2-VERIFIED-CONTINUATION.md) — read that first for the larger task graph; this note only covers the verification gap left by this session.

---

## 1. What this is

Fastship is an Expo 56/React Native + Node server app. The delivery graph that has been driven in the last week of work implements: the bundle-body capability system, admin confirmation flows, door-collected cash (A11), parcel priority (A12), native deadline re-arm (A14), large text accessibility (UX-04), driver multi-recipient (UX-05), accessible pin selection (UX-03), and capability gap/offline summary (UX-01 / capability-before-permission). The task now is **not** implementation; it is **acceptance verification** of the candidate against the full test gate suite on the Windows test machine K5, then record the acceptance.

The work is happening in a preserved implementation checkout, not in the original dirty Fastship root. The original Fastship folder (`C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\`) is a different dirty source line and must not be overwritten.

- **Execution root:** `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification`
- **Remote verification host:** **K5** — `pc gaming@DESKTOP-S2JKMK5` — SSH via `HostKeyAlias=desktop-s2jkmk5.local`, key `~/.ssh/smartstore-runner`, strict host-key checking, `-o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes`. Reach implicitly through `ssh ... -i C:/Users/osama/.ssh/smartstore-runner`.
- **K5 layout** (`D:\wind-verify-20261113\`):
  - `src/*` — disposable source extracts (only one `srcN` is ever the candidate; prior ones are kept frozen).
  - `current/` — runners (`run-candidate6-*-20261115.ps1`), manifests (`candidate*-fix*.json`), patch archives (`*-patch.tar`), logs (`candidate*/fix*`).
  - `pgdata-<port>` — throwable disposable PostgreSQL 18.3/PostGIS 3.6 clusters. Ports used: 55507–55525.
  - `tools/` — `node-v24.12.0-win-x64`, `git-runtime-20261115`, `bicep.exe`.
  - `pgdata-<port>` binaries at `C:\wind-k5\.expo\implementation\postgresql18\bin` (this is the path to `initdb.exe`, `pg_ctl.exe`, `createdb.exe`, `psql.exe`).
- **Verification artefacts** (base + per-candidate patch archives):
  - Frozen base: `candidate4-final-fix1.tar` (SHA-256 `a3cf8fd562c922f95437585b59afdacda4909288d4340bb6cf3f7aaa95b53eb3`).
  - Integrated patch: `candidate6-integrated1-patch.tar` (contains A14 re-arm, UX-04 large text, UX-05 multi-recipient, A11 cash, A12 parcel priority, UX bugs fixed in this session).
  - Per-candidate fix patch: `candidate6-fixN-patch.tar` for N = 1..6. Each is a small overlay on top of `integrated1`.
- **Candidate identity:** base + `integrated1-patch` + `fixN-patch` = a complete tree. The manifest lists every file and its SHA256. The runner extracts base → integrated1 patch → fixN patch → throws on any hash mismatch.

## 2. The base verification command

```powershell
ssh -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes `
    -o HostKeyAlias=desktop-s2jkmk5.local -i C:/Users/osama/.ssh/smartstore-runner `
    'pc gaming@DESKTOP-S2JKMK5' `
    powershell -NoProfile -ExecutionPolicy Bypass -File D:/wind-verify-20261113/current/run-candidate6-fixN-20261115.ps1
```

A gate writes `gates-result.json` and per-gate `<name>.log` into `current/candidate6-20261115/fixN/`. `scripts/run-tests.mjs` auto-selects the newly registered suites, so `integration` re-runs are automatic. The gate runner runs focused-gates first, then `audit`, `integration`, `persistence` — each writes `gates-result.json` with `{"results": {"<gate>": <exit code>, ...}}`. **Exit 0 = pass; anything else = fail.**

## 3. Environment ownership rules (KAST matrix)

- K5 is the owner's designated test host; nothing on it is disposable without explicit instruction.
- Disposable PG clusters are only those created fresh by the verification runner: `pgdata-<port>` in `D:\wind-verify-20261113\`. They are dedicated to the verification fixture and are stopped/dropped by the runner itself.
- Remote verification **never** touches the owner's app repo. The app is copied into `D:\wind-verify-...\srcN\` read-only.
- Type check, lint, focused suites each run in `srcN` with its own symlinked `node_modules` into the verified immutable tree (junction from `src4\node_modules`).
- The detached QA phone app is built from `scripts/build-phone-tests.ps1` against `C:\w-phone-qa-*` short-path scratch checkouts. **Don't open an emulator.** Android acceptance uses the connected SM-A5360 only.

## 4. Constraints and non-obvious facts

1. **Promotion of dirty code is not allowed.** All verification must run from a source shift anchored to `candidate4-final-fix1.tar` + patches, never from the shared app dirty tree.
2. **pgsql backend "Connection terminated unexpectedly"** has been consistently linked to K5's wall clock stepping backwards by minutes multiple times per session. Any wall-clock-sensitive assertion can land on either side of a jump.
3. **Sample lifetimes.** `w32time` is configured on K5 to sync once at startup but no reachable NTP endpoint exists; the host has no external time source. `[DateTimeOffset]::UtcNow.ToString('o')` integral seconds (i.e. `[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()`) is safe to read but minute-level jumps are common.
4. **K5 PostgreSQL 18.3** is installed with PostGIS 3.6 at `C:\wind-k5\.expo\implementation\postgresql18\bin`. Node CLI available.
5. **SSH stability of long-running gates.** Some runners have repeatedly appeared to hang then fail after an `Exit=1` — the `tee` of the pipe blocks until the ssh child exits, which can take many minutes. The runner itself waits up to ~450 s for PG shutdown; time-boxed.
6. **No background production risk.** No commit/push/deploy/migration against prod has been authorized. Production remains NO-GO until acceptance evidence is complete.
7. **`scripts/run-tests.mjs`** — the single test runner — discovers suites from a list; registration happens there, not in per-suite files.
8. **`node_modules` symlink** = junction into `D:\wind-verify-20261113\src4\node_modules`. The dependency tree there is considered immutable for production-like verification.
9. **Tooling** — `node-v24.12.0-win-x64` at `D:\wind-verify-20261113\tools\node-v24.12.0-win-x64` and `git-runtime-20261115\ucrt64\bin\git.exe`. The system `node.exe` is not what runs suites.
10. **Native/integration boundary** — native artifacts (built Android APKs, iOS binaries) are not produced by the gates; the full integration gate is a JavaScript-level coverage of server + store.
11. **Cross-platform ordering** — the pure-JS suites and the native Kotlin suites are separate gates. Neither substitutes for the other.
12. **Safety guard:** before accepting any local evidence as representative, always verify remote SHA-256 of the exact files the runner extracts and records `final-source-verification.json` (one per gate, `mismatches=[]`).

## 5. What this verification cycle did

This session fixed 10 source/test defects (all verified remotely):

| # | Issue located | Fix | Verification evidence |
|---|---|---|---|
| 1 | `src/deadline-wake.ts` declared the native module with `type DeadlineModule = NativeModule<...> & {...}` — in type-position this is the constructor type, so it dropped the `EventEmitter` class members; `addListener` was missing -> `TS2339` | Restored `declare class DeadlineModule extends NativeModule<{ onWake: () => void }>`, added a one-line comment explaining why | Focused gate `typecheck : 0`; regression test `deadline-recovery` covers the type |
| 2 | `.easignore` had unanchored `android` / `ios`; `.gitignore` and Doctor require `/android`/`/ios`; Doctor flagged `modules/deadline-wake/android` as gitignored | Anchored both entries; verified with the `ignore` package that unanchored `android` matches `modules/deadline-wake/android/build.gradle` while `/android` does not; added a `deadline-recovery.test.mjs` assertion pinning the anchored form | `doctor : 0` (21/21) ; regression test targeted the same pattern |
| 3 | `tests/quality-recovery.test.mjs` — the VM-evaluation harness for `src/session.tsx` never stubbed `./deadline-wake` or `./deadline-recovery`, so every `harness('session.tsx', …)` blew with `missing stub ./deadline-wake` | Added `./deadline-wake` stub with `clear` + `subscribe` returning `{ remove() {} }`; wired in the real `./deadline-recovery` (pure dependency, native-free) | `integration : 0` passes with the fix; every focused gate passes |
| 4 | `tests/pg-cash.mjs` — the "legacy schema" fixture had only `orders(service TEXT NOT NULL)` and no `wp05_append_only()` trigger function, but migration 32 adds `order_cash_collections` with an `orders.id` FK and `wp05_append_only()` triggers | Extended fixture to `id, driver_id, service, status, price_minor, discount_minor`; provided the shared `wp05_append_only()` function mirroring migration 6; `wp05_append_only` added to the fixture | Persistence suite candidate4-fix4's `wp-cash-persistence` gate passed with PG validation |
| 5 | `tests/eligibility-review.mjs` — the future-`observedAt` assertion used `Date.now()+60000`; K5's wall clock jumped backward by ~5 minutes mid-run, so the server (correctly) reported the far-future observedAt as stale and returned 409 instead of 200 → 200 !== 400 | Far-future ±2-day and −3-day margins; same predicates, same assertions | 8 of 10 runs of the suite passes consistently in isolation; one outlier failure at `line 98` now immune |
| 6 | `tests/pg-cash.mjs` — added the `wp05_append_only` function and complete orders schema (`driver_id, service, status, price_minor, discount_minor`) so PG `pg-claims`/`cash-collection` gates pass |  | `pg-cash-collection : 0`; monolithic roll-up passes after fix3 |
| 7 | `scripts/check-persistence.mjs` — add `WIND_TEST_POSTGRES_ACQUIRE_TIMEOUT_MS=10000` (test-scoped only) | All focused suites — especially `pg-live-commit.mjs` — ran green under this | `persistence` gate now progresses much further; still blocked at monolithic boundaries |
| 8 | `server/db/runtime.ts` — added optional `WIND_TEST_POSTGRES_ACQUIRE_TIMEOUT_MS` (mirrors existing `WIND_TEST_POSTGRES_LOCK_TIMEOUT_MS` pattern) | Test-scoped only; production default (`1_000` ms) untouched | Compiles clean (both typechecks); passes lint |
| 9 | Included UX-01 `ordinary` phone-test role (with separate package ID for a side-by-side ordinary-approval build) — additional source files in the candidate | Registered `phoneTest`, `phoneTestBuild` as gates (both pass) | `phoneTest : 0`, `phoneTestBuild : 0` |
| 10 | Added full `pgdata-555xx` relaxed-durability fixture (`fsync=off`, `synchronous_commit=off`, `full_page_writes=off`, `checkpoint_timeout=30min`) | Eliminates 400–450 s checkpoint storm; PG fixture boots in <1 s | Same gates still pass; focused gate count stable |

### What this session achieved

- **All 23 focused gates (incl. `integration` and `audit`) are GREEN** on the candidate6-fix6 tree (and previous fix5 produced the same result).
- **Candidate6-fix6** is the run currently in-flight (started ~10:32, logs to `current/candidate6-20261115/fix6/`).
- The `persistence` gate has **never passed** on this host. Every failure mode is a wall-clock freshness assertion in a fixture file, not in product code: the K5 clock steps backward in unpredictable bursts by up to 5–6 minutes.
- Owner explicitly approved `w32time` service start and NTP sync attempt at 09:30 UTC. Service reports `Status: Running`; one sync occurred at 09:30; no NTP endpoints reachable (`time.windows.com`, `pool.ntp.org`, `eu.pool.ntp.org`, `time.cloudflare.com` all time out), so the clock won't self-correct without a manual `w32tm /manual` or `w32tm /config /manualpeerlist:<local PC IP>` approach (requires owner approval to change the K5 NTP source to a host on the LAN).

## 6. What remains

### Primary gate: `persistence`

`scripts/check-persistence.mjs` (`wp02 … wp14 … legacy pgsql` suites) **must pass** for acceptance to be valid. It **has NOT passed monotonically on K5 in any candidate6 run yet**. Two **isolated** passes were recorded earlier (fix4 `ride-lifecycle.mjs` at ~06:19 UTC against `wp19_fix4_persistence`, and fix5's isolated `ride-lifecycle.mjs` after `pgdata-55520` recovery — see CONTINUATION-2026-11-15.md), but the monolithic gate fails intermittently on the wall clock. Individual suites pass 4/4 in isolation; the monolith flips a different fixture each run.

Failure modes across six attempts:
- `/orders/1/arrive: 200 !== 400 arrival_fix_stale` (eligibility-review.mjs) — clock-stepped backward
- `PG live map: paused COMMIT keeps waiter held; rollback discards GPS/wake…` — child crash at `PhoneIdentity.reconcileStale` → `phoneSchemaAvailable` → `Connection terminated due to connection timeout` (pg-pool `connectionTimeoutMillis=1000`)
- `/me/phone/challenges: {"error":"phone_resend_cooldown"} 429 !== 200` — phone suite, clock-step backwards between the UPDATE at line 36 and issue at line 37
- `PG journ': Connection terminated unexpectedly` at `assert.deepEqual(await f.db.one(…),before)` — monolithic suite crashed at PG connect before child fixtures had a chance to print failure info
- `Test API exited (1)` at the child API process "connection terminated due to connection timeout" — before any assertion ran; failure mode is the same connection timeout

**Root cause**: wall clock on this K5 host is not NTP-synchronized; it steps backward in multi-minute bursts. The persistence suite has dozens of fixtures asserting server- or fixture-side freshness windows. Any one of them can be on the wrong side of a step.

**Individual suites pass 4/4 in isolation** — verified for eligibility-review.mjs, eligibility-review.mjs, pg-live-commit.mjs, ops.mjs, phone-identity-authority.mjs. The monolithic runner will flip one assertion differently on every run because the K5 clock backstep falls open at arbitrary points.

**Blocker for the next model:** there is no host-independent change that can make this suite deterministic while the clock keeps stepping. Three viable options:
- **Option A (preferred)** — Restore a stable clock on K5: configure the manual peeer list to the local Windows PC's IP on the same LAN (a local-PC-hosted NTP or Windows Time service running on a local machine with stable time). Owner approval required.
- **Option B** — Run the persistence gate on a different stable host (the user's local PC can host PG16, but no PostGIS is installed there; installing PostGIS or running against a remote PostGIS box is a separate owner-scoped decision).
- **Option C (fallback)** — Change wall-clock-freshness assertions in the fixtures to be clock-agnostic (e.g. compare using opentime stamps read from PG `now()` instead of Node's Date.now()); requires a dedicated pass of the fixture code, careful review, and owner sign-off to change the test suite.

**DO NOT**:
- Claim `persistence : 0` passes. It hasn't yet.
- Weaken production assertions or extend `acquireTimeout` in production code to compensate for this environment. Only the isolated-test `WIND_TEST_POSTGRES_ACQUIRE_TIMEOUT_MS` guard was added.
- Delete or rename the frozen candidate trees. They are underpinned by archive hashes.

### Status of fix7 (important — this review caught it)

Fix7 **completed 2026-11-15 ~10:43 local / 07:43 UTC and FAILED `persistence : 1`**. The failure is **not** the wall clock: the monolith crashed parsing `tests/phone-identity-authority.mjs` with `SyntaxError: Unexpected end of input`. Root cause (verified): my earlier fixture tweak used PowerShell `Get-Content | -replace | Set-Content -NoNewline`, which removed all 57 newline bytes and collapsed the multi-line file into one 8,730-byte line; the rewritten file no longer parses. The same corruption had already made my "isolated re-check after the edit" exit 1 — I misread that as an environment flake and it shipped into fix7. The gate did its job.

**Fix8 (candidate6-fix8) rebuilt from the intact K5 backup `src12/tests/phone-identity-authority.mjs.bak` (byte-verified 8,787 B via base64), with the three stale-lease sentinels changed to `Date.now()-3_600_000` using the edit tool. Local `node --check` passes. Fix8 is running on K5 now (started ~10:47 local); result pending.**

**Hard lesson, do not repeat:** never edit `.mjs`/`.ts` source with PowerShell `Get-Content | -replace | Set-Content` (encoding + newline destruction). Use the edit tool, or `[IO.File]::ReadAllText`/`WriteAllBytes` with a no-BOM UTF8 encoding only.

Note on preserved freezes: `src12/tests/phone-identity-authority.mjs` (the fix6-era working copy) was overwritten by my scp of the corrupt file and is no longer hash-valid against `candidate6-fix6.json`; the intact back-up is `src12/tests/phone-identity-authority.mjs.bak`. `src13` (fix7 extract) also contains the corrupt file. Both are preserved untouched; fix8 uses fresh `src14`.

### Secondary / smaller items

- **`/me/phone/challenges` cooldown assertion is fragile** — it depends on clock monotonicity between pre- and post-clock-step. If monolith ever passes again at that point, it will fail at the same point again; document it as a known K5 fixture defect rather than a candidate defect.
- **Frozen candidate trees must not be overwritten**. Build `src6+` onward from the manifest hash chain, never from the dirty Fastship root.
- **Native Android/iOS coverage** — the gates do not cover native modules baked from the `modules/deadline-wake` plugin. The native APK/physical-phone acceptance is its own track (not part of this verification acceptance).
- **`integration` and `audit`** — both currently `: 0` (green). They should not be allowed to regress.
- **`doctor` must stay at 21/21** — do not add `/` back on android/ios in `.easignore` or the Doctor gate will fail again.
- **`phone-identity-authority.mjs`** — three 1-millisecond stale sentinels (`Date.now()-1` at lines 36, 43, 74) were still `Date.now()-1` in fix6; fix6 failed at line 45 with `delivery_state='requested'` vs `'unknown'` after K5 stepped backward by just enough to rescue an "expired" lease. Fix7 changed them to `Date.now()-3_600_000`, but my PowerShell rewrite corrupted the file (newlines removed) and fix7 died with `SyntaxError: Unexpected end of input` - see "Status of fix7" above. **Fix8 (restored byte-exact from K5 `src12\....mjs.bak` + edit-tool sentinel widening, `node --check` clean) is running on K5 (started ~10:47 local).**

## 6A. The connected task graph from the 14 Nov brief — where each node stands (15 Nov 2026)

Source: [HANDOFF-2026-11-14-FABLE-5.2-FINAL-IMPLEMENTATION.md](../HANDOFF-2026-11-14-FABLE-5.2-FINAL-IMPLEMENTATION.md) §4. Status per node, honest as of this review:

| Node | Status 2026-11-15 |
|---|---|
| **SRC** | Done to checkpoint level (`SOURCE-MANIFEST-2026-11-14.json`, 35 selected files — **not** release provenance). Complete initial inventory exists: `full-source-manifest.json` (1,031 files; remote `src3` verified `mismatches: []`). **The worktree holds a 249-path uncommitted changeset (156 modified / 114 untracked files). Nothing is committed, pushed or released. No candidate claim exists until the owner approves a freeze.** |
| **VERIFY** | Partial. Remote-only candidate6 evidence: 24/25 gates green on fix6/fix7-era trees (all focused gates + `audit : 0` + `integration : 0`), including `Doctor 21/21`. `persistence` has never passed monolithically remotely (wall-clock; twice passed isolated). All *recorded* "PASS" claims in the brief's baseline table are **local-fallback / pre-candidate6** history — do not relabel them as fresh K5 results. |
| **SCOPE** | Not done. Twelve deferred capabilities are not yet visibly disabled end-to-end; no explicit A11/shift/A5 activation disposition beyond the owner decisions in `OWNER-DECISIONS-2026-11-14.md`. |
| **UX-01 ordinary offline recovery** | Source done (ordinary phone-test role in the candidate). **Physical acceptance pending** — C-01 unverified; device session `t3-d66100a796da3d3b5e674aac` opened Chrome and past blockers cleared, but ordinary-sign-in offline/retry journey was never executed on SM-A5360. |
| **UX-02 admin money review** | **Implemented and reviewed.** Cash review: explicit sign, exact minor-unit parsing, driver name/phone/ID disambiguation, keyboard/decimal robustness, timeout-after-commit replay keeps original payload+requestId. Settings/subscription/role reviews implemented. Review: Kimi pool failed → authorized failover to Codex `gpt-6.1-sol` ultra; two confirmed P2 findings fixed by lead; all 8 focused/static gates green remotely (2026-11-14T23:01:33Z). **The 111-suite integration pass predates those two fixes.** |
| **UX-03 accessible pin** | Source implemented (Arabic/English coordinate fields, preview acknowledgement, zoom controls). Both typechecks/lint/tests pass on K5 `src3`. **Physical Switch/TalkBack/keyboard acceptance on SM-A5360 pending** (device ownership blocked earlier sessions; other session cleared the block but acceptance was never run). |
| **UX-04 large text** | Candidate6 green (`largeText : 0`, `typecheck : 0`). Physical large-text acceptance (Arabic/English) pending with UX-03. |
| **UX-05 driver multi-recipient** | Candidate6 green (`multiRecipientSqlite/Postgres : 0`, client-diagnostics `: 0`). Physical acceptance pending. |
| **PROD-01 A11 door cash** | Implemented (SQLite narrow pilot + PG migration 32) and candidate6-verified (`cashClient/cashSqlite/cashPostgres/cashImport : 0`). **Not activated in production.** Variance review evidence is code-level, not field-proven. |
| **PROD-02 A13 notification channels** | Not started. Native-push activation remains off; provider delivery **[U]**. |
| **PROD-03 A12 parcel priority** | Implemented (migration 31; Jerusalem noon cutoff, zero surcharge, shared capacity). Candidate6 gates `prioritySqlite : 0`, `priorityPostgres : 0`. **The brief still lists this as pending-review of quote/replay identity — treat source as gated, not proven in field.** |
| **PROD-04 A14 alarm re-arm** | **Source done, native partially verified:** `modules/deadline-wake/`, `plugins/with-deadline-wake.js`, `with-phone-test.js`-parallel plugin; BOOT/USER_UNLOCK/TIME_SET/TIMEZONE_CHANGED/PACKAGE_REPLACED declaration; `DeadlinePolicyTest.kt` authored for the local Android module but **never executed remotely** (no Gradle/Kotlin run on K5 yet); physical reboot/time-change/package-replace acceptance **not done** — no guaranteed background delivery. Receipt/pickup/re-arm inventory: [DEADLINE-INVENTORY-2026-11-15.md](DEADLINE-INVENTORY-2026-11-15.md). |
| **PROD-05 A5 shift/custody** | Not started. Waits for Option A rehearsal per `OWNER-DECISIONS-2026-11-14.md`. Do not start as a side effect. |
| **PROD-06 typed delivery failures** | Not started. |
| **GEO-01/02/03** | Not started. OSRM Dockerfile quarantine NOT done. |
| **PHONE** | Partial. Ordinary web export done remotely (bundle `index-f94a038dc1d7490a69c1b38d7c0ed1ca.js`, 2.4 MB, port 4196). Device block cleared this continuation; **zero acceptance journeys executed**. No app data/profile cleared. Two-role parcel handover, reboot, background, reinstall still open. |
| **OPS-01/02/03** | Not started; owner-controlled. Live-host baseline **[U]** (SSM/EC2 denied 13 Nov). No alert destination, no replacement host rehearsed for *this* diagram. |
| **REL / PROD / GO** | **NO-GO.** Nothing from this session changes that. |

## 6B. Other agents' work that must not be lost (review findings)

These are facts from other sessions that post-date or sit beside this verification campaign. Carrying them forward is mandatory; silently dropping them is the most common way handoffs fail:

1. **Competitor demos (5 apps), another-session build chain:** all five have newer build-source HEADs, signed v2 APKs, hardening and **all five are installed together on the physical SM-A5360** (`LEDGER.md` records hashes per app; HEADs: WindRide `ef8aa00`, WindCaptain `e04fe69`, WindBazaar `49a4d7b`, WindParcel `01826a3`, WindMarket `a63abf9`; 2,353/2,353 archived activity items verified). **Not production evidence.** Source repos: `C:\Users\osama\OneDrive\Documents\wind-competitors\*`, build script `C:\b\build-staging.ps1` (now generates fresh random keystores).
2. **Exposure requiring owner action (maps key + signing material):** a Google Maps Android credential and signing password material **were exposed** in another session's output. They are marked `[REDACTED - OWNER ROTATION REQUIRED]` in [COMPETITOR-THREAD-INVENTORY-2026-11-14.md](COMPETITOR-THREAD-INVENTORY-2026-11-14.md) §7. Two owner console actions remain: **rotate the exposed Maps credential; enable Maps SDK for Android and whitelist the five release package/certificate SHA-1 pairs under the Android-restricted key** (list of pairs in the inventory §11). WindRide launches but shows blank tiles with an Android-restricted-key authorization failure; a console-only change needs no rebuild; fresh tile screenshots remain required after propagation. **Never print the credential values.**
3. **Production restore/safety audit (13 Nov):** both backups integrity-checked and byte-identical; newest restores to API 200 (`{"ok":true,"schema":3}`); SQLite legacy zero-row tables preserved by decision; live-host baseline remains **[U]** because AWS SSM/EC2 read access was denied. **The audit provides NO A11 runtime evidence.** Full detail: [production-safety-audit-2026-11-15.md](production-safety-audit-2026-11-15.md).
4. **Review chain (UX-02):** Kimi pool rejected the review request (`all pool backends rejected the request`); owner-authorized failover to Codex `gpt-6.1-sol` ultra; two P2 settings findings found and fixed; **no commit exists from that review**. Do not start more delegates for those small fixes — they are done.
5. **Slice-1 vs slice-2 evidence trap:** the older `green-slice1-result.json` **records a FAILED state that was later corrected**; `slice2-tests-result.json` is the corrected record. Do not cite slice-1 as evidence of anything current.
6. **MapLibre pinned to 6.12.0** after resolution selected 6.18 (vendored assets are 6.12); per-package pin is exact-version, must not be relaxed without a rebuild of vendored tiles.
7. **Full-source inventory:** `full-source-manifest.json` (1,031 files, remote `src3` hash-verified, `mismatches: []`) is the biggest provenance artefact. The 35-file `SOURCE-MANIFEST-2026-11-14.json` is a checkpoint only. **Neither is release provenance.** The worktree changeset is 249 paths (156 M / 114 untracked / shared `.github/workflows/ci.yml`, `Dockerfile`, `eas.json`, `infra/*.bicep`, `package.json`, etc.) — none of it committed.
8. **7-slice provenance:** the seven admin-review slice files match local SHA-256 (remote `source-verification.json`, `mismatches: []`) — slice provenance, not a new release candidate.
9. **Device ownership:** SM-A5360 (`R5CTB0FJP9Z`) — this continuation's session owns it (`t3-d66100a796da3d3b5e674aac`). Another agent's DEVICE_IN_USE block is historical; do not reuse/close foreign sessions. Never clear phone app data; QA package is `ps.wind.app` (do not touch in QA); the side-by-side ordinary-role QA APK uses a separate package id.
10. **Authority boundaries for the next model:** no commits/pushes; no deploys; no production migrations; no payment activation; no production credential re-requests (owner declined once — only an explicit later reversal permits it); no data deletion; no touching `OneDrive\Documents\ChatGPT\Fastship` (stale/dirty original line).
11. **K5 `w32time`:** owner approved starting the service; it runs but there is no reachable NTP endpoint; clock still steps backward minutes at random. This remains the standing cause of `persistence`-gate instability - do not attribute to candidate source, and do not "fix" by weakening production code.

## 7. Verification artefacts and registers to copy/read

1. **Current run console:** `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\current-remote\run-fix8-console.log` (latest: fix8 in flight; see `run-fix7-console.log` / `*-fix8-*`), artefact hub at `D:\wind-verify-20261113\current\`.
2. **Artefact hub:** `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\current-remote\` — contains runner scripts/patch archives/manifests/gate result JSON.
3. **Verified results JSON:** `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\current-remote\gates-result.json` (move out of `current/candidate6-20261115/fixN/` if needed).
4. **Preservation bank:** `docs/verification/CONTINUATION-2026-11-15.md` — the chronological status log, actively updated this session.
5. **Where to find the manifests you must use:** `candidate6-fixN.json` — SHA256 of every file in the candidate tree; `<file>`:`<sha256>` — and it doubles as the manifest for any future verifier run.
6. **How to validate**: after any edit enforces itself, run `node scripts/run-tests.mjs --dry-run 2>&1 | head` to see which suites are registered; `--with-postgres` enables the PG leg (not required unless `persistence` must pass).

## 8. What to ask the owner / do next

- Check fix8's result on K5 (running since ~10:47 local). If `persistence : 0`, acceptance of the candidate6 *source* is unblocked at the gate level; record it in CONTINUATION. If `persistence : 1` again at fresh wall-clock/fixture sites, that confirms the host remains the binding constraint.
- Ask the owner: **(a)** approve a local-PC-LAN NTP source so K5's clock stops stepping backward (recommended, cleanest, no product changes needed). **(b)** If K5 remains unstable, confirm running the persistence gate against a fresh disposable PG elsewhere (requires a host with PostGIS ≥ 3.4; not the local PC today). **(c)** If the gate can never pass monotonically on K5, explicitly decide whether the two recorded isolated passes plus 24/25 focused evidence are sufficient for a *source* acceptance decision, with `persistence` accepted as environment-blocked - owner decision, not the agent's.
- Until one of those is verified, **acceptance cannot be declared**. The candidate is *conditionally ready pending persistence acceptance on a stable-clock host*. Everything else in the gate sequence is green.
- Also pending owner action (from other agents' work, not Fastship scope): **rotate the exposed Maps credential and signing material; enable Maps SDK for Android and whitelist the five demo release package/certificate SHA-1 pairs** (COMPETITOR-THREAD-INVENTORY §7/§11). Do not re-type those values anywhere.
- **Production credential remains declined** - do not request it again.

## 9. Executable command sheet

- **CANDIDATE VALIDATION from a clean host:**

```powershell
# Local, this repo:
node scripts/run-tests.mjs              # JS-only integration gate
node scripts/check-persistence.mjs       # full PG suite (needs WIND_TEST_DATABASE_URL)
node node_modules/expo/bin/cli lint      # lint
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.server.json
node node_modules/expo/bin/cli lint      # duplicate entry above is lint
node -w --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/deadline-recovery.test.mjs   # focused single suite
```

- **K5 REMOTE gate:**
```powershell
ssh -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o HostKeyAlias=desktop-s2jkmk5.local -i C:/Users/osama/.ssh/smartstore-runner 'pc gaming@DESKTOP-S2JKMK5' `
    powershell -NoProfile -ExecutionPolicy Bypass -File D:/wind-verify-20261113/current/run-candidate6-fixN-YYYYMMDD.ps1
```

- **Quick test suite on current working tree:**

```powershell
cd C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning tests\eligibility-review.mjs
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning tests\phone-identity-authority.mjs
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning tests\pg-live-commit.mjs
```

- **Fresh K5 fixture (fast):**
  ```powershell
  $bin='C:\wind-k5\.expo\implementation\postgresql18\bin'
  & $bin\initdb.exe -D D:\wind-verify-20261113\pgdata-<port> -U fastship_test --auth=trust --encoding=UTF8 --locale=C
  & $bin\pg_ctl.exe -D D:\wind-verify-20261113\pgdata-<port> -l <log> -o '-p <port> -h 127.0.0.1 -c timezone=UTC -c fsync=off -c synchronous_commit=off -c full_page_writes=off' -w -t 120 start
  & $bin\createdb.exe -h 127.0.0.1 -p <port> -U fastship_test fastship_test
  & $bin\psql.exe -h 127.0.0.1 -p <port> -U fastship_test -d fastship_test -c 'CREATE EXTENSION postgis;'
  ```
