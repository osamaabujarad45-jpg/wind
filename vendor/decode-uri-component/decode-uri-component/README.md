# CommonJS compatibility for the upstream decoder fix

`index.cjs` is `decode-uri-component@0.5.1` from npm, with its final `export default function` changed to `module.exports = function`. Nothing else differs from upstream. The upstream MIT license is included. No install scripts or dependencies are added.

This carries the upstream fixes for GHSA-vcc3-ghjq-m6fr (0.5.0: linear UTF-8 scanner) and GHSA-qr28-fpjm-wq7f (0.5.1: percent-encoded runs decoded in one `replace` pass instead of one full-string replacement per distinct run, which was quadratic) while preserving the callable CommonJS export required by Expo Router's `query-string@7.1.3`. Upgrading that dependency directly to the ESM-only package returns a namespace object instead of the decoder function.

Source: https://github.com/SamVerschueren/decode-uri-component/commit/fad01d6 (0.5.1), on top of https://github.com/SamVerschueren/decode-uri-component/commit/fa479da (0.5.0).

Upstream npm archive SHA-1: `7f66b25bf435df723f9af55713dcf860a1c297d2`.

Remove this compatibility copy when Expo Router supplies the patched decoder with a compatible import. Regression tests cover encoded Arabic, query arrays, malformed UTF-8, BOM pairs, no re-decoding of decoded output, a large malformed input and the advisory's many-distinct-runs input, both in time-bounded child processes.
