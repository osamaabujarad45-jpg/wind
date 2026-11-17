import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cashVarianceReasons, expectedCashMinor, isCashCollectionInput, validCashVariance } from '../src/cash-collection.ts';
import { parseMinorUnits } from '../src/model.ts';
import { newDriverCommand, readDriverCommand, driverCommandBody, resumeDriverCommand } from '../src/driver-command.ts';
import { readOrder } from '../src/wire-contracts.ts';

for (const [text, value] of [['0',0],['١٢٫٣٤',1234],['12,34',1234],['20.01',2001],['90071992547409.91',Number.MAX_SAFE_INTEGER],['1.001',null],['',null],['1e2',null],['90071992547409.92',null]])
  assert.equal(parseMinorUnits(text), value, text);
assert.equal(expectedCashMinor(20.01, 2.02), 1799);
for (const values of [[1.001,0],[20,-1],[1,2],[Infinity,0],[Number.MAX_SAFE_INTEGER,0]]) assert.equal(expectedCashMinor(...values), null);
for (const [expected, actual, accepted] of [[2000,2000,[]],[2000,0,['CUSTOMER_DID_NOT_PAY','APPROVED_DISCOUNT','RETURNED_ITEMS','INCORRECT_CASH','OTHER_ADMIN_REVIEW']],
  [2000,1000,['PARTIAL_PAYMENT','APPROVED_DISCOUNT','RETURNED_ITEMS','INCORRECT_CASH','OTHER_ADMIN_REVIEW']], [2000,2100,['INCORRECT_CASH','OTHER_ADMIN_REVIEW']], [0,0,[]]]) {
  assert.equal(validCashVariance(expected, actual, null), expected === actual);
  for (const reason of cashVarianceReasons) assert.equal(validCashVariance(expected, actual, reason), accepted.includes(reason), `${expected}/${actual}/${reason}`);
}
for (const value of [null,[],{}, {collectedMinor:'0'}, {collectedMinor:-1}, {collectedMinor:0.01}, {collectedMinor:Number.MAX_SAFE_INTEGER+1},
  {collectedMinor:0,varianceReason:'unknown'}, {collectedMinor:0,expectedMinor:2000}]) assert.equal(isCashCollectionInput(value), false);
const order = {id:5,driverId:9,customerId:1,service:'parcel',status:'in_transit',assignedAt:100,price:20,discount:2,
  pickupCity:'ramallah',dropoffCity:'nablus',createdAt:1,updatedAt:1,pickupNote:'Gate',dropoffNote:'Door',recovery:{schemaVersion:1,version:7,assignmentEpoch:2}};
const intent = {code:'1234',cashCollection:{collectedMinor:1000,varianceReason:'PARTIAL_PAYMENT'}};
const command = newDriverCommand(9,{...order,cashCollectionAllowed:true},'advance',intent,1000,60_000);
assert.deepEqual(readDriverCommand(JSON.parse(JSON.stringify(command))),command);
assert.deepEqual(driverCommandBody(command).cashCollection,intent.cashCollection);
const legacy = newDriverCommand(9,order,'advance',{code:'1234'},1000,60_000);
assert.equal('cashCollection' in driverCommandBody(readDriverCommand(structuredClone(legacy))),false,'old commands never invent an actual amount');
for (const patch of [{action:'exception'}, {expectedStatus:'at_pickup'}, {payload:{...intent,cashCollection:null}}, {payload:{...intent,cashCollection:{collectedMinor:0,unexpected:true}}}])
  assert.throws(()=>readDriverCommand({...command,...patch}),/invalid_pending_command/);
assert.throws(()=>newDriverCommand(9,{...order,service:'ride',cashCollectionAllowed:true},'advance',intent,1000,60_000),/invalid_cash_collection/);
assert.throws(()=>newDriverCommand(9,{...order,cashCollectionAllowed:false},'advance',intent,1000,60_000),/invalid_cash_collection/);
assert.deepEqual(readOrder({...order,cashCollectionAllowed:false}).cashCollectionAllowed,false);
assert.throws(()=>readOrder({...order,cashCollectionAllowed:'true'}),/invalid_response/);
assert.throws(()=>newDriverCommand(9,{...order,cashCollectionAllowed:true},'advance',{...intent,cashCollection:{collectedMinor:0,varianceReason:'PARTIAL_PAYMENT'}},1000,60_000),/invalid_cash_collection/);
let saved=structuredClone(command), sent=0;
const io={read:async()=>saved,write:async value=>{saved=value;},valid:()=>true,
  receipt:async c=>({schemaVersion:1,orderId:5,requestId:c.requestId,state:'unknown'}),
  send:async c=>{sent++;assert.deepEqual(c,command);throw new Error('lost_ack');}};
await assert.rejects(resumeDriverCommand(io,9,order),/lost_ack/);
assert.deepEqual(saved,command,'actual amount/reason/replay ID survive a lost acknowledgement');
io.send=async c=>{sent++;assert.deepEqual(c,command);return {...order,status:'completed'};};
assert.equal((await resumeDriverCommand(io,9,order)).state,'applied');assert.equal(sent,2);assert.equal(saved,null);
saved=structuredClone(command);io.receipt=async c=>({schemaVersion:1,orderId:5,requestId:c.requestId,state:'applied'});
assert.equal((await resumeDriverCommand(io,9,{...order,status:'completed'})).state,'applied');assert.equal(sent,2);
const fact={expectedMinor:1800,collectedMinor:1000,varianceReason:'PARTIAL_PAYMENT',actorId:9,requestId:command.requestId,collectedAt:2000};
assert.deepEqual(readOrder({...order,status:'completed',cashCollection:fact}).cashCollection,fact);
assert.equal(readOrder({...order,status:'completed'}).cashCollection,undefined);
for (const patch of [{expectedMinor:1900},{collectedMinor:-1},{varianceReason:null},{varianceReason:'CUSTOMER_DID_NOT_PAY'},{actorId:10},{requestId:'invalid'},{collectedAt:1.1}])
  assert.throws(()=>readOrder({...order,status:'completed',cashCollection:{...fact,...patch}}),/invalid_response/);
assert.throws(()=>readOrder({...order,cashCollection:fact}),/invalid_response/);
const screen=readFileSync(new URL('../src/app/order/[id].tsx',import.meta.url),'utf8');
assert.match(screen,/cashActualAmount/);assert.match(screen,/needsCash && !collectionValid/);assert.match(screen,/cashCollectionUnknown/);
const copy=readFileSync(new URL('../src/copy.ts',import.meta.url),'utf8');
for(const reason of cashVarianceReasons)assert.equal((copy.match(new RegExp(`cashReason_${reason}:`,'g'))??[]).length,2,'Arabic and English reason labels');
console.log('Door cash client: money precision, reason compatibility, strict pending/wire parsing, unknown history and frozen recovery covered');
