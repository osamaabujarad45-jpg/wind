export class ApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) { super(message); this.status = status; }
}

let token: string | null = null;
let onUnauthorized = () => {};
export function configureApi(nextToken: string | null, unauthorized: () => void) {
  token = nextToken;
  onUnauthorized = unauthorized;
}

export async function request<T>(url: string, body?: object, method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'): Promise<T> {
  const requestToken = token, unauthorized = onUnauthorized;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method: method ?? (body ? 'POST' : 'GET'), signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(requestToken && { Authorization: `Bearer ${requestToken}` }) },
        body: body && JSON.stringify(body),
      });
    } catch { throw new ApiError('network'); }
    let data;
    try { data = await res.json(); }
    catch { throw new ApiError(controller.signal.aborted ? 'network' : 'server_error', res.ok ? 502 : res.status); }
    if (requestToken !== token) throw new ApiError('session_changed', 401);
    if (res.status === 401 && requestToken && data?.error === 'unauthorized') unauthorized();
    if (!res.ok) throw new ApiError(typeof data?.error === 'string' ? data.error : 'server_error', res.status);
    return data as T;
  } finally { clearTimeout(timeout); }
}

export const errorCode = (error: unknown) => error instanceof ApiError ? error.message : 'server_error';
