# deepmerge prototype-safe destination writes

This is upstream `deepmerge@4.3.1`, with its MIT license. The three writes into
the newly created destination in `mergeObject` use `Object.defineProperty`
instead of assignment. An own enumerable `__proto__` key therefore becomes an
ordinary data property and cannot invoke the inherited prototype setter.
The existing source-key guards, prototypes, enumerable symbols, array merging,
custom merging, and clone behavior are preserved. The same change is applied
to the source and both published bundles. No build scripts or development
dependencies are installed from this local copy.

Source: https://github.com/TehShrike/deepmerge/tree/v4.3.1
Advisory: https://github.com/advisories/GHSA-gcqx-w48m-w2h4

The advisory lists no upstream patched version as of 29 October 2026. This copy
keeps the upstream version for provenance, so npm audit may still report its
metadata. The executable attack regressions in `tests/dependency-security.test.mjs`
verify the actual Expo consumer and both CommonJS and browser bundles.
Remove the override after adopting an upstream fix with those regressions passing.
