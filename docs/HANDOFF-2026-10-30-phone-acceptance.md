# Handoff — 30 October 2026: phone acceptance, k5 gates, cloud subscription check

Branch `claude/cloud-features-app-completion-d38b55`, base `65509bb`, work committed as `bf64cb0`. Not pushed or deployed.

## What the Part 2 research did and did not do

`RESEARCH-2026-10-30-part2-verification-cloud-features.md` (Haiku 5.5) is research only: HEAD was unchanged at `65509bb` and no code, cloud resource or account was touched. Corrections from this session:

- It priced Israel Central and AWS Tel Aviv. Production actually runs in **Azure Sweden Central** (`wind-prod`), and the AWS project is locked to **eu-north-1** (Stockholm), so the Tel Aviv column does not apply to this account.
- Two of its "not verified" items are verified: the public trip link hides private points and contacts (scenario suite, "anonymous recipient tracking without private contacts or landmarks"), and the quote lock is server-enforced (`server/main.ts` `price_changed` 409, `quote_price_conflict` 400).
- Its feature list (Web PubSub fan-out, share-with-five-contacts, RideCheck, telephony masking, H3) is new scope. Nothing in it blocks the parcel pilot; build only after the owner confirms v1 scope (its §4.5).

## Cloud subscriptions (read-only check, 30 Oct)

| Subscription | Offer (quotaId) | Holds | Fit for real users |
|---|---|---|---|
| Azure subscription 1 | `FreeTrial_2014-09-01`, spending limit On, first resource 28 Oct 2026 | All of `wind-prod` (VM `Standard_B2ts_v2` running, ACR, storage, Container Apps env + `wind-api`, Log Analytics), Sweden Central | **Yes, after upgrade to Pay-As-You-Go.** A free trial stops services when the trial period or credit ends (check the date under Cost Management → Credits) |
| Azure for Students | `AzureForStudents_2018-01-01` | Unrelated `smartpro` resources (Germany West Central) | No: education / non-commercial terms |
| AWS (profile `osama`) | Free plan, ACTIVE, $140 credit, expires 2027-04-30, region eu-north-1 | No Wind resources | No for now: Free plan suspends at expiry and Wind has no AWS infrastructure code |

Recommendation: keep Wind on **Azure subscription 1** and upgrade that subscription to Pay-As-You-Go in the portal (same subscription ID, no migration), then add a budget alert. Owner action: it is a billing change.

## Production (read-only)

`npm run check:deployment -- --origin https://windapi236.swedencentral.cloudapp.azure.com`: health, ready, auth options, 401 tracking, privacy/terms/account-deletion and bundle origin PASS; **"current map page" FAIL** — production serves an older build than this source (its `map.html` lacks the later guard that tells the app to fall back when the map config is missing, instead of leaving a blank map). Deploying HEAD needs the owner's explicit go-ahead.

## Fixes this session (issue -> change -> verification)

1. Stale demand stayed on the job board for **24 days**, not the documented 24 h (`24 * 86_400_000`), and a scheduled order whose slot passed unclaimed never expired (seen on the A53: 9-day-old W-00002/W-00003 still "searching", and the driver app offered W-00002 first) -> `SEARCH_EXPIRY_MS` default 24 h; `expireStaleDemand` ages an order from `COALESCE(scheduled_for, created_at)` in both the select and the CAS, and (2 Nov review fix) an order a driver released ages from its return to the board (`assigned_at IS NULL OR updated_at < cutoff`), so it is not cancelled the minute it comes back -> `tests/jobs-pagination.test.mjs` proves a 25 h order, a slot missed by 25 h and an order released 25 h ago expire, while a 23 h order, an assigned order, future work booked 30 h ago, a slot missed by 1 h and a just-released 30 h-old order stay; restoring the 24-day constant, dropping the release guard, or ageing from `created_at` alone each makes it fail (mutation checked). The sweep runs every minute, at most 50 orders per run, and logs a count when it cancels anything.
2. After an in-app language switch Android kept the Arabic text width and clipped "Your current order" to "Your current" (cold relaunch rendered it correctly) -> `Txt` keyed by language in `src/ui.tsx` so text re-measures -> rebuilt customer APK (sha256 `5E902F1F…4237`) on the A53: Arabic→English switch at runtime now shows "Your current order" in full.
3. Lint warning `react-hooks/exhaustive-deps` in `src/app/book.tsx` (`slotBucket` is the intentional recompute trigger) -> explained disable comment -> `npm run lint` clean.
4. Flaky wall-clock tests: `eligibility-review` (local) and `phone-identity` (k5) each failed once, then passed three isolated reruns. Both put a timestamp 1 ms past a limit (an observation 300,001 ms old against 300,000; a challenge expiring at `Date.now() - 1`), so a backward clock adjustment mid-request flips the expected 400 to 200. Ten such fixtures in eight files shared the pattern -> moved to 1 s past the limit (`eligibility-review`, `phone-identity`, `phone-identity-authority`, `phone-identity-limits`, `presence`, `change-destination`, `driver-destination`, `promo`); `dispatch-races` keeps its 1 ms because a DB check requires an offer's expiry to follow its creation -> every affected suite passes; loosening the approach limit to ten minutes makes `eligibility-review` fail (mutation checked).
5. k5 could not run DB suites: `initdb` crashes there in post-bootstrap (0xC0000005) under SSH, and the `file:./vendor/*` packages arrived as broken links -> data directory initialised on this PC with the same PG18 build and shipped to `C:\wq-k5\.expo\implementation\pgdata` (the server starts fine there, PostGIS verified); `vendor\{decode-uri-component,deepmerge,node-forge}` copied into k5's `node_modules` -> k5 persistence exit 0 and npm test (table below).

## Gates

| Gate | Local (this PC) | k5 (SSH; 31 Oct rerun of every row in its own `C:\wq-k5b`, port 55474) |
|---|---|---|
| lint | 0 | 0 |
| typecheck (app + server) | 0 | 0 |
| test:contracts | 0 | 0 |
| jobs-pagination (stale-expiry fix, SQLite) | 0 | 0 |
| npm test | 0, 88 suites | 0, 88 suites (with `BICEP_COMMAND=C:\wq-k5\tools\bicep.exe` for the Azure template suite) |
| test:persistence | 0 (all suites + 22/22 legacy parity) | 0 (all suites + 22/22 legacy parity) |
| test:scenarios (desktop browser) | 0, all groups | not run (no Playwright browsers on k5) |
| test:android-browser (A53 Chrome) | 0: signup, GPU map + exact pickup picker, booking to searching, Arabic tiles + live marker | n/a |

An earlier local persistence run failed only while a Gradle build loaded the CPU (statement/lock/connection timeouts 57014/55P03); isolated reruns after the build passed. On k5, one full `npm test` run failed once in `session-idle` ("last_seen_at stamped at login", which needs more than 60 s between login and the check); three isolated reruns and the next full run passed, so it is recorded as an unexplained one-off, not fixed.

**31 Oct, k5 shared with another session.** A second session synced its own tree into `C:\wq-k5` and started/stopped the same PostgreSQL (55473) while this branch's gates ran: uploaded files were overwritten, the server got fast-shutdown mid-suite (ECONNRESET, "terminating connection due to administrator command"), and the helper's 15 s stop timed out during the shutdown checkpoint, so every later start hit crash recovery. This branch now gates in its own `C:\wq-k5b` (branch files only; `node_modules`, Node, PG binaries and Bicep are junctions to `C:\wq-k5`) with its own fresh data directory on port 55474 (`gate-b.cmd`, `WIND_TEST_DATABASE_URL`). `local-postgres.mjs` now waits up to 3 min for start/stop and probes until connections are accepted (master's version, merged from #2), and `phone-provider.mjs` honours `WIND_TEST_DATABASE_URL` like every other PG suite.

k5 setup used no internet installs: portable Node 24.12, repo snapshot, `node_modules` and PG18 binaries copied over SSH into `C:\wq-k5`, plus the shipped data directory and vendor copies from fix 5. Gate scripts there (`gate*.cmd`) start the isolated PostgreSQL, run the suite and stop it within one SSH command.

## Physical phone (SM-A5360, R5CTB0FJP9Z), QA APKs built from this tree

Native smoke PASS for customer, driver and admin (cold launch, no Metro, correct identity). Native driver journey: accept, live GPS, **app backgrounded 75 s with fixes every 15–20 s** (foreground location service + notification), arrive, pick up, wrong handover code rejected, right code completes, then the location service, GPS registration and notification stop; customer map showed tiles, marker, road route and ETA; customer rating 4/5 stored; receipt correct; English layout mirrors correctly. T04.2 denied case: with location denied, "Use my current location" shows the system prompt, "Don't allow" gives "Location unavailable. Choose the city and enter a landmark", and "Pickup on map" opens a working tile map with Confirm spot.

Not run on the phone: locked-screen tracking (needs the owner to unlock afterwards), large system font (changing the phone's font scale is a system setting), push delivery (needs FCM/EAS project), Google renderer (no restricted key), iPhone (none).

## Owner gates before real users

1. ~~Upgrade Azure subscription 1 from Free Trial to Pay-As-You-Go.~~ Done (2 Nov ARM read: `PayAsYouGo_2014-09-01`, spending limit Off). No budget alert exists yet; add one in Cost Management, because nothing caps the bill now.
2. Approve deploying this tree to `windapi236` (production runs an older build). Before that deploy, count production orders the new 24 h expiry would cancel at once (`status = 'searching' AND driver_id IS NULL` and older than 24 h by `COALESCE(scheduled_for, created_at)`): each gets a cancellation push, at most 50 a minute. If the count is large, deploy with `WIND_SEARCH_EXPIRY_MS` set high and step it down.
   - Owner decision (review finding, not changed): a scheduled order whose slot has passed stays on the board and can still be accepted for up to 24 h after its pickup time. Choose a shorter grace period if late pickups should not be offered.
3. Real support contact, email sending domain (password recovery), SMS provider for +970 if phone verification is wanted.
4. EAS project / FCM for push, Play Console listing and signing for store release.
5. Confirm v1 scope before any of the research's new rider features.
