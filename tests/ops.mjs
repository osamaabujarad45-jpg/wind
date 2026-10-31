import assert from 'node:assert/strict';
import { fixture } from './eligibility-support.mjs';
import { NON_LEGACY_TABLES } from '../server/migrate.ts';
import { Ledger } from '../server/domain/ledger.ts';
import { Payments, FakePaymentsProvider } from '../server/domain/payments.ts';
const f = await fixture('ops');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
try {
  assert.equal((await f.db.one('SELECT version FROM schema_migrations WHERE version=18')).version,18);
  assert.equal((await f.db.one('SELECT staff_role FROM users WHERE id=?',f.admin.user.id)).staff_role,null);
  for (const table of ['support_cases','support_case_events','staff_actions','financial_approvals']) assert.ok(NON_LEGACY_TABLES.has(table));
  const support=await f.account('admin'), safety=await f.account('admin'), finance=await f.account('admin'), other=await f.account();
  const grant=async (u,role,token=f.admin.token,expect=200)=>f.call(`/admin/staff/${u.user.id}/role`,{token,body:{staffRole:role,purpose:'role assignment'},expect});
  await grant(support,'support'); await grant(safety,'safety'); await grant(finance,'finance');
  await grant(finance,'safety',support.token,403); await grant(other,'support',f.admin.token,400);
  const order=await f.book();
  await f.call('/support/cases',{token:other.token,body:{orderId:order.id,category:'help',severity:'normal'},expect:403});
  await f.call('/support/cases',{token:f.customer.token,body:{orderId:999999999,category:'help',severity:'normal'},expect:404});
  const normal=await f.call('/support/cases',{token:f.customer.token,body:{category:'help',severity:'normal'}});
  const urgent=await f.call('/support/cases',{token:other.token,body:{category:'urgent',severity:'urgent'}});
  const secure=await f.call('/support/cases',{token:other.token,body:{category:'safety',severity:'safety'}});
  assert.deepEqual((await f.call('/support/cases',{token:f.customer.token})).map(x=>x.id),[normal.id]);
  assert.deepEqual((await f.call('/support/cases',{token:safety.token})).map(x=>x.id),[secure.id]);
  assert.equal((await f.call('/support/cases',{token:support.token})).length,3);
  assert.equal((await f.call(`/support/cases/${normal.id}/assign`,{token:support.token,body:{ownerId:support.user.id},expect:400})).error,'purpose_required');
  await f.call(`/support/cases/${secure.id}/assign`,{token:support.token,body:{ownerId:safety.user.id,purpose:'case assignment'},expect:403});
  await f.call(`/support/cases/${normal.id}/assign`,{token:safety.token,body:{ownerId:safety.user.id,purpose:'case assignment'},expect:403});
  await f.call(`/support/cases/${normal.id}/assign`,{token:support.token,body:{ownerId:support.user.id,purpose:'case assignment'}});
  await f.call(`/support/cases/${normal.id}/escalate`,{token:support.token,body:{reason:'requires review',purpose:'case escalation'}});
  assert.equal((await f.db.one("SELECT count(*) AS n FROM support_case_events WHERE case_id=? AND action='escalate'",normal.id)).n,1);
  assert.equal((await f.db.one("SELECT count(*) AS n FROM staff_actions WHERE target_id=? AND action='escalate'",String(normal.id))).n,1);
  await assert.rejects(f.db.run('DELETE FROM support_case_events WHERE case_id=?',normal.id));
  await assert.rejects(f.db.run('DELETE FROM staff_actions WHERE target_id=?',String(normal.id)));
  await f.call(`/support/cases/${normal.id}/resolve`,{token:support.token,body:{purpose:'case resolution'}});
  await f.call('/admin/approvals',{token:support.token,body:{subjectType:'refund',subjectId:'test',amountMinor:100,reason:'review requested'},expect:403});
  const approval=await f.call('/admin/approvals',{token:finance.token,body:{subjectType:'refund',subjectId:'test',amountMinor:100,reason:'review requested'}});
  assert.equal((await f.call(`/admin/approvals/${approval.id}/decide`,{token:finance.token,body:{decision:'approved',purpose:'review decision'},expect:409})).error,'second_approver_required');
  assert.equal((await f.call(`/admin/approvals/${approval.id}/decide`,{token:f.admin.token,body:{decision:'approved',purpose:'review decision'}})).status,'approved');
  await f.call('/admin/staff-actions',{token:support.token,expect:403});
  assert.ok((await f.call('/admin/staff-actions',{token:f.admin.token})).length>=6);
  const ledger=new Ledger(f.db,fail); await ledger.importLegacy({...f.admin.user,status:'active'});
  await assert.rejects(ledger.importLegacy({...support.user,status:'active'}),e=>e.status===403);
  const payments=new Payments(f.db,fail,new FakePaymentsProvider());
  await assert.rejects(payments.refund({...support.user,status:'active'},'00000000-0000-0000-0000-000000000000',100,'test reason'),e=>e.status===403);
  await assert.rejects(payments.refund({...f.admin.user,status:'active'},'00000000-0000-0000-0000-000000000000',100,'test reason'),e=>e.status===404);
  await grant(support,null);
  assert.ok((await f.call('/admin/staff-actions',{token:support.token})).length>=6, 'role removal restores the legacy platform-admin fallback');
  // T24: two eligible second approvers race one decision — exactly one lands, the loser finds the row
  // no longer pending. The requester is barred by the self-approval guard either way.
  await grant(support, 'finance');
  const race = await f.call('/admin/approvals', { token: finance.token, body: { subjectType: 'cash_adjustment', subjectId: '7', amountMinor: 500, reason: 'Race fixture' } });
  const [approved, rejectedAgain] = await Promise.all([
    f.call(`/admin/approvals/${race.id}/decide`, { token: f.admin.token, body: { decision: 'approved', purpose: 'Race decision' } }).then(() => 'decided', e => e.message),
    f.call(`/admin/approvals/${race.id}/decide`, { token: support.token, body: { decision: 'rejected', purpose: 'Race decision' } }).then(() => 'decided', e => e.message),
  ]);
  assert.equal((approved === 'decided') !== (rejectedAgain === 'decided'), true, `exactly one decision lands: ${approved} / ${rejectedAgain}`);
  assert.ok(approved.includes('approval_decided') || rejectedAgain.includes('approval_decided'), `the loser names the single-outcome code: ${approved.slice(0, 60)} / ${rejectedAgain.slice(0, 60)}`);
  await grant(support, 'support');
  assert.ok(urgent.id); console.log('WP15 ops: migration, scoping, audit, roles, approvals and finance checks passed');
} finally { await f.close(); }
