// State mismatches must remain errors even if a returned URL also says access_denied.
export function cancelledEntraResult(result: { type: string; error?: { params?: Record<string, string> } | null }): boolean {
  return result.type === 'cancel' || result.type === 'dismiss'
    || (result.type === 'error' && result.error?.params?.error === 'access_denied');
}
// Microsoft identity platform does not support the OIDC phone scope.
export const ENTRA_SCOPES = ['openid', 'profile', 'email'];

