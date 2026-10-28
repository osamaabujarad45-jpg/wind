import assert from 'node:assert/strict';
import { evaluateRoutingEvidence } from '../server/domain/routing-policy.ts';

const revisions = { graph: 'g1', profile: 'car1', restriction: 'r1', provider: 'p1' };
const good = { revisions, provider: 'complete', graph: 'complete', restrictions: 'complete', crossings: [] };
assert.deepEqual(evaluateRoutingEvidence(good), { feasibility: 'feasible', reasons: [], revisions });
for (const source of ['provider', 'graph', 'restrictions']) for (const quality of ['missing', 'stale', 'conflicting']) {
  assert.equal(evaluateRoutingEvidence({ ...good, [source]: quality }).feasibility, 'uncertain');
}
for (const key of Object.keys(revisions)) {
  assert.equal(evaluateRoutingEvidence({ ...good, revisions: { ...revisions, [key]: null } }).feasibility, 'uncertain');
}
const closure = { restrictionId: 'closure-1', direction: 'crossed', applicability: 'applies', status: 'closed', confirmedProhibition: true };
const blocked = evaluateRoutingEvidence({ ...good, restrictions: 'stale', crossings: [closure] });
assert.equal(blocked.feasibility, 'infeasible');
assert.deepEqual(blocked.reasons, ['prohibited:closure-1']);
assert.deepEqual(blocked.revisions, revisions);
assert.notEqual(blocked.revisions, revisions);
assert.equal(evaluateRoutingEvidence({ ...good, crossings: [{ ...closure, direction: 'not_crossed' }] }).feasibility, 'feasible');
assert.equal(evaluateRoutingEvidence({ ...good, crossings: [{ ...closure, applicability: 'does_not_apply' }] }).feasibility, 'feasible');
for (const change of [{ direction: 'unknown' }, { applicability: 'unknown' }, { status: 'unknown' }, { confirmedProhibition: false }]) {
  assert.equal(evaluateRoutingEvidence({ ...good, crossings: [{ ...closure, ...change }] }).feasibility, 'uncertain');
}
assert.equal(evaluateRoutingEvidence({ ...good, crossings: [{ ...closure, status: 'restricted' }] }).feasibility, 'infeasible');
for (const crossing of [null, { ...closure, direction:'invalid' }, { ...closure, status:'invalid' },
  { ...closure, applicability:'invalid' }, { ...closure, confirmedProhibition:'yes' }, { ...closure, restrictionId:'' }]) {
  assert.equal(evaluateRoutingEvidence({ ...good, crossings:[crossing] }).feasibility, 'uncertain', 'invalid runtime evidence fails closed');
}
assert.equal(evaluateRoutingEvidence(null).feasibility,'uncertain');
assert.equal(evaluateRoutingEvidence({...good,revisions:{...revisions,graph:17}}).feasibility,'uncertain');
assert.equal(evaluateRoutingEvidence({...good,crossings:[{...closure,status:'open'}]}).feasibility,'uncertain','contradictory evidence is not clearance');
console.log('routing policy tests passed');
