import type { Order } from './model.ts';
import { serverOffset } from './api-client.ts';

/** Deadlines are server timestamps; a phone clock change must not expire a valid offer. */
export const secondsUntil = (deadline: number, now: number) => Math.max(0, Math.ceil((deadline - now - serverOffset()) / 1000));

/** Match the server's measured-over-declared precedence and bind the reviewed revision. */
export function capacityCommand(order: Pick<Order, 'measuredScope' | 'declaredScope'>) {
  const revision = order.measuredScope?.requirementsRevision ?? order.declaredScope?.revision;
  return revision === undefined ? {} : { capacityProtocol: 1, expectedRequirementsRevision: revision };
}

/** Additive lifecycle data selects the guarded path; legacy rides keep their flow. */
export function rideStep(order: Pick<Order, 'service' | 'status' | 'ride'>) {
  if (order.service !== 'ride' || !order.ride || !['assigned', 'at_pickup'].includes(order.status)) return 'advance';
  if (order.ride.arrivedAt == null) return 'arrive';
  if (order.status === 'at_pickup' && order.ride.boardingRequired)
    return order.ride.boardingLocked ? 'locked' : 'boarding';
  return 'advance';
}

/** An expired/missing lease cannot silently become a legacy accept command. */
export function dispatchAcceptance(order: Pick<Order, 'dispatch'>, now: number) {
  if (!order.dispatch) return {};
  const offer = order.dispatch.myOffer;
  if (order.dispatch.state !== 'open' || !offer?.leaseNonce || offer.expiresAt <= now + serverOffset()) return null;
  return { offerId: offer.offerId, leaseNonce: offer.leaseNonce };
}
