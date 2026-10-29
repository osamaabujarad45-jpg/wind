import assert from 'node:assert/strict';
import { randomUUID,createECDH } from 'node:crypto';
import { freshPostgres,selectRuntime,connect } from './pg-support.mjs';
import { apiCaller } from './support/api.mjs';
import { DurableWorker } from '../server/worker.ts';
import { enqueuePush } from '../server/domain/events.ts';
process.env.WIND_PUSH_SUBJECT = 'mailto:wind-push-suite@example.invalid'; // T37: the worker refuses an unconfigured VAPID subject
const {schema,database:db}=await freshPostgres('events');selectRuntime(schema);
process.env.WIND_ENABLED_SERVICES='parcel,ride,freight';delete process.env.WIND_IDENTITY_MODE;delete process.env.WIND_EMAIL_FROM;delete process.env.OSRM_URL;
const {server,shutdown,promote,alertReleasedJobs}=await import('../server/main.ts');
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const realFetch=globalThis.fetch;const call=apiCaller(()=>`http://127.0.0.1:${server.address().port}/api`,realFetch);
const input={service:'parcel',pickupCity:'ramallah',dropoffCity:'nablus',option:'small',shared:false,contact:'0599700002',detail:'Synthetic box',pickupNote:'Synthetic start',dropoffNote:'Synthetic end',quotedPrice:20};
const failureTrigger=async(kind)=>db.run(`CREATE OR REPLACE FUNCTION fail_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.type='notification.requested' AND NEW.payload->>'kind'='${kind}' THEN RAISE EXCEPTION 'PRIVATE_SENTINEL'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER fail_notification BEFORE INSERT ON domain_events FOR EACH ROW EXECUTE FUNCTION fail_notification()`);
const clearFailure=()=>db.run('DROP TRIGGER fail_notification ON domain_events');
try {
  const reg=(n,extra={})=>call('/auth/register',{body:{phone:`059970000${n}`,name:'Synthetic',password:'synthetic-secret',...extra}});
  const admin=await reg(1);await promote(admin.user.phone);const customer=await reg(2);
  const drivers=[await reg(3,{role:'driver',vehicle:'car'}),await reg(4,{role:'driver',vehicle:'car'})];
  for(const d of drivers)await call(`/admin/users/${d.user.id}/approve`,{token:admin.token,body:{}});
  const ecdh=createECDH('prime256v1');ecdh.generateKeys();const keys={p256dh:ecdh.getPublicKey().toString('base64url'),auth:Buffer.alloc(16,7).toString('base64url')};
  for(const account of [admin,customer,...drivers])await call('/push/subscribe',{token:account.token,body:{endpoint:`https://fcm.googleapis.com/synthetic/${account.user.id}`,...keys}});
  const book=extra=>call('/orders',{token:customer.token,body:{...input,requestId:randomUUID(),...extra}});
  const accept=(order,driver=drivers[0])=>call(`/jobs/${order.id}/accept`,{token:driver.token,body:{}});
  let order=await accept(await book());
  const before=await db.one('SELECT status,driver_id,version FROM orders WHERE id=?',order.id);
  const count=await db.one('SELECT count(*) n FROM domain_events');
  // This notification is scheduled AFTER the old handler's COMMIT. Its failure must still roll everything back.
  await failureTrigger('released');await call(`/orders/${order.id}/release`,{token:drivers[0].token,body:{},expect:500});
  assert.deepEqual(await db.one('SELECT status,driver_id,version FROM orders WHERE id=?',order.id),before);
  assert.deepEqual(await db.one('SELECT count(*) n FROM domain_events'),count);await clearFailure();
  await call(`/orders/${order.id}/release`,{token:drivers[0].token,body:{}});
  assert.equal((await db.one('SELECT status FROM orders WHERE id=?',order.id)).status,'searching');
  await accept(order,drivers[1]);
  await failureTrigger('released');await call(`/admin/users/${drivers[1].user.id}`,{token:admin.token,method:'PATCH',body:{status:'blocked',recovery:'return'},expect:500});
  assert.equal((await db.one('SELECT status FROM users WHERE id=?',drivers[1].user.id)).status,'active');
  assert.equal((await db.one('SELECT driver_id FROM orders WHERE id=?',order.id)).driver_id,drivers[1].user.id);await clearFailure();
  await call(`/admin/users/${drivers[1].user.id}`,{token:admin.token,method:'PATCH',body:{status:'blocked',recovery:'return'}});
  assert.equal((await db.one('SELECT status FROM orders WHERE id=?',order.id)).status,'searching');
  // Cron notification failure also rolls back the release marker; a restart can retry it.
  const scheduled=await book({scheduledFor:Date.now()+40*60_000});
  await failureTrigger('job');await assert.rejects(()=>alertReleasedJobs(Date.now()+11*60_000));
  assert.equal((await db.one('SELECT job_alerted_at FROM orders WHERE id=?',scheduled.id)).job_alerted_at,null);await clearFailure();
  await alertReleasedJobs(Date.now()+11*60_000);assert.ok((await db.one('SELECT job_alerted_at FROM orders WHERE id=?',scheduled.id)).job_alerted_at);
  const purpose=await db.one("SELECT payload FROM domain_events WHERE order_id=? AND type='notification.requested' ORDER BY sequence DESC LIMIT 1",scheduled.id);
  assert.equal(purpose.payload.systemPurpose,'scheduled_job_release');
  // Cash adjustment state + journal + notification + saved command are one commit, replay once.
  const cashBody={commandId:randomUUID(),payload:{driverId:drivers[0].user.id,amountCents:1000,currency:'ILS',reason:'Synthetic exact ILS adjustment'}};
  const cash=await call('/admin/cash/adjustment',{token:admin.token,body:cashBody});
  assert.deepEqual(await call('/admin/cash/adjustment',{token:admin.token,body:cashBody}),cash);
  assert.equal((await db.one("SELECT count(*) n FROM domain_events WHERE type='cash.changed' AND (payload->>'entryId')::bigint=?",cash.id)).n,1);
  // Concurrent owned scopes never exchange transaction-local actors; rollback cannot leak actor metadata.
  const second=connect(schema);
  await Promise.all([db,second].map((connection,i)=>connection.atomic({id:[customer.user.id,drivers[0].user.id][i]},async()=>{
    await connection.one('SELECT append_domain_event(NULL,?,?::jsonb)',`actor.test.${i}`,'{}');
  })));
  assert.equal((await db.one("SELECT actor_id FROM domain_events WHERE type='actor.test.0'")).actor_id,customer.user.id);
  assert.equal((await db.one("SELECT actor_id FROM domain_events WHERE type='actor.test.1'")).actor_id,drivers[0].user.id);
  await assert.rejects(()=>db.atomic({id:admin.user.id},async()=>{await db.one("SELECT append_domain_event(NULL,'actor.rolled_back','{}'::jsonb)");throw new Error('synthetic');}));
  assert.equal((await db.one("SELECT count(*) n FROM domain_events WHERE type='actor.rolled_back'")).n,0);
  await db.run("SELECT append_domain_event(NULL,'actor.system','{}'::jsonb)");
  const system=await db.one("SELECT actor_id,payload FROM domain_events WHERE type='actor.system'");assert.equal(system.actor_id,null);assert.equal(system.payload.systemPurpose,'database_maintenance');await second.close();
  // Actual Web Push encryption/HTTP adapter with local fetch doubles: no external provider calls.
  assert.equal((await db.one('SELECT count(*) n FROM push_keys')).n,0,
    'installed subscription fixture has not fetched /push/key');
  // Isolate delivery fixtures from earlier legitimate backlog without pretending it delivered.
  await db.run("UPDATE outbox SET status='review',last_error='synthetic_fixture_isolation' WHERE status='pending'");
  let status=503,requests=0;
  globalThis.fetch=async(url,init)=>{assert.ok(String(url).startsWith('https://fcm.googleapis.com/'));assert.equal(init.method,'POST');assert.ok(init.body.length>30);requests++;return new Response(null,{status});};
  const notification=async()=>{
    await db.atomic({id:customer.user.id},()=>enqueuePush(db,[customer.user.id],'message',order.id));
    return db.one("SELECT * FROM outbox WHERE destination LIKE 'webpush:%' AND status='pending' LIMIT 1");
  };
  const worker=new DurableWorker(db,{maxAttempts:1,baseBackoffMs:1});
  const drain=async()=>{while(await worker.runOnce()){};};
  let row=await notification();await drain();
  const persistedKey=(await db.one('SELECT private_jwk FROM push_keys WHERE id=1')).private_jwk;
  assert.equal(JSON.parse(persistedKey).crv,'P-256','delivery initializes the persisted VAPID key');
  assert.deepEqual(await db.one('SELECT status,last_error FROM outbox WHERE event_id=?::uuid AND destination=?',row.event_id,row.destination),{status:'review',last_error:'provider_http_503'});
  status=410;row=await notification();await drain();
  assert.deepEqual(await db.one('SELECT status,last_error FROM outbox WHERE event_id=?::uuid AND destination=?',row.event_id,row.destination),{status:'obsolete',last_error:'provider_http_410'});
  assert.equal((await db.one('SELECT count(*) n FROM push_subscriptions WHERE user_id=?',customer.user.id)).n,0);assert.equal(requests,2);
  await call('/push/subscribe',{token:customer.token,body:{endpoint:`https://fcm.googleapis.com/synthetic/${customer.user.id}`,...keys}});
  status=201;row=await notification();await drain();
  assert.equal((await db.one('SELECT status FROM outbox WHERE event_id=?::uuid AND destination=?',row.event_id,row.destination)).status,'delivered');
  assert.equal(requests,3);
  assert.equal((await db.one('SELECT private_jwk FROM push_keys WHERE id=1')).private_jwk,persistedKey,
    'provider retry and later delivery keep the same shared key');
  // A browser switching accounts invalidates the old queued destination before delivery.
  row=await notification();
  await call('/push/subscribe',{token:admin.token,body:{endpoint:`https://fcm.googleapis.com/synthetic/${customer.user.id}`,...keys}});
  await drain();assert.equal(requests,3);
  assert.equal((await db.one('SELECT status FROM outbox WHERE event_id=?::uuid AND destination=?',row.event_id,row.destination)).status,'obsolete');
  await call('/push/subscribe',{token:customer.token,body:{endpoint:`https://fcm.googleapis.com/synthetic/${customer.user.id}`,...keys}});
  row=await notification();await call('/auth/logout',{token:customer.token,body:{}});await drain();assert.equal(requests,3);
  assert.equal((await db.one('SELECT status FROM outbox WHERE event_id=?::uuid AND destination=?',row.event_id,row.destination)).status,'obsolete');
  // A structurally poisoned destination is isolated to review without blocking healthy work.
  const poisonEvent=await db.one("SELECT id FROM domain_events WHERE type='notification.requested' LIMIT 1");
  await db.run("INSERT INTO outbox(event_id,destination) VALUES(?::uuid,'invalid_destination')",poisonEvent.id);
  await drain();assert.equal((await db.one("SELECT status FROM outbox WHERE destination='invalid_destination'")).status,'review');
  console.log('WP04 events: after-legacy-COMMIT release/admin/cron failure atomicity, cash replay, actor isolation/rollback, actual WebPush success/503 review/410 invalidation, logout/account-switch revocation, poisoned row passed');
}finally{globalThis.fetch=realFetch;await shutdown();await db.close();}
