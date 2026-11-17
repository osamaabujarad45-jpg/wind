// UX-02: an admin reviews a settings or role change before anything is sent. The two screens run here
// against a stub React and stub UI, with the real copy and model code. Each test asserts the recorded
// requests (path, method, body), so "no write before confirmation" and "only changed keys" are proven, not assumed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { copy, fill } from '../src/copy.ts';
import * as model from '../src/model.ts';
import * as cashCommand from '../src/admin-cash-command.ts';

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
// `store` is the device's secure storage (shared between two renders = an app restart); `effects` runs mount effects once;
// `receipt` is what GET /admin/cash/commands/:id answers.
function screen(file, language, { data = {}, me = {}, store = new Map(), effects = false, receipt = null } = {}) {
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
    useEffect(run) { const index = cursor++; if (effects && !(index in slots)) { slots[index] = true; run(); } },
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
      // The server's compare-and-set: refuse, before anything is written, if a reviewed value has moved.
      const { expected = {}, ...writes } = body;
      if (Object.entries(expected).some(([key, value]) => serverSettings[key] !== value)) throw new ApiError('settings_changed');
      serverSettings = { ...serverSettings, ...writes };
      if (holding) { holding = false; await new Promise(resolve => { releaseHeld = resolve; }); }
      if (lost) throw new Error('network');
      return { ...serverSettings };
    }
    if (path.startsWith('/admin/cash/commands/')) { if (lost) throw new Error('network'); return { entry: receipt }; }
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
    '../../admin-cash-command': cashCommand,
    '../../storage': { exclusive: run => run(), get: async key => store.get(key) ?? null, set: async (key, value) => { if (value === null) store.delete(key); else store.set(key, value); } },
    '../../booking': { newRequestId: () => `request-${calls.length}-${Math.random().toString(16).slice(2, 8)}` },
    '../../ui': ui,
    'expo-router': { router: {} },
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules, `unexpected import ${name}`); return modules[name]; } };
  runInNewContext(ts.transpileModule(read(`src/app/admin/${file}.tsx`), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return {
    calls, dialogs, store,
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
  const typed14 = language === 'ar' ? arabicDigits(14) : '14';

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
    assert.equal(review.message, fill(c.settingsReview, { changes: `${c.set_parcelPrice}: 10 ₪ → 12 ₪` }), 'only the changed key, old → new');
    assert.equal(review.yesLabel, c.save);
    assert.equal(review.noLabel, c.cancel);
    review.yes(); await flush();
    assert.deepEqual(config.calls, [{ path: '/admin/settings', body: { parcelPrice: 12, expected: { parcelPrice: 10 } }, method: 'POST' }], 'one POST carrying only the reviewed key');
    assert.equal(config.server().parcelPrice, 12);
    assert.ok(shows(config.render(), c.saved));
    // A-02 (A53, bcc0c97): an unsaved edit after a save must not keep saying "Saved".
    field(config.render(), c.set_parcelPrice).onChangeText('19.5');
    assert.ok(!shows(config.render(), c.saved), 'editing a field clears the saved notice');
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
    assert.deepEqual(config.calls[0].body, { parcelPrice: 12, expected: { parcelPrice: 10 } }, 'only the reviewed key is sent');
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
    assert.equal(config.dialogs.at(-1).message, fill(c.settingsReview, { changes: `${c.set_parcelPrice}: 12 ₪ → 10 ₪` }), 'compared against the saved 12, not the stale 10');
    config.dialogs.at(-1).yes(); await flush();
    assert.equal(config.server().parcelPrice, 10);
  }

  // Same setting changed by another admin after this form opened: the server refuses the reviewed write, nothing is
  // overwritten, and the next review starts from the server's current value.
  {
    const config = screen('settings', language, { me: { settings: settingsBase } });
    config.concurrentServerEdit({ parcelPrice: 15 });
    field(config.render(), c.set_parcelPrice).onChangeText(typed12);
    await tap(config, c.save);
    config.dialogs[0].yes(); await flush();
    assert.deepEqual(config.calls.at(-1).body, { parcelPrice: 12, expected: { parcelPrice: 10 } });
    assert.equal(config.server().parcelPrice, 15, 'refused: the other admin change is not overwritten');
    assert.ok(shows(config.render(), 'settings_changed'), 'the refusal is shown');
    assert.ok(!shows(config.render(), c.saved));
    await tap(config, c.save);
    assert.equal(config.calls.at(-1).path, '/me', 'the next review is built from the server value');
    assert.equal(config.dialogs.at(-1).message, fill(c.settingsReview, { changes: `${c.set_parcelPrice}: 15 ₪ → 12 ₪` }));
    config.dialogs.at(-1).yes(); await flush();
    assert.deepEqual(config.calls.at(-1).body, { parcelPrice: 12, expected: { parcelPrice: 15 } });
    assert.equal(config.server().parcelPrice, 12);
  }

  // Once a save is confirmed, a later save with no new edits does not re-send the old value over another admin's change.
  {
    const config = screen('settings', language, { me: { settings: settingsBase } });
    field(config.render(), c.set_parcelPrice).onChangeText(typed12);
    await tap(config, c.save);
    config.dialogs[0].yes(); await flush();
    config.concurrentServerEdit({ parcelPrice: 15 });
    await tap(config, c.save);
    assert.equal(config.dialogs.length, 1, 'no edit since the confirmed save: nothing to review');
    assert.equal(config.calls.filter(settingsCall('/admin/settings')).length, 1);
    assert.equal(config.server().parcelPrice, 15, 'the other admin change is not overwritten');
  }

  // A field edited in an earlier, confirmed save is not still "edited" after a lost reply: the re-read must not
  // send its old value over another admin's newer change.
  {
    const config = screen('settings', language, { me: { settings: settingsBase } });
    field(config.render(), c.set_parcelPrice).onChangeText(typed12);
    await tap(config, c.save);
    config.dialogs[0].yes(); await flush();
    field(config.render(), c.set_commission).onChangeText('0.2');
    await tap(config, c.save);
    config.loseNextCall();
    config.dialogs[1].yes(); await flush();
    config.concurrentServerEdit({ parcelPrice: 15 });
    const reviewed = config.dialogs.length;
    await tap(config, c.save);
    assert.equal(config.dialogs.length, reviewed, 'parcelPrice was not edited since its confirmed save: not reviewed');
    assert.equal(config.calls.filter(settingsCall('/admin/settings')).length, 2, 'no write for it');
    assert.equal(config.server().parcelPrice, 15, 'the other admin change survives');
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
    assert.equal(config.dialogs[1].message, fill(c.settingsReview, { changes: `${c.set_parcelPrice}: 12 ₪ → 10 ₪` }));
    assert.ok(!shows(config.render(), c.saved), 'no "Saved" before the reversal is written');
    config.dialogs[1].yes(); await flush();
    assert.equal(config.server().parcelPrice, 10, 'the confirmed reversal reaches the server');
    assert.deepEqual(config.calls.filter(settingsCall('/admin/settings')).map(call => call.body), [{ parcelPrice: 12, expected: { parcelPrice: 10 } }, { parcelPrice: 10, expected: { parcelPrice: 12 } }]);
  }

  // A lost reply, then another admin edits a field this admin did not touch: the next save sends only the
  // field this admin edited, so the other admin's change survives.
  {
    const config = screen('settings', language, { me: { settings: settingsBase } });
    field(config.render(), c.set_parcelPrice).onChangeText(typed12);
    await tap(config, c.save);
    config.loseNextCall();
    config.dialogs[0].yes(); await flush();
    config.concurrentServerEdit({ commission: 0.2 });
    field(config.render(), c.set_parcelPrice).onChangeText(typed14);
    await tap(config, c.save);
    assert.equal(config.dialogs.at(-1).message, fill(c.settingsReview, { changes: `${c.set_parcelPrice}: 12 ₪ → 14 ₪` }), 'only the edited field is reviewed');
    config.dialogs.at(-1).yes(); await flush();
    assert.deepEqual(config.calls.filter(settingsCall('/admin/settings')).at(-1).body, { parcelPrice: 14, expected: { parcelPrice: 12 } }, 'the untouched commission is not sent');
    assert.equal(config.server().commission, 0.2, 'the other admin commission survives');
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
    config.dialogs[0].yes(); await flush();   // a second confirm of the same review while in flight
    assert.equal(config.calls.filter(settingsCall('/admin/settings')).length, 1, 'a second confirm sends nothing');
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
      body: { name: 'Customer', email: null, phone: user.phone, role: 'driver', expectedRole: 'customer', vehicle: 'car', plate: null },
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
      body: { name: 'Renamed', email: null, phone: user.phone, role: 'customer', expectedRole: 'customer', vehicle: 'car', plate: null },
    }]);
  }
}
console.log('Admin settings and role-change review contracts passed');

const cashData = { '/admin/cash': [
  { driverId: 7, name: 'Driver', phone: '0599000102', owedCents: 100, pendingCents: 0, lastRemittanceAt: null },
  { driverId: 8, name: 'Other', phone: '0599000103', owedCents: 300, pendingCents: 0, lastRemittanceAt: null }], '/admin/cash/pending': [] };
const cashAdmin = { user: { id: 1, role: 'admin' } };
const button = (tree, title) => nodes(tree, 'Button').filter(props => props.title === title);
// A-01 (A53, bcc0c97): a remittance whose reply was lost cannot be re-recorded through the amount check (its own pending
// copy fills the room), so the form offers the same receipt again: same request id, which the server replays, never twice.
for (const language of ['ar', 'en']) {
  const c = copy[language];
  const view = screen('cash', language, { data: cashData, me: cashAdmin, effects: true });
  await flush(); // the mount lookup finds nothing saved
  await tap(view, c.cashRecord); // opens the form
  view.loseNextCall();
  await tap(view, c.cashRecord); // the form's record button asks for review
  view.dialogs.at(-1).yes(); await flush();
  const first = view.calls.at(-1);
  assert.equal(first.path, '/admin/cash/remittance');
  assert.ok(shows(view.render(), c.cashUncertain), `${language}: a lost reply says the receipt may be recorded`);
  // The amount and note are fixed until it is settled: an edited one would be a second receipt for cash already on record.
  assert.equal(field(view.render(), c.cashAmount).disabled, true, `${language}: the amount is locked while the first send is unknown`);
  assert.equal(field(view.render(), c.problemNote).disabled, true);
  await tap(view, c.cashRetrySame); await flush();
  const second = view.calls.at(-1);
  assert.equal(second.path, '/admin/cash/remittance');
  assert.equal(second.body.requestId, first.body.requestId, `${language}: the retry replays the same request id`);
  assert.equal(second.body.amountCents, first.body.amountCents);
  assert.ok(!shows(view.render(), c.cashUncertain), `${language}: a confirmed retry closes the form`);
  assert.equal(view.store.size, 0, `${language}: a confirmed entry clears the saved command`);
}
console.log('Admin cash lost-acknowledgement retry replays the same receipt');

// A-01 after a restart: the saved command comes back locked and blocks new entries; the admin's own command receipt settles
// it without a second POST, and a missing receipt keeps it unconfirmed (never shown as recorded or failed).
for (const language of ['ar', 'en']) {
  const c = copy[language];
  const store = new Map();
  const before = screen('cash', language, { data: cashData, me: cashAdmin, effects: true, store });
  await flush();
  await tap(before, c.cashRecord);
  before.loseNextCall();
  await tap(before, c.cashRecord);
  before.dialogs.at(-1).yes(); await flush();
  const sent = before.calls.at(-1).body;
  assert.equal(store.size, 1, `${language}: the lost entry is on the device`);

  const unknown = screen('cash', language, { data: cashData, me: cashAdmin, effects: true, store }); // app restarted, no receipt yet
  await flush();
  let tree = unknown.render();
  assert.ok(shows(tree, c.cashUncertain), `${language}: the restored entry says it may be recorded`);
  assert.equal(field(tree, c.cashAmount).disabled, true, `${language}: the restored amount is locked`);
  assert.equal(button(tree, c.cancel).length, 0, `${language}: an unconfirmed entry cannot be dismissed`);
  assert.ok(button(tree, c.cashAdjust).every(props => props.disabled), `${language}: no new entry while one is unconfirmed`);
  assert.ok(unknown.calls.every(call => call.path !== '/admin/cash/remittance'), `${language}: the lookup never records`);
  assert.equal(store.size, 1);

  const known = screen('cash', language, { data: cashData, me: cashAdmin, effects: true, store, receipt: { id: 41, kind: 'remittance', reference: 'R-000041' } });
  await flush();
  tree = known.render();
  assert.equal(known.calls.find(call => call.path.startsWith('/admin/cash/commands/'))?.path, `/admin/cash/commands/${sent.requestId}`);
  assert.ok(shows(tree, 'R-000041') && !shows(tree, c.cashUncertain), `${language}: the receipt names the recorded entry`);
  assert.ok(known.calls.every(call => call.path !== '/admin/cash/remittance'), `${language}: settled without a second POST`);
  assert.equal(store.size, 0, `${language}: the settled command is cleared`);
}
console.log('Admin cash entry survives a restart and is settled only by its command receipt');
