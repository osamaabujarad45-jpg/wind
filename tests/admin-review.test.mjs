import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { copy, fill } from '../src/copy.ts';
import * as model from '../src/model.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
for (const language of ['ar', 'en']) {
  const c = copy[language];
  for (const [key, placeholders] of Object.entries({
    cashReview: ['action', 'driver', 'amount'], settingsReview: ['changes'], subActivateConfirm: ['name', 'plan'], userRoleChangeConfirm: ['name', 'from', 'to'],
  })) {
    assert.ok(c[key], `${language}.${key}`);
    for (const placeholder of placeholders) assert.ok(c[key].includes(`{${placeholder}}`), `${language}.${key} includes ${placeholder}`);
  }
}
const cash = read('src/app/admin/cash.tsx');
assert.match(cash, /parseMinorUnits/);
assert.doesNotMatch(cash, /Math\.round\(typedNumber\(text\) \* 100\)/);
assert.match(cash, /confirm\(fill\(c\.cashReview/);
assert.match(cash, /requestId: open\.requestId/);
assert.match(cash, /row\.name[\s\S]*row\.phone[\s\S]*row\.driverId/, 'review disambiguates same-name drivers by phone and id');
const settings = read('src/app/admin/settings.tsx');
assert.match(settings, /confirm\(fill\(c\.settingsReview/);
assert.match(settings, /changes/);
const subscriptions = read('src/app/admin/subscriptions.tsx');
assert.match(subscriptions, /onPress=\{\(\) => confirm\(fill\(c\.subActivateConfirm/);
const users = read('src/app/admin/users.tsx');
assert.match(users, /confirm\(fill\(c\.userRoleChangeConfirm/);

// Exercise the screen handlers: source matching alone cannot prove that Cancel prevents a write.
function screen(file, language, data, me = {}) {
  const slots = [], calls = [], dialogs = [];
  let cursor = 0, loseReply = false;
  let serverSettings = me.settings ? { ...me.settings } : null;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect() {},
  };
  const c = copy[language];
  const ui = Object.fromEntries(['Appear', 'Badge', 'Button', 'Card', 'Choices', 'Empty', 'ErrorText', 'Field', 'FilterChips', 'Header', 'IconButton', 'ListGroup', 'ListRow', 'Loading', 'Row', 'Screen', 'Txt'].map(key => [key, key]));
  Object.assign(ui, { fill, tones: {}, palette: {}, haptic: { success() {}, error() {} },
    confirm: (message, yes) => dialogs.push({ message, yes }),
    useCopy: () => ({ c, money: n => `${n < 0 ? '−' : ''}ILS ${Math.abs(n).toFixed(2)}`, err: String, rtl: language === 'ar' }),
  });
  const modules = {
    react, 'react-native': { View: 'View' }, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '../../api': { useApi: path => ({ data: data[path] ?? [], reload: async () => {} }), ApiError: Error,
      api: async (path, body, method) => {
        calls.push(JSON.parse(JSON.stringify({ path, body, method })));
        if (path === '/admin/settings') serverSettings = { ...serverSettings, ...body };
        if (loseReply) { loseReply = false; throw Error('network'); }
        if (path === '/admin/settings') return { ...serverSettings };
        if (path === '/me') return { ...me, settings: { ...serverSettings } };
        return { reference: 'CASH-1' };
      } },
    '../../booking': { newRequestId: () => '00000000-0000-4000-8000-000000000001' },
    '../../model': model, '../../parts': { useFormat: () => ({ date: String, time: String }) },
    '../../session': { useSession: () => ({ me, refresh: async () => {} }) },
    '../../ui': ui, 'expo-router': { router: {} },
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; } };
  runInNewContext(ts.transpileModule(read(`src/app/admin/${file}.tsx`), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return { calls, dialogs, loseReply() { loseReply = true; }, changeServerSettings(patch) { Object.assign(serverSettings, patch); },
    serverSettings: () => serverSettings, render() { cursor = 0; return context.exports.default(); } };
}
function nodes(node, type) {
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === type ? [node.props] : []), ...[node.props?.children].flat(Infinity).flatMap(child => nodes(child, type))];
}
const flush = () => new Promise(resolve => setImmediate(resolve));
for (const language of ['ar', 'en']) {
  const c = copy[language];
  const cash = screen('cash', language, { '/admin/cash': [
    { driverId: 1, name: 'Same name', phone: '0599000001', owedCents: 300, pendingCents: 0 },
    { driverId: 2, name: 'Same name', phone: '0599000002', owedCents: 300, pendingCents: 0 },
  ] });
  nodes(cash.render(), 'Button').filter(p => p.title === c.cashAdjust)[1].onPress();
  nodes(cash.render(), 'Field')[0].onChangeText('-١٫٢٩');
  nodes(cash.render(), 'Field')[1].onChangeText('Approved correction');
  nodes(cash.render(), 'Button').find(p => p.title === c.cashAdjust && p.icon).onPress();
  assert.equal(cash.calls.length, 0, 'no cash write before confirmation');
  const review = cash.dialogs.pop();
  assert.ok(review.message.includes('0599000002') && review.message.includes('#2') && review.message.includes('−ILS 1.29'));
  assert.ok(!review.message.includes('0599000001'), 'the review identifies the selected same-name driver');
  cash.loseReply(); review.yes(); await flush();
  nodes(cash.render(), 'Button').find(p => p.title === c.cashAdjust && p.icon).onPress();
  cash.dialogs.pop().yes(); await flush();
  assert.equal(cash.calls.length, 2);
  assert.deepEqual(cash.calls[1], cash.calls[0], 'lost response retry preserves the payload and request ID');
  assert.equal(cash.calls[0].body.amountCents, -129);
  assert.equal(cash.calls[0].body.driverId, 2);

  const sub = { id: 1, userName: 'Subscriber', userPhone: '0599000003', plan: 'plus', status: 'pending' };
  const subscriptions = screen('subscriptions', language, { '/admin/subscriptions': [sub] });
  nodes(subscriptions.render(), 'Button').find(p => p.title === c.activate).onPress();
  assert.equal(subscriptions.calls.length, 0);
  assert.ok(subscriptions.dialogs[0].message.includes(sub.userPhone) && subscriptions.dialogs[0].message.includes(c.plusTitle));
  subscriptions.dialogs.pop().yes(); await flush();
  assert.deepEqual(subscriptions.calls, [{ path: '/admin/subscriptions/1', body: { action: 'activate' } }]);

  const settings = { ...model.defaultSettings, parcelPrice: 10, commission: 0.1 };
  const config = screen('settings', language, {}, { settings });
  nodes(config.render(), 'Button').find(p => p.title === c.save).onPress();
  assert.equal(config.dialogs.length, 0, 'unchanged settings do not prompt or write');
  nodes(config.render(), 'Field').find(p => p.label === `${c.set_parcelPrice} ₪`).onChangeText('12');
  nodes(config.render(), 'Button').find(p => p.title === c.save).onPress();
  assert.equal(config.calls.length, 0);
  assert.ok(config.dialogs[0].message.includes(`${c.set_parcelPrice}: 10 → 12`));
  assert.ok(!config.dialogs[0].message.includes(c.set_commission), 'review lists only changed fields');
  config.changeServerSettings({ commission: 0.2 });
  config.dialogs.pop().yes(); await flush();
  assert.deepEqual(config.calls[0].body, { parcelPrice: 12 }, 'only reviewed keys are written');
  assert.equal(config.serverSettings().commission, 0.2, 'an unrelated concurrent admin edit survives');
  // The session stub stays stale, as when its best-effort refresh fails after a successful POST.
  nodes(config.render(), 'Field').find(p => p.label === `${c.set_parcelPrice} ₪`).onChangeText('10');
  await nodes(config.render(), 'Button').find(p => p.title === c.save).onPress();
  assert.ok(config.dialogs[0].message.includes(`${c.set_parcelPrice}: 12 → 10`), 'comparison uses the authoritative POST response');
  config.dialogs.pop().yes(); await flush();
  assert.equal(config.serverSettings().parcelPrice, 10);
  assert.equal(config.serverSettings().commission, 0.2);

  // A committed write with a lost response must be reconciled before treating a reversal as unchanged.
  const uncertain = screen('settings', language, {}, { settings });
  nodes(uncertain.render(), 'Field').find(p => p.label === `${c.set_parcelPrice} ₪`).onChangeText('12');
  await nodes(uncertain.render(), 'Button').find(p => p.title === c.save).onPress();
  uncertain.loseReply(); uncertain.dialogs.pop().yes(); await flush();
  assert.equal(uncertain.serverSettings().parcelPrice, 12, 'server committed despite the lost acknowledgement');
  nodes(uncertain.render(), 'Field').find(p => p.label === `${c.set_parcelPrice} ₪`).onChangeText('10');
  // If reconciliation itself fails, neither success nor another write is allowed.
  uncertain.loseReply();
  await nodes(uncertain.render(), 'Button').find(p => p.title === c.save).onPress();
  assert.equal(uncertain.dialogs.length, 0);
  assert.ok(!JSON.stringify(uncertain.render()).includes(c.saved));
  await nodes(uncertain.render(), 'Button').find(p => p.title === c.save).onPress();
  assert.ok(uncertain.dialogs[0].message.includes(`${c.set_parcelPrice}: 12 → 10`));
  uncertain.dialogs.pop().yes(); await flush();
  assert.equal(uncertain.serverSettings().parcelPrice, 10, 'confirmed reversal reaches the server');
  assert.deepEqual(uncertain.calls.filter(call => call.path === '/admin/settings').map(call => call.body), [{ parcelPrice: 12 }, { parcelPrice: 10 }]);

  const user = { id: 2, name: 'Customer', phone: '0599000004', role: 'customer', status: 'active', createdAt: 1 };
  const people = screen('users', language, { '/admin/users?q=': [user] }, { user: { id: 99 } });
  nodes(people.render(), 'Button').find(p => p.title === c.editUser).onPress();
  nodes(people.render(), 'Choices').find(p => p.value === 'customer').onChange('driver');
  nodes(people.render(), 'Button').find(p => p.title === c.save).onPress();
  assert.equal(people.calls.length, 0);
  assert.ok(people.dialogs[0].message.includes(c.customer) && people.dialogs[0].message.includes(c.driver) && people.dialogs[0].message.includes(user.phone));
  people.dialogs.pop().yes(); await flush();
  assert.equal(people.calls[0].body.role, 'driver');
  assert.equal(people.calls[0].method, 'PATCH');
}
console.log('Admin cash, settings, subscription and role-change review contracts passed');
