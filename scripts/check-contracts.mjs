// Select the contract suites from the single registry in run-tests.mjs, never from a second list.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = spawnSync(process.execPath, [fileURLToPath(new URL('./run-tests.mjs', import.meta.url)), '--filter=contracts'],
  { stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
