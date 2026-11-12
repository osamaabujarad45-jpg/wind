# Restore and database recovery

PostgreSQL Flexible Server point-in-time restore and Blob recovery are infrastructure capabilities, not restore evidence. Before paid launch, operators must perform and record a fresh restore into a separate, isolated resource group and verify application-level reconciliation, PostGIS extension availability, counts, money balances/open obligations, active custody, returns, events/outbox, evidence references, timestamps and Arabic text. Record source backup window, restore point, operator, elapsed RTO, observed data-loss interval/RPO and application revision. No real restore was run by this preparation task.

1. Declare incident and freeze new writes/dispatch through the approved application control; keep custody and finance access staffed.
2. Select a restore point from the incident timeline and create a separate server using the documented Azure PostgreSQL restore procedure: <https://learn.microsoft.com/azure/postgresql/backup-restore/how-to-restore-server-portal>.
3. Keep ingress closed. Verify TLS, private DNS/network path, PostGIS required extensions, schema/migration state, and least-privilege operator access.
4. Run reviewed, read-only reconciliation against the restored server and compare domain counts, balanced ledgers, active assignments/custody, returns, idempotency, event/outbox continuity, and Blob object references. Never use SQLite re-import to repair a PostgreSQL server that accepted newer authoritative writes.
5. Test API/worker behavior against the restored copy without real provider calls. Verify no fallback to stale SQLite.
6. Obtain owner approval for a controlled recovery cutover. Preserve the source server read-only for investigation under the approved retention policy.

## Import rehearsal (T34) and the pre-T28 refund carry-forward

The repository rehearses the SQLite→PostgreSQL import continuously: `tests/pg-import.mjs` takes a consistent SQLite snapshot, imports it into an isolated PostgreSQL schema (`server/migrate.ts`), reconciles counts, money totals, open custody and rounding exceptions exactly, then proves `pg_dump`/`pg_restore` restore plus API parity over HTTP; `tests/pg-migration-lock.mjs` proves the migration CLI waits through a concurrent advisory lock and stays retry-safe. A real rehearsal adds the authorized live snapshot and the operator record above — the automated rehearsal alone is not cutover approval.

The rehearsal has these cutover and payment-reconciliation duties (T28/T50 carry-forward):

- **Pre-T28 `rejected` refund rows are not retro-reserved.** Any refund row written `rejected` under the old contract must be reconciled against the provider's own statements before the payments capability is enabled on the imported data; the provider, not the legacy row, decides whether that money moved.
- **Continuously freeze all SQLite writers through final import and switch.** The CLI's `--freeze-writes` releases its lock after snapshot creation, before import; it cannot provide this operational freeze. The current importer is test-only and loopback-only, so a reviewed production importer is still required.
- **Rollback after new authoritative PostgreSQL writes never points back at stale SQLite.** Controlled schema/import setup is distinct from new authoritative writes, including sessions, smoke tests and workers. Before that boundary, return to SQLite only if it remains authoritative, continuously frozen and image/schema compatible. After it, recover forward through PostgreSQL backups and reconciliation; never re-promote or re-import stale SQLite. `runtimePersistence` does not automatically fail over a configured PostgreSQL connection, but today's deploy script can restart the old SQLite container with its old environment. Backend-aware rollback and a post-write readiness-failure drill must close that gap before cutover.

## Production host (SQLite), what runs today

`infra/vm/wind-backup.sh` runs nightly at 03:10 UTC: `VACUUM INTO` a consistent copy, integrity check, gzip, upload to the private, versioned S3 bucket `wind-backups-083712835043` (the host role may only add objects), then touch `/srv/wind-data/backups/last-ok`. 14 days stay on the VM. So at most about a day of orders can be lost until the owner sets a stricter objective. If `last-ok` is over 26 hours old the API pushes one alert a day to admins and the dashboard says so until a backup succeeds.

The 10 November read-only inventory confirmed all four installed scripts match `infra/vm/`, including the backup integrity/`last-ok` behavior. Update installed scripts alongside future reviewed changes; an old backup script could otherwise cause false stale-backup alerts. The latest inspected Blob copy was `wind-20261110T031001Z.db.gz` (10,320 bytes). This is backup evidence, not a fresh restore drill.

To restore, on the VM or a replacement. If any account was blocked or deleted since the copy, run `sudo docker stop caddy` first, because a blocked person could otherwise sign in as soon as the API is up:

```sh
sudo /srv/wind-restore.sh /srv/wind-data/backups/wind-<stamp>.db.gz
```

Use the script, not a hand-typed pipe: `gunzip | tee wind.db` empties the live database when the file is missing, and the API opens an empty file as a new one. It checks the copy before touching anything, keeps the old database as `wind.db.before-restore-<time>`, and puts it back if the swap or the start fails.

**After a restore everyone signs in again,** and closed-app alerts stop until each person does. This is deliberate: a session revoked after the copy was taken must not come back. Orders since the copy are not recovered, and neither are blocks or deletions. With Caddy stopped, reach the API through a Session Manager port forward (`aws ssm start-session --target <instance> --document-name AWS-StartPortForwardingSession --parameters portNumber=4000,localPortNumber=4000`, needs the Session Manager plugin) to re-apply them from the incident timeline, then `sudo docker start caddy`. Then sign in as an admin and open a recent order. `tests/backup.test.mjs` runs the data path on a synthetic database.

**If the host itself is lost:** the copies on its disk are gone too, so take the newest from S3. The host role can only write there, so a compromised host cannot read or delete old copies, and versioning keeps every overwrite. From the owner's PC (`aws login --profile wind`):

```sh
aws s3 ls s3://wind-backups-083712835043/ --profile wind
aws s3 cp s3://wind-backups-083712835043/wind-<stamp>.db.gz . --profile wind
```

Then create a host from `infra/aws/wind.yaml` (or a new instance with the same role) and copy the file to it, for example through a presigned URL that the host fetches over Session Manager. These are not in any backup and must be recreated: `/srv/wind-api.env` (`DB_PATH WIND_IDENTITY_MODE NODE_ENV WEB_ROOT TZ WIND_ENABLED_SERVICES HOST PORT SUPPORT_CONTACT OSRM_URL WIND_TRUST_PROXY WIND_PUSH_SUBJECT WIND_EXPO_PUSH_ENABLED`, values in `docs/operations/deploy.md` and `.env.example`, plus the secrets `WIND_FIREBASE_API_KEY` and `WIND_FIREBASE_SERVICE_ACCOUNT`: read the restricted key from Google Cloud and make a new service-account key rather than looking for a copy), `/srv/Caddyfile` and `/etc/cron.d/wind` (both in `infra/vm/`). The OSRM graph at `/srv/osrm` is rebuilt with `infra/osrm/build-west-bank.sh`, not restored. `deploy.sh` and `wind-restore.sh` both expect a `wind-api` container, so on a new host first start one by hand with the `docker run` line from `infra/vm/deploy.sh`. **Ran end to end on 12 November 2026** when production moved from Azure to AWS: see `docs/operations/aws-migration-study.md`.

The four-hourly copies on the owner's PC (`scripts/backup-azure.ps1`) are a second source, encrypted to that Windows account. They came from the Azure VM over SSH and stopped when it did (newest: 11 November 06:54 UTC); `-VerifyLatest` needs that VM. To unwrap one offline:

```powershell
$j = [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes('<file>.dpapi'), $null, 'CurrentUser')) | ConvertFrom-Json
[IO.File]::WriteAllBytes("$PWD\wind.db", [Convert]::FromBase64String($j.data)); (Get-FileHash wind.db -Algorithm SHA256).Hash -ieq $j.sha256  # True. Delete wind.db when done
```

**Restore drill, 6 November 2026:** the newest nightly copy (`wind-20261106T031001Z.db.gz`) was byte-identical on the VM and in Blob. `wind-restore.sh` ran against a throwaway container and data folder, with the production image and `/srv/wind-api.env`, while `wind-api` kept running: a missing file and a non-database file each stopped it with the container up and the data untouched, a failed start and a failed readiness check each put the old database back and restarted it, and the real copy was restored and ready in 12 seconds with no sessions left. Production then held 2 users and no orders, so this proves the path and says nothing about a restore at real volume.

**Retention:** the S3 bucket has versioning and no expiry rule (the old Azure Blob had neither versioning nor soft delete), so copies stay forever, including the data of accounts deleted since. The privacy page says earlier backups may hold such data; an owner decision on how long is still open.

Recovery objectives are not set by this IaC. The operator must approve numeric RPO/RTO based on a timed fresh restore before production. Flexible Server backup retention is configured by environment; geo-redundant backup is disabled pending regional/data-location review. Blob redundancy/lifecycle, soft delete/versioning, quarantine scanning and evidence retention also require explicit policy/cost approval. No recovery is complete solely because Azure reports a backup or deployment succeeded.
