import assert from 'node:assert/strict';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DECODER_SHA256, PICOMATCH_TREE_SHA256, evaluateAudit, parseAudit, picomatchReviewed, sourceHash, treeHash } from '../scripts/check-audit.mjs';

const advisory = { url: 'https://github.com/advisories/GHSA-qr28-fpjm-wq7f', severity: 'high' };
const entry = (severity, via) => ({ severity, via });
function fixture(vulnerabilities) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: Object.keys(vulnerabilities).length };
  for (const value of Object.values(vulnerabilities)) counts[value.severity]++;
  return { vulnerabilities, metadata: { vulnerabilities: counts } };
}
const report = fixture({ 'decode-uri-component': entry('high', [advisory]),
  'query-string': entry('high', ['decode-uri-component']), 'expo-router': entry('high', ['query-string']),
  glob: entry('moderate', [{ url: 'https://github.com/advisories/other', severity: 'moderate' }]), deepmerge: entry('low', []) });
const bytes = readFileSync(new URL('../vendor/decode-uri-component/index.cjs', import.meta.url));
const path = join(mkdtempSync(join(tmpdir(), 'wind-audit-gate-')), 'decoder.cjs');
writeFileSync(path, bytes);
const good = { resolved: sourceHash(path), vendored: sourceHash(path) };
assert.equal(good.resolved, DECODER_SHA256, 'reviewed source bytes match the committed pin');
let verdict = evaluateAudit(report, good);
assert.deepEqual(verdict.mitigated.sort(), ['decode-uri-component', 'expo-router', 'query-string']);
assert.deepEqual(verdict.rejected, []);
assert.deepEqual(verdict.raw, report.metadata.vulnerabilities, 'raw counts are never reduced');
assert.deepEqual(verdict.moderate, ['glob']); assert.deepEqual(verdict.low, ['deepmerge']);
writeFileSync(path, Buffer.concat([bytes, Buffer.from('\n// modified after review\n')]));
assert.equal(evaluateAudit(report, { ...good, resolved: sourceHash(path) }).rejected.length, 3);
assert.equal(evaluateAudit(report, { ...good, vendored: sourceHash(path) }).rejected.length, 3);
const clone = () => structuredClone(report.vulnerabilities);
let changed = clone(); changed['decode-uri-component'].via.push({ url: 'https://github.com/advisories/UNKNOWN', severity: 'high' });
assert.equal(evaluateAudit(fixture(changed), good).rejected.length, 3, 'new advisory on a waived package is not waived');
changed = clone(); changed.unrelated = entry('high', ['decode-uri-component']);
assert.deepEqual(evaluateAudit(fixture(changed), good).rejected, ['unrelated'], 'unknown propagation is not waived');
changed = clone(); changed['decode-uri-component'].severity = 'critical';
assert.equal(evaluateAudit(fixture(changed), good).rejected.length, 3, 'critical severity always blocks');
changed = clone(); changed['query-string'].via = ['expo-router'];
assert.ok(evaluateAudit(fixture(changed), good).rejected.includes('query-string'), 'cycles fail closed');
assert.throws(() => evaluateAudit({ vulnerabilities: {} }, good), /Malformed/);
assert.throws(() => evaluateAudit({ ...report, metadata: { vulnerabilities: { ...report.metadata.vulnerabilities, high: 0 } } }, good), /Inconsistent/);
assert.deepEqual(parseAudit({ status: 1, stdout: JSON.stringify(report) }), report, 'npm status1 carries valid vulnerabilities');
for (const result of [{ status: 1, stdout: JSON.stringify({ error: { code: 'ENOAUDIT' } }) },
  { status: 0, stdout: 'not JSON' }, { status: 2, stdout: JSON.stringify(report) },
  { status: null, signal: 'SIGTERM', stdout: '' }, { status: 1, error: new Error('network'), stdout: '' }])
  assert.throws(() => parseAudit(result), /audit/i, 'audit execution/network/protocol failures cannot pass');
// GHSA-fc5q-39xc-vjpf (17 Nov 2026 audit, as npm reported it): accepted only through the hash-pinned picomatch backport.
const picomatchReport = fixture(Object.fromEntries(Object.entries({"@expo/cli":["high",["glob","picomatch"]],"@expo/config":["moderate",["glob"]],"@expo/fingerprint":["moderate",["glob","minimatch"]],"@expo/metro-config":["moderate",["glob"]],"@react-native/babel-plugin-codegen":["high",["@react-native/codegen"]],"@react-native/babel-preset":["high",["@react-native/babel-plugin-codegen"]],"@react-native/codegen":["high",["tinyglobby"]],"@react-native/community-cli-plugin":["high",["@react-native/metro-config"]],"@react-native/metro-babel-transformer":["high",["@react-native/babel-preset"]],"@react-native/metro-config":["high",["@react-native/metro-babel-transformer"]],"@react-native/virtualized-lists":["high",["react-native"]],"@typescript-eslint/eslint-plugin":["moderate",["@typescript-eslint/type-utils","@typescript-eslint/utils"]],"@typescript-eslint/parser":["moderate",["@typescript-eslint/typescript-estree"]],"@typescript-eslint/type-utils":["moderate",["@typescript-eslint/typescript-estree","@typescript-eslint/utils"]],"@typescript-eslint/typescript-estree":["high",["minimatch","tinyglobby"]],"@typescript-eslint/utils":["moderate",["@typescript-eslint/typescript-estree"]],"babel-preset-expo":["high",["@react-native/babel-plugin-codegen"]],"eslint-import-resolver-typescript":["high",["tinyglobby"]],"expo":["high",["@expo/fingerprint","babel-preset-expo"]],"fdir":["high",["picomatch"]],"glob":["moderate",[{"url":"https://github.com/advisories/GHSA-3g3m-2fjr-6pw4","severity":"moderate"},"minimatch"]],"minimatch":["moderate",[{"url":"https://github.com/advisories/GHSA-g3hv-75wg-m249","severity":"moderate"}]],"picomatch":["high",[{"url":"https://github.com/advisories/GHSA-fc5q-39xc-vjpf","severity":"high"}]],"react-native":["high",["@react-native/codegen","@react-native/community-cli-plugin","@react-native/virtualized-lists","tinyglobby"]],"tinyglobby":["high",["fdir","picomatch"]]}).map(([name, [severity, via]]) => [name, entry(severity, via)])));
const picomatchHigh = Object.keys(picomatchReport.vulnerabilities).filter(name => picomatchReport.vulnerabilities[name].severity === 'high').sort();
assert.equal(picomatchHigh.length, 16);
verdict = evaluateAudit(picomatchReport, { ...good, picomatch: true });
assert.deepEqual(verdict.mitigated.sort(), picomatchHigh, 'react-native <-> virtualized-lists peer cycle and moderate side-paths still resolve');
assert.deepEqual(verdict.rejected, []);
assert.deepEqual(evaluateAudit(picomatchReport, { ...good, picomatch: false }).rejected.sort(), picomatchHigh, 'unreviewed picomatch bytes waive nothing');
const pico = () => structuredClone(picomatchReport.vulnerabilities);
changed = pico(); changed.newcomer = entry('high', ['tinyglobby']);
assert.deepEqual(evaluateAudit(fixture(changed), { ...good, picomatch: true }).rejected, ['newcomer'], 'a new package on the chain is not waived');
changed = pico(); changed.picomatch.via.push({ url: 'https://github.com/advisories/UNKNOWN', severity: 'high' });
assert.equal(evaluateAudit(fixture(changed), { ...good, picomatch: true }).rejected.length, 16, 'a second picomatch advisory is not waived');
changed = pico(); changed.glob.severity = 'high'; changed.glob.via[0].severity = 'high';
assert.ok(evaluateAudit(fixture({ ...changed, glob: changed.glob }), { ...good, picomatch: true }).rejected.includes('@expo/cli'), 'a side-path turning high blocks again');
// The installed copies are checked from the lockfile, by real package name, against the whole reviewed trees.
for (const major of ['2', '4']) assert.equal(treeHash(fileURLToPath(new URL(`../vendor/picomatch-${major}`, import.meta.url))),
  PICOMATCH_TREE_SHA256[major], `vendor/picomatch-${major} matches its pin`);
const base = mkdtempSync(join(tmpdir(), 'wind-picomatch-gate-'));
for (const major of ['2', '4']) cpSync(new URL(`../vendor/picomatch-${major}`, import.meta.url), join(base, `vendor/picomatch-${major}`), { recursive: true });
mkdirSync(join(base, 'node_modules'));
symlinkSync(join(base, 'vendor/picomatch-2'), join(base, 'node_modules/picomatch'), 'junction');
const linked = { 'node_modules/picomatch': { resolved: 'vendor/picomatch-2', link: true }, 'node_modules/tool': { version: '1.0.0' } };
assert.equal(picomatchReviewed({ packages: linked }, base), true, 'a link to the reviewed tree is accepted');
assert.equal(picomatchReviewed({ packages: linked }, base, ['node_modules/picomatch']), true);
assert.equal(picomatchReviewed({ packages: linked }, base, ['node_modules/picomatch', 'node_modules/elsewhere/node_modules/picomatch']), false,
  'every location npm audited must be a reviewed copy');
assert.equal(picomatchReviewed({ packages: {} }, base), false, 'no installed picomatch is not proof of the backport');
mkdirSync(join(base, 'node_modules/pm3'));
writeFileSync(join(base, 'node_modules/pm3/package.json'), JSON.stringify({ name: 'picomatch', version: '2.3.2' }));
assert.equal(picomatchReviewed({ packages: { ...linked, 'node_modules/pm3': { name: 'picomatch', version: '2.3.2' } } }, base), false,
  'an aliased unpatched copy blocks');
assert.equal(picomatchReviewed({ packages: { ...linked, 'node_modules/pm3': { version: '2.3.2' } } }, base), false,
  'the on-disk name is read when the lock omits it');
assert.equal(picomatchReviewed({ packages: { ...linked, 'node_modules/../../x/picomatch': {} } }, base), false, 'lock keys stay inside node_modules');
assert.equal(picomatchReviewed({ packages: { ...linked, 'node_modules/missing/node_modules/picomatch': {} } }, base), false, 'a listed copy that is missing blocks');
appendFileSync(join(base, 'vendor/picomatch-4/index.js'), '\n// changed after review\n');
assert.equal(picomatchReviewed({ packages: linked }, base), false, 'any changed byte in a vendored tree blocks');
assert.equal(picomatchReviewed(), true, 'the repository lockfile installs only the reviewed copies');
console.log('Audit gate: exact source/advisory acceptance, raw counts, changed bytes, new advisories, unknown propagation, criticals and native errors passed');
