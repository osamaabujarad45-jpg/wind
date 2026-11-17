> **Superseded for implementation:** use
> [`HANDOFF-2026-11-13-FABLE-5.2-FINAL-VERIFIED-CUTOFF.md`](HANDOFF-2026-11-13-FABLE-5.2-FINAL-VERIFIED-CUTOFF.md)
> and `../research_notes/verification-2026-11-13/CLAIMS-LEDGER.md`. This file is retained as a
> historical handoff; its gate results and open items mix different trees and times. The final
> package records the current baseline and new phone/AWS evidence without deleting this work.

# Handoff to the implementation lead — Wind, 13 November 2026

**Read this before you touch anything.** This replaces
`docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md` as your working brief. It is shorter because every
claim in it has been checked against the code, the running app, the AWS account or the phone, and the
evidence is cited. The companion report
`docs/REPORT-2026-11-13-VERIFIED-STATE-AND-GAPS.md` holds the full evidence, the corrections to the earlier
research, and the measurement tables.

**Evidence labels used below.** `[ran]` executed in this session. `[read]` read in source at the cited path.
`[aws]` live AWS API answer. `[phone]` measured on the `SM-A5360`.

---

## 0. Your first ten minutes

Read, in this order:

1. This file.
2. `docs/REPORT-2026-11-13-VERIFIED-STATE-AND-GAPS.md` §0, §1 and §6.
3. `docs/CURRENT-WORK.md` (top) and `docs/PLAN-2026-11-10-OPEN-ITEMS.md` (the 48-row ledger).
4. `research_notes/REA-2026-11-13-reference-apps/PALESTINIAN-COMPETITORS-INDEX.md` — before you change the
   address model, the cash ledger, the driver settlement flow or the tracking privacy rules.

Then check your base:

```bash
git fetch origin
git merge-base --is-ancestor origin/master HEAD; echo "exit=$?"   # must be 0
```

**The local checkout in this repository is not a descendant of `origin/master`.** Local `master` is an
unrelated older line. Branch from `origin/master` (`b89f220`). If you start a worker with worktree isolation
it will start on the wrong line — give workers the shared checkout and separate files instead.

---

## 1. The state of play, in one page

| | |
|---|---|
| **Product** | Wind — parcels, rides and freight for the West Bank. Live on AWS, `eu-north-1`, account `083712835043`, behind `https://dlvxzw3gj596d.cloudfront.net`. Production runs **parcels only, cash only**; rides and freight are off. |
| **Stack** | Expo SDK 57, React Native 0.86.3, Expo Router, MapLibre 6.12 in a WebView, `node:sqlite` in production and `pg` for PostgreSQL. Server: `server/main.ts` plus `server/domain/`. **No Supabase.** |
| **Traffic** | A pilot that has not yet started. The production database holds **9 users (1 active admin, 8 blocked), 2 orders — both cancelled, 0 completed deliveries, 0 cash-ledger entries, 0 push subscriptions** `[ran]`. |
| **Gates** | **No clean gate run exists for any revision.** `npm test` is red at `b609229`, a **stale local line**: it stops at `tests/booking-retry-race.test.mjs:97` and 37 suites never run `[ran]`. That test **does not exist on `origin/master`**, and the behaviour it pins is already fixed there. Do Batch 0 before believing any gate claim, including this table's. |
| **Outside alerting** | None that reaches a person. **0** CloudWatch Synthetics canaries exist in `eu-north-1` `[aws]`. The in-app "no recent backup" alarm exists but has **no push subscription** to travel on `[ran]`. |
| **Backups** | The bucket `wind-backups-083712835043` holds **one** object, `wind-20261112T165723Z.db.gz` (12 Nov 16:57Z) `[aws]`. The host cron runs at **03:10 UTC** daily (`infra/vm/wind.cron`). |
| **Release channel** | None. The production APK on the owner's phone is **versionCode 24, built 9 Nov** — four days and one merged PR behind `origin/master` `[phone]`. Every client fix needs a hand-installed APK. |
| **Competitive baseline** | Until now: Uber only. Now also studied: **Shiply and Souq Tulkarm**, the two apps Wind actually competes with in Palestine, from real builds pulled off the owner's phone `[ran]`. (Two other apps that looked like competitors by name - Athkar and Salati - turned out to be prayer-time utilities, not delivery apps. Verify the artifact, not the name.) |

**The sentence that decides your order:** because production has never completed a delivery, every number
about ETA accuracy, courier pay, cash reconciliation or push delivery has **zero samples**. Do not spend a
week building a pricing formula on invented inputs. Collect the trips first; the rest follows.

---

## 2. Three corrections to the earlier research. Do not repeat them.

1. **Wind does not use Supabase.** `research_notes/Fable 5.2 verified execution handoff/reference-rea-audit.md`
   says "Real Supabase OTP", "Supabase Realtime/PG_NOTIFY consumers" and "Reuse Wind's existing
   Supabase/Expo/MapLibre/OSM patterns" (lines 116, 127, 144). There is no Supabase dependency and no
   occurrence of the string in `src/`, `server/` or `package.json` `[ran]`. The real mechanisms are:
   - identity — opaque per-user records plus a phone-OTP provider abstraction
     (`server/domain/phone-provider.ts`), rate limits in `server/domain/eligibility.ts:22-23`;
   - sessions — server-issued bearer tokens, absolute and idle expiry;
   - live updates — a **signed cursor event stream** (`server/domain/realtime.ts`), not a realtime broker;
   - persistence — SQLite in production, PostgreSQL for the cutover.
   Use the real ones. Re-ground rows W1, W12 and W18 of that audit before you use them.
2. **Careem's Android package is `com.careem.acma`**, not `co.careem.acma` (which does not resolve). The
   driver app is `com.careem.adma`; there is also `com.careem.partner.app` `[ran]`.
3. **The suite counts were wrong.** The integration runner lists **97** suites, the persistence runner **52**,
   and `tests/` holds 99 `*.test.mjs` files plus 60 further `*.mjs` suites `[ran]`. The earlier handoff's
   "131 suites" matches none of them.

Two more things the earlier handoff got right, so you do not re-litigate them: the map really is MapLibre
6.12 in a WebView on a single free tile host, and Android really has no over-the-air update path.

---

## 3. Your work queue. In this order, because each one unblocks the next.

Every item below states the change, the evidence that proves it, and what "done" means. Do them one at a
time, one purpose per merge, and read the full diff of every merge yourself — including any change a worker
made.

### Batch 0.0 - The client points at a dead server. Fix the build and ship an APK. Nothing else matters first.

**Every pilot phone runs a build that cannot reach production.** `[ran]` The installed `ps.wind.app`
(versionCode **24**, 9 Nov, 107,454,199 B, SHA-256 `5248ABE94BB46DD9555E3DFEA4724C38279624B25A18AC1DCB58A66516891ABB`)
has **`windapi236.swedencentral.cloudapp.azure.com`** compiled into `assets/index.android.bundle`, and the
CloudFront hostname appears **zero** times. That Azure VM was stopped on 12 Nov. The server is healthy; the client
is misconfigured.

*Do:*
1. Set `EXPO_PUBLIC_API_URL=https://dlvxzw3gj596d.cloudfront.net` in the `production` build environment
   (`src/api.ts:13` reads it; `eas.json` has a `production` environment).
2. Rebuild the APK.
3. **Prove the value reached the artifact** before shipping: unzip the APK and grep
   `assets/index.android.bundle` for the hostname. If the Azure host is still there, the build did not take it.
4. Install on the pilot phones and complete one real sign-in through the phone-check step.

*Gate:* the produced bundle contains the CloudFront host and not the Azure host, and a real sign-in on the
physical phone succeeds past the phone check. Note that the current build's failure copy — *"تعذّر التحقق من حالة
الرقم"* ("could not verify the account status") — names verification when the cause is the network; fix that
copy in the same batch.

**Until this ships, no other batch can be accepted in the field**, because every client test would be running
against a dead host.

### Batch 0 - Prove the branch before you change it (half a day, do it first)

Nothing else here is trustworthy until this is done, because the previous draft of this handoff reported a P0
defect that existed only in a stale local checkout.

```bash
git worktree add ../wind-rc origin/master
cd ../wind-rc
git rev-parse HEAD          # record the full SHA
npm ci
npx tsc --noEmit
npm run lint
npm test
npm run test:persistence    # needs PostgreSQL 18.3 + PostGIS 3.6 on 127.0.0.1:55473
```

Archive the full output with exit codes. *Done:* you can state, for one exact SHA, which rungs pass and which fail,
with logs. **Today nobody can state that for any revision**, because the only full-suite run was against a dirty
tree on a stale line.

Note: PostgreSQL 18 with PostGIS 3.6 is installed on **neither** the owner's PC (which has 16 on 5432) nor the test
PC (which has none), so this batch may begin with installing it.

**Hold:** no production database cutover until Batch 0 is green **and** the restore drill in Batch 2.2 has been
timed and verified.


### Batch 1 — Un-break the build and close both money paths

**1.1 There is no booking-recovery fix to make on `origin/master`. Verify that first, then close the two real
payment paths.** An earlier draft of this handoff told you to fix a booking-recovery defect in `src/app/book.tsx`.
**It is not a defect on `origin/master`** `[ran]`:

- the test that is said to pin it, `tests/booking-retry-race.test.mjs`, **does not exist on `origin/master`**
  (`git cat-file -e origin/master:tests/booking-retry-race.test.mjs` fails);
- `origin/master:src/app/book.tsx` guards the clear with `!retrying && errorCode(e) !== 'booking_command_expired'`
  and routes `quote_consumed` to a re-quote. The local checkout holds a **stale** version of that file (688 lines
  apart), which is where the defect appears.

*Do:* run `git merge-base --is-ancestor origin/master HEAD` before anything else, then confirm the two points above
yourself. If your branch came from the stale line, that is the real bug to fix.


**1.2 Two ungated capture paths, not one.** `server/domain/payments.ts:60-63` (`createIntent`) writes
`status='captured'` straight from `provider.create()` with no `settlementGate` call, while `getIntent` (L78)
and `applyProviderEvent` (L91) both gate. **The earlier review found only this one. `query()` at L79 is a
second ungated path** and it calls the provider a second time on every poll.

*Change:* route **every** transition to captured — create response, poll, webhook — through one
idempotent, gated transition.
*Proof:* tests for immediate capture, delayed capture, duplicate and out-of-order webhooks, timeout then late
capture, refund-before-capture, and partial/full refund reconciliation. Settlement gate executes exactly once
per order; the ledger and the provider agree.
*Scope:* real card payments stay disabled. This is correctness work, not payment activation.

### Batch 1.3 - Four cheap, verified wins (do these inside Batch 1)

**1.3a Arm the forced-update gate.** `src/api.ts:23` reads `EXPO_PUBLIC_UPDATE_URL`; `.env.example:31` ships it
**empty**, and the code comment says "Unset: the forced-upgrade screen can only offer support". Wind has a
working forced-update *screen* and no way to force an update `[ran]`. Combined with the measured fact that the
phone's production APK is four days behind `origin/master`, **you currently cannot retire a broken build.**
*Do:* host the APK over HTTPS, set the variable in the production build, and decide the minimum build number.
*Gate:* a build below the minimum shows the update screen and the link actually downloads an APK.

**1.3b Do not remove the 1.35 font cap. Rework around it.** `src/ui.tsx:200` caps all text at
`maxFontSizeMultiplier={1.35}`, deliberately, per its own comment ("OS text scaling stays on, capped so large
Arabic/English text grows without clipping the fixed line heights"). Measured on the SM-A5360, the welcome
tagline grows **82 to 116 px (+41 %)** as the system font scale goes 1.0 to 2.0, so scaling works but stops
short of the WCAG 1.4.4 expectation of 200 %. *Do:* rework the fixed-height containers that force the cap
(proof-code groups, price rows, fixed footers, admin rows), then raise the cap toward 2.0. *Gate:* the measured
table in `REPORT-2026-11-13-VERIFIED-STATE-AND-GAPS.md` section 10.1, re-run in both languages on the welcome
**and** order-detail screens, with no clipping after a language switch.

**1.3c SMS OTP is one-way to Palestine.** Twilio's Palestine guidelines state `+970`, **no two-way SMS**, and a
sender ID that the network overwrites with a generic alphanumeric ID. *Do:* design OTP as one-way only, never
ask a customer to reply by SMS, never show "from Wind" as a trust cue, and add a support path for undelivered
codes. *Check:* the chosen provider's own documentation for `+970`/`+972`, because Twilio's page is not AWS End
User Messaging.

**1.3d Keep the three money states separate.** Fulfilment (`created, assigned, picked_up, delivered`), payment
(`unpaid, paid, failed, refunded`) and cash reconciliation (`due, collected, handed_in, reconciled`) must never
collapse into one status. A delivered order can still have an unresolved cash exception. Wind's cash model
already separates collection from settlement, so this is a **written check** rather than a redesign, but write
it down before rides and freight are switched on.

### Batch 1.4 - Run the phone matrix you inherit

The research set specifies **24 acceptance scenarios** with stable IDs and exact steps, and **none has been
executed**. Treat them as your phone gate, in this order:

1. **C-03** submit a booking and interrupt at pre-response, post-server-accept, and on reconnect; confirm one
   order, correct price, preserved draft. This is Batch 1.1 seen from the customer's side. **Done once already on
   13 Nov** (order W-00008, full two-role trip, no interruption): use that run as the baseline, and note that the
   far-pickup guard and the keyboard-open Deliver already verified green - see
   `REPORT-2026-11-13-VERIFIED-STATE-AND-GAPS.md` section 10.12.
2. **X-01** maximum font and display size in Arabic and English through auth, booking, active-order proof,
   driver handover, dispute and cash remittance. See 1.3b.
3. **C-01 / C-05** cold launch offline with saved orders; every order state across background and foreground.
4. **D-01 / D-02** a driver job across lock, background, swipe-away, force-stop and reboot; connectivity cycled
   mid-transit.
5. **A-01 / A-06** a cash entry against two similarly named drivers with a timeout after commit; a stale cash
   screen resolved offline and again after reconnect.

The full list with steps is
`research_notes/Fable 5.2 production upgrade handoff/mobile_experience_audit.md`
(scenario IDs C-01 to C-07, D-01 to D-07, A-01 to A-06, X-01 to X-05).


### Batch 2 — Make an outage visible to a human

**2.1 A canary that reaches a person.** Synthetics is available in `eu-north-1` and there are currently
**0** canaries `[aws]`. Build one against `/api/ready`, alarm to an SNS topic, and **prove a notification
arrives at the owner**. An alarm nobody receives is not an alert.
*Done:* the owner can show a received message with the matching alarm.

**2.2 The backup, watched and restored.** The only S3 object is from the 12 Nov go-live window; the 13 Nov
**03:10 UTC** run is the first fair test of the daily cron. Watch it land, then restore last night's copy
into a throwaway container, compare row counts and money totals, and **time the restore**.
*Done:* a timed, verified restore, plus the data window it would have lost.

**2.3 The in-app backup alarm needs a delivery path.** `server/main.ts:1208-1220` computes `backupStale` from
a marker file and `alertMissedBackup` pushes to active admins through `push_subscriptions` — which is **empty**
in the production database `[ran]`. Either give the admin a real subscription, or stop presenting the card
as an alarm. Do not leave a control that looks live and is not.

### Batch 3 — Stop the hostname from being a single point of failure

**3.1 Register a domain.** `dlvxzw3gj596d.cloudfront.net` is AWS-owned. It is baked into every installed
APK **and into every tracking link already sent to a recipient on WhatsApp** — the share link is
`${API_URL}${path}` from `GET /orders/:id/share` (`src/app/order/[id].tsx:565`), served by
`src/app/track/[token].tsx`. Deleting the distribution breaks every installed app *and* every live tracking
link. A domain (≈ USD 10–15/year) fixes the address, unblocks Amazon SES for verified email, and gives the
update URL somewhere stable to live.
*Owner approval required* before you spend anything.

**3.2 Decide the release channel, then ship to it.** Measured: the phone's production APK is four days behind
`origin/master` and there is no OTA path `[phone]`. Choose `expo-updates` with EAS Update, or signed APK
hosting on S3 behind CloudFront. Whichever you choose, prove that an update reaches the phone and that a
client change stops requiring a manual install. This decision changes how every later batch ships, so make
it before Batch 4.

### Batch 4 — Instrument, so the numbers can exist

Record, on every completed order: promised versus actual minutes; the route the driver actually drove; the
cash actually collected, by whom and when. Until trips exist, there is nothing to calibrate against.

### Batch 5 — Only then, the things that need data

- **Parcel pricing.** Flat `₪ 20` for Ramallah→Birzeit and for Ramallah→Nablus is visible on the phone
  `[phone]`. Build a distance-aware fare from **real route costs and courier supply**, not from a formula.
  Show a price breakdown.
- **ETA.** Keep the current formula and say plainly that it is an estimate until real trips exist. Report the
  error by city pair with its sample size. Change the formula only when the data supports it.
- **Checkpoint status.** Show the age of a report and how many drivers confirmed it; let reports expire on a
  period the owner sets.
- **Map for Palestinian towns.** One free tile host is a single point of failure. Write the owner the options
  with cost — a PMTiles or OpenMapTiles extract for Palestine and Israel hosted in S3 behind the existing
  CloudFront, keeping OpenFreeMap as the fallback style, is the strong one. **Measure first** on 3G in Nablus,
  Ramallah and Jenin, then set a byte budget and a gate that fails when the map grows.
- **Addresses.** Accept what people already have: a pasted coordinate pair, a Google Maps URL that carries
  coordinates, a short `maps.app.goo.gl` link (resolve it **on the server**, with a host allowlist and a
  timeout — it is a redirect to an outside site), and an Open Location Code (Plus Code), which needs no
  licence and works offline. Show the parsed point for confirmation; never book an unconfirmed point. Let a
  recipient propose a corrected pin from the share link, keeping the privacy allowlist intact.

### Batch 6 — PostgreSQL on RDS, priced correctly

The master plan priced an Azure server for this. That price is void. Re-price with RDS in `eu-north-1`:

| Instance | USD/hour | USD/month (730 h) |
|---|---|---|
| `db.t4g.small` | 0.033 | 24.09 |
| `db.t3.small` | 0.037 | 27.01 |
| `db.t4g.medium` | 0.065 | 47.45 |
| `db.t3.medium` | 0.074 | 54.02 |

Storage GP3 is 0.12/GB-month; Multi-AZ GP2 0.24. A `db.t3.small` with 20 GB is **≈ USD 29.4/month**
`[aws, live price list, publicationDate 2026-11-12]`.

**Use PostgreSQL 18.** Official RDS documentation gives PostgreSQL 18 → **PostGIS 3.6.3 / 3.6.1 / 3.6.0**,
17 → 3.5.x, 16 → 3.4.x `[read]`. Your tests run PostgreSQL **18.3 with PostGIS 3.6**, so RDS 18 matches the
code exactly. The Azure Flexible Server template in `docs/operations/deploy.md:83` selects **PostgreSQL 16**,
which would cap the extension at PostGIS 3.4.x — a silent downgrade. Do not use it.

The importer refuses to run outside tests on purpose (`server/migrate.ts`). Today's rollback restarts the old
container, which is unsafe once PostgreSQL is authoritative. Follow Phase 3 of the master plan, with the
cutover boundary it defines: the first new authoritative write ends the ability to fall back to SQLite.

*One command settles the last open question, and only the owner can run it* (this session's AWS credential
cannot read RDS):

```
aws login --profile osama
aws rds describe-db-engine-versions --engine postgres --region eu-north-1 \
  --query "DBEngineVersions[?contains(EngineVersions,'18')]"
```

### Batch 6.5 - Make the road graph reproducible

Two OSRM build paths exist and only one is correct `[read]`:

- `infra/osrm/build-west-bank.sh` clips the Geofabrik extract to the outer ring of OSM relation 1803010, so no
  route leaves the West Bank. **This is the documented production path** (`aws-migration-study.md:101`,
  `restore.md:45`).
- `infra/osrm/Dockerfile` extracts the **whole** Israel-and-Palestine PBF with the stock car profile, so a graph
  built from it **does route outside the West Bank**. Its comment still points at `osrm.railway.internal`, a host
  from the dead Railway era.

**Neither pins the upstream data.** Both fetch `israel-and-palestine-latest.osm.pbf`, so a rebuild can change
every ETA and every distance-based fare without a commit. *Do:* pin the extract by date and checksum, record the
graph checksum and the routing-profile version in every route response, and delete or clearly quarantine the
unclipped Dockerfile.


### Batch 7 — Read the local competitors before you redesign anything

`research_notes/REA-2026-11-13-reference-apps/` holds the new evidence: `UBER-4.655-rider.md`,
`ATHKAR.md`, `SHIPLY.md`, `SOUQ-TULKARM.md`, `SALATI.md` and `PALESTINIAN-COMPETITORS-INDEX.md`. Each file
states its own artifact identity, its evidence table, and what static analysis could not establish.
`ATHKAR.md` and `SALATI.md` are craft references, **not** competitors: those two apps are a religious app and
a prayer-times app. `HAAT.md` and `CAREEM.md` are complete static studies of the two closest references.

The reason it matters: the design decisions so far were made against **Uber** — street addresses, card
payments, a US map provider, a call centre. **Shiply and Souq Tulkarm** are built for **no street numbers, cash
on delivery, driver cash settlement and 3G**. Those are the mechanics to copy as patterns. Never copy code or
assets.

The specific things Souq Tulkarm does that Wind does not, and should consider:

- **An append-only cash ledger** whose own Arabic copy says the entries are never edited or deleted, and any
  correction is a *new* settlement entry with an actor and a reason. Wind's cash model already points this way;
  Souq is the proof that a Palestinian customer reads it as the trustworthy thing to read.
- **A customer-held proof code that carries no PII** — a code and a QR token, locked, with an audited admin
  reset, and a driver who structurally cannot see it.
- **A shift-first driver model** with a ready queue that only exists while the shift is active, and custody
  moved by scanning `VEHICLE` / `OFFER` / `TRANSFER` / `RETURN`.
- **Every write idempotency-keyed and offline-enqueueable**, with a human label on each queued action.
- **Zone-first addressing** — `zoneId` plus an address line plus an optional landmark, with no house number.

Do **not** copy Shiply's `allowBackup="true"` for an app holding addresses and parcels, or its Sentry plus
ad-storage analytics.

**And read `HAAT.md` before you touch the address form.** HAAT ships, in production Arabic, the sentence
*"إن لم يكن هناك رقم مبنى، استعينوا بالتعليمات للمرسل لوصف موقعكم الدقيق"* — "if there is no building number,
use the driver instructions to describe your exact location" — inside a form that makes **area** required,
**building number and street optional**, and the **driver instructions** the field that actually locates the
customer. That is the shape to build. `CAREEM.md` shows the shape to avoid: Careem validates area + building +
**apartment/villa number** and answers a missing one with "Address not usable". Two more things to lift from
Careem: a **refusal-reason catalogue** (27 specific `PAY_ERROR_*` sentences instead of one "payment failed"),
and **server-driven per-booking capability config** — with no OTA channel that is your only way to change
behaviour per segment without a new APK.

One result already worth acting on: Uber's 4.655 build ships **server-driven points-of-interest on the map**
(`com.uber.maps.mapsexperiencepresentation`, `GetMapPoisForAnchorRequest/Response`, `PoiGroup`, `PoiMarker`,
`PoiType`) and a **complete Arabic cash-on-delivery copy set** (`الدفع نقداً`, cash-arrears disclaimer, and a
driver-gives-no-change case) `[read, UBER-4.655-rider.md]`. The first is the shape for "nearby pickup points
and drop-off boxes". The second is a prompt to check Wind's own Arabic cash copy against a real competitor's.

---

## 4. Rules that already cost this project time. Each says where it stops.

1. **Branch from `origin/master`.** Check `git merge-base --is-ancestor origin/master HEAD` before your first
   edit. Stop: it is about the base line only, not about your branch policy.
2. **Tests and builds run on the test PC**, not the owner's PC, unless the owner says otherwise. One job at
   a time; give it the whole machine. Processes started over SSH die with the session — start long jobs
   detached and poll a log file.
3. **UI acceptance is on the physical phone** `SM-A5360` (adb `R5CTB0FJP9Z`), never an emulator. If it is not
   attached, ask the owner to plug it in. Keep the phone's test backend on `adb reverse`. After any change to a
   sheet, a field, a map or navigation, run a two-role parcel trip with the keyboard open at the handover code.
4. **A merge is not a deploy, and a deploy does not reach Android.** After a deploy, check the running image
   digest and revision. A client change reaches users only in a new APK — unless Batch 3.2 changes that.
5. **A test must be able to fail.** After each fix, revert the fix, watch the new test fail, then restore it.
6. **Verify every worker's finding in the code yourself**, and read every worker's diff line by line. Workers
   here have been wrong with confidence.
7. **Review by a different model.** For money, auth, migrations, dispatch, deploy scripts and data deletion,
   use two reviewers from different vendors.
8. **Expo changes every SDK.** Before touching an Expo or React Native API, read the docs for Expo 57 at
   `https://docs.expo.dev/versions/v57.0.0/`.
9. **AWS work:** Region `eu-north-1` only, except the global CloudFront dependencies in `us-east-1`. No
   Lambda@Edge, no StackSets, no cross-Region replication. Preview every stack update as a change set and
   refuse one that replaces `Host` or `Edge`.
10. **Secrets** never go into the repo, a prompt to a worker, or a log.
11. **Before deleting or replacing anything, find out what it really is.** A file that looks like a duplicate
    may be the only copy.
12. **Repository:** `origin` is `osamaabujarad45-jpg/wind`. Never push to `legacy-origin`.

### The gate ladder

| Rung | What | Where |
|---|---|---|
| G0 | `npm run typecheck`, `npm run lint` | test PC |
| G1 | `npm test` — **currently red at `b609229`**; it stops at the first failing suite, so a short run means suites did not run | test PC |
| G2 | `npm run test:persistence` | CI, PostgreSQL 18.3 + PostGIS 3.6 |
| G3 | `test:scenarios`, `test:access`, `test:jobs-ui`, `test:location`, `test:readiness`, `test:tulkarm`, `test:android-browser` | test PC and phone |
| G4 | `npm run screens`, then commit `docs/screens/` | test PC |
| G5 | Two-role parcel trip on the phone, keyboard open at the handover code | phone |
| G6 | Fresh install, sign up | phone |
| G7 | Independent review, findings fixed or answered | — |
| G8 | CI `verify`, `persistence`, `image` green on the merge commit | GitHub |

Some source-text tests pin code shapes (`tests/phone-ui.test.mjs`) and the public tracking view has an
allowlist (`tests/share.test.mjs`) plus a recorded contract fixture
(`docs/implementation/contracts/fixtures.json`). Update them deliberately.

---

## 5. Approved without asking, and not approved without asking

**You may, without asking:** read anything in the repo; run builds and tests on the test PC; build and
install test APKs on the phone; retry a safe failed command; create branches, commit, push, open pull
requests, get them reviewed, fix findings, and merge once review and CI pass; deploy a routine release when
every applicable gate above is green.

**Ask first:** creating anything in AWS or any other service that costs money; a production database
migration or cutover; switching on rides, freight, dispatch or boarding in production; deleting or rewriting
user data; signing up for a provider or entering a contract; installing competitor apps on the owner's phone.

---

## 6. Decisions only the owner can make

Bring these as one batch, each with a recommendation and its cost. Until each is answered, use the default
and keep working on everything else.

| Decision | Blocks | Default until answered |
|---|---|---|
| AWS Paid plan and spend limit (an exceeded limit pauses the project — that is an outage) | production stability | owner checks AWS Settings → Billing |
| Which minutes-level alert, and where it notifies | Batch 2.1 | hourly GitHub check |
| Owned domain, EBS snapshots, APK hosting on S3 | Batch 3 | do not create |
| Over-the-air updates | Batch 3.2 | APK only |
| RDS spend, migration and cutover window | Batch 6 | do not cut over |
| Self-hosted map tiles | Batch 5 | OpenFreeMap with monitoring |
| Contributing map fixes to OpenStreetMap, or keeping Wind-only corrections | Batch 5 | report only |
| Evidence of which roads drivers may use | routing | runbook warning |
| Expiry time for checkpoint reports | Batch 5 | show age only |
| Retention of driver GPS traces | Batch 5 | do not mine traces |
| Parcel pricing beyond flat ₪20 | Batch 5 | do not change |
| SMS provider and contract; sending domain | identity | invite known people only |
| Sharing learned delivery points between customers | addresses | per customer only |
| Which outside map sources Wind may import or cite (OCHA, HDX, GeoMOLG, ECF, Doroob) | Batch 5 | OpenStreetMap and driver reports only |
| Legal review before strangers | public launch | pilot among known people |

---

## 7. Reporting

For each batch report **issue → what you changed → how you verified it**, with the command, its exit code and
where it ran, and the source commit. State the gates that did not run. Put bad news first. Write for a
reader who has not seen your tool calls and is switching in from other work: self-contained, plain words, one
idea per sentence, key points in the first few sentences.

Record each batch in `docs/CURRENT-WORK.md` and update the ledger rows it touches.

---

## 8. The one-paragraph version, if you read nothing else

Wind is a well-built pilot that nobody uses yet. Its production database has nine users, two cancelled orders
and no completed delivery, which means every number the plan wants — ETA error, courier pay, push delivery —
has no samples to come from, and it means the only thing standing between the owner and an outage nobody
reports is an hourly GitHub workflow and an in-app card whose push subscription does not exist. The build is
also red right now, because a deliberately-red regression test pins a real booking-recovery defect that can
create a duplicate order, and because the payment code has two paths that can mark a payment captured
without asking the cash ledger whether cash was already collected. Fix those first; they are small and they
are provable. Then build one alert and prove a notification arrives, watch the 03:10 UTC backup land and
restore it, and register a domain so the tracking links already sitting in people's WhatsApp threads are not
held hostage by an AWS-owned hostname. Decide the release channel, because the APK on the phone is four days
behind the code. After that, collect real trips, and only then price the parcel, calibrate the ETA and
re-point the competitive design at Shiply and Souq Tulkarm instead of Uber.
