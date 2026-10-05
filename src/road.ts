import { useState } from 'react';
import { useApi } from './api';
import { etaRange, roadPath } from './map-math';
import { activeStatuses, city, type Order } from './model';

type RoadRoute = { km: number; minutes: number; line: [number, number][] };

/**
 * Road line pickup→dropoff and the live driver's ETA to the next stop (SPEC-routing-eta.md).
 * All null when routing is unavailable; the map then shows pins without a line.
 */
export function useRoad(order: Order | undefined) {
  const from = order && (order.pickupPoint ?? city(order.pickupCity));
  const to = order && (order.dropoffPoint ?? city(order.dropoffCity));
  const active = !!order && activeStatuses.includes(order.status);
  const route = useApi<RoadRoute>(from && to && (active || order?.status === 'searching') ? roadPath(from, to, 5) : null).data;
  // Before collection (and when returning to the sender) the driver heads to pickup, otherwise to dropoff.
  const toPickup = !!order && ['assigned', 'at_pickup', 'returning'].includes(order.status);
  const driver = active ? order?.driverLocation : null;
  const fetched = useApi<RoadRoute>(driver && from && to ? roadPath(driver, toPickup ? from : to, 3, driver.heading) : null).data;
  // Keep showing the previous ETA while the next one (after ~110 m of movement) is fetched.
  const [kept, setKept] = useState<RoadRoute | undefined>();
  if (fetched && fetched !== kept) setKept(fetched);
  const eta = driver ? fetched ?? kept : undefined;
  return { road: route?.line ?? null, approach: eta?.line ?? null, eta: eta ? etaRange(eta.minutes) : null };
}
