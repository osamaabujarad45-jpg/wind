import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { copy, fill } from '../src/copy.ts';
import * as model from '../src/model.ts';

// Render the actual components with native host elements mocked; this verifies
// layout decisions and retained actions, not glyph measurement on a phone.
let language = 'en', dimensions = { width: 390, fontScale: 1 }, reduced = false;
const jsx = (type, props) => ({ type, props });
const react = {
  useState: value => [typeof value === 'function' ? value() : value, () => {}],
  useRef: current => ({ current }), useContext: () => undefined,
  useMemo: fn => fn(), useEffect() {}, useCallback: fn => fn,
  Children: { toArray: children => [children].flat(Infinity).filter(Boolean) },
};
const native = Object.fromEntries(['ActivityIndicator', 'Alert', 'Keyboard', 'KeyboardAvoidingView', 'Pressable', 'RefreshControl', 'ScrollView', 'Text', 'TextInput', 'View'].map(key => [key, key]));
Object.assign(native, { Platform: { OS: 'android' }, StyleSheet: { create: value => value, absoluteFill: {} }, useWindowDimensions: () => dimensions });
const motion = { default: { View: 'AnimatedView' }, css: { create: value => value }, cubicBezier() {},
  FadeInDown: { duration: () => ({ delay: () => 'entering' }) }, useReducedMotion: () => reduced };
function load(path, modules) {
  const context = { exports: {}, require: name => { assert.ok(name in modules, `${path}: ${name}`); return modules[name]; } };
  runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
const common = {
  react: { default: react, ...react }, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
  'expo-router': { router: {}, Redirect: 'Redirect', useLocalSearchParams: () => ({ id: '9' }) },
};
const ui = load('src/ui.tsx', { ...common, './motion': motion,
  '@expo/vector-icons': { Ionicons: Object.assign(() => {}, { glyphMap: {} }) }, 'expo-haptics': {},
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, 'expo-router/js-tabs': { BottomTabBarHeightContext: {} },
  './copy': { copy, fill }, './api': { errorCode: String }, './session': { useSession: () => ({ language }) },
});
function nodes(node, type) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, type));
  return [...(node.type === type ? [node.props] : []), ...nodes(node.props?.children, type)];
}
const style = value => Object.assign({}, ...[value].flat(Infinity).filter(value => value && typeof value === 'object'));
for (language of ['ar', 'en']) {
  for (dimensions of [{ width: 390, fontScale: 1 }, { width: 390, fontScale: 2 }, { width: 320, fontScale: 1 }]) {
    const expanded = dimensions.fontScale > 1.35 || dimensions.width < 360;
    const label = language === 'ar' ? 'مراجعة التحويل النقدي للسائق' : 'Review this driver cash remittance';
    assert.equal(ui.useCopy().largeText, expanded);
    const text = ui.Txt({ children: label, numberOfLines: 1, header: true, selectable: true });
    assert.equal(text.props.numberOfLines, expanded ? undefined : 1);
    assert.equal(text.props.maxFontSizeMultiplier, 2);
    assert.equal(text.props.accessibilityRole, 'header');
    assert.equal(text.props.selectable, true);
    assert.equal(style(text.props.style).textAlign, language === 'ar' ? 'right' : 'left');
    const footer = jsx('Footer', { children: label });
    const screen = ui.Screen({ children: jsx('Body', {}), footer });
    assert.equal(nodes(screen, 'Footer').length, 1, 'footer is never duplicated or removed');
    assert.equal(nodes(nodes(screen, 'ScrollView')[0].children, 'Footer').length, expanded ? 1 : 0,
      'expanded text keeps the action reachable in the content scroller');
    const choices = ui.Choices({ items: [{ key: 'confirm', label }, { key: 'cancel', label: copy[language].cancel }], value: 'confirm', disabled: true, onChange() {} });
    assert.equal(style(choices.props.style).flexDirection, expanded ? 'column' : language === 'ar' ? 'row-reverse' : 'row');
    assert.ok(nodes(choices, 'Pressable').every(props => props.disabled && props.accessibilityRole === 'radio'));
    const list = ui.ListRow({ icon: 'cash-outline', label, value: 'ILS 123456.78', onPress() {} });
    assert.equal(list.props.accessibilityLabel, `${label}: ILS 123456.78`);
    assert.ok(nodes(list, 'Text').every(props => props.numberOfLines === undefined && props.maxFontSizeMultiplier === 2));
    const textGroup = nodes(list, 'View').find(props => nodes(props.children, 'Text').length === 2);
    assert.equal(style(textGroup.style).flexDirection, expanded ? 'column' : language === 'ar' ? 'row-reverse' : 'row');
    const button = ui.Button({ title: label, trailing: 'ILS 123456.78', onPress() {} });
    assert.equal(style(button.props.style).flexDirection, expanded ? 'column' : language === 'ar' ? 'row-reverse' : 'row');
    assert.ok(nodes(button, 'Text').every(props => props.maxFontSizeMultiplier === 2));
  }
}
reduced = true;
assert.equal(ui.ErrorText({ children: 'offline' }).props.entering, undefined);
assert.equal(ui.Appear({ children: 'offline' }).props.entering, undefined);
assert.ok(!style(ui.Press({ children: 'Retry', onPress() {} }).props.children.props.style).transitionDuration,
  'reduced motion removes press scale transitions');

// Actual receipt and cashier screens keep all money/identity fields and stack
// their rows while leaving the server command and confirmation behavior intact.
for (language of ['ar', 'en']) {
  for (dimensions of [{ width: 390, fontScale: 1 }, { width: 390, fontScale: 2 }]) {
    const expanded = dimensions.fontScale === 2;
    const hosts = Object.fromEntries(['Appear', 'Badge', 'Button', 'Card', 'Empty', 'ErrorText', 'Field', 'Header', 'Loading', 'Logo', 'Row', 'Screen', 'Txt'].map(key => [key, key]));
    Object.assign(hosts, { useCopy: ui.useCopy, palette: {}, tones: {}, fill, confirm() {}, haptic: {} });
    const order = { id: 9, status: 'completed', service: 'parcel', priority: 'standard', pickupCity: 'hebron', dropoffCity: 'hebron', option: 'small', price: 123456.78, discount: 0, updatedAt: 1,
      cashCollection: { expectedMinor: 12345678, collectedMinor: 12345600, varianceReason: 'recipient_short' } };
    const receipt = load('src/app/receipt/[id].tsx', { ...common,
      '../../api': { useApi: () => ({ data: order }) }, '../../model': model,
      '../../session': { useSession: () => ({ me: { user: { role: 'admin' }, settings: { commission: 0.1 } } }) },
      '../../parts': { statusText: () => 'Completed', useFormat: () => ({ time: String }) }, '../../ui': hosts,
    }).default();
    const receiptNo = nodes(receipt, 'Row').find(props => nodes(props.children, 'Txt').some(text => text.children === copy[language].receiptNo));
    assert.equal(style(receiptNo.style).flexDirection, expanded ? 'column' : undefined);
    assert.equal(nodes(receiptNo.children, 'Txt')[0].style?.width, expanded ? undefined : 104);
    assert.ok(nodes(receipt, 'Txt').some(props => props.children === 'ILS 123456.78' || String(props.children).includes('123456.78')));
    const cashier = load('src/app/admin/cash.tsx', { ...common,
      '../../api': { useApi: path => ({ data: path.endsWith('/pending') ? [] : [{ driverId: 1, name: 'Driver with a long name', phone: '0599000001', owedCents: 12345678, pendingCents: 0 }], reload() {} }) },
      '../../booking': { newRequestId() {} }, '../../model': model,
      '../../parts': { useFormat: () => ({ date: String }) }, '../../ui': hosts,
    }).default();
    const balance = nodes(cashier, 'Row').find(props => nodes(props.children, 'Txt').some(text => text.children === 'Driver with a long name'));
    assert.equal(style(balance.style).flexDirection, expanded ? 'column' : undefined);
    assert.ok(nodes(cashier, 'Txt').some(props => props.children === '0599000001'));
    assert.equal(nodes(cashier, 'Button').find(props => props.title === copy[language].cashRecord).disabled, false);
  }
}
console.log('Large-text component layouts, AR/EN alignment, footer reachability and reduced-motion fallback passed');
