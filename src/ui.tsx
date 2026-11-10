import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
  type ColorValue, type LayoutRectangle, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { css, cubicBezier, FadeInDown, useReducedMotion } from './motion';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { BottomTabBarHeightContext, type BottomTabBarProps } from 'expo-router/js-tabs';
import { copy, fill, type CopyKey } from './copy';
import { ApiError, errorCode } from './api';
import { useSession } from './session';
import { ltr, type OrderStatus } from './model';

// Shared with the Souq app (client/src/styles/index.css): same ground, ink, forest, lime and clay.
export const palette = {
  paper: '#F3F2EC',
  card: '#FFFFFF',
  ink: '#0E1F19',
  secondary: '#56635C',
  faint: '#66716B', // 4.5:1 on paper and white: the lightest grey allowed for text (same as Souq's ink-faint)
  olive: '#34765A',
  olivePale: '#E2EEE5',
  forest: '#12342A', // lead surfaces: primary button, search pill, logo tile
  lime: '#D3F27A', // only ever on forest
  clay: '#CB6845', // logo pin and markers; too light for text
  clayInk: '#A94A28',
  clayPale: '#F9E9E1',
  blue: '#2F5E8C',
  bluePale: '#E6EDF6',
  line: '#E2E1D8',
  hair: '#ECEBE4',
  mapWash: '#E6ECE3', // map placeholder and failure ground, before tiles draw
  dash: '#B4B3A8', // non-text marks on paper, muted or white (1.7–2.1:1): disabled button edge, sheet grip
  muted: '#EAE8DF',
  error: '#A3392A',
  onFill: '#FFFFFF', // text and icons on forest, olive, blue and clayInk fills
  errorPale: '#F8E6E2',
};

// Soft lift instead of hairline borders. Small blur: large glows read as cheap on a phone.
export const shadow: ViewStyle = { boxShadow: '0px 1px 2px rgba(14,31,25,0.06), 0px 4px 14px rgba(14,31,25,0.06)' };
// Bottom sheets over the map cast upward.
export const sheetShadow: ViewStyle = { boxShadow: '0px -2px 16px rgba(14,31,25,0.16)' };

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
      const text = copy[language][`err_${typeof error === 'string' ? error : errorCode(error)}` as CopyKey] ?? copy[language].err_generic;
      // A failure the server logged carries its id: the first eight characters are enough for support to find it.
      return error instanceof ApiError && error.reference ? `${text} ${copy[language].errorRef} ${ltr(error.reference.slice(0, 8))}` : text;
    },
    money: (n: number) => `${n < 0 ? '−' : ''}${copy[language].nis} ${Number.isInteger(n) ? Math.abs(n) : Math.abs(n).toFixed(2)}`,
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

// Wind mark: three lime wind trails pulling a terracotta location pin, on a forest tile.
// 0..100 box, identical to scripts/make_icon.py (app icon, splash, favicon). Never mirrored for RTL.
export const logoMark = {
  bars: [[26, 48, 38, 7], [14, 48, 51, 8], [32, 48, 64, 7]] as const, // x1, x2, y, thickness
  pin: [70, 45, 16, 6.5] as const, // head centre x, centre y, head radius, hole radius; the tip points down
  radius: 0.29,
};

export const logoBarStyle = (s: number, [x1, x2, y, t]: readonly [number, number, number, number]): ViewStyle => ({
  position: 'absolute', left: x1 * s / 100, top: (y - t / 2) * s / 100, width: (x2 - x1) * s / 100,
  height: t * s / 100, borderRadius: t * s / 200, backgroundColor: palette.lime,
});

// Teardrop: a square with three fully rounded corners, turned 45° so the sharp one points down.
export const logoPinStyle = (s: number): ViewStyle => {
  const [cx, cy, r] = logoMark.pin;
  return { position: 'absolute', left: (cx - r) * s / 100, top: (cy - r) * s / 100, width: 2 * r * s / 100, height: 2 * r * s / 100,
    borderRadius: r * s / 100, borderBottomRightRadius: 0, backgroundColor: palette.clay, transform: [{ rotate: '45deg' }] };
};

export const logoHoleStyle = (s: number): ViewStyle => {
  const [cx, cy, , h] = logoMark.pin;
  return { position: 'absolute', left: (cx - h) * s / 100, top: (cy - h) * s / 100, width: 2 * h * s / 100, height: 2 * h * s / 100,
    borderRadius: h * s / 100, backgroundColor: palette.forest };
};

export function Logo({ size: s = 36 }: { size?: number }) {
  const { c } = useCopy(); // the name is read in the reader's language: ويند in Arabic
  return <View accessibilityRole="image" accessibilityLabel={c.brand} style={[styles.logo, { width: s, height: s, borderRadius: s * logoMark.radius }]}>
    {logoMark.bars.map((bar, i) => <View key={i} style={logoBarStyle(s, bar)} />)}
    <View style={logoPinStyle(s)} />
    <View style={logoHoleStyle(s)} />
  </View>;
}

// ---------- layout ----------

export function Screen({ children, onRefresh, footer, scrollRef }: {
  children: React.ReactNode; onRefresh?: () => Promise<unknown>; footer?: React.ReactNode;
  scrollRef?: React.RefObject<ScrollView | null>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh && (async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); });
  // Inside tabs the TabBar already clears the system navigation bar; a second bottom inset left a dead band (A53).
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  // Android is edge-to-edge, so the keyboard no longer resizes the window: pad by the overlap instead. The ScrollView then
  // shrinks and Android scrolls the focused field into view, and the footer rides on the keyboard. iOS screens wrap their own.
  return <SafeAreaView edges={inTabs ? ['top'] : ['top', 'bottom']} style={styles.safe}>
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

export function IconButton({ icon, label, onPress, tone = 'card', disabled }: {
  icon: IconName; label: string; onPress: () => void; tone?: 'card' | 'muted' | 'forest'; disabled?: boolean;
}) {
  const bg = { card: palette.card, muted: palette.muted, forest: palette.forest }[tone];
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled}
    accessibilityState={{ disabled: !!disabled }}
    style={({ pressed }) => [styles.iconButton, { backgroundColor: bg }, tone === 'card' && shadow, pressed && { opacity: 0.7 }]}>
    <Ionicons name={icon} size={iconSize.lg} color={tone === 'forest' ? palette.lime : palette.ink} />
  </Pressable>;
}

export function Row({ children, style, gap = 10 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  const { row } = useCopy();
  return <View style={[{ flexDirection: row, alignItems: 'center', gap }, style]}>{children}</View>;
}

// Headings are Readex Pro (Arabic and Latin drawn together; the Arabic extension of Lexend, made for quick reading).
// One family per weight file, so no fontWeight: Android would fake-bold an already bold face. Body stays the system font.
export const headingFont = { bold: 'ReadexPro-Bold', semibold: 'ReadexPro-SemiBold' } as const;
const textVariants = {
  h1: { fontSize: 21, lineHeight: 30, fontFamily: headingFont.bold, color: palette.ink },
  h2: { fontSize: 17, lineHeight: 25, fontFamily: headingFont.semibold, color: palette.ink },
  title: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: palette.ink },
  body: { fontSize: 14, lineHeight: 21, color: palette.secondary },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.ink },
  caption: { fontSize: 12, lineHeight: 17, color: palette.secondary },
  micro: { fontSize: 11, lineHeight: 15, fontWeight: '600', color: palette.secondary }, // faint fell to 4.1–4.3:1 on muted and pale cards
} satisfies Record<string, TextStyle>;

export function Txt({ children, variant = 'body', style, center, numberOfLines, selectable, header, accessibilityLabel }: {
  children: React.ReactNode; variant?: keyof typeof textVariants; style?: StyleProp<TextStyle>; center?: boolean; numberOfLines?: number; selectable?: boolean;
  header?: boolean; // screen-reader heading (rotor / TalkBack); the visual size still comes from the variant
  accessibilityLabel?: string;
}) {
  const { align, language } = useCopy();
  // T42: OS text scaling stays on, capped so large Arabic/English text grows without clipping the fixed line heights.
  // Keyed by language: Android kept the Arabic width after an in-app switch and clipped "Your current order".
  return <Text key={language} textBreakStrategy="simple" maxFontSizeMultiplier={1.35} numberOfLines={numberOfLines} selectable={selectable} accessibilityLabel={accessibilityLabel} accessibilityRole={header ? 'header' : undefined} style={[textVariants[variant], { textAlign: center ? 'center' : align }, style]}>{children}</Text>;
}

// Section heading with an optional trailing link ("See all").
export function Section({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <Row style={{ justifyContent: 'space-between', marginTop: 6, marginBottom: 10 }}>
    <Txt variant="h2" header>{title}</Txt>
    {action && onAction && <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} hitSlop={13}>
      {/* label variant is ~18px tall; 13px slop each side brings the target to 44pt */}
      <Txt variant="label" style={{ color: palette.olive }}>{action}</Txt>
    </Pressable>}
  </Row>;
}

export function Card({ children, style, tone = 'card' }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'card' | 'muted' | 'olive' | 'clay' | 'forest' }) {
  const bg = { card: palette.card, muted: palette.muted, olive: palette.olivePale, clay: palette.clayPale, forest: palette.forest }[tone];
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
  const t = { forest: [palette.forest, palette.lime], olive: [palette.olivePale, palette.olive], blue: [palette.bluePale, palette.blue] }[tone];
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: t[0], alignItems: 'center', justifyContent: 'center' }}>
    {/* A contact known only by phone number gets a person, not its first digit. */}
    {/^[+\d٠-٩]/.test(name.trim()) ? <Ionicons name="person" size={s * 0.45} color={t[1]} />
      : <Text style={{ color: t[1], fontSize: s * 0.42, fontWeight: '800' }}>{name.trim().slice(0, 1) || '•'}</Text>}
  </View>;
}

// ---------- controls ----------

// Press feedback: 3% scale over 120ms on the UI thread.
export function Press({ children, onPress, style, containerStyle, disabled, accessibilityLabel, accessibilityRole = 'button', accessibilityState, hitSlop, dim = true }: {
  children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; containerStyle?: StyleProp<ViewStyle>; disabled?: boolean;
  accessibilityLabel?: string; accessibilityRole?: 'button' | 'link' | 'radio' | 'checkbox'; accessibilityState?: { checked?: boolean; busy?: boolean };
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number }; // for controls drawn smaller than 44pt
  dim?: boolean; // false when the control draws its own disabled colours: a 50% wash turns white labels on forest into grey
}) {
  const [pressed, setPressed] = useState(false);
  return <Pressable style={containerStyle} onPress={onPress} disabled={!!disabled} accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel} hitSlop={hitSlop}
    aria-disabled={!!disabled} aria-busy={!!accessibilityState?.busy} aria-checked={accessibilityState?.checked} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} pressRetentionOffset={16}>
    <Animated.View style={[motion.pressable, style, pressed && motion.pressed, disabled && dim && { opacity: 0.5 }]}>{children}</Animated.View>
  </Pressable>;
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, size: s = 'md', trailing, label, reason }: {
  title: string; onPress: () => void; variant?: 'primary' | 'soft' | 'danger' | 'ghost' | 'outline'; icon?: IconName; loading?: boolean; disabled?: boolean;
  size?: 'md' | 'sm'; trailing?: string; label?: string;
  reason?: string; // why it waits, shown under it only while disabled and not busy itself (design §10)
}) {
  const { row } = useCopy();
  const tone = {
    primary: { bg: palette.forest, fg: palette.onFill }, soft: { bg: palette.olivePale, fg: palette.olive },
    danger: { bg: palette.errorPale, fg: palette.error }, ghost: { bg: 'transparent', fg: palette.secondary },
    outline: { bg: palette.card, fg: palette.ink },
  }[variant];
  const small = s === 'sm';
  // Disabled keeps its shape and label on a paper fill with secondary text (5.6:1), not a 50% wash of the tone. Its edge is
  // dashed: a solid-bordered paper fill read the same as an enabled outline button (driver jobs, report form), and a flat
  // muted fill vanished on muted cards. A busy button keeps its colours so the spinner reads as work in progress.
  // Callers add a <Reason> under it saying why it waits.
  const off = !!disabled && !loading;
  const look = off ? { bg: palette.paper, fg: palette.secondary } : tone;
  const press = <Press accessibilityLabel={label ?? (trailing ? `${title} ${trailing}` : title)} onPress={onPress} disabled={disabled || loading} dim={false}
    accessibilityState={{ busy: !!loading }} style={[styles.button, small && styles.buttonSmall, { backgroundColor: look.bg, flexDirection: row }, off ? styles.buttonOff : variant === 'outline' && styles.outline,
      trailing ? { justifyContent: 'space-between' } : null]}>
    <View style={{ flexDirection: row, alignItems: 'center', gap: 7, flexShrink: 1 }}>
      {loading ? <ActivityIndicator size="small" color={look.fg} /> : icon && <Ionicons name={icon} size={small ? 16 : 18} color={look.fg}
        style={row === 'row-reverse' && /^(arrow-(forward|back)|send)/.test(icon) ? { transform: [{ scaleX: -1 }] } : undefined} /* point the way Arabic reads */ />}
      <Text style={[styles.buttonText, small && { fontSize: 13 }, { color: look.fg, flexShrink: 1 }]}>{title}</Text>
    </View>
    {trailing && <Text style={[styles.buttonText, { color: variant === 'primary' && !off ? palette.lime : look.fg }]}>{trailing}</Text>}
  </Press>;
  // The gap under the reason ties it to this button, not to a control stacked below (phone-code screens).
  return off && reason ? <View style={{ marginBottom: 6 }}>{press}<Reason>{reason}</Reason></View> : press;
}

// Why a control is waiting, in one plain sentence under it (design §10). Text, not a tooltip, so it reads without a long press.
export function Reason({ children }: { children: string }) {
  return <Txt variant="body" style={{ marginTop: 6 }}>{children}</Txt>;
}

// A row of mutually exclusive options. `label` names the group for a screen reader (pass a translated word,
// never an English literal); without it the group stays unnamed, as it was.
export function Choices<K extends string>({ items, value, onChange, disabled, label }: {
  items: { key: K; label: string }[]; value: K; onChange: (key: K) => void; disabled?: boolean; label?: string;
}) {
  const { row } = useCopy();
  const wraps = items.length > 3; // five vehicles in one row split words: "Motorc/ycle"
  return <View style={[styles.choices, { flexDirection: row }, wraps && { flexWrap: 'wrap' }]} accessibilityRole="radiogroup" accessibilityLabel={label}>
    {items.map(item => {
      const on = item.key === value;
      return <Pressable key={item.key} accessibilityRole="radio" accessibilityLabel={item.label} accessibilityState={{ checked: on, disabled: !!disabled }} disabled={disabled} aria-checked={on}
        onPress={() => onChange(item.key)} style={wraps ? { flexGrow: 1, flexBasis: '30%' } : { flex: 1 }}>
        <Animated.View style={[motion.choice, on && motion.choiceOn]}>
          <Text style={[styles.choiceText, on && { color: palette.ink }]}>{item.label}</Text>
        </Animated.View>
      </Pressable>;
    })}
  </View>;
}

// Plus/minus counter: passengers, quantities.
export function Stepper({ value, min = 1, max = 99, onChange, label, disabled }: { value: number; min?: number; max?: number; onChange: (n: number) => void; label: string; disabled?: boolean }) {
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
    <Text accessibilityLabel={label} accessibilityValue={{ min, max, now: value, text: String(value) }} style={styles.stepperValue}>{value}</Text>
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
  // The selected chip's box as laid out, so a rail that opens on a later choice (a driver's far heading, a reschedule slot)
  // shows it. A tap only recolours chips, so it never relays out and never scrolls.
  const [box, setBox] = useState<{ key: K; layout: LayoutRectangle }>();
  return <View accessibilityRole="radiogroup" accessibilityLabel={label}><Rail style={{ marginBottom: 10 }} contentStyle={{ paddingVertical: 4 }} reveal={box?.key === value ? box.layout : undefined}>
    {items.map(item => <Pressable key={item.key} accessibilityRole="radio" accessibilityState={{ checked: item.key === value, disabled: !!disabled }} accessibilityLabel={item.label} aria-checked={item.key === value}
      onLayout={e => { if (item.key === value) setBox({ key: item.key, layout: e.nativeEvent.layout }); }}
      onPress={() => onChange(item.key)} disabled={disabled} style={[styles.chip, item.key === value && styles.chipOn, disabled && { opacity: 0.5 }]}>
      <Text style={[styles.chipText, item.key === value && { color: palette.onFill }]}>{item.label}</Text>
    </Pressable>)}
  </Rail></View>;
}

// error: shown under the field it belongs to (SYSTEM.md: error text near fields), with a red edge.
export function Field({ label, value, onChangeText, onBlur, placeholder, multiline, keyboardType, secureTextEntry, autoComplete, onSubmitEditing, returnKeyType, inputRef, icon, error, disabled, maxLength }: {
  label: string; value: string; onChangeText: (text: string) => void; placeholder?: string; multiline?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'decimal-pad' | 'number-pad' | 'email-address'; secureTextEntry?: boolean; autoComplete?: 'tel' | 'password' | 'new-password' | 'name' | 'email' | 'username' | 'one-time-code';
  onSubmitEditing?: () => void; onBlur?: () => void; returnKeyType?: 'go' | 'next'; inputRef?: React.RefObject<TextInput | null>; icon?: IconName; error?: string; disabled?: boolean; maxLength?: number;
}) {
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
    <Txt variant="label" style={{ marginBottom: 6 }}>{label}</Txt>
    <View style={[styles.inputWrap, { flexDirection: row }, focused && styles.inputFocused, !!error && styles.inputError, multiline && { alignItems: 'flex-start' }]}>
      {icon && <Ionicons name={icon} size={iconSize.md} color={error ? palette.error : palette.faint} style={multiline ? { marginTop: 13 } : undefined} />}
      <TextInput ref={ref} accessibilityLabel={label} accessibilityHint={error} aria-disabled={disabled} editable={!disabled} maxLength={maxLength} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.faint}
        multiline={multiline} keyboardType={keyboardType} secureTextEntry={secureTextEntry} autoComplete={autoComplete} textAlign={inputAlign}
        onSubmitEditing={onSubmitEditing} returnKeyType={returnKeyType ?? (onSubmitEditing ? 'go' : undefined)} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); onBlur?.(); }}
        onContentSizeChange={multiline ? e => setTextHeight(Math.ceil(e.nativeEvent.contentSize.height)) : undefined}
        autoCapitalize="none" style={[styles.input, { textAlign: inputAlign }, keyboardType === 'phone-pad' && { writingDirection: 'ltr' }, multiline && { minHeight: 70, maxHeight: 160, textAlignVertical: 'top', paddingTop: 12 }, multiline && textHeight > 0 && { height: textHeight }]} />
      {/* Android: a drag that starts on an unfocused field never reaches the page ScrollView, because ReactEditText keeps
          the touch whenever the field reports any scroll range (right-aligned text, or a line taller than the box at a large
          font scale; A53). Until focus this layer takes the touch, so the page scrolls; a tap focuses with the cursor at the end. */}
      {Platform.OS === 'android' && !focused && <Pressable style={StyleSheet.absoluteFill} accessible={false} importantForAccessibility="no" disabled={disabled}
        onPress={() => { ref.current?.focus(); ref.current?.setSelection(value.length, value.length); }} />}
    </View>
    {!!error && <Row gap={5} style={{ marginTop: 5 }}>
      <Ionicons name="alert-circle" size={14} color={palette.error} />
      <Text accessibilityLiveRegion="polite" style={styles.fieldError}>{error}</Text>
    </Row>}
  </View>;
}

export function ErrorText({ children }: { children?: string }) {
  useEffect(() => { if (children && Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(children); }, [children]);
  if (!children) return null;
  return <Animated.View entering={FadeInDown.duration(200)}>
    <Text accessibilityRole="alert" style={styles.error}>{children}</Text>
  </Animated.View>;
}

// ---------- display ----------

const statusTone: Record<OrderStatus, { bg: string; fg: string }> = {
  searching: { bg: palette.clayPale, fg: palette.clayInk },
  assigned: { bg: palette.bluePale, fg: palette.blue },
  at_pickup: { bg: palette.bluePale, fg: palette.blue },
  in_transit: { bg: palette.olivePale, fg: palette.olive },
  completed: { bg: palette.muted, fg: palette.secondary },
  cancelled: { bg: palette.errorPale, fg: palette.error },
  on_hold: { bg: palette.clayPale, fg: palette.clayInk },
  returning: { bg: palette.clayPale, fg: palette.clayInk },
  returned: { bg: palette.muted, fg: palette.secondary },
};
const live: OrderStatus[] = ['searching', 'assigned', 'at_pickup', 'in_transit', 'on_hold', 'returning'];

export function Badge({ label, status, tone, icon }: { label: string; status?: OrderStatus; tone?: { bg: string; fg: string }; icon?: IconName }) {
  const t = tone ?? statusTone[status ?? 'completed'] ?? statusTone.completed; // a status newer than this build still renders
  const { row } = useCopy(); // the live dot leads the label in both languages
  return <View style={[styles.badge, { backgroundColor: t.bg, flexDirection: row }]}>
    {status && live.includes(status) && <Pulse color={t.fg} size={6} />}
    {icon && <Ionicons name={icon} size={12} color={t.fg} />}
    <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
  </View>;
}

export const tones = {
  olive: { bg: palette.olivePale, fg: palette.olive }, clay: { bg: palette.clayPale, fg: palette.clayInk },
  blue: { bg: palette.bluePale, fg: palette.blue }, muted: { bg: palette.muted, fg: palette.secondary },
  error: { bg: palette.errorPale, fg: palette.error },
};

// Settings list: one card per group, hairline between rows. Destructive rows go in their own group at the end.
export function ListGroup({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  return <View style={[styles.group, shadow]}>
    {items.map((child, i) => <View key={i} style={i > 0 && styles.groupDivider}>{child}</View>)}
  </View>;
}

export function ListRow({ icon, label, value, onPress, tone = 'olive', danger }: {
  icon: IconName; label: string; value?: string; onPress: () => void; tone?: keyof typeof tones; danger?: boolean;
}) {
  const { row, rtl, align, language } = useCopy();
  const t = danger ? tones.error : tones[tone];
  return <Press accessibilityLabel={value ? `${label}: ${value}` : label} onPress={onPress} style={[styles.listRow, { flexDirection: row }]}>
    <View style={[styles.listIcon, { backgroundColor: t.bg }]}><Ionicons name={icon} size={iconSize.md} color={t.fg} /></View>
    <Text key={language} numberOfLines={1} style={[styles.listLabel, { textAlign: align }, danger && { color: palette.error, fontWeight: '700' }]}>{label}</Text>
    {!!value && <Text style={styles.listValue}>{value}</Text>}
    {!danger && <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={16} color={palette.faint} />}
  </Press>;
}

// Looping "live" dot: state indication for anything in progress.
export function Pulse({ color = palette.olive, size: s = 8 }: { color?: string; size?: number }) {
  const reduced = useReducedMotion();
  return <Animated.View style={[{ width: s, height: s, borderRadius: s, backgroundColor: color },
    !reduced && {
      animationName: { from: { opacity: 1, transform: [{ scale: 1 }] }, to: { opacity: 0.35, transform: [{ scale: 0.7 }] } },
      animationDuration: '900ms', animationIterationCount: 'infinite', animationDirection: 'alternate', animationTimingFunction: 'ease-in-out',
    }]} />;
}

// "Looking for a driver": rings ripple out from the centre while the order is unassigned.
// Reduced motion keeps one static ring so the state still reads without movement.
export function Radar({ color = palette.olive, size: s = 120, children }: { color?: string; size?: number; children?: React.ReactNode }) {
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
  return <Appear style={styles.empty}>
    <View style={styles.emptyIcon}><Ionicons name={icon} size={26} color={palette.olive} /></View>
    <Txt variant="h2" center>{title}</Txt>
    {body && <Txt center style={{ maxWidth: 300 }}>{body}</Txt>}
    {action && <View style={{ alignSelf: 'stretch', marginTop: 8 }}>{action}</View>}
  </Appear>;
}

// One figure with its name; `detail` is an optional plain count beneath it (never a "label · count" string).
export function Stat({ label, value, tone = 'card', index = 0, detail }: { label: string; value: string; tone?: 'card' | 'olive' | 'clay' | 'muted'; index?: number; detail?: string }) {
  return <Appear index={index} style={{ flexGrow: 1, flexBasis: 140 }}>
    <Card tone={tone} style={{ marginBottom: 0, paddingVertical: 12 }}>
      <Txt variant="caption" numberOfLines={1}>{label}</Txt>
      <Txt variant="h2" style={{ marginTop: 2 }}>{value}</Txt>
      {!!detail && <Txt variant="caption" numberOfLines={1} style={{ marginTop: 2 }}>{detail}</Txt>}
    </Card>
  </Appear>;
}

/** The first load in flight; once it has failed, a retry instead of a spinner that never ends (the screen's ErrorText says why). */
export function Loading({ failed, onRetry }: { failed?: boolean; onRetry?: () => void }) {
  const { c } = useCopy();
  if (failed && onRetry) return <View style={{ paddingVertical: 16 }}><Button title={c.retry} icon="refresh" variant="soft" onPress={onRetry} /></View>;
  return <View style={{ padding: 32 }}><ActivityIndicator color={palette.olive} /></View>;
}

// ---------- tabs ----------

// Docked bar (Uber/Careem pattern): compact, label under icon, a lime pill marks the current tab.
// Custom so tab order follows the in-app language (OS RTL flipping is off).
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { row, language } = useCopy();
  return <SafeAreaView edges={['bottom']} style={styles.bar}><View style={[styles.barRow, { flexDirection: row }]}>
    {state.routes.map((route, index) => {
      const { options } = descriptors[route.key];
      const focused = state.index === index;
      const color = focused ? palette.forest : palette.secondary;
      const label = String(options.title ?? route.name);
      return <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={label} aria-selected={focused}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) { haptic.tap(); navigation.navigate(route.name, route.params); }
        }} style={styles.barItem}>
        {/* remount on focus: Fabric on Android drops borderRadius when only backgroundColor changes on a borderless view (A53, RN 0.86) */}
        <View key={focused ? 'on' : 'off'} style={[styles.barPill, focused && { backgroundColor: palette.lime }]}>
          {options.tabBarIcon?.({ focused, color, size: 21 })}
          {!!options.tabBarBadge && <View style={styles.barBadge}><Text style={styles.barBadgeText}>{options.tabBarBadge}</Text></View>}
        </View>
        <Text key={language} style={[styles.barText, { color }, focused && { fontWeight: '800' }]} numberOfLines={1}>{label}</Text>
      </Pressable>;
    })}
  </View></SafeAreaView>;
}

// Outline icon normally, filled when the tab is current.
export const tabIcon = (name: IconName) => function TabIcon({ color, size: s, focused }: { color: ColorValue; size: number; focused: boolean }) {
  const filled = String(name).replace(/-outline$/, '') as IconName;
  return <Ionicons name={focused && filled in Ionicons.glyphMap ? filled : name} size={s} color={color as string} />;
};

// Reanimated CSS transitions: run on the UI thread.
const motion = css.create({
  pressable: { transform: [{ scale: 1 }], transitionProperty: 'transform', transitionDuration: '120ms', transitionTimingFunction: EASE_OUT },
  pressed: { transform: [{ scale: 0.97 }] },
  choice: {
    minHeight: 48, borderRadius: 12, backgroundColor: palette.muted, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 6,
    borderWidth: 1.5, borderColor: 'transparent',
    transitionProperty: ['backgroundColor', 'borderColor'], transitionDuration: '160ms', transitionTimingFunction: EASE_OUT,
  },
  choiceOn: { backgroundColor: palette.card, borderColor: palette.forest },
});

const styles = StyleSheet.create({
  safe: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: palette.paper },
  content: { paddingHorizontal: size.gutter, paddingTop: 8, paddingBottom: 28 },
  footer: { paddingHorizontal: size.gutter, paddingTop: 10, paddingBottom: 8, backgroundColor: palette.card, borderTopWidth: 1, borderTopColor: palette.hair },
  logo: { backgroundColor: palette.forest, overflow: 'hidden' },
  header: { alignItems: 'center', gap: 10, marginBottom: 14, minHeight: size.control },
  iconButton: { width: size.control, height: size.control, borderRadius: size.control / 2, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: palette.card, borderRadius: size.radius, padding: 14, marginBottom: 12 },
  button: { minHeight: size.control, borderRadius: size.control / 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, gap: 8 },
  buttonSmall: { minHeight: size.control, borderRadius: size.control / 2, paddingHorizontal: 14 },
  outline: { borderWidth: 1, borderColor: palette.line },
  buttonOff: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: palette.dash },
  buttonText: { fontSize: 15, fontWeight: '700' },
  choices: { gap: 8, marginBottom: 6 },
  choiceText: { color: palette.secondary, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  stepper: { alignItems: 'center', gap: 4, backgroundColor: palette.muted, borderRadius: 12, padding: 3 },
  stepperKey: { width: size.control, height: size.control, borderRadius: 12, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { minWidth: 28, textAlign: 'center', fontSize: 15, fontWeight: '800', color: palette.ink },
  chip: { paddingHorizontal: 14, minHeight: size.control, borderRadius: size.control / 2, backgroundColor: palette.card, justifyContent: 'center', borderWidth: 1, borderColor: palette.line },
  chipOn: { backgroundColor: palette.forest, borderColor: palette.forest },
  chipText: { fontSize: 13, fontWeight: '700', color: palette.secondary },
  field: { marginBottom: 12 },
  inputWrap: { alignItems: 'center', gap: 8, borderWidth: 1, borderColor: palette.line, borderRadius: 12, paddingHorizontal: 12, backgroundColor: palette.paper },
  inputFocused: { borderColor: palette.forest, backgroundColor: palette.card },
  inputError: { borderColor: palette.error, backgroundColor: palette.errorPale },
  fieldError: { flex: 1, color: palette.error, fontSize: 12, fontWeight: '700' },
  input: { flex: 1, minHeight: size.control, paddingVertical: 10, color: palette.ink, fontSize: 15 },
  error: { color: palette.error, backgroundColor: palette.errorPale, padding: 10, borderRadius: 12, fontSize: 13, fontWeight: '700', marginBottom: 10, overflow: 'hidden', textAlign: 'center' },
  badge: { alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 99, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '800' },
  group: { backgroundColor: palette.card, borderRadius: size.radius, overflow: 'hidden', marginBottom: 12 },
  groupDivider: { borderTopWidth: 1, borderTopColor: palette.hair },
  listRow: { alignItems: 'center', gap: 12, minHeight: size.row, paddingHorizontal: 14, paddingVertical: 6 },
  listIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  listLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: palette.ink },
  listValue: { fontSize: 13, color: palette.secondary },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: palette.olivePale, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  bar: { backgroundColor: palette.card, borderTopWidth: 1, borderTopColor: palette.hair, width: '100%' },
  barRow: { maxWidth: 640, width: '100%', alignSelf: 'center', paddingHorizontal: 8, paddingTop: 6, paddingBottom: 4 },
  barItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 50, gap: 3 },
  barPill: { width: 54, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  barText: { fontSize: 11, fontWeight: '600' },
  barBadge: { position: 'absolute', top: -3, right: 6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: palette.clayInk, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  barBadgeText: { color: palette.onFill, fontSize: 10, fontWeight: '800' }, // 5.7:1 on clayInk; clay itself is too light for text
});
