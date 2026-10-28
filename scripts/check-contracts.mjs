import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const test of ['contracts-money.test.mjs', 'contracts.test.mjs']) {
  const result = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning',
    fileURLToPath(new URL(`../tests/${test}`, import.meta.url))], { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
