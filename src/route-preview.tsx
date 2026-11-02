import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Point } from './model';
import { palette, useCopy } from './ui';

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
  /** Internal adapter failure signal; the shared provider boundary owns fallback and retry. */
  onFail?: () => void;
};
export type PinMapProps = { center: Point; onChange: (point: Point) => void; onLoading?: () => void; onReady?: () => void; onFail?: () => void; height?: number };

// Diagram only: GPS is displayed by the native map, never placed at an invented point on this route.
// `plain` draws the shapes without words: it is the placeholder behind a loading map, so it must not
// announce the city names twice or repeat them on screen.
export default function RoutePreview({ pickupTitle, dropoffTitle, plain = false }: RouteMapProps & { plain?: boolean }) {
  const { rtl, c } = useCopy();
  const [w, setW] = useState(0);
  const h = 156;
  const a = { x: w * (rtl ? 0.8 : 0.2), y: h * 0.68 }, b = { x: w * (rtl ? 0.2 : 0.8), y: h * 0.34 };
  const len = Math.hypot(b.x - a.x, b.y - a.y), angle = Math.atan2(b.y - a.y, b.x - a.x);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return <View style={[styles.preview, plain && styles.fill]} onLayout={e => setW(e.nativeEvent.layout.width)} accessible={!plain}
    accessibilityLabel={plain ? undefined : `${c.routeDiagram}: ${pickupTitle} ${rtl ? '←' : '→'} ${dropoffTitle}`}>
    <View style={[styles.road, { top: h * 0.22, left: -20, right: -20, height: 10 }]} />
    <View style={[styles.road, { top: -20, bottom: -20, left: '36%', width: 8 }]} />
    <View style={[styles.road, { top: h * 0.78, left: -20, right: -20, height: 6, opacity: 0.5 }]} />
    <View style={[styles.road, { top: -20, bottom: -20, left: '71%', width: 6, opacity: 0.5 }]} />
    {!plain && <Text style={styles.diagram}>{c.routeDiagram}</Text>}
    {w > 0 && <>
      <View style={[styles.line, { left: mid.x - len / 2, top: mid.y - 2, width: len, transform: [{ rotate: `${angle}rad` }] }]} />
      <View style={[styles.pickup, { left: a.x - 8, top: a.y - 8 }]} />
      <View style={[styles.dropoff, { left: b.x - 8, top: b.y - 8 }]} />
      {!plain && <>
        <Text numberOfLines={1} style={[styles.label, { top: a.y + 12, left: a.x - 60 }]}>{pickupTitle}</Text>
        <Text numberOfLines={1} style={[styles.label, { top: b.y - 36, left: b.x - 60 }]}>{dropoffTitle}</Text>
      </>}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  preview: { height: 156, backgroundColor: '#E6ECE3', overflow: 'hidden' },
  fill: { height: '100%' },
  road: { position: 'absolute', backgroundColor: palette.card, opacity: 0.75, borderRadius: 4 },
  line: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: palette.forest },
  pickup: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: palette.olive, borderWidth: 3, borderColor: palette.card },
  dropoff: { position: 'absolute', width: 16, height: 16, borderRadius: 4, backgroundColor: palette.clay, borderWidth: 3, borderColor: palette.card },
  label: { position: 'absolute', width: 120, textAlign: 'center', fontSize: 12, fontWeight: '800', color: palette.ink },
  diagram: { position: 'absolute', top: 8, left: 12, right: 12, textAlign: 'center', fontSize: 11, fontWeight: '600', color: palette.secondary },
});
