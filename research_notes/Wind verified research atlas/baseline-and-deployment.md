# Wind baseline and deployment — command-verified atlas

Verified on 13 November 2026. Behavioural source statements below come from a clean detached worktree of `origin/master`, not from the modified root checkout. The worktree used was `C:\Users\osama\AppData\Local\Temp\opencode\wind-baseline-b89f220`. Existing handoff documents were used only to locate disputed claims and prior provenance records; every number reported as current was derived again.

Commands are PowerShell unless marked otherwise. Output excerpts preserve the relevant real command output.

## 1. Canonical revision and the root checkout

### Commands and output

```powershell
git rev-parse origin/master
# b89f2205965523b5ab8545dff3940d1eacb6062c

git rev-parse HEAD
# b60922952d607f698eee24b9c68ac3394daecd3c

git rev-parse master
# b60922952d607f698eee24b9c68ac3394daecd3c

git merge-base --is-ancestor origin/master HEAD
Write-Output "ancestor-exit=$LASTEXITCODE"
# ancestor-exit=1

git rev-list --left-right --count master...origin/master
# 6	277

$all = @(git status --porcelain=v1)
$modified = @(git diff --name-only)
$staged = @(git diff --cached --name-only)
$untracked = @($all | Where-Object { $_ -match '^\?\?' })
Write-Output "tracked_modified=$($modified.Count) staged=$($staged.Count) porcelain_total=$($all.Count) untracked_entries=$($untracked.Count)"
# tracked_modified=239 staged=0 porcelain_total=356 untracked_entries=117
```

### Finding

- **Canonical `origin/master`: `b89f2205965523b5ab8545dff3940d1eacb6062c`.**
- Root `HEAD` and local `master` are both `b60922952d607f698eee24b9c68ac3394daecd3c`.
- Exit 1 from `merge-base --is-ancestor` proves root `HEAD` is **not a descendant** of `origin/master`.
- In the left/right symmetric-difference count, local `master` is **6 ahead and 277 behind** `origin/master`.
- There are **239 tracked files with unstaged modifications**, zero staged files, and 117 untracked porcelain entries. The 356 total includes untracked directories collapsed by porcelain output, so 356 is not a claim that there are exactly 356 untracked files.

A new detached worktree was made rather than checking out or altering the root tree:

```powershell
git worktree add --detach C:\Users\osama\AppData\Local\Temp\opencode\wind-baseline-b89f220 origin/master
# HEAD is now at b89f220 Merge pull request #30 from osamaabujarad45-jpg/claude/app-completion-bugs-bf45b2
# worktree-add exit=0

git -C C:\Users\osama\AppData\Local\Temp\opencode\wind-baseline-b89f220 status --short --branch
# ## HEAD (no branch)
```

## 2. The suite counts, with the counting method exposed

I parsed the two literal arrays without importing or executing their test loops, and independently enumerated the clean worktree's top-level `tests` directory:

```powershell
@'
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const array = (source, name) => [...source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`))[1].matchAll(/["']([^"']+)["']/g)].map(m => m[1]);
const suites = array(read('scripts/run-tests.mjs'), 'suites');
const persistence = array(read('scripts/check-persistence.mjs'), 'tests');
const disk = fs.readdirSync(path.join(root, 'tests')).filter(f => f.endsWith('.test.mjs')).sort();
console.log(JSON.stringify({
  suites: suites.length,
  suitesTestMjs: suites.filter(x => x.endsWith('.test.mjs')).length,
  suitesOtherMjs: suites.filter(x => !x.endsWith('.test.mjs')),
  diskTestMjs: disk.length,
  persistence: persistence.length,
  persistenceTestMjs: persistence.filter(x => x.endsWith('.test.mjs')).length,
  missingFromDisk: suites.filter(x => !fs.existsSync(path.join(root, 'tests', x))),
  unselectedDisk: disk.filter(x => !suites.includes(x)),
  duplicateSuites: suites.filter((x, i) => suites.indexOf(x) !== i)
}, null, 2));
'@ | node --input-type=module -
```

Real output:

```json
{
  "suites": 131,
  "suitesTestMjs": 122,
  "suitesOtherMjs": [
    "phone-provider.mjs",
    "native-push-sqlite.mjs",
    "dispatch-sqlite.mjs",
    "ride-lifecycle-sqlite.mjs",
    "resource-scope-sqlite.mjs",
    "ledger-sqlite.mjs",
    "payments-sqlite.mjs",
    "activation-gates.mjs",
    "ops-sqlite.mjs"
  ],
  "diskTestMjs": 124,
  "persistence": 56,
  "persistenceTestMjs": 5,
  "missingFromDisk": [],
  "unselectedDisk": [
    "db-api.test.mjs",
    "db-persistence.test.mjs"
  ],
  "duplicateSuites": []
}
```

Thus the three requested counts at `b89f220` are:

| Requested measure | Verified count |
|---|---:|
| Entries in `scripts/run-tests.mjs`'s `suites` array | **131** |
| Top-level `tests/*.test.mjs` files on clean-origin disk | **124** |
| Entries in `scripts/check-persistence.mjs`'s `tests` array | **56** |

**Why 131 and 122 both appear:** 122 is only the subset of selected names ending in `.test.mjs`. The actual integration selection has nine additional `.mjs` suites, listed above, so its printed `selected.length` is 131. The 124 disk files are the 122 selected `.test.mjs` files plus two explicit exemptions. Neither **106** nor **97** is any of the three requested counts on this revision.

The exclusions are deliberate and are not silently lost tests. `scripts/run-tests.mjs:139-149` says:

```js
139: // Exempt with the reason it cannot run here. A new tests/*.test.mjs must be listed above or
140: // exempted here; the guard below fails the gate if one is silently orphaned.
141: const exempt = new Map([
142:   ['db-persistence.test.mjs', 'needs live PostgreSQL (WIND_TEST_DATABASE_URL); npm run test:persistence'],
143:   ['db-api.test.mjs', 'needs live PostgreSQL (WIND_TEST_DATABASE_URL); npm run test:persistence'],
144: ]);
145: // Selection discipline: every *.test.mjs on disk must be selected or explicitly exempt.
146: // This is what silently skipped four real suites (REVIEW-2026-10-29, P1 #4).
147: const onDisk = readdirSync(new URL('../tests/', import.meta.url)).filter(f => f.endsWith('.test.mjs'));
148: const orphaned = onDisk.filter(f => !suites.includes(f) && !exempt.has(f));
149: if (orphaned.length) throw new Error('Test files are not selected and not exempt: ' + orphaned.join(', '));
```

Both excluded files are present in the separate persistence array (`scripts/check-persistence.mjs:5`). An unfiltered persistence run also invokes `scripts/check-postgres-legacy.mjs` after the 56 array entries; that separate legacy runner is not included in the requested count of 56.

## 3. PostgreSQL on `DESKTOP-S2JKMK5`: available and working

I connected directly over the authorized SSH route and invoked the PostgreSQL 18.3 `psql` binary found on that PC. No database was started, stopped, or modified.

```powershell
ssh -i C:\Users\osama\.ssh\smartstore-runner -o HostKeyAlias=desktop-s2jkmk5.local -o ConnectTimeout=15 -o BatchMode=yes "pc gaming@DESKTOP-S2JKMK5" '"C:\wind-k5\.expo\implementation\postgresql18\bin\psql.exe" -h 127.0.0.1 -p 55493 -U fastship_test -d fastship_test -v ON_ERROR_STOP=1 -P pager=off -c "SELECT version();" -c "SELECT current_database() AS database, current_user AS db_user, inet_server_addr() AS server_addr, inet_server_port() AS server_port;" -c "SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name LIKE ''postgis%'' ORDER BY name;"'
```

Real output:

```text
                                 version
-------------------------------------------------------------------------
 PostgreSQL 18.3 on x86_64-windows, compiled by msvc-19.44.35222, 64-bit
(1 row)

   database    |    db_user    | server_addr | server_port
---------------+---------------+-------------+-------------
 fastship_test | fastship_test | 127.0.0.1   |       55493
(1 row)

          name          | default_version | installed_version
------------------------+-----------------+-------------------
 postgis                | 3.6.2           | 3.6.2
 postgis_raster         | 3.6.2           |
 postgis_sfcgal         | 3.6.2           |
 postgis_tiger_geocoder | 3.6.2           |
 postgis_topology       | 3.6.2           |
(5 rows)

ssh-psql exit=0
```

**Settled:** PostgreSQL **18.3** accepts connections at **`127.0.0.1:55493`**, with working database/user **`fastship_test` / `fastship_test`**. PostGIS **3.6.2** is available, and the core `postgis` extension is installed in that database. The other four PostGIS-family extensions are available but have no `installed_version` in this database. The claim that this PC has no usable PostgreSQL is false.

For additional process provenance, remote CIM showed the listener's executable and data directory:

```text
ExecutablePath : C:\wind-k5\.expo\implementation\postgresql18\bin\postgres.exe
CommandLine    : "C:/wind-k5/.expo/implementation/postgresql18/bin/postgres.exe" -D
                 "D:/wind-plan-20261110-astra/run/.expo/implementation/pgdata" -p 55493 -h 127.0.0.1 -c timezone=UTC
psql (PostgreSQL) 18.3
```

## 4. Production image provenance: registry facts verified, running-host identity still blocked

### What is recorded, and where

The disputed values are recorded in two local, untracked handoff/evidence documents, not asserted here as source code from `origin/master`:

- `docs/HANDOFF-2026-11-13-FABLE-5.2-FINAL-VERIFIED-CUTOFF.md:61-63`: tag **`20261112-aws1`**, revision **`4f647e77ddc4b4f2ed0ecbd047dc1037953d888d`**, digest prefix **`sha256:dabea399…`**, explicitly requesting reconfirmation after owner AWS access is refreshed.
- `research_notes/verification-2026-11-13/CLAIMS-LEDGER.md:69` (A-06): the same three values, classified **[other-agent]** from an earlier live-host inspection, not as freshly revalidated evidence.

### What I could re-verify now

The revision exists in Git and is an ancestor of canonical `origin/master`:

```powershell
git cat-file -t 4f647e77ddc4b4f2ed0ecbd047dc1037953d888d
# commit

git show -s --format="%H %cI %s" 4f647e77ddc4b4f2ed0ecbd047dc1037953d888d
# 4f647e77ddc4b4f2ed0ecbd047dc1037953d888d 2026-11-12T18:45:18+02:00 Merge pull request #28 from osamaabujarad45-jpg/claude/aws-migration-study

git merge-base --is-ancestor 4f647e77ddc4b4f2ed0ecbd047dc1037953d888d origin/master
Write-Output "ancestor-exit=$LASTEXITCODE"
# ancestor-exit=0

git tag --list 20261112-aws1
# [no output]
```

There is no **local Git tag** by that name; that does not contradict its use as a separate **ECR image tag**.

The available AWS credential works for STS and, importantly, for ECR `DescribeImages`. The CLI is installed as the Python module (`aws-cli/1.46.3`), although `aws.exe` is not on PATH:

```powershell
python -m awscli sts get-caller-identity --profile pool-bedrock-083712835043 --region eu-north-1
# {
#     "UserId": "AIDARG7NMPXR2QL5JR53V",
#     "Account": "083712835043",
#     "Arn": "arn:aws:iam::083712835043:user/BedrockAPIKey-vaer"
# }
# sts exit=0

python -m awscli ecr describe-images --repository-name wind-api --image-ids imageTag=20261112-aws1 --profile pool-bedrock-083712835043 --region eu-north-1 --query "imageDetails[0].{repository:repositoryName,tag:imageTags,digest:imageDigest,status:imageStatus,pushed:imagePushedAt,lastPull:lastRecordedPullTime}"
```

Real ECR output:

```json
{
    "repository": "wind-api",
    "tag": [
        "20261112-aws1"
    ],
    "digest": "sha256:dabea3995716b3c2f8f9a16ee3ce43bbe7e9bfe77c829e3ecfa7543b9eaad7dc",
    "status": "ACTIVE",
    "pushed": 1794502406.57,
    "lastPull": 1794502479.14
}
```

This **newly verifies the registry tag-to-full-digest association**. It does not by itself prove which container is currently running.

The public service is also ready, but readiness carries no image provenance:

```powershell
Invoke-WebRequest -Uri https://dlvxzw3gj596d.cloudfront.net/api/ready -TimeoutSec 20 -UseBasicParsing
# HTTP=200
# {"ok":true,"schema":3}
```

### What remains blocked

The available identity cannot inspect SSM managed instances, EC2, CloudTrail logs, or the ECR image manifest/config:

```powershell
python -m awscli ssm describe-instance-information --profile pool-bedrock-083712835043 --region eu-north-1
# An error occurred (AccessDeniedException) when calling the DescribeInstanceInformation operation:
# User: arn:aws:iam::083712835043:user/BedrockAPIKey-vaer is not authorized to perform:
# ssm:DescribeInstanceInformation on resource: arn:aws:ssm:eu-north-1:083712835043:*
# because no identity-based policy allows the ssm:DescribeInstanceInformation action
# ssm exit=255

python -m awscli ec2 describe-instances --filters Name=tag:Name,Values=wind-host --profile pool-bedrock-083712835043 --region eu-north-1
# UnauthorizedOperation ... not authorized to perform: ec2:DescribeInstances because no identity-based policy allows it
# ec2 exit=255

python -m awscli logs filter-log-events --log-group-name aws-cloudtrail-logs-083712835043-e30e982e --filter-pattern "ECR" --profile pool-bedrock-083712835043 --region eu-north-1 --max-items 1
# AccessDeniedException ... not authorized to perform: logs:FilterLogEvents on the named log group
# logs exit=255

python -m awscli ecr batch-get-image --repository-name wind-api --image-ids imageDigest=sha256:dabea3995716b3c2f8f9a16ee3ce43bbe7e9bfe77c829e3ecfa7543b9eaad7dc --profile pool-bedrock-083712835043 --region eu-north-1
# An error occurred (AccessDeniedException) when calling the BatchGetImage operation:
# User: arn:aws:iam::083712835043:user/BedrockAPIKey-vaer is not authorized to perform:
# ecr:BatchGetImage on resource: arn:aws:ecr:eu-north-1:083712835043:repository/wind-api
# because no identity-based policy allows the ecr:BatchGetImage action
# batch-get-image exit=255
```

Consequently, I **cannot currently prove the running container's digest or its `org.opencontainers.image.revision` label**. The full Git revision is verified as a commit; its association with the registry image config and with the live process was not re-verified by me.

### Exact owner-session command that settles the live container

With the owner's refreshed Systems Manager permission, this Bash command reads the running container's configured image (the deploy script runs it by digest), revision labels, and the local image's registry digests/tags:

```bash
aws ssm send-command --profile osama --region eu-north-1 \
  --document-name AWS-RunShellScript \
  --targets 'Key=tag:Name,Values=wind-host' \
  --parameters '{"commands":["sudo docker inspect wind-api --format {{.Config.Image}}","sudo docker inspect wind-api --format {{json .Config.Labels}}","sudo docker image inspect $(sudo docker inspect wind-api --format {{.Image}}) --format {{json .RepoDigests}} {{json .RepoTags}}"]}'
```

Then read the actual command output using the returned command ID:

```bash
aws ssm list-command-invocations --profile osama --region eu-north-1 \
  --command-id <CommandId-from-send-command> --details
```

Compare the live digest with the now-verified ECR value `sha256:dabea3995716b3c2f8f9a16ee3ce43bbe7e9bfe77c829e3ecfa7543b9eaad7dc` and the revision label with `4f647e77ddc4b4f2ed0ecbd047dc1037953d888d`. The ECR tag query above completes the tag association even if a host pulled only by digest has no local `RepoTags` entry. I did not issue `send-command`; the live read-only credential's SSM denial is shown above.

## 5. The production APK really contains the retired Azure host

### Artifact identity

```powershell
(Get-Item -LiteralPath C:\Users\osama\AppData\Local\Temp\opencode\wind-prod.apk).Length
# 107454199

Get-FileHash -Algorithm SHA256 -LiteralPath C:\Users\osama\AppData\Local\Temp\opencode\wind-prod.apk | Format-List Algorithm,Hash,Path
# Algorithm : SHA256
# Hash      : 5248ABE94BB46DD9555E3DFEA4724C38279624B25A18AC1DCB58A66516891ABB
# Path      : C:\Users\osama\AppData\Local\Temp\opencode\wind-prod.apk
```

### Exact decompressed-ZIP search

Searching only raw APK bytes would miss deflated members, so this search read **every file entry decompressed by Python's `zipfile`** and counted non-overlapping byte-string occurrences. It also ran the ZIP CRC check and a case-insensitive CloudFront-domain regex:

```powershell
@'
import zipfile, re
p = r'C:\Users\osama\AppData\Local\Temp\opencode\wind-prod.apk'
needles = [
    b'windapi236.swedencentral.cloudapp.azure.com',
    b'dlvxzw3gj596d.cloudfront.net',
    b'cloudfront.net',
]
counts = {n: [0, []] for n in needles}
cloudfront_domains = set()
with zipfile.ZipFile(p) as z:
    print('zip_entries=', len(z.infolist()), 'testzip=', z.testzip())
    for info in z.infolist():
        if info.is_dir():
            continue
        data = z.read(info)
        for n in needles:
            c = data.count(n)
            if c:
                counts[n][0] += c
                counts[n][1].append((info.filename, c))
        for m in re.finditer(rb'(?i)(?:[a-z0-9-]+\.)+cloudfront\.net', data):
            cloudfront_domains.add(m.group().decode('ascii'))
for n in needles:
    print(n.decode(), 'occurrences=', counts[n][0], 'entries=', counts[n][1])
print('cloudfront_domains=', sorted(cloudfront_domains))
'@ | python -
```

Real output:

```text
zip_entries= 1408 testzip= None
windapi236.swedencentral.cloudapp.azure.com occurrences= 1 entries= [('assets/index.android.bundle', 1)]
dlvxzw3gj596d.cloudfront.net occurrences= 0 entries= []
cloudfront.net occurrences= 0 entries= []
cloudfront_domains= []
apk scan exit=0
```

`testzip=None` means no member failed its CRC check. **The old Azure host occurs once, in `assets/index.android.bundle`; the current CloudFront host and even the generic suffix `cloudfront.net` occur zero times anywhere in the 1,408-entry APK.**

### How a release build mechanically gets the dead host

At `origin/master`, `src/api.ts:11-13` does not hardcode either production service. It reads the build-time public variable and otherwise uses a development fallback:

```ts
11: // Dev: the API runs next to Metro on port 4000 (npm run server). Production: EXPO_PUBLIC_API_URL.
12: const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
13: export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? `http://${devHost ?? 'localhost'}:4000`).replace(/\/+$/, '');
```

The fallback is the Metro host or `localhost:4000`, **not CloudFront**. `eas.json:11-14` selects an EAS environment named `production` but does not supply the URL in the repository:

```json
11:     "production": {
12:       "autoIncrement": true,
13:       "environment": "production"
14:     }
```

`.env.example:1-5` explicitly says the public values are compiled into the app, directs the builder to the EAS production environment, and leaves the API value blank:

```dotenv
1: # Public values are compiled into the app. Never put API or partner secrets here.
2: # Copy to .env.local for development, or configure the EAS production environment.
3: EXPO_PUBLIC_API_URL=
4: EXPO_PUBLIC_SUPPORT_WHATSAPP=
5: EXPO_PUBLIC_SUPPORT_CONTACT=
```

Finally, `app.config.js:13-15` states the build-time behaviour directly: `Store builds bake EXPO_PUBLIC_API_URL into the bundle.` Its release guard (`app.config.js:46-55`) requires a public HTTPS URL and rejects local/reserved hosts, but it does **not** require the hostname to equal the current CloudFront distribution. The retired Azure URL is valid public HTTPS and therefore passes that guard.

Thus the mechanical path is: **the production build environment supplied the old Azure `EXPO_PUBLIC_API_URL`; Expo baked that value into `index.android.bundle`; later moving the server to CloudFront cannot rewrite an already-built APK.** The artifact and source prove that mechanism. I did not read EAS project history, so I do not claim to have independently identified who set the historical EAS value or when.

## 6. The ETA formulas, exact source and units

### Server: `server/domain/journey.ts`

The numbered clean-origin source is:

```ts
 8: export function etaProjection(raw: number | null, issuedAt: number, expiresAt: number, now = Date.now(),
 9:   basis: JourneyEta['basis'] = 'heuristic', band?: [number, number]): JourneyEta | undefined {
10:   if (!safe(issuedAt) || !safe(expiresAt) || expiresAt <= issuedAt || !safe(now) || issuedAt > now || now >= expiresAt
11:     || raw !== null && (!safe(raw))) return undefined;
12:   const min = band?.[0] ?? raw, max = band?.[1] ?? (raw === null ? null : (Math.round(1.3 * Math.ceil(raw / 60)) + 2) * 60);
13:   if (!safe(min) || !safe(max) || max < min || raw !== null && (raw < min || raw > max)) return undefined;
14:   return { schemaVersion: 1, rawSeconds: raw, minSeconds: min, maxSeconds: max, basis,
15:     accuracy: basis === 'straight_line' ? 'low' : 'unknown', serverTime: now,
16:     validity: { issuedAt, expiresAt, expiresInSeconds: Math.max(0, Math.ceil((expiresAt - now) / 1000)) } };
```

**Units:** `raw` is **seconds**. With no explicit `band`, `Math.ceil(raw / 60)` first converts to whole minutes. `Math.round(1.3 * minutes) + 2` evaluates to an upper bound in **minutes**, and the final `* 60` converts it to **`maxSeconds`**. The default minimum is the raw seconds; an explicit band supplies seconds directly. Therefore the second disputed formula is present as the server's inner calculation, but describing that expression alone as its final seconds value omits the real `* 60`.

### Client: `src/map-math.ts`

```ts
102: /** ETA shown as a range: checkpoints and closures make a single road-time number lie. */
103: export const etaRange = (minutes: number): [number, number] => [minutes, Math.round(minutes * 1.3) + 2];
```

**Units:** both the argument and returned tuple are **minutes**. It uses `Math.round`, not `Math.ceil`, and it does not perform the server's seconds-to-minutes conversion because it already receives minutes.

**Verdict:** `ceil(minutes × 1.3) + 2` is not either implementation. Client is `round(minutes × 1.3) + 2` minutes. Server default upper bound is `(round(1.3 × ceil(rawSeconds / 60)) + 2) × 60` seconds.

## 7. Optional clean-worktree typecheck and lint — actually rerun

These were **local fallback runs on this Windows machine**, not claimed as remote `k5` evidence. The worktree was detached at `b89f2205965523b5ab8545dff3940d1eacb6062c`; `npm ci` installed the lockfile dependencies into that isolated worktree.

```powershell
node --version
# v24.12.0
npm --version
# 11.11.0
npm ci
# added 871 packages, and audited 876 packages in 3m
# npm-ci exit=0

npm run typecheck
# > wind@1.0.0 typecheck
# > tsc --noEmit && tsc --noEmit -p tsconfig.server.json
# typecheck exit=0

npx expo lint
Write-Output "npx-expo-lint exit=$LASTEXITCODE"
# npx-expo-lint exit=0
```

I repeated `npx expo lint` and `npm run typecheck` in the foreground; both again returned exit 0. `git diff --name-only` afterwards produced no output, so the checks did not alter tracked source. The three installed packages named by the earlier failure claim were also present (`expo-auth-session@57.0.16`, `expo-web-browser@57.0.3`, `expo-notifications@57.0.25`).

**Result here:** typecheck **passes**, and lint **also passes with exit 0 and no diagnostics**. The claimed three unresolved-module lint errors did **not** reproduce in this local clean-worktree run. This is not a claim that an earlier remote log was fabricated; it is a different observed machine/toolchain result, with no root-cause speculation added.

## Concise verdicts

| Question | Verified answer | State |
|---|---|---|
| Canonical revision | `origin/master` `b89f2205965523b5ab8545dff3940d1eacb6062c`; root is 6 ahead/277 behind, not a descendant; 239 tracked modified files | Verified |
| Suite counts | 131 integration entries = 122 `.test.mjs` + 9 other `.mjs`; 124 disk `.test.mjs`; 56 persistence entries | Verified |
| PostgreSQL | 18.3 works on `127.0.0.1:55493`; `fastship_test` database/user; PostGIS 3.6.2 available and core extension installed | Verified |
| Production provenance | ECR tag `20261112-aws1` maps to full digest `sha256:dabea3995716b3c2f8f9a16ee3ce43bbe7e9bfe77c829e3ecfa7543b9eaad7dc`; Git revision exists and is canonical ancestor | Registry/Git verified; live running identity blocked by SSM/host permissions |
| APK host | One Azure-host occurrence in the JS bundle; zero CloudFront-host or `cloudfront.net` occurrences across all APK entries | Verified |
| ETA | Client rounds minutes; server ceils raw seconds to minutes, rounds the inflated minute value, then multiplies by 60 | Verified |
