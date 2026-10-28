# Dependency security remediation

## Scope and disposition

Expo SDK 57.0.31 resolves Expo CLI 57.0.32, which declared Zod 3.25.76 and node-forge 1.4.0. The audited findings were GHSA-mrhx-c7xc-m3w5 (Zod constrained collection validation) and GHSA-86w9-cpqp-85rv (RSA PKCS#1 v1.5 verification). These packages are build/configuration tooling dependencies; the API runtime dependency closure excludes them. Runtime exclusion was already present and is defense in depth, not the remediation.

Zod is overridden to 4.6.7, whose release is at or above the advisory's patched 4.6.6. This also updates the Zod copy used by eslint-plugin-react-hooks. The plugin and Expo CLI both passed the checks below against this resolution. The regression test uses a bounded array schema and verifies that Zod rejects it before visiting any elements.

No patched Forge npm release was available during this work. The dependency is therefore pinned through the existing `node-forge` override to `vendor/node-forge`, which retains upstream 1.4.0 package metadata and license and applies the minimal nested `DigestAlgorithm` sequence length check from upstream PR [digitalbazaar/forge#1152](https://github.com/digitalbazaar/forge/pull/1152) (commit `ceba34402e329f0365134f23fe19898756527d65`). That PR is still open, so this is a carried local security patch, not a claim of a maintainer-published release. The regression test runs the PR's low-public-exponent forged-signature vector and confirms verification now rejects its nested extra element. Replace the vendor override with a maintainer-published release containing the fix when available, after rerunning the Forge RSA and application checks.

`npm audit` reports zero vulnerabilities after remediation, but its report does not independently attest the local Forge patch: npm does not audit the contents of this `file:` dependency. Keep the Forge patch and its upstream status visible in dependency review until a fixed upstream release is available. Do not interpret the zero count as a Forge release or upstream review.

## Checks

- `npm run test:dependency-security` — three checks passed: the Forge forged-signature vector is rejected, a legitimate Node RSA/SHA-256 signature remains accepted while a changed message fails, and Zod rejects an oversized bounded array before visiting its elements. The parent added and independently ran the legitimate-signature compatibility check.
- `npx expo config --type public` — passed.
- `npx expo install --check` — passed; SDK-compatible dependencies are up to date.
- `npx expo-doctor` — 21/21 checks passed.
- `npm run lint` — passed with the overridden Zod.
- `npm run typecheck` — passed.
- `npm audit` — zero reported vulnerabilities. Forge reporting limitation described above.
- `npx expo export --platform web` — passed with `WIND_LOCAL_TEST=1` and `EXPO_PUBLIC_API_URL=http://127.0.0.1:4191`. A production-mode export correctly rejected the reserved `.example` placeholder host before this local-mode run.

No Expo or React Native API was changed. The SDK 57 versioned documentation confirms `npx expo install` is the SDK module installer; no new Expo module was added.
