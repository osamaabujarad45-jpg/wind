import { newRequestId } from './command-id.ts';

// Unsent chat messages survive a lost reply and an app restart: each keeps the request id it was first sent with, so a
// resend is replayed by the server (order_messages.request_id) instead of posting twice.
export type Unsent = { requestId: string; orderId: number; body: string; at: number; afterId: number | null };
export type ChatMessage = { id: number; mine: boolean; body: string };
// ponytail: a handful per account keeps the record small for SecureStore (some iOS releases refused ~2 KB+ values)
export const MAX_UNSENT = 5;
export const UNSENT_TTL_MS = 24 * 60 * 60_000; // the server keeps a chat open about a day after the trip
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (n: unknown) => Number.isSafeInteger(n) && (n as number) > 0;

/** The account's own slot: another account on the device never reads it, and sign-out removes it. */
export const outboxKey = (userId: number) => `chatOutbox.${userId}`;

/** A saved outbox: well-formed entries younger than a day (a damaged record must never block the chat). */
export function readOutbox(raw: unknown, now: number): Unsent[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is Unsent => !!u && typeof u === 'object' && uuid.test(String(u.requestId)) && id(u.orderId)
    && typeof u.body === 'string' && u.body.trim().length > 0 && u.body.length <= 500 && Number.isSafeInteger(u.at)
    && now - u.at < UNSENT_TTL_MS && (u.afterId === null || Number.isSafeInteger(u.afterId))).slice(-MAX_UNSENT);
}

/** The entry to send. Sending a text that is already waiting unsent for this order retries that entry (same id): a
 *  person repeating it is retrying, and the server then posts it once. A full outbox refuses rather than drop a text.
 *  `afterId` is the newest message id on screen when it was queued, or null when the history was not loaded. */
export function queue(list: Unsent[], orderId: number, body: string, now: number, afterId: number | null): { list: Unsent[]; entry: Unsent } | null {
  const existing = list.find(u => u.orderId === orderId && u.body === body);
  if (existing) return { list, entry: existing };
  if (list.length >= MAX_UNSENT) return null;
  const entry = { requestId: newRequestId(), orderId, body, at: now, afterId };
  return { list: [...list, entry], entry };
}

export const without = (list: Unsent[], requestId: string) => list.filter(u => u.requestId !== requestId);

/** A refusal of the message itself (chat closed, not yours, invalid): resending can never deliver it.
 *  401, timeouts and 5xx say nothing about an earlier attempt, so the message stays unsent. */
export const undeliverable = (error: unknown) => [400, 403, 404, 409].includes((error as { status?: number } | null)?.status ?? 0);

/** Entries the server already lists as mine, newer than every message that was on screen when they were queued: the
 *  reply was lost but the message landed. An earlier identical message never matches, and an entry queued with no
 *  history loaded is left for the person to resend (the server replays it). */
export function delivered(list: Unsent[], orderId: number, messages: ChatMessage[]) {
  return list.filter(u => u.orderId === orderId && u.afterId !== null
    && messages.some(m => m.mine && m.body === u.body && m.id > (u.afterId as number)));
}

export type SendOutcome<T> = { state: 'sent'; list: Unsent[]; reply: T } | { state: 'full'; list: Unsent[] }
  | { state: 'refused' | 'unsent'; list: Unsent[]; error: unknown; durable: boolean };

/** Save, then send. `save` reports whether the record reached storage; a failure keeps the text in memory only. */
export async function sendText<T>(o: { list: Unsent[]; orderId: number; body: string; now: number; afterId: number | null;
  save: (list: Unsent[]) => Promise<boolean>; post: (entry: Unsent) => Promise<T> }): Promise<SendOutcome<T>> {
  const queued = queue(o.list, o.orderId, o.body, o.now, o.afterId);
  if (!queued) return { state: 'full', list: o.list };
  const durable = await o.save(queued.list); // before the request: a reply lost after this point is still recoverable
  try {
    const reply = await o.post(queued.entry);
    const list = without(queued.list, queued.entry.requestId);
    await o.save(list);
    return { state: 'sent', list, reply };
  } catch (error) {
    if (!undeliverable(error)) return { state: 'unsent', list: queued.list, error, durable };
    const list = without(queued.list, queued.entry.requestId);
    await o.save(list);
    return { state: 'refused', list, error, durable };
  }
}

/** Serialized writes, and none until the saved record has been read: a failed read must never be overwritten. */
export function outboxStore(io: { read: () => Promise<string | null>; write: (value: string | null) => Promise<void> }, now: () => number) {
  let list: Unsent[] = [], ready = false, tail: Promise<unknown> = Promise.resolve();
  return {
    get list() { return list; },
    async load() {
      try { const raw = await io.read(); list = raw ? readOutbox(JSON.parse(raw), now()) : []; ready = true; }
      catch { ready = false; } // unreadable: work from memory and never write over what may still be there
      return list;
    },
    save(next: Unsent[]): Promise<boolean> {
      list = next;
      if (!ready) return Promise.resolve(false);
      const write = tail.then(() => io.write(next.length ? JSON.stringify(next) : null)).then(() => true, () => false);
      tail = write;
      return write;
    },
  };
}
