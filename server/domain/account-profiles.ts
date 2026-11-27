import type { Persistence } from '../db/persistence.ts';
import type { AccountMode, CaptainProfileState, ProfilePreview, User } from '../../src/model.ts';
import { SESSION_DAYS, SESSION_DAY_MS, SESSION_IDLE_DAYS } from './session-policy.ts';
import { legacyCaptainApproval } from '../db/account-profiles.ts';

/** Project the staged profiles for the authenticating session. Legacy authorization still uses users.role. */
export async function previewProfiles(db: Persistence, user: User, sessionHash: string, shopsEnabled: boolean, modes = false): Promise<ProfilePreview | undefined> {
  if (user.role === 'admin') return undefined;
  const now = Date.now();
  const row = await db.one(`SELECT s.active_mode, s.mode_revision, u.role, u.status, u.approved_at, u.captain_state,
      m.id AS shop_id, m.name AS shop_name, m.status AS shop_state, p.state AS application_state
    FROM sessions s JOIN users u ON u.id = s.user_id
    LEFT JOIN merchants m ON m.owner_user_id = u.id AND ? = 1
    LEFT JOIN captain_profiles p ON p.user_id = u.id AND u.role = 'customer' AND p.state = 'under_review' AND ? = 1
    WHERE s.user_id = ? AND s.token_hash = ? AND s.created_at > ? AND COALESCE(s.last_seen_at, s.created_at) > ?
      AND u.role <> 'admin' AND u.status <> 'blocked' AND u.phone NOT LIKE 'deleted-%' AND u.phone NOT LIKE 'partner:%'`,
  shopsEnabled ? 1 : 0, modes ? 1 : 0, user.id, sessionHash, now - SESSION_DAYS * SESSION_DAY_MS, now - SESSION_IDLE_DAYS * SESSION_DAY_MS);
  if (!row) return undefined;
  const captainAvailable = row.role === 'driver' && (modes ? row.captain_state !== null : row.approved_at != null || await legacyCaptainApproval(db, user.id) != null);
  const captainState: CaptainProfileState = captainAvailable
    ? modes ? row.captain_state === 'active' ? 'approved' : row.captain_state : row.status === 'pending' || row.approved_at == null ? 'review' : 'approved'
    : 'under_review';
  const mode: AccountMode = row.active_mode === 'captain' && captainAvailable ? 'captain'
    : row.active_mode === 'shop' && row.shop_id != null ? 'shop' : 'personal';
  return { mode, revision: Number(row.mode_revision), role: mode === 'captain' ? 'driver' : 'customer',
    captain: row.role === 'driver' || row.application_state ? { state: captainState, available: captainAvailable } : null,
    shop: row.shop_id == null ? null : { id: Number(row.shop_id), name: row.shop_name, state: row.shop_state } };
}
