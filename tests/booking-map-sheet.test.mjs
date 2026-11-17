import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

// Shallow-render the real TSX with the platform primitives replaced by inspectable elements.
function renderer(file, rtl = false) {
  const hooks = [];
  let cursor = 0;
  const state = { rtl, language: rtl ? 'ar' : 'en' };
  const copy = { retry: 'Retry', sheetCollapse: 'Collapse', sheetExpand: 'Expand', recenter: 'Recenter', routeOnMap: 'Route' };
  const element = (type, props, key) => ({ type, key, props: { ...props, children: props?.children } });
  const jsxRuntime = { jsx: element, jsxs: element, Fragment: 'Fragment' };
  const native = {
    ActivityIndicator: 'ActivityIndicator', KeyboardAvoidingView: 'KeyboardAvoidingView', Pressable: 'Pressable',
    RefreshControl: 'RefreshControl', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
    Platform: { OS: 'web' },
    StyleSheet: { create: styles => styles, absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, flatten },
    Animated: {
      Value: class { constructor(value) { this.value = value; } setValue(value) { this.value = value; } },
      View: 'Animated.View', spring: (value, options) => ({ start: () => value.setValue(options.toValue) }),
    },
    PanResponder: { create: () => ({ panHandlers: {} }) },
    useWindowDimensions: () => ({ width: 800, height: 360 }),
  };
  const react = {
    useState(initial) {
      const slot = cursor++;
      if (!hooks[slot]) hooks[slot] = { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[slot].value, next => { hooks[slot].value = typeof next === 'function' ? next(hooks[slot].value) : next; }];
    },
    useRef(initial) {
      const slot = cursor++;
      if (!hooks[slot]) hooks[slot] = { current: initial };
      return hooks[slot];
    },
    useEffect(effect, deps) {
      const slot = cursor++;
      const previous = hooks[slot];
      if (!previous || !deps || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
        if (previous?.cleanup) previous.cleanup();
        hooks[slot] = { deps, cleanup: effect() };
      }
    },
  };
  const mocks = {
    react,
    'react/jsx-runtime': jsxRuntime,
    'react-native': native,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    './motion': { useReducedMotion: () => true },
    './ui': { palette: { paper: 'paper', olive: 'olive', card: 'card', hair: 'hair' }, useCopy: () => ({ c: copy, rtl: state.rtl, language: state.language }) },
    './map-page': { MAP_GROUND: 'ground', MapPage: 'MapPage' },
    './route-preview': { default: 'RoutePreview' },
  };
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(id => {
    if (id in mocks) return mocks[id];
    if (id.endsWith('.js') || id.endsWith('.ts') || id.endsWith('.tsx')) return {};
    throw new Error(`Unexpected import ${id} in ${file}`);
  }, module, module.exports);
  return {
    exports: module.exports,
    state,
    render(component, props) { cursor = 0; return component(props); },
  };
}

function flatten(style) {
  if (!Array.isArray(style)) return style ?? {};
  return Object.assign({}, ...style.flat(Infinity).filter(Boolean).map(flatten));
}

function children(node) {
  if (!node || typeof node !== 'object') return [];
  const value = node.props?.children;
  return (Array.isArray(value) ? value : [value]).flat(Infinity).filter(child => child && typeof child === 'object');
}

function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of children(node)) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}

function layout(node, height) {
  node.props.onLayout({ nativeEvent: { layout: { height } } });
}

const failures = [];
function check(name, test) {
  try { test(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}\n${error.stack}`); }
}

check('48dp grip is layout space, not hitSlop over service headers', () => {
  const view = renderer('map-sheet.tsx');
  const peeks = [];
  let opened = false;
  const props = { header: 'services', footer: 'request', children: 'form', open: false, onOpenChange: value => { opened = value; }, onPeek: value => peeks.push(value) };
  let tree = view.render(view.exports.MapSheet, props);
  const room = find(tree, node => node.type === 'View' && flatten(node.props.style).justifyContent === 'flex-end');
  const sheet = find(tree, node => node.type === 'Animated.View');
  const handle = children(sheet)[0];
  const header = children(handle)[1];
  const footer = children(room)[1];
  layout(room, 360); layout(header, 58); layout(footer, 70);
  tree = view.render(view.exports.MapSheet, props);
  const grip = find(tree, node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Expand');
  assert.equal(flatten(grip.props.style).height, 48, 'the Pressable itself must be 48dp tall');
  assert.equal(grip.props.hitSlop, undefined, 'no invisible target may extend into the service header');
  assert.equal(peeks.at(-1), 0, 'a landscape sheet reserves horizontal, not bottom, map space');
  grip.props.onPress();
  assert.equal(opened, true, 'the real target still expands the sheet');
});

check('Arabic landscape sheet is on the reading end and expanded body remains usable', () => {
  const view = renderer('map-sheet.tsx', true);
  const props = { header: 'services', footer: 'request', children: 'form', open: true, onOpenChange() {}, onPeek() {} };
  let tree = view.render(view.exports.MapSheet, props);
  const room = find(tree, node => node.type === 'View' && flatten(node.props.style).justifyContent === 'flex-end');
  const sheet = find(tree, node => node.type === 'Animated.View');
  const handle = children(sheet)[0];
  layout(room, 360); layout(children(handle)[1], 58); layout(children(room)[1], 70);
  tree = view.render(view.exports.MapSheet, props);
  const expandedSheet = find(tree, node => node.type === 'Animated.View');
  const expandedFooter = children(find(tree, node => node.type === 'View' && flatten(node.props.style).justifyContent === 'flex-end'))[1];
  for (const [name, node] of [['sheet', expandedSheet], ['footer', expandedFooter]]) {
    const style = flatten(node.props.style);
    assert.equal(style.left, 0, `${name} belongs at inline-end (left) in Arabic`);
    assert.equal(style.right, 'auto', `${name} must clear the LTR right constraint`);
    assert.equal(style.width, 340);
  }
  assert.equal(flatten(expandedSheet.props.style).height, 360, 'landscape expansion uses the available height');
  const scroll = find(expandedSheet, node => node.type === 'ScrollView');
  const scrollStyle = flatten(scroll.props.style);
  assert.equal(scrollStyle.flex, 1);
  assert.equal(scrollStyle.marginBottom, 70, 'the expanded form ends above its footer');
  assert.equal(scroll.props.accessibilityElementsHidden, false);
  assert.equal(scroll.props.importantForAccessibility, 'auto');
  assert.ok(360 - 48 - 58 - 70 > 0, 'the expanded form has a positive scroll viewport');
});

check('map Retry is 48dp and translates into the inset-visible map region', () => {
  const view = renderer('scene-map.tsx');
  const props = { mode: 'route', fill: true, insets: { top: 80, bottom: 220, right: 340 } };
  let tree = view.render(view.exports.SceneMap, props);
  find(tree, node => node.type === 'MapPage').props.onFail();
  tree = view.render(view.exports.SceneMap, props);
  const retry = find(tree, node => node.type === 'Pressable');
  const style = flatten(retry.props.style);
  assert.equal(style.minHeight, 48);
  assert.equal(style.minWidth, 48);
  assert.deepEqual(style.transform, [{ translateX: -170 }, { translateY: -70 }], 'top/bottom/right booking overlays cannot cover Retry');
  retry.props.onPress();
  tree = view.render(view.exports.SceneMap, props);
  assert.equal(find(tree, node => node.type === 'MapPage').key, 'en:1', 'Retry advances only the map attempt generation');

  view.state.rtl = true; view.state.language = 'ar';
  const arabic = { ...props, insets: { top: 80, bottom: 0, left: 340 } };
  tree = view.render(view.exports.SceneMap, arabic);
  assert.equal(find(tree, node => node.type === 'MapPage').key, 'ar:1', 'language remains part of the map generation');
  find(tree, node => node.type === 'MapPage').props.onFail();
  tree = view.render(view.exports.SceneMap, arabic);
  assert.deepEqual(flatten(find(tree, node => node.type === 'Pressable').props.style).transform, [{ translateX: 170 }, { translateY: 40 }], 'a left-side Arabic sheet leaves Retry on its right');
});

if (failures.length) throw new Error(`${failures.length} booking map-sheet regression(s): ${failures.join(', ')}`);
console.log('Booking map-sheet regressions passed');
