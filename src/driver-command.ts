import { activeStatuses, exceptionReasons, type Order, type OrderStatus } from './model.ts';
import { newRequestId } from './booking.ts';

export type DriverAction = 'advance' | 'exception';
export type DriverCommand = { schemaVersion: 1; actorId: number; orderId: number; action: DriverAction; requestId: string;
  createdAt: number; expiresAt: number; expectedStatus: OrderStatus; expectedAssignedAt: number | null;
  expectedVersion?: number; expectedAssignmentEpoch?: number; expectedPinRevision?: number; payload: { code?: string; reason?: string; note?: string } };
export type DriverReceipt = { schemaVersion: 1; orderId: number; requestId: string; state: 'unknown' | 'applied' | 'rejected'; error?: string; httpStatus?: number };
export type CommandIO = { read: () => Promise<unknown>; write: (command: DriverCommand | null) => Promise<void>;
  valid: () => boolean; receipt: (command: DriverCommand) => Promise<DriverReceipt>; send: (command: DriverCommand) => Promise<Order> };
const integer = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function readDriverCommand(raw: unknown): DriverCommand | null {
  if (raw === null) return null;
  const c = raw as DriverCommand;
  if (!c || c.schemaVersion !== 1 || !integer(c.actorId) || c.actorId < 1 || !integer(c.orderId) || c.orderId < 1
    || !['advance', 'exception'].includes(c.action) || typeof c.requestId !== 'string' || !uuid.test(c.requestId)
    || !integer(c.createdAt) || !integer(c.expiresAt) || c.expiresAt <= c.createdAt || c.expiresAt - c.createdAt > 60 * 60_000
    || !activeStatuses.includes(c.expectedStatus) || !(c.expectedAssignedAt === null || integer(c.expectedAssignedAt))
    || (c.expectedVersion !== undefined && (!integer(c.expectedVersion) || c.expectedVersion < 1))
    || (c.expectedAssignmentEpoch !== undefined && !integer(c.expectedAssignmentEpoch))
    || (c.expectedPinRevision !== undefined && !integer(c.expectedPinRevision))
    || !c.payload || typeof c.payload !== 'object' || Array.isArray(c.payload)
    || Object.keys(c.payload).some(key => !['code', 'reason', 'note'].includes(key))
    || (c.payload.code !== undefined && (typeof c.payload.code !== 'string' || !/^\d{4}$/.test(c.payload.code)))
    || (c.action === 'exception' && (!exceptionReasons.includes(c.payload.reason as 'absent') || typeof c.payload.note !== 'string' || c.payload.note.length > 200))) throw new Error('invalid_pending_command');
  return c;
}

export function newDriverCommand(actorId: number, order: Order, action: DriverAction, payload: DriverCommand['payload'], now: number, ttl: number): DriverCommand {
  if (order.driverId !== actorId || !order.recovery) throw new Error('driver_recovery_unavailable');
  return readDriverCommand({ schemaVersion: 1, actorId, orderId: order.id, action, requestId: newRequestId(), createdAt: now, expiresAt: now + ttl,
    expectedStatus: order.status, expectedAssignedAt: order.assignedAt ?? null,
    ...(order.recovery.version != null ? { expectedVersion: order.recovery.version } : {}),
    ...(order.recovery.assignmentEpoch != null ? { expectedAssignmentEpoch: order.recovery.assignmentEpoch } : {}),
    ...(order.journey?.boarding && payload.code ? { expectedPinRevision: order.journey.boarding.pinRevision } : {}), payload })!;
}
export const driverCommandBody = (c: DriverCommand) => ({ ...c.payload, requestId: c.requestId, recoveryProtocol: 1,
  expectedStatus: c.expectedStatus, expectedAssignedAt: c.expectedAssignedAt, attemptCreatedAt: c.createdAt, attemptExpiresAt: c.expiresAt,
  ...(c.expectedVersion !== undefined ? { expectedVersion: c.expectedVersion } : {}),
  ...(c.expectedPinRevision !== undefined ? { expectedPinRevision: c.expectedPinRevision } : {}),
  ...(c.expectedAssignmentEpoch !== undefined ? { expectedAssignmentEpoch: c.expectedAssignmentEpoch } : {}) });
export type AdvanceRequest = { requestId: string; expectedStatus: string; code: string; expectedPinRevision?: number };
/** Screen-held advance (no saved recovery): a lost acknowledgement replays the same request; a new status, code
 * or rotated PIN is a new one, so a retry never pairs an old code with the new revision. */
export function advanceRequest(cached: { orderId: number; body: AdvanceRequest } | null, orderId: number,
  proof: Omit<AdvanceRequest, 'requestId'>, newId: () => string) {
  return cached?.orderId === orderId && cached.body.expectedStatus === proof.expectedStatus && cached.body.code === proof.code
    && cached.body.expectedPinRevision === proof.expectedPinRevision ? cached : { orderId, body: { requestId: newId(), ...proof } };
}
export const commandMatches = (c: DriverCommand, actorId: number, order: Order) => c.actorId === actorId && c.orderId === order.id && order.driverId === actorId
  && c.expectedStatus === order.status && c.expectedAssignedAt === (order.assignedAt ?? null)
  && (c.expectedVersion === undefined || c.expectedVersion === order.recovery?.version)
  && (c.expectedAssignmentEpoch === undefined || c.expectedAssignmentEpoch === order.recovery?.assignmentEpoch)
  && (c.expectedPinRevision === undefined || c.expectedPinRevision === order.journey?.boarding?.pinRevision);

/** A saved earlier command went first and was reconciled: it is not the action just requested, so its outcome is reported
 * as the earlier one's, never as the new action's success. One saved for another order was not reconciled at all. */
export const earlierOutcome = <T extends { state: string }>(result: T, earlier: boolean) =>
  earlier && result.state !== 'other_order' ? { state: 'previous' as const, previous: result } : result;

/** This bounded outbox never runs a restored action without a fresh authorized order snapshot. */
export async function resumeDriverCommand(io: CommandIO, actorId: number, order: Order) {
  const command = readDriverCommand(await io.read());
  if (!command) return { state: 'empty' as const };
  if (!io.valid()) throw new Error('session_changed');
  if (command.actorId !== actorId || command.orderId !== order.id) return { state: 'other_order' as const, orderId: command.orderId };
  let receipt: DriverReceipt;
  try { receipt = await io.receipt(command); }
  catch (error) {
    if (io.valid() && [403,404].includes((error as { status?: number }).status ?? 0)) await io.write(null);
    throw error;
  }
  if (!io.valid()) throw new Error('session_changed');
  if (receipt.orderId !== command.orderId || receipt.requestId !== command.requestId || receipt.schemaVersion !== 1
    || !['unknown', 'applied', 'rejected'].includes(receipt.state)) throw new Error('invalid_response');
  if (receipt.state !== 'unknown') {
    await io.write(null);
    return { state: receipt.state, error: receipt.error, httpStatus: receipt.httpStatus };
  }
  if (!commandMatches(command, actorId, order)) {
    // A decision may have committed while its receipt was not yet visible. Keep the identity; never invent an ACK.
    return { state: 'conflict' as const };
  }
  try {
    const updated = await io.send(command);
    if (!io.valid()) throw new Error('session_changed');
    await io.write(null);
    return { state: 'applied' as const, order: updated };
  } catch (error) {
    const e = error as { status?: number; message?: string };
    if (io.valid() && e.status && e.status < 500 && ![401,408,426,429].includes(e.status) && e.message !== 'idempotency_conflict') await io.write(null);
    throw error;
  }
}

/** A courier acts on parcel B while a command is saved for parcel A. A may be reassigned and impossible to open, so settle it from
 * here, as its own screen would; otherwise B stays blocked until the command expires. 'empty' means nothing stands in B's way.
 * The command is kept only while its outcome is really unknown, such as offline. */
export async function settleOtherOrder(io: CommandIO, actorId: number, command: DriverCommand, snapshot: (orderId: number) => Promise<Order>) {
  const otherOrder = { state: 'other_order' as const, orderId: command.orderId };
  const dropped = async () => { await io.write(null); return { state: 'empty' as const }; };
  const noLongerTheirs = (error: unknown) => [403, 404].includes((error as { status?: number }).status ?? 0);
  let other: Order;
  try { other = await snapshot(command.orderId); }
  catch (error) {
    if (!io.valid()) throw new Error('session_changed');
    return noLongerTheirs(error) ? dropped() : otherOrder;
  }
  if (!io.valid()) throw new Error('session_changed');
  if (other.driverId !== actorId || !other.recovery) return dropped();
  try {
    const settled = await resumeDriverCommand(io, actorId, other);
    if (settled.state === 'conflict') await io.write(null);
    return 'order' in settled ? { state: 'applied' as const } : settled; // that order is not the screen's: it reloads its own
  } catch (error) {
    if (!io.valid()) throw new Error('session_changed');
    if (noLongerTheirs(error)) return dropped();
    return await io.read() ? otherOrder : { state: 'rejected' as const }; // resume drops the command only on a definite refusal
  }
}
