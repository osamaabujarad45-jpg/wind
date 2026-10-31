# Handoff: real map data in production (31 October 2026)

## Why the maps showed no real data

Production moved from Railway to the Azure VM `wind-vm` on 29 October. The OSRM road router
(`osrm.railway.internal`) did not move with it, and `OSRM_URL` was never set on the VM. Without it the
API returns `503 route_unavailable`. The app then draws pins with no road line, shows straight-line ETAs and
prices from the straight-line tariff. Place search only matched the ten served town names. The map tiles
(OpenFreeMap, OpenStreetMap data) were never the problem.

## Provider decision: OpenStreetMap data, hosted on Azure

Measured from this PC on 31 October against the same corpus. That was 19 West Bank places in Arabic and English with known
coordinates, and 5 routes. Scripts and raw output: `reports/maps-provider-eval-2026-10-31/`.

| Provider | Places found within 1.5 km | Ramallah→Nablus | Notes |
|---|---|---|---|
| OpenStreetMap (Nominatim + OSRM) | **18 / 19** | 53.5 km, 62 min | Arabic works; free; self-hostable |
| Azure Maps Gen2 (TomTom) | 8 / 19 | 54.5 km, 54 min | Arabic queries land 1,000+ km away; Search v1 fuzzy found nothing |
| Amazon Location (HERE) | 4 / 19 | 53.2 km, 55 min | `search-text` hits 30–90 km off; geocode is address-only |

All three agree on road distances. OSM wins search by a wide margin, costs nothing per request, keeps
customer coordinates inside our infrastructure, and the app's checkpoint-aware routing is built on OSRM.
Azure is the host (VM, registry, storage, the student subscription's credit for spare capacity), not the
data source. The Azure Maps account `wind-maps` (resource group `wind-prod`, Gen2, pay-per-use, $0 idle) was
created only for this test and nothing reads it. Delete it with
`az maps account delete -g wind-prod -n wind-maps` if no fallback is wanted.

## What is deployed

- **OSRM** on the VM: container `wind-osrm` (image `ghcr.io/project-osrm/osrm-backend:v26.6.1-amd64-alpine`,
  `--algorithm mld --mmap`), graph in `/srv/osrm` (398 MB, built on the VM from the Geofabrik
  israel-and-palestine extract of 31 October; peak build RAM 337 MB). It sits only on the `windnet` Docker network and has no
  public port. Live check from the API container: Ramallah→Nablus 53.6 km, 62 min.
- **API** container `wind-api` runs `windprodacr.azurecr.io/wind-api:20261031-maps5` and reads
  `/srv/wind-api.env` (root, 0600), which now includes `OSRM_URL=http://wind-osrm:5000`. Rollback containers,
  newest first: `wind-api-pre-maps5-20261031` (previous image with the router), `wind-api-pre-osrm-20261031`
  (previous image, no router), `wind-api-pre-20261029`. `npm run check:deployment -- --origin
  https://windapi236.swedencentral.cloudapp.azure.com` passed 9/9 after the deploy.
- **Android**: EAS preview build `58b42e29` (versionCode 17, same signing certificate `5947bab0…` as 16) is
  installed on the A53 as `ps.wind.app`, pointing at the Azure API.
- **Place search** `GET /api/places/search?q=…&lang=ar|en&near=lat,lng` (`server/domain/place-search.ts`,
  additive contract). It proxies Nominatim with a tap-only UI, a 24 h cache, one upstream request a second for the
  whole server, 60 searches per user per 10 minutes, Palestine only (`countrycodes=ps`, still 18/19), only
  served-area hits and nearest-first ordering. The detail line skips OSM's `city`/`county`, which for Ramallah
  streets name an Israeli settlement council and an Oslo area. Override with `GEOCODER_URL`.

## Phone evidence (31 October, A53 over USB, local QA sandbox wired to the Azure router)

The customer test app built from this code ran the whole search flow on the phone. "Birzeit University" returned جامعة بيرزيت (OSM),
and "Manara" returned Ramallah's ميدان المنارة first. Confirming both set exact pins and landmarks. The booking preview drew the road
route on the OSM map with **9.7 km** by road. The driver test app showed the road approach line and a road ETA.
- Pre-deploy backup: `%LOCALAPPDATA%\SouqWindPrivate\backups\wind-azure-20261031T0013187998Z.dpapi`
  (restore-verified).

## Gate (k5 over SSH, final tree verified identical: 402 files, 0 mismatches, 0 extras)

Final run: `LINT=0 TSC=0 CONTRACTS=0 PGSTART=0 TEST=0 PERSISTENCE=0`. Lint shows no warnings, contracts cover 90 installed + 79
additive endpoints, `npm test` passes 88/88, and `test:persistence` passes every suite including the legacy parity set.

Getting there took four test-harness fixes, none of them in product code:
- `pg-email`/`email.test` raced the sign-up email that goes out after the reply.
- Ten wall-clock fixtures sat 1 ms past their limit. These are the same hunks as `bf64cb0` on
  `claude/cloud-features-app-completion-d38b55`, so a merge sees identical changes.
- Two approach fixtures used `observedAt = now − 100 ms` against a separate API process, so k5 clock corrections
  flipped them. They now use 1 s.
- `scripts/local-postgres.mjs` now waits up to 3 minutes for k5's slow-disk recovery and shutdown checkpoints.

Merging with that branch may still conflict lightly in `src/app/book.tsx`, `server/main.ts` and `CLAUDE.md`.

## Pilot readiness (Nablus, Ramallah, Jenin)

- **Support:** production `SUPPORT_CONTACT=+972597127547` is set, so the privacy and deletion pages show it. EAS `EXPO_PUBLIC_SUPPORT_WHATSAPP=972597127547` is set for preview and production, and the Docker web build now takes the same value as a build arg. "Contact support" opens WhatsApp to that business account; verified on the A53.
- **Phones:** `059…`, `+970 59…`, `+972 59…`, `00972…` and Arabic digits are one account (owner decision recorded in WP06). Production register validation was checked without creating an account: `+972`/`+970`/`059` pass, and an Israeli-carrier number is rejected.
- **Cities:** live routes are Ramallah→Nablus 53.6 km/62 min, Nablus→Jenin 43.1 km/50 min and Ramallah→Jenin 97.4 km/105 min. 17 of 18 everyday places resolved inside the right city. The miss was "دوار المنارة", which now also finds Ramallah's ميدان المنارة.
- **Checkpoints:** production has none yet. `node server/main.ts seed-checkpoints` adds Huwara, Za'tara, Deir Sharaf, Shavei Shomron, Atara, Jaba' and Qalandia at OSM positions, each within 2–26 m of the live routes. It needs an active admin.
- **Blocking for real users: production has no admin.** Its only user is a blocked test customer. Once the owner registers in the app, run on the VM:
  `docker exec wind-api node server/main.ts verify-phone <phone> --phone-verified` (operator attests the number is theirs), then `... promote <phone>`, then `... seed-checkpoints`.
  An admin is needed to approve self-service drivers (`pending_approval` until then), to manage orders and to place checkpoints.

## Refreshing the road graph

ACR Tasks are blocked on this subscription (`TasksOperationsNotAllowed`). The VM builds the graph itself
with a temporary 4 GB swap file in about 10 minutes, and the API stayed healthy (≤0.5 s `/api/ready`) throughout.
Build into a new folder, then swap `wind-osrm` to it. Do not run Expo or Docker image builds on the VM. Build
API images with Podman in local WSL and push to `windprodacr`.

## Upgrade path

- Traffic beyond a small pilot: self-host Nominatim (or Photon) and set `GEOCODER_URL`. The public instance
  allows about 1 request a second and forbids type-ahead.
- The VM has 886 MB RAM. OSRM uses about 150 MB, which leaves room, but `B2ls_v2` (4 GB) is the next size if both grow.
