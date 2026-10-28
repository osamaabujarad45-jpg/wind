// Command IDs and device scope for the phone commands. Pure: the random source, digest and storage are passed in.
// A command ID is one attempt. After a lost acknowledgment the same request keeps its ID, so the server replays its receipt
// instead of sending again. Any answer from the server, success or error, ends that attempt: the next one gets a new ID.
import { ApiError } from '../api-client.ts';
import { outcomeOf } from './flow.ts';

export type Held = { commandId: string; key: string };
export type Slot = { read(): Promise<Held | null>; write(value: Held | null): Promise<void> };
export type KeyValue = {
  get(key: string, required?: boolean): Promise<string | null>; set(key: string, value: string | null, required?: boolean): Promise<unknown>;
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Storage that must answer before anything is sent. A failure is a storage error, never a guess and never a server answer. */
async function must<T>(op: () => Promise<T>): Promise<T> {
  try { return await op(); } catch { throw new ApiError('storage_unavailable'); }
}

// Command IDs this session has already settled. Their receipts are finished, so a later attempt never replays one, even if
// clearing its stored copy failed. A restart can replay that stored receipt once: the server answers it without sending again.
const settled = new Set<string>();

/** An in-memory slot: the code or password never leaves the screen's memory. */
export function memorySlot(): Slot {
  let held: Held | null = null;
  return { read: async () => held, write: async value => { held = value; } };
}

/** A slot in secure storage, bound to one session scope: a different sign-in never reads an earlier request. */
export function storedSlot(store: KeyValue, storageKey: string, scope: string): Slot {
  return {
    read: async () => {
      const raw = await must(() => store.get(storageKey, true));
      if (!raw) return null;
      try {
        const saved = JSON.parse(raw) as { scope?: unknown; commandId?: unknown; key?: unknown };
        return saved.scope === scope && typeof saved.commandId === 'string' && typeof saved.key === 'string'
          ? { commandId: saved.commandId, key: saved.key } : null;
      } catch { return null; }
    },
    // Required: web storage.set swallows a failed write unless asked, and a request must not go out without its receipt.
    write: async value => { await must(() => store.set(storageKey, value ? JSON.stringify({ scope, ...value }) : null, true)); },
  };
}

export function commandSlot(slot: Slot, newId: () => string) {
  let attempt = '';
  return {
    /** The ID for this payload: the held one when the same payload was unresolved, otherwise a new one. Throws before any request if the receipt cannot be saved. */
    async begin(key: string): Promise<string> {
      const held = await slot.read();
      if (held?.key === key && !settled.has(held.commandId)) return attempt = held.commandId;
      const commandId = newId();
      await slot.write({ commandId, key });
      return attempt = commandId;
    },
    /** Call with the error code (or 'ok'). Only an unknown outcome keeps the ID for a retry. */
    async settle(code: string | 'ok'): Promise<void> {
      if (code !== 'ok' && outcomeOf(code) !== 'definitive') return;
      settled.add(attempt);
      // ponytail: a failed clear is swallowed on purpose; the settled set above stops the stale copy from being replayed in this session.
      await slot.write(null).catch(() => {});
    },
  };
}

export type Commands = ReturnType<typeof commandSlot>;

/** Install-level UUID for the phone scope. Stored once, validated on read, never derived from anything guessable. */
export const DEVICE_KEY = 'wp06.phone.device';
// Callers that start together share one read-or-create per store: none can write a second ID over one already handed out.
const deviceLoads = new WeakMap<KeyValue, Promise<string>>();
export function stableDeviceId(store: KeyValue, newId: () => string): Promise<string> {
  const pending = deviceLoads.get(store) ?? loadDeviceId(store, newId).finally(() => deviceLoads.delete(store));
  deviceLoads.set(store, pending);
  return pending;
}

async function loadDeviceId(store: KeyValue, newId: () => string): Promise<string> {
  const saved = await must(() => store.get(DEVICE_KEY, true));
  if (saved && UUID_V4.test(saved)) return saved;
  const id = newId();
  await must(() => store.set(DEVICE_KEY, id, true));
  return id;
}

/** Scope for stored pending requests. The digest keeps the bearer token itself out of storage. */
export async function sessionScope(token: string | null, digest: (value: string) => Promise<string>): Promise<string> {
  return token ? `s:${await digest(token)}` : 'none';
}
