import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { cancelledEntraResult, ENTRA_SCOPES } from './entra-result';

// Microsoft Entra External ID sign-in (authorization code + PKCE in the system
// browser). Dormant until both public values are configured; the password form
// remains the fallback, so an unconfigured build renders exactly as before.
const tenant = process.env.EXPO_PUBLIC_ENTRA_TENANT_ID?.trim() ?? '';
const tenantName = (process.env.EXPO_PUBLIC_ENTRA_TENANT_NAME?.trim() ?? '').replace(/\.ciamlogin\.com$/i, '').toLowerCase();
const clientId = process.env.EXPO_PUBLIC_ENTRA_CLIENT_ID?.trim() ?? '';
export const entraConfigured = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant)
  && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(tenantName) && !!clientId;
WebBrowser.maybeCompleteAuthSession();

export type EntraTokens = { idToken: string; nonce: string };
export type EntraRequest = { request: AuthSession.AuthRequest; nonce: string; discovery: AuthSession.DiscoveryDocument };

// Prepare PKCE and the authorization URL before the button is tapped, so the
// system popup is opened directly from the user gesture on mobile web.
export async function prepareEntraRequest(reauthNonce?: string): Promise<EntraRequest | null> {
  if (!entraConfigured) return null;
  const authority = `https://${tenantName}.ciamlogin.com/${tenant.toLowerCase()}`;
  const discovery: AuthSession.DiscoveryDocument = {
    authorizationEndpoint: `${authority}/oauth2/v2.0/authorize`,
    tokenEndpoint: `${authority}/oauth2/v2.0/token`,
    endSessionEndpoint: `${authority}/oauth2/v2.0/logout`,
  };
  const nonce = reauthNonce ?? Crypto.randomUUID();
  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: ENTRA_SCOPES,
    redirectUri: AuthSession.makeRedirectUri({ scheme: 'wind', path: 'auth' }),
    usePKCE: true,
    extraParams: { nonce, ...(reauthNonce && { max_age: '0' }) },
    ...(reauthNonce && { prompt: AuthSession.Prompt.Login }),
  });
  await request.makeAuthUrlAsync(discovery);
  return { request, nonce, discovery };
}

export async function signInWithEntra({ request, nonce, discovery }: EntraRequest): Promise<EntraTokens | null> {
  const result = await request.promptAsync(discovery);
  if (cancelledEntraResult(result)) return null;
  if (result.type !== 'success' || !result.params.code) throw new Error('entra_authorization_failed');
  const token = await AuthSession.exchangeCodeAsync(
    // SDK 57 has no typed codeVerifier on the exchange config; extraParams is its typed body channel.
    { clientId, code: result.params.code, redirectUri: request.redirectUri ?? '', extraParams: { code_verifier: request.codeVerifier ?? '' } },
    discovery,
  );
  if (!token.idToken) throw new Error('entra_no_id_token');
  return { idToken: token.idToken, nonce };
}
