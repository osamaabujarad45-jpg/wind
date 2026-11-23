# Azure recovery and deployment review

## Decision

Keep the existing Azure VM and SQLite as the production topology. Use Container Apps and PostgreSQL with private service networking for staging. Establish measurable recovery and alerting on the current topology before selecting a production data platform or adding replicas. A second writer would change the application’s consistency assumptions for bookings, custody, cash, and provider quotas.

## Azure Well-Architected reassessment

| Pillar | Finding | Change and remaining acceptance |
| --- | --- | --- |
| Reliability | One VM and disk serve the API and authoritative SQLite database. Previous restore evidence does not measure the current failure mode. | Install and restore verify that the API unit owns the loopback listener and uses the expected SQLite path. Legacy deployment refuses a proposed or running PostgreSQL backend. Run a timed, isolated replacement from a representative copy and record recovery point, elapsed time, custody and financial reconciliation, and stop/go criteria. |
| Security | The previous backup identity could delete copies. Staging secrets and public service endpoints need bounded access. | The live backup role grants only new blob creation. The upload script also refuses duplicate names. The Container Apps template requires staging with private service networking and references the ACS key in Key Vault. The staging API retains HTTPS ingress. The separate restore identity still needs a read and recovery drill. The staging API and worker share the database login. |
| Operational Excellence | An in-app backup warning is lost when the VM fails. | Azure Monitor tracks backup writes and probes public readiness independently of the VM. Both rules point to the production operator action group. Confirm email delivery and exercise alert recovery during an isolated drill. |
| Cost Optimization | A full billing cycle for the current Israel Central VM is still unavailable. | The `wind-prod` budget is USD 120 per month, with warnings at USD 96 actual and USD 120 actual or forecast. The VM's retail compute rate gives about USD 80 for 730 hours before disk, IP, storage and monitoring. Revisit the total after the first complete billing cycle. |
| Performance Efficiency | Load tests provide baseline evidence. Live p95, database waits, saturation, and cross-replica quotas remain open. | Keep the single writer, measure production demand and provider limits, and size any follow-on staging pilot from those results. Preserve stable origin compatibility for deployed clients during DNS migration. |

## Backup permission rollout

Use `infra/vm-israel/backup-access.bicep` against the resource group containing the existing backup storage account. Supply the existing storage account, container, and VM managed identity object ID. Use Azure deployment what-if first. The module creates a narrow role and grants it at the container. Azure permissions are additive. Deploying it alone leaves the old Contributor grant effective.

Prove the role first on a disposable container and test identity with no broader inherited storage permissions. A new upload must succeed. Overwriting an existing blob, reading it as the producer, and deleting it as the producer must fail. Restore with a separate reader. After that rehearsal, schedule the production change, confirm the narrow grant has propagated, and remove the specific higher grant. Review inherited assignments too. Run the scheduled backup as the VM identity and confirm the remote copy and its timestamp with the restore identity. Keep the previous effective grant details as the rollback reference.

The upload’s conditional header protects a duplicate name and leaves the freshness marker untouched on failure. The scope of the live RBAC change, protection of independent copies, and retention or immutability settings require their own verification.

On 22 November 2026, a disposable Azure container returned HTTP 201 for creation and HTTP 403 for overwrite, read, and delete with the VM identity. Production now has the create-only grant on the backup container. The prior Contributor assignment was removed, and the effective grant was verified including inherited roles. The production backup service succeeded at 20:59 UTC. The disposable container and its role assignment were removed.

## Independent backup alert

Use `infra/vm-israel/backup-monitor.bicep` with an existing protected Log Analytics workspace and Azure Monitor action group. Review what-if, diagnostic settings quotas, retention, existing storage log routing, and cost. Confirm the action group reaches the primary and backup operators.

1. Apply the diagnostic setting with `enableBackupAlert=false`. Wait until the workspace shows a successful HTTP 201 PutBlob event from the VM identity for the backup container.
2. Run the compiled query against that workspace. Confirm it returns a nonzero count for a healthy three-hour window and returns one row with zero during a controlled empty window.
3. Enable the rule and test notification and recovery on an isolated configuration. Record the actual time between missed writes and notification. Keep the independent public readiness probe for API outage coverage.

On 22 November 2026, production StorageBlobLogs recorded HTTP 201 writes by the VM identity. The successful-write count was two for the healthy window and zero for an empty window. The three-hour missing-backup rule now uses `wind-prod-operators`, with the subscription Owner role and the designated backup operator. The production HTTPS test in `infra/vm-israel/api-availability.bicep` probes `https://20.217.202.98.sslip.io/api/ready` from three locations every 15 minutes and alerts when two locations fail.

## API host name

`fastship-api.israelcentral.cloudapp.azure.com` is the Azure-managed alias for the existing static public IP. Both the alias and the original `sslip.io` address answer HTTPS readiness. Preserve the original address for installed clients while validating the alias with a new build. If the service will move between regions or cloud providers, an owned domain can provide a single name that follows it.

## Release evidence

Record the source revision, CI result, backup freshness and recovery point before production promotion. Use the current Azure VM release path in the deployment runbook. Keep `DB_PATH` in the provisioned systemd unit and remove database overrides from `/etc/wind-api.env` before using the SQLite installer or restore script. Before PostgreSQL becomes authoritative, exercise a failed-readiness recovery after one new authoritative write. Never re-open the previous SQLite copy after that boundary. Keep the existing client origin until supported installs have a verified way to reach the replacement.

[Microsoft Cloud Solution Architect skill](https://github.com/microsoft/skills/tree/main/.github/skills/cloud-solution-architect) · [Azure Well-Architected Framework](https://learn.microsoft.com/azure/well-architected/) · [Azure recovery guidance](https://learn.microsoft.com/azure/well-architected/reliability/disaster-recovery) · [Put Blob permissions](https://learn.microsoft.com/rest/api/storageservices/put-blob)
