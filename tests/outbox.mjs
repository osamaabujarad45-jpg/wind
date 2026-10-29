import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { freshPostgres,connect } from './pg-support.mjs';
import { DurableWorker } from '../server/worker.ts';
import { enqueuePush } from '../server/domain/events.ts';
import { PUSH_KINDS } from '../server/domain/native-push.ts';

const booking=`INSERT INTO orders(customer_id,service,shared,pickup_city,dropoff_city,pickup_note,dropoff_note,contact,detail,option,loading_help,price,status,created_at,updated_at)
 VALUES(?,'parcel',0,'ramallah','nablus','PRIVATE_ADDRESS','PRIVATE_ADDRESS','0599800001','PRIVATE_DETAIL','small',0,20,'searching',?,?)`;
if (process.argv[2]==='child') {
  const db=connect(process.env.WP04_SCHEMA);
  const mode=process.env.WP04_MODE;
  try {
    if (mode==='writer') {
      const id=await db.atomic({id:Number(process.env.WP04_USER)},async()=>Number((await db.run(booking,Number(process.env.WP04_USER),Date.now(),Date.now())).lastInsertRowid));
      process.send({type:'committed',id});await new Promise(()=>{});
    } else {
      const worker=new DurableWorker(db,{leaseMs:500,baseBackoffMs:1,
        transport:async()=>{process.send({type:'published'});},
        ...(mode==='hold'?{afterPublish:async()=>new Promise(()=>{})}:{}),
      });
      let count=0;while(await worker.runOnce()) {count++;if(count>1000)throw new Error('unbounded backlog');}
      process.send({type:'drained',count});
    }
  }finally{await db.close();}
  if (process.connected)process.disconnect();
} else {
  const {schema,database:db}=await freshPostgres('outbox');
  const children=[];
  const spawn=mode=>{
    const child=fork(fileURLToPath(import.meta.url),['child'],{env:{...process.env,WP04_SCHEMA:schema,WP04_MODE:mode,WP04_USER:String(customer)},
      execArgv:['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON','--disable-warning=ExperimentalWarning'],stdio:['ignore','pipe','pipe','ipc']});
    const messages=[];child.on('message',m=>messages.push(m));let diagnostics='';child.stderr.on('data',b=>diagnostics+=b);
    const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
    const wait=async type=>{const deadline=Date.now()+15000;while(Date.now()<deadline){const m=messages.find(m=>m.type===type);if(m)return m;if(child.exitCode!==null||child.signalCode!==null)throw new Error(`child exited ${diagnostics}`);await delay(10);}throw new Error(`child timeout ${diagnostics}`);};
    const result={child,messages,exit,wait};children.push(result);return result;
  };
  const customer=Number((await db.run("INSERT INTO users(phone,name,password,role,status,created_at) VALUES('0599800001','Synthetic','','customer','active',?)",Date.now())).lastInsertRowid);
  const driver=Number((await db.run("INSERT INTO users(phone,name,password,role,status,vehicle,created_at) VALUES('0599800002','Synthetic','','driver','active','car',?)",Date.now())).lastInsertRowid);
  const endpoint='https://fcm.googleapis.com/synthetic-wp04';
  await db.run('INSERT INTO push_subscriptions(endpoint,user_id,p256dh,auth,created_at) VALUES(?,?,?,?,?)',endpoint,customer,'synthetic-key','synthetic-auth',Date.now());
  const drained=async(worker,maximum=1000)=>{let n=0;while(await worker.runOnce()){assert.ok(++n<maximum,'bounded drain');}return n;};
  let publications=0;
  const worker=new DurableWorker(db,{leaseMs:1000,baseBackoffMs:1,transport:async()=>{publications++;}});
  const notification=async(order,kind='message')=>{
    await db.atomic({id:customer},()=>enqueuePush(db,[customer],kind,order));
    return db.one("SELECT * FROM outbox WHERE destination LIKE 'webpush:%' AND status='pending' ORDER BY event_id DESC LIMIT 1");
  };
  try {
    // Kill the mutator immediately after DB commit, before any worker/publisher can run.
    const writer=spawn('writer');const {id:order}=await writer.wait('committed');writer.child.kill('SIGKILL');await writer.exit;
    assert.equal((await db.one('SELECT status FROM orders WHERE id=?',order)).status,'searching');
    assert.equal((await db.one('SELECT count(*) n FROM domain_events WHERE order_id=?',order)).n,1);
    assert.equal((await db.one("SELECT count(*) n FROM outbox WHERE status='pending'")).n,1);
    await drained(worker);
    assert.equal((await db.one('SELECT sequence FROM event_projection WHERE order_id=?',order)).sequence,1);
    // Kill after provider publication but before acknowledgment. Lease recovers; provider can see a duplicate.
    const row=await notification(order);
    const publisher=spawn('hold');await publisher.wait('published');publisher.child.kill('SIGKILL');await publisher.exit;
    assert.equal((await db.one('SELECT status FROM outbox WHERE event_id=?::uuid AND destination=?',row.event_id,row.destination)).status,'processing');
    await delay(550);await drained(worker);assert.equal(publications,1,'retry published once in parent, plus child publication');
    assert.equal((await db.one('SELECT attempts FROM outbox WHERE event_id=?::uuid AND destination=?',row.event_id,row.destination)).attempts,2);
    assert.equal((await db.one('SELECT count(*) n FROM consumer_inbox WHERE event_id=?::uuid AND destination=?',row.event_id,row.destination)).n,1);
    // A repeated event/destination is inbox-deduplicated before provider send.
    await db.run("UPDATE outbox SET status='pending',next_attempt_at=0 WHERE event_id=?::uuid AND destination=?",row.event_id,row.destination);
    await drained(worker);assert.equal(publications,1);
    // Consumer projection ignores older event sequences, even if a queue redelivers out of order.
    await db.atomic({purpose:'synthetic_reorder'},()=>db.run('UPDATE orders SET updated_at=? WHERE id=?',Date.now(),order));
    await drained(worker);const projected=await db.one('SELECT sequence FROM event_projection WHERE order_id=?',order);
    const oldest=await db.one('SELECT id FROM domain_events WHERE order_id=? ORDER BY sequence LIMIT 1',order);
    await db.run('DELETE FROM consumer_inbox WHERE event_id=?::uuid',oldest.id);
    await db.run("UPDATE outbox SET status='pending',next_attempt_at=0 WHERE event_id=?::uuid",oldest.id);
    await drained(worker);assert.deepEqual(await db.one('SELECT sequence FROM event_projection WHERE order_id=?',order),projected);
    // An expired claimant cannot acknowledge work leased to its replacement.
    await db.atomic({purpose:'synthetic_lease'},()=>db.run('UPDATE orders SET updated_at=? WHERE id=?',Date.now(),order));
    const slow=new DurableWorker(db,{leaseMs:40});const oldClaim=await slow.claim();assert.ok(oldClaim);
    await delay(60);const successor=await worker.claim();assert.equal(successor.event_id,oldClaim.event_id);
    assert.equal(await slow.finish(oldClaim,'delivered'),false,'fenced old lease cannot ack newer owner');
    assert.equal(await worker.finish(successor,'delivered'),true);
    await drained(worker);
    // Poison retries use fixed safe diagnostics and exhaust to an operator review queue.
    const poison=await notification(order);
    const failing=new DurableWorker(db,{maxAttempts:2,baseBackoffMs:1,transport:async()=>{throw new Error('PRIVATE_PROVIDER_TOKEN_AND_PHONE');}});
    await drained(failing);await delay(10);await drained(failing);
    const failed=await db.one('SELECT status,last_error,attempts FROM outbox WHERE event_id=?::uuid AND destination=?',poison.event_id,poison.destination);
    assert.deepEqual(failed,{status:'review',last_error:'delivery_failed',attempts:2});
    // Review is a stable dead letter state; restart doesn't spin or silently mark delivered.
    assert.equal(await worker.runOnce(),false);
    // Two independent worker processes claim a real backlog; each logical destination has one inbox receipt.
    for(let i=0;i<25;i++)await notification(order);
    const left=spawn('normal'),right=spawn('normal');await Promise.all([left.wait('drained'),right.wait('drained')]);await Promise.all([left.exit,right.exit]);
    assert.equal(left.messages.filter(m=>m.type==='published').length+right.messages.filter(m=>m.type==='published').length,25);
    assert.equal((await db.one("SELECT count(*) n FROM outbox WHERE status IN ('pending','processing')")).n,0);
    assert.equal((await db.one('SELECT count(*) n FROM (SELECT event_id,destination,count(*) FROM consumer_inbox GROUP BY event_id,destination HAVING count(*)>1) duplicates')).n,0);
    // Expired job/old assignment hints are obsolete; the worker never undoes a newer assignment.
    const late=await notification(order,'job');
    await db.atomic({id:driver},()=>db.run("UPDATE orders SET driver_id=?,status='assigned' WHERE id=?",driver,order));
    const authority=await db.one('SELECT driver_id,status,version,assignment_epoch FROM orders WHERE id=?',order);
    await drained(worker);assert.equal((await db.one('SELECT status FROM outbox WHERE event_id=?::uuid AND destination=?',late.event_id,late.destination)).status,'obsolete');
    assert.deepEqual(await db.one('SELECT driver_id,status,version,assignment_epoch FROM orders WHERE id=?',order),authority);
    const expired=await notification(order);
    // Alter only disposable fixture event time to simulate a long outage.
    await db.run('UPDATE domain_events SET occurred_at=? WHERE id=?::uuid',Date.now()-4_000_000,expired.event_id);
    await drained(worker);assert.equal((await db.one('SELECT status FROM outbox WHERE event_id=?::uuid AND destination=?',expired.event_id,expired.destination)).status,'obsolete');
    // Every kind the API may enqueue passes the worker's allow-list: an unknown kind would retry eight
    // times and park in review as attempts_exhausted, so delivery is the only acceptable end state here.
    for (const kind of PUSH_KINDS) {
      const row=await notification(0,kind);
      await drained(worker);
      const done=await db.one('SELECT status,last_error FROM outbox WHERE event_id=?::uuid AND destination=?',row.event_id,row.destination);
      assert.equal(done.status,'delivered',`${kind} ended as ${done.status}/${done.last_error}; the worker allow-list must contain every kind the API enqueues`);
    }
    // Graceful drain completes current work, then stops claiming with the persisted backlog intact.
    await notification(order);await notification(order);
    const abort=new AbortController();let sent=0;
    const draining=new DurableWorker(db,{transport:async()=>{sent++;abort.abort();}});await draining.run(abort.signal);assert.equal(sent,1);
    assert.ok((await db.one("SELECT count(*) n FROM outbox WHERE status='pending'")).n>0);await drained(worker);
    console.log('WP04 outbox: killed mutator after commit, publish-before-ack kill, two worker processes, expiry, dedupe/reorder, poison/review, backlog/restart, stale authority, graceful drain passed');
  }finally{for(const c of children){if(c.child.exitCode===null&&c.child.signalCode===null)c.child.kill('SIGKILL');await c.exit;}await db.close();}
}
