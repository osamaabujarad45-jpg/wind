import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdirSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(path.join(root, '.expo', 'implementation'), { recursive: true });
const bicep = process.env.BICEP_COMMAND || 'az';
const prefix = bicep === 'az' ? ['bicep'] : [];

function run(args, label, env = process.env) {
  const result = spawnSync(bicep, args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' && !bicep.toLowerCase().endsWith('.exe'), env });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${label} failed (${result.status ?? result.signal ?? result.error?.message}).`);
  return result;
}

const version = run(bicep === 'az' ? ['bicep', 'version'] : ['--version'], 'Bicep version check');
if (!/0\.48\.1(?:\s|$)/m.test(version.stdout)) throw new Error(`Expected pinned Bicep CLI 0.48.1; received ${version.stdout.trim()}.`);
const mainFileArgs = bicep === 'az' ? ['--file', 'infra/main.bicep'] : ['infra/main.bicep'];
run([...prefix, 'build', ...mainFileArgs, '--outfile', '.expo/implementation/azure-main.json'], 'Bicep compile');
run([...prefix, 'lint', ...mainFileArgs], 'Bicep lint');
// Exercise secure-parameter syntax without reading or forwarding any operator secret.
const compileOnlyEnv = { ...process.env, FASTSHIP_PG_ADMIN_PASSWORD: 'IaC-compile-only-not-a-secret-009!' };
for (const file of readdirSync(path.join(root, 'infra', 'examples')).filter((name) => name.endsWith('.bicepparam'))) {
  run([...prefix, 'build-params', ...(bicep === 'az' ? ['--file', `infra/examples/${file}`] : [`infra/examples/${file}`]), '--outfile', `.expo/implementation/${basename(file, '.bicepparam')}.parameters.json`], `Parameter compile: ${file}`, compileOnlyEnv);
}
console.log('Azure IaC: Bicep compile, lint, and 3 parameter-file builds passed; artifacts are in ignored .expo/implementation/. No Azure login, what-if, or deployment was run.');
