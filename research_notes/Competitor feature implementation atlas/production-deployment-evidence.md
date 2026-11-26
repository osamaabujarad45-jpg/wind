# Production deployment evidence (delegated pass, 13 Nov 2026)

Context transfer from a delegated read-only verification run. Reproduced verbatim from the
completed task output; credentials redacted by the researcher. This is Wind production state,
not competitor research — included because the atlas must not assert "production" claims without it.

## Key verified facts (fresh, this session, read-only)

### Git / release provenance
- Working dir: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship`, local `master` @ `b609229`, dirty, **ahead 6 / behind 277** vs `origin/master` (`git rev-list --left-right --count origin/master...master` → `277  6`).
- `git ls-remote origin refs/heads/master` → `b89f2205965523b5ab8545dff3940d1eacb6062c` (canonical `origin/master`).
- Object `4f647e77ddc4b4f2ed0ecbd047dc1037953d888d` exists, is `2026-11-12 18:45:18 +0200` merge of PR #28 ("Move production hosting from Azure to AWS"), and is an ancestor of `origin/master`. No git tag `20261112-aws1` exists anywhere (ECR image tag only). `git grep -E "20261112-aws1|dabea3995716|4f647e77ddc4"` on origin/master → no matches; the strings live in untracked docs only.
- The five/six "earlier verification docs" (`HANDOFF-2026-11-13-FABLE-5.2-CUTOFF.md`, `…FINAL-VERIFIED-CUTOFF.md`, `REPORT-2026-11-13-VERIFIED-STATE-AND-GAPS.md`, `VERIFICATION-ADDENDUM-2026-11-13-FINAL.md`, `CLAIMS-LEDGER.md`, `HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md`) are **untracked, not on `origin/master`**; UBER-GRADE exists only in a stray worktree. `docs/operations/deploy.md` in the root tree is stale (Azure-only); `origin/master`'s version has a "Production host on AWS" section.

### AWS (fresh, read-only; `python -m awscli` v1.46.3; AWS CLI v2 "not present" in this env)
- `python -m awscli sts get-caller-identity --profile pool-bedrock-083712835043` → `{"UserId":"AIDARG7NMPXR2QL5JR53V","Account":"083712835043","Arn":"arn:aws:iam::083712835043:user/BedrockAPIKey-vaer"}`.
- `--profile wind` / `--profile osama` → `Your session has expired … aws login` (exit 255).
- **ECR `wind-api`: exactly one image.** `20261112-aws1`, digest `sha256:dabea3995716b3c2f8f9a16ee3ce43bbe7e9bfe77c829e3ecfa7543b9eaad7dc`, pushed `2026-11-12T16:53:26Z`, pulled `16:54:39Z`, `ACTIVE`, 86,309,038 B (~82.3 MiB).
- Batch-get-image on that image → AccessDenied (image config/revision label unreadable from here).
- GitHub (`gh`, logged in as `osama-2000236`): release-image workflow run `43263201635` **success** on head_sha `4f647e77ddc4…`, 2026-11-12T16:51:27Z; pushed `wind-api:20261112-aws1` digest `sha256:dabea3995716b…`; failed predecessor `43262109795` (OIDC AssumeRoleWithWebIdentity denied) — PR #29 codified the fix afterwards.
- EC2 `DescribeInstances`, SSM, CloudFormation `DescribeStacks` (leaks stack physical ID `d11cbdb0-deb3-11f1-8e7c-06ffc9f28a8f` in the error), CloudFront `ListDistributions`, SNS, `logs:FilterLogEvents`, `s3api get-bucket-versioning`, `ecr batch-get-image`, `freetier:GetAccountPlanState` — **all AccessDenied (exit 255)**.
- `synthetics describe-canaries --region eu-north-1` → `{"Canaries": []}`. `cloudwatch describe-alarms --alarm-name-prefix wind` → `{"MetricAlarms": [],"CompositeAlarms": [],"LogAlarms": []}`. No Wind log groups.
- `s3 ls s3://wind-backups-083712835043` → exactly two objects, 10,148 B each: `wind-20261112T165723Z.db.gz` (12-Nov 16:57Z UTC) and `wind-20261113T031001Z.db.gz` (13-Nov 03:10:04Z UTC).
- Public: `Invoke-WebRequest https://dlvxzw3gj596d.cloudfront.net/api/ready` → **200 `{"ok":true,"schema":3}`**; `/api/health` → **200 `{"ok":true}`**; hourly Uptime green.

### Azure (`azure-cli 2.91.0`)
- `az account list` → "Azure subscription 1" `9b3ca69d-0c12-40c8-8a47-11aec6a73840` **Enabled**; "Azure for Students" `b1c03267-01e8-4ca6-96d1-e3390c2f9bd8` **Disabled**. Create-time docs saying Azure was disabled are contradicted at ARM layer (fresh read), but data plane is broken:
- VM `wind-vm` (RG `wind-prod`, swedencentral) — deallocated, `20.91.209.132`.
- Container App `wind-api` present, `provisioningState: Failed`, no ingress — the "unused" app is confirmed still there.
- ACR `windprodacr` (Basic, admin Enabled) exists but `repository list` → connectivity_forbidden_error; old Azure image unverifiable.
- Storage `windprodstore` (swedencentral) exists; `az storage blob list --auth-mode login` → **AccountIsDisabled** (2026-11-13T15:39:20Z).

## What is still not established (needs owner re-auth / host access)
- What is **running** on the host: running image digest, `org.opencontainers.image.revision` label, deploy time, env key names. The settling command requires a refreshed owner session; the CloudFront config is unreadable with the current credential.
- That the running container is `20261112-aws1` (the pull time is indirect; rollback container `wind-api-pre-20261112-aws1` may exist).
- Backup integrity re-verified here: not re-run (only metadata presence checked this pass).
- Plan/spend-limit state: denied to both the read-only key and expired login.

## Consequences for the plan
- The untracked 2026-11-13 "FINAL" docs must be treated as **historical, unverified**, not canonical. `origin/master` is canonical.
- The production APK on the phone still points at the retired Azure host per the same untracked docs; the AWS API is healthy but the client is not aligned to it.
- Backup retention/restore drill still has no fresh evidence since 13 Nov 03:10Z run; integrity was verified in a previous pass only for objects downloaded.
