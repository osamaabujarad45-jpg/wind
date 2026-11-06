import { crowKm, type Order, type Point } from './model.ts';
import { serverOffset } from './api-client.ts';
import { locationState } from './location-state.ts';
import { deadlineSeconds } from './api-clock.ts';
import type { Journey } from './journey-contracts.ts';

/** Deadlines are server timestamps; a phone clock change must not expire a valid offer. */
export const secondsUntil = (deadline: number, now: number, journey?: Journey) => deadlineSeconds(deadline, journey, now);

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

/** Calibration knob: wider than the ride fence because a parcel pickup may be town-level and this only warns. */
export const PARCEL_PICKUP_FAR_KM = 1;

/** How far a courier is from a parcel's pickup while marking it arrived or collected, or null when near or unknown. A warning, never a block: GPS can be wrong. */
export function parcelPickupFarKm(order: Pick<Order, 'service' | 'status' | 'pickupPoint' | 'driverLocation'>, now: number) {
  if (order.service === 'ride' || !['assigned', 'at_pickup'].includes(order.status)) return null;
  const distance = arrivalDistanceKm(order.pickupPoint, order.driverLocation, now);
  return distance !== null && distance > PARCEL_PICKUP_FAR_KM ? distance : null;
}

/** An expired/missing lease cannot silently become a legacy accept command. */
export function dispatchAcceptance(order: Pick<Order, 'dispatch' | 'journey'>, now: number) {
  if (!order.dispatch) return {};
  const offer = order.dispatch.myOffer;
  if (order.dispatch.state !== 'open' || !offer?.leaseNonce || (order.journey ? deadlineSeconds(offer.expiresAt, order.journey, now) <= 0 : offer.expiresAt <= now + serverOffset())) return null;
  return { offerId: offer.offerId, leaseNonce: offer.leaseNonce };
}
