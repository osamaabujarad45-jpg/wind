# Application review and release readiness — 5 November 2026

**Verdict: not ready for public release.** This review fixes confirmed problems in the current workspace, but does not establish that every line, provider, device, operational process, or signed release artifact is ready. It preserves the substantial pre-existing uncommitted work; nothing was committed or deployed.

## Fixes

- A platform-specific Android Google Maps key was removed by the release config plugin. The guard now preserves it and still removes stale keys from baseline builds (`plugins/with-release-guard.js`, `tests/phone-test-build.test.mjs`).
- Secure storage read failures could leave the app permanently behind its intro; a transient server failure at session restoration could incorrectly show sign-in. The app now fails closed or shows retry as appropriate (`src/session.tsx`, `tests/quality-recovery.test.mjs`).
- A customer could accept an old offer after its service was disabled. The guard runs before capacity reservation (`server/main.ts`, `tests/sqlite-review.test.mjs`).
- PostgreSQL cash-on-delivery final collection/remittance retries were rejected after a lost reply, and a return could close while collected money remained unremitted. Retries now reconcile, conflicting collection payloads fail, returns require remittance, and the decision reason is recorded (`server/domain/payments.ts`, `tests/payments.mjs`). This path remains gated from the current SQLite production runtime.
- An explicitly enabled, non-production OpenCode child inherited unrelated server secrets. Its environment is now restricted (`server/domain/opencode.ts`, `tests/opencode.test.mjs`); this does **not** sandbox its filesystem access.
- With owner approval, in-app account deletion now requires the current password or a fresh Microsoft sign-in. Microsoft proof uses a one-time session-bound server challenge, fresh `auth_time`, identity matching and replay protection. Both paths recheck the session and credential under the deletion transaction; stale client callbacks cannot delete under a replacement session. Tests cover wrong or missing proof, stale/mismatched/expired Microsoft proof, account switching and credential/session races.
- The privacy page now describes the actual three-second native location request and the optional pre-assignment presence path.

## Release blockers and operational decisions

1. The deployed API is not this workspace. The read-only deployment probe returned HTTP 200 for health/readiness and HTTP 401 for anonymous order tracking, but `/map/v1/map.html` returned **404** and `/map.html` differed from the current source. Deploy and verify the compatible API/map first, using a separately approved rollout and rollback plan.
2. The account-deletion change breaks older installed clients that send no proof. Release the new app before applying the server change, and retain the existing support deletion path. For Microsoft accounts, configure `auth_time` as an optional **ID token** claim and verify fresh sign-in with the actual tenant. The passing identity tests use a synthetic provider; no live Microsoft verification is claimed.
3. `GET /api/auth/options` on the existing deployment reports registration open and email reset disabled. Real SMS/email delivery, ownership verification, native push delivery, monitoring, staffed support, retention/backup handling, licenses and field operations still need owner/provider acceptance. Card payments, automatic dispatch, passenger/freight activation and PostgreSQL cutover remain gated; no real provider was enabled here.
4. Expo Doctor reports seven SDK 57 patch-version mismatches. `npx expo install --fix` failed in npm with `Cannot read properties of null (reading 'name')`; a clean isolated reproduction and npm 10 also failed. `--install-links` failed resolving the vendored decoder. The original package and lockfile were retained; do not claim the update succeeded. The dependency-audit gate passed its reviewed high-severity backport, but its raw result still reported 3 high, 15 moderate and 1 low entries.
5. The workspace contains many pre-existing modified and untracked files, including imported server modules and migrations. Any eventual commit/build must include the intended files; a commit of tracked changes alone will not reproduce this workspace. No existing changes were discarded.
6. Account-deletion retention of user-entered dispute/safety text and security records needs an approved privacy/legal retention policy. Private-object storage is disabled and has no production retention sweep; do not enable it until that is implemented and verified.

## Evidence

- `k5` SSH refused the configured connection; the previous address timed out. All new automated runs and Android builds in this review are **local fallback**, not K5 evidence.
- Local integration: 105 suites passed after the authentication change. Local lint, both typechecks, targeted account/session/cash/map regressions and the contract gate passed. Full PostgreSQL runs hit connection timeouts under concurrent native builds; earlier runs are retained rather than represented as a final pass.
- Fresh browser journeys and readiness scenarios passed against throwaway local databases after the deletion UI change. These are browser results, not native acceptance.
- Read-only live deployment probe: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-deployment-probe-20261105.log`. No accounts or orders were created on the live server.
- The physical Android A53 was connected; device acceptance and final build results are recorded in the current-work tracker when complete. No emulator was used and the phone's Chrome profile was not cleared. No physical iOS device is available.

## Scope

The review mapped the mobile routes, API entry points, core authentication, booking, custody, tracking, cash, storage, configuration, release and test paths, and followed up concrete reviewer reports. It was risk-prioritized, not a line-by-line reading of the entire repository or a security certification. Prior reviews and open operational boundaries remain relevant, especially `reports/app-quality-review-2026-11-03.md`.
