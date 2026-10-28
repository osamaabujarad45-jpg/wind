import assert from 'node:assert/strict';
import { acquireActiveGps } from '../src/active-gps-session.ts';
import { deliverDriverFix } from '../src/location-delivery.ts';

let candidate = null, valid = true, token = 'token', requests = [], lost = true;
const assignments = [{orderId: 3, assignmentEpoch: 8}, {orderId: 4, assignmentEpoch: 2}];
const io = { token: async () => token, valid: () => valid, uuid: () => 'candidate', deviceId: async () => 'device',
  readCandidate: async () => candidate, writeCandidate: async value => { candidate = value; },
  request: async (_token, body) => {
    requests.push(body);
    if (!body.sessionId) return {sessionId:null, generation:7};
    if (lost) { lost=false; throw Error('lost ACK'); }
    return {sessionId:'candidate', generation:8, seq:2, assignments};
  } };
await assert.rejects(acquireActiveGps(2,[4,3],io), /lost ACK/);
const result = await acquireActiveGps(2,[3,4],io);
assert.deepEqual(requests[1], requests[2], 'restart retries identical persisted acquisition command');
assert.deepEqual(result.assignments, assignments);
assert.equal(result.seq, 2);
assert.equal(candidate, null, 'validated success clears the persisted candidate so the next start inspects fresh');
let generation = 8, uuidCalls = 0;
io.uuid = () => `candidate-${++uuidCalls}`;
io.request = async (_token, body) => {
  requests.push(body);
  if (!body.sessionId) return {sessionId:'candidate-1', generation};
  generation++;
  return {sessionId:body.sessionId, generation, seq:0, assignments};
};
const second = await acquireActiveGps(2,[3,4],io);
assert.ok(second, 'second foreground start reacquires instead of replaying the spent command');
assert.equal(second.sessionId, 'candidate-1');
assert.equal(uuidCalls, 1, 'reacquisition inspects fresh and mints a new session candidate');
valid=false;
assert.equal(await acquireActiveGps(2,[3,4],io), null, 'background cannot acquire');
valid=true;
io.request = async (_token, body) => { if (body.sessionId) { valid=false; return {sessionId:'candidate',generation:8,seq:2,assignments}; } return {sessionId:null,generation:7}; };
assert.equal(await acquireActiveGps(2,[3,4],io), null, 'delayed response after lifecycle change is discarded');
valid=true; token='different';
io.request = async (_token, body) => body.sessionId ? {sessionId:'candidate',generation:8,seq:0,assignments:[assignments[0]]} : {sessionId:null,generation:7};
assert.equal(await acquireActiveGps(2,[3,4],io), null, 'incomplete assignment snapshot is rejected');

let context = {id:'one',token:'t',actor:2,orderId:3,activeGps:result}, receipt=null, seq=2, posts=[], stops=[];
const delivery = {context:async()=>context, token:async()=> 't', receipt:async()=>receipt, acknowledge:async value=>{receipt=value;},
  reserve:async()=>({...result,seq:++seq}), post:async (_token,body)=>{posts.push(body);return {status:200,accepted:false};},
  stop:async id=>{stops.push(id);context=null;}};
const now=Date.now(), fix={timestamp:now,coords:{latitude:32,longitude:35}};
await Promise.all([deliverDriverFix(fix,delivery,now),deliverDriverFix(fix,delivery,now)]);
assert.equal(posts.length,1); assert.equal(posts[0].activeGps.seq,3);
assert.deepEqual(stops,['one']); assert.equal(receipt.lastSentAt,0, 'rejection cannot report sharing');
console.log('PASS active GPS foreground acquisition, lost ACK, assignments and callback fencing');
