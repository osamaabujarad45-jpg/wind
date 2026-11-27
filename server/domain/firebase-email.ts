import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { Persistence, Row } from '../db/persistence.ts';
import { FirebaseCreateRejected, type createFirebaseReset, type FirebaseAttempt, type FirebaseIdentity } from './firebase-reset.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const validMailboxProof = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value);
type Purpose = 'verify' | 'reset';
type Attempt = FirebaseAttempt & { project_id: string; recipient_key: string; user_id: number; purpose: Purpose };

/** A numeric timestamp alone has no recovery authority: older servers also wrote it during reset. */
export async function recoveryEmailVerified(db: Persistence, account: Row) {
  return !!(account.email && account.email_verified_at && await db.one(
    'SELECT 1 FROM recovery_email_proofs WHERE user_id = ? AND email = ? AND verified_at = ?',
    account.id, account.email, account.email_verified_at));
}

type ProofMethod = 'cloudflare-code' | 'firebase-link' | 'entra';

export async function recordRecoveryEmailProof(db: Persistence, userId: number, email: string, method: ProofMethod) {
  const now = Date.now();
  if (!(await db.run('UPDATE users SET email_verified_at = ? WHERE id = ? AND email = ?', now, userId, email)).changes) return;
  await db.run(`INSERT INTO recovery_email_proofs(user_id, email, verified_at, method) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, verified_at = excluded.verified_at, method = excluded.method`,
  userId, email, now, method);
  await retireFirebaseEmail(db, userId);
}

export function firebaseContinuationUrl(value = process.env.WIND_FIREBASE_EMAIL_CONTINUE_URL) {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === '/recovery-email' ? url.href : undefined;
  } catch { return undefined; }
}

export async function retireFirebaseEmail(db: Persistence, userId: number, purpose?: Purpose) {
  if (!purpose) await db.run('DELETE FROM firebase_resets WHERE user_id = ?', userId);
  const scope = purpose ? 'AND purpose = ?' : '';
  const subject = purpose ? [userId, purpose] : [userId];
  await db.run(`DELETE FROM firebase_email_attempts WHERE user_id = ? AND state = 'queued' ${scope}`, ...subject);
  await db.run(`UPDATE firebase_email_attempts SET state = 'retired', cleanup_at = CASE WHEN state = 'ready' THEN ? ELSE cleanup_at END
    WHERE user_id = ? AND state IN ('sending', 'ready') ${scope}`, Date.now(), ...subject);
}

type SweepScope = { userId: number } | { recipientKey: string };

export function firebaseEmailService(db: Persistence, provider: ReturnType<typeof createFirebaseReset>, continueUrl: string | undefined) {
  const jobs = new Set<Promise<void>>();
  let draining = false;
  const encodedKey = process.env.WIND_FIREBASE_RECIPIENT_KEY ?? '';
  const recipientSecret = /^[A-Za-z0-9_-]{43}$/.test(encodedKey) ? Buffer.from(encodedKey, 'base64url') : undefined;
  const recipientKey = recipientSecret && ((email: string) => createHmac('sha256', recipientSecret).update(email.toLowerCase()).digest('hex'));
  const verificationEnabled = !!(provider && continueUrl && recipientKey && process.env.WIND_FIREBASE_EMAIL_LINKS === '1');
  const resetEnabled = verificationEnabled && process.env.WIND_FIREBASE_RESET_LINKS === '1';
  const enabled = (purpose: Purpose) => purpose === 'verify' ? verificationEnabled : resetEnabled;
  function background(work: () => Promise<void>) {
    const job = db.detached(work).catch(() => {});
    jobs.add(job);
    void job.then(() => jobs.delete(job));
  }

  async function sweep(scope?: SweepScope) {
    if (!provider) return;
    const now = Date.now();
    const selection = !scope ? '' : 'userId' in scope ? ' AND user_id = ?' : ' AND recipient_key = ?';
    const bindings = scope ? ['userId' in scope ? scope.userId : scope.recipientKey] : [];
    await db.run(`DELETE FROM firebase_email_attempts
      WHERE project_id = ? AND cleanup_at <= ? AND state = 'queued'${selection}`, provider.projectId, now, ...bindings);
    const due = await db.all(`SELECT * FROM firebase_email_attempts
      WHERE project_id = ? AND cleanup_at <= ? AND state <> 'queued'${selection} ORDER BY cleanup_at LIMIT 10`,
    provider.projectId, now, ...bindings);
    // Claim each row before provider work. Once retired, its UID can never carry Wind authority again.
    for (const row of due) {
      const claimedUntil = Date.now() + MINUTE;
      const claimed = await db.run(`UPDATE firebase_email_attempts SET
        state = CASE WHEN state = 'reconcile' THEN state ELSE 'retired' END, cleanup_at = ?
        WHERE uid = ? AND cleanup_at = ?`, claimedUntil, row.uid, row.cleanup_at);
      if (!claimed.changes) continue;
      try {
        const result = await provider.cleanup(row as FirebaseIdentity);
        if (result === 'deleted' || (result === 'absent' && row.retry_until <= now)) {
          await db.run('DELETE FROM firebase_email_attempts WHERE uid = ? AND cleanup_at = ?', row.uid, claimedUntil);
        } else if (result === 'foreign' && row.retry_until <= now) {
          // A different immutable UID claim cannot be ours. Keep this entry for reconciliation.
          await db.run(`UPDATE firebase_email_attempts SET state = 'reconcile', cleanup_at = ? WHERE uid = ? AND cleanup_at = ?`,
            Date.now() + DAY, row.uid, claimedUntil);
        }
        // An absent result during the uncertainty window keeps the retired row blocking replacement. Retry after the claim.
      } catch { /* Retain the claim and let a later sweep retry. */ }
    }
  }

  async function claimSend(attempt: Attempt, deadline: number) {
    while (!draining && Date.now() < deadline) {
      await sweep({ recipientKey: attempt.recipient_key });
      const now = Date.now();
      const claimedUntil = now + 2 * MINUTE;
      const claim = await db.run(`UPDATE firebase_email_attempts SET state = 'sending', cleanup_at = ?
        WHERE uid = ? AND state = 'queued' AND cleanup_at > ? AND NOT EXISTS (
          SELECT 1 FROM firebase_email_attempts WHERE project_id = ? AND recipient_key = ? AND state IN ('sending', 'ready', 'retired')
        )`, claimedUntil, attempt.uid, now, attempt.project_id, attempt.recipient_key);
      if (claim.changes) return claimedUntil;
      if (!await db.one("SELECT 1 FROM firebase_email_attempts WHERE uid = ? AND state = 'queued'", attempt.uid)) break;
      await delay(500);
    }
  }

  async function reserve(account: Row, purpose: Purpose, sessionHash: string | null, language: string, address: string) {
    if (!enabled(purpose) || !provider || !continueUrl || !recipientKey) throw new Error('firebase_disabled');
    const nonce = randomBytes(24).toString('base64url');
    const attempt = {
      uid: `wind-recovery-${randomUUID()}`, owner_marker: randomBytes(24).toString('base64url'),
      project_id: provider.projectId, recipient_key: recipientKey(account.email), email: account.email, user_id: account.id, purpose,
    } satisfies Attempt;
    const now = Date.now(), expires = now + (purpose === 'verify' ? DAY : HOUR), deadline = now + 2 * MINUTE;
    // Callers hold the account lock. The journal commits before the first provider mutation.
    await retireFirebaseEmail(db, account.id, purpose);
    await db.run(`INSERT INTO firebase_email_attempts
      (uid, project_id, owner_marker, user_id, purpose, recipient_key, credential_hash, nonce_hash, session_hash, state, expires_at, cleanup_at, retry_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`,
    attempt.uid, attempt.project_id, attempt.owner_marker, attempt.user_id, purpose, attempt.recipient_key,
    digest(account.password), digest(nonce), sessionHash, expires, deadline, now + 2 * DAY);
    return () => background(async () => {
      const claim = await claimSend(attempt, deadline);
      if (!claim) return;
      const url = new URL(continueUrl);
      url.hash = `${language}.${nonce}`;
      const stillSending = async () => !!await db.one(`SELECT 1 FROM firebase_email_attempts
        WHERE uid = ? AND state = 'sending' AND cleanup_at = ? AND cleanup_at > ?`, attempt.uid, claim, Date.now());
      let rejected = 0;
      try {
        if (!await stillSending()) rejected = 1;
        else if (await provider.send(attempt, purpose, language, url.href, address, stillSending) && (await db.run(`UPDATE firebase_email_attempts
          SET state = 'ready', cleanup_at = ?, retry_until = 0
          WHERE uid = ? AND state = 'sending' AND cleanup_at = ? AND cleanup_at > ?`, expires, attempt.uid, claim, Date.now())).changes) return;
      } catch (error) {
        // Only an explicit import rejection proves the UID was not created. Outward responses stay generic.
        if (error instanceof FirebaseCreateRejected) rejected = 1;
      }
      const now = Date.now();
      await db.run(`UPDATE firebase_email_attempts SET state = 'retired', cleanup_at = ?,
        retry_until = CASE WHEN ? = 1 THEN 0 ELSE retry_until END
        WHERE uid = ? AND state IN ('sending', 'retired') AND cleanup_at = ? AND cleanup_at > ?`, now, rejected, attempt.uid, claim, now);
      await sweep({ recipientKey: attempt.recipient_key });
    });
  }

  async function pending(account: Row, purpose: Purpose, nonce: unknown, sessionHash: string | null, lock = false) {
    if (!enabled(purpose) || !recipientKey || !account.email || !validMailboxProof(nonce)) return;
    const row = await db.one(`SELECT * FROM firebase_email_attempts WHERE project_id = ? AND user_id = ? AND purpose = ?
      AND recipient_key = ? AND credential_hash = ? AND nonce_hash = ? AND state = 'ready' AND expires_at > ?
      AND (${purpose === 'verify' ? 'session_hash = ?' : 'session_hash IS NULL'})
      ${lock && db.backend === 'postgres' ? ' FOR UPDATE' : ''}`,
    provider!.projectId, account.id, purpose, recipientKey(account.email), digest(account.password), digest(nonce), Date.now(),
    ...(purpose === 'verify' ? [sessionHash] : []));
    return row ? { ...row, email: account.email } as Attempt : undefined;
  }

  return {
    verificationEnabled, resetEnabled, reserve, pending, sweep, background,
    checkVerification: (attempt: Attempt) => provider!.checkVerification(attempt),
    checkPassword: (attempt: Attempt, password: string) => provider!.checkPassword(attempt, password),
    async drain() { draining = true; while (jobs.size) await Promise.all(jobs); },
  };
}
export function registerRecoveryEmailRoutes<Context>(
  route: (method: string, path: string, handler: (context: Context) => unknown, publicRoute?: boolean) => void,
  handlers: Record<'challenge' | 'requestVerificationLink' | 'confirmVerificationLink' | 'requestResetLink' | 'adoptResetLink', (context: Context) => unknown>,
) {
  route('POST', '/api/me/email/challenge', handlers.challenge);
  route('POST', '/api/me/email/link', handlers.requestVerificationLink);
  route('POST', '/api/me/email/link/confirm', handlers.confirmVerificationLink);
  route('POST', '/api/auth/reset/link/code', handlers.requestResetLink, true);
  route('POST', '/api/auth/reset/link', handlers.adoptResetLink, true);
}
