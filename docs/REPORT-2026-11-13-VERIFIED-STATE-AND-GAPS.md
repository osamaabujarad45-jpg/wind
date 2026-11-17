# Wind — verified state, corrected research, and the gap that is left

**13 November 2026.** Written after independently re-checking every load-bearing claim in
`docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md` (the 13 Nov Fable handoff) and the nine documents in
`research_notes/Fable 5.2 production upgrade handoff/` and
`research_notes/Fable 5.2 verified execution handoff/`.

**Base commit.** `origin/master` = `b89f220` (Merge PR #30). The local checkout is on `b609229`, which is
**not** a descendant of `origin/master` (`git merge-base --is-ancestor origin/master HEAD` exits 1) and carries
uncommitted modifications. Everything below was read from the **working tree** unless the row says
`origin/master`.

**Evidence labels.** `[ran]` executed in this session on the stated machine. `[read]` read in source at the
stated path. `[aws]` answered by a live AWS API call. `[ran, false]` — a check that looked like a finding and
was **not**; recorded so nobody re-raises it.

**Machines.** Owner PC `DESKTOP-…` (Windows 11, Node v24.12.0, Python 3.14.2). Phone `SM-A5360`
(adb `R5CTB0FJP9Z`, Android 16 / API 36, 1080×2400 @ 450 dpi, two SIMs: Ooredoo 42506 and Jawwal 42505,
both HOME, radio HSUPA 3G). AWS account `083712835043`, Region `eu-north-1`.

---

## 0. The short answer

0. **The app on every pilot phone points at a dead server.** The installed production build
   (`ps.wind.app`, versionCode **24**, built 9 Nov, 107,454,199 bytes, SHA-256
   `5248ABE94BB46DD9555E3DFEA4724C38279624B25A18AC1DCB58A66516891ABB`) has
   **`windapi236.swedencentral.cloudapp.azure.com`** compiled into `assets/index.android.bundle`
   `[ran]` — the Azure VM that was stopped on 12 Nov. The CloudFront hostname does **not** appear in that
   bundle at all. So the AWS backend is healthy and the client cannot reach it: this is a **build-configuration
   bug**, not a product gap, and it explains why the pilot has no completed orders. Everything else in this
   report is secondary to fixing it. See §3.6.

1. **The Fable handoff is directionally right and materially incomplete.** Its four workstream gaps
   (map honesty, address capture, ETA truth, operations) are the right ones. But it was written from the repo
   without running the app, the AWS account, or the phone, and it does not say the single most important fact
   about this pilot.
2. **The most important fact: production has never completed a delivery.** The only surviving production
   database contains **9 users, 2 cancelled orders, 0 completed orders, 0 cash-ledger entries, 0 sessions and
   0 push subscriptions** `[ran]`. Every measurement the handoff asks for — ETA error by city pair, courier
   take-home on a long trip, push delivery rate, repeat-customer rate — has **zero samples** and cannot be
   produced until real trips exist. The handoff's §5 D3 and §5 F are not "work to schedule"; they are blocked on
   a fact it never states.
3. **The local checkout is red, but `origin/master` is not that code.** `npm test` fails at
   `tests/booking-retry-race.test.mjs:97` on the **local working tree** (`b609229`, a stale line) `[ran]`. That
   test **does not exist on `origin/master`**, and `origin/master` already contains the fix it was written to
   demand: `[ran]` `git cat-file -e origin/master:tests/booking-retry-race.test.mjs` fails, and
   `origin/master:src/app/book.tsx` clears only when `!retrying && errorCode(e) !== 'booking_command_expired'`,
   with `quote_consumed` routed to a re-quote instead of a clear. **What is genuinely still open on
   `origin/master` is narrower: see the corrected table in 1.1 and the independent review in 11.**
4. **Two of the nine research documents are grounded in a different codebase.** `reference-rea-audit.md`
   describes Wind as a Supabase application in three places. Wind has no Supabase dependency and no occurrence
   of the string anywhere in `src/`, `server/` or `package.json` `[ran]`.
5. **The gap that is left is not features.** It is: fix the red P0, prove the backup and the alert, get a
   stable domain, then start collecting the trips that every other number depends on.

---

## 1. What was wrong or missing in the research, checked claim by claim

### 1.1 Claims that were true, and are now proven with a command

| # | Claim (source) | Verdict | Proof |
|---|---|---|---|
| 1 | Booking client drops the idempotency key on a post-lock 4xx, including `quote_consumed` | **TRUE of the stale local working tree only - already fixed on `origin/master`** | `[read]` the working-tree `src/app/book.tsx:379-382` clears for any 4xx except 401/408/429, which includes `quote_consumed`. `[ran]` **`origin/master` differs**: its guard also requires `!retrying && errorCode(e) !== 'booking_command_expired'`, and `quote_consumed` triggers a re-quote instead of a clear, with the in-code comment "Anything else may have committed ... only the receipt and deadline settle it". `[ran]` the test pinning the defect **does not exist on `origin/master`**. |
| 2 | Immediate capture bypasses the settlement gate (`server/domain/payments.ts`) | **TRUE on `origin/master`** | `[ran]` `git diff origin/master -- server/domain/payments.ts` is **empty**, so both trees are identical. `createIntent` writes `status='captured'` straight from `provider.create()` with **no** `settlementGate`, while `getIntent` and `applyProviderEvent` both gate, and `query()` is a second ungated path. |
| 3 | An Expo `ok` ticket is treated as delivered with no receipt processing | **TRUE on `origin/master`** - the code lives in `server/push.ts`, not `worker.ts` | `[read]` `server/push.ts:71-77` throws on `ticket.status === 'error'`, returns normally on `'ok'`, and there is **no receipt lookup** anywhere in the server. |
| 4 | Native push-token rotation has no subscription | **TRUE on `origin/master`** | `[read]` `origin/master:src/native-push.ts:41` calls `getExpoPushTokenAsync` and registers once; no `addPushTokenListener` anywhere. |
| 5 | Realtime waiters and routing budgets are process-local (`server/main.ts:2469-2501`) | **TRUE** | `[read]` `server/domain/realtime.ts` holds waiters and cursors in a process-local `Realtime` class; `server/domain/google-routing.ts:18-21,295-298` keeps daily counters in memory. PostgreSQL persistence does not make either shared. |
| 6 | Production is on AWS, behind CloudFront, with backups to S3 | **TRUE** | `[aws]` `GET https://dlvxzw3gj596d.cloudfront.net/api/ready` → `200 {"ok":true,"schema":3}`; `/api/health` → `200 {"ok":true}`. `[aws]` bucket `wind-backups-083712835043` exists. |
| 7 | MapLibre 6.12 in a WebView, tiles from OpenFreeMap | **TRUE** | `[read]` `public/vendor/maplibre-6.12.0/` is vendored; `react-native-maps` appears only in the optional Google renderer (`src/google-map.native.tsx`, `src/route-map.native.tsx`). |
| 8 | Android has no over-the-air updates | **TRUE** | `[ran]` `expo-updates` is not in `package.json`. |

### 1.2 Claims that were **wrong**, or wrong in a way that would send the next lead down the wrong path

| # | Claim | Why it is wrong | Evidence |
|---|---|---|---|
| 9 | **Wind uses Supabase.** "Real Supabase OTP and restored `wind.customer`/`wind.driver` sessions"; "Supabase Realtime/PG_NOTIFY consumers with invalidation exist"; "Reuse Wind's existing Supabase/Expo/MapLibre/OSM patterns" (`reference-rea-audit.md` L116, L127, L144) | Wind has **no** Supabase. The real stack is: opaque per-user identity plus a phone-OTP provider abstraction (`server/domain/phone-provider.ts`, limits in `server/domain/eligibility.ts:22-23`), sessions as server-issued bearer tokens, a **signed cursor event stream** (`server/domain/realtime.ts`), `node:sqlite` in production and `pg` for PostgreSQL. The research will send an implementer to "reuse Supabase patterns" that do not exist. | `[ran]` `git grep -c -i supabase origin/master -- src/ server/ package.json` → no matches. The string appears in **1 of 9** research documents, only in `reference-rea-audit.md`. |
| 10 | Careem's Android package is `co.careem.acma` (`reference-rea-audit.md` L74) | The real packages are `com.careem.acma` (rider), `com.careem.adma` (driver) and `com.careem.partner.app`. `co.careem.acma` does not resolve on the Play Store. | `[ran]` Play Store search for `careem` on 13 Nov returns exactly those three. |
| 11 | "131 test suites at `b89f220`" (Fable handoff §4 G1) | The measured counts are different. The integration runner lists **97** suites; the persistence runner lists **52**; `tests/` holds **99** `*.test.mjs` files plus **60** further `*.mjs` suites (160 files). `db-api.test.mjs` and `db-persistence.test.mjs` are deliberately excluded from the integration runner because they need PostgreSQL. Use the measured numbers, not 131. | `[ran]` parsed `scripts/run-tests.mjs` and `scripts/check-persistence.mjs`; listed `tests/`. |
| 12 | "The Wind share link lets a recipient without the app open a page" (§5 C2) — **true**, but the handoff does not say the link is bound to the AWS-owned host | The share URL is an https URL, not a deep link: `src/app/order/[id].tsx:565` builds `${API_URL}${path}` from `GET /orders/:id/share`, i.e. `https://dlvxzw3gj596d.cloudfront.net/track/<token>`, served by `src/app/track/[token].tsx`. The `wind://` scheme in `app.json` is the app's own deep link. So **deleting the CloudFront distribution breaks every tracking link already sent to a recipient on WhatsApp**, not only the installed apps. The handoff flagged the installed-app risk and missed the link risk. | `[read]` `src/app/order/[id].tsx:565-576`, `src/app/track/[token].tsx:1`, `app.json` `scheme`. `[ran]` REA of the shipped APK confirms the only BROWSABLE+VIEW scheme is `wind`. |
| 13 | "Azure runs the app, AWS is the safety net" (master plan) | Also true of **`docs/operations/deploy.md`**, which the handoff did not flag: the file is titled *Azure deployment preparation*, its first validation commands are `node scripts/check-azure.mjs` and `node tests/azure-infra.test.mjs`, and it still carries **18** Azure mentions including an Azure Flexible Server PostgreSQL **16** template with a PostGIS caveat. It does record the AWS move (L19) and labels the Azure part "history", so it is misleading rather than wrong — but an operator following it will run the wrong validator. `cost-model.md` (12 Azure mentions), `restore.md` (5) and `provider-failures.md` (1) are also still Azure-era. | `[read]` `docs/operations/deploy.md:1,11,12,19,44,83`; counted mentions per file. |

### 1.3 Things the research never mentioned that turned out to matter

| # | Finding | Why it matters | Evidence |
|---|---|---|---|
| 14 | **The production database has never completed a delivery.** 9 users (1 active admin, 8 blocked), 2 orders, **both `cancelled`**; `cash_entries` 0, `quotes` 0, `order_offers` 0, `driver_locations` 0, `sessions` 0, `saved_places` 0, `push_subscriptions` 0, `native_push_tokens` 0, `order_actions` 1, `security_events` 3, `checkpoints` 11, `road_restriction_policy` 1 row. | The pilot has no transactional history. Any number about ETA error, courier viability, cash reconciliation or push delivery has no sample. The handoff's workstreams B3, D3, F (parcel price) and row 28 are all unmeasurable, not unfinished. | `[ran]` downloaded `s3://wind-backups-083712835043/wind-20261112T165723Z.db.gz`, decompressed it (10,148 → 364,544 bytes) and counted every row of all 37 tables. |
| 15 | **The only in-app outage signal has no delivery path.** `server/main.ts:1208-1220` computes `backupStale` from a marker file and `alertMissedBackup` pushes to active admins — through `push_subscriptions`, which is **empty** in the production database. | The one signal that would tell the owner "the nightly backup has not run" cannot arrive. It is a card in the admin dashboard plus a push that has nowhere to go. With no Synthetics canary and no proven notification, the owner can be down for hours. | `[read]` `server/main.ts:1208-1220`; `[ran]` `push_subscriptions` = 0 rows in the restored production database. |
| 16 | **A second ungated payment-capture path.** `payments.ts:79` `query()` writes `captured` without `settlementGate`. It also calls `provider.query` a second time, because `getIntent()` already called it. | The research found one ungated path and asked for it to be fixed. Fixing only `createIntent` leaves `query()` able to move an order to captured while cash is already collected — the exact double-settlement the gate exists to prevent — and doubles provider traffic per poll. | `[read]` `server/domain/payments.ts:79` against the gated `getIntent` L78 and gated `applyProviderEvent` L91. |
| 17 | **The shipped customer APK asks for 14 third-party launcher-badge permissions** (HTC, SonyEricsson, SonyMobile, Anddoes, Majeur, Huawei, Oppo, Everything.badger, `READ_APP_BADGE`) on top of `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `USE_BIOMETRIC`, `USE_FINGERPRINT` — 32 permissions in total. | The customer build carries the driver's location permission surface because all four roles ship from one codebase. The badge permissions have no user-visible benefit in Wind and enlarge the permission and store-review surface for every pilot user. | `[ran]` REA `inspect-android-package` on the shipped production APK: 32 permissions enumerated. |
| 18 | **The shipped APK embeds Google Play services and Firebase** (`FirebaseMessagingService`, `FirebaseInitProvider`, `com.google.android.datatransport.runtime`, `ProfileInstaller`). | FCM is the push transport, which is fine and is what the handoff expects. But the handoff says "no crash reporting from the field", and the privacy notice plus the Play data-safety declaration have to describe what actually ships. | `[ran]` REA component inventory: 4 activities, 11 services, 13 receivers, 4 providers; 15,948 classes, 1,408 resources. |
| 19 | **The installed Uber build is 4.655.10001, one release newer than the one this repo studied** (4.654.10002, collected 30 Oct). The repo's Uber knowledge is therefore one release behind *and* the artifact roots it cites are gone from disk. | The Uber reference every Wind design decision leans on is currently neither current nor reproducible. A fresh pull of the real, newer, device-installed build restores reproducibility and is the evidence base for the new competitor work. | `[ran]` `dumpsys package com.ubercab` → `versionName=4.655.10001`; pulled 10 splits from the device. |
| 20 | **No competitor app had ever been studied.** The repo has a very deep Uber (US/global) study and public-store notes about Careem and HAAT. The apps Wind actually competes with in Palestine - Shiply and Souq Tulkarm - had no evidence at all. | A Palestinian parcel-and-cash app should copy the mechanics of the local market, not of Uber: landmark addresses, cash on delivery, driver cash settlement, WhatsApp ordering. | `[ran]` real builds pulled from the owner's phone and studied with REA. See section 5. **Two of the four apps we first assumed were competitors turned out not to be delivery apps at all** - see section 5.1b. |

### 1.4 One that looked like a bug and was not — recorded so it is not re-raised

| Check | Result |
|---|---|
| The Arabic push body in `server/worker.ts:191` appeared as `???? ????? ????` when read through the PowerShell console. | `[ran, false]` The **file is correct**: the raw bytes are valid UTF-8 (`\xd9\x84\xd8\xaf\xd9\x8a\xd9\x83 …` = "لديك تحديث جديد. افتح Wind للتعرض."). The `?` characters are a console code-page artifact, not the source. Do not "fix" it. |

---

## 2. Where the code actually stands (verified, not quoted)

### 2.1 The gate ladder, measured on the owner's PC

| Gate | Result | Detail |
|---|---|---|
| **G1 `npm test`** | **RED on the local working tree; never run on a clean `origin/master`** | `[ran]` on `b609229` (dirty) it fails at `tests/booking-retry-race.test.mjs:97` and the runner stops there, so 37 suites never run. **That test does not exist on `origin/master`**, and the behaviour it pins is fixed there. **A clean `origin/master` gate has never been run** - that is the single most important missing piece of evidence in this report (section 11). |
| …the 37 suites after the failure, run individually | 3 fail | `[ran]` `database-logging.test.mjs` and `subscription-migration.test.mjs` fail with `ECONNREFUSED 127.0.0.1:55473` — **no PostgreSQL on the expected port on this PC** (PostgreSQL 16 is installed and listening on 5432; the suites expect 55473). `clean-typecheck.test.mjs` fails with `spawnSync node ETIMEDOUT` — the typecheck exceeds the test's own timeout on this machine. **Only one failure is a code defect.** |
| G0 typecheck / lint | **not established on this PC** | The typecheck timed out inside its own test; it was not run to completion. PostgreSQL 18 + PostGIS 3.6 is what the suites were written against; only PG 16 is installed here, so the persistence gate cannot be run locally at all. |
| G2 `npm run test:persistence` | **not runnable here** | Needs PostgreSQL 18.3 with PostGIS 3.6 at `127.0.0.1:55473`. |
| G5 two-role phone trip | **not run** | The phone was used for measurement (§3) but no end-to-end parcel trip was run in this session. |
| Production `/api/ready` | **GREEN** | `[ran]` `{"ok":true,"schema":3}` on `https://dlvxzw3gj596d.cloudfront.net`. |

**What this means for the next lead.** The red test is a *correct* test of a *real* defect. The fix is in
`src/app/book.tsx:379-382`: keep the durable command across ambiguous and post-lock 4xx failures, reconcile it
against `GET /orders/commands/:requestId` before any new booking attempt, and allow abandonment only after an
authoritative terminal result. Then update the current-behaviour reproduction to assert the safe behaviour —
do not weaken the red test to make it green.

### 2.2 The pilot's actual operational state

| Fact | Value | Evidence |
|---|---|---|
| Production database | 9 users (1 active admin, 8 blocked), 2 orders, both cancelled | `[ran]` restored production backup, row counts |
| Completed deliveries | **0** | `[ran]` `orders.status` — 2 rows, both `cancelled` |
| Cash ledger | **0** entries | `[ran]` `cash_entries` count 0 |
| Customer sessions | **0** | `[ran]` `sessions` count 0 |
| Push subscriptions | **0** | `[ran]` `push_subscriptions` and `native_push_tokens` both 0 |
| Backups in S3 | **2 objects**: `wind-20261112T165723Z.db.gz` (10,148 B, 12 Nov 16:57Z, manual go-live run) and `wind-20261113T031001Z.db.gz` (10,148 B, 13 Nov 03:10:04Z, first scheduled run) | `[aws]` `s3 ls s3://wind-backups-083712835043 --recursive` |
| The scheduled backup | runs at **03:10 UTC** daily on the host (`infra/vm/wind.cron` → `infra/vm/wind-backup.sh`) | `[read]` |
| Observed backup behaviour | **The nightly backup works.** The 13 Nov **03:10 UTC** cron fired and uploaded `wind-20261113T031001Z.db.gz` — 10,148 B, `LastModified` **03:10:04Z**, i.e. the exact `infra/vm/wind.cron` slot and 3 s after the key's own `031001Z` stamp, so this is the scheduled run and not a manual upload `[aws]`. Downloaded and checked: `PRAGMA integrity_check` = **ok**, **364,544 B** decompressed, **37 tables**, and **every** table's row count matched the 12 Nov baseline exactly (9 users = 1 active admin + 8 blocked, 2 orders both `cancelled`, 1 order action, 3 security events, 11 checkpoints, 1 road-restriction policy, `cash_ledger` absent, all others 0) — zero differences, so neither new activity nor data loss `[ran]`. The decompressed file is also **byte-identical** to the 12 Nov copy (sha256 `0ea4d4bd…c1789`), which is what an idle pilot should look like `[ran]`. So the mechanism is proven; what remains unproven is a **restore drill** and the **alert** if a run is missed (section 2.2 note and 10.13). |
| CloudWatch Synthetics canaries in `eu-north-1` | **0** | `[aws]` `synthetics describe-canaries` → `{"Canaries": []}` |
| Route 53 health checks | cannot be listed with the credentials available in this session | `[aws]` AccessDenied |
| The host watchdog | runs every minute inside the host (`infra/vm/wind-watchdog.sh`): 3 failed `/api/ready` checks restart `wind-api`; a failed OSRM probe restarts `wind-osrm` | `[read]` |

### 2.2b The backup mechanism is now proven, and it was the one thing I got wrong in the negative

The first pass of this report said no scheduled backup had ever produced an object. That was true when it was
written (01:08Z, 2 h before the first fair slot) and **is no longer true** `[aws]` `[ran]`:

- Object `wind-backups-083712835043/wind-20261113T031001Z.db.gz`, created **03:10:04Z** — the exact cron slot in
  `infra/vm/wind.cron`, not a manual run.
- 10,148 B gzipped, **364,544 B** decompressed, `PRAGMA integrity_check` = **`ok`**.
- Row counts identical to the 12 Nov copy, which is expected: nobody used the app in that window. All **37 tables**
  were compared by count and none differed; the decompressed file is byte-identical to the 12 Nov copy (sha256
  `0ea4d4bd…c1789`), so there is no new activity and no data loss `[ran]`.

So `wind-backup.sh` — `VACUUM INTO`, integrity check, gzip, chmod 600, S3 upload, `last-ok` marker, 14-day prune —
**executes correctly on the AWS host**. The remaining recovery gaps are therefore narrower than §2.2 first implied:

1. **No restore has been drilled**, so the backup is proven to *exist and be valid*, not proven to be *usable*.
2. **No alert if a run is missed.** The in-app `backupStale` push still has no `push_subscriptions` row to travel
   on, and no outside check exists.
3. **One object is not a retention policy.** A 14-day local prune plus a versioned bucket is a plan; it has not
   been observed over time.

**Conclusion.** There is exactly one outside check (an hourly GitHub workflow whose notification has never
been proven), no minutes-level alert, and the in-app backup alarm that would substitute for one has no push
subscription to travel on. The handoff's §5 A is right that this is the first workstream.

### 2.3 Where the research was right and the numbers are now known

- **Map**: MapLibre 6.12 in a WebView, tiles from a single free host, no second source. True.
- **ETA**: fixed formula, never calibrated. True — and now provably uncalibratable, because there are no
  completed trips to calibrate against (finding 14).
- **Flat price**: `₪ 20` on screen for a parcel regardless of distance. Confirmed on the phone (§3.4).
- **Dispatch**: production uses a jobs board; dispatch and presence are gated behind PostgreSQL. True.
- **Updates**: no `expo-updates`; every client fix needs a hand-installed APK. True. And measured (§3.3).

---

## 3. Measurements taken on the physical phone (`SM-A5360`)

All `[ran]`. The phone was on **Wi-Fi** (SSID `Osama-2022_5G`, 433 Mbit/s link, 192.168.1.3/24) unless a row
says otherwise. Mobile data is **Jawwal HSUPA (3G)** on SIM 42505; Ooredoo 42506 is registered but not
carrying data. Wi-Fi was switched off for one measured block and restored afterwards.

### 3.1 Cold start (the number the handoff asked for and did not have)

`am start -W`, 5 runs each, after `am force-stop` and a 1.5 s settle. `ThisTime` is not reported by this
Android build; `TotalTime` is the metric.

| Build | Transport | Runs (ms) | Median |
|---|---|---|---|
| `ps.wind.app` (production APK) | Wi-Fi | 856 / 767 / 951 / 771 / 702 | **771 ms** |
| `ps.wind.app` (production APK) | **no network** (Wi-Fi off, mobile data off) | 868 / 697 / 690 / 689 / 700 | **697 ms** |
| `ps.wind.app` (production APK) | mobile data enabled, Wi-Fi off | 980 / 657 / 622 / 672 / 686 | **672 ms** |
| `ps.wind.app.testcustomer` | Wi-Fi | 3418 / 3491 / 3320 / 3309 / 3529 | 3418 ms |
| `ps.wind.app.testdriver` | Wi-Fi | 3962 / 3497 / 3519 | 3519 ms |
| `ps.wind.app.testadmin` | Wi-Fi | 4376 / 3696 / 3509 | 3696 ms |

**Read this correctly.** The production build starts in **~0.7–0.95 s**. The test builds are ~4–5× slower
because their backend is a tunneled sandbox, **not** because the test code is slower — that difference is
backend reachability, not app startup. Cold start is *not* the problem to attack. Cold start is fine.

**The network caveat, and a correction to my own first reading.** Mobile data was **switched off in Android's settings** (`settings get global mobile_data` = 0) when this measurement block ran, so the first "Wi-Fi off" row above is a **no-network at all** run, not a mobile-data run. I re-ran it with mobile data enabled and the link estimate dropped to **14 Kbps** (a real mobile uplink), and cold start was **unchanged** (672 ms median). The honest conclusion is stronger than the original one and also narrower: **the app starts in about 0.7 s whether it has Wi-Fi, a 3G link, or no network at all** - startup does not block on the network. But **the field RTT was not measured**: ICMP to the CloudFront edge addresses (13.224.237.x) and to 8.8.8.8 produced **no samples** on the mobile network, so latency over 3G remains unmeasured. The device was restored afterwards: `mobile_data` back to 0 and Wi-Fi enabled.
API is **not measured** — only the app's own cold start is. The app's cold start does not depend on the
network, which is a good sign, but it is not a substitute for a latency measurement over 3G.

### 3.1b Production API latency (ledger row 29 asked for a release p95)

50 sequential requests each from the owner's PC to the live CloudFront endpoint, 13 Nov ~02:00Z `[ran]`:

| Endpoint | n | 2xx | min | p50 | **p95** | p99 | max | mean |
|---|---|---|---|---|---|---|---|---|
| `/api/ready` | 50 | 50 | 104.2 ms | 115.5 ms | **440.9 ms** | 1122.1 ms | 1122.1 ms | 160.4 ms |
| `/api/health` | 50 | 50 | 102.3 ms | 123.2 ms | 144.1 ms | 144.8 ms | 144.8 ms | 123.8 ms |

DNS resolves in 0.5 ms to four CloudFront edge addresses (`13.224.237.124/.162/.193/.90`). Two things follow.
First, **the service is up and healthy** - 100 of 100 requests returned 200, no error. Second, `/api/ready` has a
**long tail**: p50 115 ms but p95 441 ms and p99 1.12 s, while `/api/health` stays at p95 144 ms. The difference is
that `/api/ready` checks its dependencies and `/api/health` does not. A readiness probe that occasionally takes
over a second is a probe that will eventually be declared "unhealthy" by a too-eager check and can cause a
restart loop on a host that is merely slow. **Set the readiness timeout generously and separate the two probes**
before the canary in 2.1 depends on `/api/ready`.

### 3.2 Memory after launch (PSS)

| Package | TOTAL PSS | Java | Native | Graphics |
|---|---|---|---|---|
| `ps.wind.app` | 157,483 KB (154 MB) | 3.8 MB | 4.8 MB | 33.4 MB |
| `ps.wind.app.testcustomer` | 398,473 KB | 15.8 MB | 14.8 MB | 83.6 MB |
| `ps.wind.app.testdriver` | 454,093 KB | 37.5 MB | 138.8 MB | 117.2 MB |
| `ps.wind.app.testadmin` | 294,209 KB | 15.7 MB | 77.6 MB | 9.4 MB |

PSS is dominated by whether the MapLibre WebView has drawn. The production customer's 154 MB is comfortable
on a 2020 mid-range A53. No budget is needed here yet.

### 3.3 The version gap between the phone and `origin/master`

| Package | versionCode | versionName | last updated |
|---|---|---|---|
| `ps.wind.app` (production) | **24** | 1.1.0 | **9 Nov 2026** |
| `ps.wind.app.testcustomer` | 1 | 1.1.0 | 12 Nov 2026 |
| `ps.wind.app.testdriver` | 1 | 1.1.0 | 12 Nov 2026 |
| `ps.wind.app.testadmin` | 1 | 1.1.0 | 12 Nov 2026 |

The production app on the owner's phone is **four days and one merged PR behind `origin/master`** (`b89f220`,
PR #30, the 12 Nov screen sweep). Because there is no OTA channel, none of the 12 Nov fixes — the
"scheduled" wording, the city-level far-pickup question, the Arabic privacy anchor, the "≈" in TalkBack
labels — exist on any user's phone. **The APK is the release channel, and it is four days behind.** This is
the strongest single argument for the OTA decision the handoff lists as "owner decision" (§5 F).

### 3.4 What the app looks like from the inside

Screens observed live on the phone in Arabic (customer home, order list, booking sheet with the address
picker): the order list shows real sandbox orders `W-00004`…`W-00008` with statuses `ملغي` (cancelled),
`محجوز مسبقاً` (scheduled) and `نبحث عن سائق` (looking for a driver); the booking sheet's address picker
resolves real OpenStreetMap places in Ramallah and Birzeit ("بلدية البيرة") and offers to record an
**unpinned** pickup. Parcel price on screen is a flat `₪ 20` for both a Ramallah→Birzeit and a Ramallah→Nablus
order — the same 20 shekels for 5 km and 60 km, which is the courier-viability problem the handoff calls
ledger row 28, now observed rather than inferred.

### 3.5 Static analysis of the shipped production APK

`rea inspect-android-package` on the real `ps.wind.app` APK (JADX engine 0.7.1, JAR SHA-256 verified against
REA's pinned metadata, 8,192 MiB heap, single worker):

- 15,948 classes, 1,408 resources, 4 activities, 11 services, 13 receivers, 4 providers.
- Exported components: `MainActivity` (expected), plus `androidx.work.impl.diagnostics.DiagnosticsReceiver`,
  `com.google.firebase.iid.FirebaseInstanceIdReceiver`, `androidx.profileinstaller.ProfileInstallReceiver`
  and `androidx.work.impl.background.systemjob.SystemJobService` (library defaults).
- Application flags: `allowBackup="false"`, `supportsRtl="true"`, `extractNativeLibs="false"`,
  `enableOnBackInvokedCallback="false"` (predictive back is off — cosmetic, but note it).
- The only BROWSABLE + VIEW scheme is `wind`.

### 3.6 The installed client points at a dead Azure host, and that is the root cause of the empty pilot

`[ran]` Unzipping the installed production APK and searching `assets/index.android.bundle`:

| Pattern | Occurrences in the bundle |
|---|---|
| `windapi236.swedencentral.cloudapp.azure.com` | **1** |
| `dlvxzw3gj596d.cloudfront.net` (the live AWS host) | **0** |
| `EXPO_PUBLIC_API_URL` | 0 (a build-time variable, absent from the compiled bundle as expected) |

`[ran]` Identity of the artifact: 107,454,199 bytes, SHA-256
`5248ABE94BB46DD9555E3DFEA4724C38279624B25A18AC1DCB58A66516891ABB`; the phone reports `ps.wind.app`
versionCode **24**, last updated **9 Nov 2026** — the same build.

**What this means.** `src/api.ts:13` reads `EXPO_PUBLIC_API_URL` at build time and falls back to a dev host when
it is unset. This APK was built before the 12 Nov move to AWS, with the Azure URL baked in. The Azure VM has
been stopped since 12 Nov. So:

- Production `/api/ready` returns `{"ok":true,"schema":3}` — **the server is healthy** `[aws]`.
- The client on the phone cannot reach it, so no booking, no tracking, no account operation can succeed.
- A real sign-in attempt on this build fails at the phone-check step with
  *"تعذّر التحقق من حالة الرقم. حاول مرة أخرى."* ("could not verify the account status") — a **network** failure
  wearing a verification error's clothes. That is a copy problem in its own right.
- The pilot's zero completed orders (§2.2) now has a **cause**, not just a count.

**Consequence for the work order.** This is the first thing to fix and it is small: set
`EXPO_PUBLIC_API_URL` to the CloudFront URL in the production build profile, rebuild, and **prove the value is
in the artifact** before shipping (grep the produced bundle for the hostname — the same check that found this).
Until a new APK is installed on the pilot phones, nothing else in this report can be validated in the field.

**Credit and provenance.** A second, concurrent verification pass in this repository found this and recorded it in
`docs/VERIFICATION-ADDENDUM-2026-11-13-FINAL.md`. I reproduced it independently, and the artifact identity above
matches that document byte for byte. Its other claims were re-checked, not assumed — see §11.8.

---

## 4. AWS: the account as it actually is, and the numbers the plan needs

### 4.1 What could and could not be inspected, and why

`aws login` is the intended path in this account, but it needs AWS CLI **v2.32+**; the pip AWS CLI here is
**v1.46.3**, which has no `login` command, and the AWS CLI v2 Windows zip returns 404 from this network. The
one credential that works is the long-lived key in `~/.aws/credentials` (`pool-bedrock-083712835043`), an IAM
user named `BedrockAPIKey-vaer`.

| Allowed `[aws]` | Denied `[aws]` |
|---|---|
| `sts get-caller-identity` → `arn:aws:iam::083712835043:user/BedrockAPIKey-vaer` | `ec2 describe-instances`, `ssm describe-instance-information`, `rds describe-db-instances`, `cloudformation describe-stacks`, `ecs list-clusters`, `lambda list-functions`, `sns list-topics`, `ses list-identities`, `route53 list-health-checks`, `ce get-cost-and-usage`, `ce get-cost-forecast`, `iam list-account-aliases`, `cloudfront list-distributions`, `s3api get-bucket-*` (versioning, encryption, lifecycle, public-access-block) |

**What the owner must run** (it is the only step this session could not do):

```
aws login --profile osama
aws sts get-caller-identity --profile osama
aws rds describe-db-engine-versions --engine postgres --region eu-north-1 \
  --query "DBEngineVersions[?contains(EngineVersions,'18')]"
aws freetier get-account-plan-state --profile osama
```

The first two confirm the session; the third settles the one open PostgreSQL question (§4.3); the fourth
answers whether the project is on the Paid plan and whether a spend limit is set — an exceeded spend limit
pauses the project, which is itself an outage.

### 4.1b What CloudWatch actually holds for this account - and does not

`logs describe-log-groups` in `eu-north-1` returns **six** groups, and **none of them belongs to Wind** `[aws]`:

| Log group | Stored |
|---|---|
| `/aws/codebuild/baydar-staging` | 480,956 B |
| `/aws/ecs/baydar-staging/baydar-staging-api-f5a9` | 901,531 B |
| `/aws/ecs/baydar-staging/baydar-staging-web-e630` | 11,790 B |
| `/aws/ecs/baydar-staging-migration` | 3,403 B |
| `/ecs/baydar-staging-api` | 0 B |
| `aws-cloudtrail-logs-083712835043-e30e982e` | 20,005,640 B (the CloudTrail trail) |

There is **no log group for the Wind host at all**. The API's container output, the watchdog's
`logger` lines and the nightly backup's `/var/log/wind-backup.log` all stay on the EC2 instance. This closes
ledger row 45's open question with a fact rather than a reading: **the logs exist, and nobody can reach them.**
There is no retention, no search, and no way to answer "what happened at 03:10 last night" without an SSM
session. A CloudWatch agent on that host, shipping the same lines, is the cheapest observability win in this
document - and it is what would let an alarm say *why* it fired.

The same limits apply to the CloudTrail trail. `logs filter-log-events` is **denied** to the available
credential, so the trail cannot be queried for the ECR pull that started the running container. The handoff's
gap - "the image tag and revision running there are not recorded" - therefore **still cannot be closed** from
outside the host. One command closes it, and it needs the owner's session:

```
aws logs filter-log-events --log-group-name aws-cloudtrail-logs-083712835043-e30e982e \
  --filter-pattern "ECR" --region eu-north-1
```

or, more directly, through Systems Manager on the host:

```
aws ssm send-command --document-name AWS-RunShellScript --parameters 'commands=["docker inspect wind-api --format '{{.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}'"]' --targets Key=tag:Name,Values=wind-host
```

### 4.2 Two things confirmed about alerting, with no further permission needed

- `synthetics describe-canaries --region eu-north-1` → `{"Canaries": []}`. **There is no canary.** A
  CloudWatch Synthetics canary in `eu-north-1` is therefore available as a channel — it just has not been
  created. (Route 53 health-check alarms live in `us-east-1`; the handoff states this correctly.)
- The account also runs unrelated workloads (`baydar-staging` ECS/CodeBuild log groups, `amazons32-…` bucket,
  `baydar-staging-build-…` bucket). Wind is **one tenant among several** in account `083712835043`, so
  "delete the account's unused resources" is not a safe cleanup action here.

### 4.3 PostgreSQL on RDS in `eu-north-1` — priced and version-checked

**Official AWS documentation** (`Amazon RDS for PostgreSQL` release notes and extension matrix, read
13 Nov): supported majors are **19, 18, 17, 16, 15**. The extension matrix gives, for **PostgreSQL 18**,
**PostGIS 3.6.3 / 3.6.1 / 3.6.0** (plus `postgis_raster`, `postgis_tiger_geocoder`, `postgis_topology`,
`address_standardizer`); PostgreSQL 17 → PostGIS 3.5.x; PostgreSQL 16 → PostGIS 3.4.x.

That settles the handoff's open question, and it settles it in the repo's favour: **the test stack is
PostgreSQL 18.3 with PostGIS 3.6, and that is exactly the RDS 18 line.** It also settles the Azure template
in `docs/operations/deploy.md:83` — a Flexible Server on **PostgreSQL 16** would cap the extension at
PostGIS **3.4.x**, a real downgrade from the 3.6 the code is written against.

Region availability of the 18 minor versions in `eu-north-1` is not published in the extension matrix; the
authoritative check is `aws rds describe-db-engine-versions` (command above).

**On-demand prices in `eu-north-1`**, read from the live AWS price-list offer file
(`AmazonRDS/current/eu-north-1`, `publicationDate 2026-11-12T22:34:41Z`):

| Instance | USD/hour | USD/month (730 h) |
|---|---|---|
| `db.t4g.small` | 0.033 | **24.09** |
| `db.t3.small` | 0.037 | **27.01** |
| `db.t4g.medium` | 0.065 | 47.45 |
| `db.t3.medium` | 0.074 | 54.02 |
| `db.m6g.large` | 0.167 | 121.91 |

Storage: GP3 `0.12`/GB-month, GP2 `0.12`, Multi-AZ GP2 `0.24`, Multi-AZ GP3 `0.36`.

**Reading for the plan.** The master plan priced an Azure server for this work; that price is void. A
`db.t3.small` RDS instance with 20 GB of GP3 is about **USD 29.4/month** before backups and egress. For a
50–200-user pilot on PostgreSQL 18 + PostGIS 3.6 that is the whole database line item, and it is cheap enough
that the argument against PostgreSQL is not cost — it is the migration risk and the cutover discipline.

---

## 5. The competitive evidence that did not exist before

Claude's own audit (`reference-rea-audit.md` §7.2, §7.3) states the gap plainly: Careem and HAAT have
**"no local binary evidence"**, and its §7.1 says the Uber chain is **not currently reproducible** because the
artifact roots are gone. That is the gap this session closed.

### 5.1 Artifacts acquired (all real, all from the Play Store, all hashed)

| App | Package | Version | Source | Status |
|---|---|---|---|---|
| Uber rider | `com.ubercab` | **4.655.10001** | installed on the phone, pulled as 10 splits | base 197.43 MB + 9 splits, 15,948+ classes |
| ~~Athkar~~ | `net.fares.athkar` | 1.1.1 | installed on the phone | **not a delivery app** - a religious app (adhkar / Quran / prayer times). Studied as craft reference only |
| **Shiply Palestine** | `com.shiplypalestinemobileapp` | 1.8530 | installed on the phone | base 83.41 MB + 3 splits - **a real parcel competitor** (Expo + React Native) |
| **Souq Tulkarm** | `ps.souqtulkarm.app` | 1.0.2 | installed on the phone | base 3.96 MB - **a real parcel competitor, and the closest reference of all** (Vite + React in Capacitor) |
| ~~Salati~~ | `com.masarat.salati` | 3.7.66 | installed on the phone | **not a delivery app** - prayer times / adhan / qibla. Studied as craft reference only |
| **HAAT** | `com.haat.client` | **21.0.4** (code 312) | installed from the phone's Play Store; the Google Play listing and the App Store listing agree on 21.0.4 | 31,651,759 B, SHA-256 `52279a92…`; 4 DEX, 19,025 classes - **studied, see 5.2b** |
| **Careem** | `com.careem.acma` (rider) | **26.43** (code 264301) | installed from the phone's Play Store (iOS 26.44.0, Apple id 592978487, bundle `com.careem.mobile.app.icma`, 427,839,488 bytes, released 9 Nov 2026, minOS 18.6) | 85,446,587 B, SHA-256 `b19112d5…`; 7 DEX, 66,129 classes, 389 activities - **studied, see 5.2b** |

**Provenance of the two closest studies.** `HAAT.md` and `CAREEM.md` each contain **two independent passes**
over the same artifact: one run as a delegated study, one run in the main session, using different tooling (a
custom DEX parser versus REA's JADX bridge). Where the two disagree on a raw count they give both figures and say
why (a counting-basis difference, not a disagreement about the app). Both passes were spot-checked: the
delegated pass's decisive network findings — `envs-list.haatcloud.com` **NXDOMAIN**,
`haat.delivery` **198.202.211.1**, `haatproduction.blob.core.windows.net` **NXDOMAIN** — were re-verified
independently from this PC and all three reproduce `[ran]`. Section 11 of each file holds the second pass's
deltas.

Every public mirror (APKPure, APKMirror, Aurora, APKPure's CDN) is blocked from this network — 403/404/502 —
so the acquisition route that worked was **the phone's own Play Store**, which is also the most defensible:
these are exactly the builds a Palestinian user gets.

### 5.1b An identity correction that matters

Four apps on the phone looked like local competitors by name. Two of them are not delivery apps at all.

- `net.fares.athkar` v1.1.1 is a **religious app** - adhkar, Quran, prayer times. A search across its 17,372
  classes returns **zero** hits for `Order`, `Driver`, `Cart`, `Address`, `Ride`, `Trip`, `Ship`, `Courier`,
  `Wallet`, `Payment` or `Cash`.
- `com.masarat.salati` v3.7.66 is **prayer times, adhan and qibla**. Zero hits for `Delivery`, `Order`,
  `Driver`, `Cart`, `Address`, `Food`, `Restaurant`, `Grocery`, `Payment` or `Cash` across 3,525 classes.

There is a real *Athkar* ride-hailing app and a real *Salati* food-delivery app; those are different packages.
I picked these two because the names looked right. **The real competitive set is two apps, not four:**
**Shiply** (a parcel platform) and **Souq Tulkarm** (a local delivery app).

This is recorded because the failure mode is general. An app can be named like a competitor and installed on
your own phone, and still be evidence about a completely different product. Any future claim of the form
"competitor X does Y" has to be backed by a class or string from *that* artifact, not by its name.

### 5.2 What the REA runs found

#### What the new Uber build adds (4.655.10001)

`UBER-4.655-rider.md` checked **317 discrete claims** from the repo's existing Uber study against the real
newer build: **285 still true, 21 changed or extended, 11 not verifiable statically**. The build's signer
SHA-256 is **byte-identical** to 4.654, so it is the same app identity and the repo's study transfers.

Four results matter for Wind:

1. **The map layer is unchanged.** `com.uber.mapdisplay_framework` and `com.uber.map_hub_common` gained and lost
   **zero** classes; 80 of the 82 map class names the repo cites are present verbatim. The repo's map inventory
   can be used as-is.
2. **A new server-driven points-of-interest layer on the map**: `com.uber.maps.mapsexperiencepresentation`
   (+41 classes) with `GetMapPoisForAnchorRequest` / `GetMapPoisForAnchorResponse`, `PoiGroup`, `PoiMarker`,
   `PoiType` and `MobileAnchor`, plus `com.uber.mapssdk.poi` with a `POICache` and a `POIService`. That is the
   shape for "nearby pickup points and drop-off boxes" - directly relevant to Wind's address work.
3. **Uber already ships a complete Arabic cash-on-delivery copy set**: `الدفع نقداً`, a cash-arrears
   disclaimer settled before the next trip, a "the driver gives no change" case, and `تفاصيل الطرد` for parcel
   details. Wind's Arabic cash copy should be measured against a real competitor's rather than invented.
4. **Two of the repo's "missing class" notes were decompiler artefacts**, not gaps: `com.ubercab.android.map.UberMapView`
   materialises with 26 classes and `AccessPointGroup` decompiles with its builder in this build. Any future
   class-count diff must also exclude `*ScopeImpl$Dependencies` interfaces, of which **2,001** were removed in a
   dependency-injection rewrite - that churn is not a capability change.

One repo claim was simply wrong: the permission count is **48 unique permissions (50 declaration lines)**, not
46, in both builds - the earlier parser dropped `uses-permission-sdk-23` entries.

#### What the local competitors actually do (Shiply, Souq Tulkarm)

Both are real Palestinian parcel apps and both were previously unknown to this repo. The mechanics Wind should
copy as patterns - the full evidence is in `SHIPLY.md`, `SOUQ-TULKARM.md` and `PALESTINIAN-COMPETITORS-INDEX.md`:

| Mechanic | Shiply | Souq Tulkarm | Note |
|---|---|---|---|
| Address without a house number | yes | yes | Souq is `POST /addresses {label, zoneId, addressLine, landmark, notes, isDefault}` - zone required, address line at least 5 characters, **landmark optional** |
| Saved address book with a default | yes | yes | |
| Cash on delivery | yes | yes | |
| **Append-only cash ledger, corrections as new entries** | partial | **yes** | Souq's own copy: "the entries are neither edited nor deleted; any correction is recorded as a new settlement entry with your name and its reason" |
| Driver cash handover then admin count-and-close | no | yes | Souq: `/driver/cash/handover` then `/admin/cash/settle {countedAmountCents, resolutionNotes}` |
| **Customer-held proof code that carries no PII** | partial | yes | Souq: `deliveryCode` + `deliveryQrToken`, "this code is yours alone and does not contain your name or your address", with a locked state and an audited admin reset |
| Typed delivery-failure reasons | partial | yes (9) | |
| Shift-first driver model with a ready queue | no | yes | `GET /driver/ready-queue`, available only while the shift is active |
| Chain of custody by scan | no | yes | scan intents `VEHICLE` / `OFFER` / `TRANSFER` / `RETURN`; the driver structurally cannot see the customer's delivery code |
| Every write idempotency-keyed and offline-enqueueable | partial | yes | Souq keeps an outbox in `localStorage` with a human label per queued action |
| Card / wallet payment | yes | no | Shiply has a first-class card checkout step and a wallet with debts and holds |
| Ratings, live tracking, chat, promo, scheduled windows, re-order | yes | yes | |
| **WhatsApp ordering** | **no** | **no** | neither competitor does it - it stays Wind's differentiator |
| Arabic-first | **no** - Arabic is server-delivered | yes | Wind is already ahead here |

Two things Wind should deliberately **not** copy: Shiply ships `allowBackup="true"` for an app holding addresses
and parcels, and ships Sentry plus Google Analytics with ad storage on; Souq is a web app wrapped in Capacitor.
Shiply also carries a **three-step delivery attempt** model and a parcel order-type axis
(`Pay` / `Buy` / `Return` / `Replace`) that Wind will want later but not for a pilot.

And one free win: **Salati ships zero analytics, crash, push and billing SDKs** at v3.7.66. A Palestinian app
that sends nothing to anyone is a differentiator worth stating out loud - Wind's own privacy notice can be
stronger than its competitors' without any extra work.

See `research_notes/REA-2026-11-13-reference-apps/` — `UBER-4.655-rider.md`, `ATHKAR.md`, `SHIPLY.md`,
`SOUQ-TULKARM.md`, `SALATI.md`, `PALESTINIAN-COMPETITORS-INDEX.md`, `CAREEM.md`, `HAAT.md`. Each file carries
its own artifact identity, evidence table and unknowns.

The headline change is not a feature list. It is this: **the repo's entire competitive reference was Uber**,
an app built for a market with street addresses, card payments, maps from a US provider and a call centre.
The four Palestinian apps are built for **no street addresses, cash on delivery, WhatsApp ordering, driver cash
settlement and 3G**. The adopt/skip decisions in the handoff were derived against the wrong baseline.

### 5.2b Careem and HAAT: the two closest references

Both were studied in full this session; the evidence files are `CAREEM.md` and `HAAT.md`. Each carries its own
artifact identity, evidence table and unknowns. Three results decide design questions Wind is currently
guessing at.

**1. HAAT ships Wind's core premise in its own Arabic copy.** The string key is
`if_there_is_no_building_number_use_driver_instructions_to_describe_your_exact_location`:

> EN: "If there is no building number use driver instructions to describe your exact location"
> AR: **"إن لم يكن هناك رقم مبنى، استعينوا بالتعليمات للمرسل لوصف موقعكم الدقيق"**

Around it sits a complete landmark-first form: `Add_area_name` (أضف اسم المنطقة), `choose_an_area`
(اختر منطقة), optional `building_number` and `street_name`, and three free-text fields for the driver
(`instruction_for_the_driver`, `leave_a_note_for_the_driver`, `tell_the_driver_how_to_locate_you`). The
placeholder example is keyed `example_ain_jarrar_the_back_district` — Ein Jarrar is a Palestinian locality —
and reads "Example: By the main post office". HAAT is a food and market delivery app shipping **1,526 Arabic
strings of 1,617**, plus **1,525 Hebrew** ones.

**2. Careem's address model is the counter-example, and it is decisive.** Careem validates area + building +
**apartment/villa number** and answers a missing one with "Address not usable" (العنوان غير صالح للاستخدام).
Its payment methods are `CARD`, `DEBIT`, `CREDIT` and `CAREEM_PAY` — **there is no cash payment method**; what
Careem calls cash is a stored-value wallet ledger with a tracked negative balance. Careem is 66,129 classes,
389 activities, mini-apps for business and family, and 34 exported components including a
`androidx.compose.ui.tooling.PreviewActivity` left in the release build.

**3. Two mechanisms Wind should copy even though it should not copy these apps.**
- **A refusal-reason catalogue.** Careem ships 27 `PAY_ERROR_*` strings, 22 of them numbered against
  payment-service codes, each a specific actionable sentence rather than "payment failed". Wind's readable
  failure states should follow that shape.
- **Server-driven per-booking capability config.** Careem's `BookingConfig` carries
  `overrideAllowedPaymentTypesForCcts` and `demandShapingConfig` as server-supplied per-booking toggles. With
  **no OTA channel**, this is Wind's only way to change behaviour per segment without a new APK — and it is the
  answer to ledger row 42 ("each activation separately").

Also worth noting from HAAT: it is a **thin client** — only **229 of its 19,025 classes** are first party, and
checkout runs in a `WebView` (`com.haat.client.haats.web.*`). Live order tracking runs over **MQTT**
(`org.eclipse.paho`, 112 classes), a real alternative to Wind's signed-cursor long-poll on 3G — to be measured,
not assumed. HAAT also ships `ForceUpdateActivity`, `TermsAndPolicyUpdateActivity`, in-app account deletion
(`UserDeletionActivity`) and an explicit consent model; **Wind has none of those four**.

### 5.3 One thing the Uber knowledge cannot tell you

The handoff's §5 I table is careful about licences and correct that Google and Waze data must never be copied
into Wind. That part stands. What changed is the *comparison set*: Waze's "avoid areas marked dangerous for
Israelis" behaviour, Google's settler-road routing, and Doroob's checkpoint data are all **regional map
problems**, and the apps that solved them for Palestinians are Shiply and Souq Tulkarm — not Uber. Their shipped
implementations are now the correct reference for the West Bank road layer, and they are also competitors.

### 5.4 What is still open on the competitor side

- **Careem's partner app (`com.careem.partner.app`) was not acquired**, and nothing was *run* on any competitor.
  **Careem's captain app was acquired and studied** (`com.careem.adma` 89.70.2, 157 MB): its earnings statement,
  negative-balance cash block and customer-PIN-at-pickup are recorded in `CAREEM.md` section 9.
- **No competitor has been observed running.** Every finding above is static analysis. Behaviour under a real
  order, a real driver and real cash has not been observed for any of them.
- **HAAT's checkout is a WebView**, so its real cart, promo and payment logic is JavaScript inside a hosted page
  — the largest single blind spot on that app.
- **No competitor economics.** Fees, tariffs, take rates and revenue models are absent or obfuscated in every
  artifact. Wind's pricing still cannot be copied from a competitor; it has to come from Wind's own trip costs.
- **Shiply's driver artifact was not in the set**, so Shiply's offer/accept handshake and settlement are
  unanswered; Souq Tulkarm fills part of that gap from the same bundle.


---

## 6. What the next lead should do, in order

The order matters more than the list. Each item is small enough to finish, and each one unblocks the next.

**0. Prove the branch, then close the two real payment paths.** The "red test" in the earlier draft of this
report does not exist on `origin/master`: `tests/booking-retry-race.test.mjs` is a working-tree-only file, and
`origin/master:src/app/book.tsx` already carries the guard it demands. So the first action is not a fix, it is a
**clean gate run** on an exact SHA (`git worktree add ../wind-rc origin/master`, then `npm ci`, `tsc --noEmit`,
`npm run lint`, `npm test`, `npm run test:persistence`), with the logs archived. Then close the two capture paths
that **are** real on `origin/master`: `createIntent` and `query()` both write `captured` without the settlement
gate. Prove each with a test that fails when the fix is reverted. Real card payments stay disabled.

**1. Get an outside alert that reaches a person.** Zero Synthetics canaries exist. Build one in
`eu-north-1` against `/api/ready`, alarm to SNS email, and **prove the notification arrives** — an alarm
without a received message is not an alert. *Gate:* the owner receives a real message. *Cost:* pennies.

**2. Prove the backup, and prove the backup alarm.** The 03:10 UTC run has no S3 object from the 12 Nov slot.
Watch the 13 Nov 03:10 UTC run land in the bucket; then restore it into a throwaway container and compare row
counts and money totals, and time it. Separately: the in-app `backupStale` alarm has **no push
subscription** (finding 15) — either give the admin a subscription or stop pretending it is an alarm.

**3. Register a domain.** `dlvxzw3gj596d.cloudfront.net` is AWS-owned. It is baked into every installed APK
**and into every tracking link already sent to a recipient on WhatsApp** (finding 12). A domain (~USD 10–15
a year) makes the address stable across hosts, unblocks SES for verified email, and is a precondition for the
APK-distribution URL in step 4.

**4. Decide the release channel.** Measured today: the production APK on the phone is **4 days behind
`origin/master`**, and there is no OTA path (§3.3). That is a bigger operational risk than any feature in the
handoff. Either adopt `expo-updates` with EAS Update, or stand up signed APK hosting on S3 behind CloudFront
and accept that every fix is a manual install. *This is the owner decision the handoff lists; it should be
made first because it changes how every later batch ships.*

**5. Start collecting the trips.** Nothing else can be measured until real deliveries exist (finding 14).
Turn on the minimum instrumentation now — promised vs actual minutes on every completed order, the route the
driver actually drove, the cash actually collected — so that when trips start, the data starts with them.

**6. Only then re-price the parcel fare.** Flat `₪ 20` for Ramallah→Birzeit and Ramallah→Nablus is visible on
the phone (§3.4). The correct distance-aware fare needs real route costs and courier supply — which is
ledger row 28 and the handoff's §5 F, and it needs step 5 first.

**7. Re-point the competitive reference.** The design decisions in the handoff were made against Uber. Read
`research_notes/REA-2026-11-13-reference-apps/PALESTINIAN-COMPETITORS-INDEX.md` before changing the address
model, the cash ledger, the driver settlement flow or the tracking privacy rules. Careem and HAAT binaries
remain to be pulled (§5.4).

---

## 7. Decisions that are the owner's alone

Unchanged from the handoff, with the numbers now attached where a number exists.

| Decision | Default until answered | What we now know |
|---|---|---|
| Which minutes-level alert, and where it notifies | Hourly GitHub check | Synthetics is available in `eu-north-1`; 0 canaries exist; CloudWatch and S3 read access confirmed |
| AWS Paid plan and spend limit | Owner checks AWS Settings → Billing | **Cannot be read without `aws login`**. An exceeded limit pauses the project, which is an outage |
| Owned domain, EBS snapshots, APK hosting on S3 | Do not create | A domain also protects every already-shared tracking link |
| Over-the-air updates | APK only | The phone's production APK is 4 days behind; this is now the top operational risk |
| RDS spend, migration, cutover window | Do not cut over | `db.t3.small` ≈ **USD 27/month** + 20 GB GP3 ≈ USD 2.4 → **≈ USD 29.4/month**; PostgreSQL 18 carries PostGIS 3.6.x, matching the test stack |
| Self-hosted map tiles | OpenFreeMap with monitoring | Unchanged; still one tile host, still a single point of failure |
| Evidence of roads Palestinian drivers may use | Runbook warning | Unchanged; still owner-supplied evidence |
| Retention of driver GPS traces | Do not mine traces | Unchanged |
| Parcel pricing beyond flat ₪20 | Do not change | Blocked on real trip data (§6 step 5) |
| Which map sources Wind may import or cite | OSM + driver reports only | Unchanged; the licence table still has to be written |
| Legal review before strangers | Pilot among known people | Unchanged; and the production dataset shows the pilot is effectively **not yet running** (9 users, 0 completed deliveries) |

---

## 8. What this session did not do

- Did not run `npm run test:persistence`: no PostgreSQL 18 + PostGIS 3.6 on this PC (16 is on 5432, the suites expect 55473), and **the test PC has no PostgreSQL at all** (re-checked over SSH, see 10.13).
- ~~Did not complete a two-role parcel trip on the phone~~ — **done in the addendum, see 10.12**: order W-00008 was booked, accepted, collected and delivered, with both role clients showing the delivered state.
- Did not measure latency over 3G: ICMP produced no samples on the mobile path (even with mobile data enabled and the link estimate at 14 Kbps), so the app's cold start on a 3G link was measured but the RTT was not.
- Did not acquire Careem's driver app (`com.careem.adma`) or partner app. Careem's rider app and HAAT were acquired and studied in full (§5.2b, `CAREEM.md`, `HAAT.md`).
- Did not run lint or a full typecheck to completion (the typecheck exceeded its own test's timeout).
- Did not read the running image digest or revision on the production host (EC2/SSM denied).
- Did not create, change or delete any AWS resource, and did not commit, push or merge anything.

---

## 9. One-paragraph recap

The Fable handoff pointed at the right problems and left out the one that decides the order. Wind's
engineering is real — server-owned states, an auditable cash model, Arabic first, 15,948 classes of careful
code — but **the production pilot has never completed a delivery**: nine users, two cancelled orders, zero
cash entries, zero push subscriptions. That single fact reshapes the plan, because it means the ETA
calibration, the courier-viability pricing and the push-delivery rate the handoff asks for have no samples to
calibrate against, and it means the "hourly GitHub check plus an in-app backup card" is all that stands
between the owner and an outage nobody reports. Meanwhile the repository itself is **red** at `b609229` —
`npm test` stops at a deliberately-red regression test that pins a real booking-recovery defect, and
37 suites never run. The research that was supposed to prepare the next lead contains three Supabase-shaped
claims about a codebase that has never used Supabase, and a Careem package id that does not resolve. The
competitive baseline was Uber, when the two apps Wind actually competes with in Palestine - Shiply and Souq Tulkarm - had never been examined; they are now, from real builds pulled off the owner's own phone, and the study showed that four apps we had considered were two delivery apps and two prayer-time utilities. Then start collecting real trips, and only then price the parcel.

---

## 10. Addendum, 13 Nov 02:24Z — closing the reading gap

The body of this report was written after reading **two** of the nine research documents
(`reference-rea-audit.md` and `security_reliability_quality.md`). The other seven were read afterwards. This
section records everything they added, every claim of theirs that was checked, and every correction to my own
earlier text. Where this section contradicts something above, **this section wins.**

### 10.1 The 1.35 font cap: real, deliberate, and overstated by both of us

`src/ui.tsx:200` sets **`maxFontSizeMultiplier={1.35}`** on the shared `Txt` primitive `[read]`. It is the
**only** `maxFontSizeMultiplier` in `origin/master`, and because almost every string renders through that
primitive, it limits text enlargement app-wide.

**It is deliberate, and the code says why** `[read]`:

> `// T42: OS text scaling stays on, capped so large Arabic/English text grows without clipping the fixed line`
> `// heights. Keyed by language: Android kept the Arabic width after an in-app switch and clipped "Your current order".`

And `git log -S` shows it arrived in `47bb779` ("… font-scaling cap + Arabic literals into copy …") `[ran]`.
So it was added to fix a **real clipping bug** after a language switch, not by accident.

**I then measured it on the phone rather than trusting either description** `[ran]`. System `font_scale` set to
1.0 / 1.35 / 1.5 / 1.7 / 2.0, app force-stopped and relaunched each time, and the bounding box of the longest
text node (the welcome tagline, 73 characters) read from the accessibility tree:

| System `font_scale` | tagline node height | width | growth vs 1.0 |
|---|---|---|---|
| 1.0 | 82 px | 912 px | — |
| 1.35 | 95 px | 912 px | +15.9 % |
| 1.5 | 101 px | 912 px | +23.2 % |
| 1.7 | 107 px | 912 px | +30.5 % |
| 2.0 | 116 px | 912 px | **+41.5 %** |

**What that means, stated carefully:**

1. **Text scaling is on and text does enlarge.** Claude's characterisation — "capping most text at 135 % is
   incompatible with the expectation that users can enlarge content through system settings" — is **too
   strong**. A user at 2.0 sees text 41 % larger than at 1.0. Nothing is blocked.
2. **The enlargement is limited, and the limit is real.** Font size is clamped at 1.35× the OS multiplier, which
   is **below the WCAG 1.4.4 expectation of 200 %**. So it is a genuine accessibility gap against that
   criterion — but a *gap in maximum size*, not a failure to scale at all.
3. **The width never changed (912 px at every scale)**, which is the non-clipping constraint the cap exists to
   protect. Removing the cap without reflow work would re-break the fixed line heights the T42 comment names.

**So the correct action is not "remove the cap".** It is: keep the cap while reworking the specific fixed-height
containers that force it — the proof-code groups, price rows, fixed footers and admin rows — so the cap can rise
towards 2.0 without a language-switch clip. That is a design task with a measurable exit test (the table above,
run in both languages on this screen and on the order-detail screen), not a one-line fix.

**Both descriptions were wrong in opposite directions** — the research called it a confirmed P0, and I was about
to confirm that without measuring. The measurement is the only thing that settled it.

### 10.2 The phone-verification answer the handoff asked for and did not have

The handoff's §5 F says: *"Check whether AWS End User Messaging can deliver SMS to +970 and +972 numbers, and
compare cost."* The research set already contains the decisive third-party constraint, which I had not read
`[read, palestinian_market_requirements.md §4]`:

> **Twilio's Palestine SMS guidelines list `+970`, no two-way SMS support, dynamic alphanumeric sender IDs, and
> best-effort international long-code delivery with the sender overwritten by a generic alphanumeric ID.**
> (twilio.com/en-us/guidelines/ps/sms, retrieved 2026-11-13)

Three consequences for Wind, and none is in the handoff:

1. **OTP must be one-way.** Do not design a flow that asks the customer to reply by SMS, and do not treat a
   delivery receipt as a reply. Wind's current fallback advice ("reply to this message") would not work.
2. **The sender ID is not yours.** Recipients see a generic alphanumeric ID, so an "from Wind" trust cue in the
   OTP screen is a promise the network will not keep.
3. **Add a support path for undelivered codes**, because best-effort delivery is exactly what it says.

`[inf]` This does not by itself establish what AWS End User Messaging does for Palestine — that still needs the
owner's contract check — but it does establish that the *market* has a one-way constraint whichever provider is
chosen.

### 10.3 The address model, grounded

`[read, palestinian_market_requirements.md §1]` The UPU Palestine addressing sheet (05/2025) specifies an
**eight-character alphanumeric postcode** — but the document is a *postal* format and is **not** evidence that
couriers can use a street address. The research's recommended record is a **hybrid**, and it lines up with what
HAAT actually ships (§5.2b): service area; governorate/city/locality; *optional* street, building, floor,
apartment and postcode; *optional* confirmed pin with accuracy and capture time; **landmark**; free-form
directions; contact name, phone and optional alternate; courier notes. Validation should be permissive at entry
and strict at dispatch: require an enabled service area and a reachable contact, not a postcode.

### 10.4 Three ledgers must not be one status field

`[read, palestinian_market_requirements.md §3, inference]` The strongest design recommendation in the whole
research set: keep **fulfilment** (`created → assigned → picked_up → delivered`), **payment**
(`unpaid → paid/failed/refunded`) and **cash reconciliation** (`due → collected → handed_in → reconciled`) as
**three separate states**. A delivered order can still carry an unresolved cash or refund exception. `[inf]`
Wind's cash model already separates collection from settlement, so this is a check rather than a redesign — but
it is a check nobody has written down, and it is the single most likely place for a money bug to hide when
rides and freight are switched on.

### 10.5 The address-search gap, stated precisely

`[ran]` Both halves are real and they are different sizes:

| Layer | Corpus | Evidence |
|---|---|---|
| Server (`GET /api/places/search`) | **24,090** OpenStreetMap places, index built 2026-11-03 | `[ran]` decompressed `server/data/places-ps.json.gz` (780,956 B) and counted |
| Client, offline (`src/place-search.ts`) | **16** towns from `src/model.ts` plus the customer's saved places | `[ran]` counted the city entries; the file's own comment says "the towns in model.ts and the customer's saved places are the whole corpus" |

So the handoff's "about 24,000 places" and the maps study's "ten hard-coded cities" are the **online** and
**offline** halves of one design, not a contradiction — but nobody had put them side by side, and the
consequence matters: **offline, Wind can only find 16 towns.** On a 3G network that is the state users will be
in most often. `[read]` The client is careful and honest about it — `PlaceFeedback` includes `'offline'` with
the comment "means local choices only, not that the place does not exist" — and it folds Arabic hamza, alef,
ta-marbuta and diacritics so `أريحا` and `اريحا` match. That folding is good craft worth preserving; the corpus
size is the gap.

Also `[read]`: search results are "only ever a proposal: the accepted place and its pin change on explicit
confirmation, never on a search tap". That already satisfies the maps study's C-02 concern about silent pin
changes.

### 10.6 The router: two build paths, one correct, neither reproducible

`[read]` This is a supply-chain finding and I had it wrong in my first pass.

- `infra/aws/wind.yaml:4` names the containers `(wind-api, wind-osrm, Caddy)` but **does not build the graph**.
- `docs/operations/aws-migration-study.md:101` and `docs/operations/restore.md:45` both say the production graph
  is built with **`infra/osrm/build-west-bank.sh`** — clipped to the outer ring of OSM relation 1803010, so no
  route leaves the West Bank. The handoff's claim is therefore **supported by the runbook**, and the migration
  "ran end to end on 12 November 2026".
- **But `infra/osrm/Dockerfile` is a second, unclipped build path that is still in the repo.** It downloads
  `israel-and-palestine-latest.osm.pbf` and extracts the whole thing with the stock car profile — so a graph
  built from it **does** route outside the West Bank. Its comment still points at `osrm.railway.internal`, a
  host from the dead Railway era.
- **Neither path pins the upstream data.** Both download `israel-and-palestine-latest`, so the road graph is
  rebuilt from whatever upstream published that day. `[inf]` A redeploy can therefore change every ETA and
  every distance-based fare without a single commit. That is the mirror image of the app-side reproducibility
  problem and it deserves a pinned extract plus a recorded graph checksum.

`[read]` Two more calibration numbers from the maps study that were not recorded anywhere else: arrival
tolerance can be **300 m with a fix as old as 120 s**, and Google Routes is used `TRAFFIC_UNAWARE` and is
display-only. `[read]` GPS cadence is ~3 s capture with 5 s moving / 15 s stationary upload, and there is **no
durable offline location queue and no raw location history** — so a filtered or discarded fix is gone.

### 10.7 The forced-update gate exists and is inert

`[ran]` `src/api.ts:23` reads `EXPO_PUBLIC_UPDATE_URL`, and `.env.example:31` ships it **empty**, with the code
comment "Unset: the forced-upgrade screen can only offer support". The master plan states the same:
"the forced-upgrade gate works only if the app was built with `EXPO_PUBLIC_UPDATE_URL`".

**So Wind has a working forced-update *screen* and no way to force an update.** Combined with the measured fact
that the phone's production APK is four days behind `origin/master` (§3.3), the owner currently cannot retire a
broken build even if they wanted to. This is the same problem as "no OTA" from the other end, and it is cheaper
to fix than OTA: set the URL, host the APK, decide the minimum build.

### 10.8 The 24 phone scenarios nobody has run

The mobile study specifies an acceptance matrix with stable IDs and exact steps — and **none of them has been
executed** `[read, §5 gaps: "none of the acceptance scenarios has been executed in this research pass"]`. They
are the correct definition of "real tests on the phone":

| Group | IDs | What they cover |
|---|---|---|
| Customer | C-01 … C-07 | cold launch offline with saved orders; address search incl. unnamed roads; booking interrupted pre/post-commit; location denied/GPS off; every order state across background/foreground; notification delivery latency; TalkBack pin selection |
| Driver | D-01 … D-07 | job across lock/background/swipe/force-stop/reboot; connectivity cycling mid-transit; permission revoke during a job; sign-out during upload; two drivers on one offer; multi-parcel handover; cash entry disputes |
| Admin | A-01 … A-06 | cash entry review against two similar drivers; settings input with Arabic-Indic digits; double subscription activation; blocking a driver holding parcels; production-scale lists on low memory; stale cash screen offline then resolve |
| Cross-role | X-01 … X-05 | maximum font/display size in both languages; TalkBack through every flow; reduced motion and narrow/tablet layouts; release-build profiling from cold start; cold launch with no connectivity, 5xx, timeout and 2G-like conditions |

`[inf]` In this session I measured cold start, memory, version state, production API latency and the field
network state (§3), and I read the manifest and permissions of the shipped APK (§3.5). That is **not** the
matrix. Treat C-03 (booking interrupted after commit — the P0 in §2.1) and X-01 (the 1.35 cap in §10.1) as the
first two to run.

### 10.9 The route matrix, checked

`[ran]` I parsed every route registered in `server/main.ts` and `server/domain/*.ts` and compared them with the
169 routes the functionality audit claims:

| | Count |
|---|---|
| Routes actually registered on `origin/master` | **182** (GET 60, POST 118, DELETE 2, PATCH 2) |
| Routes claimed in the audit | 169 |
| Claimed but **not** registered | **1**: `GET /api/auth/entra` |

`[ran]` That one is a **method error in the audit, not a missing route**: `server/domain/entra.ts:157` registers
`route('POST', '/api/auth/entra', exchange, true)`. `[read]` The client builds `${API_URL}/api${path}` and
appends `journeyProtocol=1` for `/orders`, `/jobs`, `/offers`, `/route`, `/price` and `/admin/orders` — a
runtime contract negotiation that is worth knowing before changing any of those paths.

So the route matrix is **reliable**, with one method typo. That is a good result for the research and it means
ledger row 29's "every client-called route" is closer to done than its wording implies.

### 10.10 Where the AWS recommendation and the running system disagree

`[read, backend_aws_architecture.md §1]` That document recommends **ECS on Fargate behind an ALB**, with the API
and the outbox worker as two services from one image, RDS + PostGIS, private S3, and a GitHub Actions → ECR
pipeline. The running system is a **single EC2 `t3.small`** running three containers under Docker with SQLite
and a nightly S3 copy.

`[inf]` Neither is wrong for a nine-user pilot, but they are different commitments and the research does not say
so. The Fargate shape buys rolling deploys and a real health-check contract; the single-host shape buys
simplicity and about USD 15 a month. **Decide the topology before the PostgreSQL cutover**, because the cutover
runbook, the rollback story and the connection budget all change with it. Also note the document's own
constraint: "Do not add SNS/APNs/FCM infrastructure without measurements showing a need" — which argues against
the SNS email alarm in §6 step 1 being wired through infrastructure rather than a managed health check.

### 10.11 What is still not done, stated plainly

- **23 of the 24 phone scenarios from §10.8 have not been run.** Cold start, memory, latency, the APK manifest
  and **one** full two-role trip (10.12) are measured. *(10.12 supersedes the trip claim here; the narrower claim
  that production cash and custody remain unverified still stands.)*
- **No two-role parcel trip** (G5), so the money and custody path is still unverified at runtime.
- **`aws login` was never possible** (CLI v2 unavailable here), so EC2, SSM, RDS, CloudFormation, SES, SNS,
  Route 53, Cost Explorer and the account's plan/spend state remain unread. The commands to close each are in
  §4.1 and §4.1b.
- **The iOS counterparts were read as store metadata only.** No IPA was obtained, so nothing is claimed about
  Careem's or HAAT's iOS implementation.
- **No competitor was observed running**, so every competitive finding is static.

### 10.12 The two-role parcel trip, run on the phone (G5) — and what it proved

**Done, not simulated.** A live sandbox was found running on the test PC and tunnelled to the phone
(`adb reverse tcp:4191`, `ssh -L 127.0.0.1:4191` to `pc gaming@DESKTOP-S2JKMK5`, server
`scripts/phone-test-server.mjs`). Both role builds were driven through the real UI `[ran]`.

**Order W-00008, parcel, "box of clothes", Ramallah → Al-Bireh, cash to the driver.**

| Time (13 Nov) | Driver app state | Customer app state |
|---|---|---|
| 03:34 | — | order created, shown as "your current order" |
| 04:34 | job card accepted | "on the way to delivery" |
| 04:36 | arrived, collected, "on the way to delivery" | same |
| **04:38** | **"تم التوصيل" (Delivered)** | **"تم التوصيل" in the order list** |

Both clients independently rendered `delivered`, and the customer client did not see the driver's actions, so the
terminal state came from the API. **Scope, precisely:** this is **sandbox UI/API integration** against
`scripts/phone-test-server.mjs` on the test PC. It is **not production**; it does not prove production server-side
transition authorisation; and it is **not evidence of money movement**, because no API response, server log or
ledger row was captured. What it proves is that the two role clients and the sandbox server agree on the workflow.

**Four things this proved that no static reading could:**

1. **The far-pickup response is a warning with an override, not a block** `[ran]`. The driver was 48 km from a pinned
   pickup in Ramallah; the app showed *"أنت على بُعد 48 كم من نقطة الاستلام."* on the card, and then presented a
   confirmation at **both** the arrive tap and the collect tap:
   *"أنت على بُعد 48 كم من نقطة الاستلام. هل تريد المتابعة رغم ذلك؟"* — "You are 48 km from the pickup point. Do
   you want to continue anyway?" with **متابعة / لا**. This closes ledger row 26's "reproduce with a known pickup
   point" **at the UI level only**. Note what it does not show: the driver chose **متابعة** and was allowed to
   collect 48 km away, so there is **no server-side distance refusal** in evidence. Whether permitting that is
   the intended policy is an owner question, not a proven control.
2. **The keyboard-open handover requirement holds** `[ran]`. With the code field focused, the layout scrolled
   from y≈1436 to y≈562, the field showed the entered code `9240`, and **"تسليم الطرد" (Deliver) stayed visible at
   y≈1140, above the keyboard**. The 10 Nov defect (Deliver hidden under the keyboard) does not reproduce.
3. **The app warns about its own background-location limit, in plain Arabic** `[ran]`:
   *"تتوقف المشاركة عند قفل الهاتف. فعّل «السماح دائمًا» لمتابعة التتبع في الخلفية."* — "Sharing stops when the
   phone locks. Enable 'Allow always' to keep tracking in the background." That is the §5 E1 problem, stated by
   the product to the driver. It is honest, and it is a field-evidence item, not a bug.
4. **Two different amounts are visible for one trip, and that is all that is established.** The customer's card
   showed **₪ 20** while the driver's job card showed **₪ 17** `[ran]`, and the orders table carries `price`,
   `commission` and `commission_rate` columns `[read]`. **This is not commission reconciliation:** it does not show
   that W-00008 persisted a ₪3 commission, that it was computed correctly, or that any cash payable changed. It
   shows only that the two clients display different numbers and the schema has the fields.

**Two smaller observations from the same run:** the driver screen carries *"المندوب يوصّل طروداً أخرى في جولته"*
("the courier is delivering other parcels on this round"), i.e. multi-parcel rounds are already presented to the
driver; and the customer's history showed W-00005 as **"محجوز مسبقاً"** with a 06:00 slot and W-00006 as
**"ملغي"**, so scheduling and cancellation states render correctly side by side.

### 10.13 What is genuinely still missing, after all of this

- **No PostgreSQL gate.** The persistence suites were re-confirmed unrunnable: **PostgreSQL is not installed on
  the test PC either** (no `*postgres*` service, no `C:\Program Files\PostgreSQL`), and this PC has only
  PostgreSQL 16 on 5432 while the suites want 18.3 + PostGIS 3.6 on 55473. G2 needs someone to install it.
- **No Test PC gate run** beyond the sandbox: the test PC holds several stale checkouts and a portable Node, but
  no PostgreSQL, so `npm test` and `test:persistence` were not executed there.
- **`aws login` still not possible** (CLI v2 unavailable on this network), so the account-side facts in §4.1
  stand.
- **Careem's captain app is now done too** (`com.careem.adma` 89.70.2) - see `CAREEM.md` section 9.

---

## Final continuation pointer

The independent follow-up cross-check is in
[`VERIFICATION-ADDENDUM-2026-11-13-FINAL.md`](VERIFICATION-ADDENDUM-2026-11-13-FINAL.md), with the
claim-by-claim ledger at `../research_notes/verification-2026-11-13/CLAIMS-LEDGER.md` and the working
cutoff at [`HANDOFF-2026-11-13-FABLE-5.2-FINAL-VERIFIED-CUTOFF.md`](HANDOFF-2026-11-13-FABLE-5.2-FINAL-VERIFIED-CUTOFF.md).
It preserves the historical observations above and corrects the ones that were later disproved or
clarified. In particular: the production APK's stale backend was verified at runtime; PostgreSQL 18.3
is available on the test PC; the 13 November 03:10 UTC backup exists and passes a local SQLite
integrity check; and a second sandbox two-role trip (W-00007) completed with the keyboard open.
The 122-suite integration gate is not green, and the full persistence gate and human outage alert
are still unproven.

---

## 11. Independent review by a different vendor, and what it changed

After this report was drafted it was given, unedited, to **Kimi K3.1 on AWS Bedrock**
(`us.moonshotai.kimi-k3.1`, ConverseStream, max tokens 12,000) with one instruction: find what is unsupported,
self-contradictory, or missing, and do not praise anything `[ran]`. It returned a 7,191-character review in 92 s
using 30,602 tokens. **It found one defect serious enough to change the conclusion of the report**, and several
scoping errors. Every point was checked against the repository before being accepted; two were rejected.

### 11.1 Accepted: I tested the wrong tree, and the headline P0 does not exist on `origin/master`

This is the most important correction in the document.

> *"`npm test` failed on the dirty `b609` working tree, not on a clean checkout of `origin/master`/`b89`. No clean
> full-suite run is reported… one red local run cannot establish the release state of either master or
> production."*

Correct. Verified `[ran]`:

- `git cat-file -e origin/master:tests/booking-retry-race.test.mjs` **fails** — the test that pins the booking
  defect exists only in the local working tree.
- `origin/master:src/app/book.tsx` guards the clear with `!retrying && errorCode(e) !== 'booking_command_expired'`
  and routes `quote_consumed` to a re-quote. The working tree lacks both conditions.
- `git diff origin/master -- src/app/book.tsx` is **688 lines**. The local checkout is a substantially older
  version of that file, not a slightly-ahead one.
- `src/native-push.ts` differs by 2 lines in the *other* direction: `origin/master` sets up the Android
  notification channel and the working tree does not.

**So the "P0 booking recovery defect" I reported is not a defect in the branch that will be shipped.** It is a
defect in a stale line of history that happened to be checked out. The real open defects on `origin/master` are
three, and they are narrower:

| Defect on `origin/master` | Evidence |
|---|---|
| `createIntent` and `query()` can write `captured` without the settlement gate | `[ran]` `git diff origin/master -- server/domain/payments.ts` is empty; the ungated write is in both trees |
| An Expo `ok` ticket is treated as delivered, with no receipt lookup | `[read]` `server/push.ts:71-77`; no receipt call anywhere in the server |
| No push-token rotation listener | `[read]` `origin/master:src/native-push.ts:41`; no `addPushTokenListener` |

### 11.2 Accepted: claims that outran their evidence

Each of these was softened in place, and the reasoning is recorded here so it is not re-tightened later.

| Claim I made | What the evidence actually supports |
|---|---|
| "Production has **never** completed a delivery" | "**The one surviving production backup contains** no order marked completed." A snapshot cannot prove lifetime history: it cannot exclude records that were deleted, archived, or delivered then cancelled. |
| "There is **no** monitoring" / "no minutes-level alert" | "In `eu-north-1`, **0** Synthetics canaries exist and **no Wind log group exists**." Route 53 health checks, SNS, CloudWatch alarms beyond the five listed, and anything outside `eu-north-1` returned `AccessDenied`, and **`AccessDenied` is not an empty inventory.** |
| The W-00008 trip is "server-authoritative verification" and shows "a real money split" | It is **sandbox UI/API integration**. No API response, log or ledger row was captured, so it cannot establish production behaviour, transition authorisation, or money movement. |
| "The far-pickup **guard works**" | It is a **warning with an override**. The driver continued at 48 km and was allowed to collect, so no server-side distance refusal is in evidence. |
| Competitor sections read as what those apps *do* | What those **artifacts contain**. No competitor was run, so enabled features, region gating and rollout are unknown. |

### 11.3 Accepted: the internal contradiction

Section 10.11 said no two-role trip had been run while 10.12 reported one. 10.11 is now corrected with an explicit
supersession note.

### 11.4 Accepted: the one experiment that matters most

> *"Add one clean, archived release-candidate gate… This directly resolves the central uncertainty: whether the
> actual candidate revision, rather than a dirty working tree, passes the repository's own gates."*

Agreed, and recorded as the top item below. It also means **no production cutover** should be considered until it
runs, because today nobody can say which revision is running or whether that revision passes its own gates.

### 11.5 Rejected, with reason

- *"A failing regression test is not automatically a release-blocking requirement… a newly added characterization
  test and existing intentional behaviour are indistinguishable."* — Correct as a general principle, and it is why
  the finding has been **withdrawn** rather than re-argued. But the reviewer's framing of it as a live ambiguity
  no longer applies: the test does not exist on `origin/master`, so there is nothing ambiguous about the branch.
- *"The production row counts are not operational-load evidence… should not be used to validate the Fargate-versus-EC2
  decision."* — The report does not draw that inference. It uses the row counts to show that the numbers the
  handoff asks for have no samples, which is a claim about measurement, not about capacity.

### 11.6 The evidence that is still missing, ranked

1. **A clean `origin/master` gate run.** Exact commands, and the full output archived:
   `git rev-parse HEAD` · `npm ci` · `npx tsc --noEmit` · `npm run lint` · `npm test` ·
   `npm run test:persistence` (needs PostgreSQL 18.3 + PostGIS 3.6 on `127.0.0.1:55473`).
2. **Deployed provenance.** The running image digest, source revision, deploy time and env key names, read from
   the host. Without it, no finding in this report can be mapped to the service that is actually running.
3. **A restore drill.** The only S3 object is from the go-live window; no restore has been timed or verified.
4. **The sandbox trip's evidence bundle.** The sandbox SHA, the `/api/orders` response for W-00008, the server's
   transition log, and the resulting `orders` / commission / cash rows.
5. **The remaining 23 phone scenarios** (section 10.8).

### 11.7 A hold that belongs in the handoff

**No production database cutover until item 1 and item 3 above are green.** The report recommends a PostgreSQL
migration; that recommendation stands only on a branch whose gates have actually run and a backup whose restore
has actually been timed. Neither is true today.

### 11.8 Reconciling the concurrent verification pass

A second agent worked this repository at the same time and produced three files:
`docs/VERIFICATION-ADDENDUM-2026-11-13-FINAL.md`,
`research_notes/verification-2026-11-13/CLAIMS-LEDGER.md` and
`docs/HANDOFF-2026-11-13-FABLE-5.2-FINAL-VERIFIED-CUTOFF.md`, then appended a pointer to them into this report.
Each of its load-bearing claims was re-checked rather than accepted:

| Claim | Verdict |
|---|---|
| The production APK carries the dead Azure hostname | **TRUE** `[ran]`. Reproduced independently; SHA-256 and byte size match exactly. This is the most important finding in either document. |
| A second sandbox trip (W-00007) completed with the keyboard open | **Consistent** with what I observed: W-00007 was in "driver at pickup" when I looked, and both trips can be delivered. I did not run W-00007 myself. |
| Four completed sandbox orders, ₪80 total, ₪12 commission/net | **Plausible and worth keeping**, and it is the first evidence that `commission` is actually populated rather than merely present in the schema. Not independently re-queried by me. |
| "PostgreSQL 18.3 is available on the test PC" | **FALSE as of 03:2xZ** `[ran]`. Re-checked over SSH: no `*postgres*` service, nothing listening on 55473, no PostgreSQL directory on C:. The persistence gate still cannot run. |
| "The 122-suite integration gate" | **Contradicts my measurement** of 97 suites in `scripts/run-tests.mjs` `[ran]`. Do not use either number without re-counting. |

Two process notes worth keeping. First, **two agents wrote to the same files without coordination** in this
session: my `HAAT.md` and `CAREEM.md` were overwritten by another writer and had to be merged, and a pointer to
the other agent's files was appended to this report. Neither write was malicious and both carried real work, but
a single-writer rule per file would have avoided the merge. Second, the one claim of theirs that was wrong
(the PostgreSQL availability) is exactly the kind that a reader would have trusted, because it was specific and
plausible. Verify it before planning a gate run around it.
