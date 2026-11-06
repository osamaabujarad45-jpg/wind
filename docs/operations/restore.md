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

To restore, on the VM or a replacement:

```sh
sudo docker stop wind-api
sudo cp /srv/wind-data/wind.db /srv/wind-data/wind.db.before-restore   # keep what was there
gunzip -c /srv/wind-data/backups/wind-<stamp>.db.gz | sudo tee /srv/wind-data/wind.db >/dev/null
sudo rm -f /srv/wind-data/wind.db-wal /srv/wind-data/wind.db-shm       # a stale journal must not replay over the restored file
sudo docker start wind-api                                             # refuses to start if its quick check fails
```

Then sign in as an admin and open a recent order. `tests/backup.test.mjs` runs this path on a synthetic database.

**If the VM itself is lost:** the copies on its disk are gone too, so take the newest from Blob. The SAS on the VM can only write, so a compromised VM cannot read or delete old copies, and it cannot be used here either. From the owner's PC:

```sh
az storage blob list --subscription "Azure subscription 1" --account-name windprodstore --container-name wind-backups --auth-mode key -o table
az storage blob download --subscription "Azure subscription 1" --account-name windprodstore --container-name wind-backups --auth-mode key -n wind-<stamp>.db.gz -f wind-<stamp>.db.gz
```

The default `az` subscription is the disabled student one, so name the subscription. These files are not in any backup and must be recreated on a new VM: `/srv/wind-api.env` (no secrets today: `DB_PATH WIND_IDENTITY_MODE NODE_ENV WEB_ROOT TZ WIND_ENABLED_SERVICES HOST PORT SUPPORT_CONTACT OSRM_URL`, values in `docs/operations/deploy.md` and `.env.example`), `/srv/wind-backup.env` (a new write-only SAS), `/srv/Caddyfile`, and `/etc/cron.d/wind`. The OSRM graph at `/srv/osrm` is rebuilt, not restored. **Not rehearsed:** this replacement path was never run end to end.

**Restore drill, 6 November 2026:** the newest nightly copy (`wind-20261106T031001Z.db.gz`) was byte-identical on the VM and in Blob. In a throwaway container using the production image and `/srv/wind-api.env`, `/api/ready` answered 3 seconds after unzip started, with integrity and foreign keys clean, while `wind-api` kept running. Production then held 2 users and no orders, so this proves the path and says nothing about a restore at real volume.

**Retention:** Blob has no lifecycle rule and soft delete is off, so copies stay forever, including the data of accounts deleted since. The privacy page says earlier backups may hold such data; an owner decision on how long is still open.

Recovery objectives are not set by this IaC. The operator must approve numeric RPO/RTO based on a timed fresh restore before production. Flexible Server backup retention is configured by environment; geo-redundant backup is disabled pending regional/data-location review. Blob redundancy/lifecycle, soft delete/versioning, quarantine scanning and evidence retention also require explicit policy/cost approval. No recovery is complete solely because Azure reports a backup or deployment succeeded.
