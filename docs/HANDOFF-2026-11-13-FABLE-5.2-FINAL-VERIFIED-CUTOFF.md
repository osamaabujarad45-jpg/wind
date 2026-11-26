# Wind — final verified implementation cutoff, 13 November 2026

## Stop and read this first

**Do not ship the current installed production APK. Its backend address is the retired Azure host.**
The AWS API itself is healthy, but the installed APK cannot complete its sign-in phone check because
it still calls that old host. The first job is a correctly configured replacement APK and a verified
upgrade path—not more feature work.

This is the working cutoff for the implementation lead. It **supersedes conflicting readiness claims**
in the earlier Fable 5.2 documents. It does **not** delete them: those documents contain useful research
and observations from different trees and times. The claim-by-claim boundary is in
`research_notes/verification-2026-11-13/CLAIMS-LEDGER.md`.

### What is preserved

- `docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md` — original research, unchanged.
- `docs/REPORT-2026-11-13-VERIFIED-STATE-AND-GAPS.md` — earlier verification, retained with its
  historical observations and a pointer to the final addendum at the end.
- `docs/HANDOFF-2026-11-13-FABLE-5.2-CUTOFF.md` — previous cutoff, retained as history.
- `research_notes/REA-2026-11-13-reference-apps/` — all existing studies, including Careem Captain.
- All pre-existing source changes and untracked files in the owner's repository. Nothing was rebased,
  reset, committed, pushed, merged, deleted, or deployed by this verification.

### Agent cut-off

No process named Fable 5.2 was found. The active Claude Code CLI was **PID 18832**, model
`claude-opus-5-5`, session `78352bbb-38c6-4674-a032-c9c325a5f39f`. It was left running to preserve
its work; killing it was neither necessary nor justified. This document is the boundary: **stop new
implementation work from the older briefs and use this queue.**

---

## 1. Exact baseline and operating rules

### Source

Use **`origin/master` at `b89f2205965523b5ab8545dff3940d1eacb6062c`** as the reference baseline.
The root checkout is `b609229`, has extensive pre-existing modifications and untracked files, and is
**not a descendant of `origin/master`**. Do not overwrite it to obtain a clean tree.

```bash
git fetch origin
git merge-base --is-ancestor origin/master HEAD
# A clean new branch/worktree must start from b89f220, not from the dirty root master.
```

The clean reference tree used in this verification is
`C:\Users\osama\AppData\Local\Temp\opencode\wind-b89f220`.

### Production

- Project account: `083712835043`; selected Region: **`eu-north-1`**.
- API: `https://dlvxzw3gj596d.cloudfront.net`; `/api/ready` currently answers HTTP 200,
  `{"ok":true,"schema":3}`.
- Production database snapshot: **9 users, 2 cancelled orders, 0 completed deliveries, 0 cash entries,
  0 push subscriptions**. There is no production delivery corpus yet.
- Production is one EC2 `t3.small` with Docker and SQLite, not ECS/Fargate/RDS. Do not migrate to RDS
  merely to match a diagram. Keep one compatible SQLite API process until the conditional scaling and
  PostgreSQL gates are deliberately selected and approved.
- The previous full-session inventory recorded image tag `20261112-aws1`, revision
  `4f647e77ddc4b4f2ed0ecbd047dc1037953d888d`, and digest `sha256:dabea399…`. Reconfirm these
  after the owner refreshes AWS access; the current read-only credential cannot inspect the host.

### Test environment

- Physical phone: `SM-A5360`, adb `R5CTB0FJP9Z`, Android 16. **No emulator.**
- Test PC: `DESKTOP-S2JKMK5`, reachable through the existing authorized SSH key.
- Test sandbox: `scripts/phone-test-server.mjs` on `127.0.0.1:4191`, through `adb reverse`.
  Do not start another sandbox over it.
- PostgreSQL 18.3 is already running at `127.0.0.1:55493` on that PC. Use per-test isolated schemas.
  The older claim that the test PC has no PostgreSQL is obsolete.
- Keep the phone on Wi-Fi when testing the sandbox. Mobile data was restored to disabled; Wi-Fi is on.
- Read `AGENTS.md`, `docs/CURRENT-WORK.md`, and `docs/PLAN-2026-11-10-OPEN-ITEMS.md` before changes.
- Follow Expo 57's versioned documentation, not remembered APIs.
- No paid AWS resources, production migrations, real payments, public launch, or destructive data
  changes without owner approval. Do not create an AWS resource merely because it is recommended.
- If AWS access suddenly stops after previously working, the owner checks **AWS Settings → Billing**
  for the plan/spend-limit state. This session cannot currently check it because `wind` is expired.

---

## 2. Work queue — in this order

## Batch 1 — Restore a working production client and its update path

### 1.1 Build the production APK with the live backend

`src/api.ts:11-13` reads `EXPO_PUBLIC_API_URL`. `eas.json` defines the `production` environment.
Set the value in the **production build environment**, not as a one-off shell variable whose effect
is not recorded.

```bash
EXPO_PUBLIC_API_URL=https://dlvxzw3gj596d.cloudfront.net \
npx eas-cli@latest build --platform android --profile production
```

On Windows PowerShell, set `$env:EXPO_PUBLIC_API_URL` before invoking the same build command.
Follow `AGENTS.md`: use the documented EAS route and SDK 57 documentation. If local signing/build
infrastructure is used instead, record the exact environment and artifact hash; the requirement is
the same: **prove the resulting bundle contains CloudFront and does not contain the Azure hostname.**

Acceptance:

1. The production build has a new build/version identifier, not the installed versionCode 24.
2. Extract its JS bundle and inspect for `dlvxzw3gj596d.cloudfront.net`; reject if
   `windapi236.swedencentral.cloudapp.azure.com` is present.
3. Install over the old APK on the owner's phone without clearing its data or Chrome profile.
4. A fresh launch and the real phone-check/sign-in flow succeed against the live API. Do not use the
   sandbox's baked test credentials as production proof.
5. Record APK SHA-256, build ID, source commit, server revision, and the result on the physical phone.

### 1.2 Make the next bad build retractable

`src/api.ts:22-24` only exposes a working forced-update link when `EXPO_PUBLIC_UPDATE_URL` is a valid
HTTPS URL. The current configuration does not provide one, and there is no `expo-updates` dependency.

- Host the signed APK at a stable HTTPS location approved by the owner.
- Set `EXPO_PUBLIC_UPDATE_URL` in the production build.
- Decide and enforce a minimum supported build.
- Test that a deliberately old test build reaches the update screen and the link downloads the new
  artifact. Keep a known-good APK/server pair.

**Trade-off:** EAS Update would reduce manual installs, but it introduces a release channel and
credentials. The smaller immediate fix is signed APK hosting plus a tested forced-update link.
Choose OTA separately; do not silently introduce it during the P0 repair.

### 1.2b Set the server-side minimum as well

`EXPO_PUBLIC_UPDATE_URL` controls the link, not the refusal itself. Configure the server-side
`WIND_MIN_CLIENT_BUILD` to reject unsupported builds with the existing 426 flow, and test that the
minimum matches the build/version scheme. The two settings must be deployed compatibly; a link alone
does not force an upgrade.

### 1.3 Keep the existing Azure endpoint out of all future builds

Add a release assertion for the production API URL and a check for retired hostnames in the produced
bundle. The failure that matters is a **build-time configuration** error; checking only the running
server cannot detect it.

## Batch 2 — Establish the release gate on `b89f220`

### 2.1 Current gate results — use these, not the older claims

| Gate | Verified result | Required interpretation |
|---|---|---|
| `npm run typecheck` | **PASS**, exit 0 | On the isolated clean baseline on the test PC. `clean-typecheck.test.mjs` also passed in isolation. |
| `npx expo lint` | **FAIL**, three modules | `expo-auth-session`, `expo-web-browser`, `expo-notifications`. Do not remove the imports. |
| `npm test` | **FAIL / intermittent** | Full run stopped at `url-decoder.test.mjs:15`. Direct test and the same canonical runner with `--filter=url-decoder` both passed. Investigate the runner/environment; do not patch the decoder on one failure. |
| `npm run test:persistence` | **FAIL / not completed** | One run failed phone identity 503; standalone identity passed. Second run timed out `pg_restore.exe` in `pg-import.mjs:142`. Diagnose, do not mask with skipped tests or a larger timeout alone. |
| Registry | **122 suites** | Not 131 or 97. `db-api` and `db-persistence` are the two explicit PostgreSQL-only `.test.mjs` exclusions. |
| `expo-doctor` | **2 failed checks** | `.expo` Git ignore and eight SDK patch mismatches. Review before upgrading; do not bulk-upgrade for a number. |

**Historical distinction:** the booking `quote_consumed` regression belongs to the dirty `b609229`
tree. Its test is absent from `b89f220`. Preserve its useful regression case, but do not call it the
current baseline failure or replace it with the unrelated URL-decoder result.

### 2.2 Fix lint's module resolution without hiding it

The failure is reproducible after exact `npm ci`. Node resolves all three packages and TypeScript
resolves the type declarations. ESLint's effective configuration enables both `node` and
`typescript` resolvers (`eslint-import-resolver-node` 0.3.10, `eslint-plugin-import` 2.32.0).

**Small next diagnostic:** compare ESLint's Node resolver with the TypeScript resolver on those exact
imports, including platform-extension selection, rather than changing the source imports or disabling
`import/no-unresolved`. Keep the successful typecheck as a separate gate.

Done when `npx expo lint` exits 0 on the canonical tree with no new suppression and the three Expo
imports remain intentional.

### 2.3 Make the full test gate deterministic

- Preserve the failing URL-decoder output (`'%41…' !== 'A…'`) and the passing direct/filtered logs.
- Check test-runner environment, generated artifacts and dependency resolution; do not guess a logic
  fix for the decoder.
- Rerun the full gate after the root cause is identified, then revert any fix and verify the regression
  test can still fail.
- Run `npm run test:persistence` against PostgreSQL 18.3 at `127.0.0.1:55493`, with
  `C:\wind-k5\.expo\implementation\postgresql18\bin` on PATH and a loopback
  `WIND_TEST_DATABASE_URL`.
- Diagnose `pg_restore.exe ETIMEDOUT` at `tests/pg-import.mjs:142` and the non-reproducing phone
  identity 503. A standalone identity pass does not prove the full gate is reliable.
- Keep all 122 integration suites selected or explicitly exempt. The persistence runner has 52 named
  suites plus a legacy check. Report exact counts and environment, not “all tests” without evidence.

### 2.4 Conditional money work — do not activate payments

The earlier inspection found ungated capture paths in `server/domain/payments.ts`: immediate creation
and the direct `query()` path must go through the same settlement gate as query/webhook paths.
Before any real card activation, prove duplicate/out-of-order events, cash/card conflicts, and
provider-capture/local-pending recovery.

**This is an activation blocker, not a demonstrated live exploit.** Production remains cash-only;
no payment activation is authorized by this handoff.

## Batch 3 — Prove recovery and make an outage reach a person

### 3.1 The daily backup landed and its SQLite integrity passes

The fresh 13 November S3 inventory contains **two** Wind backups:
`wind-20261112T165723Z.db.gz` and `wind-20261113T031001Z.db.gz`, each 10,148 B. The latter has
`LastModified=2026-11-13T03:10:04Z`, a version ID, and AES-256 encryption. The daily cron therefore
**did produce and upload its expected backup**. An earlier intermediate listing predated this object
and is superseded.

The new object was downloaded and decompressed into an isolated local SQLite copy: 364,544 B,
gzip SHA-256 `45608b757e2d2e126b2060329791d26889ab0ddca0e3e141a542091ccf8a2a7a`.
`PRAGMA integrity_check` returned `ok`; 37 tables; 9 users; 2 cancelled orders; 0 cash entries;
0 sessions; 0 push subscriptions. This proves the backup exists, decompresses and opens consistently.

It does **not** yet prove a timed replacement-host restore, application compatibility after a real
restore, or an acceptable RTO. Keep the old backup, test that recovery path next, and report the
actual data-loss window rather than assuming it.

### 3.2 Prove one alert reaches a human

There are **0 Synthetics canaries**, and the available inventory contains no Wind CloudWatch alarm.
Baydar alarms in the same account are unrelated and must not be edited. There is no demonstrated
Wind notification reaching the owner.

Recommended smallest suitable path for the current topology: a Synthetics canary against `/api/ready`
in `eu-north-1`, a CloudWatch alarm, and an owner-approved notification destination. Also monitor
backup freshness; an API check alone misses a broken nightly backup.

**Cost and choice:** the owner must approve the destination, interval and spend before creation.
An alarm is not done when it exists; it is done when an induced API/backup failure produces a message
the owner can show, with a runbook saying what to do next. Keep host logs in a searchable, retained
location so the alert has a cause, not just a red light.

### 3.3 Owner-only checks

```bash
aws login --profile wind
aws sts get-caller-identity --profile wind
aws freetier get-account-plan-state --profile wind --region eu-north-1
aws rds describe-db-engine-versions --engine postgres --region eu-north-1
```

Check AWS Settings → Billing for the paid plan and spend limit. Confirm Region under AWS Settings →
View all projects → Overview → Additional Info → Region. This session's read-only IAM credential
cannot enumerate SNS or the full current host state; do not treat an access denial as absence.

## Batch 4 — Finish the real acceptance matrix, not just the happy path

### 4.1 What is already proven on the physical phone

- **Production stale-backend failure:** installed APK opens, but sign-in phone check shows
  `تعذّر التحقق من حالة الرقم. حاول مرة أخرى.` after the old host times out.
- **Second sandbox parcel trip (W-00007):** pickup-arrived → explicit far-pickup confirmation →
  in transit → delivered, at 04:46, on both customer and driver apps.
- **Handover with keyboard open:** customer code read from the customer UI, entered into the driver,
  delivery button visible and successful.
- **Far-pickup guard:** actual driver location `32.313261,35.049752` was about 48 km from Ramallah;
  the app required explicit `متابعة / لا`. The long 77–86 km / 80–107 min route reflects that real
  driver position, not a Ramallah routing failure.
- **Cash visibility:** four completed sandbox orders total ₪80, commission/net ₪12. Cash handover form
  was prefilled ₪12 and cancelled without submission.
- **W-00008:** the other agent's completed sandbox trip is preserved. It is delivered, not still
  searching for a driver. W-00007 is an independent cross-check, not a replacement for that evidence.

These are sandbox results. **Production still has zero completed deliveries.**

### 4.2 Remaining acceptance work

1. Complete the sandbox cash handover → admin settlement → ledger/order/earnings reconciliation.
   Record actor, timestamp, expected/collected/remitted amounts, discrepancy and correction handling.
   Do not destructively edit the ledger to make totals match.
2. Run the existing customer/driver/admin scenarios C-01…C-07, D-01…D-07, A-01…A-06, X-01…X-05.
   Start with booking interruption/reconnect, lock/background/swipe/force-stop, notification
   permission/token lifecycle, and offline recovery.
3. Background tracking is **not yet proven**. Permission was granted, but the lock-screen attempt
   remained locked; obtain a real unlock/background result with a fresh driver fix, not a permission
   screenshot alone.
4. Test the customer and driver in Arabic and English, maximum text/display settings, TalkBack,
   2G/3G-like conditions, denied GPS, and process death. Retain the measured 1.35 font-cap behaviour;
   rework fixed-height layouts before raising it rather than simply removing the cap.
5. Do not compare Uber/Careem/HAAT feature counts as a release target. Compare the required local
   journey: contact → landmark/area/pin → cash → custody → delivery → reconciliation → support.

## Batch 5 — Palestinian product fixes, grounded in the reference apps

Only after the working APK and operational basics are in place.

1. **Address form:** use HAAT's shipped pattern: required area, optional building/street, landmark
   and driver instructions. Its own Arabic says that if there is no building number, use instructions
   for the driver to describe the exact location. Careem adds pin/nickname/building-type/notes/photo
   components; its required-building messages are not a reason to require apartment numbers in the
   West Bank. Validate permissively at entry and strictly before dispatch.
2. **Search:** fix the observed ranking that puts `al Bireh, الخليل` above Al-Bireh city for `bireh`.
   Add a relevance test; do not replace the index blindly. Online index: 24,090 places, 2,637
   streets, 34,119 street samples, built 3 November. Offline search is much smaller.
3. **Cash:** keep fulfilment, payment and cash reconciliation separate. Careem ships cash-only
   warnings and an arrears/balance block; do not conflate that with its Careem Pay wallet ledger.
   Consider an explicit consequence for unresolved driver/customer cash only after the ledger and
   support workflow are proven.
4. **Copy and tracking:** use HAAT's human Arabic order-state vocabulary and granular “less than N
   minutes” where truthful. MQTT is present in HAAT, but it is a measurement candidate, not an
   instruction to replace Wind's signed-cursor long-poll.
5. **Map:** `public/map.html:12,21,169` and the CSP allow only OpenFreeMap; this is a single host
   dependency, not an emergency requiring a provider rewrite. Measure on the pilot network first.
6. **Pricing/ETA:** the formula is
   `Math.round(1.3 * Math.ceil(raw/60)) + 2` seconds on the server
   (`server/domain/journey.ts:12`) and `Math.round(minutes*1.3)+2` minutes in the client
   (`src/map-math.ts:103`). Keep it labelled as an estimate until real trips exist. Do not invent
   calibration data or change flat parcel pricing without courier costs and supply evidence.
7. **Reference corpus:** use `UBER-4.655-rider.md`, `CAREEM.md`, `HAAT.md`, `SHIPLY.md`,
   `SOUQ-TULKARM.md`, and `PALESTINIAN-COMPETITORS-INDEX.md`. Athkar and Salati are not delivery
   competitors. Careem Captain is already studied; do not acquire it again.

## Batch 6 — Conditional infrastructure decisions

- **RDS:** official RDS documentation lists PostgreSQL 18.6 with PostGIS 3.6.3 and 18.3 with
  PostGIS 3.6.1. The existing test server is 18.3. Exact `eu-north-1` engine availability still
  needs the owner session. A `db.t3.small` plus 20 GB GP3 was previously priced at about USD 29.4
  per month before backups/egress; revalidate current price and owner budget before creating it.
- **Cutover:** requires representative rehearsal, financial reconciliation, a write freeze, isolated
  restore proof, post-first-write forward recovery, and explicit owner approval. It is not needed to
  repair the APK.
- **SMS:** official AWS documentation lists Palestine (+970) as international one-way SMS with
  Sender ID support, not two-way. International origination may be best effort/downstream-replaced.
  Current production SMS is sandbox-tier; do not promise delivery until production access, sender
  configuration, provider cost and real +970/+972 delivery are proven.
- **Domain:** an owned stable domain reduces the risk of baking an AWS-owned hostname into APKs and
  WhatsApp tracking links. It is an owner-spend decision. Until then, preserve the current CloudFront
  distribution; deleting it would strand installed builds and already-shared tracking links.

---

## 3. Done means

The immediate cutoff is not “the report was read.” It is:

- A new production APK points to CloudFront, installs over versionCode 24, and completes a real
  sign-in/phone-check on the physical phone.
- A forced-update link has been exercised on an old test build.
- Typecheck and lint pass; the full integration and persistence gates complete with exact counts,
  no suppressed failures, and the intermittent URL and `pg_restore` issues explained.
- The daily backup has a timed replacement-host restore and compatibility check, and an induced outage
  produces a notification the owner acknowledges.
- The two-role sandbox trip and cash reconciliation are complete, with remaining phone scenarios
  recorded rather than assumed.
- A real pilot—not the sandbox—produces the first completed delivery and the first operational data.
- Every merge has the required independent review. Money/auth/migration/dispatch/deploy/data deletion
  changes use two reviewers from different vendors.

Report each batch as **issue → exact change → exact command/result/host → commit → remaining gate**.
Put bad news first and never hide a failed, unrun or flaky check.

## 4. Evidence and handoff package

- Claims, evidence anchors and boundaries: `research_notes/verification-2026-11-13/CLAIMS-LEDGER.md`.
- Verified measurements: `docs/VERIFICATION-ADDENDUM-2026-11-13-FINAL.md`.
- Reference apps: `research_notes/REA-2026-11-13-reference-apps/`.
- Earlier work: retained in place, including the original Fable report, verified report and cutoff.
- No production/AWS mutations, no source edits, no Git mutations, no credentials stored in this package.
