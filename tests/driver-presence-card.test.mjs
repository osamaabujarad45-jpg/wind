// WP07 driver presence card: copy parity, honest wording, and the no-auto-start and no-looping-motion rules.
// Source checks only: the component is TSX and this suite runs under Node's type stripping, which does not load it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { copy } from '../src/copy.ts';

const keys = Object.keys(copy.ar).filter(k => k.startsWith('presence_'));
assert.ok(keys.length > 30, 'presence copy present');
assert.deepEqual(Object.keys(copy.en).filter(k => k.startsWith('presence_')).sort(), keys.slice().sort(), 'AR and EN presence keys match');

const arabic = /[؀-ۿ]/;
for (const key of keys) {
  assert.ok(copy.ar[key].trim() && copy.en[key].trim(), `${key} is filled in both languages`);
  assert.deepEqual([...copy.ar[key].matchAll(/\{\w+\}/g)].map(m => m[0]).sort(), [...copy.en[key].matchAll(/\{\w+\}/g)].map(m => m[0]).sort(), `${key} placeholders match`);
  assert.ok(arabic.test(copy.ar[key]), `${key} Arabic text is Arabic`);
  assert.ok(!arabic.test(copy.en[key]), `${key} English text has no Arabic`);
}

// Never claim ready or live dispatch. Negated forms ("not active", "won't be shown as ready") are allowed.
for (const key of keys) {
  assert.ok(!/ready for (requests|jobs)|you(?:'re| are) ready|جاهز للطلبات/i.test(copy.en[key] + ' ' + copy.ar[key]), `${key} must not claim ready`);
}

// Consent: pre-assignment location and trip tracking are explained as separate things; the background line never promises delivery.
assert.match(copy.en.presence_consent_before_body, /latest location/);
assert.match(copy.en.presence_consent_before_body, /does not track any job/);
assert.match(copy.en.presence_consent_job_body, /Trip tracking is separate/);
assert.match(copy.en.presence_consent_background, /optional/);
assert.match(copy.en.presence_consent_background, /cannot guarantee/);
assert.match(copy.ar.presence_consent_background, /لا تضمن/);
assert.match(copy.en.presence_requests_off, /aren't active yet/);
assert.match(copy.ar.presence_requests_off, /غير مفعّلة بعد/);

// Deletion: latest fix only, stale after 30 s, deleted on successful offline, periodic cleanup can delay it. Never "immediate".
assert.match(copy.en.presence_consent_before_body, /latest location/);
assert.match(copy.en.presence_consent_before_body, /stale after 30 seconds/);
assert.match(copy.en.presence_consent_before_body, /when going offline succeeds/);
assert.match(copy.en.presence_consent_before_body, /every 15 seconds/);
assert.match(copy.en.presence_consent_before_body, /deletion can take longer/);
assert.doesNotMatch(copy.en.presence_consent_before_body, /as soon as|immediate|instant|older than 30/i);
assert.match(copy.ar.presence_consent_before_body, /آخر موقع فقط/);
assert.match(copy.ar.presence_consent_before_body, /قديماً بعد 30 ثانية/);
assert.match(copy.ar.presence_consent_before_body, /نجاح طلب إيقاف الاتصال/);
assert.match(copy.ar.presence_consent_before_body, /كل 15 ثانية/);
assert.match(copy.ar.presence_consent_before_body, /قد يتأخر الحذف/);
assert.doesNotMatch(copy.ar.presence_consent_before_body, /فور|ونحذف ما هو أقدم/);

// Foreground: presence stops when the app leaves the foreground; the driver goes online again. Background prompt may need another tap.
assert.match(copy.en.presence_consent_foreground, /stops when Wind leaves the foreground/);
assert.match(copy.en.presence_consent_foreground, /go online again/);
assert.match(copy.ar.presence_consent_foreground, /ينتقل ويند إلى الخلفية/);
assert.match(copy.en.presence_consent_background, /asked only when you tap/);
assert.match(copy.en.presence_consent_background, /another tap/);
assert.match(copy.ar.presence_consent_background, /ضغطة أخرى/);

// Component rules: no effect may start going online, and no looping motion (reduced motion keeps state in text).
// An effect may only announce a state change for a screen reader: it must never start presence or tracking.
const source = readFileSync(new URL('../src/driver-presence-card.tsx', import.meta.url), 'utf8');
const effects = source => [...source.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[/g)].map(m => m[1]);
for (const body of effects(source)) {
  assert.match(body, /announceForAccessibility/, 'an effect only announces a state change');
  assert.doesNotMatch(body, /onConsentAndEnable|enablePresence|startPresence|startTracking|requestBackground/i, 'an effect never starts presence or tracking');
}
for (const banned of ['setInterval', 'Pulse', 'Radar', 'animationIterationCount', 'ActivityIndicator', 'c.online', 'presence_ready'])
  assert.ok(!source.includes(banned), `component must not use ${banned}`);
for (const line of source.split('\n').filter(l => l.includes('onConsentAndEnable()')))
  assert.ok(/onPress=/.test(line), `onConsentAndEnable fires only from a press: ${line.trim()}`);
assert.ok(/accessibilityLiveRegion="polite"/.test(source), 'state change is announced politely');
assert.ok(!/flexDirection/.test(source), 'rows use Row from ui.tsx so RTL follows useCopy');
// Presence error copy goes through useCopy.err (err_<code>): every server code the screen can show has a truthful AR/EN line.
const errorKeys = ['err_presence_device_in_use', 'err_presence_protocol_unavailable', 'err_presence_session_changed', 'err_presence_expired',
  'err_presence_eligibility_changed', 'err_presence_active_job'];
for (const key of errorKeys) {
  assert.ok(copy.ar[key] && copy.en[key], `${key} exists in both languages`);
  assert.ok(arabic.test(copy.ar[key]) && !arabic.test(copy.en[key]), `${key} language split`);
  assert.ok(!/ready for (requests|jobs)|جاهز للطلبات/i.test(copy.en[key] + copy.ar[key]), `${key} must not claim ready`);
}
assert.ok(copy.en.err_presence_device_in_use.includes('wait about a minute'), 'lease is 60 s: the minute wait is what the server actually does');
assert.equal(copy.ar.online, undefined, 'the false "ready for jobs" strip copy is removed');
assert.equal(copy.en.online, undefined, 'the false "ready for jobs" strip copy is removed (EN)');

// Background location: optional, explained, never a promise of callbacks, and Android 11 says it opens Settings.
assert.match(copy.en.presence_bg_granted, /does not guarantee/);
assert.match(copy.ar.presence_bg_granted, /لا يضمن/);
assert.match(copy.en.presence_bg_android, /Android 11/);
assert.match(copy.en.presence_bg_body, /never asks for this on its own/);
assert.match(copy.en.presence_bg_not_on, /Job sharing works while Wind is open/);

// Driver screen wiring: the presence card replaces the false strip, starts only from its own presses, background is its own tap.
const screen = readFileSync(new URL('../src/app/driver/index.tsx', import.meta.url), 'utf8');
assert.ok(!/c\.online\b|c\.onlineNote|Pulse/.test(screen), 'the false ready strip and its pulse are gone');
assert.ok(/<DriverPresenceCard/.test(screen) && /requestsOn=\{work.presenceState === 'online' && matching.data\?\.eligibleForMatching === true\}/.test(screen),
  'requests require an online state and explicit server eligibility; unknown capability stays off');
for (const body of effects(screen)) {
  assert.match(body, /announceForAccessibility/, 'a driver screen effect only announces a state change');
  assert.doesNotMatch(body, /enablePresence|startPresence|startTracking|requestBackground/i, 'a driver screen effect never starts presence or tracking');
}
const enableLines = screen.split('\n').filter(line => line.includes('enablePresence()'));
assert.equal(enableLines.length, 1, 'enablePresence is called from one place');
assert.ok(/onConsentAndEnable=/.test(enableLines[0]), 'enablePresence only from the card consent/go-online callback');
assert.ok(/startDisabled=\{!work\.known/.test(screen), 'going online waits while job status is unknown');
const backgroundLines = screen.split('\n').filter(line => line.includes('requestBackgroundTracking'));
assert.equal(backgroundLines.length, 1, 'background permission is requested from one place');
assert.ok(/onRequest=/.test(backgroundLines[0]), 'background permission only from the optional action');
assert.ok(/<BackgroundLocationAction/.test(screen), 'optional background action is mounted');

// The card's component rules also cover the new background action.
assert.ok(/export function BackgroundLocationAction/.test(source), 'background action is exported from the card module');
assert.ok(/startDisabled/.test(source) && /startReason/.test(source), 'card accepts the parent hold and reason');
console.log('Driver presence card copy and rule checks passed');
