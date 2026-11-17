import { newRequestId } from './command-id.ts';

// Unsent chat messages survive an app restart: each keeps the request id it was first sent with, so a resend after a
// lost reply is replayed by the server (order_messages.request_id) instead of posting twice.
export type Unsent = { requestId: string; body: string; at: number };
export const MAX_UNSENT = 5; // ponytail: a handful per order keeps the record small for SecureStore (iOS has refused ~2 KB+ values)
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The account's own slot for one order: another account on the device never reads it. */
export const outboxKey = (userId: number, orderId: number) => `chatOutbox.${userId}.${orderId}`;

/** A saved outbox, keeping only well-formed entries (a damaged record must not block the chat). */
export function readOutbox(raw: unknown): Unsent[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is Unsent => !!u && typeof u === 'object' && uuid.test(String(u.requestId))
    && typeof u.body === 'string' && u.body.trim().length > 0 && u.body.length <= 500 && Number.isSafeInteger(u.at)).slice(-MAX_UNSENT);
}

/** The entry to send for this text: an unsent copy of the same text keeps its id; a new text gets a new one. */
export function queue(list: Unsent[], body: string, now: number): { list: Unsent[]; entry: Unsent } {
  const existing = list.find(u => u.body === body);
  if (existing) return { list, entry: existing };
  const entry = { requestId: newRequestId(), body, at: now };
  return { list: [...list, entry].slice(-MAX_UNSENT), entry };
}

export const without = (list: Unsent[], requestId: string) => list.filter(u => u.requestId !== requestId);

/** A refusal of the message itself (chat closed, not yours, invalid): resending can never deliver it.
 *  401, timeouts and 5xx say nothing about an earlier attempt, so the message stays unsent. */
export const undeliverable = (error: unknown) => [400, 403, 404, 409].includes((error as { status?: number } | null)?.status ?? 0);

/** Entries the server already shows as sent by me after they were queued: the reply was lost but the message landed.
 *  ponytail: matched by text and time (the list carries no request id), with a 5-minute clock allowance. */
export function delivered(list: Unsent[], messages: { mine: boolean; body: string; createdAt: number }[]) {
  return list.filter(u => messages.some(m => m.mine && m.body === u.body && m.createdAt >= u.at - 5 * 60_000));
}
