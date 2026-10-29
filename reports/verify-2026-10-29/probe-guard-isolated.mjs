// Extracts the deployment guard's module-collection loop verbatim from
// tests/deployment.test.mjs and runs it against the real tree, then against a
// tree where a server/domain file imports an uncopied src module — to answer one
// question: does the guard ever look inside server/domain/*.ts?
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = rel => readFileSync(resolve(root, rel), 'utf8');
const runtime = read('Dockerfile').split(/^FROM /m).at(-1);

function collect(readFn) {
  const needed = new Set();
  const queue = readdirSync(resolve(root, 'server')).filter(f => f.endsWith('.ts')).map(f => `server/${f}`);
  const visited = [];
  while (queue.length) {
    const file = queue.pop();
    visited.push(file);
    const base = file.slice(0, file.lastIndexOf('/') + 1);
    for (const [, spec] of readFn(file).matchAll(/from '(\.{1,2}\/[^']+\.ts)'/g)) {
      const target = new URL(spec, new URL(base, `file:///${root.replace(/\\/g, '/')}/`)).pathname
        .slice(new URL(`file:///${root.replace(/\\/g, '/')}/`).pathname.length);
      if (target.startsWith('src/') && !needed.has(target)) { needed.add(target); queue.push(target); }
    }
  }
  return { needed, visited };
}

const real = collect(read);
console.log('=== against the real tree ===');
console.log('files visited:', real.visited.length, '| server/domain visited:', real.visited.filter(f => f.startsWith('server/domain/')).length);
console.log('src files the guard collected:', [...real.needed]);

// Simulate: server/domain/foo.ts imports src/copy.ts (a real file Dockerfile does NOT copy).
const fake = file => file === 'server/domain/statistics.ts'
  ? read(file) + `\nimport { latinDigits } from '../../src/copy.ts';\n`
  : read(file);
const sim = collect(fake);
const sawCopy = sim.needed.has('src/copy.ts');
console.log('\n=== simulated: server/domain/statistics.ts imports src/copy.ts ===');
console.log('guard collected src/copy.ts:', sawCopy);
console.log('server/domain visited:', sim.visited.filter(f => f.startsWith('server/domain/')).length);
console.log('runtime stage copies src/copy.ts:', runtime.includes('COPY src/copy.ts') || /^COPY src \.\/src$/m.test(runtime));

const conclusion = !sawCopy
  ? 'CONFIRMED: the guard never recurses into server/domain/*.ts, so a nested import of an uncopied src module is invisible to it.'
  : 'REFUTED: the guard does reach server/domain and would catch it.';
console.log('\n' + conclusion);
