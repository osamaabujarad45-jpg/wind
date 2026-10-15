import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// New native entry points and local dependencies must survive both Railway upload and Docker's build context.
{
  const root = new URL('../', import.meta.url), read = rel => readFileSync(new URL(rel, root), 'utf8');
  const pkg = JSON.parse(read('package.json')), docker = read('Dockerfile');
  const build = docker.split(/^FROM /m)[1];
  for (const file of [pkg.main, ...Object.values(pkg.dependencies).filter(value => value.startsWith('file:')).map(value => value.slice(5).replace(/^\.\//, ''))]) {
    const isDirectory = !file.includes('.js');
    for (const ignore of ['.dockerignore', '.railwayignore']) {
      const rules = read(ignore).split(/\r?\n/);
      const parent = file.split('/')[0];
      assert.ok(rules.includes(`!${file}${isDirectory ? '/' : ''}`) || (isDirectory && rules.includes(`!${parent}/`) && rules.includes(`!${parent}/**`)), `${ignore} must upload ${file}`);
    }
    if (isDirectory) {
      const parent = file.split('/')[0];
      for (const ignore of ['.dockerignore', '.railwayignore']) assert.ok(read(ignore).includes(`!${parent}/**`), `${ignore} must include local dependency files`);
      const copiedAt = build.indexOf(`COPY ${parent} ./${parent}`);
      assert.ok(copiedAt >= 0 && copiedAt < build.indexOf('RUN npm ci'), 'Local dependencies must be copied before the frozen install');
    } else assert.ok(build.split(/\r?\n/).some(line => line.startsWith('COPY ') && line.split(/\s+/).includes(file)), `Docker build must copy ${file}`);
  }
}

// The runtime image copies src files one by one: every module the server reaches must be listed (5 Oct 2026: a deploy
// failed its health check because server/main.ts started importing src/map-math.ts).
{
  const root = new URL('../', import.meta.url), read = rel => readFileSync(new URL(rel, root), 'utf8');
  const runtime = read('Dockerfile').split(/^FROM /m).at(-1);
  const needed = new Set(), queue = readdirSync(new URL('server/', root)).filter(f => f.endsWith('.ts')).map(f => `server/${f}`);
  while (queue.length) {
    const file = queue.pop(), base = file.slice(0, file.lastIndexOf('/') + 1);
    for (const [, spec] of read(file).matchAll(/from '(\.{1,2}\/[^']+\.ts)'/g)) {
      const target = new URL(spec, new URL(base, root)).pathname.slice(new URL(root).pathname.length);
      if (target.startsWith('src/') && !needed.has(target)) { needed.add(target); queue.push(target); }
    }
  }
  assert.ok(needed.has('src/model.ts'));
  for (const file of needed) assert.ok(runtime.includes(`COPY ${file} ./${file}`) || /^COPY src \.\/src$/m.test(runtime), `Dockerfile runtime stage must copy ${file}`);
}

const dir = mkdtempSync(join(tmpdir(), 'wind-deploy-'));
const path = join(dir, 'test.db'), web = join(dir, 'web'), main = fileURLToPath(new URL('../server/main.ts', import.meta.url));
mkdirSync(web);
writeFileSync(join(web, 'index.html'), '<!doctype html><title>Wind web</title><div id="root"></div>');
writeFileSync(join(web, 'manifest.webmanifest'), '{"name":"Wind"}');
const moduleUrl = new URL('../server/main.ts', import.meta.url).href;
const env = { ...process.env, NODE_ENV: 'production', DB_PATH: path, SUPPORT_CONTACT: 'Synthetic support +970599001234',
  WIND_IDENTITY_MODE: 'operator-verified', HOST: '127.0.0.1', PORT: '0', WEB_ROOT: web };
const flags = ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning'];
const cli = (args, extra = {}, input) => spawnSync(process.execPath, [...flags, main, ...args], { env: { ...env, ...extra }, input, encoding: 'utf8', timeout: 10_000 });
const code = source => [...flags, '--input-type=module', '-e', source];
let service;
async function start() {
  const child = spawn(process.execPath, code(`const {server,shutdown}=await import(${JSON.stringify(moduleUrl)});
    server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
    process.on('message',m=>{if(m==='shutdown')shutdown().then(()=>process.exit(0))});`), { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let errors = ''; child.stderr.on('data', chunk => { errors += chunk; });
  const first = await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error(errors); })]);
  return { child, base: `http://127.0.0.1:${Number(String(first[0]).trim())}/api` };
}
async function call(path, token, body, expected = 200) {
  const response = await fetch(service.base + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json(); assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`); return data;
}
try {
  for (const [extra, message] of [[{ DB_PATH: 'relative.db' }, 'absolute DB_PATH'], [{ SUPPORT_CONTACT: '' }, 'SUPPORT_CONTACT'],
    [{ WIND_IDENTITY_MODE: '' }, 'WIND_IDENTITY_MODE']]) {
    const rejected = cli([], extra); assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, new RegExp(message));
  }
  const password = 'Synthetic_Strong_12345';
  const missingAttestation = cli(['enroll', '0599010090', 'admin', 'Synthetic admin'], {}, password);
  assert.notEqual(missingAttestation.status, 0); assert.match(missingAttestation.stderr, /phone ownership/);
  let inspect = new DatabaseSync(path);
  assert.equal(inspect.prepare('SELECT COUNT(*) count FROM users').get().count, 0); inspect.close(); // startup never seeds demo accounts
  const enrolled = cli(['enroll', '0599010090', 'admin', 'Synthetic admin', '--phone-verified'], {}, password);
  assert.equal(enrolled.status, 0, enrolled.stderr);
  assert.equal(cli(['enroll', '0599010091', 'driver', 'Synthetic driver', '--phone-verified', 'truck'], {}, password).status, 0);
  inspect = new DatabaseSync(path);
  const admin = inspect.prepare("SELECT * FROM users WHERE role='admin'").get();
  assert.ok(admin.phone_verified_at); assert.notEqual(admin.password, password);
  const driver = inspect.prepare("SELECT * FROM users WHERE role='driver'").get();
  assert.equal(driver.status, 'pending'); assert.equal(driver.vehicle, 'truck');
  inspect.prepare("INSERT INTO users (phone,name,password,role,status,vehicle,created_at) VALUES (?, 'Legacy', ?, 'customer','active',NULL,?)")
    .run('0599010092', admin.password, Date.now());
  const legacyId = inspect.prepare('SELECT id FROM users WHERE phone=?').get('0599010092').id;
  const legacyToken = randomBytes(32).toString('hex');
  inspect.prepare('INSERT INTO sessions (token_hash,user_id,created_at) VALUES (?,?,?)').run(createHash('sha256').update(legacyToken).digest('hex'), legacyId, Date.now());
  inspect.close();
  service = await start();
  await call('/ready');
  const webBase = service.base.replace(/\/api$/, '');
  const webHome = await fetch(`${webBase}/`, { headers: { 'Accept-Encoding': 'br' } });
  assert.equal(webHome.status, 200); assert.match(webHome.headers.get('content-type'), /text\/html/);
  assert.equal(webHome.headers.get('x-frame-options'), 'DENY');
  assert.equal(webHome.headers.get('content-encoding'), 'br'); assert.equal(webHome.headers.get('vary'), 'Accept-Encoding');
  assert.match(await webHome.text(), /Wind web/);
  const again = await fetch(`${webBase}/`, { headers: { 'Accept-Encoding': 'br' } }); // served from the compressed-once cache
  assert.equal(again.headers.get('content-encoding'), 'br'); assert.match(await again.text(), /Wind web/);
  const webManifest = await fetch(`${webBase}/manifest.webmanifest`);
  assert.equal(webManifest.status, 200); assert.match(webManifest.headers.get('content-type'), /application\/manifest\+json/);
  const webRoute = await fetch(`${webBase}/driver/jobs`);
  assert.equal(webRoute.status, 200); assert.match(await webRoute.text(), /Wind web/);
  assert.equal((await fetch(`${webBase}/%2e%2e%2fserver%2fmain.ts`)).status, 404);
  // A %-escape that is not UTF-8 is a miss, not a server fault.
  for (const bad of ['/driver/%C3%28', '/api/orders/%C3%28']) assert.equal((await fetch(webBase + bad)).status, 404, bad);
  assert.deepEqual(await call('/auth/options'), { registrationOpen: false });
  await call('/auth/register', null, { phone: '0599010093', password, name: 'Public signup' }, 403);
  await call('/auth/login', null, { phone: '0599010092', password }, 403);
  await call('/me', legacyToken, undefined, 401);
  for (let failure = 0; failure < 5; failure++) await call('/auth/login', null, { phone: '0599999985', password: 'wrong' }, 401);
  await call('/auth/login', null, { phone: '0599999985', password: 'wrong' }, 429);
  let exited = once(service.child, 'exit'); service.child.kill('SIGKILL'); await exited;
  service = await start();
  await call('/auth/login', null, { phone: '0599999985', password: 'wrong' }, 429); // budget survives actual process replacement
  const signedIn = await call('/auth/login', null, { phone: '0599010090', password });
  const child = spawn(process.execPath, code(`import {DatabaseSync} from 'node:sqlite';
    const db=new DatabaseSync(process.env.DB_PATH); db.exec('BEGIN IMMEDIATE');
    db.prepare("INSERT INTO settings (key,value) VALUES ('crash-marker',123)").run(); console.log('uncommitted'); setInterval(()=>{},1000);`),
    { env, stdio: ['ignore', 'pipe', 'pipe'] });
  await once(child.stdout, 'data'); exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
  inspect = new DatabaseSync(path);
  assert.equal(inspect.prepare("SELECT value FROM settings WHERE key='crash-marker'").get(), undefined);
  assert.equal(inspect.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(inspect.prepare('PRAGMA foreign_key_check').all().length, 0); inspect.close();

  let finish;
  const acknowledged = new Promise((resolve, reject) => {
    const pending = request(service.base + '/me', { method: 'POST', headers: { Authorization: `Bearer ${signedIn.token}`, 'Content-Type': 'application/json' } }, response => {
      let raw = ''; response.on('data', chunk => { raw += chunk; }); response.on('end', () => resolve({ status: response.statusCode, data: JSON.parse(raw) }));
    });
    pending.on('error', reject); pending.write('{"name":'); finish = () => pending.end('"Drained safely"}');
  });
  await new Promise(resolve => setTimeout(resolve, 30));
  exited = once(service.child, 'exit'); service.child.send('shutdown');
  await new Promise(resolve => setTimeout(resolve, 30)); finish();
  assert.equal((await acknowledged).status, 200); await exited; service = null;
  inspect = new DatabaseSync(path);
  assert.equal(inspect.prepare("SELECT name FROM users WHERE role='admin'").get().name, 'Drained safely'); inspect.close();
  const unverifiedDeletion = cli(['delete-account', '0599010092']);
  assert.notEqual(unverifiedDeletion.status, 0); assert.match(unverifiedDeletion.stderr, /Verify request ownership/);
  const adminDeletion = cli(['delete-account', '0599010090', '--phone-verified']);
  assert.notEqual(adminDeletion.status, 0); assert.match(adminDeletion.stderr, /cannot_change_self/);
  const deleted = cli(['delete-account', '0599010092', '--phone-verified']);
  assert.equal(deleted.status, 0, deleted.stderr);
  inspect = new DatabaseSync(path);
  const deletedAccount = inspect.prepare('SELECT * FROM users WHERE id=?').get(legacyId);
  assert.equal(deletedAccount.phone, `deleted-${legacyId}`); assert.equal(deletedAccount.name, '—');
  assert.equal(deletedAccount.password, ''); assert.equal(deletedAccount.status, 'blocked');
  assert.equal(inspect.prepare('SELECT COUNT(*) count FROM sessions WHERE user_id=?').get(legacyId).count, 0); inspect.close();
  console.log('Deployment checks passed: production gates, verified operator bootstrap/deletion, closed signup/legacy sessions, durable throttle restart, crash rollback/integrity and graceful acknowledged drain');
} finally {
  if (service && service.child.exitCode === null && service.child.signalCode === null) { const exit = once(service.child, 'exit'); service.child.kill('SIGKILL'); await exit; }
  assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep + 'wind-deploy-')); // checked absolute temp target before recursive cleanup
  rmSync(dir, { recursive: true, force: true });
}
