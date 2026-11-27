// The on-screen text budget (.agents/skills/wind-design/SKILL.md §2). It counts, per screen or component file, the
// explanatory sentences it references from src/copy.ts and the reason lines under its buttons, and fails when either grows.
//   node scripts/design-check.mjs            check against docs/design/text-budget.json
//   node scripts/design-check.mjs --update   lower the budget to today's counts (it never raises one)
//   node scripts/design-check.mjs --init     write a first budget (only when there is none)
// It sees static `c.key` references and `reason=` props; text built from a computed key is for the reviewer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** A new file may carry one explanation (money, safety, custody, irreversible) and no reason lines. */
export const newFileBudget = { explanations: 1, reasons: 0 };
const words = text => String(text).trim().split(/\s+/).filter(Boolean).length;
export const isExplanation = text => words(text) >= 8 || (/[.…]$/.test(String(text).trim()) && words(text) >= 4);

/** Counts for one file's source. Error messages (err_*) are not budgeted: an error must say what to do next. */
export function measure(source, english) {
  const keys = [...new Set([...source.matchAll(/\bc\.([A-Za-z][A-Za-z0-9_]*)/g)].map(m => m[1]))]
    .filter(key => !key.startsWith('err_') && typeof english[key] === 'string' && isExplanation(english[key])).sort();
  return { explanations: keys.length, reasons: (source.match(/\breason=\{/g) ?? []).length, keys };
}

/** Every file over its budget, with what it holds now. */
export function overBudget(current, budget) {
  return Object.entries(current).flatMap(([file, now]) => {
    const allowed = budget[file] ?? newFileBudget;
    return ['explanations', 'reasons'].filter(kind => now[kind] > allowed[kind])
      .map(kind => ({ file, kind, now: now[kind], allowed: allowed[kind], keys: kind === 'explanations' ? now.keys : [] }));
  });
}

/** The budget after cutting text: each number is the lower of the old one and today's; deleted files drop out. */
export function ratchet(current, budget) {
  return Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)).map(([file, now]) => {
    const old = budget[file] ?? newFileBudget;
    return [file, { explanations: Math.min(old.explanations, now.explanations), reasons: Math.min(old.reasons, now.reasons) }];
  }).filter(([, value]) => value.explanations || value.reasons));
}

export async function scan(root) {
  const { copy } = await import(pathToFileURL(path.join(root, 'src/copy.ts')).href);
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith('.tsx') ? [path.join(dir, entry.name)] : []);
  return Object.fromEntries(walk(path.join(root, 'src'))
    .map(file => [path.relative(root, file).replace(/\\/g, '/'), measure(fs.readFileSync(file, 'utf8'), copy.en)]));
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  const root = path.resolve(path.dirname(self), '..');
  const budgetPath = path.join(root, 'docs/design/text-budget.json');
  const current = await scan(root);
  const sum = (set, kind) => Object.values(set).reduce((n, v) => n + v[kind], 0);
  if (process.argv.includes('--init')) {
    if (fs.existsSync(budgetPath)) throw new Error('A budget exists; use --update (it only lowers).');
    const first = Object.fromEntries(Object.entries(current).filter(([, v]) => v.explanations || v.reasons)
      .sort(([a], [b]) => a.localeCompare(b)).map(([file, v]) => [file, { explanations: v.explanations, reasons: v.reasons }]));
    fs.writeFileSync(budgetPath, `${JSON.stringify(first, null, 2)}\n`);
    console.log(`budget written: ${sum(first, 'explanations')} explanations, ${sum(first, 'reasons')} reason lines`);
  } else {
    const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
    const over = overBudget(current, budget);
    if (over.length) {
      for (const o of over) console.error(`${o.file}: ${o.now} ${o.kind}, budget ${o.allowed}${o.keys.length ? ` (${o.keys.join(', ')})` : ''}`);
      console.error('Cut or replace the text (see .agents/skills/wind-design/SKILL.md §2); the budget only goes down.');
      process.exit(1);
    }
    if (process.argv.includes('--update')) fs.writeFileSync(budgetPath, `${JSON.stringify(ratchet(current, budget), null, 2)}\n`);
    console.log(`design text budget ok: ${sum(current, 'explanations')} explanations, ${sum(current, 'reasons')} reason lines (budget ${sum(budget, 'explanations')} / ${sum(budget, 'reasons')})`);
  }
}
