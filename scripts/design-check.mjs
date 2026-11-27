// The on-screen text budget (.agents/skills/wind-design/SKILL.md §2). It fails when text grows:
//   per screen or component file: explanatory sentences referenced from src/copy.ts, their words (English and Arabic,
//     so lengthening one fails too), and the reason lines under buttons;
//   across the catalogue: the words of every explanatory string, errors and computed keys included, and of push texts.
//   node scripts/design-check.mjs            check against docs/design/text-budget.json
//   node scripts/design-check.mjs --update   lower the budget to today's counts (it never raises one)
//   node scripts/design-check.mjs --init     write a first budget (only when there is none)
// It cannot see a hand edit of the budget, or a literal sentence written straight into JSX: those are the reviewer's.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** A new file may carry one explanation (money, safety, custody, irreversible) and no reason lines. */
export const newFileBudget = { explanations: 1, words: 40, reasons: 0 };
const kinds = ['explanations', 'words', 'reasons'];
const count = text => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
export const isExplanation = text => count(text) >= 8 || (/[.…]$/.test(String(text).trim()) && count(text) >= 4);
const wordsOf = (keys, english, arabic) => keys.reduce((n, key) => n + count(english[key]) + count(arabic[key]), 0);

/** Counts for one file's source. Errors (err_*) stay out of the per-file count; the catalogue total holds them. */
export function measure(source, english, arabic = {}) {
  const keys = [...new Set([...source.matchAll(/\bc\.([A-Za-z][A-Za-z0-9_]*)/g)].map(m => m[1]))]
    .filter(key => !key.startsWith('err_') && typeof english[key] === 'string' && isExplanation(english[key])).sort();
  return { explanations: keys.length, words: wordsOf(keys, english, arabic), reasons: (source.match(/\breason=\{/g) ?? []).length, keys };
}

/** Whole-catalogue words: every explanatory string in either language, and the push texts' string literals. */
export function catalogue(english, arabic, pushSource) {
  const keys = Object.keys(english).filter(key => typeof english[key] === 'string' && isExplanation(english[key]));
  const push = [...pushSource.matchAll(/\b(?:ar|en): '((?:[^'\\]|\\.)*)'/g)].reduce((n, m) => n + count(m[1]), 0);
  return { copyWords: wordsOf(keys, english, arabic), pushWords: push };
}

/** Every file over its budget, with what it holds now. */
export function overBudget(current, budget) {
  return Object.entries(current).flatMap(([file, now]) => {
    const allowed = budget[file] ?? newFileBudget;
    return kinds.filter(kind => now[kind] > allowed[kind])
      .map(kind => ({ file, kind, now: now[kind], allowed: allowed[kind], keys: kind === 'reasons' ? [] : now.keys }));
  });
}
export const catalogueOver = (current, budget) => Object.keys(current).filter(kind => current[kind] > budget[kind])
  .map(kind => ({ file: 'catalogue', kind, now: current[kind], allowed: budget[kind], keys: [] }));

/** The budget after cutting text: each number is the lower of the old one and today's; files without text drop out. */
export function ratchet(current, budget) {
  return Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)).map(([file, now]) => {
    const old = budget[file] ?? newFileBudget;
    return [file, Object.fromEntries(kinds.map(kind => [kind, Math.min(old[kind], now[kind])]))];
  }).filter(([, value]) => kinds.some(kind => value[kind])));
}

export async function scan(root) {
  const { copy } = await import(pathToFileURL(path.join(root, 'src/copy.ts')).href);
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith('.tsx') ? [path.join(dir, entry.name)] : []);
  return {
    files: Object.fromEntries(walk(path.join(root, 'src'))
      .map(file => [path.relative(root, file).replace(/\\/g, '/'), measure(fs.readFileSync(file, 'utf8'), copy.en, copy.ar)])),
    catalogue: catalogue(copy.en, copy.ar, fs.readFileSync(path.join(root, 'server/push.ts'), 'utf8')),
  };
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  const root = path.resolve(path.dirname(self), '..');
  const budgetPath = path.join(root, 'docs/design/text-budget.json');
  const now = await scan(root);
  const sum = (set, kind) => Object.values(set).reduce((n, v) => n + v[kind], 0);
  const write = budget => fs.writeFileSync(budgetPath, `${JSON.stringify(budget, null, 2)}\n`);
  if (process.argv.includes('--init')) {
    if (fs.existsSync(budgetPath)) throw new Error('A budget exists; use --update (it only lowers).');
    write({ catalogue: now.catalogue, files: ratchet(now.files, Object.fromEntries(Object.keys(now.files).map(f => [f, now.files[f]]))) });
    console.log(`budget written: ${sum(now.files, 'explanations')} explanations, ${sum(now.files, 'words')} words, ${sum(now.files, 'reasons')} reason lines; catalogue ${now.catalogue.copyWords} + push ${now.catalogue.pushWords} words`);
  } else {
    const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
    const over = [...overBudget(now.files, budget.files), ...catalogueOver(now.catalogue, budget.catalogue)];
    if (over.length) {
      for (const o of over) console.error(`${o.file}: ${o.now} ${o.kind}, budget ${o.allowed}${o.keys.length ? ` (${o.keys.join(', ')})` : ''}`);
      console.error('Cut or replace the text (see .agents/skills/wind-design/SKILL.md §2). Required text: edit the budget by hand and name the requirement.');
      process.exit(1);
    }
    if (process.argv.includes('--update')) write({
      catalogue: Object.fromEntries(Object.entries(budget.catalogue).map(([k, v]) => [k, Math.min(v, now.catalogue[k])])),
      files: ratchet(now.files, budget.files),
    });
    console.log(`design text budget ok: ${sum(now.files, 'explanations')} explanations, ${sum(now.files, 'words')} words, ${sum(now.files, 'reasons')} reason lines; catalogue ${now.catalogue.copyWords}/${budget.catalogue.copyWords}, push ${now.catalogue.pushWords}/${budget.catalogue.pushWords} words`);
  }
}
