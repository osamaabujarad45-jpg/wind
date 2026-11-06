// Staff-role survival through real HTTP requests on two independent PostgreSQL API processes.
import assert from 'node:assert/strict';
import { copy } from '../src/copy.ts';
import { fixture } from './eligibility-support.mjs';

const f = await fixture('staffroles');
const grant = async (base, actor, target, staffRole) => {
  const response = await fetch(`${base}/admin/staff/${target.user.id}/role`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actor.token}` },
    body: JSON.stringify({ staffRole, purpose: 'Synthetic role survival test' }),
  });
  return { status: response.status, data: await response.json() };
};
const role = async account => (await f.db.one('SELECT staff_role FROM users WHERE id=?', account.user.id)).staff_role;
const platformAdmins = () => f.db.all("SELECT id FROM users WHERE role='admin' AND COALESCE(staff_role,'platform_admin')='platform_admin' ORDER BY id");
try {
  assert.notEqual(f.a.child.pid, f.b.child.pid, 'mutual demotions use different API processes');
  for (const language of ['ar', 'en']) assert.ok(copy[language].err_last_platform_admin?.length > 0);
  assert.equal(await role(f.admin), null, 'legacy NULL staff role is effective platform_admin');
  for (const staffRole of ['support', 'dispatcher']) {
    const refused = await grant(f.a.base, f.admin, f.admin, staffRole);
    assert.equal(refused.status, 409, JSON.stringify(refused));
    assert.equal(refused.data.error, 'last_platform_admin');
    assert.equal(await role(f.admin), null, 'last admin keeps their role');
  }
  assert.equal((await f.db.one("SELECT COUNT(*) n FROM staff_actions WHERE action='grant_role'")).n, 0, 'refused demotions write no success audit');
  assert.equal((await grant(f.a.base, f.admin, f.admin, 'platform_admin')).status, 200);
  const explicit = await grant(f.a.base, f.admin, f.admin, 'finance');
  assert.equal(explicit.status, 409, JSON.stringify(explicit));
  assert.equal(explicit.data.error, 'last_platform_admin');
  assert.equal(await role(f.admin), 'platform_admin', 'explicit last platform admin also keeps their role');

  const second = await f.account('admin');
  const demoted = await grant(f.a.base, f.admin, f.admin, 'support');
  assert.equal(demoted.status, 200, JSON.stringify(demoted));
  assert.equal(await role(f.admin), 'support');
  assert.deepEqual((await platformAdmins()).map(r => r.id), [second.user.id]);
  assert.equal((await grant(f.a.base, f.admin, second, 'support')).status, 403, 'demoted admin cannot grant roles');
  assert.equal((await grant(f.b.base, f.customer, second, 'support')).status, 403, 'customers cannot grant roles');
  const last = await grant(f.b.base, second, second, 'support');
  assert.equal(last.status, 409, JSON.stringify(last));
  assert.equal(last.data.error, 'last_platform_admin');

  // Restore the pair through HTTP before each race; alternate request/process order.
  for (let round = 0; round < 12; round++) {
    const survivor = (await role(f.admin)) === 'support' ? second : f.admin;
    assert.equal((await grant(f.a.base, survivor, f.admin, null)).status, 200);
    assert.equal((await grant(f.b.base, survivor, second, 'platform_admin')).status, 200);
    const before = (await f.db.one("SELECT COUNT(*) n FROM staff_actions WHERE action='grant_role'")).n;
    const requests = round % 2 ? [[f.b.base, second, f.admin], [f.a.base, f.admin, second]]
      : [[f.a.base, f.admin, second], [f.b.base, second, f.admin]];
    const results = await Promise.all(requests.map(([base, actor, target]) => grant(base, actor, target, 'support')));
    assert.equal(results.filter(r => r.status === 200).length, 1, `one mutual demotion succeeds: ${JSON.stringify(results)}`);
    const refused = results.find(r => r.status !== 200);
    assert.ok((refused.status === 409 && refused.data.error === 'last_platform_admin')
      || (refused.status === 403 && refused.data.error === 'forbidden'), JSON.stringify(results));
    assert.equal((await platformAdmins()).length, 1, 'concurrent mutual demotions retain one effective platform admin');
    assert.equal((await f.db.one("SELECT COUNT(*) n FROM staff_actions WHERE action='grant_role'")).n, before + 1, 'only the successful demotion is audited');
  }
  console.log('pg-staff-roles: ok');
} finally {
  try {
    await Promise.all([f.a.stop(), f.b.stop()]);
    await f.db.run(`DROP SCHEMA "${f.schema}" CASCADE`);
  } finally { await f.close(); }
}
