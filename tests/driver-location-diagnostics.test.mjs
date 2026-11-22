import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { deliverDriverFix } from '../src/location-delivery.ts';
import { driverLocationDiagnostics, sameDiagnostics } from '../src/driver-location-diagnostics.ts';
import { copy } from '../src/copy.ts';
import { themeModules } from './theme-mock.mjs';

const stamp = 1_800_000_000_000;
let receipt = null, response = { status: 200, accepted: true }, acknowledgedAt = stamp + 4_000;
const context = { id: 'delivery', token: 'private-token', actor: 2, orderId: 3 };
const io = { context: async () => context, token: async () => context.token, receipt: async () => receipt,
  post: async () => response, acknowledge: async value => { receipt = value; }, stop: async () => {}, now: () => acknowledgedAt };
const fix = { timestamp: stamp - 1_000, coords: { latitude: 32, longitude: 35 } };
await deliverDriverFix(fix, io, stamp);
const accepted = driverLocationDiagnostics(receipt, true, true, 'android');
assert.equal(accepted.lastAcceptedFixAt, stamp - 1_000);
assert.equal(accepted.lastServerAcknowledgementAt, stamp + 4_000, 'ACK uses response time, never request start');
assert.equal(accepted.registration, 'registered');
assert.equal(accepted.foregroundService, 'unknown', 'a registered Expo task is not an observed Android service');
assert.equal(accepted.nextRetry, 'fresh_fix', 'no retry timer or stale location replay is invented');

response = { status: 200, accepted: false }; acknowledgedAt += 20_000;
await deliverDriverFix({ ...fix, timestamp: stamp + 20_000 }, io, stamp + 20_000);
assert.equal(receipt.fixAt, fix.timestamp, 'ignored samples cannot replace the accepted measurement');
assert.equal(driverLocationDiagnostics(receipt, true, true, 'android').lastServerAcknowledgementAt, acknowledgedAt,
  'an ignored fix still received a server acknowledgement');
response = { status: 503 }; acknowledgedAt += 20_000;
await deliverDriverFix({ ...fix, timestamp: stamp + 40_000 }, io, stamp + 40_000);
assert.equal(driverLocationDiagnostics(receipt, true, true, 'android').lastServerAcknowledgementAt, stamp + 24_000,
  'failed uploads retain the last successful acknowledgement');
assert.equal(receipt.failed, true);
const old = driverLocationDiagnostics({ id: 'old', lastSentAt: stamp, fixAt: stamp }, true, true, 'android');
assert.equal(old.lastServerAcknowledgementAt, null, 'old receipts do not fabricate an acknowledgement timestamp');
assert.deepEqual(driverLocationDiagnostics(null, false, null, 'android'), {
  lastAcceptedFixAt: null, lastServerAcknowledgementAt: null, requested: false,
  registration: 'unknown', foregroundService: 'unknown', nextRetry: 'none',
});
assert.equal(driverLocationDiagnostics(null, true, false, 'android').nextRetry, 'unknown');
assert.equal(driverLocationDiagnostics(null, null, null, 'android').nextRetry, 'unknown', 'a pending status read cannot imply no retry');
assert.equal(driverLocationDiagnostics(null, true, null, 'android').nextRetry, 'unknown', 'an unreadable registration cannot promise a retry');
assert.equal(driverLocationDiagnostics(null, true, null, 'web').nextRetry, 'fresh_fix', 'web has no task to register');
assert.equal(driverLocationDiagnostics(null, true, null, 'web').registration, 'not_applicable');
// The poll keeps the previous object only when every field matches.
assert.equal(sameDiagnostics(undefined, accepted), false);
assert.equal(sameDiagnostics({ ...accepted }, accepted), true);
for (const key of Object.keys(accepted)) assert.equal(sameDiagnostics({ ...accepted, [key]: 'changed' }, accepted), false, key);
assert.equal(driverLocationDiagnostics(null, true, true, 'ios').foregroundService, 'not_applicable');
assert.deepEqual(Object.keys(accepted).sort(), ['foregroundService', 'lastAcceptedFixAt', 'lastServerAcknowledgementAt', 'nextRetry', 'registration', 'requested'].sort());
assert.ok(!JSON.stringify(accepted).includes('private-token'));
let language = 'en';
const jsx = (type, props) => ({ type, props });
const modules = { 'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': { Pressable: 'Pressable' }, './ui': { Card: 'Card', Row: 'Row', Txt: 'Txt', useCopy: () => ({ language, c: copy[language] }) },
  ...themeModules('./') };
const contextForCard = { exports: {}, require: name => { assert.ok(name in modules, `unexpected support side effect: ${name}`); return modules[name]; } };
runInNewContext(ts.transpileModule(readFileSync(new URL('../src/driver-support-card.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText, contextForCard);
for (language of ['ar', 'en']) {
  // The screen owns the open state (the card remounts on lifecycle ticks); the card renders it and reports taps.
  let open = false;
  const render = () => contextForCard.exports.DriverSupportCard({ diagnostics: accepted, open, onToggle: () => { open = !open; } });
  const closed = render();
  const [heading, hidden] = closed.props.children;
  const [title, toggle] = heading.props.children;
  assert.equal(title.props.header, true, 'the title stays a heading outside the button');
  assert.equal(toggle.type, 'Pressable');
  assert.equal(toggle.props.accessibilityState.expanded, false);
  assert.equal(hidden, false, 'collapsed by default: the job list is not pushed down by support facts');
  toggle.props.onPress();
  const card = render();
  assert.equal(card.type, 'Card');
  const [header, rows] = card.props.children;
  assert.equal(header.props.children[1].props.accessibilityState.expanded, true, 'a tap opens it');
  header.props.children[1].props.onPress();
  assert.equal(render().props.children[1], false, 'a second tap closes it');
  assert.equal(rows.length, 6, 'all six support facts remain visible in both languages');
  assert.ok(rows.every(row => row.props.numberOfLines === undefined), 'support facts are never clipped to one line');
  assert.match(rows[4].props.children.join(''), language === 'ar' ? /غير معروف/ : /Unknown/);
  assert.match(rows[5].props.children.join(''), language === 'ar' ? /لا يوجد موعد مضمون/ : /time is not guaranteed/);
}
console.log('Driver diagnostics: response-time ACK, ignored/failed fixes, unknown OS service, legacy receipt and metadata-only output passed');
