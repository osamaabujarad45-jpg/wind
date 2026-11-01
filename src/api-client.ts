import { validateApiResponse } from './wire-contracts.ts';
import { clientDiagnostics } from './client-diagnostics.ts';
import { noteServerDate, serverOffset } from './api-clock.ts';
export { noteServerDate, serverOffset } from './api-clock.ts';

export class ApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) { super(message); this.status = status; }
}

let token: string | null = null;
/** Internal protected-storage scope; never serialize or log this credential. */
export const apiSessionCredential = () => token;
let sessionRevision = 0;
// A pending UI action must not resume under a different account, or after sign-out starts.
export const apiSessionRevision = () => sessionRevision;
export function invalidateApiSessionActions() { sessionRevision++; }
let onUnauthorized = () => {};
export function configureApi(nextToken: string | null, unauthorized: () => void) {
  if (nextToken !== token) invalidateApiSessionActions();
  token = nextToken;
  onUnauthorized = unauthorized;
}

export async function request<T>(url: string, body?: object, method?: 'GET' | 'POST' | 'PATCH' | 'DELETE', signal?: AbortSignal): Promise<T> {
  const requestToken = token, requestRevision = sessionRevision, unauthorized = onUnauthorized;
  const startedAt = Date.now();
  let responseStatus: number | undefined, succeeded = false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  // The caller can give up early (a long-poll that nobody watches any more): the socket is freed at once.
  const abandon = () => controller.abort();
  signal?.addEventListener('abort', abandon);
  if (signal?.aborted) abandon();
  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method: method ?? (body ? 'POST' : 'GET'), signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(requestToken && { Authorization: `Bearer ${requestToken}` }) },
        body: body && JSON.stringify(body),
      });
    } catch { throw new ApiError(signal?.aborted ? 'aborted' : 'network'); }
    const receivedAt = Date.now();
    responseStatus = res.status;
    let data;
    try { data = await res.json(); }
    catch { throw new ApiError(controller.signal.aborted ? 'network' : 'server_error', res.ok ? 502 : res.status); }
    if (requestToken !== token || requestRevision !== sessionRevision) throw new ApiError('session_changed', 401);
    noteServerDate(res.headers.get('date'), receivedAt, Math.max(0, receivedAt - startedAt));
    if (res.status === 401 && requestToken && data?.error === 'unauthorized') unauthorized();
    if (!res.ok) throw new ApiError(typeof data?.error === 'string' ? data.error : 'server_error', res.status);
    try { validateApiResponse(url, data, method ?? (body ? 'POST' : 'GET'), receivedAt + serverOffset()); }
    catch { throw new ApiError('invalid_response', 502); }
    succeeded = true;
    return data as T;
  } finally {
    clearTimeout(timeout); signal?.removeEventListener('abort', abandon);
    if (requestToken && requestRevision === sessionRevision && !url.includes('/runtime/diagnostics')) clientDiagnostics.record('api_result', {
      durationMs: Math.max(0, Math.min(120_000, Math.round(Date.now() - startedAt))), outcome: succeeded ? 'ok' : 'error',
      ...(responseStatus ? { httpStatus: responseStatus } : {}) });
  }
}

export const errorCode = (error: unknown) => error instanceof ApiError ? error.message : 'server_error';
