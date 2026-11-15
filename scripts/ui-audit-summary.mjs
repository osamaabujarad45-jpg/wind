// Summarise the newest UI audit: group the findings so the same fix can be applied once.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'reports';
const files = readdirSync(dir).filter(f => f.startsWith('ui-audit-') && f.endsWith('.json')).sort();
const file = join(dir, files.at(-1));
const data = JSON.parse(readFileSync(file, 'utf8'));
const byRule = {};
for (const f of data.findings) (byRule[f.rule] ??= []).push(f);
const mode = process.argv[2] ?? 'rule';

if (mode === 'lines') {
  // every line-height finding, grouped by the size/lineHeight pair
  const groups = new Map();
  for (const f of byRule['line-height'] ?? []) {
    const m = String(f.detail).match(/^([\d.]+)px\/([\d.]+)px/);
    const key = m ? `${m[1]}/${m[2]}` : f.detail;
    const g = groups.get(key) ?? { n: 0, samples: [] };
    g.n++;
    if (g.samples.length < 4) g.samples.push(`${f.where}: ${f.detail}`);
    groups.set(key, g);
  }
  for (const [key, g] of [...groups].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`${String(g.n).padStart(5)}  ${key}`);
    for (const s of g.samples) console.log(`        ${s}`);
  }
} else {
  for (const [rule, list] of Object.entries(byRule)) {
    console.log(`\n=== ${rule}: ${list.length} ===`);
    const groups = new Map();
    for (const f of list) {
      const shape = f.detail.replace(/^[^—]*—\s*/, '').replace(/"[^"]*"/g, '"…"').replace(/\d+(\.\d+)?px/g, 'Npx').replace(/[\d.]+:1/g, 'N:1').replace(/x=-?\d+/g, 'x=N');
      const g = groups.get(shape) ?? { n: 0, example: f.detail, where: f.where };
      g.n++; groups.set(shape, g);
    }
    for (const [shape, g] of [...groups].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`  ${String(g.n).padStart(4)}  ${shape}`);
      console.log(`        e.g. ${g.where}: ${g.example}`);
    }
  }
}
