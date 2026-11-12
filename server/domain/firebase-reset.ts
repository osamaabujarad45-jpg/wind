import { createPrivateKey, randomBytes, sign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://identitytoolkit.googleapis.com/v1';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

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
      scope: 'https://www.googleapis.com/auth/identitytoolkit', aud: TOKEN_URL, iat: now, exp: now + 3600 })}`;
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
    return await response.json() as { users?: { localId?: string }[]; localId?: string };
  }
  async function admin(suffix: string, body: object) {
    return request(`${project}${suffix}`, body, { Authorization: `Bearer ${await token()}` });
  }
  const publicUrl = (method: string) => `${API}/accounts:${method}?key=${encodeURIComponent(apiKey!)}`;
  return {
    async deleteUser(userId: number) { await admin(':delete', { localId: `wind-${userId}` }); },
    async send(userId: number, email: string, language: string) {
      const found = await admin(':lookup', { email: [email] });
      // Only Wind's own reset users: an account made outside this scheme is never destroyed by someone typing its email; create then fails closed.
      for (const user of found.users ?? []) if (user.localId?.startsWith('wind-')) await admin(':delete', { localId: user.localId });
      const localId = `wind-${userId}`;
      const created = await admin(`?key=${encodeURIComponent(apiKey!)}`, { localId, email, password: randomBytes(32).toString('base64url') });
      if (created.localId !== localId) throw new Error('firebase_create_failed');
      await request(publicUrl('sendOobCode'), { requestType: 'PASSWORD_RESET', email }, { 'X-Firebase-Locale': language });
    },
    async verify(userId: number, email: string, password: string) {
      const result = await request(publicUrl('signInWithPassword'), { email, password, returnSecureToken: true });
      return result.localId === `wind-${userId}`;
    },
  };
}

export const firebaseReset = createFirebaseReset();
