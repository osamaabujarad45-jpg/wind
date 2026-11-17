// Preserve npm's native result. Permit reviewed source backports only, each pinned to its advisory, the exact packages
// npm reports through it and the hash of the installed bytes; never an advisory-wide or severity-wide suppression.
// CI runs the regressions first.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
// vendor/decode-uri-component/index.cjs as reviewed in PR #2 (upstream 0.5.1 with the GHSA-qr28-fpjm-wq7f fix).
export const DECODER_SHA256 = 'e82696ecdf0ee2c25bd90169cc7915e552d2ccb82a5006c55bc17aecdb55b919';
const advisory = 'https://github.com/advisories/GHSA-qr28-fpjm-wq7f';
const allowedNames = new Set(['decode-uri-component', 'query-string', 'expo-router']);
// vendor/picomatch-{2,4} as reviewed in the GHSA-fc5q-39xc-vjpf backport (no upstream fix released): every file's bytes.
export const PICOMATCH_TREE_SHA256 = {
  2: 'd7949c7fd2888120bc20c06359f7cc647cd9a8ffdc8192f7b548072dd549ffec',
  4: '637279e70cff23552825f37e3db4c82f3b6546823bd88c08ee0e5dc680050a5f',
};
const picomatchAdvisory = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';
const picomatchNames = new Set(['picomatch', 'fdir', 'tinyglobby', '@expo/cli', 'expo', 'react-native', 'babel-preset-expo',
  '@react-native/codegen', '@react-native/babel-plugin-codegen', '@react-native/babel-preset', '@react-native/metro-babel-transformer',
  '@react-native/metro-config', '@react-native/community-cli-plugin', '@react-native/virtualized-lists',
  '@typescript-eslint/typescript-estree', 'eslint-import-resolver-typescript']);
const severities = ['info', 'low', 'moderate', 'high', 'critical'];
export const sourceHash = path => createHash('sha256').update(readFileSync(path)).digest('hex');

export function decoderHashes() {
  const routerRequire = createRequire(require.resolve('expo-router/package.json'));
  const queryRequire = createRequire(routerRequire.resolve('query-string'));
  const decoderPath = queryRequire.resolve('decode-uri-component');
  return { resolved: sourceHash(decoderPath), vendored: sourceHash(join(root, 'vendor/decode-uri-component/index.cjs')), decoderPath };
}

/** One digest over a directory: each file's relative path and content hash, in path order. Links are refused. */
export function treeHash(dir) {
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  if (entries.some(entry => !entry.isFile() && !entry.isDirectory())) throw new Error('unexpected entry in a reviewed tree');
  const files = entries.filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name).slice(dir.length + 1).replaceAll('\\', '/')).sort();
  const digest = createHash('sha256');
  for (const file of files) digest.update(`${file}\0${sourceHash(join(dir, file))}\n`);
  return digest.digest('hex');
}

/**
 * The picomatch backport is in force only when both vendored trees match their pins and every lockfile package that
 * could be picomatch (its lock name, its installed manifest name, or its folder name says so; aliases included)
 * resolves to one of those trees. `audited` is npm audit's node list for picomatch: when given, each audited location
 * must be one of those copies; `null` (audit named picomatch without a node list) fails. Anything else fails closed.
 */
export function picomatchReviewed(lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')), base = root, audited = undefined) {
  try {
    const real = path => realpathSync.native(path);
    const trees = new Set(Object.entries(PICOMATCH_TREE_SHA256).map(([major, pin]) => {
      const dir = real(join(base, `vendor/picomatch-${major}`));
      if (treeHash(dir) !== pin) throw new Error('changed');
      return dir;
    }));
    const copies = new Set();
    for (const [path, entry] of Object.entries(lock?.packages ?? {})) {
      if (!path) continue;
      if (path.split('/').includes('..') || !/^(node_modules|vendor)\//.test(path)) return false;
      const dir = join(base, path), folder = path.split('/').pop();
      let installed;
      try { installed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name; } catch { installed = undefined; }
      const named = [entry?.name, installed, folder].some(name => name === 'picomatch' || /^picomatch-[24]$/.test(name ?? ''));
      if (!named) continue;
      if (!trees.has(real(dir))) return false; // missing, unreadable or unreviewed
      copies.add(path);
    }
    if (audited === null) return false;
    return copies.size > 0 && (audited === undefined || (Array.isArray(audited) && audited.every(node => copies.has(node))));
  } catch { return false; }
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
  // A backport counts only while its installed bytes match the reviewed pin.
  const backports = [
    { leaf: 'decode-uri-component', advisory, names: allowedNames, reviewed: hashes?.resolved === DECODER_SHA256 && hashes?.vendored === DECODER_SHA256 },
    { leaf: 'picomatch', advisory: picomatchAdvisory, names: picomatchNames, reviewed: hashes?.picomatch === true },
  ].filter(backport => backport.reviewed);
  const allowed = name => backports.some(backport => backport.names.has(name));
  // A high entry is mitigated when every path below it stays on a reviewed backport's packages and ends at its advisory,
  // and at least one path reaches it. A revisit (npm graphs have peer cycles) adds no advisory; a cycle that reaches
  // no reviewed advisory still fails closed. A path into a moderate or low entry is that entry's own reported advisory:
  // npm rates an entry by its worst path, so nothing high hides below it.
  const minor = name => ['info', 'low', 'moderate'].includes(entries[name]?.severity);
  const leaf = (name, via) => backports.some(backport => backport.leaf === name && via?.url === backport.advisory && via?.severity === 'high');
  function closed(name, seen) {
    if (seen.has(name)) return true;
    const entry = entries[name];
    if (!allowed(name) || !entry || entry.severity !== 'high' || !entry.via.length) return false;
    seen.add(name);
    return entry.via.every(via => typeof via === 'string' ? minor(via) || closed(via, seen) : leaf(name, via));
  }
  function reaches(name, seen) {
    if (seen.has(name) || !entries[name] || minor(name)) return false;
    seen.add(name);
    return entries[name].via.some(via => typeof via === 'string' ? reaches(via, seen) : leaf(name, via));
  }
  const reviewedChain = name => closed(name, new Set()) && reaches(name, new Set());
  const mitigated = [], rejected = [];
  for (const [name, entry] of Object.entries(entries)) {
    if (entry.severity === 'critical') rejected.push(name);
    else if (entry.severity === 'high') (reviewedChain(name) ? mitigated : rejected).push(name);
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
    const hashes = { ...decoderHashes(), picomatch: picomatchReviewed(undefined, root,
      audit.vulnerabilities?.picomatch ? audit.vulnerabilities.picomatch.nodes ?? null : undefined) };
    const verdict = evaluateAudit(audit, hashes);
    console.log(JSON.stringify({ ...verdict, decoderPath: hashes.decoderPath, decoderSha256: hashes.resolved }, null, 2));
    console.log('Raw audit retained at .artifacts/dependency-audit/raw.json; moderate/low entries remain reported.');
    if (verdict.rejected.length) throw new Error('Unmitigated high/critical vulnerabilities: ' + verdict.rejected.join(', '));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
