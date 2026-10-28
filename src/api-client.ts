export class ApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) { super(message); this.status = status; }
}

let token: string | null = null;
let sessionRevision = 0;
// A pending UI action must not resume under a different account, or after sign-out starts.
export const apiSessionRevision = () => sessionRevision;
export function invalidateApiSessionActions() { sessionRevision++; }
// Phone clock minus server clock, from each response's Date header (whole seconds). Server timestamps (driver fix
// times) are compared with Date.now() + this, so a phone set minutes ahead does not see a live driver as stale.
let clockOffset = 0;
export const serverOffset = () => clockOffset;
export function noteServerDate(date: string | null, now = Date.now(), roundTripMs = 0) {
  const server = date ? Date.parse(date) : NaN;
  // A long-held response cannot reliably distinguish clock skew from network delay.
  if (Number.isFinite(server) && roundTripMs <= 5_000)
    clockOffset = Math.abs(server - now) > 5_000 + roundTripMs ? server - now : 0;
}
let onUnauthorized = () => {};
export function configureApi(nextToken: string | null, unauthorized: () => void) {
  if (nextToken !== token) invalidateApiSessionActions();
  token = nextToken;
  onUnauthorized = unauthorized;
}

export async function request<T>(url: string, body?: object, method?: 'GET' | 'POST' | 'PATCH' | 'DELETE', signal?: AbortSignal): Promise<T> {
  const requestToken = token, requestRevision = sessionRevision, unauthorized = onUnauthorized;
  const startedAt = Date.now();
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
    let data;
    try { data = await res.json(); }
    catch { throw new ApiError(controller.signal.aborted ? 'network' : 'server_error', res.ok ? 502 : res.status); }
    if (requestToken !== token || requestRevision !== sessionRevision) throw new ApiError('session_changed', 401);
    noteServerDate(res.headers.get('date'), receivedAt, Math.max(0, receivedAt - startedAt));
    if (res.status === 401 && requestToken && data?.error === 'unauthorized') unauthorized();
    if (!res.ok) throw new ApiError(typeof data?.error === 'string' ? data.error : 'server_error', res.status);
    return data as T;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abandon); }
}

export const errorCode = (error: unknown) => error instanceof ApiError ? error.message : 'server_error';
