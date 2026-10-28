import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync,readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { fixture } from './phone-identity-support.mjs';
import { startApiProcess } from './support/api-process.mjs';
import { apiCaller } from './support/api.mjs';
const f=await fixture('phone_authority');
const {db,call,customer,state}=f;
const deferred=()=>{let release;const wait=new Promise(resolve=>release=resolve);return {wait,release};};
try {
  await f.map(customer);
  const oauth=deferred();state.tokensPaused=oauth.wait;
  const awaiting=await f.issue();await f.waitFor(()=>state.tokenCalls>0,'OAuth started');
  await call('/auth/logout',{token:customer.token,body:{}});oauth.release();state.tokensPaused=null;
  await f.waitFor(async()=>(await db.one('SELECT delivery_state FROM phone_challenges WHERE id=?::uuid',awaiting.challengeId)).delivery_state==='obsolete','logout obsoletes pending proof');
  assert.equal(state.messages.length,0,'logout while OAuth waits prevents SMS call');assert.equal((await db.one('SELECT reserved_messages FROM phone_provider_budget')).reserved_messages,0,'definite no-send releases reservation once');
  const changedRole=await f.account();await f.map(changedRole);const hold=deferred();state.modes.set('+970'+changedRole.phone.slice(1),{wait:hold.wait});
  const active=await f.issue(changedRole,{client:f.other});await f.waitFor(()=>state.messages.some(m=>m.transactionId===active.challengeId),'SMS in flight');
  await db.run("UPDATE users SET role='driver',vehicle='car' WHERE id=?",changedRole.user.id);hold.release();const roleSms=await f.delivered(active);
  assert.equal((await db.one('SELECT delivery_state FROM phone_challenges WHERE id=?::uuid',active.challengeId)).delivery_state,'obsolete');await f.prove(changedRole,active,{code:roleSms.code,expect:400});
  const changedPhone=await f.account();await f.map(changedPhone);const paused=deferred();state.modes.set('+970'+changedPhone.phone.slice(1),{wait:paused.wait});
  const phonePending=await f.issue(changedPhone);await f.waitFor(()=>state.messages.some(m=>m.transactionId===phonePending.challengeId),'phone SMS in flight');
  await db.run('UPDATE users SET phone=? WHERE id=?','0568800999',changedPhone.user.id);paused.release();const priorSms=await f.delivered(phonePending);await f.prove(changedPhone,phonePending,{code:priorSms.code,expect:400});
  const unknown=await f.account();await f.map(unknown);state.modes.set('+970'+unknown.phone.slice(1),{unknown:true});
  const commandId=randomUUID(),uncertain=await f.issue(unknown,{commandId}),unknownSms=await f.delivered(uncertain);
  assert.equal((await db.one('SELECT delivery_state FROM phone_challenges WHERE id=?::uuid',uncertain.challengeId)).delivery_state,'unknown');
  const count=state.messages.length,replay=await f.issue(unknown,{commandId});assert.equal(replay.deliveryState,'unknown');assert.equal(state.messages.length,count,'unknown send not blindly replayed');
  assert.equal((await db.one('SELECT budget_released FROM phone_challenges WHERE id=?::uuid',uncertain.challengeId)).budget_released,0);
  await f.prove(unknown,uncertain,{code:unknownSms.code});
  // A later challenge invalidates an older code even when the older provider response arrives last.
  const reordered=await f.account();await f.map(reordered);const delayed=deferred();state.modes.set('+970'+reordered.phone.slice(1),{wait:delayed.wait});
  const older=await f.issue(reordered);await f.waitFor(()=>state.messages.some(m=>m.transactionId===older.challengeId));
  await db.run('UPDATE phone_challenges SET resend_at=? WHERE id=?::uuid',Date.now()-1,older.challengeId);state.modes.delete('+970'+reordered.phone.slice(1));
  const newer=await f.issue(reordered),newSms=await f.delivered(newer);delayed.release();const oldSms=await f.delivered(older);
  await f.prove(reordered,older,{code:oldSms.code,expect:400});await f.prove(reordered,newer,{code:newSms.code});
  const late=await f.account();await f.map(late);const delayedResult=deferred();state.modes.set('+970'+late.phone.slice(1),{wait:delayedResult.wait});
  const leased=await f.issue(late);await f.waitFor(()=>state.messages.some(m=>m.transactionId===leased.challengeId),'delayed local provider');
  const activeLease=await db.one('SELECT send_lease_until FROM phone_challenges WHERE id=?::uuid',leased.challengeId);
  assert.ok(activeLease.send_lease_until>Date.now()+20000,'in-flight provider gets a 30s lease');
  await db.run('UPDATE phone_challenges SET send_lease_until=? WHERE id=?::uuid',Date.now()-1,leased.challengeId);
  await call('/admin/phone/review',{token:f.admin.token});
  assert.equal((await db.one('SELECT delivery_state FROM phone_challenges WHERE id=?::uuid',leased.challengeId)).delivery_state,'unknown');
  delayedResult.release();await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal((await db.one('SELECT delivery_state FROM phone_challenges WHERE id=?::uuid',leased.challengeId)).delivery_state,'unknown','late provider callback cannot replace reconciled outcome');
  const events=JSON.stringify(await db.all("SELECT payload FROM domain_events WHERE type='phone.identity'"));
  for(const value of [f.secret,'SYNTHETIC_OAUTH_SECRET',customer.phone,...state.messages.map(m=>m.phone),...state.messages.map(m=>m.code)])assert.equal(events.includes(value),false,'public journal excludes phone/code/secret');
  const logs=f.a.diagnostics()+f.b.diagnostics();for(const secret of [f.secret,'SYNTHETIC_OAUTH_SECRET',...state.messages.map(m=>m.code)])assert.equal(logs.includes(secret),false);
  const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(dir,entry.name)):[join(dir,entry.name)]);
  for(const file of walk(fileURLToPath(new URL('../src',import.meta.url))))if(/\.(?:ts|tsx|js|mjs)$/.test(file)) {
    const source=readFileSync(file,'utf8');
    assert.doesNotMatch(source,/WIND_PHONE_HMAC_KEY|WIND_OOREDOO_CLIENT_SECRET/,'phone secrets excluded from client source');
    const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    const visit=node=>{
      const specifier=(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))?node.moduleSpecifier:
        ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression)&&node.expression.text==='require'))?node.arguments[0]:undefined;
      if(specifier && ts.isStringLiteralLike(specifier))assert.doesNotMatch(specifier.text,/server[\\/]domain[\\/]phone-/,'server phone implementation excluded from client imports');
      ts.forEachChild(node,visit);
    };
    visit(tree);
  }
  console.log('WP06 authority: logout during OAuth/no-send budget release, role/phone changes during SMS, unknown outcome/no resend, late out-of-order proof, phone/code/secret journal/log/client exclusion passed');
}finally{state.tokensPaused=null;for(const mode of state.modes.values())mode.release?.();await f.close();}

// Separate fresh API guarantees no cached OAuth token for the prepared-before-send crash.
const crash=await fixture('phone_crash');let extra;
try {
  await crash.map(crash.customer);const paused=deferred();crash.state.tokensPaused=paused.wait;
  const commandId=randomUUID(),pending=await crash.issue(crash.customer,{commandId});await crash.waitFor(()=>crash.state.tokenCalls>0);
  assert.equal((await crash.db.one('SELECT delivery_state FROM phone_challenges WHERE id=?::uuid',pending.challengeId)).delivery_state,'prepared');
  crash.a.child.kill('SIGKILL');await crash.a.stop();paused.release();crash.state.tokensPaused=null;
  await crash.db.run('UPDATE phone_challenges SET send_lease_until=? WHERE id=?::uuid',Date.now()-1,pending.challengeId);
  extra=await startApiProcess(crash.storage);const invoke=apiCaller(()=>extra.base);
  assert.equal((await crash.db.one('SELECT delivery_state FROM phone_challenges WHERE id=?::uuid',pending.challengeId)).delivery_state,'unknown','restart durably reconciles stale prepared receipt');
  const replay=await crash.issue(crash.customer,{commandId,client:invoke});assert.equal(replay.deliveryState,'unknown');assert.equal(crash.state.messages.length,0);
  assert.equal((await crash.db.one('SELECT reserved_messages FROM phone_provider_budget')).reserved_messages,1);
  assert.equal((await crash.db.one('SELECT count(*) n FROM phone_challenges WHERE id=?::uuid',pending.challengeId)).n,1);
  console.log('WP06 crash: killed API after prepared/before SMS, restart explicitunknown, one retained budget reservation, replay never resends or claims accepted passed');
}finally{await extra?.stop();await crash.close();}
