// The VM deploy runs the image by digest and refuses one built from another commit, so a moved tag cannot ship.
// Runs infra/vm/deploy.sh against stub docker/curl/sleep commands. Needs a POSIX sh: CI runs it, Windows skips it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (process.platform === 'win32') { console.log('deploy-script: skipped on Windows (no sh); CI runs it'); process.exit(0); }

const dir = mkdtempSync(join(tmpdir(), 'wind-deploy-'));
const log = join(dir, 'calls.log');
const stub = (name, body) => { writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`); chmodSync(join(dir, name), 0o755); };
stub('docker', `echo "docker $*" >> "$CALLS"
case "$1 $2" in
  "image inspect") case "$*" in *revision*) echo "$FAKE_REVISION" ;; *) echo sha256:pulled ;; esac ;;
  "inspect --format") echo "\${FAKE_RUNNING:-sha256:pulled}" ;;
  "inspect wind-api-pre-"*) exit "\${FAKE_OLD_EXISTS:-1}" ;;
  "rename wind-api") exit "\${FAKE_RENAME_STATUS:-0}" ;;
  "run -d") exit "\${FAKE_RUN_STATUS:-0}" ;;
esac`);
// Not ready for the first FAKE_NOT_READY tries; every try is counted.
stub('curl', 'n=$(($(cat "$CALLS.n" 2>/dev/null || echo 0) + 1)); echo "$n" > "$CALLS.n"; [ "$n" -gt "${FAKE_NOT_READY:-0}" ]');
stub('sleep', 'exit 0');
stub('backup', 'echo backup >> "$CALLS"');
const source = readFileSync(new URL('../infra/vm/deploy.sh', import.meta.url), 'utf8');
assert.equal(source.split('/srv/wind-backup.sh').length, 2, 'the script calls the backup exactly once');
writeFileSync(join(dir, 'deploy.sh'), source.replace('/srv/wind-backup.sh', join(dir, 'backup')));

const tag = '20261110-test', digest = `sha256:${'a'.repeat(64)}`, revision = 'b'.repeat(40);
const image = `windprodacr.azurecr.io/wind-api@${digest}`;
const deploy = (args, env = {}) => {
  rmSync(log, { force: true }); rmSync(`${log}.n`, { force: true });
  const run = spawnSync('sh', [join(dir, 'deploy.sh'), ...args], { encoding: 'utf8',
    env: { PATH: `${dir}:${process.env.PATH}`, CALLS: log, FAKE_REVISION: revision, ...env } });
  return { status: run.status, err: run.stderr, calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [],
    tries: existsSync(`${log}.n`) ? Number(readFileSync(`${log}.n`, 'utf8')) : 0 };
};

try {
  // The gated release: pulled and run by digest, never by tag, with the backup taken before the old container stops.
  let r = deploy([tag, digest, revision]);
  assert.equal(r.status, 0, r.err);
  assert.equal(r.calls[1], `docker pull ${image}`);
  assert.ok(r.calls.find(c => c.startsWith('docker run -d'))?.endsWith(` ${image}`), 'runs the digest');
  assert.ok(!r.calls.some(c => c.includes(`wind-api:${tag}`)), 'the tag is never pulled or run');
  assert.ok(r.calls.includes('backup') && r.calls.indexOf('backup') < r.calls.indexOf('docker stop wind-api'), 'backup before the switch');
  assert.ok(r.calls.includes(`docker rename wind-api wind-api-pre-${tag}`));

  // A tag moved to another build: the digest's revision is not the gated commit, and nothing on the VM is touched.
  r = deploy([tag, digest, revision], { FAKE_REVISION: 'c'.repeat(40) });
  assert.equal(r.status, 1);
  assert.match(r.err, /not deploying/);
  assert.ok(!r.calls.some(c => /backup|docker (stop|rename|run|rm)/.test(c)), `stopped before the switch: ${r.calls}`);
  r = deploy([tag, digest, revision], { FAKE_REVISION: '' });
  assert.equal(r.status, 1, 'an image with no revision label is refused');

  // The old tag-only call and malformed references fail before docker is asked anything.
  for (const args of [[tag], [tag, digest], [tag, tag, revision], [tag, `sha256:${'A'.repeat(64)}`, revision], [tag, `sha256:${'a'.repeat(63)}`, revision],
    [tag, digest, revision.slice(0, 7)], [tag, digest, `${revision}\n`], ['bad tag', digest, revision], [`${tag};id`, digest, revision]]) {
    r = deploy(args);
    assert.equal(r.status, 2, `refused: ${JSON.stringify(args)}`);
    assert.deepEqual(r.calls, []);
  }

  // A tag that already has a rollback container is refused before anything is pulled or stopped.
  r = deploy([tag, digest, revision], { FAKE_OLD_EXISTS: '0' });
  assert.equal(r.status, 2); assert.match(r.err, /already deployed/);
  assert.deepEqual(r.calls, [`docker inspect wind-api-pre-${tag}`]);
  // The old container stopped but could not be set aside: it is started again, and nothing new runs.
  r = deploy([tag, digest, revision], { FAKE_RENAME_STATUS: '1' });
  assert.equal(r.status, 1);
  assert.equal(r.calls.at(-1), 'docker start wind-api');
  assert.ok(!r.calls.some(c => c.startsWith('docker run')));

  // Going back: the new container is removed and the old one is renamed back and started.
  const wentBack = calls => { const tail = calls.slice(-3);
    assert.deepEqual(tail, ['docker rm -f wind-api', `docker rename wind-api-pre-${tag} wind-api`, 'docker start wind-api']); };
  r = deploy([tag, digest, revision], { FAKE_NOT_READY: '99' });
  assert.equal(r.status, 1); assert.match(r.err, /not ready/); wentBack(r.calls);
  assert.equal(r.tries, 30, 'it keeps asking before giving up');
  // A slow start is waited for, not rolled back.
  r = deploy([tag, digest, revision], { FAKE_NOT_READY: '2' });
  assert.equal(r.status, 0, r.err); assert.equal(r.tries, 3);
  assert.ok(!r.calls.includes('docker rm -f wind-api'));
  r = deploy([tag, digest, revision], { FAKE_RUN_STATUS: '125' });
  assert.equal(r.status, 1); assert.match(r.err, /did not start/); wentBack(r.calls);
  r = deploy([tag, digest, revision], { FAKE_RUNNING: 'sha256:other' });
  assert.equal(r.status, 1); assert.match(r.err, /running image is not/); wentBack(r.calls);
  console.log('deploy-script: ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
