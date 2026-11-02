// Preserve npm's native result. Permit one reviewed source backport, never an
// advisory-wide or severity-wide suppression. CI runs the regressions first.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
// vendor/decode-uri-component/index.cjs as reviewed in PR #2 (upstream 0.5.1 with the GHSA-qr28-fpjm-wq7f fix).
export const DECODER_SHA256 = 'e82696ecdf0ee2c25bd90169cc7915e552d2ccb82a5006c55bc17aecdb55b919';
const advisory = 'https://github.com/advisories/GHSA-qr28-fpjm-wq7f';
const allowedNames = new Set(['decode-uri-component', 'query-string', 'expo-router']);
const severities = ['info', 'low', 'moderate', 'high', 'critical'];
export const sourceHash = path => createHash('sha256').update(readFileSync(path)).digest('hex');

export function decoderHashes() {
  const routerRequire = createRequire(require.resolve('expo-router/package.json'));
  const queryRequire = createRequire(routerRequire.resolve('query-string'));
  const decoderPath = queryRequire.resolve('decode-uri-component');
  return { resolved: sourceHash(decoderPath), vendored: sourceHash(join(root, 'vendor/decode-uri-component/index.cjs')), decoderPath };
}

export function parseAudit(result) {
  if (result.error || result.signal || ![0, 1].includes(result.status)) throw new Error('Native npm audit failed to complete');
  let audit;
  try { audit = JSON.parse(result.stdout); } catch { throw new Error('Native npm audit did not return valid JSON'); }
  if (audit.error) throw new Error('Native npm audit returned an error');
  return audit;
}

export function evaluateAudit(audit, hashes) {
  const entries = audit?.vulnerabilities, counts = audit?.metadata?.vulnerabilities;
  if (!entries || Array.isArray(entries) || typeof entries !== 'object' || !counts) throw new Error('Malformed npm audit report');
  const observed = Object.fromEntries(severities.map(severity => [severity, 0]));
  for (const entry of Object.values(entries)) {
    if (!entry || !severities.includes(entry.severity) || !Array.isArray(entry.via)) throw new Error('Malformed vulnerability entry');
    observed[entry.severity]++;
  }
  if (severities.some(severity => counts[severity] !== observed[severity]) || counts.total !== Object.keys(entries).length)
    throw new Error('Inconsistent npm audit counts');
  function reviewedChain(name, seen = new Set()) {
    if (!allowedNames.has(name) || seen.has(name)) return false;
    const entry = entries[name];
    if (!entry || entry.severity !== 'high' || !entry.via.length) return false;
    const next = new Set([...seen, name]);
    return entry.via.every(via => typeof via === 'string' ? reviewedChain(via, next)
      : name === 'decode-uri-component' && via?.url === advisory && via?.severity === 'high');
  }
  const mitigated = [], rejected = [];
  for (const [name, entry] of Object.entries(entries)) {
    if (entry.severity === 'critical') rejected.push(name);
    else if (entry.severity === 'high') {
      if (reviewedChain(name) && hashes?.resolved === DECODER_SHA256 && hashes?.vendored === DECODER_SHA256) mitigated.push(name);
      else rejected.push(name);
    }
  }
  return { raw: counts, mitigated, rejected,
    moderate: Object.entries(entries).filter(([, entry]) => entry.severity === 'moderate').map(([name]) => name),
    low: Object.entries(entries).filter(([, entry]) => entry.severity === 'low').map(([name]) => name) };
}

if (import.meta.main) {
  try {
    // npm run supplies its actual JS entrypoint on Windows and Unix. Avoid a
    // shell or guessing which npm.cmd wrapper happens to be on PATH.
    const npm = process.env.npm_execpath;
    if (!npm || basename(npm) !== 'npm-cli.js') throw new Error('Run this gate with npm run check:audit');
    const native = spawnSync(process.execPath, [npm, 'audit', '--json'],
      { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
    const output = join(root, '.artifacts/dependency-audit');
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, 'raw.json'), native.stdout ?? '');
    const audit = parseAudit(native);
    const hashes = decoderHashes();
    const verdict = evaluateAudit(audit, hashes);
    console.log(JSON.stringify({ ...verdict, decoderPath: hashes.decoderPath, decoderSha256: hashes.resolved }, null, 2));
    console.log('Raw audit retained at .artifacts/dependency-audit/raw.json; moderate/low entries remain reported.');
    if (verdict.rejected.length) throw new Error('Unmitigated high/critical vulnerabilities: ' + verdict.rejected.join(', '));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
