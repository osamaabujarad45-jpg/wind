# Restore and database recovery

PostgreSQL Flexible Server point-in-time restore and Blob recovery are infrastructure capabilities, not restore evidence. Before paid launch, operators must perform and record a fresh restore into a separate, isolated resource group and verify application-level reconciliation, PostGIS extension availability, counts, money balances/open obligations, active custody, returns, events/outbox, evidence references, timestamps and Arabic text. Record source backup window, restore point, operator, elapsed RTO, observed data-loss interval/RPO and application revision. No real restore was run by this preparation task.

1. Declare incident and freeze new writes/dispatch through the approved application control; keep custody and finance access staffed.
2. Select a restore point from the incident timeline and create a separate server using the documented Azure PostgreSQL restore procedure: <https://learn.microsoft.com/azure/postgresql/backup-restore/how-to-restore-server-portal>.
3. Keep ingress closed. Verify TLS, private DNS/network path, PostGIS required extensions, schema/migration state, and least-privilege operator access.
   Before starting the restored API, [prepare the provider journal](#prepare-the-provider-journal) and verify the effective Firebase link switches are off.
4. Run reviewed, read-only reconciliation against the restored server and compare domain counts, balanced ledgers, active assignments/custody, returns, idempotency, event/outbox continuity, and Blob object references. Never use SQLite re-import to repair a PostgreSQL server that accepted newer authoritative writes.
5. Keep ingress closed. For an older staging restore point, apply the current migrations through version 45 to the isolated target with the candidate's [staging migration command](deploy.md#rollout-and-rollback-gates). Connect `psql` to that restored target with `-X -v ON_ERROR_STOP=1`. The current staging runtime uses `wp16_staging`. Use the approved runtime schema for any other target. Run the transaction and post-commit verification below. The API retains the cleanup journal and the original recipient key.

   ```sql
   BEGIN;
   SET LOCAL search_path TO wp16_staging, pg_catalog;
   DELETE FROM sessions;
   DELETE FROM push_subscriptions;
   DELETE FROM native_push_tokens;
   DELETE FROM email_codes;
   DELETE FROM firebase_resets;
   UPDATE firebase_email_attempts SET state = 'retired',
     cleanup_at = CASE WHEN state IN ('ready', 'queued') THEN 0 ELSE cleanup_at END,
     retry_until = CASE WHEN state = 'queued' THEN 0 ELSE retry_until END
     WHERE state IN ('ready', 'queued', 'sending');
   COMMIT;
   SELECT
     (SELECT count(*) FROM wp16_staging.sessions) AS sessions,
     (SELECT count(*) FROM wp16_staging.push_subscriptions) AS web_push,
     (SELECT count(*) FROM wp16_staging.native_push_tokens) AS native_push,
     (SELECT count(*) FROM wp16_staging.email_codes) AS email_codes,
     (SELECT count(*) FROM wp16_staging.firebase_resets) AS legacy_resets,
     (SELECT count(*) FROM wp16_staging.firebase_email_attempts
       WHERE state IN ('ready', 'queued', 'sending')) AS active_email_attempts;
   ```

   Require all six counts to be zero. Complete [email reconciliation](#reconcile-restored-recovery-email). Test API and worker behavior against the restored copy with provider calls disabled. Require `/api/ready` to report PostgreSQL and schema 45 or later.
6. Obtain owner approval for a controlled recovery cutover. Preserve the source server read-only for investigation under the approved retention policy.

## Reconcile restored recovery email

1. Keep ingress closed and both Firebase link switches off. Compare the restored account addresses and proofs with the last authoritative database and incident timeline. Apply confirmed address and proof changes in one transaction. For each binding that cannot be confirmed, clear `users.email_verified_at` and delete the `recovery_email_proofs` row for that account in the same transaction. Then ask that customer to verify the address again. On a snapshot without the proof table, apply the timestamp change before restoring access and keep email recovery disabled until migration and verification are complete.
2. Compare the restored journal with the handoff captured before the swap. Verify ownership-checked cleanup outcomes for newer provider work or confirm an assigned operator has the remaining records. Keep both Firebase link switches off until provider reconciliation finishes.
3. On PostgreSQL and both SQLite hosts, read back the committed changes on the restored database before reopening ingress. Using the same set of unconfirmed account IDs, require zero rows in `users` with `email_verified_at IS NOT NULL` and zero rows in `recovery_email_proofs` for those IDs. On a legacy SQLite copy, confirm the timestamp check and whether the proof table is absent. Record both results in the incident log and keep ingress closed if either required check fails.

## Prepare the provider journal

1. Close ingress, disable Firebase email issuance and drain in-flight provider work before taking the last authoritative journal copy. Unset `WIND_FIREBASE_EMAIL_LINKS` and `WIND_FIREBASE_RESET_LINKS` before starting a restored API. Check service overrides as well as the environment file. For Docker, verify the existing container's stored environment. Recreate a container that still enables either link switch before using the restore script.
2. Before the swap, compare the last authoritative journal with the snapshot. Include new UIDs and any later state or retry changes to shared UIDs, especially uncertain account creates. Verify cleanup using the original project and ownership claim or record a durable, access-restricted handoff with an assigned operator. Preserve project ID, UID, ownership claim, current state, cleanup time and `retry_until` without copying mailbox addresses. Apply this gate before discarding original provider credentials during a rollback as well.
3. If the displaced database is unavailable, reconcile against an authoritative inventory in the original provider project. Keep both switches off pending reconciliation when the inventory is unavailable. Preserve the remaining incident evidence for the operator.

## Check the SQLite runtime before restore

Complete [provider journal preparation](#prepare-the-provider-journal) and keep ingress closed. Confirm the revision that will actually start. On Israel Central, match the selected release directory with the deployment record and verify `/opt/windapi` points to it before starting the API. On Docker, inspect the image ID of the existing `wind-api` container, or inspect the selected image by digest before creating a replacement. Match its digest and `org.opencontainers.image.revision` label with the deployment record. Editing an environment file leaves the stored settings of an existing container unchanged.

Verify both Firebase link switches are off. If the selected API predates verified-email proofs, apply the [legacy email rollback checks](deploy.md#email-checks-before-rolling-back-to-an-older-release) to its effective settings and to the database it could open. This includes removing both Firebase Auth credentials and checking legacy Cloudflare recovery. Verify the current process too if a failed restore could leave it serving. Keep ingress closed while a revision or its settings remain unverified.

## Assemble a snapshot after an interrupted Israel restore

Keep the ingress hold in place. If `/etc/wind-db-swap` is present, leave it in place while assembling the snapshot. The API and backup service both refuse to start while it exists. Stop `wind-api`, `wind-backup.timer` and `wind-backup.service` and verify they are stopped before examining the files. Preserve the originals. Read `/etc/wind-ingress-hold` for the `displaced database` and `failed replacement` paths for each attempt, newest first. Use the incident record to trace the moves in order. Each swap renames the original main database, then its `-wal` and `-shm`, before installing the replacement. Rollback moves the failed main database and its sidecars aside before moving the old files back in the same order.

- In a single attempt, a WAL that moved with the displaced main file shares its `wind.db.before-restore-<attempt>` basename. Before the replacement reaches the live path, the original WAL may still be at `/data/wind.db-wal`. A WAL written after the replacement starts belongs to the replacement and moves to `wind.db.restore-failed-<attempt>-wal` during rollback.
- If rollback returned the original main file to `/data/wind.db` before its WAL, the matching WAL remains at that attempt's `displaced database` path plus `-wal`. A retry can then park the same main file under its own `displaced database` path. In that case pair the main file from the retry with the WAL from the earlier attempt. Inspect the live basename and all recorded paths for a matching WAL before treating any main file as self-contained. If the pairing cannot be confirmed, keep ingress closed and preserve the files for recovery. A main file can pass integrity checks while committed entries are still in its WAL.

Set `matched_db` and, when present, `matched_wal` to those confirmed paths. Copy the pair into a private directory as `wind`. SQLite rebuilds `-shm` from the copied WAL. Run the steps below on the copy with the source still stopped.

```bash
work=$(sudo -u wind mktemp -d /data/restore-recovery.XXXXXX) || exit 1
sudo -u wind cp -- "$matched_db" "$work/source.db" || exit 1
if [ -n "${matched_wal:-}" ]; then
  sudo -u wind cp -- "$matched_wal" "$work/source.db-wal" || exit 1
fi
sudo -u wind /opt/node/bin/node --disable-warning=ExperimentalWarning --input-type=module - "$work" <<'NODE'
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const work = process.argv[2];
const snapshot = join(work, 'recovered.db');
const source = new DatabaseSync(join(work, 'source.db'), { readOnly: true });
source.prepare('VACUUM INTO ?').run(snapshot);
source.close();
const copy = new DatabaseSync(snapshot, { readOnly: true });
if (copy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || copy.prepare('PRAGMA foreign_key_check').all().length) {
  throw Error('recovered snapshot failed its integrity checks');
}
for (const table of ['users', 'orders', 'cash_entries']) copy.prepare('SELECT 1 FROM ' + table + ' LIMIT 1').get();
copy.close();
console.log(snapshot);
NODE
```

When the command succeeds, check the recovered orders and email changes against the incident record. Complete the [SQLite runtime checks](#check-the-sqlite-runtime-before-restore) for that snapshot. Pass the verified `recovered.db` to the reviewed restore script without `--open`. It clears the swap marker after the verified snapshot is in place and synced. Finish [email reconciliation and read-back](#reconcile-restored-recovery-email), start `wind-backup.timer` if needed and verify its next scheduled run before removing the ingress hold.

## Import rehearsal (T34) and the pre-T28 refund carry-forward

The repository rehearses the SQLite→PostgreSQL import continuously: `tests/pg-import.mjs` takes a consistent SQLite snapshot, imports it into an isolated PostgreSQL schema (`server/migrate.ts`), reconciles counts, money totals, open custody and rounding exceptions exactly, then proves `pg_dump`/`pg_restore` restore plus API parity over HTTP; `tests/pg-migration-lock.mjs` proves the migration CLI waits through a concurrent advisory lock and stays retry-safe. A real rehearsal adds the authorized live snapshot and the operator record above — the automated rehearsal alone is not cutover approval.

The rehearsal has these cutover and payment-reconciliation duties (T28/T50 carry-forward):

- **Pre-T28 `rejected` refund rows are not retro-reserved.** Any refund row written `rejected` under the old contract must be reconciled against the provider's own statements before the payments capability is enabled on the imported data; the provider, not the legacy row, decides whether that money moved.
- **Continuously freeze all SQLite writers through final import and switch.** The CLI's `--freeze-writes` releases its lock after snapshot creation, before import; it cannot provide this operational freeze. The current importer is test-only and loopback-only, so a reviewed production importer is still required.
- **Rollback after new authoritative PostgreSQL writes never points back at stale SQLite.** Controlled schema/import setup is distinct from new authoritative writes, including sessions, smoke tests and workers. Before that boundary, return to SQLite only if it remains authoritative, continuously frozen and image/schema compatible. After it, recover forward through PostgreSQL backups and reconciliation; never re-promote or re-import stale SQLite. `runtimePersistence` does not automatically fail over a configured PostgreSQL connection, but today's deploy script can restart the old SQLite container with its old environment. Backend-aware rollback and a post-write readiness-failure drill must close that gap before cutover.

## SQLite Docker host restore

`infra/vm/wind-backup.sh` runs nightly at 03:10 UTC: `VACUUM INTO` a consistent copy, integrity check, gzip, upload to the private, versioned Blob container `windpsbackup/wind-backups` (30-day soft delete; the VM identity holds a role on that container only), then touch `/srv/wind-data/backups/last-ok`. 14 days stay on the VM. So at most about a day of orders can be lost until the owner sets a stricter objective. If `last-ok` is over 26 hours old the API pushes one alert a day to admins and the dashboard says so until a backup succeeds.

The 10 November read-only inventory confirmed all four installed scripts match `infra/vm/`, including the backup integrity/`last-ok` behavior. Update installed scripts alongside future reviewed changes; an old backup script could otherwise cause false stale-backup alerts. The latest inspected Blob copy was `wind-20261110T031001Z.db.gz` (10,320 bytes). This is backup evidence, not a fresh restore drill.

Run `sudo docker stop caddy` on the Docker host or its replacement before restoring. Complete the [SQLite runtime checks](#check-the-sqlite-runtime-before-restore) for the existing `wind-api` container before running the reviewed restore script. Keep ingress closed while reconciling later account changes.

```sh
sudo /srv/wind-restore.sh /srv/wind-data/backups/wind-<stamp>.db.gz
```

Use the script, not a hand-typed pipe: `gunzip | tee wind.db` empties the live database when the file is missing, and the API opens an empty file as a new one. It checks the copy before touching anything, keeps the old database as `wind.db.before-restore-<time>`, and puts it back if the swap or the start fails.

**After a restore everyone signs in again,** and closed-app alerts resume when they do. Any pending numeric email code needs to be requested again. With Caddy stopped, reach the API through an SSH port forward (`ssh -i ~/.ssh/wind-azure -L 4000:127.0.0.1:4000 windadmin@windapp-ps.swedencentral.cloudapp.azure.com`, after admitting your address in the NSG rule `ssh-setup`). Reapply later blocks, deletions, demotions and password resets from the incident timeline. Complete [email reconciliation](#reconcile-restored-recovery-email), then run `sudo docker start caddy`. Sign in as an admin and open a recent order. `tests/backup.test.mjs` runs the data path on a synthetic database.

**If the host itself is lost:** the copies on its disk are gone too, so take the newest from Blob storage. Versioning and 30-day soft delete keep every overwritten or deleted copy. From the owner's PC (`az login`; the account needs Storage Blob Data Reader on the container):

```sh
az storage blob list --account-name windpsbackup -c wind-backups --auth-mode login --query "[].name" -o tsv
az storage blob download --account-name windpsbackup -c wind-backups --auth-mode login -n wind-<stamp>.db.gz -f wind-<stamp>.db.gz
```

Then create a VM as in `docs/operations/deploy.md` and retain the public IP `wind-ip` used by installed APKs. Give the VM identity the same two roles and copy over the backup. Recreate `/srv/wind-api.env` with the documented runtime settings (`DB_PATH WIND_IDENTITY_MODE NODE_ENV WEB_ROOT TZ WIND_ENABLED_SERVICES HOST PORT SUPPORT_CONTACT OSRM_URL WIND_TRUST_PROXY WIND_PUSH_SUBJECT WIND_EXPO_PUSH_ENABLED`), `/srv/Caddyfile`, `/etc/cron.d/wind` and the five reviewed `/srv/*.sh` scripts from `infra/vm/`. Rebuild the OSRM graph with `infra/osrm/build-west-bank.sh /srv/west-bank.geojson /srv/osrm-new`, check its `BUILD-MANIFEST` route lines, then point the `wind-osrm` container at the new directory.

Keep Caddy stopped. Choose a reviewed API revision by its recorded image digest and complete the [SQLite runtime checks](#check-the-sqlite-runtime-before-restore) for that revision before starting the empty bootstrap container. Use that digest with the `docker run` invocation in `infra/vm/deploy.sh` to create the `wind-api` container. Verify its stored settings again before restoring. For a revision with verified-email proofs, recover the original Firebase Auth credentials from the private store if needed for journal cleanup, with both link switches off. An older revision starts with the legacy email rollback settings, including both Firebase Auth credentials removed.

The host replacement drills ran on 12 November 2026 (Azure to AWS) and 15 November 2026 (AWS to Azure). [Drill record](aws-migration-study.md)

Recover the original `WIND_FIREBASE_RECIPIENT_KEY` from the operator's private deployment secret store. If it cannot be recovered, leave `WIND_FIREBASE_EMAIL_LINKS` and `WIND_FIREBASE_RESET_LINKS` off until the old provider journal has been reconciled. The restored journal supports ownership-checked cleanup while sends are disabled.

The four-hourly copies on the owner's PC (`scripts/backup-azure.ps1`) are a second source, encrypted to that Windows account. They came from the Azure VM over SSH and stopped when it did (newest: 11 November 06:54 UTC); `-VerifyLatest` needs that VM. To unwrap one offline:

```powershell
$j = [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes('<file>.dpapi'), $null, 'CurrentUser')) | ConvertFrom-Json
[IO.File]::WriteAllBytes("$PWD\wind.db", [Convert]::FromBase64String($j.data)); (Get-FileHash wind.db -Algorithm SHA256).Hash -ieq $j.sha256  # True. Delete wind.db when done
```

**Restore drill, 6 November 2026:** the newest nightly copy (`wind-20261106T031001Z.db.gz`) was byte-identical on the VM and in Blob. `wind-restore.sh` ran against a throwaway container and data folder, with the production image and `/srv/wind-api.env`, while `wind-api` kept running: a missing file and a non-database file each stopped it with the container up and the data untouched, a failed start and a failed readiness check each put the old database back and restarted it, and the real copy was restored and ready in 12 seconds with no sessions left. Production then held 2 users and no orders, so this proves the path and says nothing about a restore at real volume.

**Retention:** the Blob container has versioning, 30-day soft delete and no expiry rule, so copies stay forever, including the data of accounts deleted since. The privacy page says earlier backups may hold such data; an owner decision on how long is still open.

Recovery objectives are not set by this IaC. The operator must approve numeric RPO/RTO based on a timed fresh restore before production. Flexible Server backup retention is configured by environment; geo-redundant backup is disabled pending regional/data-location review. Blob redundancy/lifecycle, soft delete/versioning, quarantine scanning and evidence retention also require explicit policy/cost approval. No recovery is complete solely because Azure reports a backup or deployment succeeded.
