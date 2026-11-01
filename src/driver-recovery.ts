import { api, ApiError } from './api';
import { apiSessionRevision, serverOffset } from './api-client';
import { driverCommandBody, newDriverCommand, readDriverCommand, resumeDriverCommand, type DriverAction, type DriverCommand, type DriverReceipt } from './driver-command';
import { recoveryStorage } from './recovery-storage';
import { effectiveRuntime } from './runtime-config';
import type { Order } from './model';
let actionQueue: Promise<unknown> = Promise.resolve();

/** One acknowledged action at a time across screens; a failed write can never be presented as saved. */
export function recoverDriverAction(actorId: number, order: Order, action?: DriverAction, payload: DriverCommand['payload'] = {}, allowed: () => boolean = () => true) {
  const revision = apiSessionRevision();
  const run = actionQueue.then(async () => {
    const valid = () => revision === apiSessionRevision() && allowed();
    if (!valid()) throw new ApiError('session_changed', 401);
    if (!order.recovery) throw new ApiError('driver_recovery_unavailable', 409);
    let saved: DriverCommand | null;
    try { saved = readDriverCommand(await recoveryStorage.read('command')); }
    catch (error) {
      if (valid()) await recoveryStorage.write('command', null, 1);
      if (error instanceof ApiError) throw error;
      throw new ApiError('recovery_storage_unavailable');
    }
    if (!valid()) throw new ApiError('session_changed', 401);
    if (!saved && !action) return { state: 'empty' as const };
    if (!saved) {
      // A definite refusal advances recovery metadata without changing status.
      // Bind a new intent to a fresh snapshot, never the screen's last poll.
      const fresh = await api<Order>(`/orders/${order.id}?recoveryProtocol=1&capacityProtocol=1&journeyProtocol=1`);
      if (!valid()) throw new ApiError('session_changed', 401);
      if (!fresh.recovery || fresh.driverId !== actorId || fresh.status !== order.status || fresh.assignedAt !== order.assignedAt
        || fresh.recovery.assignmentEpoch !== order.recovery.assignmentEpoch) throw new ApiError('order_changed', 409);
      const now = Date.now() + serverOffset();
      saved = newDriverCommand(actorId, fresh, action!, payload, now, effectiveRuntime(now).values.commandMaxAgeMs);
      order = fresh;
      await recoveryStorage.write('command', saved, effectiveRuntime(now).values.commandMaxAgeMs);
    }
    const result = await resumeDriverCommand({ read: async () => saved, write: command => recoveryStorage.write('command', command, effectiveRuntime().values.commandMaxAgeMs), valid,
      receipt: command => api<DriverReceipt>(`/orders/${command.orderId}/actions/${command.requestId}`),
      send: command => api<Order>(`/orders/${command.orderId}/${command.action}`, driverCommandBody(command)),
    }, actorId, order);
    if (result.state === 'conflict') {
      // The fresh snapshot invalidates the old version/assignment; that command cannot change the new state.
      await recoveryStorage.write('command', null, 1);
    }
    return result;
  });
  actionQueue = run.catch(() => undefined);
  return run;
}
