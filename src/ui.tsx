import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
  type ColorValue, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { css, cubicBezier, FadeInDown, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { copy, fill, type CopyKey } from './copy';
import { errorCode, storage } from './api';
import { useSession } from './session';
import type { OrderStatus } from './model';

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
  muted: '#EAE8DF',
  error: '#A3392A',
  errorPale: '#F8E6E2',
};

// Soft lift instead of hairline borders. Small blur: large glows read as cheap on a phone.
export const shadow: ViewStyle = { boxShadow: '0px 1px 2px rgba(14,31,25,0.06), 0px 4px 14px rgba(14,31,25,0.06)' };

// Compact scale (Material 3 / Apple HIG): 14pt body, 36–46pt controls, every tap target ≥ 44pt through padding or hitSlop.
export const size = { control: 46, small: 36, row: 52, radius: 16, gutter: 16 };
const HIT = { top: 6, bottom: 6, left: 6, right: 6 };

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
export type IconName = keyof typeof Ionicons.glyphMap;

export function useCopy() {
  const { language } = useSession();
  const rtl = language === 'ar';
  return {
    c: copy[language], language, rtl,
    row: rtl ? 'row-reverse' as const : 'row' as const,
    align: rtl ? 'right' as const : 'left' as const,
    err: (error: unknown) => copy[language][`err_${typeof error === 'string' ? error : errorCode(error)}` as CopyKey] ?? copy[language].err_generic,
    money: (n: number) => `${n < 0 ? '−' : ''}${copy[language].nis} ${Number.isInteger(n) ? Math.abs(n) : Math.abs(n).toFixed(2)}`,
  };
}

export { fill };

// Native confirm on iOS/Android; window.confirm on web where Alert buttons don't render.
export function confirm(message: string, onYes: () => void, yes = 'OK', no = '×') {
  if (Platform.OS === 'web') { if (window.confirm(message)) onYes(); return; }
  Alert.alert(message, undefined, [{ text: no, style: 'cancel' }, { text: yes, style: 'destructive', onPress: onYes }]);
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
  return <View accessibilityRole="image" accessibilityLabel="Wind" style={[styles.logo, { width: s, height: s, borderRadius: s * logoMark.radius }]}>
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
  return <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
    <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      refreshControl={refresh && <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.olive} />}>
      {children}
    </ScrollView>
    {footer && <View style={styles.footer}>{footer}</View>}
  </SafeAreaView>;
}

export function Header({ title, back = false, right, subtitle }: { title: string; back?: boolean; right?: React.ReactNode; subtitle?: string }) {
  const { row, language } = useCopy();
  return <View style={[styles.header, { flexDirection: row }]}>
    {back && <IconButton icon={row === 'row-reverse' ? 'arrow-forward' : 'arrow-back'} label={language === 'ar' ? 'رجوع' : 'Back'}
      onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />}
    <View style={{ flex: 1 }}>
      <Txt variant="h1" numberOfLines={1}>{title}</Txt>
      {!!subtitle && <Txt variant="caption" numberOfLines={1}>{subtitle}</Txt>}
    </View>
    {right}
  </View>;
}

export function IconButton({ icon, label, onPress, tone = 'card', disabled }: {
  icon: IconName; label: string; onPress: () => void; tone?: 'card' | 'muted' | 'forest'; disabled?: boolean;
}) {
  const bg = { card: palette.card, muted: palette.muted, forest: palette.forest }[tone];
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} accessibilityState={{ disabled }} hitSlop={HIT}
    style={({ pressed }) => [styles.iconButton, { backgroundColor: bg }, tone === 'card' && shadow, pressed && { opacity: 0.7 }]}>
    <Ionicons name={icon} size={19} color={tone === 'forest' ? palette.lime : palette.ink} />
  </Pressable>;
}

export function Row({ children, style, gap = 10 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  const { row } = useCopy();
  return <View style={[{ flexDirection: row, alignItems: 'center', gap }, style]}>{children}</View>;
}

const textVariants = {
  h1: { fontSize: 21, lineHeight: 28, fontWeight: '800', color: palette.ink },
  h2: { fontSize: 17, lineHeight: 24, fontWeight: '800', color: palette.ink },
  title: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: palette.ink },
  body: { fontSize: 14, lineHeight: 21, color: palette.secondary },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.ink },
  caption: { fontSize: 12, lineHeight: 17, color: palette.secondary },
  micro: { fontSize: 11, lineHeight: 15, fontWeight: '600', color: palette.faint },
} satisfies Record<string, TextStyle>;

export function Txt({ children, variant = 'body', style, center, numberOfLines, selectable }: {
  children: React.ReactNode; variant?: keyof typeof textVariants; style?: StyleProp<TextStyle>; center?: boolean; numberOfLines?: number; selectable?: boolean;
}) {
  const { align } = useCopy();
  return <Text numberOfLines={numberOfLines} selectable={selectable} style={[textVariants[variant], { textAlign: center ? 'center' : align }, style]}>{children}</Text>;
}

// Section heading with an optional trailing link ("See all").
export function Section({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <Row style={{ justifyContent: 'space-between', marginTop: 6, marginBottom: 10 }}>
    <Txt variant="h2">{title}</Txt>
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
export function Appear({ index = 0, children, style }: { index?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const entering = useMemo(() => FadeInDown.duration(240).delay(Math.min(index, 8) * 40), [index]);
  return <Animated.View entering={reduced ? undefined : entering} layout={reduced ? undefined : LinearTransition.duration(200)} style={style}>{children}</Animated.View>;
}

export function Avatar({ name, size: s = 44, tone = 'forest' }: { name: string; size?: number; tone?: 'forest' | 'olive' | 'blue' }) {
  const t = { forest: [palette.forest, palette.lime], olive: [palette.olivePale, palette.olive], blue: [palette.bluePale, palette.blue] }[tone];
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: t[0], alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: t[1], fontSize: s * 0.42, fontWeight: '800' }}>{name.trim().slice(0, 1) || '•'}</Text>
  </View>;
}

// ---------- controls ----------

// Press feedback: 3% scale over 120ms on the UI thread.
export function Press({ children, onPress, style, disabled, accessibilityLabel, accessibilityRole = 'button', accessibilityState, hitSlop }: {
  children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; disabled?: boolean;
  accessibilityLabel?: string; accessibilityRole?: 'button' | 'link' | 'radio' | 'checkbox'; accessibilityState?: { selected?: boolean; checked?: boolean };
  hitSlop?: number; // for controls drawn smaller than 44pt
}) {
  const [pressed, setPressed] = useState(false);
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel} hitSlop={hitSlop}
    accessibilityState={{ disabled, ...accessibilityState }} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} pressRetentionOffset={16}>
    <Animated.View style={[motion.pressable, style, pressed && motion.pressed, disabled && { opacity: 0.5 }]}>{children}</Animated.View>
  </Pressable>;
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, size: s = 'md', trailing }: {
  title: string; onPress: () => void; variant?: 'primary' | 'soft' | 'danger' | 'ghost' | 'outline'; icon?: IconName; loading?: boolean; disabled?: boolean;
  size?: 'md' | 'sm'; trailing?: string;
}) {
  const { row } = useCopy();
  const tone = {
    primary: { bg: palette.forest, fg: '#FFFFFF' }, soft: { bg: palette.olivePale, fg: palette.olive },
    danger: { bg: palette.errorPale, fg: palette.error }, ghost: { bg: 'transparent', fg: palette.secondary },
    outline: { bg: palette.card, fg: palette.ink },
  }[variant];
  const small = s === 'sm';
  return <Press accessibilityLabel={trailing ? `${title} ${trailing}` : title} onPress={onPress} disabled={disabled || loading}
    style={[styles.button, small && styles.buttonSmall, { backgroundColor: tone.bg, flexDirection: row }, variant === 'outline' && styles.outline,
      trailing ? { justifyContent: 'space-between' } : null]}>
    <View style={{ flexDirection: row, alignItems: 'center', gap: 7, flexShrink: 1 }}>
      {loading ? <ActivityIndicator size="small" color={tone.fg} /> : icon && <Ionicons name={icon} size={small ? 16 : 18} color={tone.fg} />}
      <Text style={[styles.buttonText, small && { fontSize: 13 }, { color: tone.fg, flexShrink: 1 }]}>{title}</Text>
    </View>
    {trailing && <Text style={[styles.buttonText, { color: variant === 'primary' ? palette.lime : tone.fg }]}>{trailing}</Text>}
  </Press>;
}

export function Choices<K extends string>({ items, value, onChange, disabled }: { items: { key: K; label: string }[]; value: K; onChange: (key: K) => void; disabled?: boolean }) {
  const { row } = useCopy();
  return <View style={[styles.choices, { flexDirection: row }]} accessibilityRole="radiogroup">
    {items.map(item => {
      const on = item.key === value;
      return <Pressable key={item.key} accessibilityRole="radio" accessibilityLabel={item.label} accessibilityState={{ checked: on, disabled }} disabled={disabled}
        onPress={() => onChange(item.key)} style={{ flex: 1 }} hitSlop={{ top: 4, bottom: 4 }}>
        <Animated.View style={[motion.choice, on && motion.choiceOn]}>
          <Text style={[styles.choiceText, on && { color: palette.ink }]}>{item.label}</Text>
        </Animated.View>
      </Pressable>;
    })}
  </View>;
}

// Plus/minus counter: passengers, quantities.
export function Stepper({ value, min = 1, max = 99, onChange, label, disabled }: { value: number; min?: number; max?: number; onChange: (n: number) => void; label: string; disabled?: boolean }) {
  const { row, language } = useCopy();
  const step = (d: number) => { haptic.tap(); onChange(Math.min(max, Math.max(min, value + d))); };
  return <View style={[styles.stepper, { flexDirection: row }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${language === 'ar' ? 'إنقاص' : 'Decrease'} ${label}`} onPress={() => step(-1)} disabled={disabled || value <= min} accessibilityState={{ disabled: disabled || value <= min }} style={styles.stepperKey}>
      <Ionicons name="remove" size={18} color={value <= min ? palette.faint : palette.ink} />
    </Pressable>
    <Text accessibilityLabel={`${label}: ${value}`} style={styles.stepperValue}>{value}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${language === 'ar' ? 'زيادة' : 'Increase'} ${label}`} onPress={() => step(1)} disabled={disabled || value >= max} accessibilityState={{ disabled: disabled || value >= max }} style={styles.stepperKey}>
      <Ionicons name="add" size={18} color={value >= max ? palette.faint : palette.ink} />
    </Pressable>
  </View>;
}

// Horizontal scroller that starts at the reading start: in Arabic the first item sits at the right edge.
export function Rail({ children, gap = 8, style, contentStyle }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle> }) {
  const { row, rtl } = useCopy();
  const ref = React.useRef<ScrollView>(null);
  return <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} style={[{ flexGrow: 0 }, style]}
    contentContainerStyle={[{ flexDirection: row, gap }, contentStyle]}
    onContentSizeChange={() => { if (rtl) ref.current?.scrollToEnd({ animated: false }); }}>
    {children}
  </ScrollView>;
}

export function FilterChips<K extends string>({ items, value, onChange }: { items: { key: K; label: string }[]; value: K; onChange: (key: K) => void }) {
  return <Rail style={{ marginBottom: 10 }} contentStyle={{ paddingVertical: 4 }}>
    {items.map(item => <Pressable key={item.key} accessibilityRole="radio" accessibilityState={{ checked: item.key === value }} accessibilityLabel={item.label}
      onPress={() => onChange(item.key)} hitSlop={{ top: 5, bottom: 5 }} style={[styles.chip, item.key === value && styles.chipOn]}>
      <Text style={[styles.chipText, item.key === value && { color: '#FFFFFF' }]}>{item.label}</Text>
    </Pressable>)}
  </Rail>;
}

// error: shown under the field it belongs to (SYSTEM.md: error text near fields), with a red edge.
export function Field({ label, value, onChangeText, placeholder, multiline, keyboardType, secureTextEntry, autoComplete, onSubmitEditing, returnKeyType, inputRef, icon, error, disabled, maxLength }: {
  label: string; value: string; onChangeText: (text: string) => void; placeholder?: string; multiline?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'decimal-pad' | 'email-address'; secureTextEntry?: boolean; autoComplete?: 'tel' | 'password' | 'new-password' | 'name' | 'email' | 'username';
  onSubmitEditing?: () => void; returnKeyType?: 'go' | 'next'; inputRef?: React.RefObject<TextInput | null>; icon?: IconName; error?: string; disabled?: boolean; maxLength?: number;
}) {
  const { align, row } = useCopy();
  const inputAlign = keyboardType === 'phone-pad' || keyboardType === 'decimal-pad' || keyboardType === 'email-address' ? 'left' : align;
  const [focused, setFocused] = useState(false);
  return <View style={styles.field}>
    <Txt variant="label" style={{ marginBottom: 6 }}>{label}</Txt>
    <View style={[styles.inputWrap, { flexDirection: row }, focused && styles.inputFocused, !!error && styles.inputError, multiline && { alignItems: 'flex-start' }]}>
      {icon && <Ionicons name={icon} size={17} color={error ? palette.error : palette.faint} style={multiline ? { marginTop: 13 } : undefined} />}
      <TextInput ref={inputRef} accessibilityLabel={label} accessibilityHint={error} accessibilityState={{ disabled }} editable={!disabled} maxLength={maxLength} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.faint}
        multiline={multiline} keyboardType={keyboardType} secureTextEntry={secureTextEntry} autoComplete={autoComplete} textAlign={inputAlign}
        onSubmitEditing={onSubmitEditing} returnKeyType={returnKeyType ?? (onSubmitEditing ? 'go' : undefined)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        autoCapitalize="none" style={[styles.input, { textAlign: inputAlign }, keyboardType === 'phone-pad' && { writingDirection: 'ltr' }, multiline && { minHeight: 70, textAlignVertical: 'top', paddingTop: 12 }]} />
    </View>
    {!!error && <Row gap={5} style={{ marginTop: 5 }}>
      <Ionicons name="alert-circle" size={14} color={palette.error} />
      <Text accessibilityLiveRegion="polite" style={styles.fieldError}>{error}</Text>
    </Row>}
  </View>;
}

export function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return <Animated.View entering={FadeInDown.duration(200)}>
    <Text accessibilityRole="alert" style={styles.error}>{children}</Text>
  </Animated.View>;
}

// ---------- help ----------

// Help card: explains a feature where it's used. Dismissed once per device (storage key tip:<id>).
export function Tip({ id, icon = 'bulb-outline', title, body, tone = 'olive' }: {
  id: string; icon?: IconName; title: string; body: string; tone?: 'olive' | 'clay' | 'blue';
}) {
  const { c, row } = useCopy();
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => { storage.get(`tip:${id}`).then(v => setOpen(v !== '1'), () => setOpen(true)); }, [id]);
  if (!open) return null;
  const t = tones[tone];
  return <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(160)} style={[styles.tip, { backgroundColor: t.bg, flexDirection: row }]}
    accessibilityRole="summary">
    <View style={[styles.tipIcon, { backgroundColor: palette.card }]}><Ionicons name={icon} size={17} color={t.fg} /></View>
    <View style={{ flex: 1, gap: 2 }}>
      <Txt variant="label" style={{ color: palette.ink }}>{title}</Txt>
      <Txt variant="caption" style={{ color: palette.ink, opacity: 0.8 }}>{body}</Txt>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={c.gotIt} hitSlop={10}
      onPress={() => { setOpen(false); storage.set(`tip:${id}`, '1'); }} style={styles.tipClose}>
      <Ionicons name="close" size={16} color={palette.secondary} />
    </Pressable>
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
  const t = tone ?? statusTone[status ?? 'completed'];
  return <View style={[styles.badge, { backgroundColor: t.bg }]}>
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
  const { row, rtl, align } = useCopy();
  const t = danger ? tones.error : tones[tone];
  return <Press accessibilityLabel={value ? `${label}: ${value}` : label} onPress={onPress} style={[styles.listRow, { flexDirection: row }]}>
    <View style={[styles.listIcon, { backgroundColor: t.bg }]}><Ionicons name={icon} size={17} color={t.fg} /></View>
    <Text numberOfLines={1} style={[styles.listLabel, { textAlign: align }, danger && { color: palette.error, fontWeight: '700' }]}>{label}</Text>
    {!!value && <Text style={styles.listValue}>{value}</Text>}
    {!danger && <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={16} color="#A3ABA6" />}
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

export function Stat({ label, value, tone = 'card', index = 0 }: { label: string; value: string; tone?: 'card' | 'olive' | 'clay' | 'muted'; index?: number }) {
  return <Appear index={index} style={{ flexGrow: 1, flexBasis: 140 }}>
    <Card tone={tone} style={{ marginBottom: 0, paddingVertical: 12 }}>
      <Txt variant="caption" numberOfLines={1}>{label}</Txt>
      <Txt variant="h2" style={{ marginTop: 2 }}>{value}</Txt>
    </Card>
  </Appear>;
}

export function Loading() {
  return <View style={{ padding: 32 }}><ActivityIndicator color={palette.olive} /></View>;
}

// ---------- tabs ----------

// Docked bar (Uber/Careem pattern): compact, label under icon, a lime pill marks the current tab.
// Custom so tab order follows the in-app language (OS RTL flipping is off).
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { row } = useCopy();
  return <SafeAreaView edges={['bottom']} style={styles.bar}><View style={[styles.barRow, { flexDirection: row }]}>
    {state.routes.map((route, index) => {
      const { options } = descriptors[route.key];
      const focused = state.index === index;
      const color = focused ? palette.forest : palette.secondary;
      const label = String(options.title ?? route.name);
      return <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: focused }}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) { haptic.tap(); navigation.navigate(route.name, route.params); }
        }} style={styles.barItem}>
        <View style={[styles.barPill, focused && { backgroundColor: palette.lime }]}>
          {options.tabBarIcon?.({ focused, color, size: 21 })}
          {!!options.tabBarBadge && <View style={styles.barBadge}><Text style={styles.barBadgeText}>{options.tabBarBadge}</Text></View>}
        </View>
        <Text style={[styles.barText, { color }, focused && { fontWeight: '800' }]} numberOfLines={1}>{label}</Text>
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
    minHeight: 44, borderRadius: 12, backgroundColor: palette.muted, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 6,
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
  header: { alignItems: 'center', gap: 10, marginBottom: 14, minHeight: 44 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: palette.card, borderRadius: size.radius, padding: 14, marginBottom: 12 },
  button: { minHeight: size.control, borderRadius: size.control / 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, gap: 8 },
  buttonSmall: { minHeight: 44, borderRadius: 22, paddingHorizontal: 14 },
  outline: { borderWidth: 1, borderColor: palette.line },
  buttonText: { fontSize: 15, fontWeight: '700' },
  choices: { gap: 8, marginBottom: 6 },
  choiceText: { color: palette.secondary, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  stepper: { alignItems: 'center', gap: 4, backgroundColor: palette.muted, borderRadius: 12, padding: 3 },
  stepperKey: { width: 44, height: 44, borderRadius: 10, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { minWidth: 28, textAlign: 'center', fontSize: 15, fontWeight: '800', color: palette.ink },
  chip: { paddingHorizontal: 14, minHeight: 44, borderRadius: 22, backgroundColor: palette.card, justifyContent: 'center', borderWidth: 1, borderColor: palette.line },
  chipOn: { backgroundColor: palette.forest, borderColor: palette.forest },
  chipText: { fontSize: 13, fontWeight: '700', color: palette.secondary },
  field: { marginBottom: 12 },
  inputWrap: { alignItems: 'center', gap: 8, borderWidth: 1, borderColor: palette.line, borderRadius: 12, paddingHorizontal: 12, backgroundColor: palette.paper },
  inputFocused: { borderColor: palette.forest, backgroundColor: palette.card },
  inputError: { borderColor: palette.error, backgroundColor: palette.errorPale },
  fieldError: { flex: 1, color: palette.error, fontSize: 12, fontWeight: '700' },
  input: { flex: 1, minHeight: 44, paddingVertical: 10, color: palette.ink, fontSize: 15 },
  error: { color: palette.error, backgroundColor: palette.errorPale, padding: 10, borderRadius: 12, fontSize: 13, fontWeight: '700', marginBottom: 10, overflow: 'hidden', textAlign: 'center' },
  tip: { alignItems: 'flex-start', gap: 10, borderRadius: 14, padding: 12, marginBottom: 12 },
  tipIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tipClose: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 99, alignSelf: 'flex-start' },
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
  barBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' }, // 5.7:1 on clayInk; clay itself is too light for text
});
