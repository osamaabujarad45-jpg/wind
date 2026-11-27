import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import type { Persistence } from './persistence.ts';
import { SESSION_DAYS, SESSION_DAY_MS, SESSION_IDLE_DAYS } from '../domain/session-policy.ts';

const driversSql = `SELECT id, role, status, vehicle, plate, approved_at FROM users
  WHERE role = 'driver' AND phone NOT LIKE 'deleted-%' AND phone NOT LIKE 'partner:%' ORDER BY id`;
const auditFilter = `action IN ('USER_APPROVED', 'DRIVER_APPROVED', 'USER_UPDATED') AND order_id IS NULL`;
const auditSql = `SELECT action, detail, created_at FROM security_events WHERE ${auditFilter}`;
const insertProfile = `INSERT INTO captain_profiles (user_id, state, vehicle, plate, approved_at, legacy_role, legacy_status)
  VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id) DO NOTHING`;
const setCaptainState = 'UPDATE users SET captain_state = ? WHERE id = ? AND captain_state IS NULL';
const markCaptainSession = `UPDATE sessions SET active_mode = 'captain', mode_revision = mode_revision + 1
  WHERE token_hash = (SELECT token_hash FROM sessions WHERE user_id = ? AND active_mode = 'personal'
    AND created_at > ? AND COALESCE(last_seen_at, created_at) > ?
    ORDER BY COALESCE(last_seen_at, created_at) DESC, created_at DESC, token_hash LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM sessions WHERE user_id = ? AND active_mode = 'captain')`;
const markStaffSessions = `UPDATE sessions SET active_mode = NULL, mode_revision = mode_revision + 1
  WHERE active_mode IS NOT NULL AND user_id IN (SELECT id FROM users WHERE role = 'admin')`;
const exclusiveCaptainSession = "CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_captain ON sessions(user_id) WHERE active_mode = 'captain'";

type Driver = { id: number; role: string; status: string; vehicle: string | null; plate: string | null; approved_at: number | null };
type Audit = { action: string; detail: string; created_at: number };

function approvalHistory(audits: Audit[]) {
  const history = new Map<number, number>();
  for (const entry of audits) {
    let detail: { targetId?: number; roleChanged?: boolean; role?: string; fields?: string[] } | null;
    try { detail = JSON.parse(entry.detail); } catch { continue; }
    const id = detail?.targetId;
    if (typeof id !== 'number' || !Number.isSafeInteger(id)) continue;
    if (entry.action === 'USER_UPDATED' && (detail?.roleChanged === true || (Array.isArray(detail?.fields) && detail.fields.includes('role')))) history.delete(id);
    if (entry.action === 'USER_APPROVED') {
      if (detail?.role === 'driver') history.set(id, entry.created_at);
      else if (detail?.role === 'customer' || detail?.role === 'admin') history.delete(id);
    }
    // The older event name also covered customer approvals. Its provenance is the contiguous role history
    // ending at a current legacy driver account. A later role edit clears that evidence.
    if (entry.action === 'DRIVER_APPROVED' && detail?.role === undefined) history.set(id, entry.created_at);
  }
  return history;
}

export async function legacyCaptainApproval(db: Persistence, userId: number) {
  const target = db.backend === 'postgres'
    ? "CASE WHEN detail IS JSON OBJECT THEN detail::jsonb ->> 'targetId' END"
    : "CASE WHEN json_valid(detail) THEN CAST(json_extract(detail, '$.targetId') AS TEXT) END";
  const audits = await db.all(`${auditSql} AND ${target} = ? ORDER BY id`, String(userId));
  return approvalHistory(audits as Audit[]).get(userId) ?? null;
}

function legacyCaptains(drivers: Driver[], audits: Audit[], now: number) {
  const history = approvalHistory(audits);
  return drivers.map(driver => {
    const approvedAt = driver.approved_at ?? history.get(driver.id) ?? null;
    const captainState = approvedAt === null ? null : driver.status === 'blocked' ? 'paused'
      : driver.status === 'pending' || driver.approved_at === null ? 'review' : 'active';
    const profileState = captainState === 'active' ? 'approved' : captainState ?? 'under_review';
    return { profile: [driver.id, profileState, driver.vehicle, driver.plate, approvedAt, driver.role, driver.status],
      captainState, id: driver.id, liveSession: captainState !== null && driver.status !== 'blocked'
        ? [driver.id, now - SESSION_DAYS * SESSION_DAY_MS, now - SESSION_IDLE_DAYS * SESSION_DAY_MS, driver.id] : null };
  });
}

const profileSchema = () => readFileSync(new URL('./account-profiles.sql', import.meta.url), 'utf8');

export function initializeSqliteAccountProfiles(db: DatabaseSync) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const migrate = !db.prepare('PRAGMA table_info(sessions)').all().some(column => column.name === 'active_mode');
    if (migrate) db.exec(`
      ALTER TABLE users ADD COLUMN captain_state TEXT CHECK (captain_state IN ('active','review','paused','closing'));
      ALTER TABLE sessions ADD COLUMN active_mode TEXT DEFAULT 'personal' CHECK (active_mode IN ('personal','captain','shop'));
      ALTER TABLE sessions ADD COLUMN mode_revision INTEGER NOT NULL DEFAULT 0 CHECK (mode_revision >= 0);`);
    db.exec(profileSchema());
    // The preceding SQLite release can still delete an account while this table is present.
    db.exec(`CREATE TRIGGER IF NOT EXISTS scrub_deleted_captain AFTER UPDATE OF phone ON users
      WHEN NEW.phone LIKE 'deleted-%' BEGIN
        DELETE FROM captain_profiles WHERE user_id = NEW.id;
        UPDATE users SET captain_state = NULL WHERE id = NEW.id;
      END;`);
    if (migrate) {
      const insert = db.prepare(insertProfile);
      const setState = db.prepare(setCaptainState);
      const markSession = db.prepare(markCaptainSession);
      for (const row of legacyCaptains(db.prepare(driversSql).all() as Driver[], db.prepare(auditSql + ' ORDER BY id').all() as Audit[], Date.now())) {
        insert.run(...row.profile);
        setState.run(row.captainState, row.id);
        if (row.liveSession) markSession.run(...row.liveSession);
      }
      db.exec(markStaffSessions);
    }
    db.exec(exclusiveCaptainSession);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export async function backfillPostgresAccountProfiles(db: Persistence) {
  for (const row of legacyCaptains(await db.all(driversSql) as Driver[], await db.all(auditSql + ' ORDER BY id') as Audit[], Date.now())) {
    await db.run(insertProfile, ...row.profile);
    await db.run(setCaptainState, row.captainState, row.id);
    if (row.liveSession) await db.run(markCaptainSession, ...row.liveSession);
  }
  await db.run(markStaffSessions);
}

export async function migratePostgresAccountProfiles(db: Persistence) {
  await db.run(`
    ALTER TABLE users ADD COLUMN captain_state TEXT CHECK (captain_state IN ('active','review','paused','closing'));
    ALTER TABLE sessions ADD COLUMN active_mode TEXT DEFAULT 'personal' CHECK (active_mode IN ('personal','captain','shop'));
    ALTER TABLE sessions ADD COLUMN mode_revision BIGINT NOT NULL DEFAULT 0 CHECK (mode_revision >= 0);`);
  await db.run(profileSchema());
  await backfillPostgresAccountProfiles(db);
  await db.run(exclusiveCaptainSession);
  await db.run(`CREATE FUNCTION scrub_deleted_captain() RETURNS trigger
    LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
    BEGIN
      DELETE FROM captain_profiles WHERE user_id = NEW.id;
      NEW.captain_state := NULL;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER scrub_deleted_captain BEFORE UPDATE OF phone ON users
      FOR EACH ROW WHEN (NEW.phone LIKE 'deleted-%') EXECUTE FUNCTION scrub_deleted_captain();`);
}
