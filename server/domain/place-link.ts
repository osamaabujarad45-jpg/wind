// GEO-03: a shared map link (maps.app.goo.gl, goo.gl/maps) read to its point. The app never fetches a link itself. The
// server fetches only allowlisted hosts (src/shared-location.ts), one hop at a time with redirects turned off: each hop
// must be https, at most three redirects are followed and the whole read stops after 3 s. No page body is ever read;
// the only answer is the point a URL names, inside the served area, or a refusal.
// ponytail: the 3 s budget is one AbortSignal for the chain; a per-hop budget and a response cache come when the pilot
// sends enough links to notice the latency.
import type { Point } from '../../src/model.ts';
import { isPlainMapUrl, parseSharedLocation } from '../../src/shared-location.ts';

type Register = (method: string, path: string, handler: (ctx: { user: { id: number }; query: URLSearchParams }) => Promise<unknown>) => unknown;
type Guards = {
  fail: (status: number, code: string) => never;
  limit: (key: string, maximum: number, windowMs: number) => Promise<unknown>;
  limitKey: (userId: number) => string;
};
export type LinkSend = (url: string, init: RequestInit) => Promise<Response>;

export class LinkError extends Error {
  code: 'invalid_input' | 'link_not_resolved';
  constructor(code: 'invalid_input' | 'link_not_resolved') {
    super(code);
    this.code = code;
    this.name = 'LinkError';
  }
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
// Hosts the server will actually contact. google.<cc> links are still read when they carry a point, but never fetched:
// not every two-letter google.<cc> domain is Google's, and its DNS could point anywhere.
const FETCH_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'google.com', 'www.google.com', 'maps.google.com']);
const refuse = (code: 'invalid_input' | 'link_not_resolved'): never => { throw new LinkError(code); };

// A Maps or short link on an allowlisted host, or refuse. The first hop is the caller's input; every later hop is a redirect target.
function hop(text: string, base: URL | null): URL {
  let url: URL;
  try { url = new URL(text, base ?? undefined); } catch { return refuse(base ? 'link_not_resolved' : 'invalid_input'); }
  if (!isPlainMapUrl(url)) return refuse(base ? 'link_not_resolved' : 'invalid_input');
  return url;
}

/** The point a shared map link names, following at most `maxRedirects` allowlisted redirects within `timeoutMs`. */
export async function resolveSharedLink(input: string, options: { send?: LinkSend; timeoutMs?: number; maxRedirects?: number } = {}): Promise<Point> {
  const send: LinkSend = options.send ?? ((url, init) => fetch(url, init));
  const { timeoutMs = 3000, maxRedirects = 3 } = options;
  let current = hop(input, null);
  const signal = AbortSignal.timeout(timeoutMs);
  let redirects = 0;
  for (;;) {
    const read = parseSharedLocation(current.href);
    if (read && 'point' in read) return read.point;
    // A URL that names a point outside the served area is refused; one with no point at all is followed.
    if (read && 'error' in read && read.error !== 'bad_link') refuse('link_not_resolved');
    if (!FETCH_HOSTS.has(current.hostname)) refuse('link_not_resolved');
    const res = await send(current.href, { redirect: 'manual', signal, headers: { 'User-Agent': 'Wind/1.0 (delivery app; small pilot)' } })
      .catch(() => refuse('link_not_resolved'));
    try { await res.body?.cancel(); } catch { /* nothing left to drain */ }
    const next = res.headers.get('location');
    if (!REDIRECTS.has(res.status) || !next) return refuse('link_not_resolved');
    if (++redirects > maxRedirects) return refuse('link_not_resolved');
    current = hop(next, current);
  }
}

// Map links are read for the booking's pin: one lookup per user per 10 minutes, the same allowance as a map search.
export function registerPlaceLinkRoutes(route: Register, guards: Guards, send?: LinkSend): void {
  route('GET', '/api/places/resolve-link', async ({ user, query }) => {
    const url = (query.get('url') ?? '').trim();
    if (!url || url.length > 300) return guards.fail(400, 'invalid_input');
    await guards.limit(guards.limitKey(user.id), 60, 10 * 60_000);
    try {
      const point = await resolveSharedLink(url, { send });
      return { latitude: point.latitude, longitude: point.longitude };
    } catch (error) {
      if (error instanceof LinkError && error.code === 'invalid_input') return guards.fail(400, 'invalid_input');
      return guards.fail(422, 'link_not_resolved');
    }
  });
}
