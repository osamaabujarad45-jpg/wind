import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApiProcess } from './support/api-process.mjs';
import { apiCaller } from './support/api.mjs';
const dir=await mkdtemp(join(tmpdir(),'wp15-sqlite-')), path=join(dir,'synthetic.sqlite');
const api=await startApiProcess({DB_PATH:path}), db=new DatabaseSync(path), call=apiCaller(()=>api.base);
const seed=(phone,role)=>{const salt=randomBytes(16).toString('hex');db.prepare('INSERT INTO users(phone,name,password,role,status,created_at) VALUES(?,?,?,?,?,?)').run(phone,'Synthetic',`${salt}:${scryptSync('Synthetic-password',salt,32).toString('hex')}`,role,'active',Date.now());};
try {
  seed('0599700091','customer'); seed('0599700092','admin');
  const customer=await call('/auth/login',{body:{phone:'0599700091',password:'Synthetic-password'}});
  const admin=await call('/auth/login',{body:{phone:'0599700092',password:'Synthetic-password'}});
  for (const [path,body] of [['/support/cases',{}],['/support/cases',null],['/support/cases/1/assign',{}],['/support/cases/1/escalate',{}],['/support/cases/1/resolve',{}],['/admin/staff/1/role',{}],['/admin/approvals',{}],['/admin/approvals/1/decide',{}],['/admin/staff-actions',null]]) {
    assert.equal((await call(path,{token:admin.token,...(body===null?{}:{body}),expect:409})).error,'ops_unavailable');
  }
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name IN ('support_cases','support_case_events','staff_actions','financial_approvals')").get().n,0);
  const order=await call('/orders',{token:customer.token,body:{service:'parcel',pickupCity:'ramallah',dropoffCity:'nablus',option:'small',shared:false,contact:'0599700091',detail:'Synthetic box',pickupNote:'Synthetic pickup',dropoffNote:'Synthetic dropoff'}});
  assert.ok(order.id); assert.equal(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name IN ('order_disputes','safety_incidents')").get().n,2);
  console.log('WP15 ops-sqlite: nine 409 gates, absent tables and legacy order flow passed');
} finally {db.close();await api.stop();}
