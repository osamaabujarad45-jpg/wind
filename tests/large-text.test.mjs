import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { linesFor, maxScale, wrapAbove } from '../src/text-scale.ts';

// X-01 large text: text scales up to Android's largest step (maxScale); past wrapAbove a line cap is dropped so text wraps;
// every <Text> and <TextInput> in src carries a cap (or opts out); and no text container pins a height that a bigger font clips.
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const problems = [];

// 1. The threshold is a pure function of the line cap and the scale.
assert.equal(maxScale, 2, "Android's largest font step");
assert.equal(wrapAbove, 1.35);
assert.equal(linesFor(3, 1), 3);
assert.equal(linesFor(3, 1.35), 3, 'at the threshold the cap still holds');
assert.equal(linesFor(3, 1.36), undefined, 'past it the cap goes and the text wraps');
assert.equal(linesFor(3, 2), undefined);
assert.equal(linesFor(undefined, 2), undefined);

// 2. Txt caps at maxScale, passes its line limit through, and a clamp wins over the scaled limit.
const ui = read('../src/ui.tsx');
const txt = /export function Txt\([\s\S]*?\n}\n/.exec(ui)?.[0] ?? '';
assert.ok(txt, 'Txt found in ui.tsx');
assert.match(txt, /maxFontSizeMultiplier=\{maxScale\}/, 'Txt caps at maxScale');
assert.match(txt, /numberOfLines=\{lines\}/, 'Txt wires its line limit');
assert.match(txt, /const lines = clamp \?\? scaled;/, 'a clamp is kept at every scale');
assert.match(ui, /export function useLines\(n\?: number\) \{ return linesFor\(n, useWindowDimensions\(\)\.fontScale\); \}/);
assert.match(ui, /maxFontSizeMultiplier=\{1\.3\} \/\* tab labels/, 'tab label cap is explained');

// 3. Every JSX <Text> and <TextInput> under src, found whatever order its attributes come in and however many lines
// the tag spans. The tag ends at the first '>' outside braces, so arrow functions inside attributes do not end it early.
const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
function tsxFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? tsxFiles(path) : name.endsWith('.tsx') ? [path] : [];
  });
}
function openingTags(source) {
  const tags = [];
  for (const m of source.matchAll(/(?<![\w.])<(Text|TextInput|Txt)(?=[\s/>])/g)) {
    let depth = 0, i = m.index + m[0].length;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
    }
    tags.push({ name: m[1], tag: source.slice(m.index, i + 1) });
  }
  return tags;
}
for (const path of tsxFiles(srcDir)) {
  const where = relative(srcDir, path);
  for (const { name, tag } of openingTags(readFileSync(path, 'utf8'))) {
    if (name === 'Txt') continue; // Txt caps itself (section 2)
    const short = `${where}: ${tag.replace(/\s+/g, ' ').slice(0, 100)}`;
    const cap = /maxFontSizeMultiplier=\{([^}]*)\}/.exec(tag);
    if (!cap && !/allowFontScaling=\{false\}/.test(tag)) problems.push(`uncapped <${name}>: ${short}`);
    // A lower cap must say why, inside the tag, and never exceed maxScale.
    else if (cap && /^[\d.]+$/.test(cap[1].trim()) && (Number(cap[1]) > maxScale || !/\/\*|\/\//.test(tag))) problems.push(`literal cap needs a reason and at most maxScale: ${short}`);
    // Text that sits in a container must not pin its height: a bigger font clips. Only a measured height is allowed, and it says so.
    if (/(?<![A-Za-z])(height|lineHeight)\s*:/.test(tag) && !/measured:/.test(tag)) problems.push(`text pins height: ${short}`);
  }
}

// 4. Fixed `height:` / `lineHeight:` in the style sheets of the shared kit and the order screen is for icons, dots and bars only.
// Expressions count as much as literals. Text variants set lineHeight with their size, so they are exempt.
const iconOnly = new Set(['iconButton', 'stepperKey', 'listIcon', 'emptyIcon', 'barPill', 'grip', 'send', 'segment']);
for (const file of ['../src/ui.tsx', '../src/app/order/[id].tsx']) {
  for (const line of read(file).split('\n')) {
    const m = /^  (\w+): \{.*(?<![A-Za-z])(height|lineHeight)\s*:/.exec(line);
    if (m && !iconOnly.has(m[1]) && !/^  (display|h1|h2|title|body|label|caption|micro):/.test(line)) problems.push(`${file}: ${m[1]} pins ${m[2]}: ${line.trim().slice(0, 90)}`);
  }
}

assert.deepEqual(problems, [], problems.join('\n'));
console.log('large-text ok');
