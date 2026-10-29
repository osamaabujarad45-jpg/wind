import type { IncomingMessage } from 'node:http';

/**
 * The address a per-address limit is keyed on.
 *
 * Behind a proxy the leftmost `X-Forwarded-For` entry is written by the caller and is
 * therefore attacker-chosen: one fresh value per attempt means the bucket never fills.
 * The rightmost entry is appended by the hop closest to us — the ingress we trust — so it
 * is the client address whether that hop appends to or replaces the header.
 * `X-Real-IP` is ignored for the same reason: nothing proves the ingress sets it.
 */
export function clientAddress(req: IncomingMessage, trustProxy = process.env.WIND_TRUST_PROXY === '1'): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
  if (trustProxy && typeof raw === 'string') {
    const hops = raw.split(',').map(h => h.trim()).filter(Boolean);
    const nearest = hops[hops.length - 1];
    if (nearest) return nearest;
  }
  return req.socket.remoteAddress ?? 'unknown';
}
