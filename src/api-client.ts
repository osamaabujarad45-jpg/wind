import { validateApiResponse } from './wire-contracts.ts';
import { clientDiagnostics } from './client-diagnostics.ts';
import { noteResponseClock, noteServerDate, serverOffset } from './api-clock.ts';
export { noteServerDate, serverOffset } from './api-clock.ts';

export class ApiError extends Error {
  readonly status?: number;
  readonly offerFailure?: import('./journey-contracts.ts').OfferFailure;
  /** The server's log id for a failure it recorded; shown to the person so support can find the request. */
  readonly reference?: string;
  constructor(message: string, status?: number, failure?: import('./journey-contracts.ts').OfferFailure, reference?: unknown) {
    super(message); this.status = status; this.offerFailure = failure;
    if (typeof reference === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(reference)) this.reference = reference;
  }
}

/** app.json version as major·10000 + minor·100 + patch; tests keep the two equal. The server gates on it (426). */
export const CLIENT_BUILD = 10100;
let updateRequired = false;
const updateListeners = new Set<() => void>();
export const clientUpdateRequired = () => updateRequired;
export function subscribeClientUpdate(listener: () => void) { updateListeners.add(listener); return () => { updateListeners.delete(listener); }; }

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
  const startedAt = Date.now(), startedMonotonic = performance.now();
  let responseStatus: number | undefined, succeeded = false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  // The caller can give up early (a long-poll that nobody watches any more): the socket is freed at once.
  const abandon = () => controller.abort();
  signal?.addEventListener('abort', abandon);
  if (signal?.aborted) abandon();
  try {
    let res: Response;
    const send = () => fetch(url, {
      method: method ?? (body ? 'POST' : 'GET'), signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Wind-Client': String(CLIENT_BUILD), ...(requestToken && { Authorization: `Bearer ${requestToken}` }) },
      body: body && JSON.stringify(body),
    });
    try { res = await send(); }
    catch {
      // Mobile data drops single requests all the time. A read is safe to repeat once, inside the same 20 s budget.
      if (signal?.aborted || controller.signal.aborted || body || (method && method !== 'GET')) throw new ApiError(signal?.aborted ? 'aborted' : 'network');
      await new Promise(resolve => setTimeout(resolve, 800));
      try { res = await send(); } catch { throw new ApiError(signal?.aborted ? 'aborted' : 'network'); }
    }
    const receivedAt = Date.now();
    responseStatus = res.status;
    let data;
    try { data = await res.json(); }
    catch { throw new ApiError(controller.signal.aborted ? 'network' : 'server_error', res.ok ? 502 : res.status); }
    if (res.status === 426 && data?.error === 'client_update_required' && !updateRequired) {
      updateRequired = true;
      for (const listener of updateListeners) listener();
    }
    if (requestToken !== token || requestRevision !== sessionRevision) throw new ApiError('session_changed', 401);
    noteServerDate(res.headers.get('date'), receivedAt, Math.max(0, receivedAt - startedAt));
    if (res.status === 401 && requestToken && data?.error === 'unauthorized') unauthorized();
    if (!res.ok) {
      const failure = data?.offerFailure;
      const valid = failure?.schemaVersion === 1 && ['accept','decline'].includes(failure.verb)
        && failure.code === data?.error && ['invalid','authentication','unavailable','conflict','transient'].includes(failure.category)
        && ['review','sign_in','stop','refresh','reconcile'].includes(failure.recovery);
      throw new ApiError(typeof data?.error === 'string' ? data.error : 'server_error', res.status, valid ? failure : undefined, data?.reference);
    }
    try { validateApiResponse(url, data, method ?? (body ? 'POST' : 'GET'), receivedAt + serverOffset()); }
    catch { throw new ApiError('invalid_response', 502); }
    noteResponseClock(data, Math.max(0, performance.now() - startedMonotonic));
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
