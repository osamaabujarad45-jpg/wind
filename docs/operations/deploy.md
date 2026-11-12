# Azure deployment preparation

This is IaC preparation, not an authorization or a production readiness claim. `server/db/runtime.ts` permits PostgreSQL through an isolated test path (`NODE_ENV=test`, `WIND_POSTGRES_TEST_ONLY=1`, loopback), or a staging path (`WIND_POSTGRES_STAGING=1`, non-loopback host, `sslmode=verify-full`, fixed `wp16_staging` schema). Neither is a reviewed production cutover path. Templates default `enableWorkloads=false`; keep that default until runtime, migration, restore, concurrency, security, region/quota, cost, provider and operating gates are evidenced. A successful Bicep build or what-if is not deployment approval.

## Local validation

Install the reviewed compiler from the official Bicep release at pinned version `0.48.1`, then run:

```powershell
az bicep install --version v0.48.1
node scripts/check-azure.mjs
node tests/azure-infra.test.mjs
```

The validation script compiles/lints the template and builds all three parameter examples with a fixed compile-only placeholder. It does not read operator secrets. The test checks compiled ingress/probe ports against the packaged API, the polling worker's minimum replica, and the separate graph-storage foundation. It has no deployment command, Azure login, or authenticated provider call.

## Production host on AWS, what runs today

**Since 12 November 2026** production runs on AWS account `083712835043`, Region `eu-north-1`, from the CloudFormation stack `wind` (`infra/aws/wind.yaml`; why: `docs/operations/aws-migration-study.md`). Azure stopped the old VM over billing and then disabled the subscription; the Azure resources are left untouched until the owner deletes them.

- **Public address:** `https://dlvxzw3gj596d.cloudfront.net` (CloudFront). It is AWS-owned and stays the same when the host is replaced, so the app does not need a rebuild for a host move. It is the repository variable `WIND_API_URL`, read by CI, the release workflow and Uptime. Before ever changing it, remember that every installed APK has the address built in.
- **Host:** EC2 `t3.small` `wind-host` with an Elastic IP, Ubuntu 24.04, 30 GiB encrypted gp3 (kept if the instance is deleted), 2 GiB swap. Docker runs `wind-api`, `wind-osrm` and `caddy` on the `windnet` network, SQLite at `/srv/wind-data/wind.db`, as on Azure.
- **TLS:** CloudFront to the host is HTTPS. Caddy (`infra/vm/Caddyfile`, at `/srv/Caddyfile`) holds a Let's Encrypt certificate for the host's sslip.io name (stack output `OriginName`). The security group admits 443 only from CloudFront's origin-facing prefix list, and 80 only for certificate checks and redirects. Caddy passes CloudFront's `X-Forwarded-For` through unchanged, so the API's per-address limits key on the caller (`server/domain/client-address.ts` takes the last entry, which CloudFront writes).
- **Shell:** Systems Manager Session Manager or `aws ssm send-command` with the `wind` CLI profile. There is no SSH port and no key.
- **Credentials:** none stored on the host. Its instance role may pull `wind-api` from ECR and add objects to `wind-backups-083712835043`, nothing else. GitHub assumes `wind-release-image` through OIDC from `master` only.
- **Settings:** `/srv/wind-api.env` (root, 0600) holds the same keys as before, with `WIND_PUSH_SUBJECT=https://dlvxzw3gj596d.cloudfront.net`, `OSRM_URL=http://wind-osrm:5000` and `WIND_TRUST_PROXY=1`. The Firebase admin key was re-issued on 12 November (the old one stayed on the Azure disk).
- **Cron:** `infra/vm/wind.cron` at `/etc/cron.d/wind`: nightly backup 03:10 UTC, watchdog every minute.

### Releasing an image

`infra/vm/deploy.sh` takes the tag, the pushed digest and the source revision. It logs in to ECR with the host role, pulls and runs the image by digest, and refuses one whose `org.opencontainers.image.revision` label is not that revision, before the backup or the switch. The tag only names the rollback container, and a tag that already has one is refused; ECR tags are immutable too. `tests/deploy-script.test.mjs` runs the script against a moved tag in CI. After any change to `infra/vm/deploy.sh`, copy it to `/srv/deploy.sh` and compare SHA256 again before releasing. Its rollback restarts the old container with its original environment, which is not safe across a database-backend cutover (master plan Phase 3).

1. Require applicable gates and CI on the actual merge SHA. Confirm remote `master` still equals that green candidate, then run `gh workflow run release-image.yml --ref master -f tag=<tag>`. The workflow is master-only and refuses an existing tag; it does not check the candidate's CI itself.
2. Record the workflow URL, its exact `headSha`, the pushed digest and the matching revision label.
3. Run the `sudo /srv/deploy.sh …` line from the workflow summary on the host, through Session Manager or `aws ssm send-command --document-name AWS-RunShellScript`.

The **Uptime** workflow checks `$WIND_API_URL/api/ready` hourly from outside AWS. A failed run emails whoever last changed its schedule, under their GitHub notification settings.

### The Azure VM (history, until 12 November 2026)

Production ran on Azure VM `wind-vm` (rg `wind-prod`, Sweden Central, `windapi236.swedencentral.cloudapp.azure.com`), image registry `windprodacr`, backups in Blob `windprodstore/wind-backups`. The last image there was `wind-api:20261110-help-ref` (`sha256:56d4df47…6cdd`, revision `bd51d592`). An extra, unused Container App also named `wind-api` cost about USD 3 a day. Delete all of it only with the owner's approval, after AWS has run well for two weeks.

### Firebase (done 7 November 2026, project `wind-development`)

The backend stays on the VM. Firebase only sends closed-app alerts and password-reset email. The production app `ps.wind.app` is registered; `GOOGLE_SERVICES_JSON` is in the EAS production and preview environments; the FCM V1 key is uploaded to EAS. Email/password is on, client sign-up is **off** (or anyone could pre-create a Firebase user for someone's email), minimum 12 characters. Server settings: `WIND_FIREBASE_API_KEY` (restricted to Identity Toolkit), `WIND_FIREBASE_SERVICE_ACCOUNT` (base64 JSON), `WIND_EXPO_PUSH_ENABLED=1`. The repository is `osamaabujarad45-jpg/wind`.

**Known limit:** a user who mistyped their email at signup can lose the account to whoever owns that address. Accepted for a pilot among people the owner knows; verify email before a wider launch.

### Turning on native push (Android), from scratch

Web Push needs only `WIND_PUSH_SUBJECT`. A closed Android app needs Firebase:

1. Create a Firebase project, add an Android app with the package in `app.json`, and download `google-services.json`.
2. Make it available to EAS builds: `npx eas-cli@latest env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment production --environment preview`. `app.config.js` reads it.
3. In Firebase, generate a service account key and upload it with `npx eas-cli@latest credentials` under Android > Google Service Account > FCM V1. Do not commit this key.
4. Build and install the app, then add `WIND_EXPO_PUSH_ENABLED=1` to `/srv/wind-api.env` and restart.

## Owner-run review after gates

West Europe is the report's staging baseline, subject to review. Production region, service quota, data-location, latency, SKU availability, network/DNS and HA remain unapproved. On a protected operator workstation, after Azure access and approval exist, inspect the resolved parameters (never print secret env vars), then run an authenticated what-if:

```powershell
$env:FASTSHIP_PG_ADMIN_PASSWORD = Read-Host 'PostgreSQL admin password' -AsSecureString | ConvertFrom-SecureString -AsPlainText
az deployment group what-if --resource-group <reviewed-resource-group> --name fastship-staging-review --template-file infra/main.bicep --parameters infra/examples/staging.bicepparam
Remove-Item Env:FASTSHIP_PG_ADMIN_PASSWORD
```

The interactive example above is illustrative of secret sourcing only; validate the shell's secure-input behavior in the approved environment before use. Bicepparam files contain no secrets. Do not run `az deployment group create` from CI. Review the complete what-if, resource provider registration, policy/RBAC impact, each SKU/region/quota, private connectivity, data residency, cost calculator output and recovery procedure. Infrastructure deployment itself requires separate explicit owner authorization.

GitHub Actions has `contents:read` only and runs compile/lint/static policy tests. No Azure federated credential, role assignment, environment approval, authenticated what-if, or deploy job is configured. If later added, use a dedicated federated identity on a protected GitHub Environment, exact organization/repository/branch or environment subject, and the narrowest resource-group deployment role plus separately scoped resource permissions. Never grant subscription-wide Owner or Contributor. Require protected approval for any Azure access and keep deployment manual.

Build and publish images from one reviewed source revision; pin each image by digest, preserve build logs, SBOM, provenance/attestation, vulnerability scan and source commit association. Current root-owned Docker base image digest/pinning review and actual worker entrypoint support are unresolved. Never infer provenance from a mutable tag.

## Rollout and rollback gates

Keep `enableWorkloads=false` until the intended staging or production activation has passed its independent review and applicable migration/one-writer gates. Staging access is already implemented; production access is not. API liveness is `/api/health`; readiness is `/api/ready` for essential DB/migration state only. Do not make DB health depend on SMS, push, or routing provider availability. API max replicas stays one until WP10 approves scaling. Worker has no HTTP health probe and uses `server/worker.ts` only after root verifies the packaged entrypoint. OSRM graph must be versioned, durable, capacity-sized and priced; no ephemeral graph is acceptable.

Current local persistence evidence used PostgreSQL 18; this template selects Flexible Server PostgreSQL 16. Treat major-version and PostGIS compatibility as an explicit migration/driver test gate. Verify schema import, extensions, locks, transaction behavior, query semantics and restore against the selected Azure major version before enabling workloads. Local PostgreSQL 18 success does not establish PostgreSQL 16 compatibility.

Graph storage, identity mount and private connectivity belong to the foundation, so an authorized operator can populate and verify the graph while applications remain disabled. Upload the complete reviewed graph from an approved host with private connectivity and named file-write permission. Record extract timestamp/checksum, profile/version, build image digest, generated-file checksums and route-corpus results. Verify the mounted region.osrm and companion files against that manifest. A volume at /data hides files baked into the image; an empty share is never a valid graph. Confirm the OSRM internal FQDN is non-empty in the what-if and that the API's `OSRM_URL` resolves inside the environment. Actual SMB identity preview availability, RBAC propagation, region support, permissions and graph startup remain staging checks. Never use complete deployment mode to erase retained resources.

API ingress and probes explicitly use port4000, matching the packaged runtime, with HOST0.0.0.0. API and database-polling worker each retain one replica when enabled; a worker without an event scaler must not scale to zero. Neither application receives a fabricated database DSN, provider secret or cloud test bypass.

When `enableWorkloads` is true the template binds the settings the runtime refuses to boot without: `SUPPORT_CONTACT`, `WIND_IDENTITY_MODE`, a Key Vault `database-url` secret surfaced as `WIND_DATABASE_URL` (read with the user-assigned identity), `WIND_POSTGRES_STAGING=1`, `OSRM_URL` pointing at the internal OSRM ingress, `DB_PATH=/data/wind.db` on a mounted `wind-data` share, and AcrPull for the runtime identity. `supportContact` must be a real reachable contact; deployment fails at compile time if it is blank. The PostgreSQL URL uses `sslmode=verify-full` and is never written as a plaintext environment value. Supplying the binding does not open the runtime gate: the API still rejects non-loopback PostgreSQL unless the staging flag is present, and the production cutover remains a separate reviewed code change.

`/data` exists for the SQLite fallback path and the production `DB_PATH` check. Do not run two replicas against SQLite on Azure Files; the durable worker requires PostgreSQL and the API keeps one replica until WP10 approves scaling.

Deploy migration once under the database advisory lock. The runtime's only non-loopback PostgreSQL gate uses the hardcoded `wp16_staging` search path, so the migration must create and populate that schema before the API or worker starts. With the Key Vault URL loaded into the operator shell (never echoed), run once:

```bash
WIND_POSTGRES_STAGING=1 WIND_DATABASE_URL='postgresql://…?sslmode=verify-full' \
  npm run db:migrate:staging -- --confirm
```

`scripts/migrate-postgres.mjs` refuses loopback URLs, any URL option other than a single `sslmode=verify-full`, and a missing `--confirm`; it creates `wp16_staging` and applies migrations 3–30 under `MIGRATION_LOCK`. `/api/ready` must then report schema 30. This is owner-run, never CI, and must not run concurrently with another migration. It initializes staging; it is not the legacy-data production importer.

`server/migrate.ts` separately restricts its import CLI to test mode, loopback and an isolated schema. Its `--freeze-writes` holds the SQLite lock only while taking the snapshot, releasing it before import. Production needs a reviewed importer and a continuously enforced freeze of every SQLite writer.

**Cutover boundary:** schema creation and controlled import write PostgreSQL, but do not by themselves make it authoritative. Returning to SQLite is allowed only while SQLite is still authoritative, continuously frozen, and compatible with the prior image, with no new authoritative PostgreSQL writes. Once sign-in/session creation, smoke tests, workers or other new business writes make PostgreSQL authoritative, freeze and recover forward there. Never restart a stale SQLite-backed container or re-import the old SQLite snapshot over that history. Image rollback must retain a compatible PostgreSQL backend/schema; backend reversal needs reconciled writes, two-vendor review and owner authorization. Prove the boundary in a staging readiness-failure drill after a new PostgreSQL write.

## Microsoft API references pinned by this template

- [Container Apps and managed environments](https://learn.microsoft.com/azure/templates/microsoft.app/2026-07-01/managedenvironments) and [Container Apps](https://learn.microsoft.com/azure/templates/microsoft.app/2024-03-01/containerapps).
- [PostgreSQL Flexible Server 2024-08-01](https://learn.microsoft.com/azure/templates/microsoft.dbforpostgresql/2024-08-01/flexibleservers), [PostgreSQL extensions and allowlisting](https://learn.microsoft.com/azure/postgresql/extensions/how-to-create-extensions), and [private VNet networking](https://learn.microsoft.com/azure/postgresql/network/how-to-networking).
- [Storage account 2026-06-01](https://learn.microsoft.com/azure/templates/microsoft.storage/2026-06-01/storageaccounts) and [Container Apps Azure Files mount with managed identity](https://learn.microsoft.com/azure/container-apps/storage-mounts-azure-files).
- [Private endpoint and storage DNS configuration](https://learn.microsoft.com/azure/storage/common/storage-private-endpoints), [Web PubSub 2024-03-01](https://learn.microsoft.com/azure/templates/microsoft.signalrservice/2024-03-01/webpubsub), and [Key Vault 2023-07-01](https://learn.microsoft.com/azure/templates/microsoft.keyvault/2023-07-01/vaults).
- [Container Apps liveness/readiness probes](https://learn.microsoft.com/azure/container-apps/health-probes). API liveness is `/api/health`; readiness is `/api/ready` for essential DB/migration state.
