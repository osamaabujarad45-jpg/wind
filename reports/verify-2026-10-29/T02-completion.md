# T02 disposable reproduction evidence

29 October 2026, baseline 85b5a3a plus dirty T04/T05/T17 implementation. Host: explicit local fallback; T01 recorded k5 DNS failure. No production data, paid provider or phone UI involved.

`node scripts/local-postgres.mjs start` exit 0 verified PostGIS 3.6 in the dedicated loopback fastship_test cluster. Prerequisites read: local-postgres.mjs, pg-test-server.mjs and docs/implementation/local-database.md. Synthetic fixtures create separate schemas; cleanup currently retains schemas (existing T44 debt).

`node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning reports/verify-2026-10-29/t02-pg-reproduce.mjs` exit 0:

| Finding | Actual versus required behavior | Status / owner |
|---|---|---|
| Declared scope privacy | Unreviewed searching driver reads declared value and source reference; eligibility should restrict access | Reproduced / T27 |
| Unknown refund | Timeout row rejected and second full refund reaches provider; uncertain reservation should remain | Reproduced / T28 |
| Live journals | Completed order, capture/refund and cash collection leave no journals; live writes should post atomically | Reproduced / T29/T30 |
| Settlement authority | Captured card order also accepts full cash collection; settlement methods should be linked | Reproduced / T31 |
| Partial COD | 400/1000 collected is partial and remit returns 409; partial terminal resolution needed | Reproduced / T32 |
| Malformed password | New registration regression initially produced HTTP 500; after T17 fix generic 401 and legacy login pass | Fixed / T17; details in tasks/auth-implementation-evidence.md |

Earlier probe version without the scope case ran while the full suite was between isolated-schema tests; no shared-schema mutation occurred, but it was not uncontended evidence. The final extended probe above ran after the full persistence process exited, in its own fresh schema. Do not use either as a load/capacity measurement.

`npm run test:persistence` first exited 1 at frozen route inventory because T05 initially placed its new endpoint in main.ts. Fixed by registering server/domain/routing-status.ts in the additive protocol inventory. Focused pg-contracts then exited 0 (90 installed + 74 additive boundaries, 21 transitions, 174 exchanges). The sequential full persistence rerun exited 0 (all 51 listed suites plus legacy PostgreSQL parity). Existing payment tests assert some incorrect current outcomes; their passing does not mean the defects above are fixed.

Disposition rule for every T01 register row: a source-only or explicitly unverified claim remains **unverified** at behavioral tier unless a command here or its own task evidence establishes it. Existing-fix rows have source evidence and main-suite coverage where selected, not universal mutation/device/provider proof. Historical rejected claims remain rejected unless a new reproduction contradicts them. First-order promo race, schedule-freshness allegation, exact clientless-route count, device typography, real ingress and provider delivery remain unverified with the T01 owner mappings (T26/T40/T48/T42/T47/T35–T38 respectively). No unexplained observed failure lacks an owner: inventory failure is fixed T05; schema retention T44; reproduced gated defects T27–T32.

Main-suite/common-gate completion is recorded in tasks/evidence.md after commands finish. This is characterization evidence, not a release-readiness claim.
