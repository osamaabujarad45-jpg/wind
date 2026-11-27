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
  assert.ok(line >= Math.floor(size * 1.7), `${name}: line height ${line} for size ${size} clips Arabic dots (needs 1.7x)`);
}

// No source sets fontWeight.
const offenders = walk(join(root, 'src')).flatMap(file => readFileSync(file, 'utf8').split('\n')
  .map((line, i) => /\bfontWeight\s*:/.test(line) ? `${relative(root, file).replace(/\\/g, '/')}:${i + 1}` : null).filter(Boolean));
assert.deepEqual(offenders, [], 'pick a weight with fontFamily: face.* (src/theme.ts)');
console.log('type face ok');
