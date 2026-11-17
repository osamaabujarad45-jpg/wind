# Restore and database recovery

PostgreSQL Flexible Server point-in-time restore and Blob recovery are infrastructure capabilities, not restore evidence. Before paid launch, operators must perform and record a fresh restore into a separate, isolated resource group and verify application-level reconciliation, PostGIS extension availability, counts, money balances/open obligations, active custody, returns, events/outbox, evidence references, timestamps and Arabic text. Record source backup window, restore point, operator, elapsed RTO, observed data-loss interval/RPO and application revision. No real restore was run by this preparation task.

1. Declare incident and freeze new writes/dispatch through the approved application control; keep custody and finance access staffed.
2. Select a restore point from the incident timeline and create a separate server using the documented Azure PostgreSQL restore procedure: <https://learn.microsoft.com/azure/postgresql/backup-restore/how-to-restore-server-portal>.
3. Keep ingress closed. Verify TLS, private DNS/network path, PostGIS required extensions, schema/migration state, and least-privilege operator access.
4. Run the repository's reviewed reconciliation/import checks against the restored server and compare domain counts, balanced ledgers, active assignments/custody, returns, idempotency, event/outbox continuity, and Blob object references.
5. Test API/worker behavior against the restored copy without real provider calls. Verify no fallback to stale SQLite.
6. Obtain owner approval for a controlled recovery cutover. Preserve the source server read-only for investigation under the approved retention policy.

## Import rehearsal (T34) and the pre-T28 refund carry-forward

The repository rehearses the SQLite→PostgreSQL import continuously: `tests/pg-import.mjs` takes a consistent SQLite snapshot, imports it into an isolated PostgreSQL schema (`server/migrate.ts`), reconciles counts, money totals, open custody and rounding exceptions exactly, then proves `pg_dump`/`pg_restore` restore plus API parity over HTTP; `tests/pg-migration-lock.mjs` proves the migration CLI waits through a concurrent advisory lock and stays retry-safe. A real rehearsal adds the authorized live snapshot and the operator record above — the automated rehearsal alone is not cutover approval.

Two reconciliation duties belong to the rehearsal before the payments gate opens (T28/T50 carry-forward):

- **Pre-T28 `rejected` refund rows are not retro-reserved.** Any refund row written `rejected` under the old contract must be reconciled against the provider's own statements before the payments capability is enabled on the imported data; the provider, not the legacy row, decides whether that money moved.
- **Rollback after new PostgreSQL writes never points back at stale SQLite.** Once the API writes to PostgreSQL, the SQLite file is an archival copy only: recovery follows step 2-6 against PostgreSQL backups, and the imported SQLite snapshot is never re-promoted (the runtime has no production SQLite fallback branch).

Recovery objectives are not set by this IaC. The operator must approve numeric RPO/RTO based on a timed fresh restore before production. Flexible Server backup retention is configured by environment; geo-redundant backup is disabled pending regional/data-location review. Blob redundancy/lifecycle, soft delete/versioning, quarantine scanning and evidence retention also require explicit policy/cost approval. No recovery is complete solely because Azure reports a backup or deployment succeeded.

## Current production: SQLite on the Azure VM (T46)

Production today is one SQLite file on the VM volume (`DB_PATH`), copied by `scripts/backup-azure.ps1` over SSH. Each run takes an online snapshot, checks `integrity_check`/foreign keys/counts inside the container, restores it into a throwaway file there and checks it again before keeping it. Three gaps are closed in the repository; each needs a reviewed install step before it protects production.

**1. Missed backups alert without the workstation.** After a verified fresh backup the script writes `backup-verified.json` beside the live database. The API checks it hourly (`checkBackupFreshness`): a missing, unreadable or older-than-`WIND_BACKUP_MAX_AGE_HOURS` marker logs `backup_stale` and sends one `attention` push to active admins per lapse; the next fresh marker re-arms it. It is off until `WIND_BACKUP_MAX_AGE_HOURS` is set on the API, so it alerts even when the backup workstation is off or gone. Proposed value: `8` (two missed four-hour runs). Install step: set the variable at the next approved deploy.

**2. Recovery does not need the original Windows account.** The DPAPI copy opens only inside the account that made it. With a recovery key installed, every run also writes a copy sealed to the owner's offline RSA-4096 key (`.sealed`, AES-256-GCM, `scripts/backup-seal.mjs`) into `%OneDrive%\WindBackups`, off this machine. One-time owner setup on a trusted machine:

```powershell
$env:WIND_BACKUP_PASSPHRASE = Read-Host 'Recovery passphrase (12+ characters)' -MaskInput
node scripts/backup-seal.mjs keygen <empty-folder>
Remove-Item Env:WIND_BACKUP_PASSPHRASE
```

Copy `backup-public.pem` to `%LOCALAPPDATA%\SouqWindPrivate\backup-public.pem`. Keep `backup-private.pem` and the passphrase offline and apart (for example the private key on removable media in a safe, the passphrase in the owner's password manager); never in the repository, OneDrive or this workstation. Recovery on any machine with Node 24: set `WIND_BACKUP_PASSPHRASE`, run `node scripts/backup-seal.mjs open backup-private.pem <file>.sealed > snapshot.json`, then decode `data` (base64) into the `.db` file and check its `sha256`.

**3. A restore proves an isolated business journey.** `node scripts/check-restore.mjs <restored.db>` copies the file, checks integrity and foreign keys, deletes every push-target and outbox row from the copy (quarantine: a restored copy must never notify real customers or drivers), starts the API on the copy with every provider credential removed from its environment, and runs a synthetic register, book, cancel and read-back. It then checks integrity and counts again. The restored file itself is only read.

**Objectives (proposed, owner to approve after a timed restore):** RPO 4 hours (the backup cadence; a lapse alerts at 8). RTO 2 hours from incident declaration to a verified copy serving traffic: open the sealed copy, run `check-restore.mjs`, then copy it to the volume and restart the container. Record actual times on the first drill.

**Deletion replay.** A restore can bring back accounts deleted after the restore point. Before reopening, replay every account deletion recorded after that point from sources that survive the incident (support requests, the deletion confirmation mail, operator notes), and record which deletions were replayed. Quarantined provider rows are never resent; affected users are told directly if a notification was lost.
