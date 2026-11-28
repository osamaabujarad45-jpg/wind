import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import type { Persistence } from './persistence.ts';
import { SESSION_DAYS, SESSION_DAY_MS, SESSION_IDLE_DAYS } from '../domain/session-policy.ts';
import { activeStatuses } from '../../src/model.ts';

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
export const modeActivationKey = 'account_modes_active';

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
    if (!db.prepare('PRAGMA table_info(push_subscriptions)').all().some(column => column.name === 'auth_session_hash'))
      db.exec('ALTER TABLE push_subscriptions ADD COLUMN auth_session_hash TEXT REFERENCES sessions(token_hash) ON DELETE CASCADE');
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

export function initializeSqliteModeSwitching(db: DatabaseSync, shopsEnabled: boolean) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const sessionColumns = new Set(db.prepare('PRAGMA table_info(sessions)').all().map(column => column.name));
    if (!sessionColumns.has('captain_online_at')) db.exec('ALTER TABLE sessions ADD COLUMN captain_online_at INTEGER');
    if (!sessionColumns.has('last_activity_at')) db.exec('ALTER TABLE sessions ADD COLUMN last_activity_at INTEGER');
    const merchantColumns = new Set(db.prepare('PRAGMA table_info(merchants)').all().map(column => column.name));
    if (!merchantColumns.has('published_at')) {
      db.exec(`ALTER TABLE merchants ADD COLUMN published_at INTEGER;
        UPDATE merchants SET published_at = created_at WHERE status <> 'pending';
        UPDATE merchants SET paused_new = 1 WHERE status = 'pending';`);
    }
    const itemColumns = new Set(db.prepare('PRAGMA table_info(merchant_items)').all().map(column => column.name));
    if (!itemColumns.has('client_request_id')) db.exec('ALTER TABLE merchant_items ADD COLUMN client_request_id TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS merchant_items_request ON merchant_items(merchant_id, client_request_id) WHERE client_request_id IS NOT NULL');
    const addOfflineReason = `ALTER TABLE sessions ADD COLUMN captain_offline_reason TEXT
      CHECK (captain_offline_reason IN ('idle','ride_due','launch'))`;
    if (!sessionColumns.has('captain_offline_reason')) db.exec(addOfflineReason);
    else if (String(db.prepare("SELECT sql FROM sqlite_schema WHERE name = 'sessions'").get()?.sql)
      .includes("captain_offline_reason IN ('idle','ride_due')")) {
      db.exec(`ALTER TABLE sessions RENAME COLUMN captain_offline_reason TO previous_captain_offline_reason;
        ${addOfflineReason};
        UPDATE sessions SET captain_offline_reason = previous_captain_offline_reason;
        ALTER TABLE sessions DROP COLUMN previous_captain_offline_reason;`);
    }
    if (!db.prepare('PRAGMA table_info(captain_profiles)').all().some(column => column.name === 'application_id'))
      db.exec('ALTER TABLE captain_profiles ADD COLUMN application_id TEXT');
    if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get(modeActivationKey)) {
      // Shadow mode leaves the old session writers in place. Reconcile those sessions before the policy changes.
      db.exec("UPDATE sessions SET active_mode = 'personal', mode_revision = mode_revision + 1 WHERE active_mode = 'captain'");
      const markSession = db.prepare(markCaptainSession);
      const captains = db.prepare(driversSql).all() as Driver[];
      const profiles = legacyCaptains(captains, db.prepare(auditSql + ' ORDER BY id').all() as Audit[], Date.now());
      const refreshProfile = db.prepare(`INSERT INTO captain_profiles (user_id,state,vehicle,plate,approved_at,legacy_role,legacy_status,application_id)
        VALUES (?,?,?,?,?,?,?,lower(hex(randomblob(16)))) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state, vehicle=excluded.vehicle,
          plate=excluded.plate, approved_at=excluded.approved_at, legacy_role=excluded.legacy_role,
          legacy_status=excluded.legacy_status, application_id=excluded.application_id`);
      for (const [index, row] of profiles.entries()) {
        const captain = captains[index]!;
        refreshProfile.run(...row.profile);
        if (!row.captainState) {
          db.prepare("UPDATE users SET role='customer', status=?, vehicle=NULL, plate=NULL, captain_state=NULL WHERE id=?")
            .run(captain.status === 'blocked' ? 'blocked' : 'active', row.id);
        } else {
          db.prepare("UPDATE users SET captain_state=?, status=CASE WHEN status='pending' THEN 'active' ELSE status END WHERE id=?")
            .run(row.captainState, row.id);
        }
        if (row.liveSession) markSession.run(...row.liveSession);
      }
      if (shopsEnabled) {
        const now = Date.now();
        db.prepare(`UPDATE sessions SET active_mode = 'shop', mode_revision = mode_revision + 1
          WHERE token_hash IN (SELECT (SELECT token_hash FROM sessions WHERE user_id = u.id AND active_mode = 'personal'
            AND created_at > ? AND COALESCE(last_seen_at, created_at) > ?
            ORDER BY COALESCE(last_seen_at, created_at) DESC, created_at DESC, token_hash LIMIT 1)
            FROM merchants m JOIN users u ON u.id = m.owner_user_id WHERE u.role <> 'admin' AND u.status <> 'blocked')`)
          .run(now - SESSION_DAYS * SESSION_DAY_MS, now - SESSION_IDLE_DAYS * SESSION_DAY_MS);
      }
      db.exec(markStaffSessions);
      db.prepare('INSERT INTO settings(key,value) VALUES (?,1)').run(modeActivationKey);
    }
    db.exec('UPDATE captain_profiles SET application_id = lower(hex(randomblob(16))) WHERE application_id IS NULL');
    const work = activeStatuses.map(status => `'${status}'`).join(',');
    const recordEnd = `INSERT INTO security_events(actor_id, action, detail, created_at)
      SELECT OLD.user_id, 'CAPTAIN_SESSION_ENDED', '{"workInHand":true}', CAST(unixepoch('subsec') * 1000 AS INTEGER)
      WHERE EXISTS (SELECT 1 FROM orders WHERE driver_id = OLD.user_id AND status IN (${work}));`;
    db.exec(`CREATE TRIGGER IF NOT EXISTS captain_session_ended AFTER DELETE ON sessions WHEN OLD.active_mode = 'captain'
      BEGIN DELETE FROM order_offers WHERE driver_id = OLD.user_id; ${recordEnd} END;
      DROP TRIGGER IF EXISTS captain_session_demoted;
      CREATE TRIGGER captain_session_demoted AFTER UPDATE OF active_mode ON sessions
      WHEN OLD.active_mode = 'captain' AND NEW.active_mode = 'personal'
      BEGIN DELETE FROM order_offers WHERE driver_id = OLD.user_id; ${recordEnd} END;`);
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
