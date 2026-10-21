# Handoff — deploy Wind API 1.0.13 and verify maps on the A53 (21 October 2026)

## Resumed status

The main `Fastship` checkout is recovered and clean at `5770dab`, pushed to
`origin/master`. It includes `f7f8629`, which reauthenticates held live requests
after logout. All 39 test files pass on that implementation; lint, typecheck,
15 browser scenario groups, customer-location checks and Expo Doctor also pass.
Earlier main-checkout edits are preserved in a named Git stash.

Production-owner browser and CLI login are restored. The private backup script
now uses renewable CLI OAuth and removes both expired token overrides. Existing
encrypted snapshots from 06:23 UTC restore successfully; a new export has not
succeeded yet. Railway CLI 4.36.1 omitted the new `ssh_keys` scope. Version 5.71.0
is available in the local npm cache; its additional SSH-key permission is awaiting
the owner's specific approval in this chat. No SSH keys have been created.

Railway is also blocking deployments platform-wide. Its [incident
update](https://status.railway.com/incident/QH8L8B3E) at 13:40 UTC says builds remain
paused and some API features are unavailable. Wind's service screen confirms
“Deploys have been paused temporarily.” Existing production deployment
`88654339-9a08-4db4-9a5c-8dba7ea7af38` remains healthy and serves the old code.

Next: finish the pending SSH-scope authorization, verify current-CLI SSH and a
fresh encrypted backup/restore, then deploy after Railway resumes builds. Keep
using the project/environment/service IDs and smoke checks below. Evidence:
`.expo/release-*.log`, `.expo/release-production-before.json` and
`.expo/release-rollback.json`. The source-only release archive is outside the repo
at `../Release-2026-10-21/wind-api-f7f8629.zip`.

The original handoff below is historical. Its expired-authentication and static
token renewal steps are superseded by the resumed status above.

Owner approved: **deploy the new API to Railway production and verify maps on the phone against it.**
Read `AGENTS.md`, `CLAUDE.md` and [the QA report](QA-2026-10-21.md) first.

## State

- `master` = `origin/master` (this branch `claude/wind-app-maps-auth-1edda1` is the same commit). All tests,
  browser scenarios, screens and phone checks passed on it; see the QA report.
- Signed **Android 1.0.13 (code 14)** is installed on the A53 (`R5CTB0FJP9Z`), pointing at
  `https://wind-production-72aa.up.railway.app`. APK and hash: `../../Release-2026-10-21/` (outside the repo).
- Production still runs the **old API**. The new one adds `/map.html` changes (Android map), live driver long-poll
  (`/orders/:id/live`, `/track/:token/live`), `accepted` on `/api/location`, GPS jump gate, email routes.
  All additive: old clients keep working.
- The main checkout (`Fastship/`) still has uncommitted edits from an earlier agent; every one of them is already on
  `master`. Do not commit from there; use this worktree or a fresh pull.

## Blockers found (owner action)

1. **Railway auth is dead on this PC.** The Windows env `RAILWAY_TOKEN` is invalid (it overrides any login, so remove it
   for the shell: `Remove-Item env:RAILWAY_TOKEN`), the CLI OAuth session expired, and the private backup token
   (`%LOCALAPPDATA%/SouqWindPrivate/railway-token.protected`) returns Unauthorized. A `railway login` is waiting in the
   Claude terminal tab "railway login"; the owner must press Enter there and approve in the browser (or run
   `railway login` in an interactive shell after removing `RAILWAY_TOKEN`). Never type credentials yourself.
2. **Hourly production backups have failed since about 10:00 local** for the same reason. Last good encrypted backups:
   `%LOCALAPPDATA%/SouqWindPrivate/backups/{souq,wind}-20261021T062342Z.dpapi` (integrity ok). The owner needs a new
   Railway account token from the dashboard; store it with DPAPI the same way (`ConvertFrom-SecureString`) into
   `railway-token.protected`, then run `railway-backup.ps1` and `railway-backup.ps1 -VerifyLatest`.
3. **The A53 is PIN-locked** (a screen-off test). The owner unlocks it; never enter the PIN.

## Steps

1. After the owner's login: `railway whoami`, then a fresh backup. With the new private token:
   `& "$env:LOCALAPPDATA/SouqWindPrivate/scripts/railway-backup.ps1"` (both services; must end with a new
   `last-success.json`). Without it, export Wind's DB with `railway ssh` the way that script does (read-only
   `node:sqlite` backup to stdout) and verify it restores before deploying. Do not deploy without a verified backup.
2. Deploy **from the app folder** (this worktree root; from the workspace root the upload is 500 MB and gets 413):
   `railway up --project d48f27dc-65bf-4448-8186-281915b212d0 --environment db21ec63-6220-4b27-892d-b855ed688285 --service wind --detach`
   (check `railway up --help` on CLI 4.36.1 for exact flags; `.railwayignore` excludes local DBs and artifacts).
   Follow the build/deploy logs until the deployment is SUCCESS. Record the deployment id.
3. Verify production:
   - `GET /api/ready` → `{"ok":true,"schema":3}`; `GET /api/health` → 200.
   - `GET /api/auth/options` → contains `"emailReset":false` (proves the new build is live; email stays off).
   - `GET /map.html` contains `glideMs` and `78271.52` (new Android map page).
   - Unauthenticated `GET /api/orders/1/live` → 401 (route exists), not 404.
   - Rollback if any fails: `railway redeploy` of the previous deployment, or re-upload the previous commit
     (`191944e`) the same way, then restore checks.
4. Phone (unlocked, adb): `adb shell monkey -p ps.wind.app -c android.intent.category.LAUNCHER 1`. Signed in as the
   production customer test account "QA". Check, with screenshots (`adb exec-out screencap -p > file.png`):
   - Home loads, no `FATAL EXCEPTION` in `adb logcat`.
   - Book parcel → "use my current location" picks the phone's real city → "pickup on the map" shows tiles with
     Arabic labels (new `/map.html`, ready only after tiles).
   - Choose both cities so the booking route map shows the **road line from production OSRM**.
   - Cancel. **Do not submit an order**: a real searching order alerts real drivers. Live tracking in production needs
     an order; ask the owner first. Live tracking itself was already proven on this phone against identical code
     (QA report: background, screen off, relaunch).
5. Write the results (deployment id, endpoint checks, screenshots list) into `docs/QA-2026-10-21.md` under
   "Device evidence" and remove "Production deployment" from "Not covered here". Commit and push to `master`.

## Email (owner, later)

Cloudflare account `673a82249cc2db40e12e81d6bd793927` has no domain on Cloudflare DNS, so Email Service answers
`sender_not_configured`. When a domain is onboarded (Email Service → Email Sending), set on the Railway `wind`
service: `WIND_EMAIL_FROM`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_TOKEN` (Email Sending: Edit). The app shows the
email flows only after that. `tests/email.test.mjs` covers the behaviour against a fake Cloudflare endpoint.

## Rules

No production orders, messages or payments without the owner. No credential entry. Run `npm run typecheck`,
`npm run lint`, `npm test` before any code change ships. Commit message trailer as in earlier commits.
