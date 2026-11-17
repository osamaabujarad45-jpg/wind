export type RecoverySlot = 'command' | 'summary' | 'diagnostics';
type IO = { read: (key: string) => Promise<string | null>; write: (key: string, value: string | null) => Promise<void>;
  credential: () => Promise<string | null>; revision: () => number; now: () => number;
  namespace: (token: string) => Promise<string>; currentCredential?: (token: string) => Promise<boolean>;
  seal: (plaintext: string, token: string, slot: RecoverySlot) => Promise<string>;
  open: (ciphertext: string, token: string, slot: RecoverySlot) => Promise<string> };
const slots: RecoverySlot[] = ['command', 'summary', 'diagnostics'];
const MAX_CIPHERTEXT = 2000;
const key = (slot: RecoverySlot, namespace: string) => `wind.recovery.v1.${namespace}.${slot}`;
const INDEX = 'wind.recovery.v1.index';

/** The only persisted records are bounded ciphertext. Logout serializes behind older writes. */
export function createProtectedRecovery(io: IO) {
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(run: () => Promise<T>) => {
    const next = tail.then(run); tail = next.catch(() => undefined); return next;
  };
  const guard = (revision: number) => { if (revision !== io.revision()) throw new Error('session_changed'); };
  const same = async (token: string) => await io.credential() === token && (!io.currentCredential || await io.currentCredential(token));
  const namespace = async (token: string) => {
    const value = await io.namespace(token);
    if (!/^[a-f0-9]{16,64}$/.test(value)) throw new Error('invalid_recovery_namespace');
    return value;
  };
  const remember = async (value: string) => {
    let known: string[] = [];
    try { const raw = JSON.parse(await io.read(INDEX) ?? '[]'); if (Array.isArray(raw)) known = raw.filter(item => typeof item === 'string' && /^[a-f0-9]{16,64}$/.test(item)).slice(-8); } catch { /* Only nonsecret namespace tags live in this index. */ }
    const next = [...known.filter(item => item !== value), value];
    while (next.length > 8) { const old = next.shift()!; for (const slot of slots) await io.write(key(slot, old), null); }
    await io.write(INDEX, JSON.stringify(next));
  };
  return {
    read(slot: RecoverySlot): Promise<unknown> {
      const revision = io.revision();
      return serial(async () => {
        guard(revision);
        const token = await io.credential(); guard(revision);
        if (!token) return null;
        if (!await same(token)) throw new Error('session_changed');
        const recordKey = key(slot, await namespace(token)); guard(revision);
        const ciphertext = await io.read(recordKey); guard(revision);
        if (ciphertext === null) return null;
        try {
          if (ciphertext.length > MAX_CIPHERTEXT) throw new Error('invalid_recovery_record');
          const envelope = JSON.parse(await io.open(ciphertext, token, slot)); guard(revision);
          if (!await same(token)) throw new Error('session_changed');
          const now = io.now();
          if (!envelope || envelope.schemaVersion !== 1 || !Number.isSafeInteger(envelope.createdAt) || !Number.isSafeInteger(envelope.expiresAt)
            || envelope.createdAt > now + 5_000 || envelope.expiresAt <= now || envelope.expiresAt <= envelope.createdAt
            || envelope.expiresAt - envelope.createdAt > 24 * 60 * 60_000) throw new Error('invalid_recovery_record');
          return envelope.data;
        } catch (error) {
          guard(revision);
          if (!await same(token)) throw new Error('session_changed');
          await io.write(recordKey, null);
          throw new Error('recovery_record_unavailable', { cause: error });
        }
      });
    },
    write(slot: RecoverySlot, data: unknown, ttl: number): Promise<void> {
      const revision = io.revision();
      return serial(async () => {
        guard(revision);
        const token = await io.credential(); guard(revision);
        if (!token) throw new Error('session_changed');
        if (!await same(token)) throw new Error('session_changed');
        const scope = await namespace(token), recordKey = key(slot, scope); guard(revision);
        if (data === null) { await io.write(recordKey, null); return; }
        if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 24 * 60 * 60_000) throw new Error('invalid_recovery_lifetime');
        const now = io.now(), plaintext = JSON.stringify({ schemaVersion: 1, createdAt: now, expiresAt: now + ttl, data });
        const ciphertext = await io.seal(plaintext, token, slot); guard(revision);
        if (!await same(token)) throw new Error('session_changed');
        if (ciphertext.length > MAX_CIPHERTEXT) throw new Error('recovery_record_too_large');
        await remember(scope); guard(revision);
        await io.write(recordKey, ciphertext);
        if (revision !== io.revision() || !await same(token)) { await io.write(recordKey, null); throw new Error('session_changed'); }
      });
    },
    /** Runs after older writes. A session that took over while it waited keeps its records.
     *  Checks identity only, never same(): sign-out deletes the stored token first (session.tsx forget), so same() would be false and nothing would clear. */
    clear(ended: string): Promise<void> { return serial(async () => {
      if (await io.credential() !== ended) return;
      const scope = await namespace(ended); for (const slot of slots) await io.write(key(slot, scope), null);
    }); },
  };
}
