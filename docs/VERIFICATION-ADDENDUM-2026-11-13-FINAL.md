# Wind — final verification addendum, 13 November 2026

This addendum records the continuation that cross-checked the app, phone, test PC, AWS account,
and reference artifacts without changing the other agent's work. It is not a replacement for every
historical observation. Where an older statement conflicts with a freshly checked fact, the
`research_notes/verification-2026-11-13/CLAIMS-LEDGER.md` row identifies the difference.

## 1. The first problem is the client, not the healthy AWS API

`https://dlvxzw3gj596d.cloudfront.net/api/ready` returns HTTP 200 and
`{"ok":true,"schema":3}`. The installed production APK is `ps.wind.app` 1.1.0, **versionCode 24**,
updated 9 November. Its SHA-256 is
`5248ABE94BB46DD9555E3DFEA4724C38279624B25A18AC1DCB58A66516891ABB`, size 107,454,199 B.
The extracted JavaScript bundle contains `https://windapi236.swedencentral.cloudapp.azure.com`.
That host resolves to `20.91.209.132`, but its HTTPS request timed out.

A fresh phone launch did open the login screen. A dummy-password sign-in/phone-check attempt then
showed **“تعذّر التحقق من حالة الرقم. حاول مرة أخرى.”** and left the user on that screen. No real
credential or account was used. The precise conclusion is: **the installed production client cannot
complete the tested sign-in/phone-check path because its baked backend is stale**, not “the APK
cannot start” and not “AWS is down.”

`src/api.ts:13` consumes `EXPO_PUBLIC_API_URL`, and `eas.json` has a `production` environment. The
build must set the CloudFront URL there and prove the value in the produced artifact. The build
command and acceptance checks are in `HANDOFF-2026-11-13-FABLE-5.2-FINAL-VERIFIED-CUTOFF.md`.

## 2. A second, different-method phone pass

The test build is 1.1.0 **versionCode 1**, not the production versionCode 24. It uses the isolated
sandbox behind `adb reverse tcp:4191`, not production.

| Step | Driver | Customer / admin | Result |
|---|---|---|---|
| Existing W-00007 at pickup | Arrived at pickup; real GPS is `32.313261,35.049752`, ~48 km from Ramallah | Customer sees driver at pickup | Correct far-distance warning |
| Collect | Tap collect, then explicit **متابعة** at the 48 km confirmation | Order advances | Guard does not silently collect |
| Transit | In transit; driver location updates visible | Customer sees in-transit state and actual handover code | Two-role state propagation works |
| Delivery code | Code field focused, keyboard open, submit visible | Code read from the customer screen | Keyboard requirement passes |
| Delivered | `تم التوصيل` at 04:46 | Same state in customer order detail | Sandbox G5 happy path passes |
| Cash | — | Four completed sandbox orders ₪80, commission/net ₪12; handover form prefilled ₪12 | Cash handover opened and **cancelled**, not settled |

The 80–107 minute / 77–86 km display is explained by the driver's actual distant position. It is
not evidence of a bad Ramallah–Al-Bireh route. The app explicitly warns the driver and requires an
override. A real route-legality and ETA calibration still needs a driver actually travelling the
pilot route.

Background location permission was granted. The phone-lock attempt did not produce a valid unlocked
follow-up measurement, so **lock/background tracking is unproven**. The admin cash form was not
submitted: cash handover, settlement and reconciliation remain open. Sandbox W-00008 was also
observed as delivered; the other agent's W-00008 evidence is retained in §10.12 of the earlier report.

## 3. The clean baseline, measured on the test PC

Reference: `origin/master` / `b89f2205965523b5ab8545dff3940d1eacb6062c`. The root checkout is
`b609229`, ahead 6 / behind 277, with extensive pre-existing changes. No reset or source mutation
was performed. A separate copy on `DESKTOP-S2JKMK5` used exact lockfile dependencies.

| Check | Result | Evidence / meaning |
|---|---|---|
| `npm run typecheck` | **PASS** | `C:\wind-b89f220-typecheck.log`, exit 0 |
| `clean-typecheck.test.mjs` | **PASS in isolation** | 8.83 s |
| `npx expo lint` | **FAIL: three imports** | `expo-auth-session`, `expo-web-browser`, `expo-notifications`. Exact `npm ci` used; Node and TypeScript resolvers find them. Root cause still needs a focused toolchain fix. |
| `npm test` | **FAIL, intermittent** | Full gate failed `url-decoder.test.mjs:15`: `'%41…' !== 'A…'`. Direct test and `--filter=url-decoder` both passed. Do not call this a confirmed decoder defect. |
| Integration registry | **122 suites** | Parsed `scripts/run-tests.mjs`; 124 `.test.mjs` on disk, with two explicit PostgreSQL-only exclusions. |
| PostgreSQL | **18.3 available and working** | Existing test-PC server on port 55493. `subscription-migration.test.mjs` passed in a fresh isolated schema. |
| `npm run test:persistence` | **NOT GREEN** | Phone identity 503 in one full run but standalone identity passes; next run `pg_restore.exe ETIMEDOUT` at `pg-import.mjs:142`. Needs root-cause diagnosis. |
| `expo-doctor` | **2 failed checks** | `.expo` Git-ignore finding plus eight SDK patch mismatches. No upgrade applied. |

The older `booking-retry-race.test.mjs` failure belongs to the dirty tree, not the clean baseline.
The earlier claim that the test PC has no PostgreSQL is also wrong: the 18.3 server was already
running. Both distinctions are necessary to prevent work on the wrong defect.

## 4. AWS — current facts, not assumptions

- The `wind` login profile is expired. The read-only credential identifies IAM user
  `BedrockAPIKey-vaer` in account `083712835043`; no secret is recorded in this package.
- **Backup delivery and basic restorability pass:** `wind-backups-083712835043` contains both
  `wind-20261112T165723Z.db.gz` and `wind-20261113T031001Z.db.gz`, each 10,148 B. The latter has
  `LastModified=2026-11-13T03:10:04Z`, a version ID and AES-256 encryption. Its downloaded SQLite
  copy passes `PRAGMA integrity_check = ok`: 37 tables, 9 users, 2 cancelled orders, no cash entries
  or push subscriptions. Timed replacement-host recovery and application compatibility remain open.
- `synthetics describe-canaries` returns `Canaries: []`.
- Name-filtered CloudWatch alarms for Wind return `[]`; the other alarms belong to Baydar and are
  unrelated. No Wind outage notification was proven to reach a person.
- `sns list-topics` is denied to the available credential. This is not evidence that no topic exists;
  the earlier owner-session inventory is kept separately.
- The previous full-session inventory recorded the production image/revision. Reconfirm it after the
  owner refreshes `aws login`; the current credential cannot inspect the host.
- Official RDS documentation lists PostgreSQL 18.6 / PostGIS 3.6.3 and 18.3 / PostGIS 3.6.1.
- Official End User Messaging documentation lists Palestine (+970): no short/long codes,
  **Sender ID yes, two-way no, international sending yes**. International origination can be best
  effort and downstream-replaced. That is not a delivery guarantee.
- No AWS resource was created, changed or deleted. Owner approval is needed for paid monitoring,
  domain, RDS, SMS production, or migration work, and for any cleanup. Do not delete unrelated
  resources in this shared account.

## 5. What the competitor evidence actually supports

The two independent REA methods and their separate class counts are preserved. Differences are
counting-method differences, not product-capability differences.

| Reference | Verified transferable observation | Boundary |
|---|---|---|
| HAAT `com.haat.client` 21.0.4 | Area/landmark/driver-instruction addressing, human Arabic order states, granular ETA copy, coupons/fees, referral, account deletion, forced update, MQTT | App was not reachable beyond permission on this phone/network; do not claim global outage or observed checkout behaviour. |
| Careem rider `com.careem.acma` 26.43 | Map/nickname/building-type/notes/photo address components; cash-only warnings and arrears/balance block; map provider behind an interface; booking workflow and server-driven keys | Cash-only booking is not the same as ordinary cash being a Careem Pay payment instrument. Required-building messages coexist with the pin/photo form; do not impose them on Palestinian addresses. |
| Careem Captain `com.careem.adma` 89.70.2 | Earnings breakdown taxonomy, cash-debt consequence, shift/acceptance/arrival mechanics | Existing other-agent study retained; not re-acquired. |
| Uber 4.655 | Map POI layer, Arabic cash copy, map-first/live tracking patterns | Global reference, not the correct economic baseline for Palestine. |
| Shiply / Souq Tulkarm | Local cash/custody, append-only corrections, proof codes, shift/queue, offline writes | Static API/UI evidence, not a server guarantee. Athkar and Salati are not delivery competitors. |

The strongest product recommendation is narrow: **area + optional building/street + landmark +
clear driver instructions + optional pin/photo**, with permissive entry and strict dispatch checks.
Do not start a super-app, wallet, MQTT, map-provider or broad competitor-cloning program from this
research.

## 6. Explicit remaining work

1. Build and verify the production CloudFront APK and a real forced-update path.
2. Fix lint's resolver configuration; establish a deterministic full integration gate.
3. Diagnose `pg_restore.exe ETIMEDOUT` and the full persistence run; keep standalone passes labelled.
4. Prove a timed replacement-host restore and application compatibility; prove a human receives an
   outage notification, including backup-failure notification.
5. Complete sandbox cash handover/reconciliation and the existing 24-scenario phone matrix,
   especially reconnect, background/lock, offline and accessibility cases.
6. Obtain the first real production pilot delivery before claiming calibrated ETA, courier economics,
   pricing, notification delivery rates or production readiness.
7. Fix the observed `bireh` search ranking issue and review the login phone-check retry presentation,
   but only after the stale production endpoint is repaired.

The detailed claims, artifacts and command boundaries are in
`research_notes/verification-2026-11-13/CLAIMS-LEDGER.md`.
