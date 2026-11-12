# Moving Wind production from Azure to AWS — study, 12 November 2026

Author: Claude Opus 5.5 (lead). Research only: no cloud resource was created, changed or deleted. It replaces the Fable 5.2 study started at 07:25 the same day, which hit its usage limit after 49 read-only calls and wrote nothing; its collected facts (prices, Azure inventory, backups) are reused here and marked where they came from.

## 1. Where things stand (checked today)

| Fact | Value | How checked |
|---|---|---|
| Azure subscription "Azure subscription 1" | **Disabled** (was `Warned` at 03:07 UTC) | `az rest …/subscriptions/<id>?api-version=2022-12-01` |
| `wind-vm` | Deallocated; size `Standard_B2ts_v2` (2 vCPU, 1 GiB RAM) | `az vm list -d`, `az vm show` |
| Production data | SQLite on the VM disk, nightly copy to Azure Blob `windprodstore/wind-backups` | `infra/vm/wind-backup.sh` |
| Newest copy **outside Azure** | `wind-azure-20261111T0654053145Z.dpapi` on the owner's PC: 9 users, 2 orders, integrity ok, restore-verified | `%LOCALAPPDATA%\SouqWindPrivate\backups` |
| Data only inside Azure | Everything written 11 Nov 06:54 → 12 Nov 00:58 UTC (the PC task has failed since) | `Wind-Azure-Backups` task result 1 |
| Azure cost, 1–10 Nov | USD 36.34, of which **USD 29.45 is an unused extra Container App `wind-api`**; the VM, disk, IP, registry and storage together were USD 6.89 | `docs/operations/cost-model.md` |
| Azure Maps account `wind-maps` | Exists, not referenced by `server/`, `src/` or `public/` | grep |
| API address | `windapi236.swedencentral.cloudapp.azure.com` — an **Azure-owned** name, baked into every APK, the web build, CI, Uptime and the push subject | `release-image.yml`, `app.config.js`, `src/api.ts` |
| AWS account `366754056464` | CLI session **expired**; plan state not readable (`GetAccountPlanState` returned "Missing data" this morning). Last known: Free plan, USD 120 credit, ends 2027-04-30 | `aws sts`, `docs/operations/aws-credits.md` (branch `claude/aws-credits-92c2ce`) |
| AWS Region | `eu-north-1` (Stockholm) only | owner's AWS settings |

**The outage is a payment problem, not a platform problem.** AWS also bills a card. If the card that failed on Azure is the card used for AWS, the same outage can happen on AWS.

## 2. Options

| | A. Stay on Azure | **B. AWS EC2 (recommended)** | C. AWS Lightsail | D. AWS containers (ECS Fargate + RDS) |
|---|---|---|---|---|
| Shape | Same VM after billing is fixed | One `t3.small` (2 vCPU, 2 GiB) running the same Docker setup | One 2 GiB Lightsail bundle, same Docker setup | Managed containers, managed PostgreSQL, load balancer |
| Monthly cost | ≈ USD 21 once the extra Container App is deleted | **≈ USD 22** | ≈ USD 12 | ≈ USD 60+ (Fargate + RDS + ALB ≈ USD 17 alone) |
| Work | None beyond billing | ≈ 1 day after prerequisites | ≈ 1 day | Several days; needs the PostgreSQL cutover first (ledger rows 35–37) |
| Server credentials | SAS token on the VM | **IAM role, no stored keys** | Long-lived access keys on the box | IAM roles |
| Verdict | Cheapest move; does not change the provider whose bill failed | Same app, same scripts, stronger credentials, room for SES/RDS later | Cheaper, but stored keys on a public server | Too much change at once for a 50-user pilot |

Option B arithmetic (eu-north-1 on-demand prices, 730 h; EC2/IPv4/EBS prices from AWS Price List via the Fable run and `aws-credits.md`):

| Line | Calculation | USD/month |
|---|---|---:|
| EC2 `t3.small` | 730 × 0.0216 | 15.77 |
| EBS gp3 30 GiB, encrypted | 30 × 0.0836 | 2.51 |
| Public IPv4 (Elastic IP) | 730 × 0.005 | 3.65 |
| ECR images (≈ 1.5 GB) | 1.5 × 0.10 | 0.15 |
| S3 backups (< 1 GB, versioned) | — | < 0.10 |
| Data out (first 100 GB/month free) | — | 0 |
| **Total** | | **≈ 22.1** |

`t3` (Intel) not `t4g` (ARM): the OSRM image is `osrm-backend:v26.6.1-amd64-alpine`, amd64 only. Today's VM runs API + OSRM + Caddy in 1 GiB, so 2 GiB is headroom, not a guess. The USD 120 credit covers about five months of option B.

## 3. What we gain

- **A provider whose account is in good standing** (assuming a working card), and a **spend limit** in AWS Settings that the owner controls.
- **No stored cloud secrets on the server**: an instance role pulls images and writes backups. Today the VM holds a Blob SAS and is logged in to ACR by hand at each deploy.
- **Backups that cannot be overwritten**: S3 versioning, block-public-access, write-only from the server. Azure Blob had no versioning or soft delete.
- **Shell access without an open SSH port** (Systems Manager Session Manager), so port 22 closes.
- **Registry that refuses an existing tag by itself** (ECR immutable tags) instead of a workflow check.
- **Our own domain** (required, see §5): future moves become a DNS change instead of a new APK for every user. The same domain unblocks verified email (ledger row 19, SES or Cloudflare).
- **First real run of the replacement-host restore** (`restore.md` says it was never rehearsed end to end) — the migration is that rehearsal.

## 4. What we lose or risk

| Loss / risk | Size | Mitigation |
|---|---|---|
| **Every installed Android app stops working** (it calls the Azure name) | All pilot users must install a new APK by hand; there are no over-the-air updates | They are already offline today. Ship APK 1.1.1 with the new address, post it on the Root site and send the link to the ~50 users |
| Web / iPhone home-screen users | New address: re-open the link, re-add to home screen, sign in again | Same message as the APK |
| **Everyone signs in again** | By design: `wind-restore.sh` removes all sessions and browser alerts | Expected; closed-app alerts return after sign-in |
| **Data written 11 Nov 06:54 → 12 Nov 00:58 UTC** | Lost **unless Azure is paid** long enough to copy the disk or Blob backups | Owner pays Azure → we copy the latest Blob backup → then move. Otherwise restore from the PC copy (9 users, 2 orders) |
| AWS Free plan | Account suspended at 2027-04-30 or when credit runs out; deleted 90 days later | **Upgrade to the Paid plan before going live**; credit carries over |
| AWS spend limit | Exceeding it **pauses the project = outage** | Set it well above ≈ USD 22 (e.g. USD 50) and keep the USD 10 budget alert for early warning |
| Same card fails again | Outage again | Owner checks the payment method in AWS Settings → Billing |
| Azure work becomes unused | `infra/main.bicep`, `azure-validate.yml`, `backup-azure.ps1`, Azure sections of the docs | Keep files until Azure is deleted; port only the backup pull |
| First-time setup mistakes | New host, new scripts | Old Azure resources stay untouched until two weeks of good AWS running; restore drill on AWS before announcing |
| Latency | Stockholm vs Sweden Central (Gävle) — same country | None expected |

## 5. Prerequisites only the owner can provide

1. **Decide on Azure:** pay it (recommended, to keep the last ~18 h of data and the Blob history, and to delete the USD ~88/month extra Container App), or accept restoring from the 11 Nov 06:54 PC copy.
2. **`aws login`** on this PC (the session expired).
3. **Upgrade AWS to the Paid plan** and confirm the payment method, or explicitly accept running on the Free plan until 2027-04-30.
4. **A domain** (≈ USD 10–15/year, e.g. Cloudflare Registrar, where the Root site already lives). Let's Encrypt does not issue certificates for `*.amazonaws.com` names, so AWS has no free stable HTTPS name to replace the Azure one. Suggested: `api.<domain>` for the API and web app.
5. **Approval of the resources in §6** (paid resources need explicit approval).

## 6. Implementation plan (after approval)

One CloudFormation stack in `eu-north-1` (one review, one delete):

- EC2 `t3.small`, Ubuntu 24.04 amd64, 30 GiB gp3 encrypted, Elastic IP, IMDSv2 only.
- Security group: 80 and 443 open; **no 22** (Session Manager instead).
- IAM instance role: ECR pull on `wind-api`, `s3:PutObject` on the backup bucket only, SSM core.
- ECR repository `wind-api`, immutable tags, scan on push.
- S3 bucket `wind-backups-366754056464`: versioned, all public access blocked, SSE-S3. Retention rule left to the owner (row 8).
- GitHub OIDC provider + role usable only by `osamaabujarad45-jpg/wind` on `master`, allowed to push to `wind-api` only. Removes the stored `ACR_USERNAME`/`ACR_PASSWORD` secrets.

Repository changes (one PR, reviewed per the PR rule):

- `release-image.yml`: OIDC login to ECR, API address from one variable.
- `infra/vm/deploy.sh`: registry from the host's environment; same digest + revision checks.
- `infra/vm/wind-backup.sh`: upload with `aws s3 cp` (instance role) instead of the SAS `curl`.
- `ci.yml`, `uptime.yml`, `WIND_PUSH_SUBJECT`, docs: new address.
- `scripts/backup-azure.ps1` → pull the newest copy from S3 for the PC's second copy.

Cutover, in order:

1. Copy the newest backup (Blob if Azure is paid, else the PC copy) and verify its hash and integrity.
2. Create the stack; install Docker, Caddy, the four scripts and the cron file; build the OSRM graph with `infra/osrm/build-west-bank.sh`.
3. Release the image to ECR, start `wind-api` by hand once (as `restore.md` says), then `wind-restore.sh` the copy.
4. Point `api.<domain>` at the Elastic IP; Caddy obtains the certificate.
5. Verify: `/api/ready` from outside, OSRM from inside, a backup lands in S3, a restore drill into a throwaway container, a two-role trip on the SM-A5360 with the new APK.
6. Build APK 1.1.1 on EAS with the new address (same signing key, installs over 1.1.0), publish it, tell users.
7. Keep Azure as is for two weeks, then delete it with the owner's approval.

Rollback: until users install the new APK nothing points at AWS, so stopping is free. After AWS takes writes, recover forward on AWS; never re-promote an older Azure copy over newer AWS data.
