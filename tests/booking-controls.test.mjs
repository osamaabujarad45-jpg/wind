import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Booking's shared controls: a real 48dp tap target on every control, a nameable choice group,
// and a route spine that names each end in the reader's own language.
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ui = read('../src/ui.tsx');
const parts = read('../src/parts.tsx');
const dictionary = read('../src/copy.ts');
const book = read('../src/app/book.tsx');
const search = read('../src/trip-search.tsx');

// The object literal after a marker, braces counted, so the numbers below are the ones the app lays out.
const literal = (source, marker) => {
  const at = source.indexOf(marker);
  assert.ok(at >= 0, `${marker} must be in the source`);
  const open = source.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1);
  }
  throw new Error(`${marker} never closes`);
};
const between = (source, from, to) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `${from} must come before ${to}`);
  return source.slice(start, end);
};

const palette = runInNewContext(`(${literal(ui, 'export const palette =')})`);
const size = runInNewContext(`(${literal(ui, 'export const size =')})`);
const styles = runInNewContext(`(() => { const palette = ${JSON.stringify(palette)}; const size = ${JSON.stringify(size)};
  const shadow = {}; return (${literal(ui, 'const styles = StyleSheet.create(')}); })()`);
const motion = runInNewContext(`(() => { const palette = ${JSON.stringify(palette)}; const size = ${JSON.stringify(size)};
  const cubicBezier = () => 'ease'; const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
  return (${literal(ui, 'const motion = css.create(')}); })()`);
const partStyles = runInNewContext(`(() => { const palette = ${JSON.stringify(palette)};
  return (${literal(parts, 'const styles = StyleSheet.create(')}); })()`);
const bookStyles = runInNewContext(`(() => { const palette = ${JSON.stringify(palette)}; const sheetShadow = {};
  return (${literal(book, 'const styles = StyleSheet.create(')}); })()`);
const searchStyles = runInNewContext(`(() => { const palette = ${JSON.stringify(palette)};
  return (${literal(search, 'const styles = StyleSheet.create(')}); })()`);

// ---------- the target is a box, not a slop over the neighbour ----------
// Android's smallest comfortable tap target is 48dp. hitSlop only widens the touch over the control
// beside it, and the sibling on top takes the tap, so the box itself has to carry the target.
const MIN = 48;
const atLeast = (value, what) => assert.ok(value >= MIN, `${what} is ${value}dp, Android wants ${MIN}dp`);
atLeast(styles.button.minHeight, 'Button');
atLeast(styles.buttonSmall.minHeight, 'the small Button');
atLeast(styles.iconButton.width, 'IconButton');
atLeast(styles.iconButton.height, 'IconButton');
atLeast(styles.stepperKey.width, 'a Stepper key');
atLeast(styles.stepperKey.height, 'a Stepper key');
atLeast(styles.input.minHeight, 'the Field');
atLeast(styles.chip.minHeight, 'a day or time chip');
atLeast(motion.choice.minHeight, 'a choice');
atLeast(partStyles.stop.minHeight, 'a route stop');
const schedule = between(book, '{scheduledFor !== null && <Press', 'footer={pending');
const scheduleStyle = schedule.match(/<Row gap=\{8\} style=\{(\{[^}]+\})\}/)?.[1];
assert.ok(scheduleStyle, 'the schedule row exposes its layout box');
const scheduleRow = runInNewContext(`(${scheduleStyle})`);
assert.deepEqual([
  ['the Booking schedule row', scheduleRow.minHeight],
  ['a promo, credit or saved-place chip', bookStyles.chip.minHeight],
  ['a pickup or destination search input', searchStyles.input.minHeight],
].filter(([, height]) => height < MIN), [], 'Booking-specific controls also need a real 48dp target');

const iconButton = between(ui, 'export function IconButton', 'export function Row');
const choices = between(ui, 'export function Choices', 'export function Stepper');
const stepper = between(ui, 'export function Stepper', 'export function Rail');
const chips = between(ui, 'export function FilterChips', 'export function Field');
for (const [name, source] of [['IconButton', iconButton], ['Choices', choices], ['FilterChips', chips]]) {
  assert.ok(!source.includes('hitSlop'), `${name} carries its own ${MIN}dp box instead of a slop over its neighbour`);
}

// ---------- the choice group can be named ----------
assert.match(choices, /label\?: string/, 'a choice group takes an optional name');
assert.match(choices, /accessibilityRole="radiogroup"/);
assert.match(choices, /accessibilityLabel=\{label\}/, 'the name reaches the screen reader as the group name');
for (const label of ['size', 'loadingHelp', 'whenTitle']) assert.match(book, new RegExp(`<Choices label=\\{c\\.${label}\\}`), `Booking names the ${label} group`);
assert.match(chips, /label\?: string/, 'chip groups accept a translated name');
assert.match(chips, /accessibilityRole="radiogroup" accessibilityLabel=\{label\}/);
const picker = between(parts, 'export function SlotPicker', 'export function ServiceIcon');
for (const label of ['scheduleDay', 'scheduleTime']) assert.match(picker, new RegExp(`<FilterChips label=\\{c\\.${label}\\}`));
assert.match(choices, /accessibilityState=\{\{ checked: on, disabled: !!disabled \}\}/, 'a choice reports its selected and disabled state');
assert.match(chips, /accessibilityState=\{\{ checked: item\.key === value, disabled: !!disabled \}\}/, 'a chip reports its selected and disabled state');
// react-native-web 0.21 drops accessibilityState: the browser only hears aria-checked.
assert.match(choices, /aria-checked=\{on\}/, 'a choice is checked on the web too');
assert.match(chips, /aria-checked=\{item\.key === value\}/, 'a chip is checked on the web too');
assert.match(iconButton, /accessibilityState=\{\{ disabled: !!disabled \}\}/, 'an icon button reports its disabled state');
assert.match(stepper, /accessibilityState=\{\{ disabled: disabled \|\| value <= min \}\}/, 'a stepper key reports its disabled state');
assert.match(ui, /accessibilityState=\{\{ busy: !!loading \}\}/, 'a busy button says so');

// The wrapper forwards state to native Pressable through RN's supported ARIA aliases.
const pressSource = between(ui, 'export function Press(', 'export function Button(');
const compiled = ts.transpileModule(pressSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const context = { exports: {}, useState: () => [false, () => {}], Pressable: 'Pressable', Animated: { View: 'Animated.View' }, motion: {},
  require: id => { assert.equal(id, 'react/jsx-runtime'); return { jsx: (type, props) => ({ type, props }) }; } };
runInNewContext(compiled, context);
for (const active of [false, true]) {
  const control = context.exports.Press({ children: 'Request', accessibilityLabel: 'Request parcel', disabled: active, accessibilityState: { busy: active, checked: active } });
  assert.equal(control.type, 'Pressable'); assert.equal(control.props.accessibilityLabel, 'Request parcel');
  for (const property of ['disabled', 'aria-disabled', 'aria-busy', 'aria-checked']) assert.equal(control.props[property], active, `Press forwards ${property}`);
}

// ---------- the route spine names each end in the reader's language ----------
const routeLine = between(parts, 'export function RouteLine', 'export function EtaLine');
assert.match(routeLine, /ride \? c\.pickup_ride : c\.pickup/, 'the pickup word comes from the copy dictionary');
assert.match(routeLine, /ride \? c\.dropoff_ride : c\.dropoff/, 'the drop-off word comes from the copy dictionary');
assert.ok(!/['"]Pickup['"]|['"]Drop-off['"]|['"]Destination['"]|['"]Meeting point['"]/.test(routeLine),
  'no English literal can stand in for a translated word');
assert.match(routeLine, /<Txt variant="label">\{label\}<\/Txt>/, 'the word that names the end is readable, not a grey footnote');
assert.match(routeLine, /accessibilityLabel=\{`\$\{label\}: \$\{place\}`\}/, 'the stop reads as its word and its place');

const arBlock = dictionary.slice(dictionary.indexOf('const ar = {'), dictionary.indexOf('const en: Copy = {'));
const enBlock = dictionary.slice(dictionary.indexOf('const en: Copy = {'));
const word = (block, key) => block.match(new RegExp(`^\\s*${key}: '([^']*)'`, 'm'))?.[1];
for (const key of ['pickup', 'dropoff', 'pickup_ride', 'dropoff_ride', 'scheduleDay', 'scheduleTime']) {
  const ar = word(arBlock, key), en = word(enBlock, key);
  assert.ok(ar && /[\u0600-\u06FF]/.test(ar), `the Arabic word for ${key} must be Arabic, not an English literal`);
  assert.ok(en && !/[\u0600-\u06FF]/.test(en), `the English word for ${key} must not be Arabic`);
}

console.log('Booking controls carry a 48dp box, a named choice group and a translated route spine');
