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

## Production VM (SQLite), what runs today

`infra/vm/wind-backup.sh` runs nightly at 03:10 UTC: `VACUUM INTO` a consistent copy, integrity check, gzip, upload to private Azure Blob with a write-only SAS, then touch `/srv/wind-data/backups/last-ok`. 14 days stay on the VM. So at most about a day of orders can be lost until the owner sets a stricter objective. If `last-ok` is over 26 hours old the API pushes one alert a day to admins and the dashboard says so until a backup succeeds.

Update the script on the VM with any image that has this alert (`sudo cp infra/vm/wind-backup.sh /srv/wind-backup.sh`), or the dashboard reports a stale backup that is not stale.

To restore, on the VM or a replacement. If any account was blocked or deleted since the copy, run `sudo docker stop caddy` first, because a blocked person could otherwise sign in as soon as the API is up:

```sh
sudo /srv/wind-restore.sh /srv/wind-data/backups/wind-<stamp>.db.gz
```

Use the script, not a hand-typed pipe: `gunzip | tee wind.db` empties the live database when the file is missing, and the API opens an empty file as a new one. It checks the copy before touching anything, keeps the old database as `wind.db.before-restore-<time>`, and puts it back if the swap or the start fails.

**After a restore everyone signs in again,** and closed-app alerts stop until each person does. This is deliberate: a session revoked after the copy was taken must not come back. Orders since the copy are not recovered, and neither are blocks or deletions. With Caddy stopped, reach the API through `ssh -L 4000:127.0.0.1:4000` to re-apply them from the incident timeline, then `sudo docker start caddy`. Then sign in as an admin and open a recent order. `tests/backup.test.mjs` runs the data path on a synthetic database.

**If the VM itself is lost:** the copies on its disk are gone too, so take the newest from Blob. The SAS on the VM can only write, so a compromised VM cannot read or delete old copies, and it cannot be used here either. From the owner's PC, then `scp` it to the new VM:

```sh
az storage blob list --subscription "Azure subscription 1" --account-name windprodstore --container-name wind-backups --auth-mode key -o table
az storage blob download --subscription "Azure subscription 1" --account-name windprodstore --container-name wind-backups --auth-mode key -n wind-<stamp>.db.gz -f wind-<stamp>.db.gz
```

The default `az` subscription is the disabled student one, so name the subscription. These files are not in any backup and must be recreated on a new VM: `/srv/wind-api.env` (`DB_PATH WIND_IDENTITY_MODE NODE_ENV WEB_ROOT TZ WIND_ENABLED_SERVICES HOST PORT SUPPORT_CONTACT OSRM_URL WIND_TRUST_PROXY WIND_PUSH_SUBJECT WIND_EXPO_PUSH_ENABLED`, values in `docs/operations/deploy.md` and `.env.example`, plus the secrets `WIND_FIREBASE_API_KEY` and `WIND_FIREBASE_SERVICE_ACCOUNT`: make a new key in Firebase rather than looking for a copy), `/srv/wind-backup.env` (a new write-only SAS), `/srv/Caddyfile`, and `/etc/cron.d/wind`. The OSRM graph at `/srv/osrm` is rebuilt with `infra/osrm/build-west-bank.sh`, not restored. `deploy.sh` and `wind-restore.sh` both expect a `wind-api` container, so on a new VM first start one by hand with the `docker run` line from `infra/vm/deploy.sh`. **Not rehearsed:** this replacement path was never run end to end.

The four-hourly copies on the owner's PC (`scripts/backup-azure.ps1`) are a second source, encrypted to that Windows account. `-VerifyLatest` needs the VM, so it is no help when the VM is gone. To unwrap one offline:

```powershell
$j = [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes('<file>.dpapi'), $null, 'CurrentUser')) | ConvertFrom-Json
[IO.File]::WriteAllBytes("$PWD\wind.db", [Convert]::FromBase64String($j.data)); (Get-FileHash wind.db -Algorithm SHA256).Hash -ieq $j.sha256  # True. Delete wind.db when done
```

**Restore drill, 6 November 2026:** the newest nightly copy (`wind-20261106T031001Z.db.gz`) was byte-identical on the VM and in Blob. `wind-restore.sh` ran against a throwaway container and data folder, with the production image and `/srv/wind-api.env`, while `wind-api` kept running: a missing file and a non-database file each stopped it with the container up and the data untouched, a failed start and a failed readiness check each put the old database back and restarted it, and the real copy was restored and ready in 12 seconds with no sessions left. Production then held 2 users and no orders, so this proves the path and says nothing about a restore at real volume.

**Retention:** Blob has no lifecycle rule and soft delete is off, so copies stay forever, including the data of accounts deleted since. The privacy page says earlier backups may hold such data; an owner decision on how long is still open.

Recovery objectives are not set by this IaC. The operator must approve numeric RPO/RTO based on a timed fresh restore before production. Flexible Server backup retention is configured by environment; geo-redundant backup is disabled pending regional/data-location review. Blob redundancy/lifecycle, soft delete/versioning, quarantine scanning and evidence retention also require explicit policy/cost approval. No recovery is complete solely because Azure reports a backup or deployment succeeded.
