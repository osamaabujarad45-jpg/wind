import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  COMPUTE_ROUTES_PATH, FIELD_MASK, GOOGLE_ROUTES_ORIGIN, GoogleRoutesError, SIGNIFICANT_MOVEMENT_METRES,
  coordinate, createGoogleRoutes, decodePolyline, latLngQuery, routesDisabled, shouldReroute,
} from '../server/domain/google-routing.ts';

// ---------- pure conversion and policy helpers ----------

assert.equal(GOOGLE_ROUTES_ORIGIN, 'https://routes.googleapis.com', 'the upstream origin is a module constant');
assert.equal(COMPUTE_ROUTES_PATH, '/directions/v2:computeRoutes');
assert.equal(FIELD_MASK, 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline', 'only the billed fields are requested');
assert.equal(SIGNIFICANT_MOVEMENT_METRES, 250);

// Google's documented polyline fixture: (38.5,-120.2), (40.7,-120.95), (43.252,-126.453).
const ENCODED = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
assert.deepEqual(decodePolyline(ENCODED), [[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]],
  'decoded points are [longitude, latitude], the order every line in the app uses');
for (const bad of ['', '_p~iF~ps|U', '_p~iF~ps|U_ulLnn', '!!!', null, 42, {}]) {
  assert.equal(decodePolyline(bad), null, `malformed polyline ${String(bad)} is rejected`);
}

assert.deepEqual(coordinate({ latitude: 31.9, longitude: 35.2 }), { latitude: 31.9, longitude: 35.2 });
assert.deepEqual(coordinate({ latitude: 0, longitude: 0 }), { latitude: 0, longitude: 0 });
for (const bad of [null, undefined, '31.9,35.2', [31.9, 35.2], { lat: 31.9, lng: 35.2 },
  { latitude: 91, longitude: 35.2 }, { latitude: 31.9, longitude: 181 }, { latitude: '31.9', longitude: 35.2 },
  { latitude: NaN, longitude: 35.2 }, { latitude: Infinity, longitude: 0 }]) {
  assert.equal(coordinate(bad), null, `malformed coordinate ${JSON.stringify(bad)} is rejected`);
}
assert.deepEqual(latLngQuery('31.9038,35.2034'), { latitude: 31.9038, longitude: 35.2034 });
for (const bad of [null, undefined, '', '31.9', '31.9,', ',35.2', 'x,35.2', '91,35.2', '31.9,181', '31.9,35.2,1', 'NaN,35.2']) {
  assert.equal(latLngQuery(bad), null, `malformed query point ${String(bad)} is rejected`);
}

assert.equal(shouldReroute(null), false);
assert.equal(shouldReroute({ kind: 'preview', shown: true }), true, 'an initial meaningful preview bills');
assert.equal(shouldReroute({ kind: 'preview', shown: false }), false);
assert.equal(shouldReroute({ kind: 'destination', changed: true }), true);
assert.equal(shouldReroute({ kind: 'destination', changed: false }), false);
assert.equal(shouldReroute({ kind: 'movement', foreground: true, metres: SIGNIFICANT_MOVEMENT_METRES }), true);
assert.equal(shouldReroute({ kind: 'movement', foreground: true, metres: SIGNIFICANT_MOVEMENT_METRES - 1 }), false);
assert.equal(shouldReroute({ kind: 'movement', foreground: false, metres: 5000 }), false);
assert.equal(shouldReroute({ kind: 'movement', foreground: true, metres: NaN }), false);
assert.equal(shouldReroute({ kind: 'retry', authorized: true, failed: 'maps_unavailable' }), true);
assert.equal(shouldReroute({ kind: 'retry', authorized: true, failed: 'maps_quota' }), true);
assert.equal(shouldReroute({ kind: 'retry', authorized: true, failed: 'too_many_attempts' }), false);
assert.equal(shouldReroute({ kind: 'retry', authorized: false, failed: 'maps_unavailable' }), false);
for (const kind of ['poll', 'background', 'anonymous']) assert.equal(shouldReroute({ kind }), false, `${kind} does not bill`);
assert.equal(shouldReroute({ kind: 'nonsense' }), false, 'unknown runtime triggers fail closed');
assert.equal(shouldReroute('poll'), false);

assert.equal(routesDisabled({}), false);
assert.equal(routesDisabled({ GOOGLE_MAPS_ENABLED: '1', MAP_PROVIDER: 'google' }), false);
assert.equal(routesDisabled({ GOOGLE_MAPS_ENABLED: '0' }), true);
assert.equal(routesDisabled({ MAP_PROVIDER: 'maplibre' }), true);

// ---------- fake Google upstream on an ephemeral loopback port ----------

const calls = [];
const ROUTE_PAYLOAD = { routes: [{ distanceMeters: 61234, duration: '3300s', polyline: { encodedPolyline: ENCODED } }] };
const send = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};
let respond = (req, res) => send(res, 200, ROUTE_PAYLOAD);
const upstream = createServer((req, res) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    calls.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
    respond(req, res);
  });
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${upstream.address().port}`;

const make = (overrides = {}) => createGoogleRoutes({ apiKey: 'server-key', upstreamOrigin: base, env: {}, ...overrides });
const point = { latitude: 31.9038, longitude: 35.2034 };
const dropoff = { latitude: 32.2211, longitude: 35.2544 };
const request = (overrides = {}) => ({
  userKey: 'user-hash-1', origin: point, destination: dropoff, trigger: { kind: 'preview', shown: true }, ...overrides,
});
const failure = (result, code) => {
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.error.code, code, JSON.stringify(result));
  assert.ok(result.error instanceof GoogleRoutesError);
  assert.equal(result.provider.provider, 'google-routes');
  assert.equal(result.provider.endpoint, COMPUTE_ROUTES_PATH);
  assert.equal(result.provider.fieldMask, FIELD_MASK);
  assert.equal(result.provider.trafficAware, false);
  return result.error;
};

try {
  // ---------- gates that must make no upstream call ----------

  const proxy = make();
  let spend = calls.length;
  failure(await proxy.route({ origin: point, destination: dropoff, trigger: { kind: 'preview', shown: true } }), 'unauthorized');
  failure(await proxy.route(request({ userKey: '' })), 'unauthorized');
  assert.equal(calls.length, spend, 'an unauthorized request costs nothing');

  const anonymous = await proxy.route(request({ trigger: { kind: 'anonymous' } }));
  failure(anonymous, 'not_billable');
  assert.equal(anonymous.provider.upstream, false);
  assert.equal(calls.length, spend, 'an anonymous refresh costs nothing');

  for (const trigger of [{ kind: 'poll' }, { kind: 'background' }, { kind: 'movement', foreground: true, metres: 120 },
    { kind: 'movement', foreground: false, metres: 5000 }, { kind: 'destination', changed: false }, { kind: 'preview', shown: false },
    { kind: 'retry', authorized: false, failed: 'maps_unavailable' }]) {
    failure(await proxy.route(request({ trigger })), 'not_billable');
  }
  assert.equal(calls.length, spend, 'polls, timers, wobble and unauthorized retries never reach Google');

  for (const origin of [{ latitude: 31.9 }, { latitude: 91, longitude: 35.2 }, { latitude: '31.9', longitude: 35.2 }, point]) {
    const destination = origin === point ? point : dropoff;
    failure(await proxy.route(request({ origin, destination })), 'invalid_input');
  }
  assert.equal(calls.length, spend, 'malformed or identical points cost nothing');

  const disabled = make({ env: { GOOGLE_MAPS_ENABLED: '0' } });
  failure(await disabled.route(request()), 'maps_disabled');
  const maplibre = make({ env: { MAP_PROVIDER: 'maplibre' } });
  failure(await maplibre.route(request()), 'maps_disabled');
  const liveEnv = {};
  const switchable = make({ env: liveEnv });
  liveEnv.MAP_PROVIDER = 'maplibre';
  failure(await switchable.route(request()), 'maps_disabled');
  assert.equal(calls.length, spend, 'the kill switch is checked before any upstream call');
  liveEnv.MAP_PROVIDER = 'google';

  const keyless = createGoogleRoutes({ upstreamOrigin: base, env: {} });
  const keylessError = failure(await keyless.route(request()), 'maps_unavailable');
  assert.equal(keylessError.retryable, false);
  assert.equal(calls.length, spend, 'a missing server key costs nothing');

  // ---------- one successful call: fixed origin, documented body, provider metadata ----------

  spend = calls.length;
  const success = await proxy.route(request());
  assert.equal(success.ok, true, JSON.stringify(success));
  assert.deepEqual(success.route, {
    metres: 61234,
    seconds: 3300,
    line: [[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]],
  });
  assert.deepEqual(success.provider, {
    provider: 'google-routes', endpoint: COMPUTE_ROUTES_PATH, fieldMask: FIELD_MASK, trafficAware: false, upstream: true,
  });
  assert.equal(calls.length, spend + 1);
  const sent = calls[calls.length - 1];
  assert.equal(sent.method, 'POST');
  assert.equal(sent.url, COMPUTE_ROUTES_PATH, 'the upstream path is fixed by the module');
  assert.equal(sent.headers['x-goog-api-key'], 'server-key');
  assert.equal(sent.headers['x-goog-fieldmask'], FIELD_MASK);
  assert.equal(sent.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(sent.body), {
    origin: { location: { latLng: { latitude: 31.9038, longitude: 35.2034 } } },
    destination: { location: { latLng: { latitude: 32.2211, longitude: 35.2544 } } },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_UNAWARE',
    polylineQuality: 'HIGH_QUALITY',
    computeAlternativeRoutes: false,
    languageCode: 'ar',
    units: 'METRIC',
  });
  assert.equal(JSON.stringify(success).includes('server-key'), false, 'the server key never appears in a result');

  // No OSRM roadCache policy: the same request bills again, and a near-identical one bills too.
  await proxy.route(request());
  await proxy.route(request({ origin: { latitude: 31.9039, longitude: 35.2034 } }));
  assert.equal(calls.length, spend + 3, 'Google routes are never cached');

  // ---------- request input cannot redirect or re-key the call ----------

  spend = calls.length;
  const hostile = await proxy.route(request({
    baseUrl: 'http://127.0.0.1:1', upstreamOrigin: 'http://127.0.0.1:1', url: 'http://127.0.0.1:1/evil',
    apiKey: 'attacker-key', key: 'attacker-key', fieldMask: '*', headers: { 'X-Goog-Api-Key': 'attacker-key' },
  }));
  assert.equal(hostile.ok, true, JSON.stringify(hostile));
  assert.equal(calls.length, spend + 1);
  assert.equal(calls[calls.length - 1].headers['x-goog-api-key'], 'server-key');
  assert.equal(calls[calls.length - 1].headers['x-goog-fieldmask'], FIELD_MASK, 'the field mask is not client input');
  assert.equal(JSON.stringify(hostile).includes('attacker-key'), false);

  // ---------- upstream failures are typed, redacted and carry provider metadata ----------

  const failing = make();
  for (const [status, code, retryable] of [[400, 'invalid_input', false], [403, 'maps_unavailable', false],
    [404, 'no_route', false], [429, 'maps_quota', true], [500, 'maps_unavailable', true], [503, 'maps_unavailable', true]]) {
    respond = (req, res) => send(res, status, { error: { code: status, message: 'SECRET-UPSTREAM-BODY' } });
    const result = await failing.route(request());
    const error = failure(result, code);
    assert.equal(error.upstreamStatus, status);
    assert.equal(error.retryable, retryable, `${status} retryable=${retryable}`);
    assert.equal(result.provider.upstream, true);
    assert.equal(String(error.message).includes('SECRET-UPSTREAM-BODY'), false, 'upstream messages are never copied');
    assert.equal(JSON.stringify(result).includes('SECRET-UPSTREAM-BODY'), false);
    assert.equal(JSON.stringify(result).includes('server-key'), false);
  }

  respond = (req, res) => send(res, 200, { routes: [] });
  failure(await failing.route(request()), 'no_route');
  for (const payload of [
    { routes: [{ distanceMeters: 100, duration: '10s', polyline: { encodedPolyline: 'x' } }] },
    { routes: [{ distanceMeters: 100, duration: '10s', polyline: { encodedPolyline: '_p~iF~ps|U' } }] },
    { routes: [{ distanceMeters: '100', duration: '10s', polyline: { encodedPolyline: ENCODED } }] },
    { routes: [{ distanceMeters: 100, duration: '10', polyline: { encodedPolyline: ENCODED } }] },
    {},
  ]) {
    respond = (req, res) => send(res, 200, payload);
    failure(await failing.route(request()), 'maps_unavailable');
  }
  respond = (req, res) => { res.statusCode = 200; res.end('not json'); };
  const malformed = failure(await failing.route(request()), 'maps_unavailable');
  assert.equal(malformed.retryable, false, 'a provider contract break is not retried blind');

  respond = () => {};
  const slow = make({ timeoutMs: 120 });
  const started = Date.now();
  const timedOut = failure(await slow.route(request()), 'maps_unavailable');
  assert.equal(timedOut.retryable, true);
  assert.ok(Date.now() - started < 2000, 'the timeout aborts the call');
  respond = (req, res) => send(res, 200, ROUTE_PAYLOAD);

  // ---------- budgets: per user, global, window reset, bounded concurrency ----------

  spend = calls.length;
  const perUser = make({ perUser: { max: 2, windowMs: 60_000 }, global: { max: 100, windowMs: 60_000 } });
  const userResults = [];
  for (let i = 0; i < 5; i++) userResults.push(await perUser.route(request()));
  assert.equal(userResults.filter(result => result.ok).length, 2, JSON.stringify(userResults.map(result => result.ok ? 'ok' : `${result.error.code}/${result.provider.upstream}`)));
  assert.equal(calls.length - spend, 2, 'the per-user cap stops further upstream calls');
  for (const result of userResults.slice(2)) {
    const error = failure(result, 'too_many_attempts');
    assert.equal(error.retryable, false, 'an exhausted budget is not retried in a loop');
    assert.equal(result.provider.upstream, false);
  }

  let clock = 1_000_000;
  const windowed = make({ now: () => clock, perUser: { max: 1, windowMs: 10_000 }, global: { max: 99, windowMs: 10_000 } });
  spend = calls.length;
  assert.equal((await windowed.route(request())).ok, true);
  failure(await windowed.route(request()), 'too_many_attempts');
  clock += 10_000;
  assert.equal((await windowed.route(request())).ok, true, 'the fixed window resets');
  assert.equal(calls.length - spend, 2);

  spend = calls.length;
  const shared = make({ perUser: { max: 10, windowMs: 60_000 }, global: { max: 3, windowMs: 60_000 } });
  const globalResults = [];
  for (let i = 0; i < 5; i++) globalResults.push(await shared.route(request({ userKey: `user-${i}` })));
  assert.equal(globalResults.filter(result => result.ok).length, 3);
  assert.equal(calls.length - spend, 3, 'the global cap bounds every user together');
  for (const result of globalResults.slice(3)) failure(result, 'too_many_attempts');

  spend = calls.length;
  respond = (req, res) => { setTimeout(() => send(res, 200, ROUTE_PAYLOAD), 100); };
  const concurrent = make({ maxInFlight: 2 });
  const parallel = await Promise.all(Array.from({ length: 6 }, (unused, i) =>
    concurrent.route(request({ userKey: `parallel-${i}`, trigger: { kind: 'movement', foreground: true, metres: 400 } }))));
  assert.equal(parallel.filter(result => result.ok).length, 2);
  assert.equal(calls.length - spend, 2, 'concurrency is bounded, not queued');
  for (const result of parallel.filter(entry => !entry.ok)) {
    failure(result, 'too_many_attempts');
    assert.equal(result.provider.upstream, false);
  }
  respond = (req, res) => send(res, 200, ROUTE_PAYLOAD);

  // ---------- outage and many-user/movement sequence ----------

  spend = calls.length;
  const scenario = make({ perUser: { max: 50, windowMs: 60_000 }, global: { max: 5, windowMs: 60_000 } });
  for (let i = 0; i < 6; i++) {
    failure(await scenario.route(request({ trigger: { kind: 'poll' } })), 'not_billable');
    failure(await scenario.route(request({ trigger: { kind: 'background' } })), 'not_billable');
    failure(await scenario.route(request({ trigger: { kind: 'movement', foreground: true, metres: 240 } })), 'not_billable');
    failure(await scenario.route(request({ userKey: '', trigger: { kind: 'anonymous' } })), 'unauthorized');
  }
  assert.equal(calls.length, spend, 'a stationary/background/anonymous sequence makes zero upstream calls');

  respond = (req, res) => send(res, 503, { error: { message: 'SECRET-UPSTREAM-BODY' } });
  const outage = await scenario.route(request({ trigger: { kind: 'movement', foreground: true, metres: 400 } }));
  const outageError = failure(outage, 'maps_unavailable');
  assert.equal(outageError.retryable, true);
  failure(await scenario.route(request({ trigger: { kind: 'retry', authorized: false, failed: 'maps_unavailable' } })), 'not_billable');
  failure(await scenario.route(request({ trigger: { kind: 'retry', authorized: true, failed: 'too_many_attempts' } })), 'not_billable');
  assert.equal(calls.length - spend, 1, 'an outage does not retry itself');

  respond = (req, res) => send(res, 200, ROUTE_PAYLOAD);
  assert.equal((await scenario.route(request({ trigger: { kind: 'retry', authorized: true, failed: 'maps_unavailable' } }))).ok, true);
  assert.equal(calls.length - spend, 2, 'one authorized retry after recovery');

  const beforeCap = calls.length;
  let billed = 0;
  let capped = 0;
  for (let i = 0; i < 12; i++) {
    const result = await scenario.route(request({ userKey: `fleet-${i}`, trigger: { kind: 'movement', foreground: true, metres: 300 } }));
    if (result.ok) billed++;
    else {
      capped++;
      failure(result, 'too_many_attempts');
      assert.equal(result.provider.upstream, false);
    }
  }
  assert.equal(billed, 3, 'the remaining global budget is spent once');
  assert.equal(capped, 9);
  assert.equal(calls.length - beforeCap, 3, 'an exhausted budget makes no upstream calls at all');
  assert.ok(calls.length - spend <= 5, `total upstream calls stay within the global budget (${calls.length - spend})`);

  console.log('google routing tests passed: validation, fixed origin, typed redacted errors, budgets and no-retry degradation');
} finally {
  upstream.closeAllConnections();
  await new Promise(resolve => upstream.close(resolve));
}
