// Does admin-settings.test.mjs catch the ORIGINAL bug? Reverts the server to the
// pre-fix rule (floor `< 0`, no ceiling) and runs the suite.
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const target = resolve(root, 'server/main.ts');
const backup = target + '.mutbak';
const FROM = "  const bad = invalidSetting(Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Number(v)])));";
const TO = '  // reverted: the pre-fix rule (floor < 0, fractions < 1, no ceiling)';

copyFileSync(target, backup);
try {
  const src = readFileSync(target, 'utf8');
  if (!src.includes(FROM)) { console.log('PATTERN NOT FOUND'); process.exit(1); }
  const reverted = src.replace(new RegExp(FROM.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\r?\\n\\s*if \\(bad\\) fail\\(400, `[^`]*`\\);'), TO);
  if (reverted === src) { console.log('REGEX DID NOT MATCH'); process.exit(1); }
  writeFileSync(target, reverted);
  console.log('reverted the settings ceiling');
  try {
    const out = execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning tests/admin-settings.test.mjs',
      { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    console.log('RESULT: PASSED -> the test does NOT catch the regression');
    console.log('  ' + out.trim().split(/\r?\n/).slice(-1)[0]);
  } catch (e) {
    const out = (e.stdout ?? '') + (e.stderr ?? '');
    const why = out.split(/\r?\n/).filter(l => /AssertionError|expected|actual|admin\/settings/.test(l)).slice(0, 2).join(' | ');
    console.log('RESULT: FAILED -> the test catches the regression');
    console.log('  ' + why.slice(0, 180));
  }
} finally {
  copyFileSync(backup, target);
  unlinkSync(backup);
  console.log('restored server/main.ts');
}
