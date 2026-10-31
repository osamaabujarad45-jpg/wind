// Disposable loopback-only PostgreSQL/PostGIS for implementation tests. Never opens a production database.
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const scratch = resolve(import.meta.dirname, '../.expo/implementation');
const data = join(scratch, 'pgdata');
const executable = name => `${name}${process.platform === 'win32' ? '.exe' : ''}`;
const bundled = join(scratch, 'postgresql18', 'bin');
const discovery = spawnSync(executable('pg_config'), ['--bindir'], { encoding: 'utf8', windowsHide: true });
const bin = process.env.WIND_TEST_PG_BIN || (existsSync(join(bundled, executable('pg_ctl'))) ? bundled : discovery.stdout?.trim());
if (!bin) throw new Error('PostgreSQL tools unavailable: set WIND_TEST_PG_BIN to a PostgreSQL/PostGIS bin directory.');
const action = process.argv[2] ?? 'start';
if (!['start', 'stop', 'status'].includes(action)) throw new Error('Usage: node scripts/local-postgres.mjs [start|stop|status]');
const port = 55473;
const user = 'fastship_test';
const database = 'fastship_test';
const connection = ['-h', '127.0.0.1', '-p', String(port), '-U', user];
function run(name, args, required = true) {
  // On Windows pg_ctl's detached server can retain a captured pipe and keep spawnSync waiting after startup.
  // File descriptors let the launcher exit while preserving diagnostics.
  const startsServer = name === 'pg_ctl' && args.includes('start');
  const outputPath = join(scratch, 'pg-launcher.log');
  const output = startsServer ? openSync(outputPath, 'w') : undefined;
  let result;
  try {
    result = spawnSync(join(bin, executable(name)), args, { encoding: 'utf8', windowsHide: true, timeout: 330_000,
      ...(output !== undefined && { stdio: ['ignore', output, output] }) });
  } finally { if (output !== undefined) closeSync(output); }
  if (startsServer) result.stdout = readFileSync(outputPath, 'utf8');
  if (required && (result.error || result.status !== 0)) throw new Error(`${name} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  return result;
}
const initialized = existsSync(join(data, 'PG_VERSION'));
const running = initialized && run('pg_ctl', ['-D', data, 'status'], false).status === 0;
if (action === 'status') {
  console.log(running ? `Isolated PostgreSQL running on 127.0.0.1:${port}` : 'Isolated PostgreSQL stopped');
  process.exit(running ? 0 : 1);
}
// -w returns as soon as the server is ready/stopped; 300 s covers a slow disk's shutdown checkpoint or crash
// recovery (a 15 s stop timed out on k5, the session then killed the server mid-checkpoint, and every later start
// needed recovery longer than 15 s).
if (action === 'stop') {
  if (running) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '300', 'stop']);
  console.log('Isolated PostgreSQL stopped; test data retained.');
  process.exit(0);
}
mkdirSync(scratch, { recursive: true });
if (!initialized) run('initdb', ['-D', data, '-U', user, '--auth=trust', '--encoding=UTF8', '--locale=C']);
if (!running) run('pg_ctl', ['-D', data, '-l', join(scratch, 'postgresql-test.log'), '-o', `-p ${port} -h 127.0.0.1 -c timezone=UTC`, '-w', '-t', '300', 'start']);
const found = run('psql', [...connection, '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', "SELECT 1 FROM pg_database WHERE datname='fastship_test'"]).stdout.trim();
if (found !== '1') run('createdb', [...connection, database]);
const version = run('psql', [...connection, '-d', database, '-At', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE EXTENSION IF NOT EXISTS postgis; SELECT postgis_version();']).stdout.trim();
console.log(`PostGIS verified: ${version}`);
console.log(`WIND_TEST_DATABASE_URL=postgresql://${user}@127.0.0.1:${port}/${database}`);
console.log('Synthetic tests only. No production data or credentials; listener restricted to loopback.');
