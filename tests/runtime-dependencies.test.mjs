// The API must boot from its packaged files without finding dependencies in the developer checkout.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const built = spawnSync(process.execPath, ['scripts/runtime-dependencies.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true });
assert.equal(built.status, 0, built.stderr);
const isolated = mkdtempSync(join(tmpdir(), 'wind-packaged-api-'));
cpSync(join(root, '.expo/api-runtime/node_modules'), join(isolated, 'node_modules'), { recursive: true });
cpSync(join(root, 'server'), join(isolated, 'server'), { recursive: true });
cpSync(join(root, '.expo/api-runtime/src'), join(isolated, 'src'), { recursive: true });
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies.pg;
const env = { ...process.env, NODE_ENV: 'test', DB_PATH: join(isolated, 'synthetic.db') };
for (const key of ['DATABASE_URL', 'WIND_DATABASE_URL', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'WEB_ROOT', 'OSRM_URL']) delete env[key];
const boot = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning',
  '--input-type=module', '-e', `import pg from 'pg'; import { createRequire } from 'node:module';
    const require=createRequire(import.meta.url);
    if(require('pg/package.json').version!==${JSON.stringify(version)})throw new Error('Wrong pg version');
    if(typeof pg.Pool!=='function')throw new Error('Missing pg Pool');
    const {server,shutdown}=await import('./server/main.ts');
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/health');
      if(!r.ok||!(await r.json()).ok)throw new Error('Packaged API unhealthy');}
    finally{await shutdown();}`], { cwd: isolated, env, encoding: 'utf8', windowsHide: true, timeout: 20_000 });
assert.equal(boot.status, 0, boot.error?.message ?? boot.stderr);
console.log('Packaged API boots with locked pg dependencies outside the developer checkout');
