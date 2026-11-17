# Handoff to Claude Fable 5.2 — take Wind from pilot to Uber grade for Palestine

Written 13 November 2026 by Claude Opus 5.5 for Claude Fable 5.2 running as lead in Claude Code. The owner will paste the kickoff prompt in §0 and point you at this file.

## The short version

Wind is a parcel, ride and freight app for the West Bank. It is live for a small pilot: parcels only, cash only, about fifty invited people, one server on AWS. The code is large and careful, with 131 test suites, Arabic first, and many Palestine-specific details already built. But it is still pilot grade. The owner calls it "a demo", and that is close to how a stranger would feel using it. Prices are flat. Identity is not verified. Payment is cash only. Drivers take jobs from a board instead of being dispatched. The map depends on one free tile server and on OpenStreetMap data that is thin in Palestinian towns. Routing knows nothing about which roads Palestinian cars may use. ETAs are a fixed formula that real trips have never calibrated.

Your job is to close that gap, one verified batch at a time, without breaking the live service. This file gives you four things. §2 and §3 say where things really stand and what "Uber grade" means here. §5 gives a ranked set of workstreams, and for each one it says what is known, what is not, and what "done" means; §5 I surveys every map source for Palestine (Waze, Google, OpenStreetMap, Palestinian, UN and Israeli) and what Wind may legally do with each. §7 lists the decisions only the owner can make. Everything else is your call.

Labels used below: **[source]** means read in `origin/master` at `b89f220` on 13 Nov 2026. **[ran]** means executed, with where and when. **[carried]** means taken from earlier documents and not re-checked; verify it before you rely on it.

---

## 0. Kickoff prompt for the owner to paste

The owner pastes this as the first message of a new Claude Code session, with the model set to Claude Fable 5.2 and effort `high`. It follows Anthropic's published guidance for prompting Claude Fable 5.2 (see §9).

```text
I'm the owner of Wind, a delivery and ride app for the West Bank. It works today for a small pilot,
but it still feels like a demo. I want it to reach the quality people expect from Uber, built for
Palestinian roads, addresses, checkpoints, slow mobile data and cash. Please read
docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md first, then docs/CURRENT-WORK.md (top) and
docs/PLAN-2026-11-10-OPEN-ITEMS.md. Then lead the work.

You are the owner and long-term maintainer of this codebase, and its design is up to you. Improve
the structure as you work; keep each change reviewable and tested.

# Finishing work
Please avoid stopping while you still owe work the user asked for. Be persistent and do not stop
unless needed. While status notes are welcome, as is clarifying with the user on open decisions,
carry on with work that does not depend on the user's answer without unnecessary stops. If you
notice yourself inviting the user to redirect you or offering to wait, instead proceed on the next
part of the task. You may meet ordinary obstacles like errors, timeouts, locked files, empty results
or failing tools. Diagnose them first, and when they are not real blockers, work through them with
the access you have (wait and retry, fix the request, use another tool or source) rather than
stopping unnecessarily. If someone clearly decided something is a hard blocker, such as a file
marked not to be touched, access that was intentionally withheld, or a safety guardrail, leave it
alone, say plainly what you found, and look for another safe way to finish the task. Stopping before
the task is complete is very rarely merited, as in when the task can't move forward without user
input, or where the blocker is deliberate and should not be worked past. This does not override the
need for confirmation on risky or destructive actions.

# What is already approved
You may, without asking: read anything in the repo; run builds and tests on the test PC; build and
install test APKs on my phone; retry a failed command or tool that is safe to repeat; create
branches, commit, push, open pull requests, get them reviewed, fix findings and merge them once
review and CI pass; deploy a routine release when every applicable gate in the handoff §4 is green.
Ask me first before: creating anything in AWS or any other service that costs money; a production
database migration or cutover; switching on rides, freight, dispatch or boarding in production;
deleting or rewriting user data; signing up for a provider or entering a contract.

Before you start, say in a line what you're about to do; brief updates while you work help me
follow along. Close with a short recap that stands on its own (what you found, what you did, and
what's next), so I can read only the last message and have the full picture.
```

The owner can add the `# Communicating clearly` text from §8 if the reports get dense.

---

## 1. Why this work matters, and for whom

The people Wind serves move things and themselves between West Bank towns. The roads change from day to day: gates close, checkpoints slow down, some roads are closed to Palestinian cars. Most buildings have no street number, so people give directions by landmarks and by sharing a pin on WhatsApp. Mobile data is 3G in the West Bank and 2G in Gaza [carried, `docs/HANDOFF-2026-11-05-NEXT-LEAD.md` §"Palestinian-market evidence"]. Most payments are cash.

An app reaches "Uber grade" for these people when three things hold. First, it is honest: a price, an ETA, a driver position or a route on screen is true, or it says plainly what it does not know. Second, it works under bad conditions: slow data, GPS drift, a closed gate, a phone that kills background apps. Third, it is trustworthy: verified people, a record of every custody handover, a person who answers when something goes wrong, and an owner who learns of an outage within minutes.

International apps do not serve this market well, because their maps, routing and payments assume a different place. That is the opening for Wind, and it is why Palestine-specific depth (§5 B, C and D) matters more than copying more Uber features.

---

## 2. Where things stand

### 2.1 Production and infrastructure

| Fact | Label |
|---|---|
| Production runs on **AWS**, account `083712835043`, Region `eu-north-1`, CloudFormation stack `wind` (`infra/aws/wind.yaml`): one EC2 `t3.small`, Docker containers `wind-api`, `wind-osrm` and `caddy`, SQLite at `/srv/wind-data/wind.db`, behind CloudFront at `https://dlvxzw3gj596d.cloudfront.net`. Shell through Systems Manager only, no SSH port. Backups go nightly to S3 `wind-backups-083712835043`. | [source] `docs/operations/deploy.md` |
| `GET /api/ready` on that address answered `{"ok":true,"schema":3}` with HTTP 200 in 0.65 s. | [ran] from the owner's PC, 13 Nov |
| The image tag and revision running there are **not recorded** in `docs/CURRENT-WORK.md`. The AWS move happened on 12 Nov after Azure stopped the old VM for a billing failure and then disabled the subscription. Which backup was restored (the last Azure Blob copy or the owner's PC copy with 9 users and 2 orders) is not recorded either. | [source] `docs/operations/aws-migration-study.md`; gap |
| The address is AWS-owned. Every installed APK has it built in, so deleting the CloudFront distribution breaks every installed app. An owned domain removes that risk and also unblocks verified email. | [source] `docs/operations/deploy.md` |
| The master plan (`docs/PLAN-2026-11-10-ASTRA-6-FINISH-WIND.md`) still says "Azure runs the app, AWS is the safety net", and its PostgreSQL plan prices an Azure server. **Both are out of date.** Treat the rest of that plan (rules, gates, roadmap order) as current. | [source] |
| Android has **no over-the-air updates** (`expo-updates` is not a dependency). Any client change reaches users only through a new APK that they install by hand. `public/map.html` is the exception: it ships with the server image. | [source] `package.json`, `src/map-page.native.tsx` |
| Stack: Expo SDK 57, React Native 0.86.3, Node server in `server/main.ts` (about 3,700 lines) plus `server/domain/`, SQLite in production, a PostgreSQL schema used only in tests and staging. | [source] |

### 2.2 What the app does today

Customer: book a parcel (ride and freight exist in code but are off in production), choose pickup and drop-off by search, map pin, saved place or landmark, see a price, schedule for later, track the driver live, chat, share a tracking link, give a handover code, rate, see a receipt, refer friends, subscribe to Wind Plus. Driver: a jobs board, accept, turn-by-turn banner with Arabic street names, arrive, collect, deliver with the code, earnings, cash owed. Admin: dashboard, orders, users with approval, cash reconciliation, subscriptions, tariffs, road and checkpoint reports. [ran] every one of these screens on the SM-A5360 on 12 Nov, in Arabic, and the customer screens again in English, including a full parcel trip (PR #30).

### 2.3 Palestine-specific work that already exists

These are real strengths. Build on them; do not rebuild them.

- **Arabic first**, with complete English, a bilingual heading font (Readex Pro) and RTL checked on the phone. [source] `docs/DESIGN-AUDIT-2026-11-09.md`
- **A West Bank road graph.** OSRM is built from a Geofabrik extract clipped to the outer ring of OpenStreetMap relation 1803010, so no route leaves the West Bank. [source] `infra/osrm/build-west-bank.sh`
- **Checkpoint-aware routing.** Eleven pilot checkpoints are seeded at OpenStreetMap positions. A route within 200 m of a checkpoint reported closed counts as passing through it; the router asks for alternatives and then tries forced detours 1–8 km to each side. Slow checkpoints add delay to the ETA and the fare model. Drivers report status from the Roads screen. Two checkpoints (Al-Jalama, Beit Iba) have no mapped position yet. [source] `server/main.ts` near `pilotCheckpoints`, `docs/HANDOFF-2026-11-10-MAPS-FOR-ASTRA-6.md` §2
- **A local place index**: about 24,000 places from OpenStreetMap with Arabic or Latin names, Hebrew-only names dropped, generic names like "مسجد" dropped, with Nominatim as a wider fallback. [source] `scripts/build-places-index.mjs`, `server/data/places-ps.json.gz`
- **Map labels** prefer Arabic, then English, and hide Hebrew-only names. [source] `public/map.html`, `src/map-math.ts`
- **Landmark-first booking**: every pickup and drop-off has a free-text landmark for the driver. [source] `src/app/book.tsx`
- **Cash controls**, a handover code for custody, phone numbers that accept +970 and +972 [carried].

### 2.4 Open items you inherit

The execution ledger `docs/PLAN-2026-11-10-OPEN-ITEMS.md` has 48 rows. Most need something only the owner can supply (contracts, legal review, credentials). The rows that are engineering work and still open are: 6 (outside outage alert), 7 and 9 (restore drills), 11 (map on slow data), 12 (tile host is a single point of failure), 13 (car drifts off the road), 14 (ETA calibration), 15 and 16 (map label clutter and misleading map screenshots), 17 (TalkBack), 18 (field evidence on real roads and 3G), 23 (authorization matrix), 26 (parcel custody: blocked courier, cancellation after handover), 29 (API contracts), 30 (design tokens and responsiveness), 33 (concurrent booking races), 35–37 (PostgreSQL hosting, importer, cutover), 38 (update gate and distribution), 45 (request-level observability). Row 10 (missed Confirm) measured 0 misses in 40 taps on 12 Nov and is waiting for the owner to accept that evidence.

---

## 3. Is it a demo? An honest answer for the owner

The owner wrote that Wind "is still like a demo app" and "not focused for the Palestinian market". Both are partly right and partly not.

It is **not** a demo in its engineering. It has server-owned order states, idempotent commands, a cash ledger, audit trails, contract tests, a digest-pinned deploy, nightly backups and a long list of phone-tested fixes. It **is** designed for Palestine in many details (§2.3).

It **is** a pilot in what a user experiences. The table below compares it with what an Uber-grade app gives its users. The left column comes from the reconstructed Uber requirements in `docs/KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md`.

| Uber-grade capability | Wind today | Gap that a user feels |
|---|---|---|
| Verified identity (phone code, documents) | Phone and email are not verified at signup; drivers are approved by hand | A mistyped email can lose an account; strangers cannot be invited (ledger 19, 20) |
| Find the exact pickup point | Search, pin, saved places, landmark text | No way to paste the WhatsApp or Google Maps pin people already share; the recipient cannot set the drop-off point; the app never learns from past deliveries (§5 C) |
| Price before ordering, explained after | Flat ₪20 parcel price on any distance; ride and freight use a distance formula | Long parcel trips pay couriers badly; no breakdown of what the price includes (ledger 28) |
| Fast dispatch to the nearest driver | A jobs board; dispatch and driver presence exist but only on PostgreSQL and behind gates | A parcel waits until some driver looks at the board |
| A live map that is true | Live driver marker, road-following lines, closed-checkpoint avoidance | Raw GPS drifts through buildings; one free tile host can take the map down; no traffic; streets and Arabic names are thin in many towns (§5 B) |
| An ETA you can trust | `ceil(minutes × 1.3) + 2`, a range, never calibrated | Can be badly wrong when gates close (ledger 14) |
| Routes a Palestinian car may drive | Car profile on OpenStreetMap; knows nothing of permits | A route can use a road the driver cannot take (ledger 27) |
| Pay by card or wallet | Cash only | Needs a PMA-licensed provider (later scope) |
| Safety (SOS, share trip, trusted contacts) | Share-trip link and a safety report card | No emergency path staffed by a person (ledger 39) |
| Updates without reinstalling | None on Android | Every client fix needs every user to install a new APK by hand |
| Crash and error reporting | A first-party diagnostics queue and request IDs | No crash reporting from the field; problems surface only when users phone in |
| Outage known within minutes | An hourly GitHub check; notification never proven | The owner can be down for hours without knowing (ledger 6) |
| Accessibility | 48 dp targets, contrast fixed, screen-reader labels | TalkBack never used by a person (ledger 17) |

So the fair summary is: **a well-engineered pilot that a stranger would still experience as unfinished.** The gaps are concentrated in four places: data about Palestinian places and roads, honesty of ETA and position, verified identity and payment, and operations. §5 is ordered by that.

---

## 4. Rules for working in this repo, with the reason for each

These rules come from mistakes that already cost time here. Each one says what it covers, so you can tell where it stops.

1. **Branch from `origin/master`.** Local `master` is an unrelated old line of history. Check `git merge-base --is-ancestor origin/master HEAD` before your first edit. Worker sessions started with worktree isolation also start from that old line, so give workers the shared checkout and separate files instead.
2. **Tests and builds run on the test PC**, `DESKTOP-S2JKMK5`, over SSH as user `pc gaming` with key `~/.ssh/smartstore-runner` and `-o HostKeyAlias=desktop-s2jkmk5.local`. Use your own folder on `D:` and your own PostgreSQL port. Give a job the whole machine (8 threads, 8 GB), one job at a time. If the host does not answer, wait and re-probe; do not run heavy work on the owner's PC. Processes started over SSH die with the session, so start long jobs with `Invoke-CimMethod Win32_Process Create` and poll a log file. Memory note `wind-phone-sweep-1112` has a working APK build recipe (warm build root, JDK and SDK paths, two traps).
3. **UI acceptance is on the physical phone** `SM-A5360` (adb serial `R5CTB0FJP9Z`), never an emulator. If it is not attached, ask the owner to plug it in. Keep its test backend on `adb reverse`; a tunnel `ssh -L 4191:127.0.0.1:4191` to the sandbox on the test PC works. After any change to a sheet, a field, a map or navigation, run a two-role parcel trip on the phone with the keyboard open at the handover code.
4. **A merge is not a deploy, and a deploy does not reach Android.** After a deploy, check the running image digest and revision. A client change reaches users only in a new APK.
5. **A test must be able to fail.** After each fix, revert the fix, watch the new test fail, then restore it.
6. **Verify every worker's finding in the code**, and read every worker's diff line by line before it merges. Workers here have been wrong with confidence.
7. **Review by a different model.** The owner's standing rule: review with a Claude Haiku 5.5 subagent at `xhigh` with a fresh brief (the diff, the intent, a request for correctness, security and regression findings with file:line); if it is unavailable, retry once, then use another reviewer and say which. For money, auth, migrations, dispatch, deploy scripts and data deletion, use two reviewers from different vendors (Opus and Haiku count as one vendor).
8. **Expo changes every SDK.** Before touching an Expo or React Native API, read the docs for Expo 57 at `https://docs.expo.dev/versions/v57.0.0/`.
9. **AWS work:** load the matching local AWS skill first (`aws-*` skills; the `aws-mcp` server failed to connect on 13 Nov). Use Region `eu-north-1` only, except the global CloudFront dependencies that must live in `us-east-1`. No Lambda@Edge, StackSets or cross-Region replication. Preview every stack update as a change set and refuse one that replaces `Host` or `Edge`.
10. **Secrets** never go into the repo, a prompt to a worker, or a log.
11. **Before deleting or replacing anything, find out what it really is.** A file that looks like a duplicate may be the only copy.
12. **Repository:** `origin` is `osamaabujarad45-jpg/wind`; use `GH_TOKEN=$(gh auth token --user osamaabujarad45-jpg)`. Never push to `legacy-origin`.

### The gate ladder

Run the applicable rungs before a merge, and all of them before a release. Details are in the master plan §6.

| Rung | What | Where |
|---|---|---|
| G0 | `npm run typecheck`, `npm run lint` | test PC |
| G1 | `npm test` (131 suites at `b89f220`; it stops at the first failing suite, so a short run means suites did not run) | test PC |
| G2 | `npm run test:persistence` | CI |
| G3 | `test:scenarios`, `test:access`, `test:jobs-ui`, `test:location`, `test:readiness`, `test:tulkarm`, `test:android-browser` | test PC and phone |
| G4 | `npm run screens`, then commit `docs/screens/` | test PC |
| G5 | Two-role parcel trip on the phone | phone |
| G6 | Fresh install, sign up | phone |
| G7 | Independent review, findings fixed or answered | — |
| G8 | CI `verify`, `persistence`, `image` green on the merge commit | GitHub |

Source-text tests pin some code shapes (`tests/phone-ui.test.mjs`), and the public tracking view has an allowlist (`tests/share.test.mjs`) plus a recorded contract fixture (`docs/implementation/contracts/fixtures.json`). Update them deliberately when you change those surfaces.

---

## 5. Workstreams, in the order I recommend

Each workstream says why it matters, what is known, what is not, what to do, and what "done" means. Measure before you change anything whose problem is not yet measured. Where a step needs the owner, it says so; do the rest of the workstream meanwhile.

### A. Operations on AWS: know when it breaks, and never lose data

**Why first:** the pilot already went down for a billing failure on 10–12 Nov, and nobody was told for hours. Every later workstream depends on a host that stays up and a backup that restores.

**Known:** production on AWS since 12 Nov (§2.1). Nightly SQLite backup to S3 with versioning. A watchdog runs every minute on the host. The only outside check is an hourly GitHub workflow whose notification has never been proven. [source]

**Not known:** which image runs, which backup was restored, whether a restore on AWS has been drilled, whether the AWS account is on the Paid plan and what its spend limit is.

**Do:**
1. Record the AWS go-live in `docs/CURRENT-WORK.md`: running image digest and revision (read through Systems Manager), which backup was restored, and the data window lost, if any. Correct the master plan's Azure statements in a docs-only PR.
2. Write the owner a one-page choice, with monthly cost, for a minutes-level outside alert that reaches a person: for example a Route 53 health check with a CloudWatch alarm and an SNS email or SMS, or a CloudWatch Synthetics canary in `eu-north-1`. Note that Route 53 health-check alarms live in `us-east-1`. Build the chosen one after approval, then prove a notification arrives (ledger 6).
3. Add a restore drill on AWS: restore last night's S3 copy into a throwaway container, compare row counts and money totals, time it (ledger 7, 9).
4. Propose daily EBS snapshots (AWS Backup or Data Lifecycle Manager) as a second restore point, with cost.
5. Propose an owned domain (≈ USD 10–15 a year). It makes the API address stable across hosts and unblocks verified email through Amazon SES.
6. Propose APK hosting on S3 behind CloudFront over HTTPS, so the forced-upgrade gate can point at a stable URL (ledger 38).

**Done:** an alert that a person received in a test, a timed restore drill on AWS, CURRENT-WORK and the plan match production.

### B. The map, for Palestinian towns and slow data

**Why:** the map is the main screen for customers and drivers. Today it depends on one free tile host, and the OpenStreetMap data under it is thin in many Palestinian towns.

**Known [source]:** MapLibre 6.12 in a WebView, style and tiles from `tiles.openfreemap.org` with no second source. A map that fails shows Retry over a diagram; in pin mode the customer cannot place an order from the map at all. Cold load needs about 1.3 MB of MapLibre code before any tile. Booking has never been measured on 3G. The maps handoff `docs/HANDOFF-2026-11-10-MAPS-FOR-ASTRA-6.md` §4 has the detailed queue; read it.

**Not known:** time to first tile and to "ready" on 3G in Nablus, Ramallah and Jenin; how often the 20-second ready deadline fires; how complete street coverage and Arabic names are in the pilot towns.

**Do:**
1. **Measure on slow data** on the A53 with WebView DevTools (`adb forward` to `webview_devtools_remote_<pid>`), Slow 3G and 400 kbit/s, cold and warm. Then set a page-weight budget and a browser gate that fails when it grows (ledger 11).
2. **Remove the single tile host.** Write the owner the options with cost. A strong option for this app: build a vector-tile extract for Palestine and Israel (Protomaps PMTiles or OpenMapTiles), host it in S3 behind the existing CloudFront, and keep OpenFreeMap as the fallback style. The extract is small, CloudFront caching suits 3G, and you control the style, so you can drop the layers `restyle()` hides today and cut bytes. This needs a small reader for PMTiles in `map.html` (or a tile server on the host); weigh that dependency against the risk it removes (ledger 12).
3. **Audit OpenStreetMap coverage** for each pilot city: share of roads with a name, share with an Arabic name, places in the index per square kilometre, gaps a driver would hit. Report it with numbers. Fixing the data itself is a community question for the owner (contributing to OpenStreetMap, or keeping Wind-only corrections); propose, do not start it.
4. **Keep the car on the road**: within about 40 m of the route line, draw the marker on its projection on the line; further off, draw the raw fix, because that is a real wrong turn. Mirror the helper in `src/map-math.ts` and `public/map.html` (ledger 13).
5. Fix label clutter near pins and make map screenshots show one phone viewport with a stub route (ledger 15, 16).

**Done:** numbers for slow data with a budget enforced in a gate; a map that still draws when OpenFreeMap is down (after the owner's choice); a coverage report; the car stays on the road on the phone without hiding a real wrong turn.

### C. Addresses: meet people where they already share locations

**Why:** most Palestinian buildings have no street number, and people share pins on WhatsApp. Today Wind accepts search, a pin, a saved place or a landmark. It does not accept the location people already have in hand. This is the cheapest large gain in this file.

**Known [source]:** no code parses a pasted Google Maps link, a coordinate pair or a Plus Code (grep for `goo.gl`, `maps.app`, `plus code` finds only outgoing "open in maps" links). The recipient of a parcel cannot set the drop-off point; the tracking page is read-only. Completed deliveries do not teach the app anything about where a landmark really is.

**Do:**
1. **Paste a location.** In trip search, accept a pasted coordinate pair, a Google Maps URL that carries coordinates, a short `maps.app.goo.gl` link (resolve it on the server, with a host allowlist and a timeout, because it is a redirect to an outside site), and an Open Location Code (Plus Code), which needs no licence and works offline. Show the point on the pin sheet for confirmation; never book an unconfirmed parsed point.
2. **Let the recipient set the drop-off.** From the share link, a recipient without the app opens a page, sees the sender's drop-off, and can propose a corrected pin, which the sender or the driver accepts. Keep the tracking page's privacy allowlist: no phone, notes or codes to the public page.
3. **Learn delivery points.** When a driver completes a handover, record the fix where the code was entered, with its accuracy, against that order's landmark. Offer it to the same customer next time as a saved suggestion. Do not share one customer's points with others without the owner's decision on privacy.
4. Recent places should show the current language when the saved place is a city (seen on the phone on 12 Nov: a city saved in Arabic stays Arabic in English mode).

**Done:** each of the four on the phone in Arabic and English, with unit tests for the parsers (good input, bad input, a link to a host outside the allowlist), and the privacy allowlist test still green.

### D. Routes and ETAs that tell the truth about Palestinian roads

**Why:** a wrong route or ETA does more harm here than elsewhere, because a closed gate can add an hour.

**Known [source]:** OSRM car profile, no traffic, no map matching. Checkpoint state comes only from driver reports and admin edits. The ETA band is a fixed formula. The routes know nothing of roads closed to Palestinian cars; the pilot runbook tells couriers to confirm the road themselves. OCHA counts about 925–942 movement obstacles in the West Bank [carried].

**Not known:** which roads pilot drivers can and cannot use; how fresh checkpoint reports are in practice; how wrong ETAs are.

**Do:**
1. **Make checkpoint status honest about age.** Show when a report was made and by how many drivers; let reports expire after a time the owner sets; ask a driver passing a checkpoint to confirm its state with one tap. Keep reports as the only source unless the owner approves another (public road-status channels exist but their terms and reliability are unknown).
2. **A permitted-roads layer**, owner-gated. Once the owner supplies evidence of which roads drivers may use, encode the closed ones as a list of OpenStreetMap ways or polygons that an admin maintains, and either exclude them in a custom OSRM profile or reject routes that use them. Until then, keep the runbook warning and show it in the driver app on long routes (ledger 27).
3. **Calibrate ETA from real trips.** Record promised and actual minutes for every completed order. When there are enough trips, report the error by city pair with the sample size, and change the formula only if the data supports it. If there are too few trips, say so and leave the formula (ledger 14).
4. **Learn speeds from driver traces** when there is enough data: snap recorded fixes to the graph (OSRM `/match` on the host), compute median speed per road segment and time of day, and use it for ETA. This also shows which roads Palestinian drivers actually use, which is evidence for item 2. Driver traces are personal data; propose retention and access rules to the owner first.

**Done:** checkpoint reports show age and confirmations on the phone; an ETA error report with its sample size; the permitted-roads layer only after the owner's evidence.

### E. Tracking and the driver side

**Why:** customers judge the app by whether the driver dot moves and whether a driver comes.

**Known [source]:** the driver sends GPS every 3 s on a job through a foreground service. The pilot runbook already warns that Android kills the app. Dispatch and presence exist but run only on PostgreSQL behind gates, so production uses a jobs board. An Arrived tap seconds after accepting is not checked for distance, because the screen has no fix yet (found on the phone on 12 Nov).

**Do:**
1. On the phone, measure how long location sharing survives with the screen off, in a pocket, on mobile data, for 30 minutes. Add guidance in the driver app for Samsung battery settings if the service dies.
2. Show the customer when the driver's position is stale, and why (already partly done: verify on the phone).
3. Prepare dispatch for production in the PostgreSQL workstream (G): nearest-driver offers with expiry, reassignment of stalled jobs. Activation stays an owner decision.
4. Parcel custody gaps in ledger row 26: a blocked courier holding a parcel is not told; cancellation after handover.

**Done:** a measured survival time with the fix for any failure found; the custody gaps closed with tests.

### F. Product gaps a stranger would notice

Most of these need an owner decision or a provider; build everything that does not, and bring the rest as one batch of decisions (§7).

| Item | What to do | Needs the owner? |
|---|---|---|
| Verified phone | The server already knows the providers `ooredoo_communication` and `acs` (`server/domain/phone-provider.ts`). Check whether AWS End User Messaging can deliver SMS to +970 and +972 numbers, and compare cost | Contract and spend |
| Verified email | Amazon SES once there is a domain | Domain |
| Parcel price | Show a breakdown; propose a distance-aware parcel fare with the courier's take-home pay on long trips, using real trip costs | Pricing decision |
| Updates without reinstalling | Propose `expo-updates` with EAS Update or a self-hosted update server on S3 and CloudFront. It changes the release model and has security weight (signed updates) | Yes |
| Crash reporting | Extend the first-party diagnostics or propose a crash reporter; check privacy rules first | If it sends data to a third party |
| Safety | A person-staffed emergency path for rides before rides launch (ledger 39) | Staffing |
| Accessibility | A real TalkBack pass on the phone: sign-up, booking, tracking, driver job; record what a person hears (ledger 17) | No |
| Cold start | Measure cold start on the A53 and set a budget | No |

### G. Platform: PostgreSQL on AWS, and the server's shape

**Why:** dispatch, presence and the money ledger need PostgreSQL, and the owner decided the cutover happens before a public launch [source, master plan §2].

**Known:** the plan priced an Azure server; production is now on AWS, so re-price with Amazon RDS for PostgreSQL in `eu-north-1` (check that RDS offers PostgreSQL 18 with PostGIS there; the tests run 18.3 with PostGIS 3.6). The importer refuses to run outside tests on purpose (`server/migrate.ts`). Today's rollback restarts the old container, which is unsafe once PostgreSQL is authoritative. The master plan Phase 3 has the full runbook; follow it.

**Do:** re-price and write the owner a cost sheet; then the staging, importer, rehearsal and cutover steps of Phase 3, each two-vendor reviewed. In parallel, move one route family at a time out of `server/main.ts` into `server/domain/` when a batch already touches it, proven by the contract tests; build the authorization matrix test (ledger 23).

**Done:** the Phase 3 exit in the master plan.

### I. Every map source for Palestine, and what Wind may do with each

**Why:** the owner asked for every piece of map knowledge about this area. No single provider maps the West Bank well for Palestinian drivers. Google and Waze have good coverage of main roads, but they route onto roads closed to Palestinian cars and they hide or omit many Palestinian villages. OpenStreetMap is open and is what Wind uses, but it has gaps in towns. Palestinian sources know the checkpoints and the local names, but most have no public API. So the right shape is **Wind's own Palestine layer**: OpenStreetMap as the base, enriched from every source whose licence allows it, and maintained by Wind's drivers. Google and Waze then serve only where their terms allow: opening navigation, and the existing optional Google renderer.

**Rules that apply to every source below.** Read the licence before you copy any data. Never copy or scrape Google or Waze map data into Wind's map or database; their terms forbid it. Keep the source and licence of every imported record, and show the attributions the licences require (OpenStreetMap needs "© OpenStreetMap contributors"). Several sources are run by political organisations from both sides; label imported data neutrally ("road closed to Palestinian vehicles", "checkpoint") and let the owner decide which sources Wind may cite. A source is evidence to check against driver reports, not truth.

#### International and commercial

| Source | What it offers here | What Wind may do | Status |
|---|---|---|---|
| **Waze** (Israeli origin, owned by Google) | Strong live traffic and road coverage in Israel and on main West Bank roads. By default it avoids areas it marks as dangerous for Israelis, which blocks routes into Palestinian towns until the user turns that setting off. Palestinian drivers report that it sends them onto roads they may not use. | **Deep links only:** `https://waze.com/ul?ll=<lat>,<lng>&navigate=yes` opens navigation in the driver's own Waze app, free and allowed. Add "Open in Waze" beside the existing "Open in Maps" button, with a one-line warning about restricted roads. **Do not** embed the Waze Live Map: the consumer terms forbid commercial framing without written permission, and the embed may not be combined with a non-Waze map. **Waze for Cities** shares jams and alerts as a feed, but only with accepted partners (mostly governments and agencies) under extra terms; ask the owner before applying | [Waze deep links](https://developers.google.com/waze/api), [Waze iFrame rules](https://developers.google.com/waze/iframe), [Waze terms](https://support.google.com/waze/answer/12373727), [data feed](https://support.google.com/waze/partners/answer/13458165), [7amleh route-planning analysis](https://7amleh.org/ms/pln.html) |
| **Google Maps Platform** | Good main roads and shops in cities; in 2024 reporting, drivers were sent past checkpoints and onto settler roads, and Google said it does not distinguish Israeli and Palestinian roads. Many Palestinian villages show as grey areas until zoomed in | Already in Wind behind a build key and a user opt-in (`src/google-map.*.tsx`); the repo already refuses to draw Google content on a non-Google map. Possible use: Google Places search inside cities, if a measurement shows it beats Wind's index. **Measure first** with the same method as the 31 Oct provider comparison (Nominatim found 18 of 19 West Bank places within 1.5 km, Azure Maps 8, Amazon Location 4 [carried]; its 19-place list is not in the repo, so rebuild a larger list of real pilot addresses first. `tasks/maps-corpus.json` is a synthetic routing corpus, not that list) and report hits, distance error and monthly cost; results may be cached only as the terms allow (place IDs freely, most other fields briefly) | [Maps Service Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms), [Wired investigation via The Star](https://www.thestar.com.my/news/world/2024/12/24/google-maps-fails-users-in-west-bank-investigation), [7amleh on missing villages](https://7amleh.org/ms/pal.html) |
| **Amazon Location, Azure Maps** | Tested 31 Oct: 4 and 8 of 19 West Bank places | Do not switch | [carried] `wind-maps-provider-and-osrm` memory |
| **OpenStreetMap** (Wind's base today) | Open data (ODbL), Arabic names where mapped; known problems in the West Bank: missing roads in towns, wrong tags, reversed Arabic names. Active efforts: WikiProject Palestine, YouthMappers at Palestine Ahliya University, Rebuilding Alliance mapathons with villagers | Keep as the base. Measure gaps per pilot city (§5 B3). Fixing data upstream is the most durable gain for everyone, but it is a community and political choice for the owner | [OSM West Bank wiki](https://wiki.openstreetmap.org/wiki/West_Bank), [WikiProject Palestine](https://wiki.openstreetmap.org/WikiProject_Palestine), [YouthMappers PAU](https://wiki.openstreetmap.org/wiki/YouthMappers_at_Palestine_Ahliya_University), [Rebuilding Alliance](https://www.rebuildingalliance.org/maps) |

#### Palestinian and Arab

| Source | What it offers | What Wind may do | Status |
|---|---|---|---|
| **Doroob Navigator** (Doroob Technologies, Ramallah) | A Palestinian driving app since 2019: user reports plus staff input on checkpoints and closures, and routes around settlement roads. 22,000 users two months after launch; its CEO spoke of adding deliveries | No public API found; current status unknown. The best-matched partner for checkpoint and restricted-road data, or a competitor. A business conversation for the owner | [Times of Israel 2019](https://www.timesofisrael.com/app-aims-to-help-palestinian-drivers-find-their-way-around-checkpoints/), [CBC](https://amp.cbc.ca/lite/story/1.5236687) |
| **GeoMOLG** (Ministry of Local Government geoportal, geomolg.ps) | The official Palestinian GIS, including the national geographic names that the names committee publishes there | No documented public API found. If MOLG licenses the names layer, it fixes the main weakness of OpenStreetMap labels and the place index. The owner or Fable drafts a request to MOLG | [UN-GGIM country report](https://ggim.un.org/country-reports/documents/Country_Report_Secretariat_UNGGIM_State_of_Palestine.pdf), [UNGEGN report](https://unstats.un.org/unsd/ungegn/sessions/2019-new-york-ungegn-1st-session/documents/GEGN.2_2019_CRP.100_Report_Geographic%20Names_New_York_2019_02.pdf) |
| **Palestine Open Data Portal** | A CKAN catalogue with an API at `https://www.opendata.ps/api/3` | Check what geographic layers it holds and their licences | [dataportals.org](https://dataportals.org/portal/open_data_ps) |
| **Postal codes** (Ministry of Telecommunications and Digital Economy) | Published for all 11 West Bank and 5 Gaza governorates | A field on saved places and receipts; actual use was not measured | [MTDE](https://www.mtde.gov.ps/home/PostalCodes) [carried] |
| **PCBS** | Census and locality data | Locality list and population for city coverage decisions | [carried] |
| **Facebook and Telegram road groups** | Where many drivers read checkpoint status today | Do not scrape. Learn which signals drivers trust, to shape Wind's own reports | [Times of Israel 2019](https://www.timesofisrael.com/app-aims-to-help-palestinian-drivers-find-their-way-around-checkpoints/) |

#### UN, humanitarian and Israeli

| Source | What it offers | What Wind may do | Status |
|---|---|---|---|
| **OCHA oPt movement and access** | 925 movement obstacles in December 2025 by type (checkpoints, partial checkpoints, road gates, earthmounds, roadblocks, linear closures), with an interactive map of every obstacle | The best source to seed and check Wind's checkpoint list (today 11 hand-entered). A downloadable dataset was not confirmed; check HDX and ask OCHA, and record the licence | [OCHA April 2026](https://www.ochaopt.org/content/movement-and-access-west-bank-april-2026), [fact sheet](https://www.ochaopt.org/sites/default/files/Factsheet_Movement_and_Access_April_2026_1.pdf) |
| **HDX "State of Palestine – Roads"** | West Bank roads from the JRC updated by OCHA, Gaza roads from the PA; shapefile, last changed November 2021 | Compare with OpenStreetMap for missing roads; probably older than OSM | [HDX](https://data.humdata.org/dataset/state-of-palestine-roads) |
| **ECF** (Economic Cooperation Foundation, Israeli NGO) | Web maps of "roads used exclusively by settlers in the West Bank", "roads used by Israelis in the West Bank" and crossings and checkpoints | The closest public evidence for the permitted-roads layer in §5 D2. Licence and date unknown; ask before using, and confirm each road with drivers | [ECF maps](https://ecf.org.il/maps/topics/22) |
| **Israeli government open data** (data.gov.il, GovMap) | Government datasets; GovMap's API needs registration | West Bank coverage and licence unclear; low priority | [Bellingcat on GovMap](https://bellingcat.gitbook.io/toolkit/more/all-tools/govmap) |

**Do:**
1. Add "Open in Waze" for drivers (deep link, no key, no cost) with the restricted-roads warning. Test on the phone with Waze installed and not installed.
2. Run the Google Places measurement on the corpus and give the owner a numbers-and-cost note. Do not enable paid calls without approval.
3. For each source above whose data Wind would import (OCHA obstacles, HDX roads, GeoMOLG names, ECF roads, Doroob), write a one-line licence finding and a draft request where a request is needed. Bring them to the owner as one batch.
4. Design the Palestine layer so each record keeps its source, licence, date and confirmation count, and so driver reports can confirm or retire it. Imported checkpoints and restricted roads feed §5 D1 and D2.

**Done:** the Waze button on the phone; the Google measurement note; a licence table with owner decisions; the layer's data model reviewed.

### H. Optional: AI inside the product

Only if the owner asks. Two uses fit this market: turning a driver's free-text or voice road report in Palestinian Arabic into a structured checkpoint state, and sorting support messages by urgency. A small model (Claude Haiku 5.5) suits both on cost. Both send user text to an outside provider, so they need the owner's decision on privacy and spend.

---

## 6. How to use Claude Fable 5.2 well on this work

This section applies Anthropic's guidance for prompting Claude Fable 5.2 (sources in §9) to this repo.

- **Effort.** Run at `high`, the default and where most of the gain is. Use `xhigh` only for the hardest long runs where you see a gain (the PostgreSQL importer, the routing layer). Use `medium` or `low` for quick work and for workers. A line telling the model to think less does not work at `medium` and above; change the effort level instead.
- **Finish the whole task.** The kickoff prompt includes Anthropic's "Finishing work" text. Ordinary obstacles (a timeout, a busy test PC, a failed build) are things to diagnose and work through. Deliberate blockers (the §7 decisions, the phone not attached) are things to report and work around.
- **Ownership.** The owner wants the structure improved, so the kickoff gives you ownership. Anthropic's testing found that this sentence also raises output tokens and unrequested changes, and that closing summaries can omit small changes. So review the full diff of every PR, not only your summary, and keep each PR to one purpose.
- **Approvals are named.** The kickoff lists what is approved and what needs the owner. Do not treat a general caution in an old document as a new rule; the rules in §4 carry their reasons, so you can see where each one stops.
- **Delegation costs money.** Subagents can be a large part of a session's cost. Delegate reading-heavy, independent work (an OpenStreetMap coverage audit per city, an inventory of screens, a first-pass review); keep money, auth, migration and dispatch code in your own hands. Brief a worker with the goal and why, the base commit, the files it owns, the acceptance checks, and what to return. Use a cheaper model for workers unless the task needs judgment.
- **Progress.** Say in a line what you will do before you start, give brief updates, and close with a recap that stands alone.
- **Ground every claim.** Before reporting progress, check each claim against a tool result from this session. Say "test PC", "phone", "CI" or "production" for every result, and say what you did not verify.
- **Memory.** Lessons that are not in the repo go in the memory directory with one fact per file; update an existing note rather than add a duplicate, and delete notes that turn out to be wrong. Remove old cautions whose reason no longer holds, so they do not pile up.
- **History.** Do not edit earlier turns of a running conversation; Claude Fable 5.2 checks the history and refuses a changed prefix. Put new instructions in the newest turn.

---

## 7. Decisions only the owner can make

Bring these as one batch, each with your recommendation and its cost. Until each is answered, use the default in the right column and keep working on the rest.

| Decision | Blocks | Default until answered |
|---|---|---|
| Minutes-level outage alert: which service, and where it notifies | A2 | Hourly GitHub check |
| EBS snapshots, owned domain, APK hosting on S3 | A4–A6, verified email, stable updates | Do not create |
| AWS Paid plan and spend limit (exceeding the limit pauses the project, which is an outage) | Production stability | Owner checks AWS Settings → Billing |
| Self-hosted map tiles | B2 | OpenFreeMap with monitoring |
| Contributing map fixes to OpenStreetMap, or keeping Wind-only corrections | B3 | Report only |
| Sharing learned delivery points between customers | C3 | Per customer only |
| Evidence of roads drivers may use | D2 | Runbook warning |
| Expiry time for checkpoint reports | D1 | Show age only |
| Retention of driver GPS traces | D4 | Do not mine traces |
| SMS provider and contract; sending domain | F | Invite known people only |
| Parcel pricing beyond flat ₪20 | F | Do not change |
| Over-the-air updates | F | APK only |
| RDS spend, migration and cutover window | G | Do not cut over |
| Switching on dispatch, rides, freight | E3, Phase 5 | Off |
| AI features inside the product | H | None |
| Which outside map sources Wind may import or cite (OCHA, HDX, GeoMOLG, ECF, Doroob), and requests or partnerships with their owners | I3, D1, D2 | Build from OpenStreetMap and driver reports only |
| Paid Google Places calls | I2 | Measurement only, within free credit |
| Applying to Waze for Cities | I | Do not apply |
| Legal review before strangers | Public launch | Pilot among known people |

---

## 8. Reporting

For each batch, report **issue → what you changed → how you verified it**, with the command, its exit code and where it ran, and the source commit. State gates that did not run. Put bad news first. If reports become dense, the owner can add this text from Anthropic's guide to the kickoff:

```text
# Communicating clearly
Write for an intelligent but low-context reader. The person reading has not seen your tool calls,
your reasoning or the files you opened, and may be switching in from other work. Messages should
generally be self-contained: the reader should understand what you mean without having to dig for
other context. Put the key points in the first few sentences. Practice progressive disclosure in
your sentence order, and do not use undefined references and ideas in line 1 that won't make sense
until the reader reaches line 12.

Use plain words, and write in clear, understandable full sentences. Do not use a term or
abbreviation that you made up during the work. Say what the thing is in a way any reader would
understand. Write mostly in the style of ASD-STE100 Simplified Technical English: short sentences,
one idea per sentence, active voice, and consistently using the same word for the same thing. Use a
paragraph of flowing prose where ideas connect, and keep bullets for lists of separate items. Leave
out unnecessary details unless the reader asks and practice concision, but do ensure that your
messages have the key context. Aim to make your user-facing text as human-readable and clear as
possible.
```

Record each batch in `docs/CURRENT-WORK.md` and update the ledger rows it touches.

---

## 9. Sources read for this handoff

Anthropic documentation:
- "Prompting Claude Fable 5.2", `https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-2` (read 13 Nov 2026): effort, finishing work, approvals, code ownership, progress updates, subagents, caution that piles up, prompts written for earlier models, reports, refusals.
- The Claude API skill's migration guide, sections "Migrating to Claude Fable 5.2" and "Migrating to Claude Fable 5.1" (behavioral shifts, long-running agent recommendations).

Repository, at `b89f220`:
- `docs/PLAN-2026-11-10-ASTRA-6-FINISH-WIND.md`, `docs/PLAN-2026-11-10-OPEN-ITEMS.md`, `docs/CURRENT-WORK.md`
- `docs/HANDOFF-2026-11-10-MAPS-FOR-ASTRA-6.md`, `docs/HANDOFF-2026-11-05-NEXT-LEAD.md` (market evidence sections)
- `docs/PRODUCT.md`, `docs/PILOT.md`, `docs/DESIGN-AUDIT-2026-11-09.md`, `docs/KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md`
- `docs/operations/aws-migration-study.md`, `docs/operations/deploy.md`
- `infra/osrm/build-west-bank.sh`, `scripts/build-places-index.mjs`, `server/main.ts` (checkpoint seed), `src/model.ts` (cities), `package.json`, `app.json`
- The 12 Nov phone sweep of every screen (PR #30) and its findings.

Outside sources on maps for Palestine (searched 13 Nov 2026; each is linked where it is used in §5 I). Most press coverage of Doroob Navigator and Waze behaviour dates from 2016–2019, and the 2024 Google reporting is a single investigation; re-check before quoting any of it as current.
