// Mutation pass 3: authorization boundaries I did NOT praise — likeliest test gaps.
// Each mutation widens a gate; a green suite means no test covers that gate.
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const M = [
  { id: 'H. need(): role check removed (every role gate opens)',
    file: 'server/main.ts',
    from: "const need = (user: User, ...roles: Role[]) => { if (!roles.includes(user.role)) fail(403, 'forbidden'); };",
    to:   "const need = (user: User, ...roles: Role[]) => { /* mutated: no role check */ };",
    guard: 'every role-scoped route (admin, driver, customer)' },
  { id: 'I. needActive(): blocked users may act',
    file: 'server/main.ts',
    from: "if (user.status !== 'active') fail(403, user.status === 'pending' ? 'pending_approval' : 'blocked');",
    to:   '/* mutated: inactive users allowed */',
    guard: 'pending/blocked users must be refused on write routes' },
  { id: 'J. Reschedule: ownership check removed',
    file: 'server/main.ts',
    from: "if (user.id !== order.customerId) fail(409, 'cannot_reschedule');",
    to:   '/* mutated: anyone may reschedule */',
    guard: 'a driver must not reschedule a customer’s order' },
  { id: 'K. Jobs accept: status predicate removed (double-assign)',
    file: 'server/main.ts',
    from: "WHERE id = ? AND status = 'searching'",
    to:   'WHERE id = ?',
    guard: 'two drivers cannot accept the same job' },
  { id: 'L. Settings: fraction ceiling removed',
    file: 'server/main.ts',
    from: "(fractionSettings.includes(key as keyof Settings) && n >= 1)",
    to:   'false',
    guard: 'a percentage setting must stay below 100%' },
];

const results = [];
for (const m of M) {
  const path = resolve(root, m.file);
  const backup = path + '.mutbak';
  copyFileSync(path, backup);
  try {
    const src = readFileSync(path, 'utf8');
    const mutated = src.split(m.from).join(m.to);
    if (mutated === src) { console.log(`SKIP   ${m.id} (pattern absent)`); results.push({ id: m.id, verdict: 'NOT-APPLIED' }); continue; }
    writeFileSync(path, mutated);
    let caught = false, out = '';
    try { out = execSync('node scripts/run-tests.mjs', { cwd: root, encoding: 'utf8', stdio: 'pipe' }); }
    catch (e) { caught = true; out = (e.stdout ?? '') + (e.stderr ?? ''); }
    const why = out.split(/\r?\n/).filter(l => /AssertionError|Error:/.test(l)).slice(0, 2).join(' | ');
    results.push({ id: m.id, verdict: caught ? 'CAUGHT' : 'MISSED', guard: m.guard, detail: why.slice(0, 180) });
    console.log(`${caught ? 'CAUGHT' : 'MISSED'} ${m.id}`);
    console.log(`       guard: ${m.guard}`);
    if (caught) console.log(`       -> ${why.slice(0, 140)}`);
  } finally { copyFileSync(backup, path); unlinkSync(backup); }
}
console.log(`\ncaught=${results.filter(r => r.verdict === 'CAUGHT').length}/${results.length}`);
writeFileSync(resolve(root, 'reports/verify-2026-10-29/mutation-results-3.json'), JSON.stringify(results, null, 2));
