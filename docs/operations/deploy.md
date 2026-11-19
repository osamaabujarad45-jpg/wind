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

## Production host from 16 November 2026 (student Azure subscription)

The 15 November subscription (`7bd97ddb…`, host `windapp-ps.swedencentral.cloudapp.azure.com`) went into the
Warned, read-only state at 20:35 UTC. Azure stopped its VM and its registry answers `REGISTRY_NOT_READY`.
Production moved to a VM on a separate student subscription. The 15 November section below describes the old host.

- **Public address:** `https://4.223.118.16.sslip.io`. This is the EAS `production` and `preview` variable
  `EXPO_PUBLIC_API_URL` on the EAS project `@osamaabujarad236s-organization/wind` (`app.json` `extra.eas.projectId`
  `4da8c458-…`). It is also the repository variable `WIND_API_URL`.
  - The name comes from sslip.io and the static IP `4.223.118.16`. Keep that IP, or every installed APK breaks.
  - Installs built for an older address keep calling it until they are reinstalled.
- **Host:**
  - Subscription `b664239e-…` (Free Trial, spending limit on), resource group `wind-prod`, Sweden Central.
  - VM `wind-vm`: Ubuntu 24.04, D2als_v6. The NSG allows 22, 80 and 443 only.
  - SSH: `ssh -i ~/.ssh/wind-vm-prod windadmin@4.223.118.16`.
  - The student subscription must not get new Azure resources, and its other resource groups are not Wind's.
- **Runtime:** no Docker.
  - systemd `wind-api.service` runs `/opt/node/bin/node server/main.ts` from `/opt/windapi` as root, on port 4000.
    It listens on loopback only.
  - The node binary is Node 24.
  - Caddy (`/etc/caddy/Caddyfile`) terminates TLS with Let's Encrypt and proxies to `localhost:4000`.
  - The unit sets `NODE_ENV`, `PORT`, `DB_PATH=/data/wind.db` and `TZ`.
  - The drop-in `/etc/systemd/system/wind-api.service.d/10-master.conf` adds `EnvironmentFile=/etc/wind-api.env`
    (root, 0600). That file holds:
    - `SUPPORT_CONTACT`
    - `WIND_PUSH_SUBJECT=https://4.223.118.16.sslip.io`
    - `WIND_TRUST_PROXY=1`
    - `WIND_IDENTITY_MODE=self-service`
    - `WIND_ENABLED_SERVICES=parcel`
    - `WIND_DRIVER_PRESENCE=off`
    - `WEB_ROOT=/opt/windapi/web`
  - Not configured yet: Firebase (closed-app push), OSRM and email. Their keys stayed on the old subscription.
- **Release:** build the same tree the Dockerfile builds, on the test PC, then swap it in.
  1. Run `npx expo export --platform web --clear` with `EXPO_PUBLIC_API_URL=https://4.223.118.16.sslip.io`,
     `EXPO_PUBLIC_SUPPORT_WHATSAPP=972597127547`, `WIND_RELEASE=1`, `WIND_LOCAL_TEST=0`, `NODE_ENV=production`,
     `EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1` and `EXPO_UNSTABLE_TREE_SHAKING=1` (the Dockerfile's build arguments).
  2. Run `node scripts/runtime-dependencies.mjs api-runtime`.
  3. Assemble the tree: `server/`, `api-runtime/src` as `src/`, `api-runtime/node_modules` as `node_modules/`,
     `dist/` as `web/`, and `assets/icon.png` as `web/wind-icon.png`. Add `infra/vm-student/backup.sh` as `backup.sh`
     (mode 750); `wind-backup.timer` runs it from `/opt/windapi`.
  4. Stage it as `/opt/windapi-new`.
  5. Dry-run it on another port with a throwaway `DB_PATH`.
  6. Stop the service, move `/opt/windapi` aside, move the new tree in, and start the service.
  7. Check with `node scripts/check-deployment.mjs --origin https://4.223.118.16.sslip.io`.
- **Rollback:** stop the service, move the current tree aside and restore the previous `/opt/windapi-old-<date>`,
  then start the service. The database stays `/data/wind.db` (it holds the accounts made since 16 November).
  Going back to the pre-master server (`/opt/windapi-old-20261116`) also needs `10-master.conf` removed and
  `systemctl daemon-reload`, and that server cannot read master's schema: it would need its own empty database
  (`/data/pre-master-20261116/wind.db`).
- **Release notes, 19 November (PR #97):**
  - **Before rolling back past this release**, have the finance lead freeze office payouts and balance adjustments used to settle
    captains. Stop scheduled and manual finance ledger imports. Record the time the freeze began and retain it throughout rollback.
    An older binary can restore promo relief in its balance view for a discounted `RETURN_NO_FARE` return and classify newer
    entries differently during import. Keep the database and any orders written during rollback.
  - **Cashier builds and order** (cashier protocol 1.1.5, client build 10105):
    - Cashiers record cash in the web app this host serves (`WEB_ROOT`): reloading it gives the release's own bundle.
      A browser tab still on an older bundle gets the update screen (Reload) for a new cash write; its own pending
      request still replays.
    - Production refuses new cash writes from any bundle below 10105, and from one that sends no build header at all
      (builds before the forced-upgrade gate). Supported cashier builds: the web app of this release, and native 1.1.5
      or later.
    - A native 1.1.4 admin install that taps a cash write gets 426 and the whole app shows the update screen, without a
      Download action (`EXPO_PUBLIC_UPDATE_URL` is unset on this EAS project), until the app is closed and reopened.
      Nothing is written. Tell native admins to record cash in the web app until a 1.1.5 APK is published.
    - A cashier who sees “This device could not save the cash entry’s state” stops using that device for cash: the entry
      is checked against the captain’s balance and any correction is recorded from another device. If that device later
      restores the entry after a restart, do not press Retry on it there; check the balance from another device first.
    - Order: release the server first. A native 1.1.5 build sends typed payouts that the 16 November API would book as
      ordinary adjustments, so no 1.1.5 APK reaches a cashier before this server is live.
  - **Cash writes during a rollback** (Sol R10-H3): the previous API does not know typed payouts or the 1.1.5 cashier
    protocol and would book a current tab's payout as an ordinary adjustment. Freeze cash writes and close every open Cash
    tab before stopping the service, keep them frozen while the previous API runs, and reopen them only after re-release.
    A cashier bundle older than 1.1.5 gets the update screen for new cash writes on this release (same-id replay still
    answers it), so after a client-only rollback the office also waits for re-release before recording cash.
  - **After re-release**, reconcile the captains on orders marked `RETURN_NO_FARE` or linked to a `trip_pay` cash entry. Compare
    booked fares, discounts, credits, payouts and any pending handovers with the office receipts and current cash balances.
    For PostgreSQL, also compare captain receivables and operating-expense journals to those entries before resuming imports.
    The finance lead records any differences and resolves them before reopening payouts and import.
  - Captain pay (SRS DRV-17/18): a failed parcel or freight delivery pays the booked fare per leg. Support custody recovery pays
    one leg. A courier block waits for a second admin's clearing review on either database. On API startup, missing shipping
    reviews are recovered from custody-block audits for drivers who can still settle cash. The review keeps the original
    block time and is due two working days after recovery. The API logs skipped reviews for departed drivers. Every pre-pickup
    cancellation after assignment and every failed pickup goes to support review. Validated distance informs the suggested
    credit, capped at the booked fare. A support or finance decision grants or denies the credit. The office records
    disbursements with the Pay driver action after pending handovers are resolved.
  - Goods COD writes stay off unless `WIND_GOODS_COD=on` (G-COD), whatever the database schema allows.
  - Command replay: a reply scrubbed by this release replays as a re-read under current authorization. An earlier
    tree reading the same database returns the scrubbed marker as it is; the client then re-reads the order.
  - Before rides are enabled on any database (G-RIDE), audit duplicate active rides and reconcile any row it returns:
    `SELECT customer_id, COUNT(*) FROM orders WHERE service='ride' AND status IN ('assigned','at_pickup','in_transit') GROUP BY customer_id HAVING COUNT(*) > 1;`
    The fence that prevents new ones assumes one API writer at a time, which this single-service swap gives.
- **Data:** the database started fresh on 16 November. Users register again; the old data is only on the disabled
  subscription.
  - `/data/pre-master-20261116/` keeps the pre-master database and the QA journey database.
  - `wind-backup.timer` runs `/opt/windapi/backup.sh` daily at 00:00 UTC. It writes `/data/backups/wind-<date>.db`
    with `VACUUM INTO` (temp file, then rename, so a second run the same day works) and keeps 14 days.
  - Backups live on the same disk as the database: a disk loss loses them too. An off-host copy needs a place the
    owner chooses (no new resources may be created in the student subscription).
- **Admin commands** run on the VM with the service environment, for example:
  `cd /opt/windapi && sudo bash -c 'set -a; . /etc/wind-api.env; set +a; NODE_ENV=production DB_PATH=/data/wind.db /opt/node/bin/node server/main.ts verify-phone 05XXXXXXXX --phone-verified'`
  and then `... server/main.ts promote 05XXXXXXXX`. In production, `promote` requires a verified phone.
- **Builds:** the EAS project `@osamaabujarad236s-organization/wind` holds a copy of the Android upload keystore
  (SHA-256 `5947bab0…`, the same signer as every installed APK). Its remote Android versionCode continues from 35.
  It continues the old sequence: 36 and 37 were its first builds, so read the live value (`eas build:version:get -p android`)
  before any manual set. `GOOGLE_SERVICES_JSON` (secret on the old project, so it could not be copied) and the FCM V1
  key must be uploaded again before closed-app push works; the server's Firebase key is also not set on this host.
  `EXPO_PUBLIC_UPDATE_URL` is not set here: the old target sits on the disabled subscription, and the forced-upgrade
  screen needs a durable APK link before `WIND_MIN_CLIENT_BUILD` is ever set.

## Production host on Azure, 15 November (subscription now disabled)

**Since 15 November 2026** production runs on Azure subscription "Azure subscription 1" (tenant `birzeit822.onmicrosoft.com`, Pay-As-You-Go), resource group `wind-prod` in **Sweden Central**. The owner chose Azure over the AWS host of 12–15 November; that host is kept, with the API stopped, as history below.

- **Public address:** `https://windapp-ps.swedencentral.cloudapp.azure.com`, the DNS label of the static public IP `wind-ip` (20.91.140.253). The name belongs to that IP resource: deleting `wind-ip` releases it and breaks every installed APK, so keep the IP even if the VM is replaced. It is Azure-owned; an owned domain removes this dependency. It is the repository variable `WIND_API_URL` and the EAS `production` variable `EXPO_PUBLIC_API_URL`. Retired addresses are listed in `scripts/retired-api-hosts.json`: `app.config.js` refuses them and CI scans the exported bundles for them.
- **Host:** VM `wind-vm`, `Standard_D2als_v6` (2 vCPU, 4 GiB, AMD, NVMe), Ubuntu 24.04, 32 GiB StandardSSD, 2 GiB swap file. This new Pay-As-You-Go subscription was refused every B-series size (quota 0, and an automatic quota request failed), so this size costs about USD 63/month. Request `standardBasv2Family` quota (Help + support → Service and subscription limits); once granted, move to `Standard_B2als_v2` (about USD 28). That size has no NVMe, so the move is a new VM from a snapshot of the OS disk, attached to the same NIC and `wind-ip`, not an in-place resize.
- **TLS:** Caddy (`infra/vm/Caddyfile` at `/srv/Caddyfile`) holds a Let's Encrypt certificate for the public name and answers on 80 and 443 directly; there is no CDN in front. It sets `X-Forwarded-For` to the caller's address (an incoming one is ignored), which `WIND_TRUST_PROXY=1` tells the API to use.
- **Network:** NSG `wind-nsg` admits 443 and 80 from anywhere. SSH (22, key `~/.ssh/wind-azure` on the owner's PC, user `windadmin`) is admitted only from the owner's address by rule `ssh-setup`, which the PC's off-VM copy (`scripts/backup-azure.ps1`) also uses; when that address changes, update the rule. `az vm run-command invoke -g wind-prod -n wind-vm --command-id RunShellScript --scripts ...` needs no open port.
- **Credentials:** none stored on the VM. Its system-assigned managed identity has **AcrPull** on registry `windpsacr` and the custom role **Wind backup writer** (create and write blobs; no read, list or delete) on the container `windpsbackup/wind-backups` only. `/srv/azure-token.sh` (`infra/vm/azure-token.sh`) turns that identity into short-lived tokens for `deploy.sh` and the backup. GitHub signs in as the app registration `wind-release-image` through OIDC, trusted only for this repository's `master` (immutable owner and repository ids), with **AcrPush** on `windpsacr` and nothing else.
- **Settings:** `/srv/wind-api.env` (root, 0600) holds the same keys as before, with `WIND_PUSH_SUBJECT=https://windapp-ps.swedencentral.cloudapp.azure.com`, `OSRM_URL=http://wind-osrm:5000` and `WIND_TRUST_PROXY=1`.
- **Cron:** `infra/vm/wind.cron` at `/etc/cron.d/wind`: nightly backup 03:10 UTC, watchdog every minute.
- **Backups:** `windpsbackup` is zone-redundant, shared-key and public access are off (identity only), blob versioning is on, and deleted blobs and versions are kept 30 days.
- **APK downloads:** storage account `windpsrelease`, container `downloads` with blob-level anonymous read (a blob opens by its exact URL; the container cannot be listed). `https://windpsrelease.blob.core.windows.net/downloads/wind.apk` is always the newest signed APK; it is the EAS variable `EXPO_PUBLIC_UPDATE_URL`, which the forced-upgrade screen opens. Build it with `npx eas-cli build -p android --profile production-apk` (the production environment and keystore, as an installable APK; the `production` profile makes the Play Store AAB), upload it to `downloads/wind.apk` and a versioned `downloads/wind-<versionCode>.apk`. To force older installs onto it, set `WIND_MIN_CLIENT_BUILD` in `/srv/wind-api.env` to the new build's `CLIENT_BUILD` (`src/api-client.ts`: major×10000 + minor×100 + patch of the `app.json` version, so 10101 for 1.1.1), **not** the Android versionCode. The file is read only when the container is created, so recreate `wind-api` with the `docker run` line from `infra/vm/deploy.sh` (a restart keeps the old value), then check `docker exec wind-api printenv WIND_MIN_CLIENT_BUILD` and `curl -s -o /dev/null -w '%{http_code}' -H 'X-Wind-Client: 1' http://127.0.0.1:4000/api/ready` (426). Builds from before the forced-upgrade gate (commit 7d17ccc5, part of the 1.0.13 line) send no `X-Wind-Client` header and pass this global check (`server/domain/runtime-readiness.ts`): they need the new APK link sent to them directly. Production cash writes have their own build gate (`cashClientFenced`), which refuses them.
- **Data:** create it before the first `docker run` with `install -d -o 1000 -g 1000 -m 700 /srv/wind-data`: the image runs as `node` (uid 1000), and a directory Docker creates for the mount is root's, which stopped the first Azure start with `unable to open database file` (15 November).
- **Scripts:** `apt-get install -y docker.io jq sqlite3`, then `install -m 0755` each of `infra/vm/{azure-token,deploy,wind-backup,wind-restore,wind-watchdog}.sh` to `/srv/`, `infra/vm/Caddyfile` to `/srv/Caddyfile` and `infra/vm/wind.cron` to `/etc/cron.d/wind` (0644). After changing one, copy it again and compare SHA256.
- **Caddy:** started once by hand; its certificate lives in the `caddy_data` volume:

```sh
docker run -d --name caddy --restart unless-stopped --network windnet -p 80:80 -p 443:443 \
  -e WIND_ORIGIN=windapp-ps.swedencentral.cloudapp.azure.com -v /srv/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v caddy_data:/data -v caddy_config:/config --log-opt max-size=20m --log-opt max-file=3 caddy:2.10.2-alpine
```

### Releasing an image

`infra/vm/deploy.sh` takes the tag, the pushed digest and the source revision. It logs in to ACR with the VM's managed identity, pulls and runs the image by digest, and refuses one whose `org.opencontainers.image.revision` label is not that revision, before the backup or the switch. The tag only names the rollback container, and a tag that already has one is refused, and the release workflow refuses to push a tag the registry already holds. `tests/deploy-script.test.mjs` runs the script against a moved tag in CI. After any change to `infra/vm/deploy.sh`, copy it to `/srv/deploy.sh` and compare SHA256 again before releasing. Its rollback restarts the old container with its original environment, which is not safe across a database-backend cutover (master plan Phase 3).

1. Require applicable gates and CI on the actual merge SHA. Confirm remote `master` still equals that green candidate, then run `gh workflow run release-image.yml --ref master -f tag=<tag>`. The workflow is master-only and refuses an existing tag; it does not check the candidate's CI itself.
2. Record the workflow URL, its exact `headSha`, the pushed digest and the matching revision label.
3. Run the `sudo /srv/deploy.sh …` line from the workflow summary on the VM, over SSH or `az vm run-command invoke`.

The **Uptime** workflow checks `$WIND_API_URL/api/ready` hourly from outside Azure. A failed run emails whoever last changed its schedule, under their GitHub notification settings.

### The AWS host (history, 12–15 November 2026)

From 12 to 15 November 2026 production ran on AWS account `083712835043`, Region `eu-north-1`, from the CloudFormation stack `wind` (`infra/aws/wind.yaml`; why: `docs/operations/aws-migration-study.md`). Azure stopped the old VM over billing and then disabled the subscription; the Azure resources are left untouched until the owner deletes them.

- **Public address:** `https://dlvxzw3gj596d.cloudfront.net` (CloudFront). It is AWS-owned and stays the same when the host is replaced, so the app does not need a rebuild for a host move. It lasts only as long as that distribution: the stack keeps it (and the host and the backup bucket) on `delete-stack` (`DeletionPolicy: Retain`); deleting it by hand breaks every installed APK. An owned domain removes this dependency. It is the repository variable `WIND_API_URL`, read by CI, the release workflow and Uptime. Before ever changing it, remember that every installed APK has the address built in.
- **Host:** EC2 `t3.small` `wind-host` with an Elastic IP, Ubuntu 24.04 from a pinned AMI (a changed AMI would replace the host and its database; the OS patches itself in place), 30 GiB encrypted gp3 that survives instance deletion (a replacement would need it attached and mounted by hand), 2 GiB swap. Preview every stack update as a change set and refuse any that replaces `Host` or `Edge`. Docker runs `wind-api`, `wind-osrm` and `caddy` on the `windnet` network, SQLite at `/srv/wind-data/wind.db`, as on Azure.
- **TLS:** CloudFront to the host is HTTPS. Caddy (`infra/vm/Caddyfile`, at `/srv/Caddyfile`) holds a Let's Encrypt certificate for the host's sslip.io name (stack output `OriginName`). The security group admits 443 only from CloudFront's origin-facing prefix list, and 80 only for certificate checks and redirects. That list serves every CloudFront distribution, so ours also sends `X-Wind-Edge` (the stack's `EdgeSecret`, kept in `/srv/caddy.env` as `WIND_EDGE_SECRET`) and Caddy answers 403 without it. IPv6 is off at the edge, so per-address limits see one address per caller, and errors are never cached at the edge. Caddy passes CloudFront's `X-Forwarded-For` through unchanged, so the API's per-address limits key on the caller (`server/domain/client-address.ts` takes the last entry, which CloudFront writes).
- **Shell:** Systems Manager Session Manager or `aws ssm send-command` with the `wind` CLI profile. There is no SSH port and no key.
- **Credentials:** none stored on the host. Its instance role may pull `wind-api` from ECR, add objects to `wind-backups-083712835043`, and take Systems Manager sessions (`AmazonSSMManagedInstanceCore`). GitHub assumes `wind-release-image` through OIDC only from `release-image.yml` on `master`.
- **Settings:** `/srv/wind-api.env` (root, 0600) holds the same keys as before, with `WIND_PUSH_SUBJECT=https://dlvxzw3gj596d.cloudfront.net`, `OSRM_URL=http://wind-osrm:5000` and `WIND_TRUST_PROXY=1`. The Firebase admin key was re-issued on 12 November (the old one stayed on the Azure disk).
- **Cron:** `infra/vm/wind.cron` at `/etc/cron.d/wind`: nightly backup 03:10 UTC, watchdog every minute.
- **Caddy:** started once by hand; its certificate lives in the `caddy_data` volume (keep it: sslip.io is not on the Public Suffix List, so Let's Encrypt's weekly limit is shared with every sslip.io user and a re-issue can be refused):

```sh
docker run -d --name caddy --restart unless-stopped --network windnet -p 80:80 -p 443:443   -e WIND_ORIGIN=<OriginName> --env-file /srv/caddy.env -v /srv/Caddyfile:/etc/caddy/Caddyfile:ro   -v caddy_data:/data -v caddy_config:/config --log-opt max-size=20m --log-opt max-file=3 caddy:2.10.2-alpine
```

After the move to Azure the stack is kept with `wind-api` stopped, so nothing writes to its copy of the database. Delete it only with the owner's approval.

### The first Azure VM (history, until 12 November 2026)

Production ran on Azure VM `wind-vm` in an earlier subscription (rg `wind-prod`, Sweden Central, `windapi236.swedencentral.cloudapp.azure.com`), image registry `windprodacr`, backups in Blob `windprodstore/wind-backups`. The last image there was `wind-api:20261110-help-ref` (`sha256:56d4df47…6cdd`, revision `bd51d592`). An extra, unused Container App also named `wind-api` cost about USD 3 a day. Delete all of it only with the owner's approval, after AWS has run well for two weeks.

### Firebase (done 7 November 2026, project `wind-development`)

The backend stays on the VM. Firebase only sends closed-app alerts and password-reset email. The production app `ps.wind.app` is registered. `GOOGLE_SERVICES_JSON` and the FCM V1 key were in the **old** EAS project `@osamaabujarad236/wind`; the organization project used from 16 November has neither yet (see the 16 November section). Email/password is on, client sign-up is **off** (or anyone could pre-create a Firebase user for someone's email), minimum 12 characters. Server settings: `WIND_FIREBASE_API_KEY` (restricted to Identity Toolkit), `WIND_FIREBASE_SERVICE_ACCOUNT` (base64 JSON), `WIND_EXPO_PUSH_ENABLED=1`. The repository is `osamaabujarad45-jpg/wind`.

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

`scripts/migrate-postgres.mjs` refuses loopback URLs, any URL option other than a single `sslmode=verify-full`, and a missing `--confirm`; it creates `wp16_staging` and applies migrations 3–41 under `MIGRATION_LOCK`. Migration 40 adds typed captain cash entries and opens shipping block reviews. Migration 41 permits an audited office handover decision. `/api/ready` must then report schema 41. Typed credits and payouts require migration 40. This is owner-run, never CI, and must not run concurrently with another migration. It initializes staging; it is not the legacy-data production importer.

`server/migrate.ts` separately restricts its import CLI to test mode, loopback and an isolated schema. Its `--freeze-writes` holds the SQLite lock only while taking the snapshot, releasing it before import. Production needs a reviewed importer and a continuously enforced freeze of every SQLite writer.

**Cutover boundary:** schema creation and controlled import write PostgreSQL, but do not by themselves make it authoritative. Returning to SQLite is allowed only while SQLite is still authoritative, continuously frozen, and compatible with the prior image, with no new authoritative PostgreSQL writes. Once sign-in/session creation, smoke tests, workers or other new business writes make PostgreSQL authoritative, freeze and recover forward there. Never restart a stale SQLite-backed container or re-import the old SQLite snapshot over that history. Image rollback must retain a compatible PostgreSQL backend/schema; backend reversal needs reconciled writes, two-vendor review and owner authorization. Prove the boundary in a staging readiness-failure drill after a new PostgreSQL write.

## Microsoft API references pinned by this template

- [Container Apps and managed environments](https://learn.microsoft.com/azure/templates/microsoft.app/2026-07-01/managedenvironments) and [Container Apps](https://learn.microsoft.com/azure/templates/microsoft.app/2024-03-01/containerapps).
- [PostgreSQL Flexible Server 2024-08-01](https://learn.microsoft.com/azure/templates/microsoft.dbforpostgresql/2024-08-01/flexibleservers), [PostgreSQL extensions and allowlisting](https://learn.microsoft.com/azure/postgresql/extensions/how-to-create-extensions), and [private VNet networking](https://learn.microsoft.com/azure/postgresql/network/how-to-networking).
- [Storage account 2026-06-01](https://learn.microsoft.com/azure/templates/microsoft.storage/2026-06-01/storageaccounts) and [Container Apps Azure Files mount with managed identity](https://learn.microsoft.com/azure/container-apps/storage-mounts-azure-files).
- [Private endpoint and storage DNS configuration](https://learn.microsoft.com/azure/storage/common/storage-private-endpoints), [Web PubSub 2024-03-01](https://learn.microsoft.com/azure/templates/microsoft.signalrservice/2024-03-01/webpubsub), and [Key Vault 2023-07-01](https://learn.microsoft.com/azure/templates/microsoft.keyvault/2023-07-01/vaults).
- [Container Apps liveness/readiness probes](https://learn.microsoft.com/azure/container-apps/health-probes). API liveness is `/api/health`; readiness is `/api/ready` for essential DB/migration state.
