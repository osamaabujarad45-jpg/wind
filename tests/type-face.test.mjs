// Type (wind-design skill §5): one Readex Pro family for Arabic and Latin. A Text without a family falls back to the system
// font, which is a book Naskh face in Arabic, and fontWeight on a named file makes Android fake a second bold.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { face } from '../src/theme.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);

// Every file is shipped, embedded in native builds and loaded on the web under the same name.
const app = read('app.json'), layout = read('src/app/_layout.tsx');
for (const name of Object.values(face)) {
  assert.ok(existsSync(join(root, 'assets/fonts', `${name}.ttf`)), `${name}.ttf is in assets/fonts`);
  assert.ok(app.includes(`./assets/fonts/${name}.ttf`), `${name} is embedded by the expo-font plugin`);
  assert.ok(layout.includes(`'${name}': require('../../assets/fonts/${name}.ttf')`), `${name} is loaded on the web`);
}

// Every type role and the text inputs name a file.
const ui = read('src/ui.tsx');
const roles = /const useTextVariants = themedStyles\([\s\S]*?satisfies/.exec(ui)?.[0] ?? '';
for (const role of ['display', 'h1', 'h2', 'title', 'body', 'label', 'caption', 'micro'])
  assert.match(roles, new RegExp(`\\n  ${role}: \\{[^\\n]*fontFamily: (face|headingFont)\\.`), `the ${role} role names a Readex file`);
assert.match(ui, /\n {2}input: \{ fontFamily: face\.regular,/, 'text inputs use Readex');

// Readex's dots under a final ي sit half an em below the baseline: a line-limited label needs about 1.75x the size.
const styled = name => {
  const m = new RegExp(`\\n  ${name}: \\{[^\\n]*?fontSize: (\\d+)[^\\n]*?lineHeight: (\\d+)`).exec(ui);
  assert.ok(m, `${name} sets its size and line height together`);
  return [Number(m[1]), Number(m[2])];
};
for (const name of ['display', 'h1', 'h2', 'title', 'body', 'label', 'caption', 'micro', 'barText', 'listLabel', 'railText']) {
  const [size, line] = styled(name);
  assert.ok(line >= Math.ceil(size * 1.7), `${name}: line height ${line} for size ${size} clips Arabic dots (needs 1.7x)`);
}
const sources = walk(join(root, 'src')).map(file => [relative(root, file).replace(/\\/g, '/'), readFileSync(file, 'utf8')]);
const at = (text, index) => text.slice(0, index).split('\n').length;
const tight = sources.flatMap(([file, text]) => [...text.matchAll(/\{[^{}]*\}/g)].filter(([style]) => {
  const size = /\bfontSize: (\d+)/.exec(style), line = /\blineHeight: (\d+)/.exec(style);
  return size && line && Number(line[1]) < Math.ceil(Number(size[1]) * 1.7);
}).map(m => `${file}:${at(text, m.index)}`));
assert.deepEqual(tight, [], 'line height is at least 1.7x the size');

// A named style with a size and no line height falls back to the font's 1.25, which cuts the dots in a line-limited label.
// Exempt: digits only (no dots), and one-line text inputs, where a line height moves the text off centre on iOS.
const digitsOrInput = new Set(['input', 'stepperValue', 'codeDigit', 'digitText', 'railCountText', 'barBadgeText']);
const missing = sources.flatMap(([file, text]) => [...text.matchAll(/\n\s*(\w+): (\{[^{}]*\})/g)]
  .filter(([, name, style]) => /\bfontSize:/.test(style) && !/\blineHeight:/.test(style) && !digitsOrInput.has(name))
  .map(m => `${file}:${at(text, m.index) + 1} ${m[1]}`));
assert.deepEqual(missing, [], 'set lineHeight with fontSize (wind-design §5)');

// What counts is the pair that renders. A size written over a named style keeps that style's line height…
const overridden = sources.flatMap(([file, text]) => [...text.matchAll(/style=\{\[([\s\S]*?)\]\}/g)].flatMap(m => {
  const size = /\bfontSize: (\d+)/.exec(m[1]), own = /\blineHeight: (\d+)/.exec(m[1]);
  const named = [...m[1].matchAll(/\bstyles\.(\w+)/g)].map(([, name]) => new RegExp(`\\n\\s*${name}: \\{[^{}]*?\\blineHeight: (\\d+)`).exec(text)).filter(Boolean);
  const line = own ?? named.at(-1);
  return size && line && Number(line[1]) < Math.ceil(Number(size[1]) * 1.7) ? [`${file}:${at(text, m.index)} size ${size[1]} on line ${line[1]}`] : [];
}));
assert.deepEqual(overridden, [], 'a size override needs its own line height (1.7x)');
// …and a one-line input's exemption does not cover a wrapping one: it sets its line height where it turns multiline.
// (An attribute follows the tag name; `RefObject<TextInput | null>` is a type, not a tag.)
const inputs = sources.flatMap(([file, text]) => [...text.matchAll(/<TextInput\s+(?=[A-Za-z{])[\s\S]*?\/>/g)].map(m => [`${file}:${at(text, m.index)}`, m[0]]));
const wrapping = inputs.filter(([, tag]) => /\smultiline\b/.test(tag) && !(Number(/multiline && \{ lineHeight: (\d+)/.exec(tag)?.[1]) >= 28)).map(([where]) => where);
assert.deepEqual(wrapping, [], 'a multiline input of size 16 needs lineHeight 28');
assert.ok(inputs.some(([, tag]) => /\smultiline=\{multiline\}/.test(tag)), 'the multiline Field input is being read');

// The route preview is a fixed 156: its heading must end above the drop-off label, and the pickup label inside it.
const preview = read('src/route-preview.tsx');
const stops = /y: h \* ([\d.]+) \}, b = \{[^}]*y: h \* ([\d.]+)/.exec(preview), height = Number(/const h = (\d+)/.exec(preview)?.[1]);
const drop = Number(/top: b\.y - (\d+)/.exec(preview)?.[1]), under = Number(/top: a\.y \+ (\d+)/.exec(preview)?.[1]);
const [labelLine, headLine] = ['label', 'diagram'].map(name => Number(new RegExp(`\\n  ${name}: \\{[^\\n]*lineHeight: (\\d+)`).exec(preview)?.[1]));
const headTop = Number(/\n  diagram: \{[^\n]*?top: (\d+)/.exec(preview)?.[1]);
assert.equal(preview.split('maxFontSizeMultiplier={1.3}').length - 1, 3, 'heading and both stop labels share the 1.3 cap');
assert.ok(headTop + headLine * 1.3 <= height * Number(stops[2]) - drop, 'the heading overlaps the drop-off label');
assert.ok(height * Number(stops[1]) + under + labelLine * 1.3 <= height, 'the pickup label leaves the preview');

// No source sets fontWeight.
const offenders = walk(join(root, 'src')).flatMap(file => readFileSync(file, 'utf8').split('\n')
  .map((line, i) => /\bfontWeight\s*:/.test(line) ? `${relative(root, file).replace(/\\/g, '/')}:${i + 1}` : null).filter(Boolean));
assert.deepEqual(offenders, [], 'pick a weight with fontFamily: face.* (src/theme.ts)');
console.log('type face ok');
