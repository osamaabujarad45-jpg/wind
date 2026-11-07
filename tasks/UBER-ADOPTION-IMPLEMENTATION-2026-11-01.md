# Approved Uber-study adoption implementation

Owner approval: “OK DO THEM” on 1 November 2026, following the seven priorities in `reports/uber-adoption-analysis-2026-11-01.md` and `reports/uber-adoption-backend-analysis-2026-11-01.md`.

Additional owner instruction: give every UI job to **Claude Haiku 5.5**, with extra effort; remove unnecessary UI text and review screens one by one against Claude design guidelines. Catalog identity confirmed as `claude-haiku-5-5`, with effort `max` selected for the delegation. Do not silently switch models/providers.

**Latest owner correction:** assign UI to **DeepSeek 4.1**, retain extra effort and Claude design guidelines, and rotate subscriptions/providers until one has available usage, beginning with “Besten.” Besten is not advertised in the connected model catalog (the attempted `besten/deepseek-v4.1` target was rejected as unavailable). The focused catalog advertises DeepSeek V4.1 Flash through CometAPI, Zro, Sail, Modal, DigitalOcean and OpenCode subscriptions; use one at a time and retain the exact 4.1 family. Haiku's second run saved partial `ui.tsx`/`parts.tsx`/copy changes and a working-draft `reports/ui-review-2026-11-01.md`, then stopped at a Claude API rate limit. Preserve and complete that work; it is not a finished UI review or verified result.

## Implementation scope

1. Durable driver commands and receipt reconciliation across restart, with account/session/resource/version/assignment binding and no delayed expired-offer acceptance.
2. Minimal account-owned, stale/read-only offline order recovery, explicit retention/purge and revalidation before mutations or tracking.
3. Runtime validation for high-value additive command/order/quote/offer/capability contracts while preserving installed-client compatibility.
4. Bounded typed configuration with safe defaults, ownership/revision and authority remaining server-side.
5. Effective map-provider failure state, synchronized route provenance, bounded fallback/retry, shared viewport intent where useful.
6. Redacted bounded diagnostics and timing instrumentation, capability-specific schema/readiness evidence, physical-device performance and recovery checks.
7. Screen-by-screen UI cleanup in Arabic/English, maintaining accessibility, safe error/consent/price/offline meaning, reduced motion and Wind's established local brand.

No commitment to add Uber's wider service catalogue, a custom renderer, a new navigation framework, custom crypto or a microservice migration. Deployment, commit, push, live database changes, payments and new cloud resources still require separate approval. Implement and test everything independently possible before requesting only external prerequisites.

## Current baseline and coordination

The working tree already contains substantial uncommitted implementation/research changes. Preserve them. The previous analysis ran lint, both typechecks and five selected regressions successfully on k5 with an isolated copy; those results are a baseline, not verification of these new changes.

UI phase 1 is delegated to Haiku. It may edit presentation/copy in shared controls and all routes except these parent-reserved integration files: `src/app/_layout.tsx`, `src/app/book.tsx`, `src/app/order/[id].tsx`, `src/session.tsx`, `src/api.ts`, `src/api-client.ts`, map implementations and new recovery/configuration/contract/diagnostic modules. It must still review reserved screens and provide precise proposed UI edits for phase 2. No backend/domain/worker/native configuration changes by the UI child. Parent will integrate core functionality and assign the resulting UI integration to Haiku as a new delegate task.

Claude guidelines: `C:/Users/osama/.codex/plugins/cache/claude-plugins-official/frontend-design/1.1.1/skills/frontend-design/SKILL.md`. Read all of it. Preserve the brief's brand choices; remove decorative labels, redundant instructions, repeated headings and implementation vocabulary. Retain user-relevant safety, price, consent and recovery meaning.

Testing: use k5 for tests/heavy work when reachable. Use only the connected physical SM-A5360 (`R5CTB0FJP9Z`) for UI/device acceptance, through available supported device tools; never an emulator/simulator. Preserve other sessions and phone Chrome profile. Keep test backend loopback via port reverse. Source/unit/browser-harness evidence is distinct from native GPS, locked-screen tracking, real routing, native push, SMS and payment evidence.

## Completion evidence

Record issue → change → verification for each implemented slice. Keep source hashes, remote logs, migration/capability status, phone acceptance coverage and remaining external prerequisites explicit. Lint and both TypeScript configurations are mandatory. Add meaningful behavioral regression tests for command identity, process death, version conflicts, authority changes, corrupt/expired caches and provider failure sequences. Final integrated review must not weaken existing tests, fixture contracts or production gates.

## Progress

- Approved analysis and source baseline recorded.
- Claude Haiku 5.5 catalog identity and maximum effort confirmed. First Claude delegation failed before edits because the provider reported an account hold. The owner then said “HAIKU IS BACK NOW”; retry on the same Claude provider/model, not OpenCode.
- Core slice 1 added `src/runtime-config.ts` and `server/domain/runtime-readiness.ts`, registered three authenticated additive runtime routes, updated the additive route inventory and suite registration, and added `tests/runtime-config.test.mjs`. The bounded policy/migration-gap test passed on k5. A readonly mapped-type error was corrected before further verification. Remote current-source snapshot is `C:\wq-adoption-impl-20261101` with a dependency junction to the matching audit lockfile install. Typecheck command session 73454 was collected by the parent after that fix.
- Core recovery slice added `src/driver-command.ts`, `server/domain/driver-receipts.ts`, opt-in `recoveryProtocol=1` order metadata and assignment/version/expiry fences in the existing `driverCommand` path. Added tests `driver-command.test.mjs` and `driver-recovery-api.test.mjs`, registered them in the integration gate and additive endpoint inventory. Both new tests passed on k5 (exact replay after process replacement, receipt privacy, rejected-proof identity, expiry, assignment/session fences and unchanged legacy response shape). These tests do not yet establish a persistent platform adapter or screen integration.
- Recovery platform storage and UI integration remain pending: use an explicit encrypted/protected, bounded, session-scoped store rather than persisting raw PINs in a general queue. Existing SDK57 `expo-crypto` includes AES-GCM (verified against versioned docs and local declaration files); native SecureStore is already installed. Suggested adapter: two fixed slots (pending driver command and minimal offline summary), encrypt each using a domain-separated key derived from the high-entropy current bearer token; never persist/log a separate encryption key or token. Check session revision around asynchronous work, serialize writes and logout purge, cap encrypted records below native payload constraints, TTL and delete on logout/revocation/account change. Offline summary excludes PINs, contacts, free-text addresses, precise GPS and private proofs. Do not replay stale GPS or expired offers.
- Remaining: response validators; integrate typed config with session/map logic; durable driver recovery; minimal offline read-only cold start; effective map failure/viewport policy; bounded diagnostics/timing; Haiku UI integration; remote full checks and physical-device acceptance.
