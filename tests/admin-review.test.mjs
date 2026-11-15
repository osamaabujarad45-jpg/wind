// UX-02: an admin reviews a settings or role change before anything is sent. The two screens run here
// against a stub React and stub UI, with the real copy and model code. Each test asserts the recorded
// requests (path, method, body), so "no write before confirmation" and "only changed keys" are proven, not assumed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { copy, fill } from '../src/copy.ts';
import * as model from '../src/model.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

for (const language of ['ar', 'en']) {
  const c = copy[language];
  for (const [key, placeholders] of Object.entries({ settingsReview: ['changes'], userRoleChangeConfirm: ['name', 'from', 'to'] })) {
    assert.ok(c[key], `${language}.${key}`);
    for (const placeholder of placeholders) assert.ok(c[key].includes(`{${placeholder}}`), `${language}.${key} includes ${placeholder}`);
  }
}

// One screen rendered with a stub React: hooks are slots kept in call order, as React keeps them.
// `me` is the session's user record; for settings it carries the server settings the form starts from.
function screen(file, language, { data = {}, me = {} } = {}) {
  const slots = [], calls = [], dialogs = [];
  let cursor = 0, serverSettings = me.settings ? { ...me.settings } : null;
  let loseNext = false, holding = false, releaseHeld = null;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect() {},
  };
  // The server side of the stub. A "lost" call still reaches the server first (the write commits) and then the reply is dropped.
  const api = async (path, body, method) => {
    calls.push(JSON.parse(JSON.stringify({ path, body: body ?? null, method: method ?? null })));
    const lost = loseNext;
    loseNext = false;
    if (path === '/me') {
      if (lost) throw new Error('network');
      return { ...me, settings: { ...serverSettings } };
    }
    if (path === '/admin/settings') {
      serverSettings = { ...serverSettings, ...body };
      if (holding) { holding = false; await new Promise(resolve => { releaseHeld = resolve; }); }
      if (lost) throw new Error('network');
      return { ...serverSettings };
    }
    if (lost) throw new Error('network');
    return { reference: 'REF-1' };
  };
  const c = copy[language];
  const ui = new Proxy({
    fill, palette: {}, tones: {}, haptic: { success() {}, error() {} },
    confirm: (message, yes, yesLabel, noLabel) => dialogs.push({ message, yes, yesLabel, noLabel }),
    useCopy: () => ({ c, err: e => e.message, money: n => String(n), largeText: false }),
  }, { get: (target, name) => name in target ? target[name] : String(name) });
  const session = { me, refresh: async () => {}, signOut: async () => {}, language, setLanguage() {} };
  class ApiError extends Error {}
  const modules = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': new Proxy({}, { get: (_, name) => String(name) }),
    '../../api': { api, ApiError, useApi: path => ({ data: data[path] ?? [], error: undefined, reload: async () => {} }) },
    '../../model': model,
    '../../parts': { useFormat: () => ({ date: String, time: String }), PasswordCard: 'PasswordCard' },
    '../../session': { useSession: () => session },
    '../../phone/flow': { codeInput: raw => raw },
    '../../ui': ui,
    'expo-router': { router: {} },
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules, `unexpected import ${name}`); return modules[name]; } };
  runInNewContext(ts.transpileModule(read(`src/app/admin/${file}.tsx`), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return {
    calls, dialogs,
    render() { cursor = 0; return context.exports.default(); },
    server: () => serverSettings,
    // The next call (a write or a read) commits or answers on the server, then its reply is lost.
    loseNextCall() { loseNext = true; },
    // The next settings write commits but waits; the returned function lets its reply through.
    holdNextSettingsWrite() { holding = true; return () => releaseHeld(); },
    // Another admin saves a different setting while this form is open.
    concurrentServerEdit(patch) { serverSettings = { ...serverSettings, ...patch }; },
  };
}

function nodes(node, type) {
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === type ? [node.props] : []), ...[node.props?.children].flat(Infinity).flatMap(child => nodes(child, type))];
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const shows = (tree, text) => JSON.stringify(tree).includes(text);
const field = (tree, label) => {
  const found = nodes(tree, 'Field').find(props => props.label.startsWith(label));
  assert.ok(found, `field ${label}`);
  return found;
};
const tap = async (view, title) => {
  const button = nodes(view.render(), 'Button').find(props => props.title === title);
  assert.ok(button, `button ${title}`);
  await button.onPress();
};
const arabicDigits = n => String(n).replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]);

const settingsBase = { ...model.defaultSettings, parcelPrice: 10, commission: 0.1 };
const settingsCall = path => call => call.path === path;

for (const language of ['ar', 'en']) {
  const c = copy[language];
  const typed12 = language === 'ar' ? arabicDigits(12) : '12';

  // Unchanged settings: no confirmation, no request, and the form says it is saved.
  {
    const config = screen('settings', language, { me: { settings: settingsBase } });
    await tap(config, c.save);
    assert.equal(config.dialogs.length, 0, 'unchanged settings do not prompt');
    assert.equal(config.calls.length, 0, 'unchanged settings do not write');
    assert.ok(shows(config.render(), c.saved));
  }

  // A change is reviewed first: the review names only the changed key, and no request leaves before Save is confirmed.
  {
    const config = screen('settings', language, { me: { settings: settingsBase } });
    field(config.render(), c.set_parcelPrice).onChangeText(typed12);
    await tap(config, c.save);
    assert.equal(config.calls.length, 0, 'no request before the admin confirms');
    assert.equal(config.dialogs.length, 1);
    const [review] = config.dialogs;
    assert.equal(review.message, fill(c.settingsReview, { changes: `${c.set_parcelPrice}: 10 → 12` }), 'only the changed key, old → new');
    assert.equal(review.yesLabel, c.save);
    assert.equal(review.noLabel, c.cancel);
    review.yes(); await flush();
    assert.deepEqual(config.calls, [{ path: '/admin/settings', body: { parcelPrice: 12 }, method: 'POST' }], 'one POST carrying only the reviewed key');
    assert.equal(config.server().parcelPrice, 12);
    assert.ok(shows(config.render(), c.saved));
  }

  // Cancel leaves the server and the form's baseline untouched.
  {
    const config = screen('settings', language, { me: { settings: settingsBase } });
    field(config.render(), c.set_parcelPrice).onChangeText(typed12);
    await tap(config, c.save);
    assert.equal(config.dialogs.length, 1);
    assert.equal(config.calls.length, 0);
  }

  // Unrelated concurrent edit: the write names only the reviewed key, so another admin's commission survives.
  {
    const config = screen('settings', language, { me: { settings: settingsBase } });
    field(config.render(), c.set_parcelPrice).onChangeText(typed12);
    await tap(config, c.save);
    config.concurrentServerEdit({ commission: 0.2 });
    config.dialogs[0].yes(); await flush();
    assert.deepEqual(config.calls[0].body, { parcelPrice: 12 }, 'only the reviewed key is sent');
    assert.equal(config.server().commission, 0.2, 'the concurrent commission edit survives');
    assert.equal(field(config.render(), c.set_commission).value, '0.2', 'the form takes the server state from the reply');
  }

  // The comparison uses the server's reply to the last write, not the session copy (which a failed refresh leaves stale).
  {
    const config = screen('settings', language, { me: { settings: settingsBase } });
    field(config.render(), c.set_parcelPrice).onChangeText(typed12);
    await tap(config, c.save);
    config.dialogs[0].yes(); await flush();
    field(config.render(), c.set_parcelPrice).onChangeText('10');
    await tap(config, c.save);
    assert.equal(config.dialogs.at(-1).message, fill(c.settingsReview, { changes: `${c.set_parcelPrice}: 12 → 10` }), 'compared against the saved 12, not the stale 10');
    config.dialogs.at(-1).yes(); await flush();
    assert.equal(config.server().parcelPrice, 10);
  }

  // Timeout after the server committed: no "Saved" for a write that was not confirmed, the next comparison re-reads /me,
  // and a confirmed reversal really writes.
  {
    const config = screen('settings', language, { me: { settings: settingsBase } });
    field(config.render(), c.set_parcelPrice).onChangeText(typed12);
    await tap(config, c.save);
    config.loseNextCall();
    config.dialogs[0].yes(); await flush();
    assert.equal(config.server().parcelPrice, 12, 'the server committed despite the lost reply');
    assert.ok(!shows(config.render(), c.saved), 'a lost reply is not reported as saved');
    assert.ok(shows(config.render(), 'network'), 'the failure is shown');
    field(config.render(), c.set_parcelPrice).onChangeText('10');
    await tap(config, c.save);
    assert.equal(config.calls.at(-1).path, '/me', 'the stale baseline is replaced by a direct read of /me');
    assert.equal(config.dialogs.length, 2);
    assert.equal(config.dialogs[1].message, fill(c.settingsReview, { changes: `${c.set_parcelPrice}: 12 → 10` }));
    assert.ok(!shows(config.render(), c.saved), 'no "Saved" before the reversal is written');
    config.dialogs[1].yes(); await flush();
    assert.equal(config.server().parcelPrice, 10, 'the confirmed reversal reaches the server');
    assert.deepEqual(config.calls.filter(settingsCall('/admin/settings')).map(call => call.body), [{ parcelPrice: 12 }, { parcelPrice: 10 }]);
  }

  // If re-reading /me fails too, neither a comparison nor a write happens; the next attempt reads again.
  {
    const config = screen('settings', language, { me: { settings: settingsBase } });
    field(config.render(), c.set_parcelPrice).onChangeText(typed12);
    await tap(config, c.save);
    config.loseNextCall();
    config.dialogs[0].yes(); await flush();
    field(config.render(), c.set_parcelPrice).onChangeText('10');
    config.loseNextCall();
    await tap(config, c.save);
    assert.equal(config.dialogs.length, 1, 'no comparison without a fresh read');
    assert.equal(config.calls.filter(settingsCall('/admin/settings')).length, 1, 'no second write');
    assert.ok(!shows(config.render(), c.saved));
    await tap(config, c.save);
    assert.equal(config.dialogs.length, 2);
    config.dialogs[1].yes(); await flush();
    assert.equal(config.server().parcelPrice, 10);
  }

  // Fields wait while a save is in flight.
  {
    const config = screen('settings', language, { me: { settings: settingsBase } });
    field(config.render(), c.set_parcelPrice).onChangeText(typed12);
    await tap(config, c.save);
    const release = config.holdNextSettingsWrite();
    config.dialogs[0].yes(); await flush();
    assert.equal(field(config.render(), c.set_parcelPrice).disabled, true, 'fields are disabled while the write is in flight');
    assert.equal(field(config.render(), c.set_commission).disabled, true);
    release(); await flush();
    assert.equal(field(config.render(), c.set_parcelPrice).disabled, false);
    assert.ok(shows(config.render(), c.saved));
  }

  // A value the server would refuse is named on its field; nothing is reviewed or sent.
  {
    const config = screen('settings', language, { me: { settings: settingsBase } });
    field(config.render(), c.set_parcelPrice).onChangeText('0');
    await tap(config, c.save);
    assert.equal(config.dialogs.length, 0);
    assert.equal(config.calls.length, 0);
    assert.equal(field(config.render(), c.set_parcelPrice).error, fill(c.set_invalid, { field: c.set_parcelPrice }));
  }

  // Role edits: the confirmation names the person and phone and shows old → new; nothing is sent before it.
  const user = { id: 2, name: 'Customer', phone: '0599000004', role: 'customer', status: 'active', createdAt: 1 };
  const people = () => screen('users', language, { data: { '/admin/users?q=': [user] }, me: { user: { id: 99 }, capabilities: {} } });
  {
    const view = people();
    await tap(view, c.editUser);
    nodes(view.render(), 'Choices').find(props => props.value === 'customer').onChange('driver');
    await tap(view, c.save);
    assert.equal(view.calls.length, 0, 'no write before the role change is confirmed');
    assert.equal(view.dialogs.length, 1);
    const [review] = view.dialogs;
    assert.equal(review.message, fill(c.userRoleChangeConfirm, { name: `${user.name} · ${user.phone}`, from: c.customer, to: c.driver }));
    assert.equal(review.yesLabel, c.save);
    review.yes(); await flush();
    assert.deepEqual(view.calls, [{
      path: '/admin/users/2', method: 'PATCH',
      body: { name: 'Customer', email: null, phone: user.phone, role: 'driver', vehicle: 'car', plate: null },
    }]);
  }

  // Cancelling the role confirmation sends nothing.
  {
    const view = people();
    await tap(view, c.editUser);
    nodes(view.render(), 'Choices').find(props => props.value === 'customer').onChange('driver');
    await tap(view, c.save);
    assert.equal(view.dialogs.length, 1);
    assert.equal(view.calls.length, 0, 'cancel leaves the account untouched');
  }

  // An edit that keeps the role saves directly, as before.
  {
    const view = people();
    await tap(view, c.editUser);
    field(view.render(), c.name).onChangeText('Renamed');
    await tap(view, c.save);
    assert.equal(view.dialogs.length, 0, 'an unchanged role does not prompt');
    assert.deepEqual(view.calls, [{
      path: '/admin/users/2', method: 'PATCH',
      body: { name: 'Renamed', email: null, phone: user.phone, role: 'customer', vehicle: 'car', plate: null },
    }]);
  }
}
console.log('Admin settings and role-change review contracts passed');
