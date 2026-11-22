import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as booking from '../src/booking.ts';
import { copy, fill } from '../src/copy.ts';
import * as model from '../src/model.ts';
import * as checkout from '../src/shop-checkout.ts';

const c = copy.en;
const cart = { merchantId: 1, merchantName: 'Market', city: 'ramallah', minOrderAgorot: 0,
  deliveryFeeAgorot: 800, serviceFeeAgorot: 0,
  lines: [{ itemId: 10, qtyMilli: 1000, policy: 'remove', unitAgorot: 2000, nameEn: 'Bread' }] };
const state = [], references = [], posts = [], navigation = [];
const store = new Map();
let cursor, refCursor, focus, failFirst, rejectRetry, cartCleared, receiptNow;
class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
const exports = {};
const ui = new Proxy({ useCopy: () => ({ c, language: 'en', money: String }), fill, palette: {} },
  { get: (target, name) => target[name] ?? name });
const modules = {
  react: {
    useCallback: action => action,
    useRef: value => references[refCursor++] ??= { current: value },
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
  },
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  'react-native': { View: 'View' },
  'expo-router': { router: { replace: path => navigation.push(path) }, useLocalSearchParams: () => ({}), useFocusEffect: run => { focus = run; } },
  '../../api': {
    ApiError,
    errorCode: error => error.message,
    api: async (path, body) => {
      if (path.startsWith('/orders/commands/')) return {};
      assert.equal(path, '/orders');
      posts.push(JSON.parse(JSON.stringify(body)));
      if (failFirst) { failFirst = false; throw new ApiError('network'); }
      if (rejectRetry) throw new ApiError('price_changed', 409);
      return { id: 12 };
    },
    storage: { exclusive: run => run(), get: async key => store.get(key) ?? null,
      set: async (key, value) => { if (value === null) store.delete(key); else store.set(key, value); } },
  },
  '../../api-client': { apiSessionRevision: () => 1, serverOffset: () => 0 },
  '../../booking': { ...booking, pendingOutcome: (receipt, command) => booking.pendingOutcome(receipt, command, receiptNow) },
  '../../shop-checkout': checkout,
  '../../model': model,
  '../../pin-sheet': { __esModule: true, default: 'PinSheet' },
  '../../session': { useSession: () => ({ me: { user: { id: 17, role: 'customer', phone: '0599100017' } } }) },
  '../../shop-cart': { useCart: () => cart, storedCart: async () => cart, clearCart: async () => { cartCleared = true; },
    cartGoods: () => 2000, setPolicy() {}, setQuantity() {} },
  '../../shop-ui': { QtyControl: 'QtyControl' },
  '../../ui': ui,
};
const source = readFileSync(new URL('../src/app/shop/cart.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
runInNewContext(compiled.outputText, { exports, require: module => modules[module], setInterval, clearInterval });
const render = () => { cursor = 0; refCursor = 0; return exports.default(); };
function find(node, type, predicate = () => true) {
  if (!node || typeof node !== 'object') return undefined;
  if (node.type === type && predicate(node.props)) return node.props;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, type, predicate);
    if (result) return result;
  }
}
const flush = () => new Promise(resolve => setImmediate(resolve));
for (rejectRetry of [false, true]) {
  state.length = references.length = posts.length = navigation.length = 0;
  failFirst = true;
  cartCleared = false;
  receiptNow = undefined;
  render();
  const unfocus = focus();
  try {
    await flush();
    find(render(), 'Button', props => props.title === c.shopPinSet).onPress();
    find(render(), 'PinSheet').onConfirm({ latitude: 31.9, longitude: 35.2 });
    find(render(), 'Field', props => props.label === c.shopLandmark).onChangeText('Blue door');
    await render().props.footer.props.onPress();
    assert.equal(posts.length, 1);
    assert.ok(![...store.values()][0].includes('Blue door'), 'recovery storage holds no address');
    assert.ok(![...store.values()][0].includes('0599100017'), 'recovery storage holds no contact number');
    find(render(), 'Button', props => props.title === c.retry).onPress();
    await flush();
    assert.deepEqual(posts, [posts[0], posts[0]], 'Retry resends the same command and the same checkout details');
    assert.deepEqual(navigation, rejectRetry ? [] : ['/order/12']);
    assert.equal(cartCleared, !rejectRetry);
    if (rejectRetry) {
      assert.equal(store.size, 1, 'a retry refusal cannot rule out a late first commit');
      receiptNow = JSON.parse([...store.values()][0]).commandExpiresAt + 60_000;
      find(render(), 'Button', props => props.title === c.retry).onPress();
      await flush();
      assert.equal(find(render(), 'Field', props => props.label === c.shopLandmark).value, 'Blue door',
        'a confirmed absence restores the editable checkout with the original input');
      assert.equal(posts.length, 2, 'an expired command is never replayed');
    }
    assert.equal(store.size, 0);
  } finally { unfocus(); }
}
console.log('Shop checkout retries its original command after a transport failure');
