import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Point } from './model';
import { maxScale, useCopy } from './ui';
import { face } from './theme';
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
// In a card it draws shapes only: the card's screen names both stops below it (RouteLine). On a full-screen map those
// names are in a sheet that may be closed, so the words show here too, with Retry, in one column that fills only what
// the top bar and the sheet leave uncovered. Text scales to 200% (SRS A11Y-03); if the room is too small the column
// scrolls, so nothing overlaps or hides under the sheet. A screen reader hears the route from the drawing.
// `plain` is the placeholder behind a loading map, so it announces nothing.
export default function RoutePreview({ pickupTitle, dropoffTitle, fill, insets, plain = false, onRetry }: RouteMapProps & { plain?: boolean; onRetry?: () => void }) {
  const styles = useStyles();
  const { rtl, row, align, c, language } = useCopy();
  const [{ w, h }, setBox] = useState({ w: 0, h: 0 });
  const a = { x: w * (rtl ? 0.8 : 0.2), y: h * 0.68 }, b = { x: w * (rtl ? 0.2 : 0.8), y: h * 0.34 };
  const len = Math.hypot(b.x - a.x, b.y - a.y), angle = Math.atan2(b.y - a.y, b.x - a.x);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // What the app's chrome leaves uncovered of a full-screen map; the whole card otherwise.
  const uncovered = { top: insets?.top ?? 0, bottom: insets?.bottom ?? 0, left: insets?.left ?? 0, right: insets?.right ?? 0 };
  return <View style={styles.preview}>
    <View style={[styles.road, { top: '22%', left: -20, right: -20, height: 10 }]} />
    <View style={[styles.road, { top: -20, bottom: -20, left: '36%', width: 8 }]} />
    <View style={[styles.road, { top: '78%', left: -20, right: -20, height: 6, opacity: 0.5 }]} />
    <View style={[styles.road, { top: -20, bottom: -20, left: '71%', width: 6, opacity: 0.5 }]} />
    {/* The route is drawn inside what the app's chrome leaves uncovered: on a full-screen map, between the top bar and the sheet. */}
    <View style={[styles.drawing, uncovered]} onLayout={e => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      accessible={!plain} accessibilityRole={plain ? undefined : 'image'}
      accessibilityLabel={plain ? undefined : `${c.routeDiagram}: ${pickupTitle} ${rtl ? '←' : '→'} ${dropoffTitle}`}>
      {w > 0 && h > 0 && <>
        <View style={[styles.line, { left: mid.x - len / 2, top: mid.y - 2, width: len, transform: [{ rotate: `${angle}rad` }] }]} />
        <View style={[styles.pickup, { left: a.x - 8, top: a.y - 8 }]} />
        <View style={[styles.dropoff, { left: b.x - 8, top: b.y - 8 }]} />
      </>}
    </View>
    {!plain && fill && <ScrollView style={[styles.overlay, uncovered]} contentContainerStyle={styles.column}>
      <View style={styles.words}>
        <Text key={`diagram-${language}`} maxFontSizeMultiplier={maxScale} style={[styles.diagram, { textAlign: align }]}>{c.routeDiagram}</Text>
        {([[styles.pickupMark, pickupTitle], [styles.dropoffMark, dropoffTitle]] as const).map(([mark, title], stop) =>
          <View key={`${stop}-${language}`} style={[styles.stop, { flexDirection: row }]}>
            <View style={mark} />
            <Text maxFontSizeMultiplier={maxScale} style={[styles.label, { textAlign: align }]}>{title}</Text>
          </View>)}
      </View>
      {onRetry && <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
        <Text maxFontSizeMultiplier={maxScale} style={styles.retryText}>{c.retry}</Text>
      </Pressable>}
    </ScrollView>}
  </View>;
}

const useStyles = themedStyles(palette => StyleSheet.create({
  // It fills whatever slot the map had (a card, a taller tracking map, the full screen), also inside a centring wrapper.
  preview: { alignSelf: 'stretch', width: '100%', height: '100%', minHeight: 156, backgroundColor: palette.mapWash, overflow: 'hidden' },
  drawing: { position: 'absolute' },
  overlay: { position: 'absolute' },
  column: { flexGrow: 1, justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  words: { backgroundColor: palette.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, gap: 2 },
  retry: { alignSelf: 'center', minHeight: 48, minWidth: 48, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: palette.card, borderRadius: 12 },
  retryText: { fontSize: 14, lineHeight: 24, fontFamily: face.medium, color: palette.ink, textAlign: 'center' },
  stop: { alignItems: 'center', gap: 8 },
  pickupMark: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.olive },
  dropoffMark: { width: 10, height: 10, borderRadius: 2, backgroundColor: palette.clay },
  label: { flex: 1, fontSize: 13, lineHeight: 23, fontFamily: face.semibold, color: palette.ink },
  diagram: { fontSize: 11, lineHeight: 19, fontFamily: face.medium, color: palette.secondary },
  road: { position: 'absolute', backgroundColor: palette.card, opacity: 0.75, borderRadius: 4 },
  line: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: palette.forest },
  pickup: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: palette.olive, borderWidth: 3, borderColor: palette.card },
  dropoff: { position: 'absolute', width: 16, height: 16, borderRadius: 4, backgroundColor: palette.clay, borderWidth: 3, borderColor: palette.card },
}));
