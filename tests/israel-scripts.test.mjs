// The Israel Central host scripts (infra/vm-israel) on their failure paths (Sol recheck of PR #101, HIGH 2 and 3, L12):
// install-release.sh, backup.sh and restore.sh run against a temporary root with stub systemctl/curl/sudo, and real SQLite.
// Needs bash and flock: CI and the Docker gate run it, Windows skips it.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

if (process.platform === 'win32') { console.log('israel-scripts: skipped on Windows (no bash/flock); the gate runs it'); process.exit(0); }

const root = mkdtempSync(join(tmpdir(), 'wind-israel-'));
const bin = join(root, 'bin'), state = join(root, 'state'), data = join(root, 'data'), opt = join(root, 'opt');
const releases = join(opt, 'wind-releases'), live = join(opt, 'windapi'), db = join(data, 'wind.db'), calls = join(root, 'calls.log');
for (const d of [bin, state, join(data, 'backups'), opt]) mkdirSync(d, { recursive: true });
const node = process.execPath;
const realSleep = spawnSync('sh', ['-c', 'command -v sleep'], { encoding: 'utf8' }).stdout.trim() || '/bin/sleep'; // before the stub hides it
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
      # provision.sh's Caddy drop-in: no start while the ingress hold exists.
      if [ "$u" = caddy ] && [ -e "$HOLD" ]; then echo "hold: $(cat "$HOLD")" >&2; exit 1; fi
      if [ "$u" = caddy ] && [ -n "$FAKE_CADDY_FAIL" ]; then exit 1; fi
      case "$u" in wind-api|wind-backup.service) /bin/sh -c "$DB_SWAP_GUARD" || exit 1 ;; esac
      if [ "$u" = wind-backup.timer ] && [ -n "$FAKE_TIMER_START_FAIL" ]; then exit 1; fi
      # provision.sh's API check: a host that had a database never starts on a fresh one.
      if [ "$u" = wind-api ] && [ -e "$(dirname "$DB")/.wind-db-expected" ] && [ ! -s "$DB" ]; then exit 1; fi
      if [ "$u" = wind-api ]; then
        WIND_FIREBASE_RESET_LINKS="$FAKE_START_RESET_LINKS" /bin/sh -c "$RESTORE_GUARD" || exit 1
      fi
      if [ "$u" = wind-api ] && [ -e "$LIVE/STARTFAIL" ]; then exit 1; fi
      if [ "$u" = wind-api ] && [ -e "$LIVE/MIGRATE" ]; then "$NODE" "$HELPER" write "$DB" migrated; fi
      if [ "$u" = wind-api ] && [ -n "$FAKE_RESTART_DB_PATH" ]; then printf 'DB_PATH=%s\\0' "$FAKE_RESTART_DB_PATH" > "$PROCESS_ENV"; fi
      echo active > "$STATE/$u"
      # A signal delivered while Caddy starts (the install's commit boundary).
      if [ "$u" = caddy ] && [ -n "$FAKE_TERM_ON_CADDY_START" ]; then kill -TERM "$PPID"; fi
      done ;;
  is-active) for a; do u=$a; done; s=$(st "$u"); case "$*" in *--quiet*) ;; *) echo "$s" ;; esac; [ "$s" = active ] ;;
  show) if [ "$3" = ExecStartPre ]; then case "$5,$FAKE_NO_GUARDS" in
      caddy,*caddy*|wind-api,*wind-api*|wind-backup.service,backup-swap) ;;
      caddy,*) echo "{ argv[]=/bin/sh -c if [ -e /etc/wind-ingress-hold ] }" ;;
      wind-backup.service,*) printf '{ argv[]=%s }\\n' "$DB_SWAP_GUARD" ;;
      wind-api,*)
        echo "{ argv[]=/bin/sh -c if [ -e /data/.wind-db-expected ] }"
        [ "$FAKE_NO_GUARDS" = restore-email ] || printf '{ argv[]=/bin/sh -c %s }\\n' "$RESTORE_GUARD"
        [ "$FAKE_NO_GUARDS" = api-swap ] || printf '{ argv[]=%s }\\n' "$DB_SWAP_GUARD" ;;
      esac
    elif [ "$3" = Environment ]; then printf '%s\\n' "$FAKE_UNIT_ENVIRONMENT"
    elif [ "$3" = EnvironmentFiles ]; then printf '%s\\n' "$FAKE_UNIT_ENV_FILES"
    elif [ "$3" = NextElapseUSecRealtime ]; then
      if [ -n "$FAKE_TIMER_UNSCHEDULED$FAKE_TIMER_DISPATCHED" ]; then echo n/a; else echo 'Thu 2099-01-01 12:00:00 UTC'; fi
    elif [ "$3" = SubState ]; then
      if [ -n "$FAKE_TIMER_DISPATCHED" ]; then echo running; else echo waiting; fi
    elif [ "$3" = ActiveState ]; then st "$5"; elif [ "$(st "$5")" = active ]; then echo 4242; else echo 0; fi ;;
  *) exit 0 ;;
esac`);
// Port checks (-w) answer 200 or 000; readiness on :4000 needs the API active, a good release and an unpoisoned database.
stub('curl', `echo "curl $*" >> "$CALLS"
url=""; for a; do case "$a" in http*) url=$a ;; esac; done
case "$*" in *" -w "*) probe=1 ;; *) probe="" ;; esac
case "$url" in
  *169.254.169.254*) echo '{"access_token":"tok"}'; exit 0 ;;
  *blob.core.windows.net*)
    create_only=0
    for a; do case "$a" in @*) grep -Fqx 'If-None-Match: *' "\${a#@}" && create_only=1 ;; esac; done
    [ "$create_only" = 1 ] || exit 23
    [ -z "$FAKE_PUT_FAIL" ] || exit 22; exit 0 ;;
  # Ready once the dry run is up. sleep is stubbed out, so the script's 60 tries take no time: wait here (up to 5 s) for the
  # stand-in API to start, or a slow node start fails the dry run (seen 22 Nov in the sandbox).
  *:4010/*) if [ -n "$probe" ]; then echo 000; exit 7; fi; [ -z "$FAKE_DRY_FAIL" ] || exit 7
    i=0; while [ ! -e "$DRY_ENV_OUT" ] && [ $i -lt 50 ]; do ${realSleep} 0.1; i=$((i + 1)); done
    [ -e "$DRY_ENV_OUT" ] || exit 7; echo '{"ok":true,"schema":3}' ;;
  *:4000/*) up=""; [ "$(cat "$STATE/wind-api" 2>/dev/null)" = active ] && up=1
    if [ -n "$probe" ]; then if [ -n "$up" ]; then echo 200; exit 0; fi; echo 000; exit 7; fi
    if [ -n "$FAKE_FOREIGN_API" ]; then echo '{"ok":true,"schema":3}'; exit 0; fi
    [ -n "$up" ] && [ ! -e "$LIVE/BAD" ] && ! "$NODE" "$HELPER" poison "$DB" || exit 7
    if [ -n "$FAKE_PG_READY" ]; then echo '{"ok":true,"schema":42,"backend":"postgres"}'
    else echo '{"ok":true,"schema":3}'; fi ;;
esac`);
stub('ss', `if [ -n "$FAKE_FOREIGN_API" ]; then pid=8080
elif [ "$(cat "$STATE/wind-api" 2>/dev/null)" = active ]; then pid=4242
else exit 0
fi
printf 'LISTEN 0 511 127.0.0.1:4000 0.0.0.0:* users:(("node",pid=%s,fd=23))\\n' "$pid"`);
// Interrupt at a rename boundary to exercise recovery with and without shell traps.
stub('mv', `/bin/mv "$@"; rc=$?
if [ "$rc" = 0 ] && [ "$*" = "-T $LIVE.next $LIVE" ] && [ -n "$FAKE_POWER_LOSS_AFTER_POINT" ]; then kill -KILL "$PPID"; fi
if [ "$rc" = 0 ] && [ -n "$FAKE_POWER_LOSS_AFTER_RESTORE_MAIN" ]; then
  case "$*" in "-Tf -- $DB.before-restore-"*" $DB") kill -KILL "$PPID" ;; esac
fi
if [ "$rc" = 0 ] && [ -n "$FAKE_POWER_LOSS_AFTER_PARK_MAIN" ]; then
  case "$*" in "-Tf -- $DB $DB.before-restore-"*) kill -KILL "$PPID" ;; esac
fi
if [ "$rc" = 0 ] && [ -n "$FAKE_POWER_LOSS_AFTER_REPLACEMENT" ]; then
  case "$*" in "-T -- "*/restore.*"/wind.db $DB") kill -KILL "$PPID" ;; esac
fi
if [ -n "$FAKE_TERM_AFTER_MV_FROM" ]; then case "$*" in *"$FAKE_TERM_AFTER_MV_FROM"*) kill -TERM "$PPID" ;; esac; fi
exit "$rc"`);
stub('sudo', 'w=""; while [ $# -gt 0 ]; do case "$1" in -u) w=$2; shift 2 ;; -E) shift ;; *) break ;; esac; done; if [ "$w" = wind ] && [ -n "$FAKE_WIND_UNREADABLE" ]; then for a; do case "$a" in *"$FAKE_WIND_UNREADABLE") echo "Permission denied" >&2; exit 1 ;; esac; done; fi; exec "$@"');
stub('chown', 'exit 0');
stub('sleep', 'exit 0');
stub('journalctl', 'echo "(journal)"');
stub('install', 'a=""; while [ $# -gt 0 ]; do case "$1" in -o|-g) shift 2 ;; *) a="$a \\"$1\\""; shift ;; esac; done; eval exec /usr/bin/install $a');
// Distinct stamps by default. The retry fixtures deliberately share a clock second.
stub('date', `if [ "$*" = '-u +%Y%m%dT%H%M%SZ' ] && [ -n "$FAKE_RESTORE_STAMP" ]; then
  printf '%s\\n' "$FAKE_RESTORE_STAMP"; exit 0
fi
case "$*" in *%S*) n=$(($(cat "$STATE/date" 2>/dev/null || echo 0) + 1)); echo "$n" > "$STATE/date"; printf "20990101%06d\\n" "$n" ;; *) exec /bin/date "$@" ;; esac`);

const script = (name, swaps) => {
  let text = readFileSync(new URL(`../infra/vm-israel/${name}`, import.meta.url), 'utf8');
  for (const [from, to] of swaps) {
    assert.ok(text.includes(from), `${name} still has ${from}`);
    text = text.split(from).join(to);
  }
  const file = join(root, name); writeFileSync(file, text); return file;
};
const nodeSwap = ['/opt/node/bin/node', node];
const hold = join(root, 'wind-ingress-hold');
const swapMarker = join(root, 'wind-db-swap');
const provisionText = readFileSync(new URL('../infra/vm-israel/provision.sh', import.meta.url), 'utf8');
const restoreGuard = /^ExecStartPre=:\/bin\/sh -c '([^'\n]+Wind restore: Firebase email links must be off[^'\n]+)'$/m
  .exec(provisionText)?.[1].replaceAll('/etc/wind-ingress-hold', hold);
assert.ok(restoreGuard, 'the unit checks the effective Firebase switches without pre-expanding shell variables');
const swapGuard = [...provisionText.matchAll(/^ExecStartPre=(\/usr\/bin\/test ! -e \/etc\/wind-db-swap)$/gm)];
assert.equal(swapGuard.length, 2, 'the API and the backup service share the swap check');
const swapCheck = swapGuard[0][1].replace('/etc/wind-db-swap', swapMarker);
const configPath = join(root, 'wind-api.env'), processEnvPath = join(root, 'process-env');
const configSwap = ['API_ENV=/etc/wind-api.env', `API_ENV=${configPath}`];
const processSwap = ['"/proc/$pid/environ"', `"${processEnvPath}"`];
const install = script('install-release.sh', [nodeSwap,
  ['RELEASES=/opt/wind-releases; LIVE=/opt/windapi; DATA=/data; DB=/data/wind.db; HOLD=/etc/wind-ingress-hold', `RELEASES=${releases}; LIVE=${live}; DATA=${data}; DB=${db}; HOLD=${hold}`],
  configSwap, processSwap, ["prune /opt 'windapi-old-*'", `prune ${opt} 'windapi-old-*'`]]);
const backup = script('backup.sh', [nodeSwap, ['DIR=/data/backups; DB=/data/wind.db', `DIR=${data}/backups; DB=${db}`], ['exec 8</data', `exec 8<${data}`]]);
const restore = script('restore.sh', [nodeSwap, configSwap, processSwap, ['DATA=/data; DB=/data/wind.db; HOLD=/etc/wind-ingress-hold; SWAP=/etc/wind-db-swap', `DATA=${data}; DB=${db}; HOLD=${hold}; SWAP=${swapMarker}`]]);
const sqliteConfig = [
  'SUPPORT_CONTACT=+972597127547',
  'WIND_PUSH_SUBJECT=mailto:fixture@example.invalid',
  'WIND_TRUST_PROXY=1',
  'WIND_IDENTITY_MODE=operator-verified',
  'WIND_BACKUP_MAX_AGE_HOURS=3',
  'WIND_FIREBASE_API_KEY=placeholder',
  'WIND_PUBSUB_ENABLED=true',
  'WIND_PUBSUB_ENDPOINT=https://fixture.invalid',
  'WIND_EXPO_PUSH_ENABLED=true',
  'WIND_ACS_KEY=placeholder',
  'OSRM_URL=https://fixture.invalid',
  '',
].join('\n');
const sqliteProcessEnv = `DB_PATH=${db}\0NODE_ENV=production\0`;
writeFileSync(configPath, sqliteConfig);
writeFileSync(processEnvPath, sqliteProcessEnv);

const dryEnv = join(root, 'dry-env.json');
const env = extra => ({ PATH: `${bin}:${process.env.PATH}`, CALLS: calls, DRY_ENV_OUT: dryEnv, STATE: state, NODE: node, HELPER: helper, DB: db, LIVE: live, HOLD: hold, PROCESS_ENV: processEnvPath, RESTORE_GUARD: restoreGuard, DB_SWAP_GUARD: swapCheck, ...extra });
const run = (file, args, extra = {}) => {
  rmSync(calls, { force: true }); rmSync(dryEnv, { force: true });
  const r = spawnSync('bash', [file, ...args], { encoding: 'utf8', env: env(extra) });
  return { status: r.status, signal: r.signal, err: r.stderr + r.stdout, calls: existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n') : [] };
};
const unit = name => existsSync(join(state, name)) ? readFileSync(join(state, name), 'utf8').trim() : 'inactive';
const setUnits = () => { writeFileSync(join(state, 'caddy'), 'active\n'); writeFileSync(join(state, 'wind-api'), 'active\n'); };
const notes = file => { const d = new DatabaseSync(file, { readOnly: true }); try { return d.prepare('SELECT note FROM orders ORDER BY id').all().map(r => r.note); } finally { d.close(); } };
const count = (file, table) => { const d = new DatabaseSync(file, { readOnly: true }); try { return d.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n; } finally { d.close(); } };
const recoverSnapshot = (main, wal) => {
  const work = mkdtempSync(join(root, 'paired-wal-'));
  writeFileSync(join(work, 'source.db'), readFileSync(main));
  writeFileSync(join(work, 'source.db-wal'), readFileSync(wal));
  const instructions = readFileSync(new URL('../docs/operations/restore.md', import.meta.url), 'utf8');
  const vacuum = /--input-type=module - "\$work" <<'NODE'\n([\s\S]+?)\nNODE/.exec(instructions)?.[1];
  assert.ok(vacuum, 'the runbook includes the WAL-aware snapshot command');
  const snapshot = spawnSync(node, ['--disable-warning=ExperimentalWarning', '--input-type=module', '-', work], { input: vacuum, encoding: 'utf8' });
  assert.equal(snapshot.status, 0, snapshot.stderr);
  return join(work, 'recovered.db');
};
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
  writeFileSync(join(t, 'server', 'main.ts'), `
if (process.env.PORT === '4010') {
  if (process.env.WIND_BACKUP_MAX_AGE_HOURS === '') throw Error('invalid backup age');
  process.getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(dryEnv)}, JSON.stringify(process.env));
}
setInterval(() => {}, 1000);
`);
  for (const f of ['backup.sh', 'restore.sh']) { writeFileSync(join(t, f), '#!/bin/sh\n'); chmodSync(join(t, f), 0o755); }
  for (const m of markers) writeFileSync(join(t, m), '');
  const tar = join(root, `release-${++tarN}.tar.gz`);
  assert.equal(spawnSync('tar', ['-czf', tar, '-C', dir, 'windapi']).status, 0);
  return [tar, createHash('sha256').update(readFileSync(tar)).digest('hex')];
};
const active = () => readlinkSync(live);

try {
  freshDb(db); setUnits();
  for (const [file, args] of [[install, release()], [restore, [db]]]) {
    for (const assignment of ['WIND_DATABASE_URL=postgresql://invalid.invalid/db', 'DB_PATH=/data/other.db']) {
      writeFileSync(configPath, `${sqliteConfig}${assignment}\n`);
      const refused = run(file, args);
      assert.equal(refused.status, 1, refused.err);
      assert.match(refused.err, /refuses database overrides/);
      assert.ok(!refused.calls.some(line => line.includes('systemctl stop')));
    }
    writeFileSync(configPath, sqliteConfig);
    for (const processEnv of [sqliteProcessEnv + 'WIND_DATABASE_URL=postgresql://invalid.invalid/db\0', 'DB_PATH=/data/other.db\0']) {
      writeFileSync(processEnvPath, processEnv);
      const refused = run(file, args);
      assert.equal(refused.status, 1, refused.err);
      assert.match(refused.err, /cannot prove the live API uses .* on SQLite/);
      assert.ok(!refused.calls.some(line => line.includes('systemctl stop')));
    }
    writeFileSync(processEnvPath, sqliteProcessEnv);
  }
  // 1. A host from before the symlink: its /opt/windapi directory becomes legacy-<time>, the checkpoint follows the freeze.
  freshDb(db); setUnits();
  mkdirSync(join(live, 'server'), { recursive: true }); writeFileSync(join(live, 'server', 'main.ts'), '');
  let r = run(install, release(), { FAKE_WRITE_ON_STOP: 'acknowledged-at-stop' });
  assert.equal(r.status, 0, r.err);
  assert.ok(statSync(live).isDirectory() && active().startsWith(`${releases}/`), 'the live path is a symlink to a release');
  let first = active();
  assert.ok(!existsSync(hold), 'the ingress hold is lifted at the commit');
  assert.ok(readdirSync(releases).some(n => n.startsWith('legacy-')), 'the legacy tree is kept as a release');
  const stops = r.calls.filter(c => /systemctl (stop|start) (caddy|wind-api)$/.test(c));
  assert.deepEqual(stops, ['systemctl stop caddy', 'systemctl stop wind-api', 'systemctl start wind-api', 'systemctl start caddy'], 'Caddy closes first and opens last');
  const checkpoint = readdirSync(join(data, 'backups')).find(n => n.startsWith('pre-install-'));
  assert.deepEqual(notes(join(data, 'backups', checkpoint)), ['first', 'acknowledged-at-stop'], 'the checkpoint holds the write acknowledged while stopping');
  const dry = JSON.parse(readFileSync(dryEnv, 'utf8'));
  for (const name of ['WIND_FIREBASE_API_KEY', 'WIND_PUBSUB_ENABLED', 'WIND_PUBSUB_ENDPOINT', 'WIND_EXPO_PUSH_ENABLED', 'WIND_ACS_KEY', 'OSRM_URL']) {
    assert.equal(dry[name], undefined, `${name} stays out of the dry run`);
  }
  assert.equal(dry.WIND_IDENTITY_MODE, 'operator-verified');
  assert.equal(dry.WIND_TRUST_PROXY, '1');
  assert.equal(dry.WIND_PUSH_SUBJECT, 'mailto:fixture@example.invalid');
  assert.equal(dry.WIND_BACKUP_MAX_AGE_HOURS, '3');
  assert.equal(dry.SUPPORT_CONTACT, '+972597127547', 'the dry run gets the service environment');

  // 2. A candidate that migrates the live file and then fails readiness: the pointer and the checkpoint go back, keeping
  //    every write acknowledged before the freeze; the candidate's file is kept; Caddy reopens on the previous release.
  setUnits();
  r = run(install, release(['MIGRATE', 'BAD']), { FAKE_WRITE_ON_STOP: 'acknowledged-at-stop-2' });
  assert.equal(r.status, 1, r.err);
  assert.equal(active(), first, 'the previous release is active again');
  assert.deepEqual(notes(db), ['first', 'acknowledged-at-stop', 'acknowledged-at-stop-2'], `the migration is undone, nothing acknowledged is lost
${r.err}`);
  const failed = readdirSync(data).find(n => /^wind\.db\.failed-\d+$/.test(n));
  assert.ok(failed && notes(join(data, failed)).includes('migrated'), "the candidate's database is kept beside it");
  assert.ok(readdirSync(releases).some(n => n.endsWith('-failed')), 'the candidate tree is kept for diagnosis');
  assert.deepEqual([unit('caddy'), unit('wind-api')], ['active', 'active']);
  assert.match(r.err, /previous release is live again/);
  assert.ok(!existsSync(hold), 'the hold is lifted once the previous release is ready');

  // 2b. A candidate that cannot even start: the same recovery.
  setUnits();
  r = run(install, release(['STARTFAIL']));
  assert.equal(r.status, 1, r.err);
  assert.equal(active(), first);
  assert.deepEqual([unit('caddy'), unit('wind-api'), existsSync(hold)], ['active', 'active', false]);

  // 2c. The commit boundary: a signal while Caddy starts never rolls back the release that is already ready (requests may
  //     already have been acknowledged), and the candidate's writes stay.
  setUnits();
  const failedFiles = () => readdirSync(data).filter(n => /^wind\.db\.failed-\d+$/.test(n)).length;
  const failedBefore = failedFiles();
  r = run(install, release(['MIGRATE']), { FAKE_TERM_ON_CADDY_START: '1' });
  assert.equal(r.status, 0, r.err); // the commit tail ignores the signal and completes (Sonnet L2)
  assert.match(r.err, /live: /);
  assert.notEqual(active(), first, 'the committed release stays active');
  assert.ok(notes(db).includes('migrated'), 'its database stays');
  assert.equal(failedFiles(), failedBefore, 'nothing is rolled back');
  assert.deepEqual([unit('caddy'), existsSync(hold)], ['active', false]);
  first = active(); rmSync(join(first, 'MIGRATE')); // its later starts write nothing more

  // 2e. Caddy fails after the commit: the ready release stays, and the message gives the real Caddy and hold state.
  setUnits();
  r = run(install, release(), { FAKE_CADDY_FAIL: '1' });
  assert.equal(r.status, 1, r.err);
  assert.notEqual(active(), first, 'committed');
  assert.match(r.err, /Caddy did not start \(Caddy: inactive; hold \S+: absent\)/);
  first = active();
  assert.ok(r.calls.includes('systemctl stop wind-backup.timer') && r.calls.at(-1) === 'systemctl start wind-backup.timer', 'the backup timer is paused and restarted');

  // 2f. A oneshot backup still running ("activating", which is-active does not report) is stopped before anything moves.
  setUnits(); writeFileSync(join(state, 'wind-backup.service'), 'activating\n');
  r = run(install, release());
  assert.equal(r.status, 0, r.err);
  const order = r.calls.filter(c => /systemctl (stop|start) (caddy|wind-api|wind-backup\.\w+)$/.test(c));
  assert.deepEqual(order.slice(0, 4), ['systemctl stop caddy', 'systemctl stop wind-backup.timer', 'systemctl stop wind-backup.service', 'systemctl stop wind-api'],
    'the backup is stopped after the freeze and before the API');
  assert.equal(r.calls.at(-1), 'systemctl start --no-block wind-backup.service', 'and started again at the end');
  rmSync(join(state, 'wind-backup.service'), { force: true }); rmSync(join(state, '--no-block'), { force: true }); // the rerun is the stub's last call
  first = active();
  // A backup that will not stop: nothing moves, and what was there reopens.
  setUnits();
  r = run(install, release(), { FAKE_STOP_FAIL: 'wind-backup.service' });
  assert.equal(r.status, 1, r.err);
  assert.match(r.err, /backup is still running/);
  assert.equal(active(), first);
  assert.deepEqual([unit('caddy'), unit('wind-api'), existsSync(hold)], ['active', 'active', false]);

  // An untrappable interruption at the pointer switch leaves the identity of both releases and the verified checkpoint.
  setUnits();
  r = run(install, release(), { FAKE_POWER_LOSS_AFTER_POINT: '1', TMPDIR: root });
  assert.equal(r.signal, 'SIGKILL', r.err);
  assert.notEqual(active(), first, 'the pointer switched before the interruption');
  assert.deepEqual([unit('caddy'), unit('wind-api')], ['inactive', 'inactive']);
  const [installState, previousRelease, candidateRelease, checkpointRecord] = readFileSync(hold, 'utf8').trimEnd().split('\n');
  assert.match(installState, /^install \d+ switching /);
  assert.equal(previousRelease, `previous release: ${first}`);
  assert.equal(candidateRelease, `candidate release: ${active()}`);
  assert.ok(checkpointRecord.startsWith(`checkpoint: ${join(data, 'backups', 'pre-install-')}`));
  assert.deepEqual(notes(checkpointRecord.slice('checkpoint: '.length)), notes(db), 'the recorded checkpoint is usable');
  unlinkSync(live); symlinkSync(first, live); rmSync(hold); setUnits();

  // 2g. Without provision.sh's two unit checks nothing runs.
  setUnits();
  for (const file of [install, restore]) {
    for (const missing of ['caddy', 'wind-api']) { // either guard alone missing refuses
      r = run(file, file === install ? release() : [join(data, 'backups', checkpoint)], { FAKE_NO_GUARDS: missing });
      assert.equal(r.status, 1, r.err);
      assert.match(r.err, /re-run provision\.sh first/);
      assert.ok(!r.calls.some(c => /systemctl stop/.test(c)), 'nothing was stopped');
    }
  }
  // Root never writes through the wind-owned marker path, and a stopped backup runs again (Haiku H1, L1).
  // Static guard: in install and restore every write, copy or rename of a /data path ($DB, $KEPT, $WORK, $SNAP, the marker)
  // goes through as_wind; root never acts through a path wind controls.
  // (install's own $WORK is a root-private directory under /tmp, so it is not one of them.)
  // Each command segment is checked on its own, so an as_wind elsewhere on the line exempts nothing (Haiku F4).
  for (const [name, write] of [['install-release.sh', /^(mv|cp|cat|touch|chmod|chown|install|rm|ln|find)\s.*\$(DB|SNAP|DATA)\b/],
    ['restore.sh', /^(mv|cp|cat|touch|chmod|chown|install|rm|ln|find)\s.*\$(DB|KEPT|WORK|FAILED|DATA|COPY)\b|<\s*"?\$COPY/]]) {
    const lines = readFileSync(new URL(`../infra/vm-israel/${name}`, import.meta.url), 'utf8').split('\n');
    // Single-quoted bodies are as_wind sh -c scripts (no root sh -c exists, asserted below); pipes, backgrounding and the
    // if/elif/while/until/exec/sudo prefixes start a new command too, and literal /data paths count (Haiku G1).
    assert.ok(!lines.some(l => /(^|[;|&]\s*)(sudo\s+)?(ba)?sh\s+-c/.test(l.trim()) && !/as_wind\s+sh\s+-c/.test(l)), `${name}: no root sh -c`);
    const segments = lines.filter(l => !/^\s*#/.test(l)).flatMap(l => l.replace(/'[^']*'/g, "''").replace(/\s#\s.*$/, '').replace(/\/data\//g, '$DATA/')
      .split(/;|&&|\|\||\||&|\bthen\b|\bdo\b|\belse\b|[{(!]/).map(s => s.trim().replace(/^((if|elif|while|until|time|exec)\s+)+/, '').replace(/^sudo\s+(?!-u\s+wind)/, '')));
    const rootWrites = segments.filter(s => write.test(s));
    assert.deepEqual(rootWrites, [], `${name}: root writes under /data`);
  }
  assert.ok(/sudo -u wind touch -- \/data\/\.wind-db-expected/.test(provisionText));
  // The strings the preflight looks for are the ones provision.sh puts in the two units.
  const unitText = marker => provisionText.slice(provisionText.indexOf(marker), provisionText.indexOf('\nEOF', provisionText.indexOf(marker)));
  assert.match(unitText('wind-hold.conf <<'), /ExecStartPre=.*\/etc\/wind-ingress-hold/, 'the hold check is in the Caddy drop-in');
  assert.match(unitText('wind-api.service <<'), /ExecStartPre=.*\/data\/\.wind-db-expected/, 'the database check is in the API unit');
  // The detector itself: forms that must be caught.
  const caught = s => s.replace(/'[^']*'/g, "''").replace(/\/data\//g, '$DATA/').split(/;|&&|\|\||\||&|\bthen\b|\bdo\b|\belse\b|[{(!]/)
    .map(x => x.trim().replace(/^((if|elif|while|until|time|exec)\s+)+/, '').replace(/^sudo\s+(?!-u\s+wind)/, ''))
    .some(x => /^(mv|cp|cat|touch|chmod|chown|install|rm|ln|find)\s.*\$(DB|KEPT|WORK|FAILED|DATA|COPY)\b|<\s*"?\$COPY/.test(x));
  for (const sample of ['if rm -f -- "$DB"; then', 'elif rm -f "$DB"', 'printf x | rm -f "$DB"', 'printf x & rm -f "$DB"', 'sudo rm -f -- "$DB"',
    'exec rm -f "$DB"', 'sudo cat "$COPY" > /x', 'rm -f /data/wind.db', 'if [ -s x ]; then rm -f -- "$DB"; fi'])
    assert.ok(caught(sample), `the static guard catches: ${sample}`);
  assert.ok(!caught('as_wind mv -T -- "$WORK/wind.db" "$DB"'), 'and lets as_wind through');

  // 2d. An install refuses to start while another operation's hold is in place.
  writeFileSync(hold, 'restore awaiting reconciliation\n');
  r = run(install, release());
  assert.equal(r.status, 1);
  assert.match(r.err, /ingress hold is in place/);
  assert.ok(!r.calls.some(c => /systemctl stop/.test(c)), 'nothing was stopped');
  rmSync(hold);

  // 3. An uncertain API stop changes nothing: no checkpoint, no switch, and the old release is reopened once ready.
  setUnits();
  const before = readdirSync(join(data, 'backups')).length;
  r = run(install, release(), { FAKE_STOP_FAIL: 'wind-api' });
  assert.equal(r.status, 1, r.err);
  assert.equal(active(), first);
  assert.equal(readdirSync(join(data, 'backups')).length, before, 'no checkpoint from an uncertain stop');
  assert.equal(unit('caddy'), 'active');
  assert.ok(!existsSync(hold));
  assert.match(r.err, /did not stop for certain/);

  // 4. A dry-run failure never freezes the live service.
  setUnits();
  r = run(install, release(), { FAKE_DRY_FAIL: '1' });
  assert.equal(r.status, 1, r.err);
  assert.ok(!r.calls.some(c => /systemctl stop/.test(c)), 'nothing was stopped');
  assert.equal(active(), first);

  writeFileSync(configPath, sqliteConfig.replace('WIND_BACKUP_MAX_AGE_HOURS=3', 'WIND_BACKUP_MAX_AGE_HOURS='));
  r = run(install, release());
  writeFileSync(configPath, sqliteConfig);
  assert.equal(r.status, 1, r.err);
  assert.match(r.err, /invalid backup age/);
  assert.ok(!r.calls.some(c => /systemctl stop/.test(c)), 'an invalid startup value is caught before freeze');
  assert.equal(active(), first);

  // 5. The candidate fails and so does the previous release: everything stays closed for a person (exit 2).
  setUnits(); writeFileSync(join(first, 'BAD'), '');
  r = run(install, release(['BAD']));
  assert.equal(r.status, 2, r.err);
  assert.match(r.err, /MANUAL RECOVERY NEEDED/);
  assert.equal(unit('caddy'), 'inactive', 'Caddy stays stopped');
  assert.ok(existsSync(hold), 'the hold stays, so a reboot stays closed too');
  assert.equal(run(install, release()).status, 1, 'and no install runs over it');
  rmSync(join(first, 'BAD')); rmSync(hold);

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
  writeFileSync(marker, 'old'); const markedAt = statSync(marker).mtimeMs;
  freshDb(db); r = run(backup, []);
  assert.equal(r.status, 1, r.err); // no off-host target configured
  assert.deepEqual(notes(today), ['first'], 'the local snapshot is published');
  assert.equal(statSync(marker).mtimeMs, markedAt, 'no off-host copy, no marker update');
  for (const [label, prepare] of [['missing', () => rmSync(db)], ['empty', () => writeFileSync(db, '')]]) {
    for (const s of ['-wal', '-shm']) rmSync(db + s, { force: true });
    prepare();
    r = run(backup, [], { WIND_BACKUP_ACCOUNT: 'windbak' });
    assert.equal(r.status, 1, `${label}: ${r.err}`);
    assert.deepEqual(notes(today), ['first'], `${label}: the day's good copy stays`);
    assert.equal(statSync(marker).mtimeMs, markedAt, `${label}: last-ok is not touched`);
    assert.equal(label === 'missing' ? existsSync(db) : statSync(db).size, label === 'missing' ? false : 0, `${label}: the backup never creates or fills the file`);
    assert.ok(!readdirSync(backups).some(n => n.endsWith('.tmp')), `${label}: no temp file is left`);
  }
  // A file that is SQLite but not Wind's (no tables) is refused before it is published.
  rmSync(db, { force: true });
  { const d = new DatabaseSync(db); d.exec('CREATE TABLE other (x)'); d.close(); }
  r = run(backup, [], { WIND_BACKUP_ACCOUNT: 'windbak' });
  assert.equal(r.status, 1);
  assert.deepEqual(notes(today), ['first'], 'a database without the Wind tables is not published');
  assert.equal(statSync(marker).mtimeMs, markedAt);
  assert.ok(!readdirSync(backups).some(n => n.endsWith('.tmp')), 'its staged copy is removed');
  rmSync(marker);
  freshDb(db);
  r = run(backup, [], { WIND_BACKUP_ACCOUNT: 'windbak' });
  assert.equal(r.status, 0, r.err);
  assert.ok(existsSync(marker), 'the marker is written after the upload');
  writeFileSync(marker, 'old'); const beforePut = statSync(marker).mtimeMs - 5000;
  { const t = new Date(beforePut); spawnSync('touch', ['-d', t.toISOString(), marker]); }
  const putAt = statSync(marker).mtimeMs;
  r = run(backup, [], { WIND_BACKUP_ACCOUNT: 'windbak', FAKE_PUT_FAIL: '1' });
  assert.equal(r.status, 22);
  assert.equal(statSync(marker).mtimeMs, putAt, 'a failed upload leaves the existing marker as it was');
  assert.equal(run(backup, [], { WIND_BACKUP_ACCOUNT: 'bad/name' }).status, 1, 'an invalid account name is refused');

  // Recover an acknowledged write from a split WAL before handing a self-contained snapshot to restore.sh.
  {
    const raw = join(root, 'raw-wal.db'); freshDb(raw);
    const writer = new DatabaseSync(raw);
    try {
      writer.exec("PRAGMA wal_autocheckpoint = 0; INSERT INTO orders (note) VALUES ('committed in WAL')");
      assert.ok(statSync(`${raw}-wal`).size > 0, 'the committed write needs its WAL');
      r = run(restore, [raw]);
      assert.equal(r.status, 1, r.err);
      assert.match(r.err, /restore input has a SQLite journal/);
      assert.ok(!r.calls.some(c => /systemctl stop/.test(c)));

      const displaced = join(data, 'wind.db.before-restore-wal-fixture');
      writeFileSync(displaced, readFileSync(raw));
      assert.deepEqual(notes(displaced), ['first'], 'the displaced main file can be read without the committed WAL write');
      r = run(restore, [displaced]);
      assert.equal(r.status, 1, r.err);
      assert.match(r.err, /make a self-contained SQLite snapshot/);
      assert.ok(!r.calls.some(c => /systemctl stop/.test(c)));

      const recovered = recoverSnapshot(displaced, `${raw}-wal`);
      assert.deepEqual(notes(recovered), ['first', 'committed in WAL']);
      setUnits();
      r = run(restore, [recovered]);
      assert.equal(r.status, 0, r.err);
      assert.deepEqual(notes(db), ['first', 'committed in WAL']);
      assert.match(readFileSync(hold, 'utf8'), /^displaced database: .+\.before-restore-/m);
      assert.match(readFileSync(hold, 'utf8'), /^failed replacement: .+\.restore-failed-/m);
      assert.equal(unit('caddy'), 'inactive');
      rmSync(hold);
    } finally { writer.close(); }
  }

  // 8. Restore: the copy loses every session, Caddy stays closed afterwards, and the replaced file is kept.
  setUnits(); freshDb(db);
  const copy = join(root, 'copy.db'); freshDb(copy);
  {
    const d = new DatabaseSync(copy);
    d.exec(`INSERT INTO orders (note) VALUES ('from-copy'); INSERT INTO push_subscriptions DEFAULT VALUES; INSERT INTO native_push_tokens DEFAULT VALUES;
      CREATE TABLE email_codes (user_id INTEGER PRIMARY KEY); INSERT INTO email_codes VALUES (1);
      CREATE TABLE firebase_resets (user_id INTEGER PRIMARY KEY); INSERT INTO firebase_resets VALUES (1);
      CREATE TABLE firebase_email_attempts (uid TEXT PRIMARY KEY, state TEXT NOT NULL, cleanup_at INTEGER NOT NULL, retry_until INTEGER NOT NULL);
      INSERT INTO firebase_email_attempts VALUES ('1', 'ready', 100, 0), ('2', 'sending', 200, 400), ('3', 'queued', 300, 400),
        ('4', 'reconcile', 350, 0), ('5', 'retired', 500, 600);`);
    d.close();
  }
  r = run(restore, [copy]);
  assert.equal(r.status, 0, r.err);
  assert.deepEqual(notes(db), ['first', 'from-copy']);
  assert.deepEqual([count(db, 'sessions'), count(db, 'push_subscriptions'), count(db, 'native_push_tokens')], [0, 0, 0], 'no session or push registration survives a restore');
  assert.equal(count(db, 'email_codes'), 0, 'transient email codes are invalidated');
  assert.equal(count(db, 'firebase_resets'), 0, 'legacy reset requests are invalidated');
  {
    const d = new DatabaseSync(db, { readOnly: true });
    const attempts = d.prepare('SELECT uid, state, cleanup_at, retry_until FROM firebase_email_attempts ORDER BY uid').all();
    assert.deepEqual(attempts.map(r => [r.uid, r.state, r.cleanup_at, r.retry_until]), [
      ['1', 'retired', 0, 0], ['2', 'retired', 200, 400], ['3', 'retired', 0, 0], ['4', 'reconcile', 350, 0], ['5', 'retired', 500, 600],
    ],
      'restored reset links are retired and the provider cleanup journal is preserved');
    d.close();
  }
  assert.match(readFileSync(hold, 'utf8'), /re-apply later blocks/, 'the reconciliation hold persists (a reboot stays closed)');
  assert.match(readFileSync(hold, 'utf8'), /verified email changes/);
  assert.match(run(install, release()).err, /ingress hold is in place/, 'and no install reopens it');
  assert.equal(unit('caddy'), 'inactive', 'Caddy stays stopped until later blocks are re-applied');
  assert.equal(unit('wind-api'), 'active');
  assert.ok(readdirSync(data).some(n => n.startsWith('wind.db.before-restore-')));
  rmSync(hold);
  setUnits(); freshDb(db);
  r = run(restore, [copy, '--open']);
  assert.equal(r.status, 0, r.err);
  assert.deepEqual([unit('caddy'), existsSync(hold)], ['inactive', true], '--open holds ingress for a snapshot with cleanup records');
  rmSync(hold);

  assert.ok(existsSync(join(data, '.wind-db-expected')), 'after a restore the API refuses to start without a database');

  // 8b. A relative path is resolved from the operator's directory, not from / (Haiku C1).
  const cleanCopy = join(root, 'copy-clean.db'); freshDb(cleanCopy);
  { const d = new DatabaseSync(cleanCopy); d.exec("INSERT INTO orders (note) VALUES ('from-copy');"); d.close(); }
  setUnits();
  r = run(restore, [cleanCopy, '--open']);
  assert.equal(r.status, 0, r.err);
  assert.match(r.err, /displaced database needs email reconciliation/);
  assert.deepEqual([unit('caddy'), existsSync(hold)], ['inactive', true], '--open holds ingress for the displaced journal');

  const earlierHold = 'install recovery pending\n';
  writeFileSync(hold, earlierHold);
  r = run(restore, [cleanCopy, '--open']);
  assert.equal(r.status, 0, r.err);
  assert.deepEqual([unit('caddy'), existsSync(hold)], ['inactive', true], '--open preserves an earlier hold with two clean databases');
  assert.ok(readFileSync(hold, 'utf8').endsWith(earlierHold));
  rmSync(hold);

  setUnits();
  r = spawnSync('bash', [restore, 'copy-clean.db', '--open'], { encoding: 'utf8', cwd: root, env: env({}) });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(notes(db), ['first', 'from-copy']);
  assert.deepEqual([unit('caddy'), existsSync(hold)], ['active', false], 'the clean snapshot can reopen when no earlier hold exists');
  for (const suffix of ['', '-wal', '-shm']) rmSync(db + suffix, { force: true });
  writeFileSync(join(state, 'wind-api'), 'inactive\n');
  assert.ok(existsSync(join(data, '.wind-db-expected')));
  r = run(restore, [cleanCopy, '--open']);
  assert.equal(r.status, 0, r.err);
  assert.match(r.err, /previously initialized database is missing/);
  assert.deepEqual(notes(db), ['first', 'from-copy']);
  assert.deepEqual([unit('caddy'), existsSync(hold)], ['inactive', true], '--open keeps ingress closed when the initialized database is unavailable');
  rmSync(hold);
  {
    const config = readFileSync(configPath, 'utf8');
    writeFileSync(configPath, config + '\nWIND_FIREBASE_EMAIL_LINKS=1\n');
    try {
      const blockedRestore = run(restore, [copy]);
      assert.equal(blockedRestore.status, 1);
      assert.match(blockedRestore.err, /unset both Firebase email link switches/);
      assert.ok(!blockedRestore.calls.some(c => /systemctl stop/.test(c)));
    } finally { writeFileSync(configPath, config); }
  }
  {
    writeFileSync(join(state, 'wind-api'), 'inactive\n');
    const before = statSync(db).ino;
    const blockedRestore = run(restore, [copy], { FAKE_UNIT_ENVIRONMENT: 'NODE_ENV=production WIND_FIREBASE_RESET_LINKS=1' });
    assert.equal(blockedRestore.status, 1, blockedRestore.err);
    assert.match(blockedRestore.err, /unset both Firebase email link switches in the loaded API unit/);
    assert.ok(!blockedRestore.calls.some(c => /systemctl stop/.test(c)));
    assert.equal(statSync(db).ino, before, 'a stopped API with an enabled override is rejected before replacing the database');
    const extraEnvironment = join(root, 'extra-api.env');
    writeFileSync(extraEnvironment, 'WIND_FIREBASE_EMAIL_LINKS="1"\n');
    const blockedFile = run(restore, [copy], { FAKE_UNIT_ENV_FILES: `${configPath} (ignore_errors=no)\n${extraEnvironment} (ignore_errors=yes)` });
    assert.equal(blockedFile.status, 1, blockedFile.err);
    assert.match(blockedFile.err, /unset both Firebase email link switches in the loaded API environment files/);
    assert.ok(!blockedFile.calls.some(c => /systemctl stop/.test(c)));
    assert.equal(statSync(db).ino, before, 'the service environment-file override is also checked before the swap');
    const missingGuard = run(restore, [copy], { FAKE_NO_GUARDS: 'restore-email' });
    assert.equal(missingGuard.status, 1, missingGuard.err);
    assert.match(missingGuard.err, /API restore email check is not loaded/);
    assert.ok(!missingGuard.calls.some(c => /systemctl stop/.test(c)));
    for (const guard of ['api', 'backup']) {
      const missingSwapGuard = run(restore, [copy], { FAKE_NO_GUARDS: `${guard}-swap` });
      assert.equal(missingSwapGuard.status, 1, missingSwapGuard.err);
      assert.match(missingSwapGuard.err, /swap check is not loaded/);
      assert.ok(!missingSwapGuard.calls.some(c => /systemctl stop/.test(c)));
    }
  }
  {
    setUnits(); freshDb(db); writeFileSync(hold, earlierHold);
    const blockedStart = run(restore, [cleanCopy, '--open'], { FAKE_START_RESET_LINKS: '1' });
    assert.equal(blockedStart.status, 2, blockedStart.err);
    assert.match(blockedStart.err, /Wind restore: Firebase email links must be off/);
    assert.match(readFileSync(hold, 'utf8'), /^restore of /, 'a failed API launch leaves a restore hold through reboot');
    assert.deepEqual([unit('wind-api'), unit('caddy'), notes(db)], ['inactive', 'inactive', ['first']]);
    rmSync(hold);
  }
  // A copy the service user cannot stage is refused before anything stops (the stub's wind user cannot read *.unreadable).
  setUnits();
  const unreadable = join(root, 'x.unreadable'); writeFileSync(unreadable, 'x');
  r = run(restore, [unreadable], { FAKE_WIND_UNREADABLE: '.unreadable' });
  assert.equal(r.status, 1, r.err);
  assert.match(r.err, /could not stage/);
  assert.ok(!/sudo cat/.test(r.err), 'no root read is ever printed (it could lead through a planted link)');
  assert.ok(!r.calls.some(c => /systemctl stop/.test(c)), 'nothing was stopped');
  // Under /data an unreadable file may be a planted link: root is never told to read it (Haiku W2).
  const planted = join(data, 'backups', 'planted.unreadable'); writeFileSync(planted, 'x');
  r = run(restore, [planted], { FAKE_WIND_UNREADABLE: '.unreadable' });
  assert.equal(r.status, 1, r.err);
  assert.match(r.err, /could not stage/);
  assert.ok(!/sudo cat/.test(r.err), 'no root read is suggested');
  rmSync(planted);
  // install-release.sh resolves a relative tarball the same way (Haiku C1).
  setUnits();
  const [relTar, relSum] = release();
  r = spawnSync('bash', [install, relTar.slice(root.length + 1), relSum], { encoding: 'utf8', cwd: root, env: env({}) });
  assert.equal(r.status, 0, r.stderr);

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
  const timerCheck = r.calls.indexOf('systemctl show -p NextElapseUSecRealtime --value wind-backup.timer');
  assert.ok(timerCheck >= 0 && timerCheck < r.calls.indexOf('systemctl start caddy'), 'the timer is confirmed before Caddy starts');
  assert.ok(!existsSync(hold));

  for (const failure of [{ FAKE_TIMER_START_FAIL: '1' }, { FAKE_TIMER_UNSCHEDULED: '1' }]) {
    setUnits(); freshDb(db);
    r = run(restore, [poisoned], failure);
    assert.equal(r.status, 2, r.err);
    assert.match(r.err, /previous database is ready but the backup timer has no confirmed run/);
    assert.deepEqual(notes(db), ['first']);
    assert.deepEqual([unit('wind-api'), unit('caddy'), existsSync(hold), existsSync(swapMarker)], ['active', 'inactive', true, false]);
    assert.ok(!r.calls.includes('systemctl start caddy'), 'the backup failure keeps ingress held');
    rmSync(hold);
  }
  setUnits(); freshDb(db);
  r = run(restore, [poisoned], { FAKE_TIMER_DISPATCHED: '1' });
  assert.equal(r.status, 1, r.err);
  assert.match(r.err, /backup timer has dispatched its next run/);
  assert.deepEqual([unit('caddy'), existsSync(hold)], ['active', false]);
  setUnits(); freshDb(db);
  r = run(restore, [cleanCopy, '--open'], { FAKE_TIMER_START_FAIL: '1' });
  assert.equal(r.status, 2, r.err);
  assert.match(r.err, /restored database is ready but the backup timer has no confirmed run/);
  assert.deepEqual(notes(db), ['first', 'from-copy'], 'the validated restored copy stays in place');
  assert.deepEqual([unit('wind-api'), unit('caddy'), existsSync(hold), existsSync(swapMarker)], ['active', 'inactive', true, false]);
  rmSync(hold);

  // Readiness must come from the service on the expected database before the hold is released.
  for (const [file, args] of [[install, release()], [restore, [copy, '--open']]]) {
    for (const failure of [{ FAKE_FOREIGN_API: '1' }, { FAKE_RESTART_DB_PATH: '/data/other.db' }]) {
      setUnits(); freshDb(db);
      r = run(file, args, failure);
      assert.equal(r.status, 2, r.err);
      assert.match(r.err, /MANUAL RECOVERY NEEDED/);
      assert.deepEqual(notes(db), ['first'], 'a mismatched listener or database cannot commit');
      assert.deepEqual([unit('caddy'), existsSync(hold)], ['inactive', true]);
      rmSync(hold);
      writeFileSync(processEnvPath, sqliteProcessEnv);
    }
  }

  setUnits(); freshDb(db);
  r = run(restore, [copy, '--open'], { FAKE_PG_READY: '1' });
  assert.equal(r.status, 2, r.err);
  assert.deepEqual(notes(db), ['first'], 'a ready PostgreSQL service cannot commit a SQLite restore');
  assert.deepEqual([unit('caddy'), existsSync(hold)], ['inactive', true]);
  rmSync(hold);

  // 10. A failed restore while an earlier restore's hold is still owed its reconciliation keeps that hold and stays closed.
  setUnits(); writeFileSync(hold, 'restored earlier: re-apply\n');
  r = run(restore, [poisoned]);
  assert.equal(r.status, 1, r.err);
  assert.deepEqual(notes(db), ['first']);
  assert.deepEqual([unit('caddy'), readFileSync(hold, 'utf8')], ['inactive', 'restored earlier: re-apply\n']);
  rmSync(hold);

  // 10b. A new disk (no database before the restore) and a copy the API cannot run on: nothing to reopen, so the hold stays and
  //      the API is not started on an empty file; the failed copy is kept.
  setUnits(); for (const s of ['', '-wal', '-shm']) rmSync(db + s, { force: true });
  r = run(restore, [poisoned]);
  assert.equal(r.status, 2, r.err);
  assert.match(r.err, /no previous database to reopen/);
  assert.deepEqual([existsSync(db), existsSync(hold), unit('caddy')], [false, true, 'inactive']);
  assert.ok(readdirSync(data).some(n => /^wind\.db\.restore-failed-/.test(n)), 'the failed replacement is kept');
  rmSync(hold);

  // 11. A signal right after the replacement is renamed into place: recovery recognises it and puts the original back.
  setUnits(); freshDb(db);
  r = run(restore, [copy], { FAKE_TERM_AFTER_MV_FROM: '/restore.' });
  assert.equal(r.status, 130, r.err);
  assert.deepEqual(notes(db), ['first'], 'the original database is live again');
  assert.equal(count(db, 'sessions'), 1);
  assert.deepEqual([unit('caddy'), unit('wind-api'), existsSync(hold)], ['active', 'active', false]);

  {
    const fixedClock = { FAKE_RESTORE_STAMP: '20990101T120000Z' };
    const original = join(root, 'rollback-wal.db'); freshDb(original);
    const walOnlyOrder = 'acknowledged before rollback';
    let originalMain, originalWal;
    const writer = new DatabaseSync(original);
    try {
      writer.exec('PRAGMA wal_autocheckpoint = 0');
      writer.prepare('INSERT INTO orders (note) VALUES (?)').run(walOnlyOrder);
      originalMain = readFileSync(original);
      originalWal = readFileSync(`${original}-wal`);
    } finally { writer.close(); }
    assert.ok(originalWal.length > 0);
    const stageOriginal = () => {
      setUnits();
      for (const suffix of ['', '-wal', '-shm']) rmSync(db + suffix, { force: true });
      writeFileSync(db, originalMain);
      writeFileSync(`${db}-wal`, originalWal);
    };
    const displacedFiles = () => [...readFileSync(hold, 'utf8').matchAll(/^displaced database: (.+)$/gm)].map(match => match[1]);

    // The first attempt parks both originals. A second attempt in the same second must park its files elsewhere.
    stageOriginal();
    r = run(restore, [cleanCopy], { ...fixedClock, FAKE_POWER_LOSS_AFTER_REPLACEMENT: '1' });
    assert.equal(r.signal, 'SIGKILL', r.err);
    assert.ok(existsSync(swapMarker) && existsSync(db), 'the replacement reached the live path');
    const [firstArchive] = displacedFiles();
    assert.deepEqual(readFileSync(firstArchive), originalMain);
    assert.deepEqual(readFileSync(`${firstArchive}-wal`), originalWal);
    r = run(restore, [cleanCopy], { ...fixedClock, FAKE_POWER_LOSS_AFTER_PARK_MAIN: '1' });
    assert.equal(r.signal, 'SIGKILL', r.err);
    const [secondArchive, retainedArchive] = displacedFiles();
    assert.equal(retainedArchive, firstArchive);
    assert.notEqual(secondArchive, firstArchive);
    for (const path of [firstArchive, secondArchive]) assert.ok(path.startsWith(`${db}.before-restore-${fixedClock.FAKE_RESTORE_STAMP}`));
    const replacements = [...readFileSync(hold, 'utf8').matchAll(/^failed replacement: (.+)$/gm)].map(match => match[1]);
    assert.equal(new Set(replacements).size, 2, 'both failed-replacement paths are unique as well');
    assert.deepEqual(readFileSync(firstArchive), originalMain, 'the retry leaves the first main intact');
    assert.deepEqual(readFileSync(`${firstArchive}-wal`), originalWal, 'the retry leaves the first WAL intact');
    assert.deepEqual(notes(secondArchive), ['first', 'from-copy']);
    const paired = recoverSnapshot(firstArchive, `${firstArchive}-wal`);
    assert.deepEqual(notes(paired), ['first', walOnlyOrder]);
    r = run(restore, [paired]);
    assert.equal(r.status, 0, r.err);
    assert.deepEqual(notes(db), ['first', walOnlyOrder]);
    assert.deepEqual([existsSync(swapMarker), existsSync(hold)], [false, true]);
    rmSync(hold);

    // The first rollback returns the original main before its WAL. The interrupted retry parks only that main again.
    stageOriginal();
    r = run(restore, [poisoned], { ...fixedClock, FAKE_POWER_LOSS_AFTER_RESTORE_MAIN: '1' });
    assert.equal(r.signal, 'SIGKILL', r.err);
    assert.ok(existsSync(swapMarker) && existsSync(db) && !existsSync(`${db}-wal`));
    const [displaced] = displacedFiles();
    assert.ok(displaced && existsSync(`${displaced}-wal`));
    for (const service of ['wind-api', 'wind-backup.service']) {
      const boot = spawnSync(join(bin, 'systemctl'), ['start', service], { encoding: 'utf8', env: env({}) });
      assert.equal(boot.status, 1, boot.stderr);
      assert.equal(unit(service), 'inactive');
    }
    assert.ok(!existsSync(`${db}-wal`), 'boot did not create a competing WAL');
    r = run(restore, [poisoned], { ...fixedClock, FAKE_POWER_LOSS_AFTER_PARK_MAIN: '1' });
    assert.equal(r.signal, 'SIGKILL', r.err);
    const [displacedMain, displacedWalBase] = displacedFiles();
    assert.equal(displacedWalBase, displaced);
    assert.notEqual(displacedMain, displacedWalBase);
    assert.ok(!existsSync(db) && !existsSync(`${displacedMain}-wal`), 'the second interruption leaves the matching files under different names');
    assert.deepEqual(readFileSync(displacedMain), originalMain);
    assert.deepEqual(readFileSync(`${displacedWalBase}-wal`), originalWal);
    const recovered = recoverSnapshot(displacedMain, `${displacedWalBase}-wal`);
    assert.deepEqual(notes(recovered), ['first', walOnlyOrder]);
    r = run(restore, [poisoned]);
    assert.equal(r.status, 2, r.err);
    assert.match(r.err, /earlier database swap still needs recovery/);
    assert.deepEqual([existsSync(hold), existsSync(swapMarker), unit('wind-api'), unit('caddy')], [true, true, 'inactive', 'inactive']);
    r = run(restore, [recovered, '--open']);
    assert.equal(r.status, 0, r.err);
    assert.deepEqual(notes(db), ['first', walOnlyOrder]);
    assert.deepEqual([existsSync(hold), existsSync(swapMarker), unit('wind-api'), unit('caddy')], [true, false, 'active', 'inactive']);
    rmSync(hold);
  }
  // 12. Road routing: the container is reachable from this host only, read-only and unprivileged, on the same pinned image as
  //     the graph build; the API is pointed at it only once a graph exists; a re-run restarts it only when something changed.
  {
    const provision = readFileSync(new URL('../infra/vm-israel/provision.sh', import.meta.url), 'utf8');
    const build = readFileSync(new URL('../infra/osrm/build-west-bank.sh', import.meta.url), 'utf8');
    const exec = provision.match(/^ExecStart=\/usr\/bin\/docker run (.*)$/m)[1];
    assert.match(exec, /-p 127\.0\.0\.1:5000:5000 /, 'loopback only');
    assert.ok(!/ -P | --publish-all|--net(work)?[ =]host|-p (0\.0\.0\.0:)?5000/.test(` ${exec} `), 'never on a public interface or the host network');
    for (const flag of ['--read-only', '--user 65534:65534', '--cap-drop=ALL', '--security-opt no-new-privileges', '-v /srv/osrm/:/data:ro '])
      assert.ok(exec.includes(flag), flag);
    const image = exec.match(/(ghcr\.io\/project-osrm\/osrm-backend@sha256:[0-9a-f]{64})/)[1];
    assert.ok(build.includes(`image=${image} `), 'the graph and the server come from the same image');
    const corpus = build.match(/^docker run -d --rm --name osrm-corpus (.*)$/m)[1];
    const readable = build.indexOf(`find "$(realpath "$out")" -maxdepth 1 -type f -name 'region.osrm*' -exec chmod a+r {} +`);
    assert.ok(readable > build.indexOf('osrm-customize') && readable < build.indexOf('--name osrm-corpus'),
      'the graph is readable by the unprivileged server before the corpus runs');
    for (const flag of ['--read-only', '--user 65534:65534', '--cap-drop=ALL', '--memory=1g --memory-swap=1g', ':/data:ro"', '--max-table-size 100']) assert.ok(corpus.includes(flag), `corpus ${flag}`);
    assert.ok(provision.indexOf('# Road routing (SPEC-routing-eta.md)') > provision.indexOf('systemctl enable wind-api'), 'after every other step');
    assert.ok(provision.indexOf('apt-get install -y -q docker.io') > provision.indexOf('systemctl enable wind-api'), 'Docker is installed there too');
    assert.match(provision, /^OOMScoreAdjust=-500$/m);

    // The routing block itself, run against a scratch root with stub systemctl and docker.
    const block = provision.slice(provision.indexOf('OSRM_NEW=$(mktemp)'), provision.indexOf('\nfi\n', provision.indexOf('if [ -e /srv/osrm/BUILD-MANIFEST ]')) + 4);
    const r12 = mkdtempSync(join(root, 'osrm-')), b12 = join(r12, 'bin'), srv = join(r12, 'srv'), etc = join(r12, 'etc');
    for (const d of [b12, srv, join(etc, 'systemd', 'system')]) mkdirSync(d, { recursive: true });
    const log = join(r12, 'calls.log');
    writeFileSync(join(b12, 'systemctl'), `#!/bin/sh\necho "systemctl $*" >> "${log}"\ncase "$*" in "is-active --quiet wind-osrm") [ -e "${r12}/active" ] ;; "restart wind-osrm") [ -z "$FAIL_RESTART" ] && touch "${r12}/active" ;; *) exit 0 ;; esac\n`);
    // OSRM answers once the container runs, unless told it crashed after the fork; docker is present; no real sleeps.
    // OSRM needs a few tries after a start (a counter), like a graph loading.
    writeFileSync(join(b12, 'curl'), `#!/bin/sh\nn=$(cat "${r12}/tries" 2>/dev/null || echo 0); echo $((n + 1)) > "${r12}/tries"\n[ -e "${r12}/active" ] && [ -z "$OSRM_DEAD" ] && [ "$n" -ge 2 ]\n`);
    writeFileSync(join(b12, 'docker'), '#!/bin/sh\nexit 0\n'); writeFileSync(join(b12, 'sleep'), '#!/bin/sh\nexit 0\n');
    for (const f of ['systemctl', 'curl', 'docker', 'sleep']) chmodSync(join(b12, f), 0o755);
    const script = block.replaceAll('/etc/', `${etc}/`).replaceAll('/srv/osrm', `${srv}/osrm`);
    const runBlock = (extra = {}) => { rmSync(log, { force: true }); rmSync(join(r12, 'tries'), { force: true });
      const res = spawnSync('bash', ['-euo', 'pipefail', '-c', script], { encoding: 'utf8', env: { PATH: `${b12}:${process.env.PATH}`, ...extra } });
      return { status: res.status, err: res.stderr, calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [] }; };
    const envFile = join(etc, 'wind-api.env');
    writeFileSync(envFile, 'A=1'); // no final newline
    let o = runBlock();
    assert.equal(o.status, 0, o.err);
    assert.equal(readFileSync(envFile, 'utf8'), 'A=1', 'no graph: the API is not pointed at OSRM');
    assert.ok(!o.calls.some(c => /enable|restart/.test(c)), 'and nothing starts');
    assert.match(o.err, /no road graph/);
    mkdirSync(join(srv, 'osrm-1')); writeFileSync(join(srv, 'osrm-1', 'region.osrm.mldgr'), '');
    symlinkSync(join(srv, 'osrm-1'), join(srv, 'osrm'));
    o = runBlock();
    assert.ok(!o.calls.some(c => /enable|restart/.test(c)) && readFileSync(envFile, 'utf8') === 'A=1', 'an unfinished build (no manifest) is not served');
    unlinkSync(join(srv, 'osrm'));
    writeFileSync(join(srv, 'osrm-1', 'BUILD-MANIFEST'), 'built_at=1\n');
    symlinkSync(join(srv, 'osrm-1'), join(srv, 'osrm'));
    o = runBlock();
    assert.equal(o.status, 0, o.err);
    assert.equal(readFileSync(envFile, 'utf8'), 'A=1\nOSRM_URL=http://127.0.0.1:5000\n', 'a graph: OSRM_URL once, on its own line');
    assert.ok(o.calls.includes('systemctl restart wind-osrm'));
    assert.match(o.err, /OSRM_URL added: .*restart wind-api/, 'and the operator is told the API needs a restart');
    o = runBlock();
    assert.ok(!o.calls.includes('systemctl restart wind-osrm'), 'a re-run with nothing changed does not restart it');
    assert.equal(readFileSync(envFile, 'utf8').match(/OSRM_URL=/g).length, 1);
    // A unit that changed, and a container that is down, are restarted; one that crashed after the fork is not recorded as served.
    writeFileSync(join(etc, 'systemd', 'system', 'wind-osrm.service'), '[Unit]\nDescription=older\n');
    o = runBlock();
    assert.ok(o.calls.includes('systemctl restart wind-osrm'), 'a changed unit restarts it');
    rmSync(join(r12, 'active'));
    o = runBlock();
    assert.ok(o.calls.includes('systemctl reset-failed wind-osrm') && o.calls.includes('systemctl restart wind-osrm'), 'a stopped one is reset and started');
    const servedBefore = readFileSync(join(etc, 'wind-osrm.graph'), 'utf8');
    writeFileSync(join(srv, 'osrm-1', 'BUILD-MANIFEST'), 'built_at=2\n'); // rebuilt in place
    o = runBlock({ OSRM_DEAD: '1' });
    assert.ok(o.calls.includes('systemctl restart wind-osrm'), 'a rebuild into the same directory is picked up');
    assert.match(o.err, /not answering/);
    assert.equal(readFileSync(join(etc, 'wind-osrm.graph'), 'utf8'), servedBefore, 'a server that never answered is not recorded');
    o = runBlock();
    assert.ok(o.calls.includes('systemctl restart wind-osrm'), 'so the next run tries again');
    // Without Docker nothing is started and the operator is told why.
    rmSync(join(b12, 'docker'));
    // A PATH with only the tools the block uses (a host image may have Docker in /usr/bin, like this sandbox).
    const tools = join(r12, 'tools'); mkdirSync(tools);
    for (const tool of ['bash', 'mktemp', 'cat', 'cmp', 'install', 'rm', 'sha256sum', 'cut', 'grep', 'tail', 'readlink', 'seq', 'touch'])
      symlinkSync(spawnSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).stdout.trim(), join(tools, tool));
    o = runBlock({ PATH: `${b12}:${tools}` });
    assert.ok(!o.calls.includes('systemctl restart wind-osrm'));
    assert.match(o.err, /Docker is not installed/);
    writeFileSync(join(b12, 'docker'), '#!/bin/sh\nexit 0\n'); chmodSync(join(b12, 'docker'), 0o755);
    mkdirSync(join(srv, 'osrm-2')); writeFileSync(join(srv, 'osrm-2', 'region.osrm.mldgr'), ''); writeFileSync(join(srv, 'osrm-2', 'BUILD-MANIFEST'), 'built_at=3\n');
    unlinkSync(join(srv, 'osrm')); symlinkSync(join(srv, 'osrm-2'), join(srv, 'osrm')); // the link, not its target
    o = runBlock({ FAIL_RESTART: '1' });
    assert.equal(o.status, 0, 'a failed restart does not fail provisioning');
    assert.ok(o.calls.includes('systemctl restart wind-osrm'), 'a newly promoted graph is picked up');
    assert.match(o.err, /not answering/);
    o = runBlock();
    assert.ok(o.calls.includes('systemctl restart wind-osrm'), 'and tried again on the next run');

    // build-west-bank.sh refuses the live graph through its link, and any directory that already holds a graph, before any work.
    for (const [out, why, message] of [[join(srv, 'osrm'), 'the live link', /refusing to build into the live graph/],
      [join(srv, 'osrm-2'), 'the live target', /refusing to build into the live graph/], [join(srv, 'osrm-1'), 'a directory with a graph', /already holds a graph/]]) {
      const res = spawnSync('sh', [fileURLToPath(new URL('../infra/osrm/build-west-bank.sh', import.meta.url)), '/dev/null', out],
        { encoding: 'utf8', env: { PATH: `${b12}:${process.env.PATH}`, WIND_OSRM_LIVE: join(srv, 'osrm') } });
      assert.equal(res.status, 2, `${why}: ${res.stderr}`);
      assert.match(res.stderr, message, why);
    }
    // A failed extract download stops the build before any graph step (22 Nov: it went on to osmium with no extract).
    const fresh = join(srv, 'osrm-3');
    const res = spawnSync('sh', [fileURLToPath(new URL('../infra/osrm/build-west-bank.sh', import.meta.url)), '/dev/null', fresh],
      { encoding: 'utf8', env: { PATH: `${b12}:${process.env.PATH}`, WIND_OSRM_LIVE: join(srv, 'osrm'), OSRM_DEAD: '1' } }); // the stub curl fails
    assert.equal(res.status, 1, res.stderr);
    assert.match(res.stderr, /could not download .*pass a dated extract/);
    assert.ok(!existsSync(join(fresh, 'source.osm.pbf')));
  }
  console.log('israel-scripts: install, backup and restore failure paths passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
