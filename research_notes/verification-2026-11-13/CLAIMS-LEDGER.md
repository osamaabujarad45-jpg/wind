# Wind — evidence ledger for the 13 November verification and implementation cutoff

## Scope and preservation

- The original Fable 5.2 handoff, `docs/REPORT-2026-11-13-VERIFIED-STATE-AND-GAPS.md`,
  `docs/HANDOFF-2026-11-13-FABLE-5.2-CUTOFF.md`, and the existing REA studies are **preserved**.
  They contain observations from several code trees and times, not one consistent current state.
  The verified report receives only a final pointer to the newer evidence, not a rewrite of history.
- This continuation adds a separate handoff and a dated report addendum. It does not alter or erase
  the other agent's findings, including the Careem Captain and W-00008 evidence.
- The working repository has extensive pre-existing changes. Its `master` is `b609229`, is six
  commits ahead and 277 behind `origin/master`, and is **not a descendant** of `origin/master`.
  No source, test, infrastructure or Git state was changed by this continuation.
- The canonical source inspected is `origin/master` / `b89f2205965523b5ab8545dff3940d1eacb6062c`,
  in `C:\Users\osama\AppData\Local\Temp\opencode\wind-b89f220`.
- Lawful static and first-run behavioural analysis only. No proprietary code, artwork or assets
  were copied. Reference-app claims below are observations of shipped strings, class names and
  public behaviour, not claims about their server guarantees.
- The `aws___search_documentation` / `aws___retrieve_skill` MCP operations are not exposed in this
  environment; `search` and MCP-resource discovery confirmed that. AWS documentation was therefore
  read directly from the official URLs, and the relevant local AWS observability skill was loaded.
  All regional recommendations remain `eu-north-1` unless a permitted global dependency is named.

## Evidence classes

- **[current]** checked again during this continuation, on 13 November.
- **[source]** inspected in the clean `b89f220` tree, with file and line.
- **[phone]** measured on the owner's physical `SM-A5360`, adb `R5CTB0FJP9Z`, Android 16.
- **[aws]** a live read-only AWS API answer. No AWS mutation was made.
- **[other-agent]** preserved from an existing dated report; it is not presented as newly run.
- **[open]** not proven, inconclusive, or blocked by a named prerequisite.

## Current release and runtime claims

| ID | Claim | Status | Evidence |
|---|---|---|---|
| C-01 | The canonical source is `origin/master` `b89f220`, not the dirty local `master`. | **[current]** | `git rev-parse` in the clean worktree: `b89f2205965523b5ab8545dff3940d1eacb6062c`; local status reports ahead 6, behind 277 and many modifications. |
| C-02 | Production `/api/ready` responds correctly at `https://dlvxzw3gj596d.cloudfront.net`. | **[current]** | Live HTTP 200, `{"ok":true,"schema":3}`. |
| C-03 | Installed `ps.wind.app` is v1.1.0, versionCode **24**, last updated 9 November, and contains `https://windapi236.swedencentral.cloudapp.azure.com`. | **[current, phone]** | `dumpsys package`; pulled APK `wind-prod.apk`, 107,454,199 bytes, SHA-256 `5248ABE94BB46DD9555E3DFEA4724C38279624B25A18AC1DCB58A66516891ABB`; extracted JS bundle contains the Azure URL, not CloudFront. |
| C-04 | The old Azure host resolves but its HTTPS request times out. | **[current]** | DNS A `20.91.209.132`; `Invoke-WebRequest` timed out after 15 seconds. |
| C-05 | The production APK opens but fails its sign-in/phone-check path. | **[current, phone]** | Fresh launch rendered login. A dummy password and test-format number were submitted, not a real credential. UI showed `تعذّر التحقق من حالة الرقم. حاول مرة أخرى.` and `جارٍ تنفيذ إجراء آخر، انتظر لحظة.` after 18 seconds. No account was accessed. Evidence: `wind-production-login.xml` and `.png`. |
| C-06 | The correct production API endpoint for a replacement build is the CloudFront URL. | **[source/current]** | `src/api.ts:11-13` consumes `EXPO_PUBLIC_API_URL`; `eas.json` production has `environment: production`; the CloudFront ready endpoint is green. |
| C-07 | The app cannot force a broken installed build to download a replacement without a configured HTTPS update URL. | **[source]** | `src/api.ts:22-24`; `.env.example` has an empty update URL; `expo-updates` is not a dependency. |
| C-08 | ETA is not `ceil(minutes × 1.3) + 2`. | **[source]** | `server/domain/journey.ts:12`: `Math.round(1.3 * Math.ceil(raw/60)) + 2` seconds, multiplied by 60 for the range; `src/map-math.ts:103`: `Math.round(minutes*1.3)+2` minutes. |
| C-09 | The integration runner has **122** suites, not 131 or 97. | **[source/current]** | Parsed quoted suite names in `scripts/run-tests.mjs`: 122 unique. Disk has 124 `tests/*.test.mjs`; `db-api.test.mjs` and `db-persistence.test.mjs` are explicitly PostgreSQL-only. The persistence runner has 52 named suites plus a legacy check. |
| C-10 | The older booking-red result belongs to the dirty `b609229` tree, not to the clean baseline. | **[source/other-agent]** | `tests/booking-retry-race.test.mjs` is untracked in the root tree and absent from `b89f220`; the earlier execution log records the failure at line 97. It must not be described as the current baseline gate. |
| C-11 | `npm run typecheck` passes at `b89f220`. | **[current]** | `C:\wind-b89f220-typecheck.log` on `DESKTOP-S2JKMK5`, exit 0, after exact lockfile dependencies were installed in the isolated copy. `clean-typecheck.test.mjs` also passed in isolation. |
| C-12 | `npx expo lint` fails on exactly three unresolved modules. | **[current, unresolved root cause]** | Exact `npm ci` completed, then lint failed for `expo-auth-session` and `expo-web-browser` in `src/entra-auth.ts`, and `expo-notifications` in `src/native-push.ts`. Node's resolver finds all three; TypeScript resolver finds `expo-auth-session/build/index.d.ts`; ESLint config enables both `node` and `typescript` resolvers. Do not delete the imports or disable the rule to hide this. |
| C-13 | The full integration gate is not green; URL decoder is intermittent, not a proven decoder defect. | **[current]** | Full run failed at `tests/url-decoder.test.mjs:15`, actual `'%41…'`, expected `'A…'`. Direct `node --test tests/url-decoder.test.mjs` then passed, and `node scripts/run-tests.mjs --filter=url-decoder` passed. Record both; do not patch the decoder based on the one failing run. |
| C-14 | PostgreSQL 18.3 and one formerly blocked integration suite work on the test PC. | **[current]** | Existing server on `127.0.0.1:55493`, `SELECT version()` → PostgreSQL 18.3. `subscription-migration.test.mjs` passed using a fresh isolated schema and `WIND_TEST_DATABASE_URL=postgresql://fastship_test@127.0.0.1:55493/fastship_test`. |
| C-15 | The full persistence gate is not green. | **[current, unresolved]** | With `pg_config.exe` on PATH, one run failed phone identity with a 503; standalone `phone-identity.mjs` passed in 6.85 s, including two-API replay. A second full run failed `pg-import.mjs:142`, `pg_restore.exe ETIMEDOUT`. These are harness/performance results to diagnose, not proof of RDS or PostGIS incompatibility. |
| C-16 | `expo-doctor` reports two failed checks in the isolated baseline. | **[current]** | `.expo` is not ignored by Git; eight SDK patch mismatches. The dependency install was local to the test copy. No upgrades were applied. This is not the same as a production runtime failure. |
| C-17 | A second two-role sandbox parcel trip completed with a real customer code and keyboard open. | **[current, phone]** | W-00007 advanced from pickup-arrived → explicit 48 km continue confirmation → in transit → delivered at 04:46. Customer and driver both showed `تم التوصيل`, ₪20 cash to driver. Customer code was read from the UI and entered in the driver; submit button stayed visible. No code is recorded here. |
| C-18 | The far-pickup guard did not silently allow collection. | **[current, phone]** | Driver's real fix was `32.313261,35.049752`, not Ramallah. App warned 48 km away and required `متابعة / لا` before proceeding. The later 80–106 min / 77–86 km route therefore reflects the actual far-away driver, not a broken Ramallah route calculator. |
| C-19 | Driver background location permission was granted, but lock/background tracking was not proven. | **[current/open]** | Permission is granted; the app warns that sharing stops on lock until always-allowed. ADB lock/unlock left the device on the lock screen, so no valid background continuity result was obtained. |
| C-20 | Admin has visible cash controls and consistent aggregate sandbox commission. | **[current, phone]** | Dashboard showed four completed orders, ₪80 order value, ₪12 commission/net. Cash page offered separate `تسجيل تسليم نقدي` and `تسجيل تسوية`; the handover form was prefilled ₪12 and cancelled without submission. Full handover → settlement → ledger reconciliation remains **[open]**. |
| C-21 | W-00008 was already delivered by the other agent; it is not an outstanding search-for-driver order. | **[current, phone]** | Customer order list rendered W-00008 `تم التوصيل`. Existing W-00008 evidence remains in report §10.12. This continuation separately used W-00007. |
| C-22 | Sandbox test builds are v1.1.0, versionCode **1**, not production versionCode 24. | **[current, phone]** | `dumpsys` for `testcustomer`, `testdriver`, `testadmin`. These apps are appropriate for sandbox evidence only. |

## AWS claims and limits

| ID | Claim | Status | Evidence |
|---|---|---|---|
| A-01 | The owner profile `wind` is expired; the read-only Bedrock credential identifies account `083712835043`. | **[current, aws]** | `aws login` required for `wind`; `sts get-caller-identity` with `pool-bedrock-083712835043` → IAM user `BedrockAPIKey-vaer`. No secret value is stored here. |
| A-02 | The 13 November daily backup exists and its SQLite integrity passes. | **[current, aws/local restore]** | `wind-20261113T031001Z.db.gz`, 10,148 B, modified `2026-11-13T03:10:04+00:00`, versioned and AES-256. The 12 November object also remains. New object gzip SHA-256 `45608b757e2d2e126b2060329791d26889ab0ddca0e3e141a542091ccf8a2a7a`; decompressed 364,544 B. `PRAGMA integrity_check=ok`, 37 tables, 9 users, 2 cancelled orders, 0 cash entries/sessions/push subscriptions. A timed replacement-host restore is still open. |
| A-03 | There are no Wind CloudWatch alarms in the inventory returned to this credential, and no Synthetics canaries. | **[current, aws]** | Name-filtered alarm query `[]`; full list contains Baydar autoscaling/rollback alarms only; `describe-canaries` → `Canaries: []`. No Wind outage notification was demonstrated. |
| A-04 | SNS and other owner-only resources cannot be re-enumerated with the available read-only credential. | **[current, aws]** | `sns list-topics` returned `AuthorizationError`. The other-agent full-session inventory is retained separately, not silently substituted for this live check. |
| A-05 | The production data snapshot has no completed deliveries; the sandbox deliveries are not production evidence. | **[other-agent]** | Restored 364,544-byte SQLite backup: 9 users, 2 cancelled orders, 0 completed orders/cash entries/push subscriptions. |
| A-06 | The production container identity previously established is revision `4f647e77ddc4b4f2ed0ecbd047dc1037953d888d`, image tag `20261112-aws1`, digest `sha256:dabea399…`. | **[other-agent]** | Live-host inspection in the earlier same-day pass. Current host access is unavailable with the read-only credential, so this is not claimed as freshly revalidated. |
| A-07 | RDS PostgreSQL 18 supports PostGIS 3.6.x; the current documentation also lists 18.6. | **[current, official docs]** | `https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html`: 18.6 PostGIS 3.6.3, 18.3 PostGIS 3.6.1. Exact engine availability still needs owner session `describe-db-engine-versions` in `eu-north-1`. |
| A-08 | Palestine (+970) is listed for international one-way SMS with Sender ID, not two-way SMS. | **[current, official docs]** | `https://docs.aws.amazon.com/sms-voice/latest/userguide/phone-numbers-sms-by-country.html`: PS row — short codes No, long codes No, Sender IDs Yes, two-way No, international sending Yes. Footnote says internationally enabled origination may be best effort and downstream-replaced. This is not a delivery guarantee. |
| A-09 | Owner action is required before paid monitoring, domain, SMS production or RDS work. | **[current, policy]** | `aws freetier get-account-plan-state --profile wind` cannot run while expired. Owner must refresh `aws login`, then check plan/spend state in AWS Settings → Billing. Sudden access loss after previously working should trigger that check. |

## Reference-app cross-checks

| ID | Claim | Status | Evidence |
|---|---|---|---|
| R-01 | Careem artifact is `com.careem.acma` v26.43 / 264301, SHA-256 `B19112D53D3E9A800EF35908FA48AF57816D9F8F81B7A3897A7220F527127F58`. | **[current]** | 85,446,587 B APK. Two class-count methods: REA 66,129 definitions; raw DEX parser 73,254. Both are labelled by method in the study. |
| R-02 | Careem ships cash-only booking warnings and an arrears/balance block. | **[current, string evidence]** | `cashBookingNotAllowedMessage`, `cashBookingNotAllowedTitle`, `cash_only_unsupported_payment_warning_*`, `captain_cash_balance_text` in `careem-selected-resources.json`. Do **not** overstate this as ordinary cash being a Careem Pay payment instrument; its wallet ledger is distinct. |
| R-03 | Careem's address form supports a map pin, nickname, notes and pickup/delivery photo component keys; it also contains required-building/street messages and `address_addressNotUsable`. | **[current, string evidence]** | `MapAndAddress_*`, `gle_hint_building_number`, `gle_hint_street_name`, `address_addressNotUsable`. These coexist; choose the landmark/pin/photo pattern for Wind, not a blanket apartment-number requirement. |
| R-04 | Careem Captain `com.careem.adma` v89.70.2 has been studied by the other agent. | **[other-agent]** | `CAREEM.md` §10: earnings breakdown taxonomy, cash-debt consequence, shift/acceptance/arrival mechanics. Preserve it; do not repeat acquisition. |
| R-05 | HAAT artifact is `com.haat.client` v21.0.4 / 312, SHA-256 `52279A92F31FEBAFAC3EAAA7B64348A762E5BB41879E8B1EA318B7DEBD150366`. | **[current]** | 31,651,759 B APK. Two class-count methods: REA 19,025 definitions with 229 first-party classes; raw DEX parser 22,115. |
| R-06 | HAAT ships a landmark-first address model directly relevant to Palestine. | **[current, string evidence]** | `if_there_is_no_building_number_use_driver_instructions_to_describe_your_exact_location`, `Add_area_name`, `choose_an_area`, `building_number`, `street_name`, `instruction_for_the_driver`, `tell_the_driver_how_to_locate_you`, and a main-post-office landmark example. |
| R-07 | HAAT's app was not usable on this network during the first-run pass. | **[current, phone/DNS]** | Location-permission screen led to no-internet message. `envs-list.haatcloud.com` and `haatproduction.blob.core.windows.net` returned NXDOMAIN; `haat.delivery` resolved and responded. Report this as network reachability from this phone, not as proof HAAT is globally broken. |
| R-08 | HAAT includes MQTT tracking, account deletion and forced-update components. | **[other-agent/current]** | `org.eclipse.paho.android.service.MqttService` in the manifest; `UserDeletionActivity`; `ForceUpdateActivity` recorded in §11. MQTT is a candidate to benchmark, not a reason to replace Wind's signed-cursor polling without measurements. |
| R-09 | Uber 4.655, Shiply and Souq Tulkarm studies remain the other reference pillars. | **[other-agent]** | `UBER-4.655-rider.md`, `SHIPLY.md`, `SOUQ-TULKARM.md`, and the cross-app index. Athkar and Salati are prayer utilities, not delivery competitors. |
| R-10 | HAAT iOS metadata and Careem iOS metadata were read, but no IPA was obtained. | **[open]** | No iOS implementation or parity claim is supported. |

## Governing cut-off decisions

1. **First release task:** build, install and prove a production APK whose embedded API URL is CloudFront.
   Do not begin an RDS migration, map-provider rewrite, MQTT migration, subscription expansion or a
   broad competitor-feature program before this path works.
2. **Second:** establish reproducible release gates: fix the lint configuration/root cause, rerun the
   full integration gate until the intermittent URL result is understood, and complete the persistence
   gate without hiding timeouts or skipping tests.
3. **Third:** prove a timed replacement-host restore and establish a notification that reaches a
   person. The daily backup exists and passes a local integrity check; that alone is not recovery or
   outage notification evidence.
4. **Fourth:** complete sandbox cash handover and reconciliation, then run the named phone scenarios.
   Do not call the two delivered sandbox orders a production pilot.
5. **Conditional work:** immediate payment-capture corrections are required before any real card
   activation, but digital payment activation was not approved and is not part of this cut-off.
6. **Fable process:** the earlier Fable-labelled process was not present. The only active Claude Code
   CLI found was PID 18832, `claude-opus-5-5`, session `78352bbb-38c6-4674-a032-c9c325a5f39f`.
   It was left running to preserve the other agent's work. There was no Fable process to kill.

## Evidence locations

- Test-PC logs: `C:\wind-b89f220-typecheck.log`, `C:\wind-b89f220-lint.log`,
  `C:\wind-b89f220-test-gate.log`, `C:\wind-b89f220-url-direct.log`,
  `C:\wind-b89f220-url-filter.log`, `C:\wind-b89f220-persistence-gate.log`,
  `C:\wind-b89f220-phone-identity.log`, `C:\wind-b89f220-doctor.log`.
- Test-PC source copy: `C:\wind-b89f220-test`, an isolated copy of `b89f220` with exact lockfile
  dependencies. It contains test-generated artifacts, not an approved release worktree.
- Test database: existing PostgreSQL 18.3 on port 55493, with per-suite isolated `wp03_…` schemas.
  No existing instance was stopped, no production database was touched.
- Phone evidence: `C:\Users\osama\AppData\Local\Temp\opencode\wind-production-login.{xml,png}`,
  `wind-driver-pickup.png`, `wind-driver-picked.png`, `wind-code-keyboard.{xml,png}`,
  `wind-driver-delivered.{xml,png}`, `wind-customer-delivered.{xml,png}`,
  `wind-cash-handover.{xml,png}`.
- Reference evidence: `careem-selected-resources.json`, `haat-selected-resources.json`,
  the hashed APKs under `apks\`, and the existing `REA-2026-11-13-reference-apps` directory.
