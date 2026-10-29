/// <reference types="node" />
// Password KDF admission: scrypt runs only in a small dedicated worker pool, so the HTTP event
// loop and the shared libuv pool (file I/O, compression, DNS) never pay for it. Stored format
// `salt:hex(32-byte key)` stays byte-compatible with the historical synchronous hashing,
// including non-hex legacy salts (T17 format guard below).
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Worker } from 'node:worker_threads';

const KEY_BYTES = 32, SALT_BYTES = 16;
const STORED = /^[^:]{1,256}:[a-f0-9]{64}$/i;

const WORKER_SOURCE = `
const { parentPort } = require('node:worker_threads');
const { scryptSync } = require('node:crypto');
parentPort.on('message', ({ id, password, salt }) => {
  try { parentPort.postMessage({ id, key: scryptSync(password, salt, 32).toString('hex') }); }
  catch { parentPort.postMessage({ id, error: true }); }
});
`;

/** Admission refusal: callers map this to a retryable 503, never to "wrong password". */
export class PasswordBusyError extends Error {
  constructor() { super('password_kdf_busy'); this.name = 'PasswordBusyError'; }
}

type Job = { password: string; salt: string; resolve: (key: string) => void; reject: (error: Error) => void };
type Slot = { worker: Worker; job?: Job };

const bound = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};
const WORKERS = bound(process.env.WIND_PASSWORD_WORKERS, 2, 1, 8);
const QUEUE_LIMIT = bound(process.env.WIND_PASSWORD_QUEUE, 64, 0, 1024);
let slots: Slot[] = [];
let queue: Job[] = [];
let serial = 0;

function pump() {
  while (queue.length) {
    const idle = slots.find(slot => !slot.job);
    if (idle) {
      const job = queue.shift()!;
      idle.job = job;
      // A running hash must keep a CLI process alive until it completes; idle slots must not.
      try { idle.worker.ref(); idle.worker.postMessage({ id: ++serial, password: job.password, salt: job.salt }); }
      catch (error) {
        idle.job = undefined;
        slots = slots.filter(slot => slot !== idle);
        void idle.worker.terminate();
        job.reject(error as Error);
      }
      continue;
    }
    if (slots.length >= WORKERS) return;
    try { slots.push(spawn()); }
    catch (error) {
      for (const job of queue.splice(0)) job.reject(error as Error);
      return;
    }
  }
}

function spawn(): Slot {
  // execArgv is cleared: an inherited `--input-type=module` would evaluate this CommonJS
  // bootstrap as ESM, where `require` does not exist.
  const slot: Slot = { worker: new Worker(WORKER_SOURCE, { eval: true, execArgv: [] }) };
  slot.worker.unref(); // an idle slot never keeps the process (or a CLI command) alive on its own
  slot.worker.on('message', (message: { id?: number; key?: string; error?: true }) => {
    const job = slot.job;
    if (!job) return;
    slot.job = undefined;
    if (message.key) job.resolve(message.key); else job.reject(new Error('password_kdf_failed'));
    pump();
    // Node 24 on Windows re-refs a worker port once it has carried a message; drop it again when idle.
    // shortcut: platform-specific workaround, retest unref semantics if the worker pool or Node major changes.
    if (!slot.job) slot.worker.unref();
  });
  const failed = (error: Error) => {
    const job = slot.job;
    slot.job = undefined;
    slots = slots.filter(other => other !== slot);
    if (job) job.reject(error);
    pump();
  };
  slot.worker.on('error', failed);
  slot.worker.on('exit', code => { if (code !== 0) failed(new Error('password_kdf_worker_exited')); });
  return slot;
}

function deriveKey(password: string, salt: string): Promise<string> {
  if (queue.length >= QUEUE_LIMIT) return Promise.reject(new PasswordBusyError());
  return new Promise((resolve, reject) => {
    queue.push({ password, salt, resolve, reject });
    pump();
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  return `${salt}:${await deriveKey(password, salt)}`;
}

export async function verifyPassword(password: string, stored: unknown) {
  // Historical salts need not be hex, but the derived key must be exactly 32 bytes.
  if (typeof stored !== 'string' || !STORED.test(stored)) return false;
  const [salt, hash] = stored.split(':');
  const actual = Buffer.from(await deriveKey(password, salt), 'hex');
  return actual.length === KEY_BYTES && timingSafeEqual(Buffer.from(hash, 'hex'), actual);
}

/** Test/ops visibility into the fixed bounds; never contains a password or key. */
export function passwordKdfStatus() {
  return Object.freeze({ workers: WORKERS, started: slots.length, active: slots.filter(slot => slot.job).length,
    queued: queue.length, queueLimit: QUEUE_LIMIT });
}

export async function closePasswordHasher() {
  const closing = slots;
  slots = [];
  for (const slot of closing) { const job = slot.job; slot.job = undefined; job?.reject(new Error('password_kdf_closed')); }
  for (const job of queue.splice(0)) job.reject(new Error('password_kdf_closed'));
  await Promise.allSettled(closing.map(slot => slot.worker.terminate()));
}
