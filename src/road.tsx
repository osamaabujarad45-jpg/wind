import { useState } from 'react';
import { Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from './api';
import { approachKey, canShowOnRenderer, routeProvider, selectRenderer } from './map-provider';
import { etaRange, fromDriver, roadPath, shownApproach } from './map-math';
import { activeStatuses, city, type Order, type Point } from './model';
import { fill, palette, Row, Txt, useCopy } from './ui';

export type RoadRoute = { km: number; minutes: number; line: [number, number][]; avoids?: string[]; through?: string[]; closed?: Point[]; provider?: string };

/**
 * Road line pickup→dropoff and the live driver's ETA to the next stop (SPEC-routing-eta.md).
 * All null when routing is unavailable; the map then shows pins without a line.
 */
export function useRoad(order: Order | undefined) {
  const from = order && (order.pickupPoint ?? city(order.pickupCity));
  const to = order && (order.dropoffPoint ?? city(order.dropoffCity));
  const active = !!order && activeStatuses.includes(order.status);
  // T06: a route drawn here must come from a provider this platform's renderer may show (tasks/maps-contract.md):
  // Google-sourced geometry never reaches a MapLibre/Apple overlay, and unknown provenance fails closed.
  const renderer = selectRenderer(Platform.OS);
  const showable = (route: RoadRoute | undefined) => route && canShowOnRenderer(routeProvider(route.provider), renderer) ? route : undefined;
  const route = showable(useApi<RoadRoute>(from && to && (active || order?.status === 'searching') ? roadPath(from, to, 5) : null).data);
  // Before collection (and when returning to the sender) the driver heads to pickup, otherwise to dropoff.
  const toPickup = !!order && ['assigned', 'at_pickup', 'returning'].includes(order.status);
  // A courier with other stops first is not heading straight here: no ETA or approach line (SPEC-courier-run-eta.md).
  const driver = active && !order?.sharedRun ? order?.driverLocation : null;
  const target = toPickup ? from : to;
  const approach = useApi<RoadRoute>(driver && target ? roadPath(driver, target, 3, driver.heading) : null);
  // useApi keeps the last data when a refresh fails, so a failed fetch must not count as fresh.
  const fetched = approach.error ? undefined : showable(approach.data);
  // Keep showing the previous ETA while the next one (after ~110 m of movement) is fetched, but only to the same stop:
  // a new order, driver, stop or provider drops it rather than show an ETA to somewhere the driver is no longer heading.
  const provider = routeProvider(route?.provider ?? fetched?.provider);
  const stop = order ? approachKey(order, target, provider) : '';
  const [kept, setKept] = useState<{ stop: string; route: RoadRoute }>();
  if (fetched && (fetched !== kept?.route || kept.stop !== stop)) setKept({ stop, route: fetched });
  const eta = driver ? shownApproach(fetched, !!approach.error, kept, stop) : undefined;
  // Closed checkpoints the shown routes steer around, or still cross (SPEC-checkpoint-routing.md).
  const shown = [route, driver ? eta : undefined];
  const through = [...new Set(shown.flatMap(r => r?.through ?? []))];
  const avoids = [...new Set(shown.flatMap(r => r?.avoids ?? []))].filter(n => !through.includes(n));
  const closed = shown.flatMap(r => r?.closed ?? []).filter((p, i, all) => all.findIndex(q => q.latitude === p.latitude && q.longitude === p.longitude) === i);
  return { road: route?.line ?? null, approach: eta?.line && driver ? fromDriver(eta.line, driver) : null, eta: eta ? etaRange(eta.minutes) : null, km: eta?.km ?? null, avoids, through, closed };
}

/** One line per outcome under a route map: the route goes around closed checkpoints, or cannot. */
export function RouteCheckpoints({ avoids, through }: { avoids: string[]; through: string[] }) {
  const { c, language } = useCopy();
  if (!avoids.length && !through.length) return null;
  const sep = language === 'ar' ? '، ' : ', ';
  return <View accessibilityLiveRegion="polite" style={{ paddingHorizontal: 12, paddingBottom: 10, gap: 4 }}>
    {avoids.length > 0 && <Row gap={8}>
      <Ionicons name="git-branch-outline" size={16} color={palette.olive} />
      <Txt variant="caption" style={{ flex: 1, color: palette.olive }}>{fill(c.routeAvoids, { names: avoids.join(sep) })}</Txt>
    </Row>}
    {through.length > 0 && <Row gap={8}>
      <Ionicons name="alert-circle-outline" size={16} color={palette.error} />
      <Txt variant="caption" style={{ flex: 1, color: palette.error }}>{fill(c.routeThrough, { names: through.join(sep) })}</Txt>
    </Row>}
  </View>;
}
