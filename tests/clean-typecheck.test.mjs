import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';

// CI has no ignored expo-env.d.ts or generated route types. Check that exact
// boundary even after Metro has generated them on a developer's machine.
const root = resolve(import.meta.dirname, '..');
mkdirSync(join(root, '.expo'), { recursive: true });
const directory = mkdtempSync(join(root, '.expo', 'clean-typecheck-'));
const require = createRequire(import.meta.url);
try {
  const ts = require('typescript');
  const config = join(directory, 'tsconfig.json');
  writeFileSync(config, JSON.stringify({
    extends: join(root, 'tsconfig.json'),
    exclude: ['node_modules', '.expo', '.artifacts', 'android', 'ios', 'server', 'expo-env.d.ts', 'research_notes', '.scratch', 'dist', 'vendor'].map(name => join(root, name)),
  }));
  const generatedTypes = join(root, '.expo', 'types');
  mkdirSync(generatedTypes, { recursive: true });
  const probe = join(generatedTypes, `${basename(directory)}.d.ts`);
  writeFileSync(probe, 'export {};\n', { flag: 'wx' });
  try {
    const files = path => ts.getParsedCommandLineOfConfigFile(path, {}, {
      ...ts.sys, onUnRecoverableConfigFileDiagnostic: diagnostic => { throw new Error(String(diagnostic.messageText)); },
    }).fileNames;
    const hasProbe = path => files(path).some(file => resolve(file) === probe);
    assert.ok(hasProbe(join(root, 'tsconfig.json')), 'Normal app typecheck includes the generated Expo Router declarations');
    assert.equal(hasProbe(config), false, 'Clean-checkout typecheck excludes generated declarations');
  } finally { unlinkSync(probe); }
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
