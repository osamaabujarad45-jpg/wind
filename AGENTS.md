This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Test device and heavy work (owner rule, 29 Oct 2026)

- **Never use an emulator.** All acceptance and UI testing uses the connected physical Android phone (`SM-A5360`, adb serial `R5CTB0FJP9Z`). If it is not attached, stop and ask instead of starting one.
- **Tests run in the Docker cloud sandbox** (see "Default test sandbox" below; owner decision, 19 Nov 2026). The local WSL runner below is the emergency fallback, used only with the owner's sign-off. From Git Bash in any checkout:
  `MSYS_NO_PATHCONV=1 wsl.exe -e sh /mnt/c/<path-to-checkout>/scripts/test-device.sh [--serial] [typecheck lint unit persistence export parity]`
  It sends one archive, never a mount: a clean checkout from git objects (`git archive <commit>`, the gate evidence), uncommitted work as tracked and unignored regular files without credential-looking names (`.env*` except `.env.example`, `.npmrc`, keys, `credentials*`, `secrets*`; a tracked one stops a clean run) into `sandbox-node24:<hash of the Dockerfile and base image>` (built from `infra/test-device/Dockerfile` alone, on the owner's `sandbox-node:local`: Node 24.12 with a pinned SHA-256, PostgreSQL 16 and 18 clients), reuses `node_modules` per lockfile and image id from the `wind-test-cache` volume (a package file changed in place fails the run and drops the entry), runs typecheck+lint+export and then unit+persistence+parity side by side, the full persistence suite on a PostgreSQL 18 sidecar (`wind-test-pg18`, 55475; unit gets `wind-test-pg18u`, 55476; both removed after the run; 55474 stays free for ad-hoc checks), and `parity` on the owner's PostgreSQL 16 device (`sandbox-pg-host`, 55473). Runs are serialized by a lock; unknown suite names are refused. Logs: `.expo/test-device/<UTC>-<pid>/` (`env.txt` with the revision, `summary.txt`); the exit code is non-zero unless every requested suite ran and passed. Gate evidence comes from a clean worktree (`git worktree add --detach`), where `env.txt` shows `+0 uncommitted`. Local Windows runs are for quick single-file checks only and are never gate evidence.
- Keep the phone's test backend on `adb reverse` (the QA sandbox binds `127.0.0.1`), and do not clear the phone's Chrome profile.

## Default test sandbox — Docker cloud sandbox (owner decision, 2026-11-19)

**All tests for this repo run in the Docker cloud sandbox `sbx_001m7sknp49sr4g8bytx182r0z2`, not the local WSL2 sandbox.** `C:\Users\osama\.docker-sandbox\test-cloud.ps1` is the entry point (wraps `sbx_sync.sh`, which runs over SSH using the passphrase-free key `C:\Users\osama\.ssh\sbx_cloud` + cert `C:\Users\osama\.docker-sandbox\sbx-cert.pub`):

```powershell
C:\Users\osama\.docker-sandbox\test-cloud.ps1              # sync + npm test (CI-equivalent)
C:\Users\osama\.docker-sandbox\test-cloud.ps1 -VerifyOnly  # re-run npm test, no sync
```

The runner rsyncs the source tree (`.expo`/`.claude`/`.artifacts`/`.git`/`node_modules`/`research_notes` excluded), provisions Node 24.12.0 (matches CI) + pinned Bicep 0.48.1, syncs the prebuilt `node_modules`, repairs the 4 Windows junction links (`decode-uri-component`, `deepmerge`, `node-forge` ×2) with real copies of `vendor/`, starts PostGIS 16 on :55473, and runs `npm test` with `WIND_TEST_DATABASE_URL=postgresql://fastship_test@127.0.0.1:55473/fastship_test`. Verified live 2026-11-19: **Integration gate: 106 suites passed**.

- **Never run `npm ci`/`npm install` in the sandbox.** The repo's `"overrides": { "decode-uri-component": "$decode-uri-component", ... }` makes npm's `OverrideSet` call `semver.intersects()` on `file:./vendor/decode-uri-component` → `TypeError: Invalid comparator` (fails on npm 9/10/11 alike). The runner's node_modules sync exists for exactly this reason.
- The cloud sandbox cannot mount the host workspace; the source is always synced in. Local working-tree changes are what get tested (uncommitted files included).
- Tests that need live Azure tooling are covered by the pinned standalone Bicep 0.48.1 via `BICEP_COMMAND=/home/agent/bicep/bicep`; no Azure login is used.
- The SSH cert expires ~every 24h (`CertDeadline` in `connect-cloud.ps1`). When expired, regenerate the connect script on the sandbox page and re-paste its cert into `C:\Users\osama\.docker-sandbox\sbx-cert.pub` (the page issues it over `sbx_cloud`; fingerprint `SHA256:XLUSjvELzLphDllOr345++YdfmHspR7GeCuAqIBxatQ`).
- Local WSL2 runner (`C:\Users\osama\.docker-sandbox\test.ps1`) remains as an emergency fallback only; cloud is the default per owner decision 2026-11-19. WSL2 was broken earlier that day by a full C: drive and was repaired (Temp/.cache cleaned, ~34 GB freed).
- A branch or worktree: `sbx_sync.sh` hardcodes the main checkout and the remote workspace `wind`. Run a copy with `REPO_WIN=<worktree path under /mnt/c>`, its own `WS` (for example `wind-<branch>`) and Linux `node_modules` built for that lockfile, so another session's workspace is never overwritten. The sandbox also runs typecheck, lint, the web export, `test:persistence` on a PostgreSQL 18 sidecar and the PG16 parity suites; `postgresql-client-16`/`-18` are installed there (19 Nov).
- If the cloud sandbox itself expires/disappears, do not silently fall back: the owner re-creates/regenerates it, then the cert is re-pasted as above.

## Agent recovery and provider failover (owner rule, 10 Nov 2026)

- Monitor delegated work through the harness's Monitor tool where supported, or completion/failure/timeout notifications. Honor its `next` instruction; use supported waits and retry scheduling, not sleep/status-poll loops. Set a task-specific timeout before dispatch (10 minutes for a bounded review by default).
- On a stall, transient error or rate limit, preserve the task ID, exact error and useful checkpoint. Allow at most two recovery retries per provider/model; honor `Retry-After`. A hard quota exhaustion, cooldown beyond the task window, or repeated no-progress failure triggers failover instead of indefinite retries. A wait returning early does not by itself prove the child is stuck.
- The owner authorizes automatic provider/model failover for this repo. Choose an available configured alternative using verified role-specific history, the agent-orchestra evidence ledger and the lead's recommendation. Prefer a healthy independent quota pool; discover exact IDs and use the highest supported effort. Record and report the old/new model, provider, effort and reason. Task-specific owner restrictions still win.
- Cancel a still-running task before replacing it; preserve its files and pass a concise checkpoint plus remaining acceptance checks to the replacement. Reviews and rechecks use a new delegated task. Keep one writer per file.
- Apply the same bounded retry/failover policy to replacements. Track attempted provider/model pairs to avoid cycling through exhausted pools. Continue until the work passes its original checks or all viable alternatives are exhausted; then report exact failures and the owner action needed while continuing independent work.
- Failover never relaxes review/test gates, changes task scope, or grants permission for paid infrastructure, production migrations, service activation or data deletion.
