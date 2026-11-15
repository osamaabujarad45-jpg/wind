import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// X-01 large text: the Txt cap is Android's largest step, every raw <Text> in the shared kit follows it (or names
// why it is lower), and no text container pins a height that a bigger font would clip.
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ui = read('../src/ui.tsx');

assert.match(ui, /export const maxScale = 2;/);
assert.match(ui, /<Text key=\{language\} textBreakStrategy="simple" maxFontSizeMultiplier=\{maxScale\}/, 'Txt uses maxScale');
assert.ok(!/maxFontSizeMultiplier=\{1\.35\}/.test(ui), 'the old 1.35 cap is gone');

// every <Text in ui.tsx carries a cap: maxScale, or a lower one with a comment (tab bar, badge count) or allowFontScaling off (avatar)
for (const line of ui.split('\n')) {
  if (!/<Text[ >]/.test(line) || /<Txt/.test(line.replace(/<Text/g, ''))) continue;
  assert.match(line, /maxFontSizeMultiplier=|allowFontScaling=\{false\}/, `uncapped <Text> in ui.tsx: ${line.trim().slice(0, 90)}`);
}
assert.match(ui, /maxFontSizeMultiplier=\{1\.3\} \/\* tab labels/, 'tab label cap is explained');

// fixed `height:` / `lineHeight:` in the style sheets is for icons, dots and bars only; anything holding text uses minHeight.
const iconOnly = new Set(['iconButton', 'stepperKey', 'listIcon', 'emptyIcon', 'barPill', 'grip', 'send', 'segment']);
for (const file of ['../src/ui.tsx', '../src/app/order/[id].tsx']) {
  for (const line of read(file).split('\n')) {
    const m = /^  (\w+): \{.*(?<![a-zA-Z])(height|lineHeight): ?\d/.exec(line);
    if (m && !iconOnly.has(m[1]) && !/^  (h1|h2|title|body|label|caption|micro):/.test(line)) assert.fail(`${file}: ${m[1]} pins ${m[2]}: ${line.trim().slice(0, 90)}`);
  }
}
console.log('large-text ok');
