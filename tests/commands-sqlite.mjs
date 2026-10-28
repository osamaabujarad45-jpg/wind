import assert from 'node:assert/strict';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApiProcess } from './support/api-process.mjs';
import { apiCaller } from './support/api.mjs';
const dir=await mkdtemp(join(tmpdir(),'wp04-sqlite-')),path=join(dir,'synthetic.sqlite');
const api=await startApiProcess({DB_PATH:path});const db=new DatabaseSync(path);
const call=apiCaller(()=>api.base);
try {
  const protocol=(await call('/health?protocol=1')).protocol;
  assert.equal(protocol.durableEvents,false);assert.equal(protocol.durableCommands,false);
  const id=Number(db.prepare("INSERT INTO users(phone,name,password,role,status,created_at) VALUES('0599700001','Synthetic','','customer','active',?)").run(Date.now()).lastInsertRowid);
  const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions(token_hash,user_id,created_at) VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Date.now());
  const input={service:'parcel',pickupCity:'ramallah',dropoffCity:'nablus',option:'small',shared:false,contact:'0599700001',detail:'Synthetic box',pickupNote:'Synthetic start',dropoffNote:'Synthetic end',quotedPrice:20};
  assert.equal((await call('/orders',{token,body:{commandId:randomUUID(),payload:input},expect:409})).error,'durable_protocol_unavailable');
  const requestId=randomUUID();const order=await call('/orders',{token,body:{...input,requestId}});
  assert.equal((await call('/orders',{token,body:{...input,requestId}})).id,order.id);
  await call(`/orders/${order.id}?protocol=1`,{token,expect:409});
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name IN ('domain_events','outbox','command_results')").get().n,0,'no false SQLite durability claim');
  console.log('WP04 SQLite: explicit unavailable durable protocol, unchanged installed requestId replay and no fabricated outbox passed');
}finally{db.close();await api.stop();}
