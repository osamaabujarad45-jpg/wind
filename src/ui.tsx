import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
  type ColorValue, type LayoutRectangle, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { css, cubicBezier, FadeInDown, useReducedMotion } from './motion';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { BottomTabBarHeightContext, type BottomTabBarProps } from 'expo-router/js-tabs';
import { linesFor, maxScale } from './text-scale';
import { copy, errorText, fill } from './copy';
import { formatMoney } from './format-money';
import { ApiError, errorCode } from './api';
import { useSession } from './session';
import { ltr, type OrderStatus } from './model';
import { journeyState, palettes, type JourneyState, type StateLook } from './theme';
import { themedStyles, themeKits, useTheme } from './theme-context';

// The Day palette, shared with the Souq app (client/src/styles/index.css): same ground, ink, forest, lime and clay. Values live in
// theme.ts (palettes.day / palettes.night). Components read the active theme with useTheme(); this Day alias is for brand marks
// (the logo never changes colour) and for screens not yet moved over.
export const palette = palettes.day;

// Soft lift instead of hairline borders (Day; useTheme().shadow is the active theme's). Small blur: large glows read as cheap on a phone.
export const shadow: ViewStyle = themeKits.day.shadow;
// Bottom sheets over the map cast upward.
export const sheetShadow: ViewStyle = themeKits.day.sheetShadow;

// Compact scale (Material 3 / Apple HIG): 14pt body, 36–48pt controls, every tap target ≥ 48dp in its own box.
// A hitSlop only reaches over the control beside it, and the sibling on top takes the tap, so the box carries the target.
export const size = { control: 48, small: 36, row: 52, radius: 16, gutter: 16 };
// Icon sizes: one scale, so glyphs keep the same rhythm across screens (odd 15/17/19 were snapped to it).
export const iconSize = { xs: 14, sm: 16, md: 18, lg: 20, xl: 22 } as const;

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
export type IconName = keyof typeof Ionicons.glyphMap;

export function useCopy() {
  const { language } = useSession();
  const rtl = language === 'ar';
  return {
    c: copy[language], language, rtl,
    row: rtl ? 'row-reverse' as const : 'row' as const,
    align: rtl ? 'right' as const : 'left' as const,
    err: (error: unknown) => {
      const text = errorText(language, typeof error === 'string' ? error : errorCode(error));
      // A failure the server logged carries its id: the first eight characters are enough for support to find it.
      return error instanceof ApiError && error.reference ? `${text} ${copy[language].errorRef} ${ltr(error.reference.slice(0, 8))}` : text;
    },
    money: (n: number) => formatMoney(n, language, copy[language].nis),
  };
}

export { fill };

// Native confirm on iOS/Android; window.confirm on web where Alert buttons don't render.
// The action names the dialog and the message goes in the body: Android cuts alert titles at two lines.
export function confirm(message: string, onYes: () => void, yes: string, no: string) {
  if (Platform.OS === 'web') { if (window.confirm(message)) onYes(); return; }
  Alert.alert(yes, message, [{ text: no, style: 'cancel' }, { text: yes, style: 'destructive', onPress: onYes }]);
}

// One haptic per committed action, always alongside a visual change. No-op on web.
export const haptic = {
  success: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  error: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
  tap: () => Platform.OS !== 'web' && Haptics.selectionAsync().catch(() => {}),
};

// ---------- brand ----------

// Never mirrored for RTL: the و reads the same in both languages.
// The Wind mark: the Arabic و (waw, the first letter of ويند) drawn as a gust, a streak of wind that curls up into a ring
// holding a clay destination dot. Geometry in a 0..100 box, the same numbers as scripts/brand-mark.mjs (icons, posters);
// tests/brand-mark.test.mjs keeps them equal. Built from views: a bar, a clipped quarter circle and a ring, all one stroke.
export const logoMark = {
  stroke: 8.5,
  ring: [63.75, 43.25, 12.5] as const, // centre x, centre y, stroke centreline radius
  turn: [50.25, 43.25, 26] as const, // the quarter circle from the streak up into the ring (6 o'clock to 3 o'clock)
  streakX: 23.75, // the streak's round left end
  dot: 5, // radius, at the ring's centre
  radius: 0.29, // tile corner, of the tile width
};

const markPart = (s: number, left: number, top: number, width: number, height: number): ViewStyle =>
  ({ position: 'absolute', left: left * s / 100, top: top * s / 100, width: width * s / 100, height: height * s / 100 });

export const logoRingStyle = (s: number): ViewStyle => {
  const [cx, cy, r] = logoMark.ring, o = r + logoMark.stroke / 2;
  return { ...markPart(s, cx - o, cy - o, 2 * o, 2 * o), borderRadius: o * s / 100, borderWidth: logoMark.stroke * s / 100, borderColor: palette.lime };
};

/** The turn: a full ring clipped to its lower-right quarter. Wrap logoTurnArcStyle in this. */
export const logoTurnClipStyle = (s: number): ViewStyle => {
  const [cx, cy, r] = logoMark.turn, o = r + logoMark.stroke / 2;
  return { ...markPart(s, cx, cy, o, o), overflow: 'hidden' };
};

export const logoTurnArcStyle = (s: number): ViewStyle => {
  const [, , r] = logoMark.turn, o = r + logoMark.stroke / 2;
  return { ...markPart(s, -o, -o, 2 * o, 2 * o), borderRadius: o * s / 100, borderWidth: logoMark.stroke * s / 100, borderColor: palette.lime };
};

export const logoStreakStyle = (s: number): ViewStyle => {
  const [cx, cy, r] = logoMark.turn, h = logoMark.stroke / 2, left = logoMark.streakX - h;
  // Half a unit into the turn, so no hairline shows where the bar meets the clipped arc.
  return { ...markPart(s, left, cy + r - h, cx - left + 0.5, logoMark.stroke), borderTopLeftRadius: h * s / 100,
    borderBottomLeftRadius: h * s / 100, backgroundColor: palette.lime };
};

export const logoDotStyle = (s: number): ViewStyle => {
  const [cx, cy] = logoMark.ring, d = logoMark.dot;
  return { ...markPart(s, cx - d, cy - d, 2 * d, 2 * d), borderRadius: d * s / 100, backgroundColor: palette.clay };
};

/** The gust (streak, turn, ring) without the dot, for the intro, which moves the dot on its own. */
export function LogoGust({ size: s }: { size: number }) {
  return <>
    <View style={logoStreakStyle(s)} />
    <View style={logoTurnClipStyle(s)}><View style={logoTurnArcStyle(s)} /></View>
    <View style={logoRingStyle(s)} />
  </>;
}

export function Logo({ size: s = 36, decorative }: { size?: number; decorative?: boolean /* the name is written beside it: one stop for screen readers */ }) {
  const { c } = useCopy(); // the name is read in the reader's language: ويند in Arabic
  return <View {...decorative ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const } : { accessibilityRole: 'image' as const, accessibilityLabel: c.brand }} style={[logoTile, { width: s, height: s, borderRadius: s * logoMark.radius }]}>
    <LogoGust size={s} />
    <View style={logoDotStyle(s)} />
  </View>;
}

// ---------- layout ----------

// The brand tile is forest in both themes (the Night action is lime, but the logo never changes colour).
const logoTile: ViewStyle = { backgroundColor: palette.forest, overflow: 'hidden' };

// Design system v2: a desktop layout (Wind Control beside its side rail) lets pages use more than the phone column.
export const WideContext = React.createContext(false);

export function Screen({ children, onRefresh, footer, scrollRef }: {
  children: React.ReactNode; onRefresh?: () => Promise<unknown>; footer?: React.ReactNode;
  scrollRef?: React.RefObject<ScrollView | null>;
}) {
  const { palette } = useTheme();
  const styles = useStyles();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh && (async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); });
  // Inside tabs the TabBar already clears the system navigation bar; a second bottom inset left a dead band (A53).
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  const wide = useContext(WideContext);
  // Android is edge-to-edge, so the keyboard no longer resizes the window: pad by the overlap instead. The ScrollView then
  // shrinks and Android scrolls the focused field into view, and the footer rides on the keyboard. iOS screens wrap their own.
  return <SafeAreaView edges={inTabs ? ['top'] : ['top', 'bottom']} style={[styles.safe, wide && styles.safeWide]}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'android' ? 'padding' : undefined}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        refreshControl={refresh && <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.olive} />}>
        {children}
      </ScrollView>
      {footer && <View style={styles.footer}>{footer}</View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export function Header({ title, back = false, right, subtitle }: { title: string; back?: boolean; right?: React.ReactNode; subtitle?: string }) {
  const styles = useStyles();
  const { row, c } = useCopy();
  return <View style={[styles.header, { flexDirection: row }]}>
    {back && <IconButton icon={row === 'row-reverse' ? 'arrow-forward' : 'arrow-back'} label={c.back}
      onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />}
    <View style={{ flex: 1 }}>
      <Txt variant="h1" header numberOfLines={1}>{title}</Txt>
      {!!subtitle && <Txt variant="caption" numberOfLines={1}>{subtitle}</Txt>}
    </View>
    {right}
  </View>;
}

export function IconButton({ icon, label, onPress, tone = 'card', disabled, edge }: {
  icon: IconName; label: string; onPress: () => void; tone?: 'card' | 'muted' | 'forest'; disabled?: boolean;
  /** A 1px control edge while enabled: a card-tone button sitting on a card has no fill contrast of its own. */
  edge?: boolean;
}) {
  const { palette, shadow } = useTheme();
  const styles = useStyles();
  // Disabled looks disabled (muted fill, faint glyph), like Button: a forest "+" on a closed shop read as pressable.
  const bg = disabled ? palette.muted : { card: palette.card, muted: palette.muted, forest: palette.forest }[tone];
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled}
    accessibilityState={{ disabled: !!disabled }}
    style={({ pressed }) => [styles.iconButton, { backgroundColor: bg }, tone === 'card' && !disabled && shadow, edge && !disabled && { borderWidth: 1, borderColor: palette.field }, pressed && { opacity: 0.7 }]}>
    <Ionicons name={icon} size={iconSize.lg} color={disabled ? palette.faint : tone === 'forest' ? palette.lime : palette.ink} />
  </Pressable>;
}

export function Row({ children, style, gap = 10 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  const { row } = useCopy();
  return <View style={[{ flexDirection: row, alignItems: 'center', gap }, style]}>{children}</View>;
}

// Headings are Readex Pro (Arabic and Latin drawn together; the Arabic extension of Lexend, made for quick reading).
// One family per weight file, so no fontWeight: Android would fake-bold an already bold face. Body stays the system font.
export const headingFont = { bold: 'ReadexPro-Bold', semibold: 'ReadexPro-SemiBold' } as const;
const useTextVariants = themedStyles(palette => ({
  // Design review 17 Nov: the floor was 11 px and nothing was bigger than 21, so ETA, prices and shares had no weight.
  display: { fontSize: 28, lineHeight: 34, fontFamily: headingFont.bold, color: palette.ink, fontVariant: ['tabular-nums'] }, // ETA, amounts, earnings
  h1: { fontSize: 22, lineHeight: 30, fontFamily: headingFont.bold, color: palette.ink },
  h2: { fontSize: 18, lineHeight: 25, fontFamily: headingFont.semibold, color: palette.ink },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: palette.ink },
  body: { fontSize: 15, lineHeight: 22, color: palette.secondary },
  label: { fontSize: 14, lineHeight: 19, fontWeight: '700', color: palette.ink },
  caption: { fontSize: 13, lineHeight: 18, color: palette.secondary },
  micro: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: palette.secondary }, // faint fell to 4.1–4.3:1 on muted and pale cards
} satisfies Record<string, TextStyle>));
type TextVariant = 'display' | 'h1' | 'h2' | 'title' | 'body' | 'label' | 'caption' | 'micro';

export { maxScale };
export function useLines(n?: number) { return linesFor(n, useWindowDimensions().fontScale); }

// Sheet footer (MapSheet renders it outside the scroll body). Capped at 45% of the window and scrollable past that, so at 200%
// text the advance button is reached by scrolling the footer instead of being cut off.
export function BoundedFooter({ children }: { children: React.ReactNode }) {
  const { height } = useWindowDimensions();
  return <ScrollView style={{ maxHeight: height * 0.45, flexGrow: 0 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}

export function Txt({ children, variant = 'body', style, center, numberOfLines, clamp, selectable, header, accessibilityLabel }: {
  children: React.ReactNode; variant?: TextVariant; style?: StyleProp<TextStyle>; center?: boolean; numberOfLines?: number; selectable?: boolean;
  /** Line cap kept at every text scale, for chrome that must not swallow the map (the driving banner). */
  clamp?: number;
  header?: boolean; // screen-reader heading (rotor / TalkBack); the visual size still comes from the variant
  accessibilityLabel?: string;
}) {
  const { align, language } = useCopy();
  const textVariants = useTextVariants();
  const scaled = useLines(numberOfLines);
  const lines = clamp ?? scaled;
  // T42/X-01: OS text scaling stays on up to maxScale; line heights scale with it and containers use minHeight.
  // Keyed by language: Android kept the Arabic width after an in-app switch and clipped "Your current order".
  return <Text key={language} textBreakStrategy="simple" maxFontSizeMultiplier={maxScale} numberOfLines={lines} selectable={selectable} accessibilityLabel={accessibilityLabel} accessibilityRole={header ? 'header' : undefined} style={[textVariants[variant], { textAlign: center ? 'center' : align }, style]}>{children}</Text>;
}

// Section heading with an optional trailing link ("See all").
export function Section({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { palette } = useTheme();
  return <Row style={{ justifyContent: 'space-between', marginTop: 6, marginBottom: 10 }}>
    <Txt variant="h2" header>{title}</Txt>
    {action && onAction && <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} hitSlop={13}>
      {/* label variant is ~18px tall; 13px slop each side brings the target to 44pt */}
      <Txt variant="label" style={{ color: palette.olive }}>{action}</Txt>
    </Pressable>}
  </Row>;
}

export function Card({ children, style, tone = 'card' }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'card' | 'muted' | 'olive' | 'forest' | 'warn' }) {
  const { palette, shadow } = useTheme();
  const styles = useStyles();
  // warn: something waiting on a person (attention). Clay is not a card tone: it means only the logo pin and the destination.
  const bg = { card: palette.card, muted: palette.muted, olive: palette.olivePale, forest: palette.forest, warn: palette.warnPale }[tone];
  return <View style={[styles.card, { backgroundColor: bg }, tone === 'card' && shadow, style]}>{children}</View>;
}

// Staggered entrance for content the user is waiting on. Not for virtualized rows.
// No layout transition here: on Fabric it fought the ScrollView's measurement and stretched the
// home search row to the viewport on the A53 until a scroll (reproduced 29 Oct 2026). Entrance only.
export function Appear({ index = 0, children, style }: { index?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const entering = useMemo(() => FadeInDown.duration(240).delay(Math.min(index, 8) * 40), [index]);
  return <Animated.View entering={reduced ? undefined : entering} style={style}>{children}</Animated.View>;
}

export function Avatar({ name, size: s = 44, tone = 'forest' }: { name: string; size?: number; tone?: 'forest' | 'olive' | 'blue' }) {
  const { palette } = useTheme();
  const t = { forest: [palette.forest, palette.lime], olive: [palette.olivePale, palette.olive], blue: [palette.bluePale, palette.blue] }[tone];
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: t[0], alignItems: 'center', justifyContent: 'center' }}>
    {/* A contact known only by phone number gets a person, not its first digit. */}
    {/^[+\d٠-٩]/.test(name.trim()) ? <Ionicons name="person" size={s * 0.45} color={t[1]} />
      : <Text allowFontScaling={false} style={{ color: t[1], fontSize: s * 0.42, fontWeight: '800' }}>{name.trim().slice(0, 1) || '•'}</Text>}
  </View>;
}

// ---------- controls ----------

// Press feedback: 3% scale over 120ms on the UI thread.
export function Press({ children, onPress, style, containerStyle, disabled, accessibilityLabel, accessibilityRole = 'button', accessibilityState, hitSlop, dim = true, tilt }: {
  children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; containerStyle?: StyleProp<ViewStyle>; disabled?: boolean;
  accessibilityLabel?: string; accessibilityRole?: 'button' | 'link' | 'radio' | 'checkbox'; accessibilityState?: { checked?: boolean; busy?: boolean; expanded?: boolean };
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number }; // for controls drawn smaller than 44pt
  dim?: boolean; // false when the control draws its own disabled colours: a 50% wash turns white labels on forest into grey
  tilt?: boolean; // a tile that leans back in depth as it is pressed, like a key going down (home service tiles)
}) {
  const [pressed, setPressed] = useState(false);
  const still = useReducedMotion(); // reduced motion: the scale press only, no lean in depth
  const lean = tilt && !still;
  return <Pressable style={containerStyle} onPress={onPress} disabled={!!disabled} accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel} hitSlop={hitSlop}
    aria-disabled={!!disabled} aria-busy={!!accessibilityState?.busy} aria-checked={accessibilityState?.checked} aria-expanded={accessibilityState?.expanded} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} pressRetentionOffset={16}>
    <Animated.View style={[lean ? motion.tiltable : motion.pressable, style, pressed && (lean ? motion.tilted : motion.pressed), disabled && dim && { opacity: 0.5 }]}>{children}</Animated.View>
  </Pressable>;
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, size: s = 'md', trailing, label, reason }: {
  title: string; onPress: () => void; variant?: 'primary' | 'soft' | 'danger' | 'ghost' | 'outline'; icon?: IconName; loading?: boolean; disabled?: boolean;
  size?: 'md' | 'sm'; trailing?: string; label?: string;
  reason?: string; // why it waits, shown under it only while disabled and not busy itself (design §10)
}) {
  const { palette } = useTheme();
  const styles = useStyles();
  const { row } = useCopy();
  const tone = {
    primary: { bg: palette.forest, fg: palette.onFill }, soft: { bg: palette.olivePale, fg: palette.olive },
    danger: { bg: palette.card, fg: palette.error }, ghost: { bg: 'transparent', fg: palette.secondary }, // danger is an error outline: a pale fill vanished on pale cards
    outline: { bg: palette.card, fg: palette.ink },
  }[variant];
  const small = s === 'sm';
  // Disabled keeps its shape and label on a paper fill with secondary text (5.6:1), not a 50% wash of the tone. Its edge is
  // dashed: a solid-bordered paper fill read the same as an enabled outline button (driver jobs, report form), and a flat
  // muted fill vanished on muted cards. A busy button keeps its colours so the spinner reads as work in progress.
  // Callers add a <Reason> under it saying why it waits.
  const off = !!disabled && !loading;
  const look = off ? { bg: palette.muted, fg: palette.secondary } : tone; // solid, never dashed: a dashed edge read as an empty drop zone
  const press = <Press accessibilityLabel={label ?? (trailing ? `${title} ${trailing}` : title)} onPress={onPress} disabled={disabled || loading} dim={false}
    accessibilityState={{ busy: !!loading }} style={[styles.button, small && styles.buttonSmall, { backgroundColor: look.bg, flexDirection: row }, off ? styles.buttonOff : variant === 'outline' ? styles.outline : variant === 'danger' && styles.dangerEdge,
      trailing ? { justifyContent: 'space-between' } : null]}>
    <View style={{ flexDirection: row, alignItems: 'center', gap: 7, flexShrink: 1 }}>
      {loading ? <ActivityIndicator size="small" color={look.fg} /> : icon && <Ionicons name={icon} size={small ? 16 : 18} color={look.fg}
        style={row === 'row-reverse' && /^(arrow-(forward|back)|send)/.test(icon) ? { transform: [{ scaleX: -1 }] } : undefined} /* point the way Arabic reads */ />}
      <Text maxFontSizeMultiplier={maxScale} style={[styles.buttonText, small && { fontSize: 13 }, { color: look.fg, flexShrink: 1 }]}>{title}</Text>
    </View>
    {trailing && <Text maxFontSizeMultiplier={maxScale} style={[styles.buttonText, { color: variant === 'primary' && !off ? palette.lime : look.fg }]}>{trailing}</Text>}
  </Press>;
  // The gap under the reason ties it to this button, not to a control stacked below (phone-code screens).
  return off && reason ? <View style={{ marginBottom: 6 }}>{press}<Reason>{reason}</Reason></View> : press;
}

/** A labelled checkbox: the whole row is the target, and a refusal reason sits under it in the error colour. */
export function Check({ checked, onChange, label, disabled, error }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; error?: string }) {
  const { palette } = useTheme();
  return <View>
    <Press accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }} disabled={disabled}
      onPress={() => onChange(!checked)} style={{ minHeight: size.control, justifyContent: 'center' }}>
      <Row gap={8}>
        <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={error ? palette.error : checked ? palette.olive : palette.secondary} />
        <Txt variant="caption" style={{ flex: 1, color: palette.ink }}>{label}</Txt>
      </Row>
    </Press>
    {!!error && <Txt variant="caption" style={{ color: palette.error }}>{error}</Txt>}
  </View>;
}

// Why a control is waiting, in one plain sentence under it (design §10). Text, not a tooltip, so it reads without a long press.
export function Reason({ children }: { children: string }) {
  return <Txt variant="body" style={{ marginTop: 6 }}>{children}</Txt>;
}

// A row of mutually exclusive options. `label` names the group for a screen reader (pass a translated word,
// never an English literal); without it the group stays unnamed, as it was.
export function Choices<K extends string>({ items, value, onChange, disabled, label, tabs }: {
  items: { key: K; label: string; disabled?: boolean }[]; value: K; onChange: (key: K) => void; disabled?: boolean; label?: string;
  /** A mode switch (sign in / new account): a sunken track with the chosen side raised, so it never looks like the form's own
   *  filled button below it (UI review 23 Nov: two forest "Sign in" buttons on one card). Value choices keep the outlined look. */
  tabs?: boolean;
}) {
  const { palette, shadow } = useTheme();
  const styles = useStyles();
  const { row } = useCopy();
  const choiceMotion = useChoiceMotion();
  const wraps = items.length > 3; // five vehicles in one row split words: "Motorc/ycle"
  return <View style={[styles.choices, { flexDirection: row }, wraps && { flexWrap: 'wrap' }, tabs && styles.tabTrack]} accessibilityRole="radiogroup" accessibilityLabel={label}>
    {items.map(item => {
      const on = item.key === value, off = !!disabled || !!item.disabled;
      return <Pressable key={item.key} accessibilityRole="radio" accessibilityLabel={item.label} accessibilityState={{ checked: on, disabled: off }} disabled={off} aria-checked={on}
        onPress={() => onChange(item.key)} style={wraps ? { flexGrow: 1, flexBasis: '30%' } : { flex: 1 }}>
        <Animated.View style={tabs ? [choiceMotion.choice, styles.tab, on && [{ backgroundColor: palette.card, borderWidth: 1, borderColor: palette.field }, shadow]] : [choiceMotion.choice, on && choiceMotion.choiceOn]}>
          <Text maxFontSizeMultiplier={maxScale} style={[styles.choiceText, on && { color: tabs ? palette.ink : palette.onFill }, tabs && !on && { color: palette.secondary }, off && !on && { color: palette.faint }]}>{item.label}</Text>
        </Animated.View>
      </Pressable>;
    })}
  </View>;
}

// Plus/minus counter: passengers, quantities.
export function Stepper({ value, min = 1, max = 99, onChange, label, disabled }: { value: number; min?: number; max?: number; onChange: (n: number) => void; label: string; disabled?: boolean }) {
  const { palette } = useTheme();
  const styles = useStyles();
  const { row, c } = useCopy();
  const previous = React.useRef(value);
  useEffect(() => {
    if (previous.current !== value && Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(`${label}: ${value}`);
    previous.current = value;
  }, [value, label]);
  const step = (d: number) => { haptic.tap(); onChange(Math.min(max, Math.max(min, value + d))); };
  return <View style={[styles.stepper, { flexDirection: row }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${c.stepperDecrease} ${label}`} onPress={() => step(-1)} disabled={disabled || value <= min}
      accessibilityState={{ disabled: disabled || value <= min }} style={styles.stepperKey}>
      <Ionicons name="remove" size={18} color={value <= min ? palette.faint : palette.ink} />
    </Pressable>
    <Text maxFontSizeMultiplier={maxScale} accessibilityLabel={label} accessibilityValue={{ min, max, now: value, text: String(value) }} style={styles.stepperValue}>{value}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${c.stepperIncrease} ${label}`} onPress={() => step(1)} disabled={disabled || value >= max}
      accessibilityState={{ disabled: disabled || value >= max }} style={styles.stepperKey}>
      <Ionicons name="add" size={18} color={value >= max ? palette.faint : palette.ink} />
    </Pressable>
  </View>;
}

// Horizontal scroller that starts at the reading start: in Arabic the first item sits at the right edge. `reveal` (a child's
// layout) scrolls just far enough to show that child when the start would leave it off-screen.
export function Rail({ children, gap = 8, style, contentStyle, reveal }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle>; reveal?: LayoutRectangle }) {
  const { row, rtl } = useCopy();
  const ref = React.useRef<ScrollView>(null);
  const size = React.useRef({ view: 0, content: 0 });
  const place = React.useCallback(() => {
    const { view, content } = size.current, end = Math.max(0, content - view), start = rtl ? end : 0;
    if (!view || !content) return;
    const x = !reveal || (reveal.x >= start && reveal.x + reveal.width <= start + view) ? start
      : Math.min(end, Math.max(0, rtl ? reveal.x - 16 : reveal.x + reveal.width + 16 - view));
    ref.current?.scrollTo({ x, animated: false });
  }, [reveal, rtl]);
  // Only a new reveal scrolls: losing it (another chip tapped) leaves the rail where the finger put it.
  React.useEffect(() => { if (reveal) place(); }, [place, reveal]);
  return <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} style={[{ flexGrow: 0 }, style]}
    contentContainerStyle={[{ flexDirection: row, gap }, contentStyle]}
    onLayout={e => { size.current.view = e.nativeEvent.layout.width; place(); }}
    onContentSizeChange={w => { size.current.content = w; place(); }}>
    {children}
  </ScrollView>;
}

export function FilterChips<K extends string>({ items, value, onChange, disabled, label }: { items: { key: K; label: string }[]; value: K; onChange: (key: K) => void; disabled?: boolean; label?: string }) {
  const { palette } = useTheme();
  const styles = useStyles();
  // The selected chip's box as laid out, so a rail that opens on a later choice (a driver's far heading, a reschedule slot)
  // shows it. A tap only recolours chips, so it never relays out and never scrolls.
  const [box, setBox] = useState<{ key: K; layout: LayoutRectangle }>();
  return <View accessibilityRole="radiogroup" accessibilityLabel={label}><Rail style={{ marginBottom: 10 }} contentStyle={{ paddingVertical: 4 }} reveal={box?.key === value ? box.layout : undefined}>
    {items.map(item => <Pressable key={item.key} accessibilityRole="radio" accessibilityState={{ checked: item.key === value, disabled: !!disabled }} accessibilityLabel={item.label} aria-checked={item.key === value}
      onLayout={e => { if (item.key === value) setBox({ key: item.key, layout: e.nativeEvent.layout }); }}
      onPress={() => onChange(item.key)} disabled={disabled} style={[styles.chip, item.key === value && styles.chipOn, disabled && { opacity: 0.5 }]}>
      <Text maxFontSizeMultiplier={maxScale} style={[styles.chipText, item.key === value && { color: palette.onFill }]}>{item.label}</Text>
    </Pressable>)}
  </Rail></View>;
}

/**
 * A one-time code as separate cells (design review 17 Nov: six digits in one wide box were hard to check). One real TextInput
 * lies over the cells, so typing, paste, the SMS autofill and screen readers all work on a single field; the cells only draw.
 * Digits always run left to right, in Arabic too.
 */
export function CodeField({ label, value, onChangeText, length = 6, disabled, onSubmitEditing }: {
  label: string; value: string; onChangeText: (text: string) => void; length?: number; disabled?: boolean; onSubmitEditing?: () => void;
}) {
  const { palette } = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  const ref = React.useRef<TextInput>(null);
  return <View style={styles.field}>
    <Txt variant="label" style={{ marginBottom: 6 }}>{label}</Txt>
    <Pressable onPress={() => ref.current?.focus()} disabled={disabled} accessible={false} style={{ alignSelf: 'stretch' }}>
      <View style={{ flexDirection: 'row', gap: 8, direction: 'ltr' }} importantForAccessibility="no-hide-descendants">{/* ltr: a code's digits read left to right in Arabic too */}
        {Array.from({ length }, (_, i) => {
          const active = focused && (i === value.length || (i === length - 1 && value.length === length));
          return <View key={i} style={[styles.codeCell, active && styles.codeCellActive, disabled && { backgroundColor: palette.muted }]}>
            <Text maxFontSizeMultiplier={maxScale} style={styles.codeDigit}>{value[i] ?? ''}</Text>
          </View>;
        })}
      </View>
      <TextInput ref={ref} value={value} onChangeText={onChangeText} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode"
        maxLength={length} editable={!disabled} accessibilityLabel={label} maxFontSizeMultiplier={maxScale} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmitEditing} caretHidden style={styles.codeInput} />
    </Pressable>
  </View>;
}

// error: shown under the field it belongs to (SYSTEM.md: error text near fields), with a red edge.
export function Field({ label, value, onChangeText, onBlur, placeholder, hint, multiline, keyboardType, secureTextEntry, autoComplete, onSubmitEditing, returnKeyType, inputRef, icon, error, disabled, maxLength }: {
  label: string; value: string; onChangeText: (text: string) => void; placeholder?: string; multiline?: boolean;
  hint?: string; // a rule the value must meet, shown under the field while typing (a placeholder vanishes at the first letter)
  keyboardType?: 'default' | 'phone-pad' | 'decimal-pad' | 'number-pad' | 'email-address'; secureTextEntry?: boolean; autoComplete?: 'tel' | 'password' | 'new-password' | 'name' | 'email' | 'username' | 'one-time-code';
  onSubmitEditing?: () => void; onBlur?: () => void; returnKeyType?: 'go' | 'next'; inputRef?: React.RefObject<TextInput | null>; icon?: IconName; error?: string; disabled?: boolean; maxLength?: number;
}) {
  const { palette } = useTheme();
  const styles = useStyles();
  const { align, row } = useCopy();
  const inputAlign = keyboardType === 'phone-pad' || keyboardType === 'decimal-pad' || keyboardType === 'number-pad' || keyboardType === 'email-address' ? 'left' : align;
  const [focused, setFocused] = useState(false);
  // Android 15 draws a line in the Arabic locale taller than layout measures it, so a multiline field grew short and hid its
  // first line (A53); size the box from the text the field actually drew.
  const [textHeight, setTextHeight] = useState(0);
  const ownRef = React.useRef<TextInput>(null);
  const ref = inputRef ?? ownRef;
  // Android keeps focus when the keyboard is closed with Back; blur so the touch layer below returns and a drag scrolls again.
  React.useEffect(() => {
    if (!focused || Platform.OS !== 'android') return;
    const sub = Keyboard.addListener('keyboardDidHide', () => ref.current?.blur());
    return () => sub.remove();
  }, [focused, ref]);
  return <View style={styles.field}>
    {/* Tapping the label focuses its field, as on the web (A53 walk, 22 Nov). Screen readers already hear the label on the input,
        so the label and its text are hidden from them, and it is no keyboard stop on the web (Haiku PR #105 M1, M2). */}
    <Pressable accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden tabIndex={-1}
      disabled={disabled} onPress={() => ref.current?.focus()}>
      <Txt variant="label" style={{ marginBottom: 6 }}>{label}</Txt>
    </Pressable>
    <View style={[styles.inputWrap, { flexDirection: row }, focused && styles.inputFocused, disabled && styles.inputDisabled, !!error && styles.inputError, multiline && { alignItems: 'flex-start' }]}>
      {icon && <Ionicons name={icon} size={iconSize.md} color={error ? palette.error : palette.faint} style={multiline ? { marginTop: 13 } : undefined} />}
      <TextInput ref={ref} maxFontSizeMultiplier={maxScale} accessibilityLabel={label} accessibilityHint={error || hint} aria-disabled={disabled} editable={!disabled} maxLength={maxLength} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={disabled ? palette.secondary : palette.faint}
        multiline={multiline} keyboardType={keyboardType} secureTextEntry={secureTextEntry} autoComplete={autoComplete} textAlign={inputAlign}
        onSubmitEditing={onSubmitEditing} returnKeyType={returnKeyType ?? (onSubmitEditing ? 'go' : undefined)} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); onBlur?.(); }}
        onContentSizeChange={multiline ? e => setTextHeight(Math.ceil(e.nativeEvent.contentSize.height)) : undefined}
        autoCapitalize="none" /* measured: onContentSizeChange re-reads the height on every font change, and maxHeight caps it */ style={[styles.input, { textAlign: inputAlign }, disabled && { color: palette.secondary }, keyboardType === 'phone-pad' && { writingDirection: 'ltr' }, multiline && { minHeight: 70, maxHeight: 160, textAlignVertical: 'top', paddingTop: 12 }, multiline && textHeight > 0 && { height: textHeight }]} />
      {/* Android: a drag that starts on an unfocused field never reaches the page ScrollView, because ReactEditText keeps
          the touch whenever the field reports any scroll range (right-aligned text, or a line taller than the box at a large
          font scale; A53). Until focus this layer takes the touch, so the page scrolls; a tap focuses with the cursor at the end. */}
      {Platform.OS === 'android' && !focused && <Pressable style={StyleSheet.absoluteFill} accessible={false} importantForAccessibility="no" disabled={disabled}
        onPress={() => { ref.current?.focus(); ref.current?.setSelection(value.length, value.length); }} />}
    </View>
    {!!error && <Row gap={5} style={{ marginTop: 5 }}>
      <Ionicons name="alert-circle" size={14} color={palette.error} />
      <Text maxFontSizeMultiplier={maxScale} accessibilityLiveRegion="polite" style={styles.fieldError}>{error}</Text>
    </Row>}
    {/* screen readers hear the hint on the input itself */}
    {!error && !!hint && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={{ marginTop: 5 }}><Txt variant="caption">{hint}</Txt></View>}
  </View>;
}

export function ErrorText({ children }: { children?: string }) {
  const styles = useStyles();
  useEffect(() => { if (children && Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(children); }, [children]);
  if (!children) return null;
  return <Animated.View entering={FadeInDown.duration(200)}>
    <Text maxFontSizeMultiplier={maxScale} accessibilityRole="alert" style={styles.error}>{children}</Text>
  </Animated.View>;
}

// ---------- display ----------

// Design system v2: every status is one of five journey states (wait, live, attention, problem, done), each with a word and an
// icon or pulse, never colour alone. `fg` is the badge text on `bg`; `mark` is the state's colour on a plain card (dots, the ETA).
// Live is the brand pair (lime on forest); waiting is an outline; only a real problem is solid red.
/** Day; components read useTheme().statusTone. */
export const statusTone: Record<OrderStatus, StateLook> = themeKits.day.statusTone;
const stateIcon: Record<JourneyState, IconName | undefined> = {
  wait: 'hourglass-outline', live: undefined, attention: 'alert-circle-outline', problem: 'close-circle-outline', done: 'checkmark',
};

export function Badge({ label, status, tone, icon }: { label: string; status?: OrderStatus; tone?: { bg: string; fg: string; edge?: string }; icon?: IconName }) {
  const { statusTone } = useTheme();
  const styles = useStyles();
  const t = tone ?? statusTone[status ?? 'completed'] ?? statusTone.completed; // a status newer than this build still renders
  // the state comes from the status even when a caller recolours it; a status newer than this build gets no glyph, never a check
  const state = status ? journeyState[status] : undefined;
  const glyph = icon ?? (state ? stateIcon[state] : undefined);
  const { row } = useCopy(); // the live dot or state icon leads the label in both languages
  return <View style={[styles.badge, { backgroundColor: t.bg, flexDirection: row }, !!t.edge && { borderWidth: 1, borderColor: t.edge, paddingVertical: 2 }]}>
    {state === 'live' && <Pulse color={t.fg} size={6} />}
    {glyph && <Ionicons name={glyph} size={12} color={t.fg} />}
    <Text maxFontSizeMultiplier={maxScale} style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
  </View>;
}

/** Day; components read useTheme().tones. */
export const tones = themeKits.day.tones;

// Settings list: one card per group, hairline between rows. Destructive rows go in their own group at the end.
export function ListGroup({ children }: { children: React.ReactNode }) {
  const { shadow } = useTheme();
  const styles = useStyles();
  const items = React.Children.toArray(children);
  return <View style={[styles.group, shadow]}>
    {items.map((child, i) => <View key={i} style={i > 0 && styles.groupDivider}>{child}</View>)}
  </View>;
}

export function ListRow({ icon, label, value, onPress, tone = 'olive', danger, action }: {
  icon: IconName; label: string; value?: string; onPress: () => void; tone?: keyof typeof tones; danger?: boolean;
  action?: boolean; // does something here (sign out) instead of opening a page: no chevron
}) {
  const { palette, tones } = useTheme();
  const styles = useStyles();
  const { row, rtl, align, language } = useCopy();
  const t = danger ? tones.error : tones[tone];
  return <Press accessibilityLabel={value ? `${label}: ${value}` : label} onPress={onPress} style={[styles.listRow, { flexDirection: row }]}>
    <View style={[styles.listIcon, { backgroundColor: t.bg }]}><Ionicons name={icon} size={iconSize.md} color={t.fg} /></View>
    <Text key={language} maxFontSizeMultiplier={maxScale} numberOfLines={useLines(1)} style={[styles.listLabel, { textAlign: align }, danger && { color: palette.error, fontWeight: '700' }]}>{label}</Text>
    {!!value && <Text maxFontSizeMultiplier={maxScale} style={styles.listValue}>{value}</Text>}
    {!danger && !action && <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={16} color={palette.faint} />}
  </Press>;
}

// Looping "live" dot: state indication for anything in progress.
export function Pulse({ color: given, size: s = 8 }: { color?: string; size?: number }) {
  const { palette } = useTheme();
  const color = given ?? palette.olive;
  const reduced = useReducedMotion();
  return <Animated.View style={[{ width: s, height: s, borderRadius: s, backgroundColor: color },
    !reduced && {
      animationName: { from: { opacity: 1, transform: [{ scale: 1 }] }, to: { opacity: 0.35, transform: [{ scale: 0.7 }] } },
      animationDuration: '900ms', animationIterationCount: 'infinite', animationDirection: 'alternate', animationTimingFunction: 'ease-in-out',
    }]} />;
}

// "Looking for a driver": rings ripple out from the centre while the order is unassigned.
// Reduced motion keeps one static ring so the state still reads without movement.
export function Radar({ color: given, size: s = 120, children }: { color?: string; size?: number; children?: React.ReactNode }) {
  const { palette } = useTheme();
  const color = given ?? palette.olive;
  const reduced = useReducedMotion();
  const ring = (delay: number): StyleProp<ViewStyle> => [
    { position: 'absolute', width: s, height: s, borderRadius: s / 2, borderWidth: 2, borderColor: color, backgroundColor: `${color}22` },
    reduced ? { opacity: 0.35, transform: [{ scale: 0.75 }] } : {
      opacity: 0,
      animationName: { from: { opacity: 0.8, transform: [{ scale: 0.35 }] }, to: { opacity: 0, transform: [{ scale: 1 }] } },
      animationDuration: '2400ms', animationDelay: `${delay}ms`, animationIterationCount: 'infinite', animationTimingFunction: 'ease-out',
    },
  ];
  return <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {(reduced ? [0] : [0, 800, 1600]).map(delay => <Animated.View key={delay} style={ring(delay)} />)}
    {children}
  </View>;
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: React.ReactNode }) {
  const { palette } = useTheme();
  const styles = useStyles();
  return <Appear style={styles.empty}>
    <View style={styles.emptyIcon}><Ionicons name={icon} size={26} color={palette.olive} /></View>
    <Txt variant="h2" center>{title}</Txt>
    {body && <Txt center style={{ maxWidth: 300 }}>{body}</Txt>}
    {action && <View style={{ alignSelf: 'stretch', marginTop: 8 }}>{action}</View>}
  </Appear>;
}

// One figure with its name; `detail` is an optional plain count beneath it (never a "label · count" string).
export function Stat({ label, value, tone = 'card', index = 0, detail }: { label: string; value: string; tone?: 'card' | 'olive' | 'warn' | 'muted'; index?: number; detail?: string }) {
  // Tiles in a row stretch to the same height (one with a detail line made its neighbour look short), and the figure leads.
  return <Appear index={index} style={{ flexGrow: 1, flexBasis: 140, alignSelf: 'stretch' }}>
    <Card tone={tone} style={{ marginBottom: 0, paddingVertical: 12, flex: 1 }}>
      <Txt variant="caption" numberOfLines={2}>{label}</Txt>{/* two lines: "Completed order value" was cut to "Completed order va…" */}
      <Txt variant="h1" style={{ marginTop: 2, fontVariant: ['tabular-nums'] }}>{value}</Txt>
      {!!detail && <Txt variant="caption" numberOfLines={2} style={{ marginTop: 2 }}>{detail}</Txt>}{/* two lines: "Trips: 1 · Wind commission −₪ 2.55" was cut */}
    </Card>
  </Appear>;
}

/** The first load in flight; once it has failed, a retry instead of a spinner that never ends (the screen's ErrorText says why). */
export function Loading({ failed, onRetry }: { failed?: boolean; onRetry?: () => void }) {
  const { palette } = useTheme();
  const { c } = useCopy();
  if (failed && onRetry) return <View style={{ paddingVertical: 16 }}><Button title={c.retry} icon="refresh" variant="soft" onPress={onRetry} /></View>;
  return <View style={{ padding: 32 }}><ActivityIndicator color={palette.olive} /></View>;
}

// ---------- tabs ----------

// Docked bar (Uber/Careem pattern): compact, label under icon, a lime pill marks the current tab.
// Custom so tab order follows the in-app language (OS RTL flipping is off).
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { palette } = useTheme();
  const styles = useStyles();
  const { row, language } = useCopy();
  // expo-router gives `href: null` screens (and its internal routes) this style; the default bar hides them, so this one must too.
  const hidden = (key: string) => StyleSheet.flatten(descriptors[key].options.tabBarItemStyle)?.display === 'none';
  // Seven tabs (admin with the shop line on) leave ~55 pt each: one Arabic word (مستخدمون) split mid-word at 12 pt. 11 pt is the floor.
  const dense = state.routes.filter(route => !hidden(route.key)).length >= 7;
  return <SafeAreaView edges={['bottom']} style={styles.bar}><View style={[styles.barRow, { flexDirection: row }]}>
    {state.routes.map((route, index) => {
      const { options } = descriptors[route.key];
      if (hidden(route.key)) return null;
      const focused = state.index === index;
      const color = focused ? palette.forest : palette.secondary;
      const label = String(options.title ?? route.name);
      return <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={label} aria-selected={focused}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) { haptic.tap(); navigation.navigate(route.name, route.params); }
        }} style={styles.barItem}>
        {/* remount on focus: Fabric on Android drops borderRadius when only backgroundColor changes on a borderless view (A53, RN 0.86) */}
        <View key={focused ? 'on' : 'off'} style={[styles.barPill, focused && { backgroundColor: palette.lime, borderColor: palette.forest }]}>{/* lime alone is 1.1:1 on white: the forest edge carries it in sun */}
          {options.tabBarIcon?.({ focused, color, size: 21 })}
          {!!options.tabBarBadge && <View style={styles.barBadge}><Text maxFontSizeMultiplier={maxScale} /* A11Y-03: 200%; the badge's minWidth grows with it */ style={styles.barBadgeText}>{options.tabBarBadge}</Text></View>}
        </View>
        <Text key={language} maxFontSizeMultiplier={maxScale} /* A11Y-03: 200%; two lines in the shared bar, which grows (minHeight) */ style={[styles.barText, dense && { fontSize: 11 }, { color }, focused && { fontWeight: '800' }]} numberOfLines={2}>{label}</Text>
      </Pressable>;
    })}
  </View></SafeAreaView>;
}

// Design system v2 (Wind Control on a desktop): the same tabs as a rail on the reading-start side. Labels beside icons,
// the current page on action-soft, counts as pills at the end. The navigator places it (tabBarPosition left/right).
export function SideRail({ state, descriptors, navigation, title }: BottomTabBarProps & { title: string }) {
  const { palette, colors } = useTheme();
  const styles = useStyles();
  const { row, align, rtl } = useCopy();
  const hidden = (key: string) => StyleSheet.flatten(descriptors[key].options.tabBarItemStyle)?.display === 'none';
  // The app does not force RTL, so `end` is the physical right: in Arabic the rail sits right and its edge faces left.
  return <SafeAreaView edges={['top', 'bottom', rtl ? 'right' : 'left']} style={[styles.rail, rtl && { borderEndWidth: 0, borderLeftWidth: 1, borderLeftColor: palette.hair }]}>
    <View style={[styles.railBrand, { flexDirection: row }]}>
      <Logo size={32} decorative />
      <Text maxFontSizeMultiplier={maxScale} accessibilityRole="header" style={styles.railTitle}>{title}</Text>
    </View>
    <View accessibilityRole="tablist" style={{ gap: 2 }}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        if (hidden(route.key)) return null;
        const focused = state.index === index;
        const color = focused ? colors.onActionSoft : palette.secondary; // 7.2:1 on olivePale (action-soft) by day
        const label = String(options.title ?? route.name);
        return <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={options.tabBarBadge ? `${label}, ${options.tabBarBadge}` : label} aria-selected={focused}
          onPress={() => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          }}
          style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [styles.railItem, { flexDirection: row },
            focused ? { backgroundColor: palette.olivePale } : (hovered || pressed) && { backgroundColor: palette.paper }]}>
          {options.tabBarIcon?.({ focused, color, size: 20 })}
          <Text maxFontSizeMultiplier={maxScale} numberOfLines={1} style={[styles.railText, { color, textAlign: align }, focused && { fontWeight: '800' }]}>{label}</Text>
          {!!options.tabBarBadge && <View style={styles.railCount}><Text maxFontSizeMultiplier={maxScale} style={styles.railCountText}>{options.tabBarBadge}</Text></View>}
        </Pressable>;
      })}
    </View>
  </SafeAreaView>;
}

// Outline icon normally, filled when the tab is current.
export const tabIcon =(name: IconName) => function TabIcon({ color, size: s, focused }: { color: ColorValue; size: number; focused: boolean }) {
  const filled = String(name).replace(/-outline$/, '') as IconName;
  return <Ionicons name={focused && filled in Ionicons.glyphMap ? filled : name} size={s} color={color as string} />;
};

// Reanimated CSS transitions: run on the UI thread. Press feedback is the same in both themes; choice tiles take the theme's colours.
const motion = css.create({
  pressable: { transform: [{ scale: 1 }], transitionProperty: 'transform', transitionDuration: '120ms', transitionTimingFunction: EASE_OUT },
  pressed: { transform: [{ scale: 0.97 }] },
  // Same transform list in both states, so the transition interpolates each part. Press uses these only without reduced motion.
  tiltable: { transform: [{ perspective: 600 }, { rotateX: '0deg' }, { scale: 1 }], transitionProperty: 'transform', transitionDuration: '140ms', transitionTimingFunction: EASE_OUT },
  tilted: { transform: [{ perspective: 600 }, { rotateX: '10deg' }, { scale: 0.96 }] },
});
const useChoiceMotion = themedStyles(palette => css.create({
  choice: {
    minHeight: 48, borderRadius: 12, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 6,
    borderWidth: 1.5, borderColor: palette.field,
    transitionProperty: ['backgroundColor', 'borderColor'], transitionDuration: '160ms', transitionTimingFunction: EASE_OUT,
  },
  choiceOn: { backgroundColor: palette.forest, borderColor: palette.forest }, // selected is filled: a white tile with a hairline read as unselected
}));

const useStyles = themedStyles(palette => StyleSheet.create({
  safe: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: palette.paper },
  safeWide: { maxWidth: 1120, paddingHorizontal: 8 },
  content: { paddingHorizontal: size.gutter, paddingTop: 8, paddingBottom: 28 },
  footer: { paddingHorizontal: size.gutter, paddingTop: 10, paddingBottom: 8, backgroundColor: palette.card, borderTopWidth: 1, borderTopColor: palette.hair },
  header: { alignItems: 'center', gap: 10, marginBottom: 14, minHeight: size.control },
  iconButton: { width: size.control, height: size.control, borderRadius: size.control / 2, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: palette.card, borderRadius: size.radius, padding: 14, marginBottom: 12 },
  button: { minHeight: size.control, borderRadius: size.control / 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, gap: 8 },
  buttonSmall: { minHeight: size.control, borderRadius: size.control / 2, paddingHorizontal: 14 },
  outline: { borderWidth: 1, borderColor: palette.field },
  dangerEdge: { borderWidth: 1, borderColor: palette.error },
  buttonOff: { borderWidth: 1, borderColor: palette.line },
  buttonText: { fontSize: 15, fontWeight: '700' },
  choices: { gap: 8, marginBottom: 6 },
  tabTrack: { backgroundColor: palette.muted, borderRadius: 14, padding: 4, gap: 4 }, // Choices tabs: the sunken track
  tab: { borderWidth: 0, backgroundColor: 'transparent', minHeight: 44 },
  choiceText: { color: palette.ink, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  stepper: { alignItems: 'center', gap: 4, backgroundColor: palette.muted, borderRadius: 12, padding: 3, alignSelf: 'flex-start' }, // hugs its keys instead of a full-width bar
  stepperKey: { width: size.control, height: size.control, borderRadius: 12, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { minWidth: 28, textAlign: 'center', fontSize: 15, fontWeight: '800', color: palette.ink },
  chip: { paddingHorizontal: 14, minHeight: size.control, borderRadius: size.control / 2, backgroundColor: palette.card, justifyContent: 'center', borderWidth: 1, borderColor: palette.field },
  chipOn: { backgroundColor: palette.forest, borderColor: palette.forest },
  chipText: { fontSize: 14, fontWeight: '700', color: palette.ink },
  field: { marginBottom: 12 },
  codeCell: { flex: 1, minHeight: 56, maxWidth: 56, borderRadius: 12, borderWidth: 1, borderColor: palette.field, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center' },
  codeCellActive: { borderColor: palette.forest, borderWidth: 2 },
  codeDigit: { fontSize: 24, fontFamily: headingFont.bold, color: palette.ink, fontVariant: ['tabular-nums'] },
  codeInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: 'transparent' },
  inputWrap: { alignItems: 'center', gap: 8, borderWidth: 1, borderColor: palette.field, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 1, backgroundColor: palette.card },
  inputFocused: { borderColor: palette.forest, borderWidth: 2, paddingHorizontal: 11, paddingVertical: 0 }, // 2px focus ring; the padding keeps the text and the height still
  inputError: { borderColor: palette.error, backgroundColor: palette.errorPale },
  inputDisabled: { borderColor: palette.dash, backgroundColor: palette.muted }, // a locked field must not look typeable (A53 walk, 18 Nov)
  fieldError: { flex: 1, color: palette.error, fontSize: 13, fontWeight: '700' },
  input: { flex: 1, minHeight: size.control, paddingVertical: 10, color: palette.ink, fontSize: 16 },
  error: { color: palette.error, backgroundColor: palette.errorPale, padding: 10, borderRadius: 12, fontSize: 13, fontWeight: '700', marginBottom: 10, overflow: 'hidden', textAlign: 'center' },
  badge: { alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 99, alignSelf: 'flex-start', maxWidth: '100%' },
  badgeText: { fontSize: 12, fontWeight: '800', flexShrink: 1 }, // a long English status wraps inside its card instead of running past it
  group: { backgroundColor: palette.card, borderRadius: size.radius, overflow: 'hidden', marginBottom: 12 },
  groupDivider: { borderTopWidth: 1, borderTopColor: palette.hair },
  listRow: { alignItems: 'center', gap: 12, minHeight: size.row, paddingHorizontal: 14, paddingVertical: 6 },
  listIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  listLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: palette.ink },
  listValue: { fontSize: 13, color: palette.secondary },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: palette.olivePale, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  rail: { width: 248 /* admin-rail token (theme.ts sizes.adminRail) */, backgroundColor: palette.card, borderEndWidth: 1, borderEndColor: palette.hair, paddingHorizontal: 12, paddingVertical: 16 },
  railBrand: { alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingBottom: 18 },
  railTitle: { fontSize: 16, fontWeight: '800', color: palette.ink, flexShrink: 1 },
  railItem: { alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 10, borderRadius: 10 },
  railText: { flex: 1, fontSize: 14, fontWeight: '600' },
  railCount: { minWidth: 22, minHeight: 22, borderRadius: 11, backgroundColor: palette.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  railCountText: { color: palette.onFill, fontSize: 12, fontWeight: '800' },
  bar: { backgroundColor: palette.card, borderTopWidth: 1, borderTopColor: palette.hair, width: '100%' },
  barRow: { maxWidth: 640, width: '100%', alignSelf: 'center', paddingHorizontal: 8, paddingTop: 6, paddingBottom: 4 },
  barItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 50, gap: 3 },
  barPill: { width: 54, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  barText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  barBadge: { position: 'absolute', top: -3, right: 6, minWidth: 16, minHeight: 16, borderRadius: 8, backgroundColor: palette.warn, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  barBadgeText: { color: palette.onFill, fontSize: 12, fontWeight: '800' }, // 5.7:1 on clayInk; clay itself is too light for text
}));
