# Dependency security remediation

## Scope and disposition

Expo SDK 57.0.31 resolves Expo CLI 57.0.32, which declared Zod 3.25.76 and node-forge 1.4.0. The audited findings were GHSA-mrhx-c7xc-m3w5 (Zod constrained collection validation) and GHSA-86w9-cpqp-85rv (RSA PKCS#1 v1.5 verification). These packages are build/configuration tooling dependencies; the API runtime dependency closure excludes them. Runtime exclusion was already present and is defense in depth, not the remediation.

Zod is overridden to 4.6.7, whose release is at or above the advisory's patched 4.6.6. This also updates the Zod copy used by eslint-plugin-react-hooks. The plugin and Expo CLI both passed the checks below against this resolution. The regression test uses a bounded array schema and verifies that Zod rejects it before visiting any elements.

No patched Forge npm release was available during this work. The dependency is therefore pinned through the existing `node-forge` override to `vendor/node-forge`, which retains upstream 1.4.0 package metadata and license and applies the minimal nested `DigestAlgorithm` sequence length check from upstream PR [digitalbazaar/forge#1152](https://github.com/digitalbazaar/forge/pull/1152) (commit `ceba34402e329f0365134f23fe19898756527d65`). That PR is still open, so this is a carried local security patch, not a claim of a maintainer-published release. The regression test runs the PR's low-public-exponent forged-signature vector and confirms verification now rejects its nested extra element. Replace the vendor override with a maintainer-published release containing the fix when available, after rerunning the Forge RSA and application checks.

`npm audit` reports zero vulnerabilities after remediation, but its report does not independently attest the local Forge patch: npm does not audit the contents of this `file:` dependency. Keep the Forge patch and its upstream status visible in dependency review until a fixed upstream release is available. Do not interpret the zero count as a Forge release or upstream review.

## Carried deepmerge patch (29 October 2026)

GHSA-gcqx-w48m-w2h4 (deepmerge `mergeObject()` prototype poisoning of returned objects, `>=4.2.0` affected) reaches this project only through Expo's build/config tooling closure (`@expo/config` → deepmerge). No fixed deepmerge release exists inside the SDK 57 line: `npm audit fix --force` resolves the advisory by downgrading Expo to 51, which plan decision 1 forbids (a major SDK change needs its own bounded migration). The dependency is therefore pinned through the existing `deepmerge` override to `vendor/deepmerge`, which retains upstream 4.3.1 package metadata and license and carries a minimal guard: attacker-controlled `__proto__`/prototype-chain keys stay own data keys on the returned object and never merge into any prototype. The regression tests run the advisory's poisoning vectors against both the Node entry and the shipped browser UMD bundle, and a compatibility test keeps arrays, symbols, clones and custom mergers working.

The 29 Oct 2026 `npm audit --audit-level=high` run still lists this advisory (and seven low-severity items below the gate) because npm matches the retained 4.3.1 version metadata of the `file:` dependency; as with Forge, npm does not audit vendored contents. Treat the audit line as "patched locally, awaiting an upstream or SDK-57-line release", not as an open runtime defect. Replace the vendor override with a maintainer-published fixed release when one exists inside a supported SDK, after rerunning `npm run test:dependency-security`, `npx expo install --check` and `npx expo-doctor`.

## Checks

- `npm run test:dependency-security` — five checks passed (29 Oct 2026 local fallback): deepmerge poisoning vectors rejected on Node and browser bundles, deepmerge compatibility preserved, the Forge forged-signature vector rejected, a legitimate Node RSA/SHA-256 signature accepted while a changed message fails, and Zod rejects an oversized bounded array before visiting elements. The parent added and independently ran the legitimate-signature compatibility check.
- `npx expo config --type public` — passed.
- `npx expo install --check` — passed 29 Oct 2026; SDK-compatible dependencies are up to date.
- `npx expo-doctor` — 21/21 checks passed (22 Oct and again 29 Oct 2026).
- `npm run lint` — passed with the overridden Zod.
- `npm run typecheck` — passed.
- `npm audit --audit-level=high` — 29 Oct 2026: one high (deepmerge GHSA-gcqx-w48m-w2h4, dispositioned above as a carried vendor patch) plus seven low-severity items under the gate threshold; no actionable fix exists inside SDK 57. The earlier "zero reported vulnerabilities" line referred to the pre-deepmerge-advisory publication state and is superseded.
- `npx expo export --platform web` — passed with `WIND_LOCAL_TEST=1` and `EXPO_PUBLIC_API_URL=http://127.0.0.1:4191`. A production-mode export correctly rejected the reserved `.example` placeholder host before this local-mode run.

No Expo or React Native API was changed. The SDK 57 versioned documentation confirms `npx expo install` is the SDK module installer; no new Expo module was added.
