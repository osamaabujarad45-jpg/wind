import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../',import.meta.url);
const declarations = source => [...source.matchAll(/^\s*route\(\s*'([A-Z]+)'\s*,\s*'([^']+)'/gm)]
  .map(match => `${match[1]} ${match[2]}`);

// Installed fixtures stay frozen. Additive modules have their own explicit inventory/boundaries.
export async function checkRouteInventory(installed,call) {
  const main=readFileSync(new URL('server/main.ts',root),'utf8');
  assert.deepEqual(declarations(main),installed.endpoints.map(e=>`${e.method} ${e.path}`),
    'Installed routes changed; review compatibility without rerecording the baseline');
  const additions=JSON.parse(readFileSync(new URL('docs/implementation/contracts/additive-endpoints.json',root),'utf8'));
  const all=declarations(main);
  for (const module of additions.modules) {
    assert.match(main,new RegExp(`\\b${module.registrar}\\(route\\s*,`),'Additive route module is registered');
    const actual=declarations(readFileSync(new URL(module.source,root),'utf8'));
    assert.deepEqual(actual,module.endpoints.map(e=>`${e.method} ${e.path}`),'Additive route inventory drift');
    all.push(...actual);
    for (const endpoint of module.endpoints) {
      await call(endpoint.path.replace(/^\/api/,'').replace(/:\w+/g,'999999999'),{
        method:endpoint.method,...(['POST','PATCH'].includes(endpoint.method)?{body:{}}:{}),expect:endpoint.anonymousStatus,
      });
    }
  }
  assert.equal(new Set(all).size,all.length,'No duplicate registered API boundaries');
  return all.length-installed.endpoints.length;
}
