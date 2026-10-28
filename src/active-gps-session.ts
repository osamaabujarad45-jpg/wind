import type { ActiveGps } from './location-delivery';

type Candidate = { token: string; actor: number; orders: number[]; deviceId: string; sessionId: string; previousSessionId: string | null; expectedGeneration: number };
type Reply = { sessionId: string | null; generation: number; seq?: number; assignments?: ActiveGps['assignments'] };
type IO = { token: () => Promise<string | null>; readCandidate: () => Promise<Candidate | null>; writeCandidate: (value: Candidate | null) => Promise<void>;
  deviceId: () => Promise<string>; uuid: () => string; request: (token: string, body: object) => Promise<Reply>; valid: () => boolean };
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const same = (a: number[], b: number[]) => a.length === b.length && a.every((id, i) => id === b[i]);

// Only a foreground caller may run this. A persisted command permits an exact retry after a lost ACK.
export async function acquireActiveGps(actor: number, orderIds: number[], io: IO): Promise<ActiveGps | null> {
  const orders = [...new Set(orderIds)].sort((a, b) => a - b);
  if (!orders.length || orders.some(id => !integer(id) || id === 0) || !io.valid()) return null;
  const token = await io.token();
  const current = async () => io.valid() && token !== null && await io.token() === token;
  if (!token || !await current()) return null;
  const deviceId = await io.deviceId();
  let candidate = await io.readCandidate();
  if (!await current()) return null;
  if (!candidate || candidate.token !== token || candidate.actor !== actor || candidate.deviceId !== deviceId || !same(candidate.orders, orders)) {
    const inspected = await io.request(token, { deviceId });
    if (!await current() || !integer(inspected.generation) || !(inspected.sessionId === null || typeof inspected.sessionId === 'string')) return null;
    candidate = { token, actor, orders, deviceId, sessionId: io.uuid(), previousSessionId: inspected.sessionId, expectedGeneration: inspected.generation };
    await io.writeCandidate(candidate);
  }
  if (!await current()) return null;
  const { sessionId, previousSessionId, expectedGeneration } = candidate;
  const reply = await io.request(token, { deviceId, sessionId, previousSessionId, expectedGeneration });
  if (!await current() || reply.sessionId !== sessionId || reply.generation !== expectedGeneration + 1 || !integer(reply.seq) || !Array.isArray(reply.assignments)) return null;
  const assignments = reply.assignments;
  if (assignments.some(a => !integer(a.orderId) || !integer(a.assignmentEpoch)) || !same(assignments.map(a => a.orderId).sort((a,b) => a-b), orders)) return null;
  if (!await current()) return null;
  // The command has succeeded and its generation is spent; a later start must inspect fresh.
  await io.writeCandidate(null);
  return { deviceId, sessionId, seq: reply.seq, assignments };
}
