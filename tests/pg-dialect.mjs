// Exercise dialect-sensitive statements through real HTTP, with unchanged installed-client shapes.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { freshPostgres, selectRuntime } from './pg-support.mjs';
import { apiCaller } from './support/api.mjs';
import { cashOwed } from '../server/domain/money.ts';
const pg=await freshPostgres('dialect');await pg.database.close();selectRuntime(pg.schema);
process.env.WIND_ENABLED_SERVICES='parcel,ride,freight';
delete process.env.WIND_EMAIL_FROM;delete process.env.OSRM_URL;
const {server,persistence,promote,shutdown}=await import('../server/main.ts');
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const call=apiCaller(()=>`http://127.0.0.1:${server.address().port}/api`);
const register=(n,extra={})=>call('/auth/register',{body:{phone:`059980000${n}`,name:`Synthetic ${n}`,password:'synthetic-secret',...extra}});
try{
  assert.equal(cashOwed(Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,1,0),1);
  assert.throws(()=>cashOwed(Number.MAX_SAFE_INTEGER,0,1,0),/safe-integer/);
  assert.deepEqual(await persistence.one('SELECT 1 numberValue, (SELECT 2) nestedValue, 3 AS explicitValue'),{numberValue:1,nestedValue:2,explicitValue:3});
  const admin=await register(1);await promote(admin.user.phone);
  const customer=await register(2,{email:'Case@wp03.example'});
  await call('/me/email',{token:customer.token,body:{email:'Case@wp03.example'}});
  const friend=await register(3);
  const driver=await register(4,{role:'driver',vehicle:'car'});
  const switcher=await register(5,{role:'driver',vehicle:'car'});
  for(const actor of [driver,switcher])await call(`/admin/users/${actor.user.id}/approve`,{token:admin.token,body:{}});
  assert.equal((await call('/auth/login',{body:{identifier:'CASE@wp03.example',password:'synthetic-secret'}})).user.id,customer.user.id);
  // A NULL parameter has an explicit PostgreSQL type; the repeated role parameter is separately inferred.
  const all=await call('/admin/users',{token:admin.token});assert.equal(all.length,5);
  const drivers=await call('/admin/users?role=driver',{token:admin.token});assert.equal(drivers.length,2);
  assert.ok(drivers.every(u=>u.role==='driver'));
  assert.deepEqual((await call('/admin/users?q=synthetic%202',{token:admin.token})).map(u=>u.id),[customer.user.id],'name search preserves SQLite case-insensitive matching');
  assert.deepEqual(await call('/admin/users?q=synthetic%5C%202',{token:admin.token}),[],'backslash stays literal as in SQLite LIKE');
  await call('/me/places',{token:customer.token,body:{label:'home',city:'ramallah',note:'Synthetic first home'}});
  const places=await call('/me/places',{token:customer.token,body:{label:'home',city:'bireh',note:'Synthetic replacement home'}});
  assert.equal(places.saved.filter(p=>p.label==='home').length,1,'nullable IS NOT parameter preserves only the replacement place');
  const subscription=await call('/subscriptions',{token:switcher.token,body:{}});
  assert.equal(subscription.subscription.status,'pending');
  const pending=await call('/admin/subscriptions',{token:admin.token});
  const sub=pending.find(s=>s.userId===switcher.user.id);
  await call(`/admin/subscriptions/${sub.id}`,{token:admin.token,body:{action:'activate'}});
  const before=await persistence.one('SELECT ends_at FROM subscriptions WHERE id=?',sub.id);
  await call(`/admin/users/${switcher.user.id}`,{token:admin.token,method:'PATCH',body:{role:'customer'}});
  const after=await persistence.one('SELECT ends_at FROM subscriptions WHERE id=?',sub.id);
  assert.ok(after.ends_at<before.ends_at,'scalar MIN(ends_at,?) translates to LEAST, not aggregate MIN');
  // Referral credit aliases retain their exact camelCase spelling through the driver completion workflow.
  const invite=await call('/me/referral',{token:customer.token});
  const input={service:'parcel',pickupCity:'ramallah',dropoffCity:'nablus',option:'small',shared:false,pickupNote:'تجربة',dropoffNote:'اختبار',contact:friend.user.phone,detail:'Synthetic box',quotedPrice:20};
  let order=await call('/orders',{token:friend.token,body:{...input,promoCode:invite.code,expectedDiscount:10,requestId:randomUUID()}});
  const code=order.handoverCode;
  order=await call(`/jobs/${order.id}/accept`,{token:driver.token,body:{}});
  for(let i=0;i<3;i++)order=await call(`/orders/${order.id}/advance`,{token:driver.token,body:{expectedStatus:order.status,requestId:randomUUID(),code}});
  const credit=await call('/me/referral',{token:customer.token});
  assert.equal(credit.credits.length,1);assert.equal(typeof credit.credits[0].expiresAt,'number');
  assert.ok(!Object.hasOwn(credit.credits[0],'expiresat'));
  const cash=await call('/driver/cash',{token:driver.token});
  for(const key of ['owedCents','pendingCents','commissionCents','discountsCents','remittedCents','adjustmentsCents'])assert.equal(typeof cash[key],'number');
  assert.equal(cash.commissionCents,300);assert.equal(cash.discountsCents,1000);
  const row=await persistence.one('SELECT version,assignment_epoch,currency,price_minor,commission_minor,discount_minor FROM orders WHERE id=?',order.id);
  assert.ok(row.version>=5);assert.equal(row.assignment_epoch,1);assert.equal(row.currency,'ILS');
  assert.deepEqual([row.price_minor,row.commission_minor,row.discount_minor],[2000,300,1000]);
  const stats=await call('/admin/stats',{token:admin.token});assert.equal(typeof stats.gmv,'number');
  assert.equal(stats.daily.length,14);
  const gone=await register(9);const countedBefore=(await call('/admin/stats',{token:admin.token})).users.customer;
  await call('/me/delete',{token:gone.token,body:{password:'synthetic-secret'}});
  assert.equal((await call('/admin/stats',{token:admin.token})).users.customer,countedBefore-1,'PostgreSQL stops counting a deleted account');
  for (const [number, change] of [[6, 'password'], [7, 'session']]) {
    const target = await register(number);
    const original = persistence.atomic;
    let intercepted = false;
    persistence.atomic = async function(actor, work) {
      if (actor.id === target.user.id && !intercepted) {
        intercepted = true;
        if (change === 'password') await persistence.run('UPDATE users SET password=? WHERE id=?', 'changed', target.user.id);
        else await persistence.run('DELETE FROM sessions WHERE user_id=?', target.user.id);
      }
      return original.call(this, actor, work);
    };
    try {
      await call('/me/delete', { token: target.token, body: { password: 'synthetic-secret' }, expect: 401 });
      assert.equal(intercepted, true);
      assert.equal((await persistence.one('SELECT status FROM users WHERE id=?', target.user.id)).status, 'active', `${change} change prevents PostgreSQL deletion`);
    } finally { persistence.atomic = original; }
  }
  assert.equal(stats.daily.at(-1).commission,stats.commission,'PostgreSQL groups today’s completed order');
  assert.equal(stats.daily.at(-1).subscriptions,stats.subscriptions,'PostgreSQL groups today’s activated subscription');
  const credential=await persistence.one('SELECT password FROM users WHERE id=?',customer.user.id);
  await persistence.run(`CREATE FUNCTION fail_reset_revoke() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF OLD.user_id=${customer.user.id} THEN RAISE EXCEPTION 'synthetic session write failure'; END IF; RETURN OLD; END $$;
    CREATE TRIGGER wp03_fail_reset BEFORE DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION fail_reset_revoke()`);
  await call(`/admin/users/${customer.user.id}/password`,{token:admin.token,body:{attestation: 'Called the registered number back; caller named last order'},expect:500});
  assert.deepEqual(await persistence.one('SELECT password FROM users WHERE id=?',customer.user.id),credential,'failed password reset rolls back credential mutation');
  await call('/me',{token:customer.token});
  await persistence.run('ALTER TABLE sessions DISABLE TRIGGER wp03_fail_reset');
  const reset=await call(`/admin/users/${customer.user.id}/password`,{token:admin.token,body:{attestation: 'Called the registered number back; caller named last order'}});
  await call('/me',{token:customer.token,expect:401});
  assert.equal((await call('/auth/login',{body:{phone:customer.user.phone,password:reset.password}})).user.id,customer.user.id);
  console.log('PG HTTP dialect: casefold email, nullable role, scalar/aggregate MIN, camelCase referral alias, numeric cash/aggregates, revision/epoch/minor units passed');
}finally{await shutdown();}
