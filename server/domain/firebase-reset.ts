import { createPrivateKey, randomBytes, sign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://identitytoolkit.googleapis.com/v1';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
export type FirebaseIdentity = { uid: string; owner_marker: string };
export type FirebaseAttempt = FirebaseIdentity & { email: string };
export class FirebaseCreateRejected extends Error {}
type FirebaseUser = { localId?: string; email?: string; emailVerified?: boolean; customAttributes?: string };
type FirebaseResponse = FirebaseUser & { users?: FirebaseUser[]; idToken?: string; error?: unknown[] };

export function createFirebaseReset() {
  const apiKey = process.env.WIND_FIREBASE_API_KEY?.trim();
  let account: { project_id: string; client_email: string; private_key: string };
  try {
    account = JSON.parse(Buffer.from(process.env.WIND_FIREBASE_SERVICE_ACCOUNT ?? '', 'base64').toString('utf8'));
    if (!apiKey || !account.project_id || !account.client_email || !account.private_key) return null;
    if (createPrivateKey(account.private_key).asymmetricKeyType !== 'rsa') return null;
  } catch { return null; }
  const project = `${API}/projects/${encodeURIComponent(account.project_id)}/accounts`;
  let cached: { value: string; until: number } | undefined;
  async function token() {
    if (cached && cached.until > Date.now() + 60_000) return cached.value;
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform', aud: TOKEN_URL, iat: now, exp: now + 3600 })}`;
    const assertion = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), account.private_key).toString('base64url')}`;
    const response = await fetch(TOKEN_URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
    if (!response.ok) throw new Error('firebase_token_failed');
    const result = await response.json() as { access_token?: string; expires_in?: number };
    if (!result.access_token || !Number.isFinite(Number(result.expires_in))) throw new Error('firebase_token_failed');
    cached = { value: result.access_token, until: Date.now() + Number(result.expires_in) * 1000 };
    return cached.value;
  }
  async function request(url: string, body: object, headers: Record<string, string> = {}) {
    const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error('firebase_request_failed');
    return await response.json() as FirebaseResponse;
  }
  async function admin(suffix: string, body: object, headers: Record<string, string> = {}) {
    return request(`${project}${suffix}`, body, { Authorization: `Bearer ${await token()}`, ...headers });
  }
  const publicUrl = (method: string) => `${API}/accounts:${method}?key=${encodeURIComponent(apiKey!)}`;
  const lookup = async (uid: string) => (await admin(':lookup', { localId: [uid] })).users?.find(user => user.localId === uid);
  function owns(attempt: FirebaseIdentity, user?: FirebaseUser) {
    if (user?.localId !== attempt.uid || !user.customAttributes) return false;
    try { return JSON.parse(user.customAttributes)?.windRecoveryOwner === attempt.owner_marker; }
    catch { return false; }
  }
  const matches = (attempt: FirebaseAttempt, user?: FirebaseUser) => user?.email === attempt.email && owns(attempt, user);
  async function signIn(attempt: FirebaseAttempt, password: string) {
    const result = await request(publicUrl('signInWithPassword'), { email: attempt.email, password, returnSecureToken: true });
    if (result.localId !== attempt.uid || result.email !== attempt.email || !result.idToken) throw new Error('firebase_sign_in_failed');
    // The ID token comes directly from Google's HTTPS sign-in response. Its project must match our admin project.
    const claims = JSON.parse(Buffer.from(result.idToken.split('.')[1] ?? '', 'base64url').toString('utf8'));
    if (claims.aud !== account.project_id || claims.iss !== `https://securetoken.google.com/${account.project_id}` || claims.sub !== attempt.uid)
      throw new Error('firebase_project_mismatch');
    if (claims.windRecoveryOwner !== attempt.owner_marker) throw new Error('firebase_owner_mismatch');
    return result.idToken;
  }
  return {
    projectId: account.project_id,
    async send(attempt: FirebaseAttempt, purpose: 'verify' | 'reset', language: string, continueUrl: string, userIp: string, maySend: () => Promise<boolean>) {
      const password = randomBytes(32).toString('base64url');
      // Import one new UID without overwrite. The admin-only claim and address commit together, even if we lose the reply.
      const created = await admin(':batchCreate', { allowOverwrite: false, sanityCheck: true, users: [{
        localId: attempt.uid, email: attempt.email, customAttributes: JSON.stringify({ windRecoveryOwner: attempt.owner_marker }),
      }] });
      if (created.error?.length) throw new FirebaseCreateRejected('firebase_create_failed');
      const updated = await admin(':update', { localId: attempt.uid, password, returnSecureToken: false });
      if (updated.localId !== attempt.uid) throw new Error('firebase_create_failed');
      const idToken = await signIn(attempt, password);
      if (!await maySend()) return false;
      const headers = { 'X-Firebase-Locale': language };
      if (purpose === 'verify') {
        await request(publicUrl('sendOobCode'), { requestType: 'VERIFY_EMAIL', email: attempt.email, idToken, continueUrl }, headers);
      } else {
        // Bind mail to the admin project even though Password Reset targets an email, not an ID token.
        await admin(':sendOobCode', { requestType: 'PASSWORD_RESET', email: attempt.email, continueUrl, userIp }, headers);
      }
      return true;
    },
    async checkVerification(attempt: FirebaseAttempt) {
      const user = await lookup(attempt.uid);
      return matches(attempt, user) && user?.emailVerified === true;
    },
    async checkPassword(attempt: FirebaseAttempt, password: string) {
      await signIn(attempt, password);
      return matches(attempt, await lookup(attempt.uid));
    },
    async cleanup(attempt: FirebaseIdentity) {
      const user = await lookup(attempt.uid);
      if (!user) return 'absent';
      if (!owns(attempt, user)) return 'foreign';
      await admin(':delete', { localId: attempt.uid });
      return 'deleted';
    },
  };
}

export const firebaseReset = createFirebaseReset();
