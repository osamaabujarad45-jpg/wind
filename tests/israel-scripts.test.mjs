// The Israel Central host scripts (infra/vm-israel) on their failure paths (Sol recheck of PR #101, HIGH 2 and 3, L12):
// install-release.sh, backup.sh and restore.sh run against a temporary root with stub systemctl/curl/sudo, and real SQLite.
// Needs bash and flock: CI and the Docker gate run it, Windows skips it.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

if (process.platform === 'win32') { console.log('israel-scripts: skipped on Windows (no bash/flock); the gate runs it'); process.exit(0); }

const root = mkdtempSync(join(tmpdir(), 'wind-israel-'));
const bin = join(root, 'bin'), state = join(root, 'state'), data = join(root, 'data'), opt = join(root, 'opt');
const releases = join(opt, 'wind-releases'), live = join(opt, 'windapi'), db = join(data, 'wind.db'), calls = join(root, 'calls.log');
for (const d of [bin, state, join(data, 'backups'), opt]) mkdirSync(d, { recursive: true });
const node = process.execPath;
const helper = join(root, 'helper.mjs');
writeFileSync(helper, `import { DatabaseSync } from 'node:sqlite';
const [cmd, file, tag] = process.argv.slice(2);
const db = new DatabaseSync(file);
if (cmd === 'write') db.prepare('INSERT INTO orders (note) VALUES (?)').run(tag);
if (cmd === 'poison') process.exit(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'poison'").get() ? 0 : 1);
db.close();
`);
const stub = (name, body) => { writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`); chmodSync(join(bin, name), 0o755); };
stub('systemctl', `echo "systemctl $*" >> "$CALLS"
st() { cat "$STATE/$1" 2>/dev/null || echo inactive; }
case "$1" in
  stop) shift; for u; do
      case ",$FAKE_STOP_FAIL," in *",$u,"*) exit 1 ;; esac
      # A request acknowledged while the API shuts down: it must be in the rollback checkpoint.
      if [ "$u" = wind-api ] && [ -n "$FAKE_WRITE_ON_STOP" ] && [ "$(st wind-api)" = active ]; then "$NODE" "$HELPER" write "$DB" "$FAKE_WRITE_ON_STOP"; fi
      echo inactive > "$STATE/$u"; done ;;
  start) shift; for u; do
      if [ "$u" = wind-api ] && [ -e "$LIVE/MIGRATE" ]; then "$NODE" "$HELPER" write "$DB" migrated; fi
      echo active > "$STATE/$u"; done ;;
  is-active) [ "$(st "$3")" = active ] ;;
  show) if [ "$(st "$5")" = active ]; then echo 4242; else echo 0; fi ;;
  *) exit 0 ;;
esac`);
// Port checks (-w) answer 200 or 000; readiness on :4000 needs the API active, a good release and an unpoisoned database.
stub('curl', `echo "curl $*" >> "$CALLS"
url=""; for a; do case "$a" in http*) url=$a ;; esac; done
case "$*" in *" -w "*) probe=1 ;; *) probe="" ;; esac
case "$url" in
  *169.254.169.254*) echo '{"access_token":"tok"}'; exit 0 ;;
  *blob.core.windows.net*) [ -z "$FAKE_PUT_FAIL" ] || exit 22; exit 0 ;;
  *:4010/*) if [ -n "$probe" ]; then echo 000; exit 7; fi; [ -z "$FAKE_DRY_FAIL" ] && [ -e "$DRY_ENV_OUT" ] || exit 7; echo '{"ready":true}' ;; # ready once the dry run is up
  *:4000/*) up=""; [ "$(cat "$STATE/wind-api" 2>/dev/null)" = active ] && up=1
    if [ -n "$probe" ]; then if [ -n "$up" ]; then echo 200; exit 0; fi; echo 000; exit 7; fi
    [ -n "$up" ] && [ ! -e "$LIVE/BAD" ] && ! "$NODE" "$HELPER" poison "$DB" || exit 7; echo '{"ready":true}' ;;
esac`);
stub('sudo', 'while [ $# -gt 0 ]; do case "$1" in -u) shift 2 ;; -E) shift ;; *) break ;; esac; done; exec "$@"');
stub('chown', 'exit 0');
stub('sleep', 'exit 0');
stub('journalctl', 'echo "(journal)"');
stub('install', 'a=""; while [ $# -gt 0 ]; do case "$1" in -o|-g) shift 2 ;; *) a="$a \\"$1\\""; shift ;; esac; done; eval exec /usr/bin/install $a');
// Distinct stamps, as installs minutes apart would have.
stub('date', 'case "$*" in *%S*) n=$(($(cat "$STATE/date" 2>/dev/null || echo 0) + 1)); echo "$n" > "$STATE/date"; printf "20990101%06d\\n" "$n" ;; *) exec /bin/date "$@" ;; esac');

const script = (name, swaps) => {
  let text = readFileSync(new URL(`../infra/vm-israel/${name}`, import.meta.url), 'utf8');
  for (const [from, to] of swaps) {
    assert.ok(text.includes(from), `${name} still has ${from}`);
    text = text.split(from).join(to);
  }
  const file = join(root, name); writeFileSync(file, text); return file;
};
const nodeSwap = ['/opt/node/bin/node', node];
const install = script('install-release.sh', [nodeSwap,
  ['RELEASES=/opt/wind-releases; LIVE=/opt/windapi; DATA=/data; DB=/data/wind.db', `RELEASES=${releases}; LIVE=${live}; DATA=${data}; DB=${db}`],
  ['. /etc/wind-api.env', `. ${join(root, 'wind-api.env')}`], ["prune /opt 'windapi-old-*'", `prune ${opt} 'windapi-old-*'`]]);
const backup = script('backup.sh', [nodeSwap, ['DIR=/data/backups; DB=/data/wind.db', `DIR=${data}/backups; DB=${db}`], ['exec 8</data', `exec 8<${data}`]]);
const restore = script('restore.sh', [nodeSwap, ['DATA=/data; DB=/data/wind.db', `DATA=${data}; DB=${db}`]]);
writeFileSync(join(root, 'wind-api.env'), 'SUPPORT_CONTACT=+972597127547\nWIND_FIREBASE_API_KEY=secret\n');

const dryEnv = join(root, 'dry-env.json');
const env = extra => ({ PATH: `${bin}:${process.env.PATH}`, CALLS: calls, DRY_ENV_OUT: dryEnv, STATE: state, NODE: node, HELPER: helper, DB: db, LIVE: live, ...extra });
const run = (file, args, extra = {}) => {
  rmSync(calls, { force: true }); rmSync(dryEnv, { force: true });
  const r = spawnSync('bash', [file, ...args], { encoding: 'utf8', env: env(extra) });
  return { status: r.status, err: r.stderr + r.stdout, calls: existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n') : [] };
};
const unit = name => existsSync(join(state, name)) ? readFileSync(join(state, name), 'utf8').trim() : 'inactive';
const setUnits = () => { writeFileSync(join(state, 'caddy'), 'active\n'); writeFileSync(join(state, 'wind-api'), 'active\n'); };
const notes = file => { const d = new DatabaseSync(file, { readOnly: true }); try { return d.prepare('SELECT note FROM orders ORDER BY id').all().map(r => r.note); } finally { d.close(); } };
const count = (file, table) => { const d = new DatabaseSync(file, { readOnly: true }); try { return d.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n; } finally { d.close(); } };
const freshDb = file => {
  rmSync(file, { force: true });
  const d = new DatabaseSync(file);
  d.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE users (id INTEGER PRIMARY KEY, phone TEXT); CREATE TABLE orders (id INTEGER PRIMARY KEY, note TEXT);
    CREATE TABLE cash_entries (id INTEGER PRIMARY KEY); CREATE TABLE security_events (id INTEGER PRIMARY KEY);
    CREATE TABLE sessions (id INTEGER PRIMARY KEY); CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY);
    CREATE TABLE native_push_tokens (id INTEGER PRIMARY KEY);
    INSERT INTO users (phone) VALUES ('0599000001'); INSERT INTO orders (note) VALUES ('first'); INSERT INTO sessions DEFAULT VALUES;`);
  d.close();
};
let tarN = 0;
const release = (markers = []) => {
  const dir = mkdtempSync(join(root, 'rel-')), t = join(dir, 'windapi');
  mkdirSync(join(t, 'server'), { recursive: true }); mkdirSync(join(t, 'web'));
  // The dry run only has to stay up; it records the environment it was given.
  writeFileSync(join(t, 'server', 'main.ts'), "if (process.env.PORT === '4010') process.getBuiltinModule('node:fs').writeFileSync(process.env.DRY_ENV_OUT, JSON.stringify(process.env));\nsetInterval(() => {}, 1000);\n");
  for (const f of ['backup.sh', 'restore.sh']) { writeFileSync(join(t, f), '#!/bin/sh\n'); chmodSync(join(t, f), 0o755); }
  for (const m of markers) writeFileSync(join(t, m), '');
  const tar = join(root, `release-${++tarN}.tar.gz`);
  assert.equal(spawnSync('tar', ['-czf', tar, '-C', dir, 'windapi']).status, 0);
  return [tar, createHash('sha256').update(readFileSync(tar)).digest('hex')];
};
const active = () => readlinkSync(live);

try {
  // 1. A host from before the symlink: its /opt/windapi directory becomes legacy-<time>, the checkpoint follows the freeze.
  freshDb(db); setUnits();
  mkdirSync(join(live, 'server'), { recursive: true }); writeFileSync(join(live, 'server', 'main.ts'), '');
  let r = run(install, release(), { FAKE_WRITE_ON_STOP: 'acknowledged-at-stop' });
  assert.equal(r.status, 0, r.err);
  assert.ok(statSync(live).isDirectory() && active().startsWith(`${releases}/`), 'the live path is a symlink to a release');
  const first = active();
  assert.ok(readdirSync(releases).some(n => n.startsWith('legacy-')), 'the legacy tree is kept as a release');
  const stops = r.calls.filter(c => /systemctl (stop|start)/.test(c));
  assert.deepEqual(stops, ['systemctl stop caddy', 'systemctl stop wind-api', 'systemctl start wind-api', 'systemctl start caddy'], 'Caddy closes first and opens last');
  const checkpoint = readdirSync(join(data, 'backups')).find(n => n.startsWith('pre-install-'));
  assert.deepEqual(notes(join(data, 'backups', checkpoint)), ['first', 'acknowledged-at-stop'], 'the checkpoint holds the write acknowledged while stopping');
  const dry = JSON.parse(readFileSync(dryEnv, 'utf8'));
  assert.equal(dry.WIND_FIREBASE_API_KEY, undefined, 'the dry run gets no provider keys');
  assert.equal(dry.SUPPORT_CONTACT, '+972597127547', 'the dry run gets the service environment');

  // 2. A candidate that migrates the live file and then fails readiness: the pointer and the checkpoint go back, keeping
  //    every write acknowledged before the freeze; the candidate's file is kept; Caddy reopens on the previous release.
  setUnits();
  r = run(install, release(['MIGRATE', 'BAD']), { FAKE_WRITE_ON_STOP: 'acknowledged-at-stop-2' });
  assert.equal(r.status, 1, r.err);
  assert.equal(active(), first, 'the previous release is active again');
  assert.deepEqual(notes(db), ['first', 'acknowledged-at-stop', 'acknowledged-at-stop-2'], 'the migration is undone, nothing acknowledged is lost');
  const failed = readdirSync(data).find(n => /^wind\.db\.failed-\d+$/.test(n));
  assert.ok(failed && notes(join(data, failed)).includes('migrated'), "the candidate's database is kept beside it");
  assert.ok(readdirSync(releases).some(n => n.endsWith('-failed')), 'the candidate tree is kept for diagnosis');
  assert.deepEqual([unit('caddy'), unit('wind-api')], ['active', 'active']);
  assert.match(r.err, /previous release is live again/);

  // 3. An uncertain API stop changes nothing: no checkpoint, no switch, and the old release is reopened once ready.
  setUnits();
  const before = readdirSync(join(data, 'backups')).length;
  r = run(install, release(), { FAKE_STOP_FAIL: 'wind-api' });
  assert.equal(r.status, 1, r.err);
  assert.equal(active(), first);
  assert.equal(readdirSync(join(data, 'backups')).length, before, 'no checkpoint from an uncertain stop');
  assert.equal(unit('caddy'), 'active');
  assert.match(r.err, /did not stop for certain/);

  // 4. A dry-run failure never freezes the live service.
  setUnits();
  r = run(install, release(), { FAKE_DRY_FAIL: '1' });
  assert.equal(r.status, 1, r.err);
  assert.ok(!r.calls.some(c => /systemctl stop/.test(c)), 'nothing was stopped');
  assert.equal(active(), first);

  // 5. The candidate fails and so does the previous release: everything stays closed for a person (exit 2).
  setUnits(); writeFileSync(join(first, 'BAD'), '');
  r = run(install, release(['BAD']));
  assert.equal(r.status, 2, r.err);
  assert.match(r.err, /MANUAL RECOVERY NEEDED/);
  assert.equal(unit('caddy'), 'inactive', 'Caddy stays stopped');
  rmSync(join(first, 'BAD'));

  // 6. One database operation at a time: an install waits for nobody, it refuses while the lock is held.
  setUnits();
  const holder = spawn('flock', [data, 'sleep', '30'], { stdio: 'ignore' });
  await new Promise(resolve => setTimeout(resolve, 300));
  r = run(install, release());
  holder.kill();
  assert.equal(r.status, 1);
  assert.match(r.err, /another install, restore or backup is running/);

  // 7. Backup: a missing or empty database is an error that leaves the day's copy and last-ok untouched.
  const backups = join(data, 'backups'), marker = join(backups, 'last-ok');
  const today = join(backups, `wind-${spawnSync('date', ['+%F'], { encoding: 'utf8' }).stdout.trim()}.db`);
  freshDb(db); r = run(backup, []);
  assert.equal(r.status, 1, r.err); // no off-host target configured
  assert.deepEqual(notes(today), ['first'], 'the local snapshot is published');
  assert.ok(!existsSync(marker), 'no off-host copy, no marker');
  for (const [label, prepare] of [['missing', () => rmSync(db)], ['empty', () => writeFileSync(db, '')]]) {
    for (const s of ['-wal', '-shm']) rmSync(db + s, { force: true });
    prepare();
    r = run(backup, [], { WIND_BACKUP_ACCOUNT: 'windbak' });
    assert.equal(r.status, 1, `${label}: ${r.err}`);
    assert.deepEqual(notes(today), ['first'], `${label}: the day's good copy stays`);
    assert.ok(!existsSync(marker), `${label}: last-ok is not written`);
    assert.equal(label === 'missing' ? existsSync(db) : statSync(db).size, label === 'missing' ? false : 0, `${label}: the backup never creates or fills the file`);
    assert.ok(!readdirSync(backups).some(n => n.endsWith('.tmp')), `${label}: no temp file is left`);
  }
  // A file that is SQLite but not Wind's (no tables) is refused before it is published.
  rmSync(db, { force: true });
  { const d = new DatabaseSync(db); d.exec('CREATE TABLE other (x)'); d.close(); }
  r = run(backup, [], { WIND_BACKUP_ACCOUNT: 'windbak' });
  assert.equal(r.status, 1);
  assert.deepEqual(notes(today), ['first'], 'a database without the Wind tables is not published');
  freshDb(db);
  r = run(backup, [], { WIND_BACKUP_ACCOUNT: 'windbak' });
  assert.equal(r.status, 0, r.err);
  assert.ok(existsSync(marker), 'the marker is written after the upload');
  rmSync(marker);
  r = run(backup, [], { WIND_BACKUP_ACCOUNT: 'windbak', FAKE_PUT_FAIL: '1' });
  assert.equal(r.status, 22);
  assert.ok(!existsSync(marker), 'a failed upload writes no marker');
  assert.equal(run(backup, [], { WIND_BACKUP_ACCOUNT: 'bad/name' }).status, 1, 'an invalid account name is refused');

  // 8. Restore: the copy loses every session, Caddy stays closed afterwards, and the replaced file is kept.
  setUnits(); freshDb(db);
  const copy = join(root, 'copy.db'); freshDb(copy);
  { const d = new DatabaseSync(copy); d.prepare("INSERT INTO orders (note) VALUES ('from-copy')").run(); d.close(); }
  r = run(restore, [copy]);
  assert.equal(r.status, 0, r.err);
  assert.deepEqual(notes(db), ['first', 'from-copy']);
  assert.equal(count(db, 'sessions'), 0, 'no session survives a restore');
  assert.equal(unit('caddy'), 'inactive', 'Caddy stays stopped until later blocks are re-applied');
  assert.equal(unit('wind-api'), 'active');
  assert.ok(readdirSync(data).some(n => n.startsWith('wind.db.before-restore-')));
  setUnits();
  r = run(restore, [copy, '--open']);
  assert.equal(r.status, 0, r.err);
  assert.equal(unit('caddy'), 'active');

  // 9. A copy the API cannot run on: the previous database comes back and Caddy reopens only once it is ready.
  setUnits(); freshDb(db);
  const poisoned = join(root, 'poison.db'); freshDb(poisoned);
  { const d = new DatabaseSync(poisoned); d.exec('CREATE TABLE poison (x)'); d.close(); }
  r = run(restore, [poisoned]);
  assert.equal(r.status, 1, r.err);
  assert.deepEqual(notes(db), ['first']);
  assert.equal(count(db, 'sessions'), 1, 'the previous database is back as it was');
  assert.deepEqual([unit('caddy'), unit('wind-api')], ['active', 'active']);
  assert.match(r.err, /previous database is live again/);
  console.log('israel-scripts: install, backup and restore failure paths passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
