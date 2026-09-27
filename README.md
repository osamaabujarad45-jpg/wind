# Wind / ويند

Arabic-first delivery app for West Bank cities: parcels, licensed passenger rides, and large loads. Orders heading the same way can be shared, so each customer pays less; a private option stays available. The Souqna integration and any co-branding need a written agreement with Souqna first.

One Expo app serves three roles, chosen by the account that signs in:

- **Customer:** book, see the price before confirming, track the driver live, hand over with a 4-digit code, rate, Wind Plus plan.
- **Driver:** register with a vehicle, wait for approval, accept jobs that fit the vehicle, advance the trip, see earnings, Wind Pro plan.
- **Admin:** profit dashboard, all orders, approve/block users, reset passwords, activate plans, edit tariffs and commissions.

The API is `server/main.ts`: Node 24 with `node:http` and `node:sqlite`, no npm dependencies.

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

## Deploy

### 1. API

Any Docker host with a persistent volume and HTTPS in front (Fly.io, Railway, a VPS with Caddy).

```bash
docker build -t wind-api .
docker run -d -p 4000:4000 -v wind-data:/data -e SUPPORT_CONTACT="WhatsApp +970 59 000 0000" wind-api
```

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Listen port |
| `DB_PATH` | `/data/wind.db` | SQLite file; keep `/data` on a persistent volume |
| `TZ` | `Asia/Hebron` | Calendar day for earnings and the dashboard |
| `SUPPORT_CONTACT` | empty | Contact line on the privacy page |

Then register your own number in the app and promote it from the server shell:

```bash
docker exec <container> node server/main.ts promote 0599123456
```

Back up on a schedule with a consistent snapshot, then copy the file off the host:

```bash
docker exec <container> node -e "new (require('node:sqlite').DatabaseSync)('/data/wind.db').exec(\"VACUUM INTO '/data/backup-$(date +%F).db'\")"
```

The privacy policy is served at `https://<api>/privacy`; have it reviewed before launch.

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

### 3. Web (optional)

```bash
EXPO_PUBLIC_API_URL=https://<api> npx expo export --platform web
npx eas-cli@latest deploy
```

### Store submission notes

- Privacy policy URL: `https://<api>/privacy`. Account deletion is in the app (Account → Delete account) and on the web build.
- Give reviewers a customer account and an approved driver account in the review notes.
- A public listing for a ride or courier service needs the licensing described in `docs/SYSTEM.md` §7. Until then, ship to TestFlight and Play internal/closed testing.

## Known limits

Phone numbers aren't SMS-verified, there are no push notifications (screens poll while open), driver location is shared only while the app is open, payment is cash, and the API is a single instance. Details and the path past each are in [docs/SYSTEM.md §9](docs/SYSTEM.md).

## Product documents

- [Product requirements and market study](docs/PRODUCT.md)
- [System requirements, service logic, and delivery plan](docs/SYSTEM.md)
