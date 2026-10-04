# Wind / ويند

Arabic-first delivery app for West Bank cities. Parcel delivery is enabled by default; licensed passenger rides and large loads need explicit operational opt-in. Each driver handles one active job. The Souqna integration and any co-branding need a written agreement with Souqna first.

One Expo app serves three roles, chosen by the account that signs in:

- **Customer:** book, see the price before confirming, track the driver live, hand over with a 4-digit code, rate, Wind Plus plan.
- **Driver:** register with a motorcycle, bicycle, car, van or truck, wait for approval, accept matching jobs, see the latest completed trip and earnings, Wind Pro plan.
- **Admin:** revenue dashboard, all orders, approve/block users, reset passwords, reopen delivery-code attempts after recipient verification, activate plans, edit tariffs and commissions.

The API is `server/main.ts`: Node 24 with `node:http` and `node:sqlite`, no npm dependencies.

## Current release — 4 October 2026

- **Live API:** `https://wind-production-72aa.up.railway.app`
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
npx expo-doctor
```

## Screens

```bash
npx playwright install chromium     # once per machine
npm run screens                     # every screen, Arabic + English, into docs/screens/
```

`docs/screens/README.md` maps each screenshot to its route and source file, and `docs/screens/index.html` shows them side by side. In Claude Code, `/screens` re-shoots and reviews them. The script builds the web app and seeds a temporary API, so your `wind.db` is untouched.

The logo is drawn by `scripts/make_icon.py` (icons, splash, favicon) and by `<Logo />` in `src/ui.tsx` from the same geometry; the animated intro is `src/intro.tsx`.

## Deploy

### 1. API

Any Docker host with a persistent volume and HTTPS in front (Fly.io, Railway, a VPS with Caddy).

```bash
docker build -t wind-api .
docker run -d -p 127.0.0.1:4000:4000 -v wind-data:/data \
  -e WIND_IDENTITY_MODE=self-service -e SUPPORT_CONTACT="<actual support contact>" wind-api
```

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Listen port |
| `HOST` | production `127.0.0.1`; Docker `0.0.0.0` | Bind address; Docker must stay on a private network or a loopback-only published port |
| `DB_PATH` | `/data/wind.db` | SQLite file; keep `/data` on a persistent volume |
| `TZ` | `Asia/Hebron` | Calendar day for earnings and the dashboard |
| `WIND_ENABLED_SERVICES` | `parcel` | Comma-separated services; opt into `ride` or `freight` after operational readiness is verified |
| `SUPPORT_CONTACT` | empty | Real reachable contact on the privacy and deletion-request pages |
| `SOUQ_PARTNER_KEY` | disabled | 32+ character server-only key shared with سوقنا as `WIND_PARTNER_KEY` |
| `WIND_IDENTITY_MODE` | required in production | Current launch: `self-service`; use `operator-verified` only to close public registration deliberately |
| `WIND_CONTACT_VERIFICATION_REQUIRED` | `false` | Future verification gate. Leave false until a real proof or approval process can admit new users. |
| `WIND_TRUST_PROXY` | `0` | Set `1` only behind a private proxy that overwrites `X-Real-IP`; used by durable public authentication limits |

For an approved operator, `WIND_ENABLED_SERVICES=parcel,ride,freight` exposes all three services. New bookings use `shared:false`; pooling is disabled and a driver may hold only one active job. Existing assigned trips can finish if their service is later disabled.

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

`/api/health` checks process liveness; `/api/ready` checks readable schema, writable database/directory and a bounded SQLite writer reservation. Startup uses WAL, foreign keys, full synchronous commits, a five-second busy wait, atomic schema initialization and `user_version=1`. SQL write contention returns retryable 503. SIGTERM/SIGINT stop admission, drain requests for up to ten seconds, then close connections and the database. Use a stop grace period longer than ten seconds.

Order advances require `requestId` (UUID) and `expectedStatus`; retries preserve the original code and request identity. A replay acknowledges the action with current server state; a new stale command is rejected. Wrong-proof retries under one identity count once. The current database schema is `user_version=3`. Upgrade clients before routing real users to this API.

Back up on a schedule with a consistent snapshot, then copy the file off the host. Never copy only `wind.db` while a live WAL may contain acknowledged commits:

```bash
docker exec <container> node -e "new (require('node:sqlite').DatabaseSync)('/data/wind.db').exec(\"VACUUM INTO '/data/backup-$(date +%F).db'\")"
```

The privacy policy is served at `https://<api>/privacy`; have it reviewed before launch. The public, login-free deletion request page is `https://<api>/account-deletion`. Set `SUPPORT_CONTACT` to a real monitored channel before launch.

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
npx eas-cli@latest env:create --name GOOGLE_MAPS_API_KEY --value <key> --environment preview --environment production --visibility sensitive
npx eas-cli@latest build --profile preview --platform all      # internal install links
npx eas-cli@latest build --profile production --platform all   # store builds, build numbers auto-increment
npx eas-cli@latest submit --platform all
```

- `EXPO_PUBLIC_API_URL` is required and must be `https`; the EAS build fails fast otherwise.
- `EXPO_PUBLIC_SUPPORT_WHATSAPP` (international digits) shows "Contact support" in the app. Optional.
- `GOOGLE_MAPS_API_KEY` (Maps SDK for Android, restricted to `ps.wind.app`) enables the Android map; without it Android shows the static route card. iOS uses Apple Maps.

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
unavailable. There are no push notifications (screens poll while open), driver
location is foreground-only, payment is cash, and the API is a single instance.
Post-pickup failure/return/dispute and cash settlement ledgers remain operational
launch gaps; do not claim them as implemented. Details and the path past each are
in [docs/SYSTEM.md §9](docs/SYSTEM.md).

## Product documents

- [Product requirements and market study](docs/PRODUCT.md)
- [System requirements, service logic, and delivery plan](docs/SYSTEM.md)
