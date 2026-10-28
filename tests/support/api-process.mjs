// Isolated server-process harness used for persistence, recovery and cross-process command tests.
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (import.meta.main) {
  if (!process.send || process.env.NODE_ENV !== 'test') throw new Error('Test API requires its parent harness');
  const { server, shutdown } = await import('../../server/main.ts');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.send({ type: 'ready', port: server.address().port });
  let ending = false;
  process.on('message', async message => {
    if (message !== 'stop' || ending) return;
    ending = true;
    await shutdown();
    process.disconnect();
  });
}

export async function startApiProcess(storage) {
  if (!storage?.DB_PATH) throw new Error('Test API requires an explicit isolated database path');
  const env = { ...process.env };
  // Inherited credentials must never redirect a local test to a real database.
  for (const key of ['DATABASE_URL', 'WIND_DATABASE_URL', 'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSERVICE', 'PGSERVICEFILE', 'WIND_DISPATCH_TEST_ONLY']) delete env[key];
  // A phone fixture must explicitly supply its isolated provider settings, never inherit live SMS access.
  for (const key of Object.keys(env)) if (/^WIND_(?:PHONE|OOREDOO|OTP)/.test(key)) delete env[key];
  Object.assign(env, storage, { NODE_ENV: 'test', WIND_ENABLED_SERVICES: 'parcel,ride,freight', WIND_IDENTITY_MODE: 'operator-verified' });
  for (const key of ['OSRM_URL', 'WIND_EMAIL_FROM', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_EMAIL_TOKEN',
    'SOUQ_PARTNER_KEY', 'WEB_ROOT', 'EAS_BUILD', 'WIND_RELEASE', 'WIND_CONTACT_VERIFICATION_REQUIRED']) delete env[key];
  const child = fork(fileURLToPath(import.meta.url), [], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    execArgv: ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning'] });
  let diagnostics = '';
  const capture = chunk => { diagnostics = (diagnostics + chunk).slice(-12_000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  const closed = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  let timeout;
  try {
    const ready = await new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error(`Test API startup timed out: ${diagnostics}`)), 20_000);
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Test API exited (${code}): ${diagnostics}`)));
      child.on('message', message => { if (message?.type === 'ready') resolve(message); });
    });
    return { base: `http://127.0.0.1:${ready.port}/api`, child,
      async stop() {
        if (child.exitCode !== null || child.signalCode !== null) return closed;
        const force = setTimeout(() => child.kill('SIGKILL'), 12_000);
        try { if (child.connected) child.send('stop'); else child.kill(); return await closed; }
        finally { clearTimeout(force); }
      },
      diagnostics: () => diagnostics,
    };
  } catch (error) { child.kill('SIGKILL'); await closed; throw error; }
  finally { clearTimeout(timeout); }
}
