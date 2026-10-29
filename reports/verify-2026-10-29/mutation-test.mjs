// Mutation testing of the invariants the review praises. For each mutation:
//   1. back up the file   2. invert/remove the guard   3. run the suite
//   4. restore            5. report whether the suite caught it
// A mutation that leaves the suite GREEN is a missing test — the invariant is unguarded.
// Run: node reports/verify-2026-10-29/mutation-test.mjs
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const M = [
  {
    id: 'A. IDOR: canSee disabled',
    file: 'server/main.ts',
    from: "const canSee = viewer.role === 'admin' || r.customer_id === viewer.id || r.driver_id === viewer.id ||",
    to:   "const canSee = true || r.customer_id === viewer.id || r.driver_id === viewer.id ||",
    invariant: 'getOrder must not reveal another user’s order (P2 #5 says scope leaks; the main gate must hold)',
  },
  {
    id: 'B. Optimistic concurrency: expectedStatus not enforced',
    file: 'server/main.ts',
    from: "if (body.expectedStatus !== r.status) fail(409, 'order_changed');",
    to:   "if (false) fail(409, 'order_changed');",
    invariant: 'advanceOrder must reject a stale expectedStatus',
    all: true,
  },
  {
    id: 'C. Double-settle: status predicate removed',
    file: 'server/main.ts',
    from: "UPDATE cash_entries SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'",
    to:   'UPDATE cash_entries SET status = ?, decided_at = ? WHERE id = ? AND status IS NOT NULL',
    invariant: 'a cash entry can only be decided once',
  },
  {
    id: 'D. Partner key: comparison not constant-time / not checked',
    file: 'server/main.ts',
    from: "if (typeof supplied !== 'string' || !timingSafeEqual(Buffer.from(sha(supplied), 'hex'), Buffer.from(sha(configured!), 'hex')))",
    to:   'if (false)',
    invariant: 'the partner key gate must reject a wrong key',
  },
  {
    id: 'E. Rating: overwrite allowed',
    file: 'server/main.ts',
    from: "if (order.customerRating === customerRating) return order; // a lost response must not make a saved rating look rejected",
    to:   '// mutation: dropped the idempotent-return guard',
    invariant: 'a driver cannot change a rating they already saved',
  },
];

const results = [];
for (const m of M) {
  const path = resolve(root, m.file);
  const backup = path + '.mutbak';
  copyFileSync(path, backup);
  try {
    const src = readFileSync(path, 'utf8');
    const target = m.all ? src.split(m.from).join(m.to) : src;
    const mutated = m.all ? target : src.replace(m.from, m.to);
    if (mutated === src) {
      results.push({ id: m.id, verdict: 'NOT-APPLIED', detail: 'mutation string not found — file changed' });
      console.log(`SKIP        ${m.id} (pattern not found)`);
      continue;
    }
    writeFileSync(path, mutated);
    let caught = false, output = '';
    try {
      output = execSync('node scripts/run-tests.mjs', { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      caught = true;
      output = (e.stdout ?? '') + (e.stderr ?? '');
    }
    const failing = output.split(/\r?\n/).filter(l => /Error|assert|failed|FAIL/.test(l)).slice(0, 3).join(' | ');
    results.push({ id: m.id, verdict: caught ? 'CAUGHT' : 'MISSED', detail: caught ? failing.slice(0, 160) : 'suite stayed green' });
    console.log(`${caught ? 'CAUGHT' : 'MISSED'}      ${m.id}`);
    if (caught) console.log(`            -> ${failing.slice(0, 150)}`);
  } finally {
    copyFileSync(backup, path);
    unlinkSync(backup);
  }
}

console.log('\n=== MUTATION SUMMARY ===');
console.log(`caught=${results.filter(r => r.verdict === 'CAUGHT').length}/${results.length}`);
for (const r of results) if (r.verdict !== 'CAUGHT') console.log(`  ${r.verdict}: ${r.id} — ${r.detail}`);
writeFileSync(resolve(root, 'reports/verify-2026-10-29/mutation-results.json'), JSON.stringify(results, null, 2));
