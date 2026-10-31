# T03/T04 implementation evidence — 29 October 2026

Revision: `85b5a3a4f3c6fc3044dc2aaaa5f95db1782f873d` plus current uncommitted changes. Existing planning changes preserved. These entries supplement tasks/evidence.md while the T01/T02 delegate owns that register.

## T03

Prepared tasks/maps-contract.md: existing tuple/point and unit contract, platform baseline and opt-in Google decisions, late-response identity requirements, paid-call trigger/budget gates, and 35 named synthetic cases. Corpus scenarios are specifications, not executed regional roads or field evidence. Operator geography confirmation and live provider/field acceptance remain open.

Verification, explicitly local fallback because k5 authentication was refused earlier: `npm run test -- --filter=route` exit 0, selecting 2 suites; `npm run lint` exit 0; `npm run typecheck` exit 0 (both configurations). No provider calls or native acceptance claimed.

## T04

Issue → change → verification:

- Unbounded stale cached pickup and indefinite picker lookup → use SDK 57 `maxAge:30000`, `requiredAccuracy:100`, independently validate fix, and return manual fallback after 250 ms → customer-location suite covers stale/inaccurate/denied/hung cache plus cancellation and late completion.
- Old cached hints retained across picker openings → revalidate every cached opening; only live fixes establish in-memory freshness → source review plus cache validator regression.
- GPS refresh erases a typed landmark on city change → preserve the note during location refresh → source diff; physical Arabic/English behavior still pending.

Files: src/app/book.tsx, src/customer-location.ts, tests/customer-location.test.mjs. Common checks: focused customer-location suite (1 selected) exit 0, lint exit 0, both typechecks exit 0. Host: local fallback. Tier: deterministic fixture/source. Native A53 cases (old cache, denied permission, slow fix, reopen, Arabic/English) remain outstanding; do not mark parent T04 complete.

Official SDK 57 location documentation read before API changes: https://docs.expo.dev/versions/v57.0.0/sdk/location/ . It defines maxAge in milliseconds and requiredAccuracy in metres. Google presentation policy checked for T03: https://developers.google.com/maps/documentation/routes/policies . No Google renderer or live paid routing enabled.

## T03 concrete corpus validation

Added tasks/maps-corpus.json with 35 concrete synthetic coordinate pairs: 10 same-city, 10 intercity, 5 synthetic village/boundary offsets, and 10 checkpoint/provider/lifecycle scenarios. `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .expo/verify-maps-corpus.mjs` exit 0 verifies count, uniqueness, coordinate validity and actual servedCity decisions independently of road expectations. The ignored validation script imports the current model; it makes no provider requests. Native regional/field confirmation remains external acceptance. Subsequent route suites (2), lint and both typechecks all exit 0, explicitly local fallback.

## T05 implementation, acceptance open

Configured routing failure was invisible separately from DB readiness → added admin-only GET /api/admin/routing showing configured state and last observed upstream health/check timestamp/fixed reason, without URL or coordinates → route fixture verifies unauthenticated/unauthorized denial, not-checked state, provider failure while DB stays ready, and recovery. A valid NoRoute is provider health, not trip feasibility. Endpoint reads do not trigger requests; observations are process-local and can become stale. OSRM timeout is now bounded at 1–10 seconds. The existing no-public-fallback and no-invented-road behavior remains covered by the route tests.

Checks: `npm run test -- --filter=route` exit 0 (2 suites), `npm run lint` exit 0, `npm run typecheck` exit 0. Execution host: local fallback. Source/test/doc files: server/main.ts, tests/route.test.mjs, docs/operations/provider-failures.md. Staging internal DNS, populated graph/version and actual provider checks remain open; T05 must not be marked complete.
