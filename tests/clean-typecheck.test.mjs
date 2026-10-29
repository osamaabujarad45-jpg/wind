import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

// CI has no ignored expo-env.d.ts or generated route types. Check that exact
// boundary even after Metro has generated them on a developer's machine.
const root = resolve(import.meta.dirname, '..');
mkdirSync(join(root, '.expo'), { recursive: true });
const directory = mkdtempSync(join(root, '.expo', 'clean-typecheck-'));
const require = createRequire(import.meta.url);
try {
  const config = join(directory, 'tsconfig.json');
  writeFileSync(config, JSON.stringify({
    extends: join(root, 'tsconfig.json'),
    exclude: ['node_modules', '.expo', '.artifacts', 'android', 'ios', 'server', 'expo-env.d.ts'].map(name => join(root, name)),
  }));
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '--project', config], {
    cwd: root, stdio: 'inherit', timeout: 60_000, windowsHide: true,
  });
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '--project', join(root, 'tsconfig.server.json')], {
    cwd: root, stdio: 'inherit', timeout: 60_000, windowsHide: true,
  });
  console.log('Clean-checkout typecheck passed without generated Expo declarations');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
