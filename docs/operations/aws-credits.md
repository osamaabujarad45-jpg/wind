# AWS credit plan (Free plan, eu-north-1)

Measured 30 Oct 2026 with the AWS MCP tools (CLI profile `osama`). Prices come from the AWS Price List and Lightsail APIs for `eu-north-1` on the same day. Burn figures are estimates at a stated volume, not a quote. Arithmetic was done by script, not by hand.

## Account facts

| Item | Value |
|---|---|
| Account | `366754056464` (new AWS experience) |
| Plan | FREE, ACTIVE; **USD 120** credits remaining |
| Plan ends | **2027-04-30 08:39 UTC**, or earlier if the credits run out |
| Region | `eu-north-1` (Stockholm), the only Region for Regional resources |
| SES | Sandbox: 200 messages per 24 h, 1 per second; no identities; pricing plan Essentials |
| Budgets / Location keys / Free Tier offers | none / none before this work / none active |

## Read first: what the Free plan means for production

- AWS suspends a Free-plan account when the plan ends (2027-04-30) or when the credits are used up, whichever comes first. Resources and data become unreachable. The owner then has 90 days to upgrade to the Paid plan, after which AWS deletes the account and its content (AWS docs: *Choosing a plan*; Free Tier FAQs Q5). Leftover credits carry over to Paid bills.
- **Production must not depend on this account unless the owner upgrades to the Paid plan before 2027-04-30.** Everything below is one of three things: an evaluation, a staging option, or an integration that keeps a non-AWS fallback (Cloudflare email, OSRM).
- AWS SMS (End User Messaging) is Paid-plan only, so it cannot replace the phone-OTP provider on this account.
- **Owner action:** set a spend limit in **AWS Settings → Billing**. Only the project owner can, and it is the actual stop. A budget only sends alerts.
- **Budget alarm (proposed, not created yet; needs the alert email):** a monthly COST budget of USD 10, with alerts at 50 % actual (USD 5) and 100 % forecast. Budgets are global (us-east-1 API), and a budget without actions costs nothing.

## Ranking: quality gain for Wind vs credit burn

Volume assumption ("pilot"): 1,000 orders and 2,000 code emails per month. Wind is pre-launch, so QA volume today is far lower.

| # | Service | What Wind gains | Measured price | Burn/month at pilot | Decision |
|---|---|---|---|---|---|
| 1 | SES | Unblocks the verify/reset/support codes that are stuck on Cloudflare (no sending domain) | USD 0.16 per 1,000 emails | USD 0.32 | **Implemented** (`WIND_EMAIL_PROVIDER=ses`); live once the owner picks a sender |
| 2 | Location: ReverseGeocode | Arabic street label for a dropped pin (4/5 cities street-level, all ≤ 0.9 km) | USD 0.50 per 1,000 | USD 1.00 (2 per order) | Recommended; needs app work and owner decision |
| 3 | Location: Routes (Core) | Hosted second router; distance agrees with OSRM within 4 % on 8 of 10 pairs | USD 0.50 per 1,000 | USD 3.00 (6 per order) | Recommended as OSRM fallback, not as checkpoint authority |
| 4 | Location: Maps tiles | SLA-backed vector tiles (today: OpenFreeMap, no SLA) | USD 0.04 per 1,000 tiles | USD 7.20 at 180 tiles/order | Optional; only together with the MapLibre/EAS decision |
| 5 | Location: Arabic POI search | none: poor West Bank coverage (see below) | USD 0.50 per 1,000 | n/a | **Do not use**; keep local search (T16) |
| 6 | Staging (Lightsail) | Real non-loopback host + managed PostgreSQL for WP16 | USD 22/month (option B′) | USD 22 while it exists | Option; needs owner go-ahead |
| 7 | AWS Budgets | Spend alerts | USD 0 | USD 0 | Create once the owner gives the alert email |

Other measured eu-north-1 prices used below: EC2 `t4g.small` USD 0.0172/h, EBS gp3 USD 0.0836/GB-month, public IPv4 USD 0.005/h, RDS PostgreSQL `db.t4g.micro` Single-AZ USD 0.016/h, RDS gp3 USD 0.12/GB-month, Location `Stored` intended use USD 4.00 per 1,000 (avoid: never request `IntendedUse: Storage`).

## What fits in USD 120 until 2027-04-30 (6 months)

| Line | Months | USD |
|---|---|---|
| Services 1–3 at pilot volume (USD 4.32/month) | 6 | 25.92 |
| Staging B′ (Lightsail micro + managed PostgreSQL micro), run in bursts and deleted between them | 3 | 66.00 |
| **Total** | | **91.92** |
| Buffer (tiles trial, more staging, real launch volume) | | 28.08 |

With only two staging months the total is USD 69.92 and the buffer is USD 50.08. Already spent: the Location evaluation (37 calls) cost about USD 0.02.

## SES email codes (implemented)

- `server/ses.ts` sends SES v2 `SendEmail` over `fetch`, signed with Signature Version 4 from `node:crypto`. No AWS SDK: one JSON POST does not justify a new runtime dependency tree (`docs/implementation/dependency-security.md`). The signer matches botocore's `SigV4Auth` byte for byte; the frozen vectors live in `tests/email-ses.test.mjs`.
- `WIND_EMAIL_PROVIDER=ses` selects it (default `cloudflare`; any other value stops the API at start). Readiness needs `WIND_EMAIL_FROM`, `AWS_REGION`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (plus `AWS_SESSION_TOKEN` when set). The behaviour matches Cloudflare: any refusal answers `503 email_unavailable` and leaves no cooldown behind. SES reports bounces later through the suppression list or an event destination, so `email_bounced` stays Cloudflare-only.
- Fixed along the way: since commit `4f80e82` (28 Oct 2026) the Arabic lines of every code email were mojibake ("Ø±Ù…Ø²…"). They are restored byte-identically to the earlier copy, and both email suites now assert real Arabic.

Activation (each step needs the owner):

1. **Sender.** Best: a domain the owner controls. SES domain identity in `eu-north-1` with Easy DKIM (3 CNAMEs), custom MAIL FROM (MX + SPF TXT) and a DMARC TXT. Setup is complete only when the identity reads `VerifiedForSendingStatus: true`, DKIM `SUCCESS` and MAIL FROM `SUCCESS`. A single verified address (for example a free-mail address) only suits sandbox demos: free-mail `From` addresses fail DMARC alignment and land in spam.
2. **Server credential.** IAM user `wind-ses-sender` with one inline policy: `ses:SendEmail` on `arn:aws:ses:eu-north-1:366754056464:identity/<domain>` only. Trade-off: this is a long-lived access key, because the API runs off AWS (Railway/Azure) and has no instance role. Rotate it every 90 days and keep it in the host's secret store, never in mobile build variables. The alternative, IAM Roles Anywhere, needs a private CA, which is heavier than this need.
3. **API settings:** `WIND_EMAIL_PROVIDER=ses`, `WIND_EMAIL_FROM=no-reply@<domain>`, `AWS_REGION=eu-north-1`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
4. **Sandbox.** Until production access is granted, SES delivers only to (1) addresses verified as identities, (2) the SES mailbox simulator (`success@simulator.amazonses.com`), or (3) any address at a verified domain in the account. Leaving the sandbox means submitting the production-access request form (use case, website, mail type `TRANSACTIONAL`), which needs the owner's explicit yes. While at 1 message per second, a burst of sign-ups can hit `TooManyRequests`, which surfaces as the honest `503` and a retry.
5. **Plan end.** Before 2027-04-30, upgrade the account or switch back to `WIND_EMAIL_PROVIDER=cloudflare` once Cloudflare has a sending domain.

## Amazon Location Service evaluation (no app rewiring)

Method: `scripts/aws-location-eval.mjs` (run 30 Oct 2026, from a Windows PC in the local-fallback setting). It used a 30-day API key restricted to Places `Geocode/ReverseGeocode/SearchText/Autocomplete/GetPlace`, Routes `CalculateRoutes` and Maps `GetTile/GetStaticMap` on the `eu-north-1` default providers. City centres come from `src/model.ts`. OSRM is the public demo `router.project-osrm.org`, which the synthetic QA server already uses; production OSRM is self-hosted. **Google was not measured:** there are no restricted Google keys yet (T10/T12 blocked).

### Places

| City | Geocode Arabic | Geocode English | Reverse geocode (Arabic) | Arabic landmark search (biased to centre) | «مستشفى» results within 20 km |
|---|---|---|---|---|---|
| Ramallah | ✓ 0.43 km | ✓ 0.43 km | ✓ «يافا, رام الله» 0.01 km | ✗ «دوار المنارة» → Abu Arish, Saudi Arabia | 4/5, all Israeli/Jerusalem hospitals |
| Nablus | ✓ 0.56 km | ✗ named "Shkhem" | ✓ «ألنجاح, نابلس» 0.01 km | ✗ «جامعة النجاح» → Cairo | 0/5 |
| Hebron | ✓ 1.31 km | ✓ 1.31 km | ⚠ settlement POI in Latin script, 0.87 km | ✗ «الحرم الإبراهيمي» → streets in Amman | 0/5 |
| Tulkarm | ✓ 0.70 km | ✗ Tulkara, Australia | ✓ «دوار جمال عبد الناصر, طولكرم» 0.11 km | ~ roundabout named after Kadoorie, 0.49 km (street, not campus) | 5/5, all Netanya (Israel), some Hebrew-only names |
| Jenin | ✓ 0.06 km | ✓ 0.06 km | ✓ «الملك فيصل, جنين» 0.03 km | ~ AAUP found as 2nd hit, 7.23 km (1st hit 59 km) | 1/5 (Afula, Israel) |

West Bank results carry no country code, and the region label uses the non-standard spelling «ألضفة ألغربيه». Places latency: median 156 ms (109–588 ms).

### Routes (car, Core)

| Pair | Straight-line km | Amazon km / min | OSRM km / min | Δ distance | Δ duration |
|---|---|---|---|---|---|
| Ramallah–Nablus | 35.6 | 53.2 / 55 | 53.5 / 62 | −0.6 % | −11.3 % |
| Ramallah–Hebron | 42.4 | 54.1 / 57 | 52.3 / 54 | +3.4 % | +5.6 % |
| Ramallah–Tulkarm | 48.3 | 85.0 / 65 | 76.4 / 71 | **+11.3 %** | −8.5 % |
| Ramallah–Jenin | 62.7 | 97.0 / 90 | 97.3 / 105 | −0.3 % | −14.3 % |
| Nablus–Hebron | 77.9 | 105.9 / 100 | 104.9 / 106 | +1.0 % | −5.7 % |
| Nablus–Tulkarm | 23.6 | 29.1 / 45 | 29.2 / 39 | −0.3 % | +15.4 % |
| Nablus–Jenin | 27.1 | 43.1 / 55 | 43.1 / 50 | 0.0 % | +10.0 % |
| Hebron–Tulkarm | 86.9 | 121.3 / 83 | 125.2 / 100 | −3.1 % | −17.0 % |
| Hebron–Jenin | 105.0 | 172.5 / 120 | 175.5 / 136 | −1.7 % | −11.8 % |
| Tulkarm–Jenin | 30.5 | 57.0 / 51 | 41.8 / 47 | **+36.4 %** | +8.5 % |

All 10 routes returned with no notices. Median latency was 277 ms for Amazon and 230 ms for the OSRM demo. The line is `[longitude, latitude]` (`LegGeometryFormat: Simple`), which matches the contract's tuple order. Neither provider knows checkpoints; the server's checkpoint and detour policy stays the authority.

### Maps

A vector tile over Ramallah (z12, 41 KB) and one over Nablus (z14, 15 KB) both returned data, and the `Standard` style descriptor returned 200.

### Recommendation

- **Do not use Places search for Arabic landmarks or POIs.** 3 of 5 landmark searches resolved to other countries, and the hospital search surfaces Israeli facilities (some with Hebrew-only names) rather than Palestinian ones. Keep the local city/saved-place search.
- **ReverseGeocode pin labels: implemented 30 Oct 2026** (`server/place-label.ts`, `GET /api/place-label`, shown under the pin in `src/pin-sheet.tsx`). Server key `WIND_LOCATION_KEY` only; `IntendedUse: SingleUse`, no POI results, Hebrew dropped and Latin dropped from Arabic labels, never cached or stored (AWS Service Terms §82.4a), "© AWS, HERE" shown with each label (§82.10), 30 lookups per user per 10 minutes, no lookup outside the served area. Off (capability absent) without the key. The privacy page now discloses it. Only the street comes from HERE; the place name is Wind's own served city, because the live check found HERE filing the Ibrahimi Mosque area (31.5246, 35.1107) under «كريات أربع» / "Kiryat Arba". HERE transliterates settlement street names into Arabic script (e.g. «عيمك حيفرون»), so such street names can still appear inside Hebron H2 and near settlements; the Hebrew-script filter is a backstop that no live answer has triggered.
- **Routes fallback: not built.** The v2 default provider is HERE (style attribution "© AWS, HERE"), and AWS Service Terms §82.5b forbids layering HERE routes on another provider's map. Wind's MapLibre draws on OpenFreeMap tiles, so an Amazon route line there would breach the terms. Routes become usable only together with Amazon map tiles (the separate MapLibre/EAS decision), or as numbers-only fares/ETAs, which changes money policy and is the owner's call. Routes may be cached for at most 30 days (§82.4a(i)).
- **Maps tiles** cover the area. Adopting them means swapping the MapLibre style (and an EAS rebuild for native), which is the owner's separate decision.

## Staging option (documented, not deployed)

What the repo requires: `WIND_POSTGRES_STAGING=1` (WP16) refuses loopback PostgreSQL and demands `sslmode=verify-full` with the `wp16_staging` schema (`server/db/runtime.ts`); otherwise PostgreSQL stays test-only. RDS and Lightsail database certificates chain to the Amazon RDS CA, which is not in Node's default trust store, so staging needs `NODE_EXTRA_CA_CERTS` pointing to the RDS global bundle. OSRM for the region needs several GB of RAM to build the graph; the Location Routes fallback avoids hosting it in staging.

| Option | Shape | USD/month | 6 months | Fits credits? | Notes |
|---|---|---|---|---|---|
| A | Lightsail `small_3_0` (2 vCPU, 2 GB, 60 GB): API + SQLite (today's production mode) | 12 | 72 | yes | Cannot satisfy WP16: PostgreSQL on the same box is loopback |
| B | Lightsail `nano_3_0` (512 MB) + managed PostgreSQL `micro_2_0` (1 GB, 40 GB) | 20 | 120 | uses all | Meets WP16 verify-full; 512 MB is tight for the API |
| **B′** | Lightsail `micro_3_0` (1 GB) + managed PostgreSQL `micro_2_0` | 22 | 132 | **in 2–3-month bursts** | Recommended. Lightsail bills while a resource exists, even when stopped: snapshot and delete between bursts |
| C | EC2 `t4g.small` + 20 GB gp3 + public IPv4 (17.88) + RDS `db.t4g.micro` + 20 GB gp3 (14.08) | 31.96 | 191.75 | no (≈ 3.7 months max) | Most AWS-native; exceeds credits |
| Azure | `infra/main.bicep`, `enableWorkloads=false`: Container Apps API + worker, OSRM 2 vCPU/4 GiB + 100 GB graph, PostgreSQL Flexible `Standard_B1ms` 128 GB with 14-day backups, Web PubSub, budget parameter USD 100 | not priced here (see `cost-model.md`) | n/a | separate student credit | The production-shaped target. An AWS staging stack would be a throwaway that dies with the Free plan |

Any deploy (creating a Lightsail or RDS resource included) needs the owner's explicit go-ahead.

## Resources created by this work

| Resource | ARN | Region | Standing cost | Expires | Status |
|---|---|---|---|---|---|
| Location API key `wind-location-eval` | `arn:aws:geo:eu-north-1:366754056464:api-key/wind-location-eval` | eu-north-1 | none (pay per call; ≈ USD 0.02 used) | 2026-11-29 | Owner decides: keep for re-runs or delete |

| Location API key `wind-api-place-label` (server only, `geo-places:ReverseGeocode` only) | `arn:aws:geo:eu-north-1:366754056464:api-key/wind-api-place-label` | eu-north-1 | none (USD 0.50 per 1,000 calls) | 2027-04-30 | Set as `WIND_LOCATION_KEY` on the API to turn pin labels on |
| Budget `wind-credit-burn` (USD 10/month, credits excluded, alerts at 50 % actual and 100 % forecast to the owner's email) | `arn:aws:budgets::366754056464:budget/wind-credit-burn` | global (us-east-1 API) | none | none | Keep |

Nothing else was created: no SES identity, IAM user, Lightsail or RDS resource.

## Considered and not recommended now

- **Bedrock** (included in the Free plan): no Wind feature needs generative AI, and token use burns credits.
- **Cognito:** Wind already has password, phone and Entra identity paths.
- **S3 off-site backups of `wind.db`:** cheap, but the copies vanish if the account is not upgraded, so this is not a reliable backup target on the Free plan (`restore.md` stays the authority).
- **Route 53 health check plus SNS email on the production API:** useful uptime alerting, but it needs the production URL and an alert email. Price not measured.
