import assert from 'node:assert/strict';

const identityFields = ['phone', 'name', 'password', 'role', 'status', 'vehicle', 'created_at', 'email',
  'phone_verified_at', 'email_verified_at', 'approved_at', 'consent_at', 'consent_version', 'heading_city', 'heading_until'];

// Called only by the fixed-path phone sandbox at startup. Preserve orders and ledger history while restoring the
// bundled synthetic identity after password, role, blocking or deletion tests.
export function restorePhoneTestIdentity(db, saved, role, identifier) {
  if (!saved?.baseline) return false;
  const baseline = saved.baseline;
  assert.ok(['customer', 'driver', 'admin'].includes(role) && baseline.role === role && baseline.phone === identifier);
  assert.ok(Number.isSafeInteger(saved.userId) && saved.userId === baseline.id, 'test identity must retain its original user ID');
  assert.ok(db.prepare('SELECT id FROM users WHERE id=?').get(saved.userId), 'test identity row must exist');
  db.exec('BEGIN IMMEDIATE');
  try {
    // A tester may sign up again after deleting the seeded account. Free that synthetic number/address without
    // deleting the replacement's order history or accidentally assigning it the restored account's sessions.
    const conflicts = db.prepare('SELECT id FROM users WHERE id <> ? AND (phone = ? OR (email IS NOT NULL AND email = ? COLLATE NOCASE))')
      .all(saved.userId, baseline.phone, baseline.email);
    for (const conflict of conflicts) {
      db.prepare("UPDATE users SET phone=?, email=NULL, status='blocked' WHERE id=?").run(`sandbox-recovered-${conflict.id}`, conflict.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(conflict.id);
    }
    db.prepare(`UPDATE users SET ${identityFields.map(field => `${field}=?`).join(',')} WHERE id=?`)
      .run(...identityFields.map(field => baseline[field] ?? null), saved.userId);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(saved.userId);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return true;
}
