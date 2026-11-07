import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DECODER_SHA256, evaluateAudit, parseAudit, sourceHash } from '../scripts/check-audit.mjs';

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
console.log('Audit gate: exact source/advisory acceptance, raw counts, changed bytes, new advisories, unknown propagation, criticals and native errors passed');
