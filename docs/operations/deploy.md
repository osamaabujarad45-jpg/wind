# Azure deployment preparation

This is IaC preparation, not an authorization or a production readiness claim. The repository runtime still restricts PostgreSQL to `NODE_ENV=test`, `WIND_POSTGRES_TEST_ONLY=1`, and loopback. Cloud API/worker activation is therefore blocked. Templates default `enableWorkloads=false`; do not override it until root-reviewed runtime cutover, compatible migration, restore, concurrency, security, region/quota, cost, provider, and operating gates are evidenced. A successful Bicep build or what-if is not deployment approval.

## Local validation

Install the reviewed compiler from the official Bicep release at pinned version `0.48.1`, then run:

```powershell
az bicep install --version v0.48.1
node scripts/check-azure.mjs
node tests/azure-infra.test.mjs
```

The validation script compiles/lints the template and builds all three parameter examples with a fixed compile-only placeholder. It does not read operator secrets. The test checks compiled ingress/probe ports against the packaged API, the polling worker's minimum replica, and the separate graph-storage foundation. It has no deployment command, Azure login, or authenticated provider call.

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

Keep `enableWorkloads=false` until the PostgreSQL test-only runtime gate has been removed through an independently reviewed, tested migration, one-writer cutover. API liveness is `/api/health`; readiness is `/api/ready` for essential DB/migration state only. Do not make DB health depend on SMS, push, or routing provider availability. API max replicas stays one until WP10 approves scaling. Worker has no HTTP health probe and uses `server/worker.ts` only after root verifies the packaged entrypoint. OSRM graph must be versioned, durable, capacity-sized and priced; no ephemeral graph is acceptable.

Current local persistence evidence used PostgreSQL 18; this template selects Flexible Server PostgreSQL 16. Treat major-version and PostGIS compatibility as an explicit migration/driver test gate. Verify schema import, extensions, locks, transaction behavior, query semantics and restore against the selected Azure major version before enabling workloads. Local PostgreSQL 18 success does not establish PostgreSQL 16 compatibility.

Graph storage, identity mount and private connectivity belong to the foundation, so an authorized operator can populate and verify the graph while applications remain disabled. Upload the complete reviewed graph from an approved host with private connectivity and named file-write permission. Record extract timestamp/checksum, profile/version, build image digest, generated-file checksums and route-corpus results. Verify the mounted region.osrm and companion files against that manifest. A volume at /data hides files baked into the image; an empty share is never a valid graph. Actual SMB identity preview availability, RBAC propagation, region support, permissions and graph startup remain staging checks. Never use complete deployment mode to erase retained resources.

API ingress and probes explicitly use port4000, matching the packaged runtime, with HOST0.0.0.0. API and database-polling worker each retain one replica when enabled; a worker without an event scaler must not scale to zero. Neither application receives a fabricated database DSN, provider secret or cloud test bypass. Runtime Key Vault bindings, registry pulls and accepted PostgreSQL cutover remain necessary before application activation.

Deploy migration once under the database advisory lock. Validate restored fresh infrastructure before accepting live writes. If rollback follows PostgreSQL writes, do not point at stale SQLite: close writes and repair forward or use an independently tested reconciliation. Never delete custody, money, event, evidence, or outbox history to make rollback easier.

## Microsoft API references pinned by this template

- [Container Apps and managed environments](https://learn.microsoft.com/azure/templates/microsoft.app/2026-07-01/managedenvironments) and [Container Apps](https://learn.microsoft.com/azure/templates/microsoft.app/2024-03-01/containerapps).
- [PostgreSQL Flexible Server 2024-08-01](https://learn.microsoft.com/azure/templates/microsoft.dbforpostgresql/2024-08-01/flexibleservers), [PostgreSQL extensions and allowlisting](https://learn.microsoft.com/azure/postgresql/extensions/how-to-create-extensions), and [private VNet networking](https://learn.microsoft.com/azure/postgresql/network/how-to-networking).
- [Storage account 2026-06-01](https://learn.microsoft.com/azure/templates/microsoft.storage/2026-06-01/storageaccounts) and [Container Apps Azure Files mount with managed identity](https://learn.microsoft.com/azure/container-apps/storage-mounts-azure-files).
- [Private endpoint and storage DNS configuration](https://learn.microsoft.com/azure/storage/common/storage-private-endpoints), [Web PubSub 2024-03-01](https://learn.microsoft.com/azure/templates/microsoft.signalrservice/2024-03-01/webpubsub), and [Key Vault 2023-07-01](https://learn.microsoft.com/azure/templates/microsoft.keyvault/2023-07-01/vaults).
- [Container Apps liveness/readiness probes](https://learn.microsoft.com/azure/container-apps/health-probes). API liveness is `/api/health`; readiness is `/api/ready` for essential DB/migration state.
