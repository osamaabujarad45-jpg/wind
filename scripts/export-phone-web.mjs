// Public tracking/help pages for the USB phone sandbox; never bundle a role's test credentials here.
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const env = { ...process.env, WIND_LOCAL_TEST: '1', EXPO_PUBLIC_API_URL: 'http://127.0.0.1:4191' };
for (const key of ['WIND_TEST_ROLE', 'WIND_TEST_IDENTIFIER', 'WIND_TEST_PASSWORD', 'EAS_BUILD', 'WIND_RELEASE', 'NODE_ENV']) delete env[key];
const result = spawnSync(process.execPath, [join(root, 'node_modules/expo/bin/cli'), 'export', '--platform', 'web', '--clear',
  '--output-dir', join(root, '.expo/phone-qa/web')], { cwd: root, env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
