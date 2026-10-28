import { createHash } from 'node:crypto';
import type { Persistence, Row } from '../db/persistence.ts';

export const subscriptionKey = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex');
export const expoDestination = (userId: number, tokenHash: string) => `expon:${userId}:${tokenHash.slice(0, 16)}`;
/** Called before the enclosing PG commit; SQLite deliberately retains its legacy adapter. */
export async function enqueuePush(db: Persistence, ids: number[], kind: string, order: number, path?: string) {
  if (!db.inTransaction) throw new Error('Durable push requires the mutation transaction');
  const current = order ? await db.one('SELECT status,version,assignment_epoch FROM orders WHERE id=?', order) : undefined;
  const event = await db.one('SELECT append_domain_event(?, ?, ?::jsonb) AS id', order || null, 'notification.requested',
    JSON.stringify({ kind, order, ...(path ? { path } : {}), aggregateVersion: current?.version,
      assignmentEpoch: current?.assignment_epoch, status: current?.status }));
  const nativeReady = !!((await db.one("SELECT to_regclass('native_push_tokens') AS tokens"))?.tokens);
  for (const userId of new Set(ids)) {
    if (nativeReady) {
      for (const t of await db.all('SELECT token_hash FROM native_push_tokens WHERE user_id=? AND disabled_at IS NULL', userId)) {
        await db.run('INSERT INTO outbox(event_id,destination) VALUES(?::uuid,?) ON CONFLICT DO NOTHING',
          event!.id, expoDestination(userId, t.token_hash as string));
      }
    }
    for (const s of await db.all('SELECT endpoint FROM push_subscriptions WHERE user_id=?', userId)) {
      await db.run('INSERT INTO outbox(event_id,destination) VALUES(?::uuid,?) ON CONFLICT DO NOTHING',
        event!.id, `webpush:${userId}:${subscriptionKey(s.endpoint)}`);
    }
  }
}
export function publicEvent(event: Row) {
  return { eventId: event.id, aggregateId: event.order_id, sequence: event.sequence,
    aggregateVersion: event.payload.aggregateVersion, assignmentEpoch: event.payload.assignmentEpoch,
    type: event.type, occurredAt: event.occurred_at, correlationId: event.correlation_id, schemaVersion: event.schema_version, payload: event.payload };
}

/** Capability claims must reflect the installed migration, including older isolated WP02 fixtures. */
export async function durableProtocolAvailable(db: Persistence) {
  if (db.backend !== 'postgres') return false;
  const tables = await db.one("SELECT to_regclass('schema_migrations') AS migrations, to_regclass('domain_events') AS events, to_regclass('outbox') AS outbox");
  return !!(tables?.migrations && tables.events && tables.outbox && await db.one('SELECT version FROM schema_migrations WHERE version=4'));
}
