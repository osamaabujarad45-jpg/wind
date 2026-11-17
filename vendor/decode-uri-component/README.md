# CommonJS compatibility for the upstream decoder fix

`index.cjs` is `decode-uri-component@0.5.0` from npm, with its final `export default function` changed to `module.exports = function`. Literal replacement uses `split(key).join(value)` instead of constructing a regular expression from the encoded run. This additionally prevents large malformed runs from exceeding the JavaScript regular-expression limit and preserves literal dollar signs in decoded values. The upstream MIT license is included. No install scripts or dependencies are added.

This carries the upstream fix for GHSA-vcc3-ghjq-m6fr while preserving the callable CommonJS export required by Expo Router's `query-string@7.1.3`. Upgrading that dependency directly to the ESM-only package returns a namespace object instead of the decoder function.

Source: https://github.com/SamVerschueren/decode-uri-component/commit/fa479da

Upstream npm archive SHA-1: `4592fa1e1d640ec5e2760e2e168ad2ab5f2c9da1`.

Remove this compatibility copy when Expo Router supplies the patched decoder with a compatible import. Regression tests cover encoded Arabic, query arrays, malformed UTF-8 and a large malformed input in a time-bounded child process.
