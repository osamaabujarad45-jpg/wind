import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { copy } = require('../src/copy.ts');
const state = { slots: [], cursor: 0, language: 'en', reduced: false };
const react = {
  useContext: () => undefined,
  useMemo: fn => fn(),
  useCallback: fn => fn,
  useRef: value => state.slots[state.cursor++] ??= { current: value },
  useState(initial) {
    const slot = state.slots[state.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
  },
  useEffect: () => {},
  Children: { toArray: children => [children].flat(Infinity).filter(child => child !== null && child !== undefined && child !== false) },
};
const entering = { duration() { return this; }, delay() { return this; } };
const native = {
  ActivityIndicator: 'ActivityIndicator', Alert: { alert() {} }, Keyboard: { addListener: () => ({ remove() {} }) },
  KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' }, Pressable: 'Pressable', RefreshControl: 'RefreshControl',
  ScrollView: 'ScrollView', StyleSheet: { create: styles => styles, absoluteFill: { position: 'absolute' }, flatten: style => Array.isArray(style) ? Object.assign({}, ...style) : style || {} },
  Text: 'Text', TextInput: 'TextInput', View: 'View',
};
const modules = {
  react: { ...react, default: react, __esModule: true },
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  'react-native': native,
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  './motion': { __esModule: true, default: { View: 'Animated.View' }, css: { create: styles => styles }, cubicBezier: () => null,
    FadeInDown: entering, useReducedMotion: () => state.reduced },
  '@expo/vector-icons': { Ionicons: 'Ionicons' },
  'expo-haptics': { notificationAsync: async () => {}, selectionAsync: async () => {}, NotificationFeedbackType: { Success: 'success', Error: 'error' } },
  'expo-router': { router: { back() {}, replace() {}, canGoBack: () => false } },
  'expo-router/js-tabs': { BottomTabBarHeightContext: {} },
  './copy': { copy, fill: (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, String(value)), text) },
  './api': { errorCode: error => error?.message ?? 'generic' },
  './session': { useSession: () => ({ language: state.language }) },
};
const source = ts.transpileModule(readFileSync(new URL('../src/ui.tsx', import.meta.url), 'utf8'), {
  fileName: 'ui.tsx', compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {}, require: name => { assert.ok(name in modules, `missing stub ${name}`); return modules[name]; } };
runInNewContext(source, context, { filename: 'ui.tsx' });
const ui = context.exports;
const render = (name, props = {}) => { state.cursor = 0; return ui[name](props); };
function findAll(node, type, predicate = () => true, out = []) {
  if (!node || typeof node !== 'object') return out;
  if ((!type || node.type === type) && predicate(node)) out.push(node);
  for (const child of [node.props?.children].flat(Infinity)) findAll(child, type, predicate, out);
  return out;
}
const find = (node, type, predicate) => findAll(node, type, predicate)[0];
const findText = (node, text) => find(node, null, item => item.props?.children === text);
const flat = style => Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : style || {};
const luminance = hex => {
  const channels = hex.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrast = (a, b) => { const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (light + 0.05) / (dark + 0.05); };
const failures = [];
async function check(name, test) {
  try { await test(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); }
}

await check('Android shared button targets are at least 48dp', () => {
  assert.ok(ui.size.control >= 48);
  for (const size of ['md', 'sm']) {
    const tree = render('Button', { title: 'Continue', size, onPress() {} });
    assert.ok(flat(tree.props.style).minHeight >= 48, `${size} is ${flat(tree.props.style).minHeight}`);
  }
});
await check('Section actions have a real 48dp target', () => {
  const action = find(render('Section', { title: 'Orders', action: 'See all', onAction() {} }), 'Pressable');
  const style = flat(typeof action.props.style === 'function' ? action.props.style({ pressed: false }) : action.props.style);
  assert.ok(style.minHeight >= 48);
});
await check('Stepper keys and disabled icon state are accessible', () => {
  const tree = render('Stepper', { value: 2, min: 1, max: 3, label: 'Passengers', disabled: true, onChange() {} });
  for (const key of findAll(tree, 'Pressable')) {
    const style = flat(typeof key.props.style === 'function' ? key.props.style({ pressed: false }) : key.props.style);
    assert.ok(style.width >= 48 && style.height >= 48);
    assert.equal(style.backgroundColor, ui.palette.muted);
    assert.notEqual(style.opacity, 0.5);
  }
  assert.ok(contrast(ui.palette.faint, ui.palette.muted) >= 3);
  for (const icon of findAll(tree, 'Ionicons')) assert.equal(icon.props.color, ui.palette.faint);
});
await check('Input geometry and resting border contrast pass', () => {
  const input = find(render('Field', { label: 'Name', value: '', onChangeText() {} }), 'TextInput');
  assert.ok(flat(input.props.style).minHeight >= 48);
  assert.ok(contrast(ui.palette.inputBorder, ui.palette.paper) >= 3);
  assert.ok(contrast(ui.palette.inputBorder, ui.palette.card) >= 3);
});
await check('Icon-button disabled state is visible as well as semantic', () => {
  const button = render('IconButton', { icon: 'add', label: 'Add', disabled: true, onPress() {} });
  assert.equal(button.props.disabled, true);
  assert.ok(flat(button.props.style({ pressed: false })).opacity < 1);
});
await check('Disabled buttons have a distinct fill and readable label', () => {
  const tree = render('Button', { title: 'Waiting', onPress() {}, disabled: true });
  const surface = flat(tree.props.style);
  const label = findText(tree, 'Waiting');
  assert.equal(surface.backgroundColor, ui.palette.muted);
  assert.ok(contrast(label.props.style[label.props.style.length - 1].color, surface.backgroundColor) >= 4.5);
});
await check('Raw shared controls expose immediate pressed and disabled treatments', () => {
  const choices = find(render('Choices', { items: [{ key: 'a', label: 'A' }], value: 'a', onChange() {}, disabled: true }), 'Pressable');
  assert.equal(flat(choices.props.style({ pressed: false })).opacity, 0.5);
  assert.equal(choices.props.accessibilityState.disabled, true);
  assert.equal(flat(find(choices, 'Animated.View').props.style).backgroundColor, ui.palette.olivePale);
  const field = render('Field', { label: 'Name', value: '', onChange() {}, disabled: true });
  const wrap = findAll(field, 'View').find(node => flat(node.props.style).borderWidth === 1);
  assert.equal(flat(wrap.props.style).opacity, 0.72);
  assert.equal(find(field, 'TextInput').props.accessibilityState.disabled, true);
  const chip = find(render('FilterChips', { items: [{ key: 'a', label: 'A' }], value: 'a', onChange() {} }), 'Pressable');
  assert.equal(flat(chip.props.style({ pressed: true })).opacity, 0.72);
  const tab = find(render('TabBar', {
    state: { routes: [{ key: 'home', name: 'home' }], index: 0 },
    descriptors: { home: { options: { title: 'Home' } } },
    navigation: { emit: () => ({ defaultPrevented: false }), navigate() {} },
  }), 'Pressable');
  assert.equal(flat(typeof tab.props.style === 'function' ? tab.props.style({ pressed: true }) : tab.props.style).opacity, 0.72);
});
await check('Choice labels wrap inside narrow service and vehicle segments', () => {
  const tree = render('Choices', { items: [{ key: 'motorcycle', label: 'Motorcycle' }, { key: 'car', label: 'Car' }], value: 'car', onChange() {} });
  const label = findText(tree, 'Motorcycle');
  assert.equal(flat(label.props.style).width, '100%');
  assert.equal(label.props.numberOfLines, undefined);
});

await check('Shared errors announce assertively in native and web semantics', () => {
  const tree = render('ErrorText', { children: 'Network down' });
  const text = findText(tree, 'Network down');
  assert.equal(text.props.accessibilityRole, 'alert');
  assert.equal(text.props.accessibilityLiveRegion, 'assertive');
  assert.equal(text.props['aria-live'], 'assertive');
});

await check('Text scaling is not capped and essential labels can wrap', () => {
  assert.equal(find(render('Txt', { children: 'Orders' }), 'Text').props.maxFontSizeMultiplier, undefined);
  assert.equal(findText(render('Header', { title: 'Dashboard', subtitle: 'Today' }), 'Dashboard').props.numberOfLines, undefined);
  assert.equal(findText(render('Header', { title: 'Dashboard', subtitle: 'Today' }), 'Today').props.numberOfLines, undefined);
  for (const text of findAll(render('Stat', { label: 'Drivers awaiting approval', value: '12', detail: 'Pending review' }), ui.Txt)) {
    assert.equal(text.props.numberOfLines, undefined);
  }
  assert.equal(findText(render('ListRow', { icon: 'person', label: 'Account', onPress() {} }), 'Account').props.numberOfLines, undefined);
});
await check('Rejected pull-to-refresh always clears its spinner', async () => {
  const props = { children: null, onRefresh: async () => { throw new Error('offline'); } };
  let control = find(render('Screen', props), 'ScrollView').props.refreshControl;
  await control.props.onRefresh();
  control = find(render('Screen', props), 'ScrollView').props.refreshControl;
  assert.equal(control.props.refreshing, false);
});
await check('Successful pull-to-refresh clears its spinner', async () => {
  const props = { children: null, onRefresh: async () => {} };
  await find(render('Screen', props), 'ScrollView').props.refreshControl.props.onRefresh();
  assert.equal(find(render('Screen', props), 'ScrollView').props.refreshControl.props.refreshing, false);
});
await check('Loading exposes a localized busy status', () => {
  const tree = render('Loading');
  assert.equal(tree.props.accessibilityRole, 'progressbar');
  assert.equal(tree.props.accessibilityLabel, copy.en.loading);
  assert.equal(tree.props.accessibilityState.busy, true);
});
await check('Reduced motion removes press scaling', () => {
  state.reduced = true;
  let tree = render('Press', { children: null, onPress() {} });
  find(tree, 'Pressable').props.onPressIn();
  tree = render('Press', { children: null, onPress() {} });
  const transform = flat(find(tree, 'Animated.View').props.style).transform ?? [];
  assert.ok(transform.every(item => item.scale === undefined || item.scale === 1));
  state.reduced = false;
});
await check('Reduced motion removes vertical error entrance', () => {
  state.reduced = true;
  assert.equal(find(render('ErrorText', { children: 'Offline' }), 'Animated.View').props.entering, undefined);
  state.reduced = false;
});
await check('Tab counts join wrapping labels instead of crowding icons', () => {
  state.language = 'ar';
  const route = { key: 'users', name: 'users', params: undefined };
  const tree = render('TabBar', {
    state: { routes: [route], index: 0 },
    descriptors: { users: { options: { title: 'المستخدمون', tabBarBadge: 2 } } },
    navigation: { emit: () => ({ defaultPrevented: false }), navigate() {} },
  });
  const tab = find(tree, 'Pressable');
  assert.match(tab.props.accessibilityLabel, /المستخدمون/);
  assert.match(tab.props.accessibilityLabel, /2/);
  assert.equal(findText(tree, 'المستخدمون · 2').props.numberOfLines, undefined);
  assert.equal(find(tree, 'View', item => flat(item.props.style).minWidth === 16), undefined);
  state.language = 'en';
});
await check('Custom tabs honor hidden deep links and keep More selected', () => {
  const routes = [{ key: 'users', name: 'users' }, { key: 'settings', name: 'settings' }, { key: 'more', name: 'more' }];
  let navigated;
  const tree = render('TabBar', {
    state: { routes, index: 1 },
    descriptors: {
      users: { options: { title: 'Users' } },
      settings: { options: { title: 'Settings', tabBarItemStyle: { display: 'none' } } },
      more: { options: { title: 'More' } },
    },
    navigation: { emit: () => ({ defaultPrevented: false }), navigate(name) { navigated = name; } },
  });
  const tabs = findAll(tree, 'Pressable');
  assert.equal(tabs.length, 2);
  const more = tabs.find(tab => tab.props.accessibilityLabel === 'More');
  assert.equal(more.props.accessibilityState.selected, true);
  more.props.onPress();
  assert.equal(navigated, 'more');
});
await check('Admin navigation has at most five visible destinations and a More route', () => {
  const layout = readFileSync(new URL('../src/app/admin/_layout.tsx', import.meta.url), 'utf8');
  const screens = layout.match(/<Tabs\.Screen[\s\S]*?\/>/g) ?? [];
  assert.ok(screens.filter(screen => !/href:\s*null/.test(screen)).length <= 5);
  assert.ok(existsSync(new URL('../src/app/admin/more.tsx', import.meta.url)));
});
await check('Near-threshold authored text pairs remain AA', () => {
  assert.ok(contrast(ui.palette.faint, ui.palette.paper) >= 4.5);
  assert.ok(contrast(ui.palette.olive, ui.palette.olivePale) >= 4.5);
});

assert.deepEqual(failures, [], `\n${failures.join('\n')}`);
console.log('Shared UI: targets, dynamic text, contrast, states, motion, refresh, loading, tabs and admin navigation passed');
