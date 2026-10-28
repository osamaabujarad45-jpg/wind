# WP16 prep: Azure staging cutover (student subscription, synthetic users only)

Read-only preparation while WP10 lands. This is not deployment approval and does
not satisfy the plan's commercial launch gates (section 16 / gate register).
The user's standing objective authorizes **staging on the Azure for Students
subscription with synthetic users**; production, paid customers, and every
provider activation gate remain owner-only and recorded, never faked.

## Verified current state (2026-10-27)

- Azure CLI is logged into "Azure for Students" (Enabled). No Fastship resource
  group exists yet; `infra/main.bicep` compiles and defaults
  `enableWorkloads=false`. Staging params: `infra/examples/staging.bicepparam`
  (prefix `fsstage`, West Europe, B1ms, 64 GB, workloads disabled).
- API image (`Dockerfile`) still runs SQLite by default (`DB_PATH=/data/wind.db`)
  and hard-codes the Railway web-export origin
  (`EXPO_PUBLIC_API_URL=https://wind-production-72aa.up.railway.app`). Plan §16
  requires replacing that origin through environment configuration.
- `server/db/runtime.ts` refuses any PostgreSQL runtime outside
  `NODE_ENV=test` + `WIND_POSTGRES_TEST_ONLY=1` + loopback + a
  `wp0[0-9]_*` test schema. This is the production-cutover gate.

## Cutover work required before `enableWorkloads=true`

1. **Runtime gate (reviewed change, WP16 code task):** add an explicit staging
   mode to `runtime.ts` — e.g. `WIND_POSTGRES_STAGING=1` with a non-loopback
   TLS `WIND_DATABASE_URL`, a dedicated non-test schema (extend the isolated
   schema pattern deliberately, e.g. `wp16_staging`), and migrations applied
   once by the runner under `MIGRATION_LOCK` (API startup must never
   auto-migrate — `initializePostgres` stays runner-only). SQLite stays the
   default; no silent failover of writes. Gate covered by tests in both modes.
2. **Image/origin:** build one reviewed image digest; pass the staging API
   origin via env (`EXPO_PUBLIC_API_URL`) instead of the Railway literal for
   staging builds; API + worker are separate Container Apps from the same
   digest; worker runs `server/worker.ts` with the same DB env.
3. **Database evidence on Azure PG (flexible server, PostGIS):** create the
   staging schema, run migrations 3..latest once, run the import rehearsal
   with a synthetic snapshot, then `tests/pg-import`-style reconciliation and
   a real backup -> restore into a fresh server/schema with reconciliation
   (plan: backup existence alone fails the Recovery gate). Note the open
   version skew: local evidence is PG18/PostGIS 3.6, the template targets
   Azure Flexible Server — record the actual Azure PG version at deploy time
   and re-run the persistence subsets against it; do not assume parity.
4. **Health contract:** `/api/health` is process liveness, `/api/ready` is
   DB/migration readiness; an unrelated provider outage (SMS/push/PubSub
   unconfigured) must not fail readiness. Expo push and Web PubSub stay
   disabled in staging (no EAS `projectId`, FCM/APNs, or PubSub credentials);
   realtime honestly reports `long_poll`.
5. **Staging verification:** deploy with `enableWorkloads=true` only in the
   staging resource group; synthetic customer/driver/admin journeys over the
   public staging URL (register -> quote -> book -> dispatch test mode ->
   lifecycle -> cash), API/worker restart drill, worker outbox recovery,
   rollback = set `enableWorkloads=false` / previous digest, with the SQLite
   path untouched. Record p95s against the plan's engineering targets
   (API p95 < 500 ms, command ack p95 < 1 s, tracking freshness p95 < 10 s,
   search terminal <= 90 s) as staging measurements, not SLAs.
6. **EAS + device:** `eas.json` exists (preview/production) but `app.json` has
   no EAS `projectId`; creating one is an owner-account action on the logged-in
   Expo account. Build a preview (internal distribution) APK with
   `EXPO_PUBLIC_API_URL` pointing at staging, install on the Galaxy A53
   (`R5CTB0FJP9Z`), and run the end-to-end journey against the deployed
   staging backend (not the LAN sandbox).

## Honest gates that stay open after staging

Commercial PAYG subscription and production change authorization; FCM/APNs +
EAS project for real push; Bank of Palestine agreement (WP14); telecom sender
approval (WP06/WP15); WP08 100-case corpus + operator sign-off (quotes stay
`uncertain`, dispatch stays test-only); West Europe carrier latency measured
from the physical device, not from this PC.
