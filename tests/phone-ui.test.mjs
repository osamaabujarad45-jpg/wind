// WP06 phone UI rules: truthful states, command IDs across lost acknowledgments, session-scoped storage, exact request bodies.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import {
  awaitingProvider, clock, codeInput, codeUsable, deliveryKey, gateOf, gateReasonKey, issueKey, latestChallenge, normalizePhoneInput,
  outcomeOf, phoneInputOk, secondsUntil,
} from '../src/phone/flow.ts';
import { commandSlot, memorySlot, sessionScope, stableDeviceId, storedSlot } from '../src/phone/command.ts';
import { issueBody, phoneRequests, proveBody, recoveryIssueBody, recoveryProveBody } from '../src/phone/requests.ts';
import { copy, fill } from '../src/copy.ts';
import * as model from '../src/model.ts';
import { ApiError, errorCode } from '../src/api-client.ts';
import { webGet, webSet } from '../src/web-storage.ts';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let counter = 0;
// Deterministic UUIDs in the right shape for tests; the app passes expo-crypto's randomUUID instead.
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

// Phone input: the server's accepted forms, Arabic digits and separators; obvious non-mobile forms rejected.
assert.equal(normalizePhoneInput(' ٠٥٩ ٩٩٩-١٢٣٤٥٦ '), '059999123456');
assert.equal(normalizePhoneInput('00970 599 123 456'), '+970599123456');
for (const ok of ['0599123456', '599123456', '+972599123456', '00970599123456', '056 123 4567', '+970 56 123 4567', '٠٥٦١٢٣٤٥٦٧'])
  assert.ok(phoneInputOk(ok), ok);
for (const bad of ['', '0588123456', '+972588123456', '12345', '059912345678', '+1 5551234567', '05991234x'])
  assert.ok(!phoneInputOk(bad), bad);
assert.equal(codeInput('12 34-56789'), '123456');
// The handover PIN goes through the same filter at its own length: an Arabic keypad's digits are the same digits.
for (const [input, expected] of [['٤٢٧١', '4271'], ['۴۲۷۱', '4271'], ['4٢7۱9', '4271'], ['42 71', '4271']]) assert.equal(codeInput(input, 4), expected, input);
assert.match(readFileSync(new URL('../src/app/order/[id].tsx', import.meta.url), 'utf8'), /setProofInput\(\{ context: proofContext, value: codeInput\(value, 4\) \}\)/, 'the order screen filters the handover PIN');

// Accessibility: errors speak on change; both boarding PINs read as separate digits.
{
  const ui = readFileSync(new URL('../src/ui.tsx', import.meta.url), 'utf8');
  const errorText = ui.slice(ui.indexOf('export function ErrorText'), ui.indexOf('// ---------- display ----------'));
  assert.match(errorText, /useEffect\(\(\) => \{ if \(children && Platform\.OS !== 'web'\) AccessibilityInfo\.announceForAccessibility\(children\); \}, \[children\]\)/);
  assert.match(errorText, /accessibilityRole="alert"/);
  const screen = readFileSync(new URL('../src/app/order/[id].tsx', import.meta.url), 'utf8');
  assert.equal(screen.match(/accessibilityLabel=\{`\$\{c\.rideBoardingCode\} \$\{boardingPin\.split\(''\)\.join\(' '\)\}`\}/g)?.length, 1, 'the PIN shows once, and reads as separate digits');
  assert.match(ui.slice(ui.indexOf('export function Txt'), ui.indexOf('// Section heading')), /<Text[^>]*accessibilityLabel=\{accessibilityLabel\}/);

  // Exercise the actual effect with successive snapshots, including a first load, unchanged polls and another order.
  const start = screen.indexOf('  useEffect(() => {', screen.indexOf('const announced = useRef'));
  const end = screen.indexOf('  }, [order, me, c]);', start);
  assert.ok(start >= 0 && end > start, 'order announcement effect exists');
  const effect = new Function('order', 'me', 'c', 'announced', 'statusText', 'AccessibilityInfo', 'Platform',
    screen.slice(start + '  useEffect(() => {'.length, end));
  const announced = { current: null }, spoken = [];
  const reader = { announceForAccessibility: text => spoken.push(text) };
  const customer = { user: { id: 1, role: 'customer' } }, driver = { user: { id: 2, role: 'driver' } };
  const run = (order, viewer = customer) => effect(order, viewer, copy.en, announced, (_c, o, mine) => `${o.status}:${mine}`, reader, { OS: 'android' });
  const order = { id: 1, status: 'assigned', driverId: 2, destinationChange: null };
  run(order); run({ ...order });
  assert.deepEqual(spoken, [], 'first load and unchanged polls stay silent');
  run({ ...order, status: 'at_pickup' });
  assert.deepEqual(spoken, ['at_pickup:false'], 'a changed status uses the customer text');
  const proposed = { ...order, status: 'at_pickup', destinationChange: { id: 'p1' } };
  run(proposed); run({ ...proposed });
  assert.deepEqual(spoken, ['at_pickup:false', copy.en.destinationWaiting], 'a proposal is announced once');
  run({ ...proposed, id: 2 });
  assert.equal(spoken.length, 2, 'a new order starts silently, even with a proposal');
  run({ ...proposed, id: 2 }, driver);
  run({ ...proposed, id: 2, status: 'in_transit', destinationChange: { id: 'p2' } }, driver);
  assert.equal(spoken[2], `in_transit:true ${copy.en.destinationDriverRequest}`, 'driver status and proposal speak together');
}

// The map is hidden as a sibling, not an ancestor of the search overlay.
{
  const book = readFileSync(new URL('../src/app/book.tsx', import.meta.url), 'utf8');
  assert.match(book, /<View[^>]*accessibilityElementsHidden=\{step === 'search'\}[^>]*importantForAccessibility=\{step === 'search' \? 'no-hide-descendants' : 'auto'\}[^>]*aria-hidden=\{step === 'search'\}[^>]*>\s*<SceneMap/);
  assert.match(book, /onFail=\{\(\) => \{ setMapReady\(false\); setMapFailed\(true\); \}\} \/>\s*<\/View>/);
  assert.ok(book.indexOf("{step === 'search' && <TripSearch") > book.indexOf('setMapFailed(true); }} />'), 'the overlay is outside the hidden map view');
  assert.match(book, /if \(locationError && Platform\.OS !== 'web'\) AccessibilityInfo\.announceForAccessibility\(locationError\)/);
  const submit = book.slice(book.indexOf('  async function submit()'), book.indexOf('  async function release('));
  assert.match(submit, /\} catch \(e\) \{\s*if \(!current\(\)\) return;\s*haptic\.error\(\);\s*setSheetOpen\(true\);/);
  const search = readFileSync(new URL('../src/trip-search.tsx', import.meta.url), 'utf8');
  assert.match(search, /value && !query\[which\] \? `: \$\{value\}`/);
}

// Controls expose count, selection and actual Android-sized targets, without overlapping neighbours.
{
  const ui = readFileSync(new URL('../src/ui.tsx', import.meta.url), 'utf8');
  const stepper = ui.slice(ui.indexOf('export function Stepper'), ui.indexOf('// Horizontal scroller'));
  assert.match(stepper, /accessibilityValue=\{\{ min, max, now: value, text: String\(value\) \}\}/);
  assert.match(stepper, /previous\.current !== value && Platform\.OS !== 'web'\) AccessibilityInfo\.announceForAccessibility\(`\$\{label\}: \$\{value\}`\)/);
  assert.equal(stepper.match(/style=\{styles\.stepperKey\}/g)?.length, 2);
  const style = name => ui.match(new RegExp(`^  ${name}: \\{([^}]+)\\}`, 'm'))?.[1];
  const control = Number(ui.match(/control: (\d+)/)?.[1]);
  const dimension = (source, name) => source?.includes(`${name}: size.control`) ? control : Number(source?.match(new RegExp(`${name}: (\\d+)`))?.[1]);
  for (const name of ['button', 'buttonSmall']) assert.ok(dimension(style(name), 'minHeight') >= 48, `${name} has a real 48dp target`);
  for (const axis of ['width', 'height']) assert.ok(dimension(style('stepperKey'), axis) >= 48, `Stepper ${axis} reaches 48dp`);
  assert.doesNotMatch(stepper, /hitSlop/, 'Stepper targets do not overlap');
  const sheet = readFileSync(new URL('../src/map-sheet.tsx', import.meta.url), 'utf8');
  assert.ok(Number(sheet.match(/const GRIP = (\d+)/)?.[1]) >= 48, 'the grip has a real 48dp target');
  assert.match(sheet, /gripArea: \{ height: GRIP/);
  assert.match(sheet, /accessibilityState=\{\{ expanded: open \}\} style=\{styles\.gripArea\}/);
  const admin = readFileSync(new URL('../src/app/admin/index.tsx', import.meta.url), 'utf8');
  assert.match(admin, /\$\{c\.commissionRevenue\} \$\{money\(d\.commission\)\}, \$\{c\.subscriptionRevenue\} \$\{money\(d\.subscriptions\)\}/);
  assert.match(admin, /accessibilityState=\{\{ selected: i === selected \}\}/);
  const map = readFileSync(new URL('../public/map.html', import.meta.url), 'utf8');
  assert.match(map, /document\.documentElement\.lang = config\.language === 'ar' \? 'ar' : 'en'/);
  const scene = readFileSync(new URL('../src/scene-map.tsx', import.meta.url), 'utf8');
  assert.match(scene, /const config = \{ mode, language,/);
  assert.match(scene, /const run = `\$\{language\}:\$\{attempt\}`/);
}
for (const [input, expected] of [
  ['٠١٢٣٤٥', '012345'], ['٦٧٨٩', '6789'], ['۰۱۲۳۴۵', '012345'], ['۶۷۸۹', '6789'],
  ['123456', '123456'], ['1٢۳-٤۵6extra7', '123456'], ['', ''],
]) assert.equal(codeInput(input), expected, input);

// Exercise the real email-code callbacks and their request bodies, not just the helper in isolation.
{
  let slots = [], cursor = 0, first = true;
  const calls = []; let c = copy.en, language = 'en', linkMode = false;
  const react = {
    useState(value) { const slot = slots[cursor++] ??= { value: typeof value === 'function' ? value() : value };
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; },
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useEffect(fn) { if (first) fn(); },
  };
  const ui = Object.fromEntries(['Appear', 'Avatar', 'Badge', 'Button', 'Card', 'Choices', 'ErrorText', 'Field', 'Header', 'Loading', 'Logo', 'Press', 'Row', 'Screen', 'Txt'].map(name => [name, name]));
  const user = { id: 1, name: 'Test', email: 'test@example.com', emailVerifiedAt: null, createdAt: 0 };
  const fade = { duration: () => ({ delay: () => ({}) }) };
  const modules = {
    react, 'react/jsx-runtime': { Fragment: 'Fragment', jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { KeyboardAvoidingView: 'KeyboardAvoidingView', Linking: {}, Platform: { OS: 'web' }, StyleSheet: { create: value => value }, View: 'View' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, 'expo-router': { router: {} },
    '../motion': { default: { View: 'Animated.View' }, FadeInDown: fade, FadeInUp: fade, useReducedMotion: () => false },
    '../api': { api: async (path, body) => { calls.push({ path, body }); return path === '/auth/options' ? { registrationOpen: true, emailReset: !linkMode, ...(linkMode && { emailResetLink: true }) } : {}; } },
    '../model': model, '../parts': { HelpLinks: 'HelpLinks', useFormat: () => ({ date: () => '' }) },
    '../install-link': { InstallLink: 'InstallLink' }, '../phone-recovery': { PhoneRecovery: 'PhoneRecovery' }, '../phone-card': { PhoneCard: 'PhoneCard' },
    '../session': { useSession: () => ({ me: { user, capabilities: { emailVerification: true } }, refresh: async () => {}, signIn: async () => {}, language }) },
    '../entra-auth': { entraConfigured: false }, '../phone/client': { phoneApi: { capabilities: async () => ({ available: false, enabled: false }) } },
    '../phone/flow': { codeInput, gateOf }, '../phone/notice': { takeAuthNotice: () => null },
    '../ui': { ...ui, fill, haptic: { success() {}, error() {} }, palette: {}, tones: {}, useCopy: () => ({ c, err: error => String(error) }) },
  };
  const load = file => {
    const source = ts.transpileModule(readFileSync(new URL(`../src/app/${file}.tsx`, import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
    const context = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; } };
    runInNewContext(source, context);
    return context.exports.default;
  };
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found; }
  };
  const field = tree => find(tree, node => node.type === 'Field' && node.props.label === c.emailCodeLabel)?.props;
  const button = (tree, title) => find(tree, node => node.type === 'Button' && node.props.title === title)?.props;
  const inputs = [['٠١٢٣٤٥', '012345'], ['۰۱۲۳۴۵', '012345'], ['123456', '123456'], ['1٢۳٤۵6', '123456']];
  const exercise = render => {
    for (const [input, expected] of inputs) {
      field(render()).onChangeText(input);
      assert.equal(field(render()).value, expected, input);
    }
  };
  const Auth = load('auth');
  const renderAuth = () => { cursor = 0; const tree = Auth(); first = false; return tree; };
  renderAuth(); await Promise.resolve();
  find(renderAuth(), node => node.type === 'Press' && node.props.accessibilityLabel === c.forgotPasswordEmail).props.onPress();
  find(renderAuth(), node => node.type === 'Field' && node.props.label === c.identifier).props.onChangeText('test@example.com');
  await button(renderAuth(), c.resetSend).onPress();
  exercise(renderAuth);
  find(renderAuth(), node => node.type === 'Field' && node.props.label === c.newPassword).props.onChangeText('Synthetic-password-123');
  await button(renderAuth(), c.resetSave).onPress();
  assert.equal(calls.find(call => call.path === '/auth/reset').body.code, '123456');

  linkMode = true;
  for (language of ['en', 'ar']) {
    c = copy[language]; slots = []; cursor = 0; first = true; calls.length = 0;
    renderAuth(); await Promise.resolve();
    find(renderAuth(), node => node.type === 'Press' && node.props.accessibilityLabel === c.forgotPasswordEmail).props.onPress();
    find(renderAuth(), node => node.type === 'Field' && node.props.label === c.identifier).props.onChangeText('test@example.com');
    assert.equal(field(renderAuth()), undefined, 'link mode never asks for a code');
    await button(renderAuth(), c.resetSend).onPress();
    const request = calls.find(call => call.path === '/auth/reset/code');
    assert.equal(request.body.identifier, 'test@example.com');
    assert.equal(request.body.lang, language);
    assert.ok(find(renderAuth(), node => node.type === 'Txt' && node.props.children === c.resetLinkSent));
    assert.ok(!calls.some(call => call.path === '/auth/reset'));
  }
  c = copy.en;

  slots = []; cursor = 0;
  const Profile = load('profile');
  const emailCard = find(Profile(), node => typeof node.type === 'function' && node.type.name === 'EmailCard').type;
  slots = [];
  const renderEmail = () => { cursor = 0; return emailCard(); };
  exercise(renderEmail);
  await button(renderEmail(), c.emailConfirm).onPress();
  assert.equal(calls.find(call => call.path === '/me/email/verify').body.code, '123456');
}

// Gates: the module can be absent (SQLite), switched off (no provider), or ready; a failed check is never "closed".
assert.equal(gateOf(null, false), 'checking');
assert.equal(gateOf(null, true), 'failed');
assert.equal(gateOf({ available: false, enabled: false }, false), 'unavailable');
assert.equal(gateOf({ available: true, enabled: false }, false), 'disabled');
assert.equal(gateOf({ available: true, enabled: true }, false), 'ready');
assert.equal(gateReasonKey('disabled'), 'phone_reason_disabled');
for (const gate of ['checking', 'failed', 'unavailable', 'disabled']) assert.ok(copy.ar[gateReasonKey(gate)] && copy.en[gateReasonKey(gate)], gate);

// Provider outcomes: an accepted answer is never shown as delivery; every state has its own sentence in both languages.
const states = ['prepared', 'requested', 'accepted', 'failed', 'unknown', 'obsolete', 'suppressed'];
for (const state of states) {
  const key = deliveryKey(state);
  assert.ok(copy.ar[key] && copy.en[key], state);
  assert.doesNotMatch(copy.en[key], /delivered/i, state);
}
assert.equal(deliveryKey('accepted'), 'phone_state_accepted');
assert.equal(deliveryKey('requested'), 'phone_state_recorded');
assert.ok(awaitingProvider('prepared') && awaitingProvider('requested') && !awaitingProvider('accepted'));
assert.match(copy.en.phone_state_accepted, /does not confirm it reached your phone/);
assert.doesNotMatch(copy.en.phone_state_accepted, /delivered/i);

// A code is usable only as the server allows: not expired, under five attempts, and not failed, obsolete or suppressed.
const now = 1_000_000;
const challenge = { deliveryState: 'accepted', expiresAt: now + 60_000, attempts: 0 };
assert.ok(codeUsable(challenge, now));
assert.ok(codeUsable({ ...challenge, deliveryState: 'unknown' }, now));
assert.ok(!codeUsable(challenge, now + 60_000));
assert.ok(!codeUsable({ ...challenge, attempts: 5 }, now));
for (const deliveryState of ['failed', 'obsolete', 'suppressed']) assert.ok(!codeUsable({ ...challenge, deliveryState }, now), deliveryState);

// Errors: only transport-level failures leave the outcome unknown; any answer with an error code is final.
for (const code of ['network', 'aborted', 'server_error', 'session_changed']) assert.equal(outcomeOf(code), 'unknown', code);
for (const code of ['phone_proof_invalid', 'phone_resend_cooldown', 'idempotency_conflict', 'unauthorized']) assert.equal(outcomeOf(code), 'definitive', code);
assert.equal(clock(300), '5:00');
assert.equal(clock(45), '0:45');
assert.equal(clock(-3), '0:00');
assert.equal(clock(3605), '60:05');
assert.equal(secondsUntil(now + 1500, now), 2);
assert.equal(secondsUntil(now - 5, now), 0);

// Server's own view picks the newest challenge for the purpose and trusts its effective state (lease expiry becomes unknown).
const view = [
  { id: 'a', purpose: 'change', delivery_state: 'requested', effectiveDeliveryState: 'unknown', expires_at: 5, attempts: 1, resend_at: 9 },
  { id: 'b', purpose: 'verify', delivery_state: 'accepted', effectiveDeliveryState: 'accepted', expires_at: 7, attempts: 0, resend_at: null },
];
assert.deepEqual(latestChallenge(view, ['verify']), { id: 'b', purpose: 'verify', deliveryState: 'accepted', expiresAt: 7, attempts: 0, resendAt: 0 });
assert.equal(latestChallenge(view, ['recovery']), null);
assert.equal(latestChallenge(view, ['change']).deliveryState, 'unknown');
assert.equal(issueKey({ kind: 'self', phone: '+970599123456', purpose: 'change', revision: 3 }), 'issue|self|+970599123456|change|3');

// Command IDs: a lost acknowledgment keeps its ID; an answered attempt does not.
{
  const memory = memorySlot();
  const slot = commandSlot(memory, newId);
  const key = 'issue|self|x|verify|1';
  const first = await slot.begin(key);
  assert.equal(await slot.begin(key), first, 'same payload after an unknown outcome keeps the ID');
  await slot.settle('network');
  assert.equal(await slot.begin(key), first, 'network failure is unresolved: retry replays the same ID');
  await slot.settle('phone_proof_invalid');
  assert.notEqual(await slot.begin(key), first, 'an answered error is final: the next attempt is a new command');
  const answered = await slot.begin(key);
  await slot.settle('ok');
  assert.notEqual(await slot.begin(key), answered, 'success ends the attempt: a resend is a new challenge');
  const changed = await slot.begin('issue|self|x|verify|2');
  assert.notEqual(changed, answered, 'a different payload never reuses an ID');
  await slot.settle('network');
  assert.notEqual(await slot.begin('issue|self|x|verify|3'), changed, 'a changed code or revision gets a new ID');
}

// Stored slot: bound to one session scope, and only the non-secret key and ID are written.
{
  const values = new Map();
  const store = { get: async k => values.get(k) ?? null, set: async (k, v) => { if (v === null) values.delete(k); else values.set(k, v); } };
  const sha256 = async v => `sha256:${createHash('sha256').update(v).digest('hex')}`;
  const scopeA = await sessionScope('token-one-synthetic', sha256);
  const scopeB = await sessionScope('token-two-synthetic', sha256);
  assert.equal(await sessionScope(null, sha256), 'none');
  assert.ok(!scopeA.includes('token-one-synthetic'), 'the bearer token is not stored in the scope');
  const slotA = commandSlot(storedSlot(store, 'wp06.phone.issue.self', scopeA), newId);
  const id = await slotA.begin('issue|self|+970599123456|change|4');
  const raw = values.get('wp06.phone.issue.self');
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ['commandId', 'key', 'scope']);
  assert.notEqual(await commandSlot(storedSlot(store, 'wp06.phone.issue.self', scopeB), newId).begin('issue|self|+970599123456|change|4'), id,
    'another sign-in does not replay an earlier session request');
  values.set('wp06.phone.issue.self', '{broken');
  assert.equal(await storedSlot(store, 'wp06.phone.issue.self', scopeA).read(), null);
  // Device scope: stable across restarts, validated, never a guessable seed.
  const deviceValues = new Map([['wp06.phone.device', 'not-a-uuid']]);
  const device = { get: async k => deviceValues.get(k) ?? null, set: async (k, v) => { deviceValues.set(k, v); } };
  const fresh = await stableDeviceId(device, newId);
  assert.match(fresh, UUID_V4);
  assert.equal(await stableDeviceId(device, () => 'should-not-be-used'), fresh, 'the saved device survives a restart');
}

// Failing storage: a receipt that cannot be saved is never sent. The error names storage, not the server; a retry after the
// store recovers sends; a lost reply still replays its ID without a second write.
{
  const values = new Map();
  let unreadable = true, unwritable = true;
  const store = {
    get: async k => { if (unreadable) throw new Error('SecurityError'); return values.get(k) ?? null; },
    // Web storage.set: a failed write is swallowed unless the caller asks for it to be required.
    set: async (k, v, required = false) => {
      try {
        if (unwritable) throw new Error('QuotaExceededError');
        if (v === null) values.delete(k); else values.set(k, v);
      } catch (e) { if (required) throw e; }
    },
  };
  const slot = commandSlot(storedSlot(store, 'wp06.phone.issue.self', 'none'), newId);
  const key = 'issue|self|+970599123456|verify|5';
  const sent = [];
  let lose = true;
  const send = async commandId => {
    sent.push(commandId);
    if (lose) { lose = false; throw new ApiError('network'); }
    return { ok: true };
  };
  // The order the screens use: persist the ID, send, then settle the attempt by its outcome.
  const attempt = async () => {
    let commandId = '';
    try {
      commandId = await slot.begin(key);
      await send(commandId);
      await slot.settle('ok');
    } catch (failure) {
      if (commandId) await slot.settle(errorCode(failure));
      throw failure;
    }
  };
  unreadable = false;
  await assert.rejects(attempt(), e => errorCode(e) === 'storage_unavailable', 'a failed save is named as storage');
  assert.equal(sent.length, 0, 'nothing is sent when the receipt cannot be saved');
  assert.equal(values.size, 0, 'and nothing is left half-saved');
  unreadable = true;
  unwritable = false;
  await assert.rejects(attempt(), e => errorCode(e) === 'storage_unavailable', 'a failed read also stops before the request');
  assert.equal(sent.length, 0, 'an unreadable receipt is never replaced by a new ID');

  unreadable = false;
  unwritable = false;
  await assert.rejects(attempt(), e => errorCode(e) === 'network', 'the lost reply is unresolved');
  assert.equal(sent.length, 1);
  assert.ok(values.get('wp06.phone.issue.self'), 'the receipt is saved before the request');

  unwritable = true; // writes fail from here on; the held receipt is reused without a write
  await attempt(); // a failed clear after success is best-effort, the answer already came back
  assert.equal(sent[1], sent[0], 'the retry replays the same command ID');
  assert.equal(sent.length, 2);
  assert.ok(values.get('wp06.phone.issue.self'), 'the settled receipt is still stored: the clear failed');

  // The stale copy is never replayed in this session: the next attempt is a new command, not the answered one.
  unwritable = false;
  await attempt();
  assert.notEqual(sent[2], sent[0], 'a settled ID is not replayed after its clear failed');
  assert.equal(values.get('wp06.phone.issue.self'), undefined, 'the new attempt settled and cleared cleanly');

  // A device ID that cannot be saved is an error, not a silently unsaved ID.
  const unsaved = { get: async () => null, set: async () => { throw new Error('QuotaExceededError'); } };
  await assert.rejects(stableDeviceId(unsaved, newId), e => errorCode(e) === 'storage_unavailable');
}

// Concurrent first use: callers that start together share one saved device ID, so none of them keeps an ID that was overwritten.
{
  const values = new Map();
  const pause = () => new Promise(resolve => setTimeout(resolve, 5));
  const store = { get: async k => { await pause(); return values.get(k) ?? null; }, set: async (k, v) => { await pause(); values.set(k, v); } };
  const ids = await Promise.all([1, 2, 3, 4].map(() => stableDeviceId(store, newId)));
  assert.equal(new Set(ids).size, 1, 'concurrent callers receive one device ID');
  assert.equal(values.get('wp06.phone.device'), ids[0], 'the saved ID is the one they received');
  assert.equal(await stableDeviceId(store, newId), ids[0], 'a later caller reads the same ID');
}

// Web storage through the real adapter: a receipt that cannot be read or saved stops the request; best-effort calls stay best-effort.
{
  const data = new Map();
  let blockReads = false, blockWrites = false;
  const blockedError = name => { throw Object.assign(new Error(name), { name }); };
  const local = {
    getItem: k => blockReads ? blockedError('SecurityError') : data.get(k) ?? null,
    setItem: (k, v) => blockWrites ? blockedError('QuotaExceededError') : void data.set(k, v),
    removeItem: k => blockWrites ? blockedError('SecurityError') : void data.delete(k),
  };
  const store = () => local;
  const throwingAccess = () => blockedError('SecurityError'); // reading localStorage itself can throw in a blocked browser
  assert.equal(webGet(throwingAccess, 'k'), null, 'best-effort read of a blocked store is empty');
  assert.throws(() => webGet(throwingAccess, 'k', true), /SecurityError/);
  blockWrites = true;
  assert.doesNotThrow(() => webSet(store, 'k', 'v'), 'best-effort write is swallowed');
  assert.throws(() => webSet(store, 'k', 'v', true), /QuotaExceededError/, 'a required write is not swallowed');
  blockWrites = false;
  webSet(store, 'k', 'v', true);
  assert.equal(webGet(store, 'k', true), 'v');
  data.clear();

  const web = { get: (k, required) => webGet(store, k, required), set: (k, v, required) => webSet(store, k, v, required) };
  const key = 'issue|self|+970599123456|verify|6';
  const webSlot = () => commandSlot(storedSlot(web, 'wp06.phone.issue.self', 'none'), newId);
  blockWrites = true;
  await assert.rejects(webSlot().begin(key), e => errorCode(e) === 'storage_unavailable', 'an unsaved receipt names storage');
  blockWrites = false;
  assert.equal(data.size, 0, 'nothing is left half-saved');
  blockReads = true;
  await assert.rejects(webSlot().begin(key), e => errorCode(e) === 'storage_unavailable', 'an unreadable receipt is not replaced');
  blockReads = false;
  const saved = await webSlot().begin(key);
  assert.equal(await webSlot().begin(key), saved, 'a saved receipt is replayed after a reload');
}

// Request bodies: exactly the fields each route accepts; the server rejects any extra key.
const ids = { commandId: newId(), deviceId: newId(), challengeId: newId() };
assert.deepEqual(Object.keys(issueBody({ ...ids, phone: '0599123456', purpose: 'verify', expectedRevision: 2 })).sort(),
  ['commandId', 'countryContext', 'deviceId', 'expectedRevision', 'phone', 'purpose']);
assert.deepEqual(Object.keys(issueBody({ ...ids, phone: '0599123456', purpose: 'change', expectedRevision: 2, currentPassword: 'x' })).sort(),
  ['commandId', 'countryContext', 'currentPassword', 'deviceId', 'expectedRevision', 'phone', 'purpose']);
assert.deepEqual(Object.keys(recoveryIssueBody({ ...ids, phone: '0599123456' })).sort(), ['commandId', 'countryContext', 'deviceId', 'phone']);
assert.deepEqual(Object.keys(proveBody({ ...ids, purpose: 'verify', code: '123456' })).sort(), ['challengeId', 'code', 'commandId', 'deviceId', 'purpose']);
assert.deepEqual(recoveryProveBody({ ...ids, code: '123456', password: 'Synthetic-password-123' }).purpose, 'recovery');
assert.equal('currentPassword' in issueBody({ ...ids, phone: '0599123456', purpose: 'verify', expectedRevision: 2 }), false);

// End to end over the request layer: a lost acknowledgment resends the same command; a resend after success does not.
{
  const sent = [];
  let fail = true;
  const call = async (path, body) => {
    sent.push({ path, body });
    if (fail) { fail = false; throw Object.assign(new Error('network'), { status: undefined }); }
    return { challengeId: body.commandId, state: 'requested', expiresAt: 1, resendAfterSeconds: 45 };
  };
  const api = phoneRequests(call);
  const slot = commandSlot(memorySlot(), newId);
  const deviceId = newId();
  const key = 'issue|self|+970599123456|verify|1';
  const send = async () => {
    const commandId = await slot.begin(key);
    try { const r = await api.issueSelf(issueBody({ commandId, deviceId, phone: '0599123456', purpose: 'verify', expectedRevision: 1 })); await slot.settle('ok'); return r; }
    catch (e) { await slot.settle(e.message); throw e; }
  };
  await assert.rejects(send(), /network/);
  const second = await send();
  assert.equal(sent[0].body.commandId, sent[1].body.commandId, 'the lost request and its retry share one command ID');
  assert.equal(second.challengeId, sent[1].body.commandId);
  await send();
  assert.notEqual(sent[2].body.commandId, sent[1].body.commandId, 'a resend after an answered challenge is a new command');
  assert.deepEqual(sent.map(x => x.path), ['/me/phone/challenges', '/me/phone/challenges', '/me/phone/challenges']);
}

// Copy parity: every phone key exists in both languages, so typecheck and tests agree.
const phoneKeys = Object.keys(copy.ar).filter(k => k.startsWith('phone_') || k.startsWith('err_phone_') || k.startsWith('err_idempotency') || k.startsWith('err_invalid_command') || k.startsWith('err_invalid_purpose'));
assert.ok(phoneKeys.length > 60, 'phone copy present');
for (const key of phoneKeys) assert.ok(typeof copy.en[key] === 'string' && copy.en[key].length > 0, key);
for (const key of Object.keys(copy.en).filter(k => k.startsWith('phone_') || k.startsWith('err_phone_'))) assert.ok(copy.ar[key], key);
// A storage failure names storage in both languages, and never claims the server or the code was sent.
for (const lang of ['ar', 'en']) assert.ok(copy[lang].err_storage_unavailable, lang);
assert.match(copy.en.err_storage_unavailable, /nothing was sent/);

console.log('Phone UI rules passed');

// A system permission sheet pauses the app. Found on the phone: the first Accept after granting said location was off.
{
  const work = readFileSync(new URL('../src/driver-work.tsx', import.meta.url), 'utf8');
  const prepare = work.slice(work.indexOf('const prepareTracking'), work.indexOf('const requestBackgroundPermission'));
  assert.ok(prepare.indexOf('if (asked) await backFromSheet()') > prepare.indexOf('requestPermission()') && prepare.indexOf('if (asked) await backFromSheet()') < prepare.indexOf('if (!current() || !value?.granted)'), 'the revision is re-read after the sheet, before the answer is judged');
  assert.match(prepare, /const backFromSheet = async \(\) => \{[\s\S]*?revision = lifecycleRef\.current\.revision;[\s\S]*?\};/, 'and re-reading it moves the revision current() compares');
  assert.match(work, /if\(lifecycleRef\.current\.revision!==askedAt\)ticket=presenceStartGuard\.snapshot\(\)/, 'going online survives the same sheet');
}
