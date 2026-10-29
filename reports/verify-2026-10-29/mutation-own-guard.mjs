// Targeted mutation: does the new schedule.test.mjs assertion actually catch the
// removed ownership guard? Backs up, mutates, runs ONLY that suite, restores.
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const target = resolve(root, 'server/main.ts');
const backup = target + '.mutbak';
const FROM = "if (user.id !== order.customerId) fail(409, 'cannot_reschedule');";
const TO = '/* mutated: ownership check removed */';

copyFileSync(target, backup);
try {
  const src = readFileSync(target, 'utf8');
  if (!src.includes(FROM)) { console.log('PATTERN NOT FOUND'); process.exit(1); }
  writeFileSync(target, src.replace(FROM, TO));
  console.log('mutated: reschedule ownership check removed');
  try {
    const out = execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning tests/schedule.test.mjs',
      { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    console.log('RESULT: suite PASSED -> the new assertion does NOT catch it');
    console.log(out.trim().split(/\r?\n/).slice(-2).join(' | '));
  } catch (e) {
    const out = (e.stdout ?? '') + (e.stderr ?? '');
    const why = out.split(/\r?\n/).filter(l => /AssertionError|expected|actual/.test(l)).slice(0, 3).join(' | ');
    console.log('RESULT: suite FAILED -> the new assertion catches it');
    console.log('  ' + why.slice(0, 200));
  }
} finally {
  copyFileSync(backup, target);
  unlinkSync(backup);
  console.log('restored server/main.ts');
}
