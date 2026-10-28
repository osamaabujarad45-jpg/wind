import assert from 'node:assert/strict';
import { requestBackgroundTracking } from '../src/background-permission.ts';
let calls=[];
const io={foreground:async()=>{calls.push('foreground');return true;},current:async()=>{calls.push('current');return {granted:false};},
  request:async()=>{calls.push('request');return {granted:true};},provider:async()=>{calls.push('provider');return {locationServicesEnabled:true,backgroundModeEnabled:true};}};
assert.equal(await requestBackgroundTracking(io),true);assert.deepEqual(calls,['foreground','current','request','provider']);
calls=[];assert.equal(await requestBackgroundTracking({...io,foreground:async()=>false}),false);assert.deepEqual(calls,[],'background permission is never requested without foreground authority');
calls=[];assert.equal(await requestBackgroundTracking({...io,request:async()=>{calls.push('request');return {granted:false};}}),false);assert.deepEqual(calls,['foreground','current','request']);
calls=[];assert.equal(await requestBackgroundTracking({...io,current:async()=>({granted:true}),provider:async()=>({locationServicesEnabled:true,backgroundModeEnabled:false})}),false,'permission alone never claims background availability');
console.log('Background permission: explicit foreground prerequisite, denial and provider status passed');
