// Does unblock-custody.test.mjs catch the original bug? Removes the custody guard
// from the approve route and runs that suite.
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const target = resolve(root, 'server/main.ts');
const backup = target + '.mutbak';
const FROM = "if (target.role === 'driver' && target.status === 'blocked') {";
const TO = 'if (false) {';

copyFileSync(target, backup);
try {
  const src = readFileSync(target, 'utf8');
  if (!src.includes(FROM)) { console.log('PATTERN NOT FOUND'); process.exit(1); }
  writeFileSync(target, src.replace(FROM, TO));
  console.log('mutated: approve custody guard disabled');
  try {
    const out = execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning tests/unblock-custody.test.mjs',
      { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    console.log('RESULT: PASSED -> test does NOT catch the regression');
    console.log('  ' + out.trim().split(/\r?\n/).slice(-1)[0]);
  } catch (e) {
    const out = (e.stdout ?? '') + (e.stderr ?? '');
    const why = out.split(/\r?\n/).filter(l => /AssertionError|expected|actual|carrying/.test(l)).slice(0, 3).join(' | ');
    console.log('RESULT: FAILED -> test catches the regression');
    console.log('  ' + why.slice(0, 200));
  }
} finally {
  copyFileSync(backup, target);
  unlinkSync(backup);
  console.log('restored server/main.ts');
}
