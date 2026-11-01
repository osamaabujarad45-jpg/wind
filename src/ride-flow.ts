import { crowKm, type Order, type Point } from './model.ts';
import { serverOffset } from './api-client.ts';
import { locationState } from './location-state.ts';

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

/** The server's arrival fence (server/domain/ride-lifecycle.ts); a test keeps the two equal. */
export const RIDE_ARRIVAL_RADIUS_METERS = 300, RIDE_ARRIVAL_FIX_MAX_AGE_MS = 120_000;

/** Pickup distance from the driver's latest fix, or null when there is no fix fresh enough to judge by. */
export function arrivalDistanceKm(pickup: Point | null | undefined, fix: Order['driverLocation'], now: number) {
  const age = locationState(fix, now)?.ageSeconds;
  // ponytail: a hint only, never a block; the server may hold a fresher presence fix than this screen polled.
  return pickup && fix && age !== undefined && age * 1000 <= RIDE_ARRIVAL_FIX_MAX_AGE_MS ? crowKm(pickup, fix) : null;
}

/** An expired/missing lease cannot silently become a legacy accept command. */
export function dispatchAcceptance(order: Pick<Order, 'dispatch'>, now: number) {
  if (!order.dispatch) return {};
  const offer = order.dispatch.myOffer;
  if (order.dispatch.state !== 'open' || !offer?.leaseNonce || offer.expiresAt <= now + serverOffset()) return null;
  return { offerId: offer.offerId, leaseNonce: offer.leaseNonce };
}
