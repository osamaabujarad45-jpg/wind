// In-app support inbox (owner decision 22 Nov 2026; SPEC-support-inbox.md). Customers, captains and shops write to Wind
// support inside the app; staff (admin, or a support-scoped staff member) answer, close and tag each conversation so the
// feedback rolls up into improvements. Additive module: the frozen main.ts route inventory requires new routes to own
// their declarations. One open thread per person; a message from someone with none opens one. Callers run under the HTTP
// envelope's transaction, which queuePush requires.
import type { SQLInputValue } from 'node:sqlite';
import type { User } from '../../src/model.ts';
import type { Row, WriteResult } from '../db/persistence.ts';

type Fail = (status: number, message: string) => never;
type Ctx = { user: User; params: string[]; body: Row; query: URLSearchParams };
type Register = (method: string, path: string, handler: (ctx: Ctx) => Promise<unknown>) => unknown;
type Deps = {
  one: (sql: string, ...args: SQLInputValue[]) => Promise<Row | undefined>;
  all: (sql: string, ...args: SQLInputValue[]) => Promise<Row[]>;
  run: (sql: string, ...args: SQLInputValue[]) => Promise<WriteResult>;
  fail: Fail;
  text: (value: unknown, max: number, required?: boolean) => string;
  /** Admin role and the support (or full) staff scope. */
  needSupport: (user: User) => Promise<void>;
  /** Rate limit by key: throws 429 when exceeded. */
  limit: (key: string, maximum: number, windowMs: number) => Promise<unknown>;
  limitKey: (userId: number) => string;
  queuePush: (ids: number[], kind: 'support' | 'attention', order: number, path?: string) => Promise<void>;
  staffIds: () => Promise<number[]>;
};

export const SUPPORT_TAGS = ['checkpoints', 'eta', 'pricing', 'captain', 'app_bug', 'payment', 'safety', 'other'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGE_MAX = 1000;
const PAGE = 50;

/** 0599123456 → 059 ••• 3456: lists never show a whole number (admin.md: full number on the person's page only). */
export const maskPhone = (phone: unknown) => {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length < 7 ? '•••' : `${digits.slice(0, 3)} ••• ${digits.slice(-4)}`;
};
const tagsOf = (value: unknown) => String(value ?? '').split(',').filter(Boolean);

export function registerSupportRoutes(route: Register, deps: Deps): void {
  const { one, all, run, fail } = deps;

  const message = (m: Row, viewer: number) => ({ id: m.id, fromStaff: !!m.from_staff, mine: m.sender_id === viewer, body: m.body, createdAt: m.created_at });
  const messages = async (threadId: number, viewer: number) =>
    (await all('SELECT id, sender_id, from_staff, body, created_at FROM support_messages WHERE thread_id = ? ORDER BY id DESC LIMIT ?', threadId, PAGE))
      .reverse().map(m => message(m, viewer));
  const threadView = (t: Row) => ({ id: t.id, status: t.status, orderId: t.order_id ?? null, tags: tagsOf(t.tags), lastFrom: t.last_from,
    createdAt: t.created_at, updatedAt: t.updated_at, closedAt: t.closed_at ?? null });
  // The person may link one of their own orders: as its customer or its captain. Anyone else's order reads as missing.
  const ownOrder = async (user: User, orderId: unknown) => {
    if (orderId == null) return null;
    const id = Number(orderId);
    if (!Number.isSafeInteger(id) || id <= 0) fail(400, 'invalid_input');
    const order = await one('SELECT id FROM orders WHERE id = ? AND (customer_id = ? OR driver_id = ?)', id, user.id, user.id);
    return order ? id : fail(404, 'not_found');
  };
  const requestIdOf = (value: unknown) => {
    if (typeof value !== 'string' || !UUID.test(value)) fail(400, 'invalid_request_id');
    return value as string;
  };

  // ---------- the person ----------
  route('GET', '/api/support/thread', async ({ user }) => {
    const thread = (await one("SELECT * FROM support_threads WHERE user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1", user.id))
      ?? (await one('SELECT * FROM support_threads WHERE user_id = ? ORDER BY id DESC LIMIT 1', user.id));
    return thread ? { thread: threadView(thread), messages: await messages(thread.id, user.id) } : { thread: null, messages: [] };
  });

  route('POST', '/api/support/messages', async ({ user, body }) => {
    const text = deps.text(body.body, MESSAGE_MAX);
    if (!text.trim()) fail(400, 'invalid_input');
    const requestId = requestIdOf(body.requestId);
    const orderId = await ownOrder(user, body.orderId);
    // A resend after a lost reply replays instead of posting twice.
    const saved = await one('SELECT m.thread_id, m.body FROM support_messages m WHERE m.sender_id = ? AND m.request_id = ?', user.id, requestId);
    if (saved) {
      if (saved.body !== text) fail(409, 'idempotency_conflict');
      const thread = (await one('SELECT * FROM support_threads WHERE id = ?', saved.thread_id))!;
      return { thread: threadView(thread), messages: await messages(thread.id, user.id) };
    }
    await deps.limit(deps.limitKey(user.id), 20, 10 * 60_000);
    const now = Date.now();
    let thread = await one("SELECT * FROM support_threads WHERE user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1", user.id);
    const opened = !thread;
    if (!thread) {
      await run("INSERT INTO support_threads (user_id, order_id, status, tags, last_from, created_at, updated_at) VALUES (?, ?, 'open', '', 'user', ?, ?)",
        user.id, orderId, now, now);
      thread = (await one("SELECT * FROM support_threads WHERE user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1", user.id))!;
    } else {
      await run("UPDATE support_threads SET last_from = 'user', updated_at = ?, order_id = COALESCE(order_id, ?) WHERE id = ?", now, orderId, thread.id);
    }
    await run('INSERT INTO support_messages (thread_id, sender_id, from_staff, body, created_at, request_id) VALUES (?, ?, 0, ?, ?, ?)',
      thread.id, user.id, text, now, requestId);
    // A new conversation tells the staff once; follow-ups show in the inbox count instead of a push each.
    if (opened) await deps.queuePush((await deps.staffIds()).filter(id => id !== user.id), 'attention', 0, '/admin/support');
    const fresh = (await one('SELECT * FROM support_threads WHERE id = ?', thread.id))!;
    return { thread: threadView(fresh), messages: await messages(fresh.id, user.id) };
  });

  // ---------- staff ----------
  const person = (r: Row, full: boolean) => ({ id: r.user_id, name: r.user_name, role: r.user_role, phone: full ? r.user_phone : maskPhone(r.user_phone) });
  const threadWithPerson = `SELECT t.*, u.name user_name, u.role user_role, u.phone user_phone FROM support_threads t JOIN users u ON u.id = t.user_id`;

  route('GET', '/api/admin/support', async ({ user, query }) => {
    await deps.needSupport(user);
    const status = query.get('status') === 'closed' ? 'closed' : 'open';
    const tag = query.get('tag');
    if (tag && !(SUPPORT_TAGS as readonly string[]).includes(tag)) fail(400, 'invalid_input');
    // Open: oldest waiting first. Closed: most recent first.
    const rows = await all(`${threadWithPerson} WHERE t.status = ? ${tag ? "AND (',' || t.tags || ',') LIKE ?" : ''}
      ORDER BY ${status === 'open' ? 't.updated_at ASC' : 't.updated_at DESC'} LIMIT 100`, ...(tag ? [status, `%,${tag},%`] : [status]));
    const lasts = rows.length ? await all(`SELECT thread_id, body, from_staff, created_at FROM support_messages WHERE id IN
      (SELECT MAX(id) FROM support_messages WHERE thread_id IN (${rows.map(() => '?').join(',')}) GROUP BY thread_id)`, ...rows.map(r => r.id as number)) : [];
    const lastBy = new Map(lasts.map(m => [m.thread_id, m]));
    return rows.map(r => {
      const last = lastBy.get(r.id);
      return { ...threadView(r), person: person(r, false), waiting: r.last_from === 'user' && r.status === 'open',
        last: last ? { body: String(last.body).slice(0, 140), fromStaff: !!last.from_staff, createdAt: last.created_at } : null };
    });
  });

  const staffThread = async (user: User, id: string) => {
    await deps.needSupport(user);
    return (await one(`${threadWithPerson} WHERE t.id = ?`, Number(id))) ?? fail(404, 'not_found');
  };
  const detail = async (user: User, t: Row) => {
    const order = t.order_id == null ? null : await one(`SELECT o.id, o.service, o.status, o.pickup_city, o.dropoff_city, d.name driver_name
      FROM orders o LEFT JOIN users d ON d.id = o.driver_id WHERE o.id = ?`, t.order_id);
    const history = await one('SELECT COUNT(*) n FROM orders WHERE customer_id = ? OR driver_id = ?', t.user_id, t.user_id);
    return { ...threadView(t), person: { ...person(t, true), orders: Number(history?.n ?? 0) },
      order: order ? { id: order.id, service: order.service, status: order.status, from: order.pickup_city, to: order.dropoff_city, captain: order.driver_name ?? null } : null,
      messages: await messages(t.id, user.id) };
  };

  route('GET', '/api/admin/support/:id', async ({ user, params }) => detail(user, await staffThread(user, params[0]!)));

  route('POST', '/api/admin/support/:id/reply', async ({ user, params, body }) => {
    const t = await staffThread(user, params[0]!);
    const text = deps.text(body.body, MESSAGE_MAX);
    if (!text.trim()) fail(400, 'invalid_input');
    const requestId = requestIdOf(body.requestId);
    const saved = await one('SELECT thread_id, body FROM support_messages WHERE sender_id = ? AND request_id = ?', user.id, requestId);
    if (saved) {
      if (saved.thread_id !== t.id || saved.body !== text) fail(409, 'idempotency_conflict');
      return detail(user, t);
    }
    const now = Date.now();
    await run('INSERT INTO support_messages (thread_id, sender_id, from_staff, body, created_at, request_id) VALUES (?, ?, 1, ?, ?, ?)', t.id, user.id, text, now, requestId);
    // Answering a closed conversation reopens it: the person sees the reply in their open thread.
    await run("UPDATE support_threads SET last_from = 'staff', updated_at = ?, status = 'open', closed_at = NULL, closed_by = NULL WHERE id = ?", now, t.id);
    await deps.queuePush([t.user_id as number], 'support', t.order_id ?? 0, '/support');
    return detail(user, (await one(`${threadWithPerson} WHERE t.id = ?`, t.id))!);
  });

  route('POST', '/api/admin/support/:id/close', async ({ user, params }) => {
    const t = await staffThread(user, params[0]!);
    await run("UPDATE support_threads SET status = 'closed', closed_at = ?, closed_by = ?, updated_at = ? WHERE id = ? AND status = 'open'", Date.now(), user.id, Date.now(), t.id);
    return detail(user, (await one(`${threadWithPerson} WHERE t.id = ?`, t.id))!);
  });

  route('POST', '/api/admin/support/:id/reopen', async ({ user, params }) => {
    const t = await staffThread(user, params[0]!);
    // One open thread per person: reopening an old one while a newer is open would split the conversation.
    if (await one("SELECT id FROM support_threads WHERE user_id = ? AND status = 'open' AND id <> ?", t.user_id, t.id)) fail(409, 'already_open');
    await run("UPDATE support_threads SET status = 'open', closed_at = NULL, closed_by = NULL, updated_at = ? WHERE id = ?", Date.now(), t.id);
    return detail(user, (await one(`${threadWithPerson} WHERE t.id = ?`, t.id))!);
  });

  route('POST', '/api/admin/support/:id/tags', async ({ user, params, body }) => {
    const t = await staffThread(user, params[0]!);
    const tags = body.tags;
    if (!Array.isArray(tags) || tags.length > SUPPORT_TAGS.length || !tags.every(tag => (SUPPORT_TAGS as readonly string[]).includes(tag))) fail(400, 'invalid_input');
    const unique = SUPPORT_TAGS.filter(tag => (tags as string[]).includes(tag)); // stable order, no duplicates
    await run('UPDATE support_threads SET tags = ? WHERE id = ?', unique.join(','), t.id);
    return detail(user, (await one(`${threadWithPerson} WHERE t.id = ?`, t.id))!);
  });

  // The Improvements view: how often each theme came up in the last 30 days, with the latest example.
  route('GET', '/api/admin/support/tags', async ({ user }) => {
    await deps.needSupport(user);
    const since = Date.now() - 30 * 86_400_000;
    const rows = await all("SELECT id, tags FROM support_threads WHERE created_at >= ? AND tags <> ''", since);
    return SUPPORT_TAGS.map(tag => ({ tag, count: rows.filter(r => tagsOf(r.tags).includes(tag)).length }));
  });
}
