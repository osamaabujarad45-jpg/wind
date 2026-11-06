# Wind / ويند

Arabic-first delivery app for West Bank cities. Parcel delivery is enabled by default; licensed passenger rides and large loads need explicit operational opt-in. Couriers can carry multiple parcels; rides and freight remain exclusive jobs. The Souqna integration and any co-branding need a written agreement with Souqna first.

One Expo app serves three roles, chosen by the account that signs in:

- **Customer:** book, see the price before confirming, track the driver live, hand over with a 4-digit code, rate, Wind Plus plan.
- **Driver:** register with a motorcycle, bicycle, car, van or truck, wait for approval, accept matching jobs, see the latest completed trip and earnings, Wind Pro plan.
- **Admin:** revenue dashboard, all orders, approve/block users, reset passwords, reopen delivery-code attempts after recipient verification, activate plans, edit tariffs and commissions.

The API is `server/main.ts`: Node 24 with `node:http` and `node:sqlite`. Its only npm dependency is `pg`, for the gated PostgreSQL path.

## Current workspace verification — 29 October 2026

The workspace targets Android 1.0.13 / code 17 and Expo SDK 57; the signed preview
(code 16) is installed on the connected A53 and was tested there, including native
background tracking against this branch's API. On 29 October the candidate API
image and corrected web bundle were deployed to
`https://windapi236.swedencentral.cloudapp.azure.com`; the Android and web apps
now share that origin and `check:deployment` passes. The release is still not
public; see the [29 October readiness report](reports/release-readiness-2026-10-29.md).
Email codes (Cloudflare Email Service) need a sending domain first. The live-tracking
pass of 22 October (plausible GPS yardstick, driver identity in the live push,
follow-camera on every platform, background polling pauses) is recorded in
[the QA report](docs/QA-2026-10-21.md) and the
[readiness workflow](docs/QA-WORKFLOW-2026-10-21.md).

## Release reference — 4 October 2026 (historical)

- **API at that release:** `https://wind-production-72aa.up.railway.app` (legacy)
- **Android:** package `ps.wind.app`, version 1.0.4 / code 5.
- **iPhone access:** [Wind web app](https://wind-production-72aa.up.railway.app) is installable from Safari's Share menu → **Add to Home Screen**. It uses the same account, API and foreground GPS flow; [iOS distribution notes](docs/IOS-ACCESS.md) cover the future native TestFlight release.
- **Accounts:** `WIND_IDENTITY_MODE=self-service` accepts name, email,
  Palestinian mobile number and password. Customers are signed in immediately;
  driver applicants select a vehicle and wait for administrator approval. Admin
  accounts cannot be self-created. Contact values are unverified until a real
  verification provider is added.
- **Administration:** an administrator can search, approve, block, edit or delete
  customer and driver accounts. Identity, role and status changes revoke sessions.
- **Driver GPS:** a driver enables foreground location before accepting a job. Wind
  starts a high-accuracy point immediately after acceptance and labels sharing only
  after the API receives it; collection stops when the active job or foreground app ends.
- **Vehicle matching:** motorcycles can take parcels and licensed rides; bicycles are
  parcel-only. The database upgrade preserves existing user, session, order and GPS data.
- **Connection to Souq:** the two apps keep separate users, sessions and payments.
  Their delivery bridge is private server-to-server traffic.

The final device, API, signed-artifact and backup checks are recorded in
`../Deployment-2026-10-03/`.

## Run locally

```bash
npm install
npm run server                      # API on :4000, database in ./wind.db
npm start                           # Expo; open in Expo Go, or press w for web
npm run promote -- 0599123456       # after registering that number in the app, make it an admin
```

The app finds the API on the Metro host at port 4000, so a phone on the same Wi-Fi works without configuration.

## Checks

```bash
npm run typecheck
npm run lint
npm test                            # model + full API flow against a temp database
npm run test:scenarios               # build web, then real browser role journeys + map checks
npm run test:location                # customer GPS edge cases; reuses that web export
npm run test:tulkarm                 # whole customer and driver trip in Tulkarm; needs OSRM_URL and --web/--port of an export
npm run test:readiness               # tariff, promos, places, roads, offers, safety, disputes, accounts
npm run test:load                    # bounded local load test: throughput, throttles, live push, writer lock
npx expo-doctor
```

Browser checks require Playwright Chromium (`npx playwright install chromium`).
They use throwaway databases and localhost:4188; run them sequentially. Map tiles
load from OpenFreeMap. The role suite controls GPS and OSRM responses for repeatable
failure/retry checks. Results and screenshots are under `.expo/scenarios/`.

For an attached, unlocked Android phone with Chrome and USB debugging enabled,
after `test:scenarios`:

```bash
adb reverse tcp:4188 tcp:4188
adb forward tcp:9228 localabstract:chrome_devtools_remote
npm run test:android-browser
adb reverse --remove tcp:4188
adb forward --remove tcp:9228
```

This opens and closes its own local test tab. It validates physical Chrome and the
Android map HTML, not a rebuilt native APK or locked-screen background location.

## Screens

```bash
npx playwright install chromium     # once per machine
npm run screens                     # every screen, Arabic + English, into docs/screens/
```

`docs/screens/README.md` maps each screenshot to its route and source file, and `docs/screens/index.html` shows them side by side. In Claude Code, `/screens` re-shoots and reviews them. The script builds the web app and seeds a temporary API, so your `wind.db` is untouched.

The logo is drawn by `scripts/make_icon.py` (icons, splash, favicon) and by `<Logo />` in `src/ui.tsx` from the same geometry; the animated intro is `src/intro.tsx`.

## Deploy

The [29 October release readiness report](reports/release-readiness-2026-10-29.md)
records the current Azure endpoint, verified checks and remaining public-launch
gates. The historical Railway release reference above is a legacy deployment; the
live web app no longer calls it.

### 1. API

Any Docker host with a persistent volume and HTTPS in front (Fly.io, Railway, a VPS with Caddy).

```bash
docker build --build-arg EXPO_PUBLIC_API_URL=https://<public-api-origin> -t wind-api .
docker run -d -p 127.0.0.1:4000:4000 -v wind-data:/data \
  -e WIND_IDENTITY_MODE=self-service -e SUPPORT_CONTACT="<actual support contact>" wind-api
```

The API origin is a required build argument: it is embedded in the web bundle.
Build on a machine with sufficient memory rather than on the active API host.
After deployment, `npm run check:deployment -- --origin https://<api>` checks
health, authentication options, access controls, the map file and the bundle's
API origin. Provider delivery and real user journeys need separate checks.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Listen port |
| `HOST` | production `127.0.0.1`; Docker `0.0.0.0` | Bind address; Docker must stay on a private network or a loopback-only published port |
| `DB_PATH` | `/data/wind.db` | SQLite file; keep `/data` on a persistent volume |
| `TZ` | `Asia/Hebron` | Calendar day for earnings and the dashboard |
| `WIND_ENABLED_SERVICES` | `parcel` | Comma-separated services; opt into `ride` or `freight` after operational readiness is verified |
| `SUPPORT_CONTACT` | empty | Real reachable contact on the privacy and deletion-request pages |
| `OSRM_URL` | unset | Self-hosted OSRM (`infra/osrm/`, Geofabrik israel-and-palestine). Unset: no road lines, straight-line estimates. Production: `http://wind-osrm:5000` on the VM's Docker network |
| `GEOCODER_URL` | `https://nominatim.openstreetmap.org` | OpenStreetMap place search behind `GET /api/places/search` (tap-to-search, cached, 1 req/s). Point at a self-hosted Nominatim when traffic grows |
| `SOUQ_PARTNER_KEY` | disabled | 32+ character server-only key shared with سوقنا as `WIND_PARTNER_KEY` |
| `WIND_IDENTITY_MODE` | required in production | Current launch: `self-service`; use `operator-verified` only to close public registration deliberately |
| `WIND_CONTACT_VERIFICATION_REQUIRED` | `false` | Future verification gate. Leave false until a real proof or approval process can admit new users. |
| `WIND_TRUST_PROXY` | required in production | `1` behind a reverse proxy, so per-address limits key on the rightmost `X-Forwarded-For` hop instead of holding every user in the proxy's bucket; `0` when directly exposed. `X-Real-IP` is ignored |
| `WIND_PUSH_SUBJECT` | required in production | Operator contact for Web Push, a `mailto:` address or `https:` origin you control. Without it every push fails silently |
| `WIND_EXPO_PUSH_ENABLED` | unset | `1` sends native push through Expo. Needs the Firebase and EAS setup in `docs/operations/deploy.md` first |
| `EXPO_ACCESS_TOKEN` | unset | Only if the Expo project has enhanced push security on |
| `WIND_EMAIL_FROM` | unset | Sender on a domain onboarded in Cloudflare → Email Service → Email Sending, e.g. `no-reply@your-domain`. With the two below it turns on email codes: verify the address, self-service password reset, and the admin caller identity check |
| `CLOUDFLARE_ACCOUNT_ID` | unset | Cloudflare account that owns that domain |
| `CLOUDFLARE_EMAIL_TOKEN` | unset | Server-only API token with **Email Sending: Edit**; never in mobile build variables |

For an approved operator, `WIND_ENABLED_SERVICES=parcel,ride,freight` exposes all three services. New bookings use `shared:false`; pooling is disabled and a ride or freight load is exclusive, while a courier may carry several parcels. Existing assigned trips can finish if their service is later disabled.

Production refuses a relative/missing database path, missing support contact, or missing identity gate. The image runs as uid/gid 1000 (`node`); named volumes inherit `/data` ownership. A pre-existing bind mount must be writable by uid/gid 1000. Keep the API behind HTTPS, with no publicly reachable plaintext port. SQLite requires local storage on one host; do not share its WAL directory across hosts or run several writers.

The current production setting is `WIND_IDENTITY_MODE=self-service`: name, email,
Palestinian mobile and password create a customer session immediately. A driver
selects a vehicle but stays pending until an administrator approves the account.
Contact values are not SMS-verified. `WIND_CONTACT_VERIFICATION_REQUIRED=true`
is reserved for a future provider-backed or operator-approved verification flow;
do not enable it while new self-service users have no way to pass it.

Administrators are never self-created. Create the first real administrator from
the server shell, passing a unique password of at least 12 characters on stdin
(not in command arguments or logs):

```bash
docker exec -i <container> node server/main.ts enroll <verified-phone> admin "<operator name>" --phone-verified
```

The command reads stdin until EOF. Use a private password file or secure pipe and
destroy that temporary input afterwards. Use `customer` or `driver` for
operator-created accounts; an optional `car`, `van` or `truck` argument follows
`--phone-verified` for drivers (default `car`): `motorcycle`, `bicycle`, `car`, `van`
or `truck`. Drivers remain pending until an
administrator approves them. An existing pre-production account must be verified
with `node server/main.ts verify-phone <phone> --phone-verified` before its old
sessions or login work in production. `promote` also refuses an unverified
production account. No demo users are created by startup.

`/api/health` checks process liveness; `/api/ready` checks readable schema, writable database/directory and a bounded SQLite writer reservation. Startup uses WAL, foreign keys, full synchronous commits, a quarter-second busy wait (a contended write answers with a retryable 503 instead of blocking every other request), atomic schema initialization. SQL write contention returns retryable 503. SIGTERM/SIGINT stop admission, drain requests for up to ten seconds, then close connections and the database. Use a stop grace period longer than ten seconds.

Order advances require `requestId` (UUID) and `expectedStatus`; retries preserve the original code and request identity. A replay acknowledges the action with current server state; a new stale command is rejected. Wrong-proof retries under one identity count once. The current database schema is `user_version=3`. Upgrade clients before routing real users to this API.

Back up on a schedule with a consistent snapshot, then copy the file off the host. Never copy only `wind.db` while a live WAL may contain acknowledged commits:

```bash
docker exec <container> node -e "new (require('node:sqlite').DatabaseSync)('/data/wind.db').exec(\"VACUUM INTO '/data/backup-$(date +%F).db'\")"
```

For the existing Azure VM, PowerShell 7 on the authorized Windows workstation
can run `./scripts/backup-azure.ps1` and `./scripts/backup-azure.ps1 -VerifyLatest`.
It encrypts the snapshot with the current Windows account's DPAPI keys and tests
an isolated restore. `./scripts/install-azure-backup-task.ps1` installs a
four-hour task for that interactive account. It runs only while the workstation
is online and the account is logged in; it does not provide independent key
recovery, retention management or failure alerts.

The privacy policy is served at `https://<api>/privacy`; have it reviewed before launch. The public, login-free deletion request page is `https://<api>/account-deletion`. Set `SUPPORT_CONTACT` to a real monitored channel before launch. In-app deletion requires the current password or a fresh Microsoft sign-in. Release the updated app before enabling this API change: older apps cannot provide the proof and must use support instead. For Microsoft sign-in, configure the `auth_time` optional ID-token claim in the Entra app registration and verify the flow with the real tenant before rollout; missing or stale claims are rejected.

For an external deletion request, support records the request and privately verifies ownership of the registered number; never ask for a password or delivery code. An authorized operator can then run `node server/main.ts delete-account <verified-phone> --phone-verified` from the server shell. This reuses the in-app deletion transaction and refuses accounts with active orders or administrator accounts. Resolve the active delivery safely, retry, and confirm completion to the requester. Record fulfillment without copying passwords or order contact details into support logs. Administrator deletion needs a controlled role-transfer procedure; that exception is not automated by this command. Define and publish the required retention periods for retained accounting records and backups before public launch; restored backups must reapply later completed deletion requests before serving users. There is no public unauthenticated deletion API.
Restore into a separate offline database, run `PRAGMA integrity_check` and `PRAGMA foreign_key_check`, verify order/command/session counts, and test sign-in plus a synthetic order before replacing a stopped service's file. Backups contain personal data and password hashes: restrict access, encrypt off-host copies and apply the agreed retention policy.

### سوقنا delivery bridge

Set the same random 32+ character key as `SOUQ_PARTNER_KEY` on Wind and `WIND_PARTNER_KEY` on سوقنا; set `WIND_API_URL` on سوقنا to this API's HTTPS origin. Never put the key in `EXPO_PUBLIC_*` or `VITE_*` variables. سوقنا calls `/api/partner/config`, `/quotes`, `/orders`, and `/orders/:id` from its server. Quotes use Wind's current tariff; booking checks the quoted price and an external idempotency reference. Wind owns driver assignment, status, tracking, and the handover code. The two apps keep separate user accounts and payments; the bridge currently charges delivery in cash and does not transfer item sale proceeds. Run the سوقنا database migration before enabling the bridge.

### 2. Mobile apps (EAS)

```bash
npx eas-cli@latest login
npx eas-cli@latest init                                   # links the project, writes projectId
npx eas-cli@latest env:create --name EXPO_PUBLIC_API_URL --value https://<api> --environment preview --environment production --visibility plaintext
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPPORT_WHATSAPP --value 970599000000 --environment preview --environment production --visibility plaintext
npx eas-cli@latest build --profile preview --platform all      # internal install links
npx eas-cli@latest build --profile production --platform all   # store builds, build numbers auto-increment
npx eas-cli@latest submit --platform all
```

- `EXPO_PUBLIC_API_URL` is required and must be `https`; the EAS build fails fast otherwise.
- `EXPO_PUBLIC_SUPPORT_WHATSAPP` (international digits) shows "Contact support" in the app. Optional.
- Map-first native screens load `public/map.html` through `<EXPO_PUBLIC_API_URL>/map/v1/map.html` in a WebView. Deploy and probe that endpoint before releasing the new app; installed clients still use `/map.html`. The v1 shell can remain cached for 24 hours: breaking bridge changes need a new version and continued support for v1. Map tiles are not available offline.

### 3. Web / iPhone access

```bash
EXPO_PUBLIC_API_URL=https://<api> npx expo export --platform web
npx eas-cli@latest deploy
```

The Railway image also exports and serves this single-page web build at the API's HTTPS origin. On iPhone, open that URL in Safari and choose **Share → Add to Home Screen**. It is the free, installable access path until an Apple Developer Program membership is available for TestFlight/App Store distribution.

### Store submission notes

- Privacy policy URL: `https://<api>/privacy`. Account deletion is in the app (Account → Delete account) and on the web build. External deletion-request URL: `https://<api>/account-deletion`.
- Give reviewers a customer account and an approved driver account in the review notes.
- A public listing for a ride or courier service needs the licensing described in `docs/SYSTEM.md` §7. Until then, ship to TestFlight and Play internal/closed testing.

## Known limits

Registration does not prove phone or email ownership yet; public SMS signup is
unavailable. Web Push is implemented; native push still needs EAS/FCM setup and
integration. Browser GPS runs in the foreground. Native background location is
implemented, but the latest workspace changes still need a rebuilt-device test
with the screen locked. Payment is cash, and the API is a single instance.
A parcel that cannot be delivered goes `on_hold` with the driver's reason; an
administrator records a reattempt or return decision, and a return closes only with
the sender's return code. Customers can open one dispute per finished order within
seven days; resolution is a recorded decision with no automatic refund. Pickup
evidence remains an operational launch gap. Drivers' cash debt to Wind (commission on
finished jobs) is an append-only ledger: the cashier records numbered handovers that count
only after the driver confirms them, plus reasoned adjustments. The scenario suite
tests these handovers; collecting and paying out the goods price to senders is not
implemented. Historical requirements are in [docs/SYSTEM.md §9](docs/SYSTEM.md);
the [current QA report](docs/QA-2026-10-21.md) separates tested behavior from remaining work.

## Product documents

- [Product requirements and market study](docs/PRODUCT.md)
- [System requirements, service logic, and delivery plan](docs/SYSTEM.md)
