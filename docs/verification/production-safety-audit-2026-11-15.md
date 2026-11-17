# Production restore and safety audit — 13 November 2026

**Scope:** read-only production-backup acquisition, local throwaway restore, schema/row-count checks, and API boot against a copy. No production database, account, DNS, VM, EAS, Firebase, or hosted configuration was changed. This file supersedes the earlier draft's incorrect date, table count, and interpretation of `native_push_tokens`.

## Fresh evidence

- **[ran]** `py -m awscli s3 ls s3://wind-backups-083712835043/ --profile pool-bedrock-083712835043 --region eu-north-1` exited 0 and listed `wind-20261112T165723Z.db.gz` and `wind-20261113T031001Z.db.gz`, each 10,148 bytes.
- **[ran]** Downloaded both objects into an isolated temporary restore directory; both `s3 cp` commands exited 0.
- **[ran]** Decompressed and inspected each copy with Python `sqlite3`. `PRAGMA integrity_check` returned `ok`; `PRAGMA foreign_key_check` returned no rows; `PRAGMA user_version` returned 3.
- **[ran]** Compared every application-table row count: zero differences between the two backups.
- **[ran]** Booted `server/main.ts` against a copy of the newest restored database on `127.0.0.1:43177`. `GET /api/ready` returned HTTP 200 and `{"ok":true,"schema":3}`. The temporary API process was stopped.
- **[ran]** `py -m awscli ssm describe-instance-information …` and `ec2 describe-instances …` were denied to the available read-only credential. The live host's current environment and table counts therefore remain **[U]**.

## Artifact identity

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Newest backup gzip | 10,148 | `45608b757e2d2e126b2060329791d26889ab0ddca0e3e141a542091ccf8a2a7a` |
| Prior backup gzip | 10,148 | `19757e7df0461b1bf200dae6bcdee54d3bae7965e1f87e5e05221b1103a6a1ff` |
| Either decompressed database | 364,544 | `0ea4d4bdf08f4df9ea5c443a99933989163cdcddfe9eae822d9dcd59de2c1789` |

The decompressed backups are byte-identical. They contain **36 application tables plus SQLite's internal `sqlite_sequence` table—37 tables total**. This reconciles the older reports' “37 tables” with the application-only count.

## Schema decision and correction

- **[read]** `server/db/postgres-native-push.sql:4-17` creates `native_push_tokens` only for PostgreSQL. **[read]** `server/domain/native-push.ts:25-29` disables the native path on SQLite. Its zero-row presence in the SQLite backup is a **legacy unexplained table on this dialect**, not an active feature and not a corrupt restore.
- **[ran]** A recursive search under `server/` found no `firebase_resets` reference. That table is also zero-row and unexplained legacy history.
- **[read]** `docs/REA/2026-11-13-VERIFIED-ADDITIONS.md:237-277` already established both distinctions and explained why the other schema differences are expected.
- **Decision:** preserve both zero-row legacy tables in existing backups and the current production database. Do not add speculative SQLite DDL and do not delete production history during a restore drill. A separate owner-approved cleanup may drop them later, but that is not required to prove restorability.

The initial comparison that treated every PostgreSQL table as mandatory on SQLite was wrong. PostgreSQL-only modules are expected to be absent from the legacy SQLite schema; `opencode_jobs` is optional and the `*_upgrade` names are migration-time temporary tables.

## Verification result

- **Backup integrity and decompress/open:** **VERIFIED**.
- **Table-for-table comparison against the prior production backup:** **VERIFIED**, with zero differences.
- **API compatibility against the restored copy:** **VERIFIED** locally.
- **Exact live-host baseline and current host environment:** **MANUAL_VERIFY_REQUIRED**, because SSM/EC2 access is denied. Do not relabel the backup comparison as a live-host comparison.
- **Collected cash at the door:** **[U]**. No collection, settlement, migration, or production mutation was performed. This audit provides no A11 runtime evidence.

Sanitized evidence files are under `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\`: `restore-inspection.json`, `restore-integrity.json`, and `restore-api-result.json`. Raw restored databases are removed after the checks; the original S3 objects are untouched.
