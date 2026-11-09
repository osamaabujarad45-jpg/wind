// The sheet over a full-screen map: a summary and its action stay on screen, drag up (or tap the grip) for everything else.
// Height comes from what the summary needs, so large text and a pending-booking card grow it instead of clipping it.
import { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, PanResponder, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from './motion';
import { palette, useCopy } from './ui';

const GRIP = 48;
const nativeDriver = Platform.OS !== 'web';
/** A sideways phone has no height to spare: the sheet stands beside the map instead of over it. */
export const SIDE_SHEET = 340;
export function useSideSheet() {
  const { width, height } = useWindowDimensions();
  return width > height && height < 520;
}

export function MapSheet({ header, footer, children, open, onOpenChange, onPeek, safeBottom = true, scrollRef, expandedRatio = 0.86, onRefresh }: {
  header: React.ReactNode; footer?: React.ReactNode; children?: React.ReactNode;
  open: boolean; onOpenChange: (open: boolean) => void;
  /** The closed height: the map keeps its camera and pin clear of it. */
  onPeek?: (height: number) => void;
  /** False inside tabs, where the tab bar already clears the system navigation bar. */
  safeBottom?: boolean;
  scrollRef?: React.RefObject<ScrollView | null>;
  expandedRatio?: number;
  onRefresh?: () => Promise<unknown>;
}) {
  const { c, rtl } = useCopy();
  const still = useReducedMotion();
  const { height: screen } = useWindowDimensions();
  const side = useSideSheet();
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0), [footerHeight, setFooterHeight] = useState(0);
  // The footer carries the bottom inset itself; a sheet without one must still clear the system navigation bar.
  const padBottom = safeBottom ? insets.bottom : 0;
  const sideStyle = side && (rtl ? styles.sideLeft : styles.side);
  const peek = GRIP + headerHeight + (footer ? footerHeight : padBottom);
  const [room, setRoom] = useState(0); // the height above the keyboard, so an open sheet's top stays below the status bar
  const expanded = Math.min((room || screen) - insets.top, side ? screen : Math.max(peek, Math.round(screen * expandedRatio)));
  const travel = Math.max(0, expanded - peek);
  const keyboardUp = room > 0 && room < screen - 150; // only footers read this, and no sheet with a footer sits inside tabs
  const [y] = useState(() => new Animated.Value(0)); // 0 is fully open
  const latest = useRef({ travel, open, onOpenChange, still });
  useEffect(() => { latest.current = { travel, open, onOpenChange, still }; });
  const at = useRef(0);
  const settle = (next: boolean, animate = !still) => {
    const to = next ? 0 : latest.current.travel;
    at.current = to;
    if (animate) Animated.spring(y, { toValue: to, useNativeDriver: nativeDriver, damping: 26, stiffness: 240, mass: 0.9 }).start();
    else y.setValue(to);
  };
  const settleRef = useRef(settle);
  useEffect(() => { settleRef.current = settle; });
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh && (async () => { setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } });
  const measured = headerHeight > 0;
  useEffect(() => { if (measured) settleRef.current(open, false); }, [measured, travel]); // eslint-disable-line react-hooks/exhaustive-deps -- a remeasure repositions; it never animates
  useEffect(() => { if (measured) settleRef.current(open); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- only a change of state animates
  const onPeekRef = useRef(onPeek);
  useEffect(() => { onPeekRef.current = onPeek; });
  useEffect(() => { if (measured) onPeekRef.current?.(side ? 0 : peek); }, [measured, peek, side]);
  // eslint-disable-next-line react-hooks/refs -- the handlers read the refs only when a gesture arrives, never during render
  const [pan] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_, gesture) => y.setValue(Math.max(0, Math.min(latest.current.travel, at.current + gesture.dy))),
    onPanResponderRelease: (_, gesture) => {
      const position = at.current + gesture.dy, range = latest.current.travel;
      const next = gesture.vy < -0.4 ? true : gesture.vy > 0.4 ? false : position < range / 2;
      settleRef.current(next);
      if (next !== latest.current.open) latest.current.onOpenChange(next);
    },
    onPanResponderTerminate: () => settleRef.current(latest.current.open),
  }));
  return <KeyboardAvoidingView pointerEvents="box-none" style={StyleSheet.absoluteFill} behavior="padding">
    <View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'flex-end' }} onLayout={e => setRoom(Math.floor(e.nativeEvent.layout.height))}>
      <Animated.View style={[styles.sheet, sideStyle, { height: expanded, transform: [{ translateY: y }] }]}>
        <View {...pan.panHandlers} style={styles.handleArea}>
          <Pressable onPress={() => onOpenChange(!open)} accessibilityRole="button" accessibilityLabel={open ? c.sheetCollapse : c.sheetExpand} accessibilityState={{ expanded: open }} aria-expanded={open} style={styles.gripArea}>
            <View style={styles.grip} />
          </Pressable>
          <View onLayout={e => setHeaderHeight(Math.ceil(e.nativeEvent.layout.height))}>{header}</View>
          {!footer && !open && <View style={{ height: padBottom }} />}{/* the closed sheet's content stays above the system navigation bar; open, the same space would be a dead band mid-sheet */}
        </View>
        {/* It ends at the footer, not under it, so a focused field scrolls clear of the footer too. */}
        <ScrollView ref={scrollRef} style={{ flex: 1, marginBottom: footer ? footerHeight : 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 + (footer ? 0 : padBottom) }} keyboardShouldPersistTaps="handled"
          refreshControl={refresh && <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.olive} />}
          showsVerticalScrollIndicator={false} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>
          {children}
        </ScrollView>
      </Animated.View>
      {footer && <View style={[styles.footer, sideStyle, { paddingBottom: 10 + (keyboardUp ? 0 : padBottom) }]} onLayout={e => setFooterHeight(Math.ceil(e.nativeEvent.layout.height))}>{footer}</View>}
    </View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: palette.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    boxShadow: '0px -2px 16px rgba(14,31,25,0.16)' },
  side: { left: 'auto', right: 0, width: SIDE_SHEET, alignSelf: 'auto' },
  sideLeft: { left: 0, right: 'auto', width: SIDE_SHEET, alignSelf: 'auto' },
  handleArea: { paddingHorizontal: 16, cursor: 'grab', touchAction: 'none' } as object,
  gripArea: { height: GRIP, alignItems: 'center', justifyContent: 'center' },
  grip: { width: 40, height: 4, borderRadius: 2, backgroundColor: palette.dash },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 10, backgroundColor: palette.paper,
    borderTopWidth: 1, borderTopColor: palette.hair },
});
