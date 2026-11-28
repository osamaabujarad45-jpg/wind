import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Point } from './model';
import { useCopy } from './ui';
import { themedStyles } from './theme-context';

/** What the app's own chrome covers at the map's edges, in points: the camera and the pin keep clear of it. */
export type MapInsets = { top?: number; bottom?: number; left?: number; right?: number };
export type UserDot = Point & { accuracy?: number | null };
export type RouteMapProps = {
  pickup: Point; dropoff: Point; pickupTitle: string; dropoffTitle: string;
  driver?: (Point & { heading?: number | null; accuracy?: number | null }) | null; driverTitle?: string;
  /** The fix is old (lost signal): the marker fades so it reads as "last seen here", not live. */
  stale?: boolean;
  /** Which stop the live view frames with the driver: pickup before collection, dropoff after. */
  focus?: 'pickup' | 'dropoff'; height?: number;
  /** Road geometry [lng, lat][] pickup→dropoff from /api/route. Without it no line is drawn (never a straight one). */
  road?: [number, number][] | null;
  /** Road geometry from the live driver to the next stop, drawn in the driver colour. */
  approach?: [number, number][] | null;
  /** Closed checkpoints the route goes around (or still crosses), drawn as no-entry markers. */
  closed?: Point[] | null;
  /** Anonymous and public surfaces draw the free baseline only: no paid route, no Google tiles (T15). */
  forceBaseline?: boolean;
  /** Fill the parent instead of a fixed height, with the app's chrome over it. */
  fill?: boolean; insets?: MapInsets; padding?: number;
  /** The camera stays on the car at street level (the driver) instead of framing the car with the next stop. */
  follow?: boolean;
  /** The customer's own position, as a blue dot. */
  user?: UserDot | null;
  /** Minutes on the next stop's label, and names over the stops. */
  eta?: string | null; stopLabels?: { pickup?: string; dropoff?: string } | null;
  /** Internal adapter failure signal; the shared provider boundary owns fallback and retry. */
  onFail?: () => void;
};
export type PinMapProps = { center: Point; onChange: (point: Point) => void; onGesture?: () => void; onMoving?: () => void; onLoading?: () => void; onReady?: () => void; onFail?: () => void; height?: number;
  fill?: boolean; insets?: MapInsets; user?: UserDot | null;
  /** Public surfaces draw the baseline renderer only. */
  forceBaseline?: boolean };

// Diagram only: GPS is displayed by the native map, never placed at an invented point on this route.
// It draws no words: every screen that shows a route names both stops in its own text (RouteLine), which scales to
// 200% and is never under the Retry button or a sheet (SRS A11Y-03). A screen reader still hears the route here.
// `plain` is the placeholder behind a loading map, so it announces nothing.
export default function RoutePreview({ pickupTitle, dropoffTitle, plain = false }: RouteMapProps & { plain?: boolean }) {
  const styles = useStyles();
  const { rtl, c } = useCopy();
  const [{ w, h }, setBox] = useState({ w: 0, h: 156 });
  const a = { x: w * (rtl ? 0.8 : 0.2), y: h * 0.68 }, b = { x: w * (rtl ? 0.2 : 0.8), y: h * 0.34 };
  const len = Math.hypot(b.x - a.x, b.y - a.y), angle = Math.atan2(b.y - a.y, b.x - a.x);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return <View style={[styles.preview, plain && styles.fill]} onLayout={e => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    accessible={!plain} accessibilityRole={plain ? undefined : 'image'}
    accessibilityLabel={plain ? undefined : `${c.routeDiagram}: ${pickupTitle} ${rtl ? '←' : '→'} ${dropoffTitle}`}>
    <View style={[styles.road, { top: '22%', left: -20, right: -20, height: 10 }]} />
    <View style={[styles.road, { top: -20, bottom: -20, left: '36%', width: 8 }]} />
    <View style={[styles.road, { top: '78%', left: -20, right: -20, height: 6, opacity: 0.5 }]} />
    <View style={[styles.road, { top: -20, bottom: -20, left: '71%', width: 6, opacity: 0.5 }]} />
    {w > 0 && <>
      <View style={[styles.line, { left: mid.x - len / 2, top: mid.y - 2, width: len, transform: [{ rotate: `${angle}rad` }] }]} />
      <View style={[styles.pickup, { left: a.x - 8, top: a.y - 8 }]} />
      <View style={[styles.dropoff, { left: b.x - 8, top: b.y - 8 }]} />
    </>}
  </View>;
}

const useStyles = themedStyles(palette => StyleSheet.create({
  preview: { height: 156, backgroundColor: palette.mapWash, overflow: 'hidden' },
  fill: { height: '100%' },
  road: { position: 'absolute', backgroundColor: palette.card, opacity: 0.75, borderRadius: 4 },
  line: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: palette.forest },
  pickup: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: palette.olive, borderWidth: 3, borderColor: palette.card },
  dropoff: { position: 'absolute', width: 16, height: 16, borderRadius: 4, backgroundColor: palette.clay, borderWidth: 3, borderColor: palette.card },
}));
