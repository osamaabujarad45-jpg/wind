// Bounded local API load test. Never accepts a remote target or a production database.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, tmpdir, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';

const root = resolve(import.meta.dirname, '..');
const hash = value => createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(r => setTimeout(r, ms));
const percentile = (values, quantile) => values.length ? Math.round([...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * quantile) - 1)] * 100) / 100 : null;

if (process.argv.includes('--serve')) {
  assert.ok(process.send, 'Load server must be started by the local harness');
  const { db, server, shutdown } = await import('../server/main.ts');
  const now = Date.now(), actors = [], usedPhones = new Set();
  function actor(role, number) {
    let phone;
    do { phone = `059${String(randomInt(10_000_000)).padStart(7, '0')}`; } while (usedPhones.has(phone));
    usedPhones.add(phone);
    const id = Number(db.prepare('INSERT INTO users(phone,name,password,role,status,vehicle,created_at,approved_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(phone, `Load ${role} ${number}`, '', role, 'active', role === 'driver' ? 'van' : null, now, role === 'driver' || role === 'admin' ? now : null).lastInsertRowid);
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(token_hash,user_id,created_at) VALUES(?,?,?)').run(hash(token), id, now);
    return { id, token, phone };
  }
  const orderInsert = db.prepare(`INSERT INTO orders(customer_id,driver_id,service,shared,pickup_city,dropoff_city,pickup_note,dropoff_note,contact,
    detail,option,loading_help,price,commission,status,handover_code,created_at,updated_at,completed_at,assigned_at)
    VALUES(?,?,'parcel',0,'ramallah','nablus','Load private pickup','Load private dropoff',?,'Load private contents','small',0,20,3,?,'1234',?,?,?,?)`);
  db.exec('BEGIN IMMEDIATE');
  for (let i = 0; i < 60; i++) {
    const customer = actor('customer', i), driver = actor('driver', i);
    const orderId = Number(orderInsert.run(customer.id, driver.id, customer.phone, 'assigned', now, now, null, now).lastInsertRowid);
    db.prepare('INSERT INTO driver_locations(driver_id,lat,lng,updated_at,accuracy,heading) VALUES(?,?,?,?,?,?)')
      .run(driver.id, 31.9038, 35.2034, now, 10, 90);
    actors.push({ customer, driver, orderId });
  }
  const admin = actor('admin', 0);
  for (let i = 0; i < 10_000; i++) {
    const a = actors[i % actors.length], at = now - (i + 1) * 60_000;
    orderInsert.run(a.customer.id, a.driver.id, a.customer.phone, 'completed', at, at, at, at);
  }
  // A full job board is materially more expensive than an empty one; include enough for three pages.
  for (let i = 0; i < 120; i++) {
    const a = actors[i % actors.length];
    orderInsert.run(a.customer.id, null, a.customer.phone, 'searching', now + i, now + i, null, null);
  }
  db.exec('COMMIT');
  const eventLoop = monitorEventLoopDelay({ resolution: 10 });
  eventLoop.enable();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  process.send({ type: 'ready', port: server.address().port, actors, admin, history: 10_000, queued: 120 });
  process.on('message', async message => {
    if (message === 'stop') {
      process.send({ type: 'runtime', memory: process.memoryUsage(), cpu: process.cpuUsage(),
        eventLoopMs: { p50: eventLoop.percentile(50) / 1e6, p95: eventLoop.percentile(95) / 1e6, p99: eventLoop.percentile(99) / 1e6, max: eventLoop.max / 1e6 } });
      eventLoop.disable();
      await shutdown();
      process.exit(0);
    }
  });
} else {
  const output = join(root, '.expo/load');
  mkdirSync(output, { recursive: true });
  const dbPath = join(mkdtempSync(join(tmpdir(), 'wind-local-load-')), 'load.db');
  const env = { ...process.env, NODE_ENV: 'test', DB_PATH: dbPath, WIND_LOCAL_TEST: '1', WIND_IDENTITY_MODE: 'self-service', WIND_ENABLED_SERVICES: 'parcel' };
  for (const key of ['WIND_TEST_ROLE', 'WIND_TEST_IDENTIFIER', 'WIND_TEST_PASSWORD', 'EAS_BUILD', 'WIND_RELEASE', 'OSRM_URL',
    'WIND_EMAIL_FROM', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_EMAIL_TOKEN', 'SOUQ_PARTNER_KEY', 'WEB_ROOT',
    'WIND_DATABASE_URL', 'WIND_POSTGRES_TEST_ONLY', 'WIND_POSTGRES_TEST_SCHEMA', 'DATABASE_URL']) delete env[key];
  const child = fork(import.meta.filename, ['--serve'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], execArgv: ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning'] });
  let serverOutput = '', runtime, ready;
  child.stdout.on('data', data => { serverOutput += data; });
  child.stderr.on('data', data => { serverOutput += data; });
  const startedAt = new Date().toISOString(), records = [], phases = [], checks = [], performanceGates = [];
  const expectedCommands = new Set(), duplicateIds = [];
  let serial = 0, unexpected = 0, lock;
  const request = async (path, { token, body, expected = 200, phase = 'correctness', operation = path } = {}) => {
    const started = performance.now();
    try {
      const response = await fetch(ready.base + '/api' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        ...(body && { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) });
      const data = await response.json();
      // `expected` may be a list: the location throttle answers 429, and that is the API working, not a failure.
      const wanted = Array.isArray(expected) ? expected : [expected];
      const record = { phase, operation, status: response.status, ms: performance.now() - started, expected: wanted.join('|'), ok: wanted.includes(response.status) };
      records.push(record);
      if (!record.ok) { unexpected++; throw new Error(`${operation}: HTTP ${response.status} ${data.error ?? ''}, expected ${wanted.join('|')}`); }
      return { data, response, ms: record.ms };
    } catch (error) {
      if (records.at(-1)?.phase !== phase || records.at(-1)?.operation !== operation || records.at(-1)?.ok !== false) {
        records.push({ phase, operation, status: 0, ms: performance.now() - started, expected, ok: false, error: error.name });
        unexpected++;
      }
      throw error;
    }
  };
  const summarize = list => ({ requests: list.length, errors: list.filter(r => !r.ok).length, timeouts: list.filter(r => r.error === 'TimeoutError').length,
    p50: percentile(list.map(r => r.ms), .5), p95: percentile(list.map(r => r.ms), .95), p99: percentile(list.map(r => r.ms), .99), max: percentile(list.map(r => r.ms), 1),
    statuses: list.reduce((all, r) => ({ ...all, [r.status]: (all[r.status] ?? 0) + 1 }), {}) });
  try {
    ready = await new Promise((resolveReady, reject) => {
      const timer = setTimeout(() => reject(new Error('Local load server startup timeout')), 20_000);
      child.on('message', message => {
        if (message.type === 'ready') { clearTimeout(timer); resolveReady(message); }
        if (message.type === 'runtime') runtime = message;
      });
      child.once('exit', code => { clearTimeout(timer); if (!ready) reject(new Error(`Local load server exited ${code}`)); });
    });
    ready.base = `http://127.0.0.1:${ready.port}`;
    const { actors, admin } = ready;
    await request('/ready');
    console.log(`Local-only API fixture ready: ${actors.length * 2 + 1} synthetic accounts, ${ready.history} historical orders, ${ready.queued} searching orders`);
    const jobsPage = await request('/jobs?page=1', { token: actors[0].driver.token, operation: 'populated-jobs-page' });
    assert.equal(jobsPage.data.jobs.length, 20);
    assert.ok(jobsPage.data.nextCursor);
    const jobsNext = await request(`/jobs?page=1&after=${encodeURIComponent(jobsPage.data.nextCursor)}`, { token: actors[0].driver.token, operation: 'populated-jobs-next-page' });
    assert.equal(jobsNext.data.jobs.length, 20);
    assert.ok(!jobsNext.data.jobs.some(job => jobsPage.data.jobs.some(first => first.id === job.id)));
    async function work(kind, phase) {
      const i = serial++, a = actors[i % actors.length];
      const n = i % (kind === 'read' ? 6 : 10);
      if (kind === 'mixed' && n === 0) {
        const requestId = randomUUID();
        expectedCommands.add(requestId);
        const body = { requestId, service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', pickupNote: 'Synthetic load pickup', dropoffNote: 'Synthetic load dropoff',
          contact: a.customer.phone, detail: 'Synthetic load box', option: 'small', loadingHelp: false, shared: false, quotedPrice: 20 };
        const both = await Promise.all([0, 1].map(() => request('/orders', { token: a.customer.token, body, phase, operation: 'book-idempotent' })));
        if (both[0].data.id !== both[1].data.id) duplicateIds.push(requestId);
        await request(`/orders/${both[0].data.id}/cancel`, { token: a.customer.token, body: {}, phase, operation: 'cancel-load-booking' });
      } else if (kind === 'mixed' && [1, 2].includes(n)) {
        // The API accepts at most 60 fixes a minute per driver: a 429 here is that throttle working.
        await request('/location', { token: a.driver.token, body: { latitude: 31.9038 + (i % 5) * .000001, longitude: 35.2034, heading: 90, accuracy: 10, age: 0 }, phase, operation: 'driver-location', expected: [200, 429] });
      } else {
        const paths = [
          ['/me', a.customer.token, 'customer-profile'], ['/orders', a.customer.token, 'customer-history'], ['/orders', a.driver.token, 'driver-history'],
          ['/jobs?page=1', a.driver.token, 'driver-jobs'], [`/orders/${a.orderId}/live?since=0`, a.customer.token, 'live-fix-immediate'], ['/admin/stats', admin.token, 'admin-dashboard'],
        ];
        const [path, token, operation] = paths[n % paths.length];
        await request(path, { token, phase, operation });
      }
    }
    const selectedPhase = process.argv.find(value => value.startsWith('--phase='))?.slice('--phase='.length);
    if (selectedPhase && !/^(read|mixed)-(1|10|30|60)$/.test(selectedPhase)) throw new Error('Unknown load phase');
    for (const concurrency of [1, 10, 30, 60]) for (const kind of ['read', 'mixed']) {
      if (selectedPhase && selectedPhase !== `${kind}-${concurrency}`) continue;
      const phase = `${kind}-${concurrency}`, phaseStart = performance.now(), until = phaseStart + 8_000;
      // Closed-loop workers plus pacing: at most 250 operations/s before multi-request booking overhead.
      const gap = Math.max(20, concurrency * 1000 / 250);
      await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
        await delay(worker * gap / concurrency);
        while (performance.now() < until) {
          const at = performance.now();
          await work(kind, phase);
          await delay(Math.max(0, gap - (performance.now() - at)));
        }
      }));
      const elapsedSeconds = (performance.now() - phaseStart) / 1000;
      const result = { phase, concurrency, kind, elapsedSeconds: Math.round(elapsedSeconds * 100) / 100,
        ...summarize(records.filter(r => r.phase === phase)) };
      result.requestsPerSecond = Math.round(result.requests / elapsedSeconds * 100) / 100;
      phases.push(result);
      console.log(JSON.stringify(result));
    }
    await Promise.all(actors.map((a, i) => request(`/orders/${a.orderId}`, { token: actors[(i + 1) % actors.length].customer.token, expected: 404, operation: 'foreign-order-denied' })));
    await Promise.all(actors.map(a => request(`/orders/${a.orderId}`, { expected: 401, operation: 'anonymous-order-denied' })));
    checks.push('60 concurrent foreign requests return 404; 60 anonymous requests return 401');
    // The throttle is part of the contract and the phases above deliberately outrun it. These checks measure the live
    // path, so the counters start clean (a throwaway local database).
    const throttle = new DatabaseSync(dbPath);
    throttle.exec("DELETE FROM request_limits WHERE key LIKE 'location:%' OR key LIKE 'order-live:%' OR key LIKE 'track-live:%'");
    const initial = await Promise.all(actors.map(a => request(`/orders/${a.orderId}`, { token: a.customer.token })));
    const waiting = actors.map((a, i) => request(`/orders/${a.orderId}/live?since=${initial[i].data.driverLocation.updatedAt}`, { token: a.customer.token, operation: 'held-live-fix' }));
    await delay(200);
    await Promise.all(actors.map(a => request('/location', { token: a.driver.token, body: { latitude: 31.9038, longitude: 35.2034, accuracy: 10, age: 0 }, operation: 'wake-live-fix' })));
    const received = await Promise.all(waiting);
    assert.ok(received.every((r, i) => r.data.driverLocation.updatedAt > initial[i].data.driverLocation.updatedAt));
    checks.push('60 held live requests receive newer accepted fixes after concurrent GPS updates');
    lock = new DatabaseSync(dbPath);
    lock.exec('BEGIN IMMEDIATE');
    const recovering = request('/location', { token: actors[0].driver.token, body: { latitude: 31.9038, longitude: 35.2034, age: 0 }, operation: 'writer-lock-150ms' });
    await delay(150); lock.exec('ROLLBACK');
    const recovered = await recovering;
    checks.push(`150ms external SQLite writer lock recovers with HTTP200 in ${Math.round(recovered.ms)}ms`);
    lock.exec('BEGIN IMMEDIATE');
    const heldWriter = request('/location', { token: actors[1].driver.token, body: { latitude: 31.9038, longitude: 35.2034, age: 0 }, expected: 503, operation: 'writer-lock-timeout' });
    await delay(100);
    const behindLock = request('/health', { operation: 'health-behind-writer-lock' });
    const [unavailable, health] = await Promise.all([heldWriter, behindLock]);
    assert.ok(Number(unavailable.response.headers.get('retry-after')) > 0);
    lock.exec('ROLLBACK');
    checks.push(`Long external writer lock returns retryable503 in ${Math.round(unavailable.ms)}ms; unrelated health request takes ${Math.round(health.ms)}ms`);
    assert.equal(lock.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(lock.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(lock.prepare('SELECT COUNT(*) n FROM order_commands').get().n, expectedCommands.size);
    assert.equal(duplicateIds.length, 0);
    assert.equal(lock.prepare("SELECT COUNT(*) n FROM orders WHERE status='searching'").get().n, ready.queued);
    checks.push(`Integrity OK, zero foreign-key errors, ${expectedCommands.size} idempotent bookings each stored once and cancelled`);
    console.log(checks.map(c => `PASS ${c}`).join('\n'));
    // These are the handoff's engineering targets, not a production SLA. Exclude deliberate held reads/lock faults.
    for (const phase of phases) performanceGates.push({ gate: `${phase.phase}: non-provider API p95 < 500ms`, actualMs: phase.p95, passed: phase.p95 < 500 });
    for (const phase of phases.filter(item => item.concurrency === 60)) {
      const jobs = records.filter(record => record.phase === phase.phase && record.operation === 'driver-jobs');
      if (jobs.length) {
        const p95 = percentile(jobs.map(record => record.ms), .95);
        performanceGates.push({ gate: `${phase.phase}: populated driver jobs p95 < 500ms`, actualMs: p95, passed: p95 < 500 });
      }
    }
    const commands = records.filter(record => ['book-idempotent', 'cancel-load-booking'].includes(record.operation));
    if (commands.length) {
      const p95 = percentile(commands.map(record => record.ms), .95);
      performanceGates.push({ gate: 'critical command acknowledgment p95 < 1000ms', actualMs: p95, passed: p95 < 1000 });
    }
    for (const gate of performanceGates) console.log(`${gate.passed ? 'PASS' : 'FAIL'} ${gate.gate}: ${gate.actualMs}ms`);
    assert.deepEqual(performanceGates.filter(gate => !gate.passed), [], 'Handoff performance targets were not met');
  } finally {
    try { lock?.exec('ROLLBACK'); } catch { /* no held transaction */ }
    lock?.close();
    if (child.connected) child.send('stop');
    if (child.exitCode === null) await once(child, 'exit');
    writeFileSync(join(output, 'server.log'), serverOutput);
    writeFileSync(join(output, 'results.json'), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(),
      environment: { node: process.version, os: `${platform()} ${release()}`, cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryGiB: Math.round(totalmem() / 1024 ** 3),
        target: 'ephemeral loopback child process; disposable SQLite WAL database', historicalOrders: ready?.history, searchingOrders: ready?.queued, syntheticAccounts: 121, pacingOperationsPerSecond: 250, phaseSeconds: 8 },
      phases, checks, performanceGates, unexpectedErrors: unexpected, correctness: summarize(records.filter(r => r.phase === 'correctness')), runtime }, null, 2));
    writeFileSync(join(output, 'requests.json'), JSON.stringify(records, null, 2));
  }
}
