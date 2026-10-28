import assert from 'node:assert/strict';
import { idleCreditSeconds, rankCandidates, rankScore } from '../server/domain/dispatch.ts';

assert.equal(idleCreditSeconds(0), 0);
assert.equal(idleCreditSeconds(99), 9);
assert.equal(idleCreditSeconds(100), 10);
assert.equal(idleCreditSeconds(600), 60);
assert.equal(idleCreditSeconds(60_000), 60, 'idle credit is capped at 60 seconds');
assert.equal(rankScore(300, 0), 300);
assert.equal(rankScore(300, 599), 241);
assert.equal(rankScore(300, 600), 240);
assert.equal(rankScore(30, 3600), -30, 'credit may make the score negative; ordering is what matters');

const ranked = rankCandidates([
  { driverId: 9, pickupEtaSeconds: 200, idleSeconds: 0, rating: 1 },
  { driverId: 3, pickupEtaSeconds: 260, idleSeconds: 600, rating: 5 },
  { driverId: 7, pickupEtaSeconds: 200, idleSeconds: 0, rating: 5 },
  { driverId: 5, pickupEtaSeconds: 190, idleSeconds: 0 },
]);
assert.deepEqual(ranked.map(r => r.driverId), [5, 3, 7, 9],
  'ETA minus capped idle credit, stable driver-id tiebreak; a perfect rating never outranks a better score');
assert.equal(ranked[1].rankScore, ranked[2].rankScore);
assert.ok(ranked[1].driverId < ranked[2].driverId, 'equal scores tie-break on the smaller stable driver id');
assert.equal(ranked.find(r => r.driverId === 3).rankScore, 200, 'idle credit is exactly the capped 60 seconds');
console.log('WP10 dispatch-ranking: formula, 60s idle cap, stable tiebreak, rating excluded passed');
