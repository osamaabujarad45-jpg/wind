// Mutation pass 2: the rating guards that actually prevent a change.
// Pass 1 mutated the idempotent early-return at main.ts:1511, which is an
// equivalent mutant (the guard at :1510 already blocks a different value, and
// re-writing the same value is a no-op). This targets the real guards.
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const M = [
  {
    id: 'E2. Driver may change an existing customer rating',
    file: 'server/main.ts',
    from: "|| (order.customerRating && order.customerRating !== customerRating)) fail(409, 'cannot_rate');",
    to:   ") fail(409, 'cannot_rate');",
    expect: 'a second, different customerRating must be rejected',
  },
  {
    id: 'F. Customer may rate twice with a different value',
    file: 'server/main.ts',
    from: "|| (rating != null && order.rating && order.rating !== rating)",
    to:   '',
    expect: 'changing an existing rating must be rejected',
  },
  {
    id: 'G. Cash settle: driver-only decision removed',
    file: 'server/main.ts',
    from: "const entry = (await one(\"SELECT * FROM cash_entries WHERE id = ? AND driver_id = ? AND kind = 'remittance'\", Number(params[0]), user.id)) ?? fail(404, 'not_found');",
    to:   "const entry = (await one(\"SELECT * FROM cash_entries WHERE id = ? AND (driver_id = ? OR 1=1) AND kind = 'remittance'\", Number(params[0]), user.id)) ?? fail(404, 'not_found');",
    expect: 'a driver must not decide another driver’s cash entry',
  },
];

const results = [];
for (const m of M) {
  const path = resolve(root, m.file);
  const backup = path + '.mutbak';
  copyFileSync(path, backup);
  try {
    const src = readFileSync(path, 'utf8');
    const mutated = src.replace(m.from, m.to);
    if (mutated === src) { console.log(`SKIP   ${m.id}`); results.push({ id: m.id, verdict: 'NOT-APPLIED' }); continue; }
    writeFileSync(path, mutated);
    let caught = false, out = '';
    try { out = execSync('node scripts/run-tests.mjs', { cwd: root, encoding: 'utf8', stdio: 'pipe' }); }
    catch (e) { caught = true; out = (e.stdout ?? '') + (e.stderr ?? ''); }
    const why = out.split(/\r?\n/).filter(l => /AssertionError|expected|Error:/.test(l)).slice(0, 2).join(' | ');
    results.push({ id: m.id, verdict: caught ? 'CAUGHT' : 'MISSED', detail: why.slice(0, 180) });
    console.log(`${caught ? 'CAUGHT' : 'MISSED'} ${m.id}`);
    if (caught) console.log(`       -> ${why.slice(0, 150)}`);
  } finally { copyFileSync(backup, path); unlinkSync(backup); }
}
console.log(`\ncaught=${results.filter(r => r.verdict === 'CAUGHT').length}/${results.length}`);
writeFileSync(resolve(root, 'reports/verify-2026-10-29/mutation-results-2.json'), JSON.stringify(results, null, 2));
