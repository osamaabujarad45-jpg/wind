# Claude verification handoff — 2026-11-18 fixes

This handoff is **not evidence that Claude has verified anything**. It is the evidence package to give Claude (or a Claude-capable agent) plus a strict verification protocol. Claude must independently read the listed code and reproduce the checks. Claude must not mark a fix PASS because this file exists.

## Verification protocol for Claude

1. Confirm the base path. Use this repository root: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship`.
2. Read every file listed under "Files changed in this fix pass" and the two prior review reports if present:
   - `reports/verification-2026-11-18-claude-fixes.md` (this file)
   - The review output from the assistant session that produced these fixes.
3. Do **not** trust line numbers as stable; search symbols instead:
   - `const decorate = async` in `server/main.ts`
   - `const billedKey =` in `src/road.tsx`
   - `validPoint`, `cleanDriver`, `pinMode` in `public/map.html`
   - `checkFragment` in `tests/map-security.test.mjs`
4. Run the minimum gates in a clean checkout/branch:
   - `npm ci`
   - `npm run typecheck`
   - `npm run lint`
   - `npm test` in an environment with **PostGIS-enabled PostgreSQL** (`WIND_TEST_DATABASE_URL=postgresql://fastship_test@127.0.0.1:55473/fastship_test`, as in `.github/workflows/ci.yml`). Do not declare the PG-backed suites passed from this Windows fallback.
   - `npm run check:audit` and explicitly decide the Expo/Metro audit policy with the owner. Do not edit the audit gate to force green without owner sign-off.
5. The PG suites blocked in this local pass are exactly the ones that need `postgis`. In this Windows fallback, `CREATE EXTENSION postgis` fails with:
   - `extension "postgis" is not available`
   - `Could not open extension control file "C:/Program Files/PostgreSQL/16/share/extension/postgis.control"`
   CI provides `postgis/postgis:18-3.6`, so CI is the authoritative gate for those suites.
6. Secondary validation used here: every executable suite in `scripts/run-tests.mjs` was also run one-by-one after the fixes. Result: **104 of 106 suites passed**. The only two failures were PG/PostGIS-dependent:
   - `subscription-migration.test.mjs`
   - `database-logging.test.mjs`
   Evidence command was a per-suite loop spawning `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning tests/<suite>`; do not treat it as a substitute for the real `npm test` gate.
7. `tests/map.out` was intentionally deleted. It was a stale Bun-captured output showing `tests/map.test.mjs:401` failing because a child API server printed `ZRO provider configured: moonmath`. `tests/map.test.mjs` now scrubs `ZRO_PROVIDER_NAME`, `ZRO_PROVIDER`, `ZRO_API_KEY`, and `ZRO_KEY` from the child process env.

## Files changed in this fix pass

- `server/main.ts`
- `src/road.tsx`
- `public/map.html`
- `.github/workflows/ci.yml`
- `server/db/sqlite-schema.ts`
- `src/customer-location.ts`
- `tests/map.test.mjs`
- `tests/map-security.test.mjs`
- `tests/customer-location.test.mjs`
- Deleted: `tests/map.out`

## Finding log and double-check record

### F1 — Journey decorator could turn a committed write into a client-visible 401/404

**Original defect:** `/api/...?journeyProtocol=1` re-authenticated inside the additive journey decorator and called `getOrder` per payload item. A committed POST could fail client-side with `401/404`, and list payloads got repeated `getOrder` work.

**Fix:**
- Decorator no longer calls `authenticate(req, false)`.
- Journey output is built from the already-authorized route payload plus a narrow projection (`journeyOrder`), with `recovery` recomputed only when the request already asked for recovery fields.
- Additive projection failures are logged with `committed_effect_failed` and return the original payload; they must not fail the response.
- Same additive-metadata treatment applied to `/api/price` ETA projection.

**First check:** confirmed `user` is guard-checked before entering decorator; all additive failures now fall back; no `getOrder` re-authorization remains in decorator.

**Second check:** typecheck clean; `API checks passed` in local non-PG run; `road-focus` and individual suite run after fix showed no regression; `npm test` still stops at PG/PostGIS suite exactly where expected.

**Residual risk / why not tighter:** `journeyOrder` can still do targeted reads for rides (`ride_lifecycle`, raw order row when the payload lacks full recovery data) and one fare-history read for assigned customer/driver/admin views. No N+1 `getOrder` remains. A full batch projection would be a larger refactor and needs new perf/journey tests; do not "optimize" it blindly without those.

**Evidence anchor:** search `const decorate = async`, `const recovery = 'recovery' in value`, `committed_effect_failed` in `server/main.ts`.

### F2 — Decorator N+1 authorization/query fan-out

**Original defect:** per job card: session re-auth, `getOrder`, then `journeyOrder`; ~150–250 queries for a full jobs page.

**Fix:** same change as F1. This removes session re-auth and `getOrder` per card.

**First check:** `/api/jobs` payloads already contain `dispatch.myOffer`; searching driver jobs do not enter fare-history or ride branches; the dangerous `getOrder` fan-out is gone.

**Second check:** all per-suite tests that exercise jobs/journey paths that can run without PostGIS still pass. PG-dependent journey suites (`tests/journey.mjs`, dispatch/eligibility PG helpers) are not proven locally and must run in CI/PostGIS.

**Status:** fixed for the N+1 authorization component; residual bounded reads documented under F1. If Claude wants complete batching, require benchmarks and PG evidence first.

**Evidence anchor:** search `const decorate = async` and confirm there is no `getOrder` call inside that block.

### F3 — `tests/map.out` stale failure artifact; ZRO env made `map.test.mjs` flaky

**Original defect:** untracked `tests/map.out` captured `tests/map.test.mjs:401` failure because the spawned API printed `ZRO provider configured: moonmath` while the test asserted exact stdout equality.

**Fix:**
- Deleted `tests/map.out`.
- Child env in `tests/map.test.mjs` now removes `ZRO_PROVIDER_NAME`, `ZRO_PROVIDER`, `ZRO_API_KEY`, `ZRO_KEY` before spawning the API.

**First check:** local `map.test.mjs` now passes (`map: ok`).

**Second check:** stale Bun-specific log is gone; the child-env scrub is explicit; failure mode is no longer dependent on developer machine env.

**Evidence anchor:** search `childEnv` in `tests/map.test.mjs`; `git status --short tests/map.out` should show deletion only when committed.

### F4 — Google billing preview could rebill on lifecycle status flips; OSRM behavior change needed explicit sign-off

**Original concern:** `approachKey` included order `status`, so assigned → at_pickup → in_transit transitions reset the shown-preview budget even for the same stop. OSRM approach now polls every 25s.

**Fix:** split the **billing** key from the **kept-ETA** key. Billing now uses only order id/driver/assignment epoch/target/provider. The kept ETA can still bind to richer order state.

**First check:** confirmed `stopKey` was no longer referenced; lint warning `no-unused-vars` exposed and fixed.

**Second check:** initially broke `tests/road-focus.test.mjs` (`442` metres search param became `null`) because one branch still stored into `stopKey`; fixed to store into `billedKey`; test passes again after fix. This is the required second pass catching a bad fix.

**Status:** rebilling on status flips fixed. The 25s OSRM polling change was **not** reverted: it is intentional free-refresh behavior for the baseline renderer, not a defect. If Claude/product wants focus-only refresh or a different cadence, that is a product decision, not a bug fix.

**Evidence anchor:** search `billedKey` and `metres >= SIGNIFICANT_MOVEMENT_METRES` in `src/road.tsx`.

### F5 — Minor hygiene / hardening findings

**Original findings:** unused `cachedPickup`, stray indent in `sqlite-schema.ts`, unvalidated public `map.html` driver/route fragment, unverified `WIND_API_URL`, audit gate state.

**Fixes:**
- Removed dead export `cachedPickup` and removed its direct runtime assertions from `tests/customer-location.test.mjs`. The helper is no longer part of the product surface. (If Claude insists on keeping a tested dead utility, say so explicitly; otherwise accept removal.)
- Removed stray indent in `server/db/sqlite-schema.ts`.
- `public/map.html` now fails closed on invalid route/pin points, clamps `padding`, and normalizes a driver fix (`heading`/`accuracy` only when finite and valid).
- `tests/map-security.test.mjs` now executes the real fragment parser, asserts route/pin invalid configs call `window.ReactNativeWebView.postMessage({ type: 'failed' })` and throw `bad config`, and keeps color/CSS injection coverage green.
- `.github/workflows/ci.yml` now fails the release-export job before export when `vars.WIND_API_URL` is missing, instead of baking an empty API origin into the bundle.

**First check:** typecheck/lint/map-security/customer-location/road-focus all pass after these edits, including one self-caught `map-security` failure caused by the new fail-closed fragment validation.

**Second check:** `map-security.test.mjs` after the test-context update passes; `customer-location.test.mjs` passes; individual suite pass count = **104/106**, with only PostGIS suites blocked.

**Evidence anchors:**
- `cachedPickup` should be absent from `src/customer-location.ts` and `tests/customer-location.test.mjs`.
- `validPoint`, `cleanDriver`, `pinMode`, `const padding = ...` in `public/map.html`.
- `checkFragment` in `tests/map-security.test.mjs`.
- `Require the release API URL repository variable` in `.github/workflows/ci.yml`.

## Current local gate status

- `npm ci --include=dev --no-audit --no-fund`: **ran**, 867 packages installed.
- `npm run typecheck`: **PASS**.
- `npm run lint`: **PASS** (after removing one `stopKey` unused warning).
- Individual suites: **104 PASS / 2 FAIL**; failures are PG/PostGIS-local only:
  - `subscription-migration.test.mjs`
  - `database-logging.test.mjs`
- `npm test`: **BLOCKED**, stops at `subscription-migration.test.mjs` with `extension "postgis" is not available`. CI service uses PostGIS and is the authoritative runner for this gate.
- `npm run check:audit`: **FAILS** in this environment.
  - Counts: `info 0, low 0, moderate 9, high 26, critical 0, total 35`.
  - `mitigated: []`.
  - Rejected high list: `@expo/cli`, `@expo/metro`, `@expo/metro-config`, `@expo/metro-file-map`, `@react-native/babel-plugin-codegen`, `@react-native/babel-preset`, `@react-native/codegen`, `@react-native/community-cli-plugin`, `@react-native/metro-babel-transformer`, `@react-native/metro-config`, `@react-native/virtualized-lists`, `@typescript-eslint/typescript-estree`, `babel-preset-expo`, `eslint-import-resolver-typescript`, `expo`, `fdir`, `jest-util`, `jest-worker`, `metro`, `metro-config`, `metro-file-map`, `metro-transform-worker`, `micromatch`, `picomatch`, `react-native`, `tinyglobby`.
  - No build/release action was taken to silence this; it requires owner decision: upgrade the Expo/React Native/Metro chain or formally triage those advisories, or change the gate with explicit approval.

## Verification requirements before Claude can sign off

Claude must produce **fresh** evidence for all of these, or explicitly mark BLOCKED with exact commands and error output:

1. `git diff -- server/main.ts src/road.tsx public/map.html .github/workflows/ci.yml server/db/sqlite-schema.ts src/customer-location.ts tests/map.test.mjs tests/map-security.test.mjs tests/customer-location.test.mjs` read end-to-end.
2. `npm run typecheck`
3. `npm run lint`
4. `npm test` on PostGIS-enabled PostgreSQL or CI equivalent.
5. `npm run check:audit` plus an owner-approved audit disposition. Claude must not weaken `scripts/check-audit.mjs` or add suppressions.
6. Independent confirmation that `tests/map.out` is not referenced anywhere and that the `map.test.mjs` child-env scrub is present.
7. Independent confirmation that the `/api/...?journeyProtocol=1` success path still emits `journey` for jobs/orders/price when the additive projection works, and that a synthetic projection failure does **not** falsify a committed write (inspect code path and any available failure hook; if no hook exists, state that explicitly instead of inventing one).

## Known unresolved items — do not silently waive

- Full PG-backed verification of journey/recovery/dispatch/eligibility/subscription migrations/database logging in this Windows fallback. CI or owner-provided PostGIS is required.
- Audit gate: 26 high findings in the Expo/RN/Metro chain; requires owner policy, not a local "fix".
- Release export now fails fast without `vars.WIND_API_URL`; confirm the GitHub repo variable exists before expecting CI green.
- `public/map.html` is fail-closed for points/driver/padding, but the app's WebView still sends whatever it is configured to send; do not claim browser/CSP exploit testing from this change.
