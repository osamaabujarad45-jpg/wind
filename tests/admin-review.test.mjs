// UX-02: an admin reviews a settings or role change before anything is sent. The two screens run here
// against a stub React and stub UI, with the real copy and model code. Each test asserts the recorded
// requests (path, method, body), so "no write before confirmation" and "only changed keys" are proven, not assumed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
// `receipt` is what GET /admin/cash/commands/:id answers: one entry for every id, or a function of the request id (which may
// return a promise, to hold the lookup open).
function screen(file, language, { data = {}, me = {}, store = new Map(), effects = false, receipt = null, delayPayroll = false } = {}) {
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
    useEffect(run, deps) {
      const index = cursor++, previous = slots[index];
      if (effects && (!deps || !previous || deps.some((dep, i) => !Object.is(dep, previous[i])))) { slots[index] = deps; run(); }
    },
  };
  // The server side of the stub. A "lost" call still reaches the server first (the write commits) and then the reply is dropped.
  // The settings screen negotiates the payroll rate with ?payroll=1 (older admin builds never see it); calls log the bare path.
  const payrollView = settings => { const { pickupPayPerKm = 1, ...legacy } = settings ?? {}; return { settings: legacy, pickupPayPerKm }; };
  const openedWith = serverSettings ? payrollView(serverSettings) : null; // what the screen fetched when it opened
  let payrollData = delayPayroll ? null : openedWith;
  const api = async (rawPath, body, method) => {
    const payroll = rawPath.endsWith('?payroll=1'), path = rawPath.replace('?payroll=1', '');
    calls.push(JSON.parse(JSON.stringify({ path, body: body ?? null, method: method ?? null })));
    const lost = loseNext;
    loseNext = false;
    if (path === '/me') {
      if (lost) throw new Error('network');
      return payroll ? payrollView(serverSettings) : { ...me, settings: { ...serverSettings } };
    }
    if (path === '/admin/settings') {
      // The server's compare-and-set: refuse, before anything is written, if a reviewed value has moved.
      const { expected = {}, ...writes } = body;
      if (Object.entries(expected).some(([key, value]) => serverSettings[key] !== value)) throw new ApiError('settings_changed');
      serverSettings = { ...serverSettings, ...writes };
      if (holding) { holding = false; await new Promise(resolve => { releaseHeld = resolve; }); }
      if (lost) throw new Error('network');
      return payroll ? payrollView(serverSettings) : { ...serverSettings };
    }
    if (path.startsWith('/admin/cash/commands/')) { if (lost) throw new Error('network'); return { entry: typeof receipt === 'function' ? await receipt(path.split('/').pop()) : receipt }; }
    if (lost) throw new Error('network');
    return { reference: 'REF-1' };
  };
  const c = copy[language];
  const ui = new Proxy({
    fill, palette: {}, tones: {}, haptic: { success() {}, error() {} },
    confirm: (message, yes, yesLabel, noLabel) => dialogs.push({ message, yes, yesLabel, noLabel }),
    useCopy: () => ({ c, rtl: language === 'ar', err: e => typeof e === 'string' ? e : e.message, money: n => String(n), largeText: false }),
  }, { get: (target, name) => name in target ? target[name] : String(name) });
  const session = { me, refresh: async () => {}, signOut: async () => {}, language, setLanguage() {} };
  class ApiError extends Error {}
  const modules = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': new Proxy({}, { get: (_, name) => String(name) }),
    '../../api': { api, ApiError, apiSessionRevision: () => 0, useApi: path => ({ data: path === '/me?payroll=1' ? payrollData : path in data ? data[path] : [], error: undefined, reload: async () => {} }) },
    '../../model': model,
    '../../parts': { useFormat: () => ({ date: String, time: String }), PasswordCard: 'PasswordCard' },
    '../../session': { useSession: () => session },
    '../../phone/flow': { codeInput: raw => raw },
    '../../admin-cash-command': cashCommand,
    '../../storage': { storage: { exclusive: run => run(), get: async key => store.get(key) ?? null, set: async (key, value) => { if (value === null) store.delete(key); else store.set(key, value); } } },
    '../../booking': { newRequestId: () => randomUUID() }, // a real UUID: a saved cash command with any other id is refused
    '../../ui': ui,
    'expo-router': { router: {} },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules, `unexpected import ${name}`); return modules[name]; } };
  runInNewContext(ts.transpileModule(read(`src/app/admin/${file}.tsx`), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return {
    calls, dialogs, store,
    deliverPayroll() { payrollData = openedWith; },
    // UI components are mocked as string types; a function-typed element is the screen's own component, rendered inline
    // with the shared hook cursor as React would render it.
    render() { cursor = 0; const expand = node => !node || typeof node !== 'object' ? node : typeof node.type === 'function' ? expand(node.type(node.props))
      : node.props?.children === undefined ? node : { ...node, props: { ...node.props, children: [node.props.children].flat(Infinity).map(expand) } };
      return expand(context.exports.default()); },
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

  // The initial payroll response can arrive before or after the first confirmed save.
  for (const arrivesAfterSave of [false, true]) {
    const config = screen('settings', language, { me: { settings: settingsBase }, effects: true, delayPayroll: true });
    field(config.render(), c.set_parcelPrice).onChangeText(typed12);
    if (!arrivesAfterSave) { config.deliverPayroll(); config.render(); }
    assert.equal(field(config.render(), c.set_parcelPrice).value, typed12, 'an early response preserves the touched value');
    await tap(config, c.save);
    config.dialogs[0].yes(); await flush();
    if (arrivesAfterSave) { config.deliverPayroll(); config.render(); }
    assert.equal(field(config.render(), c.set_parcelPrice).value, '12');
    field(config.render(), c.set_parcelPrice).onChangeText(typed14);
    await tap(config, c.save);
    config.dialogs[1].yes(); await flush();
    assert.deepEqual(config.calls.at(-1).body, { parcelPrice: 14, expected: { parcelPrice: 12 } });
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
  // A user's actions open from their row (design review 17 Nov), so each check opens it first.
  const people = async () => {
    const view = screen('users', language, { data: { '/admin/users?q=': [user] }, me: { user: { id: 99 }, capabilities: {} } });
    const row = nodes(view.render(), 'Press').find(props => props.accessibilityLabel?.startsWith(user.name));
    assert.ok(row, 'user row');
    await row.onPress();
    return view;
  };
  {
    const view = await people();
    await tap(view, c.editUser);
    nodes(view.render(), 'Choices').find(props => props.value === 'customer').onChange('driver');
    await tap(view, c.save);
    assert.equal(view.calls.length, 0, 'no write before the role change is confirmed');
    assert.equal(view.dialogs.length, 1);
    const [review] = view.dialogs;
    // The name and phone are isolated inside the sentence, so a Latin name cannot reorder an Arabic one (A53 walk).
    assert.equal(review.message, fill(c.userRoleChangeConfirm, { name: `${model.isolate(user.name)} · ${model.ltr(user.phone)}`, from: c.customer, to: c.driver }));
    assert.equal(review.yesLabel, c.save);
    review.yes(); await flush();
    assert.deepEqual(view.calls, [{
      path: '/admin/users/2', method: 'PATCH',
      body: { name: 'Customer', email: null, phone: user.phone, role: 'driver', expectedRole: 'customer', vehicle: 'car', plate: null },
    }]);
  }

  // Cancelling the role confirmation sends nothing.
  {
    const view = await people();
    await tap(view, c.editUser);
    nodes(view.render(), 'Choices').find(props => props.value === 'customer').onChange('driver');
    await tap(view, c.save);
    assert.equal(view.dialogs.length, 1);
    assert.equal(view.calls.length, 0, 'cancel leaves the account untouched');
  }

  // An edit that keeps the role saves directly, as before.
  {
    const view = await people();
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
  before.render(); // mounting runs the recovery lookup
  await flush();
  await tap(before, c.cashRecord);
  before.loseNextCall();
  await tap(before, c.cashRecord);
  before.dialogs.at(-1).yes(); await flush();
  const sent = before.calls.at(-1).body;
  assert.equal(store.size, 1, `${language}: the lost entry is on the device`);

  const unknown = screen('cash', language, { data: cashData, me: cashAdmin, effects: true, store }); // app restarted, no receipt yet
  unknown.render(); // mounting runs the recovery lookup
  await flush();
  let tree = unknown.render();
  assert.ok(shows(tree, c.cashUncertain), `${language}: the restored entry says it may be recorded`);
  assert.equal(field(tree, c.cashAmount).disabled, true, `${language}: the restored amount is locked`);
  assert.equal(button(tree, c.cancel).length, 0, `${language}: an unconfirmed entry cannot be dismissed`);
  assert.ok(button(tree, c.cashAdjust).every(props => props.disabled), `${language}: no new entry while one is unconfirmed`);
  assert.ok(unknown.calls.every(call => call.path !== '/admin/cash/remittance'), `${language}: the lookup never records`);
  assert.equal(store.size, 1);

  const known = screen('cash', language, { data: cashData, me: cashAdmin, effects: true, store, receipt: { id: 41, kind: 'remittance', reference: 'R-000041', amountCents: sent.amountCents, note: sent.note ?? '' } }); // a receipt names what it holds
  known.render(); // mounting runs the recovery lookup
  await flush();
  tree = known.render();
  assert.equal(known.calls.find(call => call.path.startsWith('/admin/cash/commands/'))?.path, `/admin/cash/commands/${sent.requestId}`);
  assert.ok(shows(tree, 'R-000041') && !shows(tree, c.cashUncertain), `${language}: the receipt names the recorded entry`);
  assert.ok(known.calls.every(call => call.path !== '/admin/cash/remittance'), `${language}: settled without a second POST`);
  assert.equal(store.size, 0, `${language}: the settled command is cleared`);
}
console.log('Admin cash entry survives a restart and is settled only by its command receipt');

// Sol R21-M1, Haiku r19 N19-1: another tab settled entry X and saved entry Y for another captain, whose reply was lost. This
// tab's Retry on X (in place after a lost reply, or restored after a restart) settles X by its receipt, then drains Y: both
// receipts stay on screen, Y names its captain, and nothing is posted again.
for (const language of ['ar', 'en']) for (const restored of [false, true]) {
  const c = copy[language];
  const store = new Map(), key = cashCommand.cashCommandKey(1);
  const receipts = {};
  const options = { data: cashData, me: cashAdmin, effects: true, store, receipt: id => receipts[id] ?? null };
  let view = screen('cash', language, options);
  view.render(); await flush();
  await tap(view, c.cashRecord);
  view.loseNextCall();
  await tap(view, c.cashRecord);
  view.dialogs.at(-1).yes(); await flush();
  const x = JSON.parse(store.get(key));
  if (restored) { view = screen('cash', language, options); view.render(); await flush(); }
  assert.ok(shows(view.render(), c.cashUncertain), `${language}: X is uncertain`);
  const y = { ...x, requestId: randomUUID(), driverId: 8, amountCents: 300, note: '' };
  store.set(key, JSON.stringify(y)); // the other tab: X settled, Y saved and its reply lost
  receipts[x.requestId] = { id: 51, kind: 'remittance', reference: 'R-201', amountCents: x.amountCents, note: x.note };
  receipts[y.requestId] = { id: 52, kind: 'remittance', reference: 'R-202', amountCents: 300, note: '' };
  const posts = view.calls.filter(call => call.path === '/admin/cash/remittance').length;
  await tap(view, c.cashRetrySame); await flush();
  const tree = view.render();
  assert.ok(shows(tree, 'R-201') && shows(tree, 'R-202'), `${language}/${restored}: both receipts stay on screen`);
  assert.ok(shows(tree, `${model.isolate('Other')} · ${model.ltr('0599000103')} · 3: `), `${language}/${restored}: the drained receipt names its captain and amount`);
  assert.equal(view.calls.filter(call => call.path === '/admin/cash/remittance').length, posts, `${language}/${restored}: nothing is posted again`);
  assert.equal(store.size, 0, `${language}/${restored}: both slots are settled`);
  assert.ok(!shows(tree, c.cashUncertain), `${language}/${restored}: no form is left open`);
}
console.log('Admin cash Retry drains another saved entry and keeps both receipts');

// Sol R21-M2, Haiku r19 N19-2: the installed build's positive adjustment and this build's refused record for another captain,
// neither with a receipt. Both instructions stay on screen, each naming its captain, even when the drain finishes before the
// balance list loads (Haiku r20 N20-1).
for (const language of ['ar', 'en']) {
  const store = new Map();
  const data = { ...cashData, '/admin/cash': undefined }; // the balance list has not loaded yet
  const legacy = { ...cashCommand.newCashCommand(1, 7, 'adjustment', 100, 'Promo credits paid in cash'), schemaVersion: 1 };
  const marked = { ...cashCommand.newCashCommand(1, 8, 'remittance', 300, ''), refused: true };
  store.set(cashCommand.legacyCashCommandKey(1), JSON.stringify(legacy));
  store.set(cashCommand.cashCommandKey(1), JSON.stringify(marked));
  const view = screen('cash', language, { data, me: cashAdmin, effects: true, store });
  view.render(); await flush();
  assert.ok(shows(view.render(), '#7 · 1: cash_command_ambiguous') && shows(view.render(), '#8 · 3: cash_command_settled'), `${language}: both lines name their captain before the list loads`);
  data['/admin/cash'] = cashData['/admin/cash']; // the list arrives
  const tree = view.render();
  assert.ok(shows(tree, `${model.isolate('Driver')} · ${model.ltr('0599000102')} · 1: cash_command_ambiguous`), `${language}: the installed build's instruction names its captain`);
  assert.ok(shows(tree, `${model.isolate('Other')} · ${model.ltr('0599000103')} · 3: cash_command_settled`), `${language}: the second refusal is added, not swapped in`);
  assert.equal(store.size, 0, `${language}: both slots are settled`);
  assert.ok(view.calls.every(call => !call.path.startsWith('/admin/cash/remittance') && !call.path.startsWith('/admin/cash/adjustment')), `${language}: nothing is posted`);
  // Haiku r21 N21-5: the line leads with the screen's direction mark.
  assert.ok(shows(tree, `${language === 'ar' ? '\u200f' : '\u200e'}${model.isolate('Driver')}`), `${language}: the line leads with the screen's direction`);
  // Haiku r21 N21-1: a new action keeps every captain's drained instruction.
  await tap(view, copy[language].cashRecord); // a row's form opens
  await tap(view, copy[language].cashRecord); // the form's record button asks for review
  view.dialogs.at(-1).yes(); await flush(); // a new entry is submitted and recorded
  const after = view.render();
  assert.ok(shows(after, 'REF-1'), `${language}: the new entry is recorded`);
  assert.ok(shows(after, '1: cash_command_ambiguous') && shows(after, '3: cash_command_settled'), `${language}: a submit keeps every captain's instruction`);
}
console.log('Admin cash recovery keeps every instruction of one drain');

// Sol R22-M2: two captains with one name, one adjustment each of the same amount, in the installed build's slot and in this
// build's; both receipts match and carry no reference. Two recorded lines, told apart by phone.
for (const language of ['ar', 'en']) {
  const c = copy[language];
  const store = new Map();
  const data = { '/admin/cash': [
    { driverId: 7, name: 'Omar', phone: '0599000201', owedCents: 0, pendingCents: 0, lastRemittanceAt: null },
    { driverId: 8, name: 'Omar', phone: '0599000202', owedCents: 0, pendingCents: 0, lastRemittanceAt: null }], '/admin/cash/pending': [] };
  const legacy = { ...cashCommand.newCashCommand(1, 7, 'adjustment', 500, 'Fuel card charge'), schemaVersion: 1 };
  const current = cashCommand.newCashCommand(1, 8, 'adjustment', 500, 'Fuel card charge');
  store.set(cashCommand.legacyCashCommandKey(1), JSON.stringify(legacy));
  store.set(cashCommand.cashCommandKey(1), JSON.stringify(current));
  const receipts = { [legacy.requestId]: { id: 61, kind: 'adjustment', reference: null, amountCents: 500, note: legacy.note },
    [current.requestId]: { id: 62, kind: 'adjustment', reference: null, amountCents: 500, note: current.note } };
  const view = screen('cash', language, { data, me: cashAdmin, effects: true, store, receipt: id => receipts[id] ?? null });
  view.render(); await flush();
  const tree = view.render();
  for (const phone of ['0599000201', '0599000202'])
    assert.ok(shows(tree, `${model.isolate('Omar')} · ${model.ltr(phone)} · 5: ${c.cashAdjustRecorded}`), `${language}: the adjustment for ${phone} is shown`);
  assert.equal(store.size, 0, `${language}: both slots are settled`);
}
console.log('Admin cash drain tells same-name captains apart');

// Haiku r21 N21-2: a captain who leaves the balance list after the drain keeps the name and phone the list showed.
for (const language of ['ar', 'en']) {
  const store = new Map();
  const data = { ...cashData };
  const marked = { ...cashCommand.newCashCommand(1, 8, 'remittance', 300, ''), refused: true };
  store.set(cashCommand.cashCommandKey(1), JSON.stringify(marked));
  const view = screen('cash', language, { data, me: cashAdmin, effects: true, store });
  view.render(); await flush();
  // Haiku r22 F4: while the captain is on the list, the live name wins over the one captured at settlement.
  data['/admin/cash'] = cashData['/admin/cash'].map(row => row.driverId === 8 ? { ...row, name: 'Renamed' } : row);
  assert.ok(shows(view.render(), `${model.isolate('Renamed')} · ${model.ltr('0599000103')} · 3: `), `${language}: the live name is shown`);
  data['/admin/cash'] = cashData['/admin/cash'].filter(row => row.driverId !== 8); // captain 8 left the list
  assert.ok(shows(view.render(), `${model.isolate('Other')} · ${model.ltr('0599000103')} · 3: cash_command_settled`), `${language}: the captured name stays`);
}
console.log('Admin cash drained line keeps a departed captain\'s name');

// Sol R23-L2: the installed build's adjustment has no receipt (check the balance), then this build's entry has a matching
// receipt. The receipt is added beside the instruction, never in its place.
for (const language of ['ar', 'en']) {
  const store = new Map();
  const legacy = { ...cashCommand.newCashCommand(1, 7, 'adjustment', 100, 'Promo credits paid in cash'), schemaVersion: 1 };
  const current = cashCommand.newCashCommand(1, 8, 'remittance', 300, '');
  store.set(cashCommand.legacyCashCommandKey(1), JSON.stringify(legacy));
  store.set(cashCommand.cashCommandKey(1), JSON.stringify(current));
  const receipts = { [current.requestId]: { id: 81, kind: 'remittance', reference: 'R-81', amountCents: 300, note: '' } };
  const view = screen('cash', language, { data: cashData, me: cashAdmin, effects: true, store, receipt: id => receipts[id] ?? null });
  view.render(); await flush();
  const tree = view.render();
  assert.ok(shows(tree, `${model.ltr('0599000102')} · 1: cash_command_ambiguous`), `${language}: the instruction stays`);
  assert.ok(shows(tree, `${model.ltr('0599000103')} · 3: `) && shows(tree, 'R-81'), `${language}: the receipt is added beside it`);
  assert.equal(store.size, 0, `${language}: both slots are settled`);
}
console.log('Admin cash receipt never replaces an earlier instruction');

// Sol R23-L3, Haiku r20 N20-4: while the mount recovery's receipt lookup is open, no handover can be marked; afterwards a
// confirmed resolution is sent and its notice sits beside the recovered receipt.
for (const language of ['ar', 'en']) {
  const c = copy[language];
  const store = new Map();
  const saved = cashCommand.newCashCommand(1, 7, 'remittance', 100, '');
  store.set(cashCommand.cashCommandKey(1), JSON.stringify(saved));
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const data = { ...cashData, '/admin/cash/pending': [{ id: 5, amountCents: 100, createdAt: 0, userName: 'Driver', userPhone: '0599000102', userStatus: 'active', reference: null }] };
  const view = screen('cash', language, { data, me: cashAdmin, effects: true, store, receipt: () => held });
  view.render(); await flush();
  let tree = view.render();
  for (const title of [c.cashMarkConfirmed, c.cashMarkDisputed])
    assert.ok(button(tree, title).length === 1 && button(tree, title)[0].disabled, `${language}: ${title} waits for the recovery`);
  release({ id: 71, kind: 'remittance', reference: 'R-71', amountCents: 100, note: '' }); await flush(); await flush();
  tree = view.render();
  assert.ok(shows(tree, 'R-71'), `${language}: the recovered receipt is shown`);
  for (const title of [c.cashMarkConfirmed, c.cashMarkDisputed])
    assert.equal(button(tree, title)[0].disabled, false, `${language}: ${title} is available after the recovery`);
  await tap(view, c.cashMarkConfirmed);
  assert.ok(shows(view.render(), 'R-71'), `${language}: a Mark press keeps the drained receipt (Haiku r22 F2/F3)`);
  field(view.render(), c.cashResolutionReason).onChangeText('Cash counted at the office');
  await tap(view, c.cashResolveSave);
  view.dialogs.at(-1).yes(); await flush();
  const sent = view.calls.at(-1);
  assert.deepEqual([sent.path, sent.body.decision], ['/admin/cash/5/resolve', 'confirm'], `${language}: the resolution is sent`);
  tree = view.render();
  assert.ok(shows(tree, 'R-71') && shows(tree, c.cashResolved), `${language}: the resolution notice is added beside the receipt`);
}
console.log('Admin cash handover marking waits for the recovery');
