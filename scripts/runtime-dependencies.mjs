// Copy the server's installed dependency closure from the frozen npm install, without the Expo toolchain.
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { copyRuntimeSources } from './runtime-sources.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, process.argv[2] ?? '.expo/api-runtime');
const outside = relative(root, output);
if (!outside || outside.startsWith('..') || isAbsolute(outside)) throw new Error('Runtime dependency output must be inside the workspace');
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
function dependency(parent, name, optional = false) {
  for (let at = parent; ; ) {
    const key = `${at ? `${at}/` : ''}node_modules/${name}`;
    if (lock.packages[key] && existsSync(join(root, key, 'package.json'))) return key;
    if (!at) { if (optional) return null; throw new Error(`Missing locked runtime dependency: ${name}`); }
    const index = at.lastIndexOf('/node_modules/');
    at = index < 0 ? '' : at.slice(0, index);
  }
}
const queue = [dependency('', 'pg')], seen = new Set();
while (queue.length) {
  const key = queue.shift();
  if (seen.has(key)) continue;
  seen.add(key);
  const entry = lock.packages[key];
  for (const name of Object.keys(entry.dependencies ?? {})) queue.push(dependency(key, name));
  for (const name of Object.keys(entry.optionalDependencies ?? {})) {
    const found = dependency(key, name, true);
    if (found) queue.push(found);
  }
  const source = join(root, key), destination = join(output, key);
  mkdirSync(resolve(destination, '..'), { recursive: true });
  cpSync(source, destination, { recursive: true,
    filter: path => !relative(source, path).split(sep).includes('node_modules') });
}
console.log(`Copied ${seen.size} locked server runtime packages to ${relative(root, output)}`);
console.log(`Copied ${copyRuntimeSources(root, output).length} shared runtime source files`);
