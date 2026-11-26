# Dependency security triage — 1 November 2026

Source: remote k5 `npm audit --json`, copied to
`.artifacts/audit-2026-11-01/npm-audit.json`. Raw result: **29 affected package
entries: 0 critical, 3 high, 25 moderate, 1 low**. These are dependency-graph
entries, not 29 independent root vulnerabilities. Do not report a clean raw audit.

## Reachable high: fixed in vendored source

The three high entries (`decode-uri-component`, `query-string`, `expo-router`)
all propagate [GHSA-qr28-fpjm-wq7f](https://github.com/advisories/GHSA-qr28-fpjm-wq7f).
The malformed-query decoder is reachable through Expo Router. The vendored 0.5.0
decoder already had the earlier linear UTF-8 scanner, but still scanned the full
string once per distinct percent-encoded run. Many different runs could stall
the JavaScript thread.

Backported [upstream fix fad01d65](https://github.com/SamVerschueren/decode-uri-component/commit/fad01d65b93bd3f2f0dc32dfd8d57a38b57bc608)
from 0.5.1 into `vendor/decode-uri-component/index.cjs`. Each original run now
decodes in place once; decoded output is never rescanned. The CommonJS contract
needed by query-string 7 remains. The version stays honestly at 0.5.0, so npm's
version-based advisory remains visible. No SDK upgrade, forced audit fix or
invented version was used.

Regression: `tests/url-decoder.test.mjs` runs the advisory's 32,000-distinct-run
payload through both the actual resolved decoder and query-string under a
3-second subprocess deadline. It also checks Arabic, query arrays, malformed
UTF-8, BOM replacement, truncated C2 and one-level decoding. Remote execution
evidence is recorded in the main app audit report.

CI retains the native result through `npm run check:audit` after `npm test`.
`scripts/check-audit.mjs` accepts only this exact advisory and its three known
package names when both the decoder actually resolved by Expo Router and the
vendored file have SHA-256
`016b6254780445441542fd9466dd6dd7922f450a6eb26d8eb41b95b472f3a582`.
The decoder has a `-text` Git attribute so Windows/Linux checkouts preserve
these reviewed bytes. New high/critical advisories, unknown propagation,
different source bytes, malformed/inconsistent reports and audit execution
errors fail closed. Raw JSON is retained at
`.artifacts/dependency-audit/raw.json`, and the gate prints unchanged raw counts
plus unresolved moderate/low package names. `tests/audit-gate.test.mjs` exercises
acceptance and these rejection cases without network access.

## Moderate: 25 toolchain entries, two root advisories

The `glob` and `minimatch` advisories propagate through Expo build/configuration
tools and ESLint. No application source, server handler, project plugin or test
runner imports either package directly. The API production image copies only
the locked `pg` dependency closure using `scripts/runtime-dependencies.mjs`; it
does not carry the Expo/ESLint toolchain. This is a source/dependency reachability
assessment, not a claim that all indirect package calls were dynamically traced.

- [Glob cancellation bypass](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)
  affects glob 9 through 14.0.1; installed 13.0.6 is affected. Traversal can
  continue after an abort. Exploitation needs attacker-influenced glob inputs or
  directory trees and reliance on cancellation as a resource budget. The app API
  does not expose such a facility. The first patched version, 14.0.2, crosses the
  installed major version.
- [Minimatch amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249)
  affects versions below 11.0.1. The described case requires an attacker-supplied
  pattern and optimization level 2 or higher. Installed consumers include older
  ESLint generations and minimatch 10.2.6. App users cannot supply build/lint glob
  configuration. A blanket 11.0.1 override crosses several consumers' API ranges.

Disposition: retain as **unresolved build-tool advisories**, not fixed runtime
findings. Do not expose Metro, build tools or lint configuration to untrusted
app users. Do not apply npm's suggested Expo SDK 51 downgrade or force
minimatch/glob major versions across SDK 57. Recheck compatible upstream fixes
by **8 November 2026**, and immediately before a release or SDK/toolchain update.

## Low: existing source mitigation

The one low `deepmerge` entry remains version-reported. This repository already
uses a vendored source fix and `tests/dependency-security.test.mjs` exercises
prototype safety in both Node and browser bundles plus merge compatibility.
The raw advisory is retained; a version finding alone does not erase those
source-level checks. Remote execution evidence belongs in the main audit.

## Result interpretation

The decoder backport and its regression passed on k5, including the actual
Router/query-string resolution path. The native CI audit gate passed with the
reviewed source hash, and the final 94-suite integration run includes both the
decoder and audit-gate regressions. The existing low deepmerge source mitigation
also passed its regression. **25 moderate toolchain entries
remain unresolved.** Raw audit counts remain 29 until dependency metadata
recognizes a compatible fixed upstream release; do not substitute a smaller
number for the raw npm result.
