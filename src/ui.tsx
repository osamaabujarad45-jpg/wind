import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
  type ColorValue, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { css, cubicBezier, FadeInDown, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { copy, fill, type CopyKey } from './copy';
import { errorCode } from './api';
import { useSession } from './session';
import type { OrderStatus } from './model';

export const palette = {
  paper: '#F8F7F0',
  card: '#FFFFFF',
  ink: '#182D27',
  secondary: '#627269',
  olive: '#34765A',
  olivePale: '#E7F0E8',
  clay: '#CB6845',
  clayPale: '#FAEEE7',
  blue: '#375C86',
  bluePale: '#E9EFF7',
  line: '#DBE3D9',
  muted: '#F0F2EA',
  error: '#A3392A',
  errorPale: '#F8E6E2',
};

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

export function Logo({ size = 44 }: { size?: number }) {
  return <View style={[styles.logo, { width: size, height: size, borderRadius: size * 0.32 }]}>
    <Ionicons name="navigate" size={size * 0.5} color="#FFFFFF" />
  </View>;
}

// ---------- layout ----------

export function Screen({ children, onRefresh, scroll = true }: { children: React.ReactNode; onRefresh?: () => Promise<unknown>; scroll?: boolean }) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh && (async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); });
  return <SafeAreaView edges={['top']} style={styles.safe}>
    {scroll ? <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      refreshControl={refresh && <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.olive} />}>
      {children}
    </ScrollView> : children}
  </SafeAreaView>;
}

export function Header({ title, back = false, right }: { title: string; back?: boolean; right?: React.ReactNode }) {
  const { row, language } = useCopy();
  return <View style={[styles.header, { flexDirection: row }]}>
    {back && <Press accessibilityLabel={language === 'ar' ? 'رجوع' : 'Back'} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.iconButton}>
      <Ionicons name={row === 'row-reverse' ? 'arrow-forward' : 'arrow-back'} size={22} color={palette.ink} />
    </Press>}
    <Txt variant="h1" style={{ flex: 1 }}>{title}</Txt>
    {right}
  </View>;
}

export function Row({ children, style, gap = 10 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  const { row } = useCopy();
  return <View style={[{ flexDirection: row, alignItems: 'center', gap }, style]}>{children}</View>;
}

const textVariants = {
  h1: { fontSize: 26, fontWeight: '900', color: palette.ink },
  h2: { fontSize: 19, fontWeight: '900', color: palette.ink },
  title: { fontSize: 16, fontWeight: '800', color: palette.ink },
  body: { fontSize: 14, lineHeight: 22, color: palette.secondary },
  label: { fontSize: 13, fontWeight: '800', color: palette.ink },
  caption: { fontSize: 12, lineHeight: 18, color: palette.secondary },
} satisfies Record<string, TextStyle>;

export function Txt({ children, variant = 'body', style, center, numberOfLines, selectable }: {
  children: React.ReactNode; variant?: keyof typeof textVariants; style?: StyleProp<TextStyle>; center?: boolean; numberOfLines?: number; selectable?: boolean;
}) {
  const { align } = useCopy();
  return <Text numberOfLines={numberOfLines} selectable={selectable} style={[textVariants[variant], { textAlign: center ? 'center' : align }, style]}>{children}</Text>;
}

export function Card({ children, style, tone = 'card' }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'card' | 'muted' | 'olive' | 'clay' }) {
  const bg = { card: palette.card, muted: palette.muted, olive: palette.olivePale, clay: palette.clayPale }[tone];
  return <View style={[styles.card, { backgroundColor: bg, borderWidth: tone === 'card' ? 1 : 0 }, style]}>{children}</View>;
}

// Staggered entrance for content the user is waiting on. Not for virtualized rows.
export function Appear({ index = 0, children, style }: { index?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const entering = useMemo(() => FadeInDown.duration(260).delay(Math.min(index, 8) * 50), [index]);
  return <Animated.View entering={entering} layout={LinearTransition.duration(200)} style={style}>{children}</Animated.View>;
}

// ---------- controls ----------

// Press feedback: 3% scale over 120ms on the UI thread.
export function Press({ children, onPress, style, disabled, accessibilityLabel, accessibilityRole = 'button' }: {
  children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; disabled?: boolean;
  accessibilityLabel?: string; accessibilityRole?: 'button' | 'link';
}) {
  const [pressed, setPressed] = useState(false);
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled }} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} pressRetentionOffset={16}>
    <Animated.View style={[motion.pressable, style, pressed && motion.pressed, disabled && { opacity: 0.5 }]}>{children}</Animated.View>
  </Pressable>;
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled }: {
  title: string; onPress: () => void; variant?: 'primary' | 'soft' | 'danger' | 'ghost'; icon?: IconName; loading?: boolean; disabled?: boolean;
}) {
  const { row } = useCopy();
  const tone = {
    primary: { bg: palette.olive, fg: '#FFFFFF' }, soft: { bg: palette.olivePale, fg: palette.olive },
    danger: { bg: palette.errorPale, fg: palette.error }, ghost: { bg: 'transparent', fg: palette.secondary },
  }[variant];
  return <Press accessibilityLabel={title} onPress={onPress} disabled={disabled || loading}
    style={[styles.button, { backgroundColor: tone.bg, flexDirection: row }]}>
    {loading ? <ActivityIndicator color={tone.fg} /> : icon && <Ionicons name={icon} size={19} color={tone.fg} />}
    <Text style={[styles.buttonText, { color: tone.fg }]}>{title}</Text>
  </Press>;
}

export function Choices<K extends string>({ items, value, onChange }: { items: { key: K; label: string }[]; value: K; onChange: (key: K) => void }) {
  const { row } = useCopy();
  return <View style={[styles.choices, { flexDirection: row }]}>
    {items.map(item => {
      const on = item.key === value;
      return <Pressable key={item.key} accessibilityRole="radio" accessibilityLabel={item.label} aria-checked={on}
        onPress={() => onChange(item.key)} style={{ flex: 1 }}>
        <Animated.View style={[motion.choice, on && motion.choiceOn]}>
          <Text style={[styles.choiceText, on && { color: palette.olive }]}>{item.label}</Text>
        </Animated.View>
      </Pressable>;
    })}
  </View>;
}

export function FilterChips<K extends string>({ items, value, onChange }: { items: { key: K; label: string }[]; value: K; onChange: (key: K) => void }) {
  const { row } = useCopy();
  return <View style={{ flexDirection: row, gap: 8 }}>
    {items.map(item => <Pressable key={item.key} accessibilityRole="radio" aria-checked={item.key === value} accessibilityLabel={item.label}
      onPress={() => onChange(item.key)} style={[styles.chip, item.key === value && styles.chipOn]}>
      <Text style={[styles.chipText, item.key === value && { color: '#FFFFFF' }]}>{item.label}</Text>
    </Pressable>)}
  </View>;
}

export function Field({ label, value, onChangeText, placeholder, multiline, keyboardType, secureTextEntry, autoComplete, onSubmitEditing }: {
  label: string; value: string; onChangeText: (text: string) => void; placeholder?: string; multiline?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'decimal-pad'; secureTextEntry?: boolean; autoComplete?: 'tel' | 'password' | 'new-password' | 'name';
  onSubmitEditing?: () => void;
}) {
  const { align } = useCopy();
  return <View style={styles.field}>
    <Txt variant="label" style={{ marginBottom: 7 }}>{label}</Txt>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#91A097"
      multiline={multiline} keyboardType={keyboardType} secureTextEntry={secureTextEntry} autoComplete={autoComplete} textAlign={align}
      onSubmitEditing={onSubmitEditing} returnKeyType={onSubmitEditing ? 'go' : undefined}
      autoCapitalize="none" style={[styles.input, { textAlign: align }, multiline && { minHeight: 80, textAlignVertical: 'top' }]} />
  </View>;
}

export function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return <Animated.View entering={FadeInDown.duration(200)}>
    <Text accessibilityRole="alert" style={styles.error}>{children}</Text>
  </Animated.View>;
}

// ---------- display ----------

const statusTone: Record<OrderStatus, { bg: string; fg: string }> = {
  searching: { bg: palette.clayPale, fg: palette.clay },
  assigned: { bg: palette.bluePale, fg: palette.blue },
  at_pickup: { bg: palette.bluePale, fg: palette.blue },
  in_transit: { bg: palette.olivePale, fg: palette.olive },
  completed: { bg: palette.muted, fg: palette.secondary },
  cancelled: { bg: palette.errorPale, fg: palette.error },
};
const live: OrderStatus[] = ['searching', 'assigned', 'at_pickup', 'in_transit'];

export function Badge({ label, status, tone }: { label: string; status?: OrderStatus; tone?: { bg: string; fg: string } }) {
  const t = tone ?? statusTone[status ?? 'completed'];
  return <View style={[styles.badge, { backgroundColor: t.bg }]}>
    {status && live.includes(status) && <Pulse color={t.fg} />}
    <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
  </View>;
}

export const tones = {
  olive: { bg: palette.olivePale, fg: palette.olive }, clay: { bg: palette.clayPale, fg: palette.clay },
  blue: { bg: palette.bluePale, fg: palette.blue }, muted: { bg: palette.muted, fg: palette.secondary },
  error: { bg: palette.errorPale, fg: palette.error },
};

// Looping "live" dot: state indication for anything in progress.
export function Pulse({ color = palette.olive, size = 8 }: { color?: string; size?: number }) {
  const reduced = useReducedMotion();
  return <Animated.View style={[{ width: size, height: size, borderRadius: size, backgroundColor: color },
    !reduced && {
      animationName: { from: { opacity: 1, transform: [{ scale: 1 }] }, to: { opacity: 0.35, transform: [{ scale: 0.7 }] } },
      animationDuration: '900ms', animationIterationCount: 'infinite', animationDirection: 'alternate', animationTimingFunction: 'ease-in-out',
    }]} />;
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: React.ReactNode }) {
  return <Appear style={styles.empty}>
    <View style={styles.emptyIcon}><Ionicons name={icon} size={32} color={palette.olive} /></View>
    <Txt variant="h2" center>{title}</Txt>
    {body && <Txt center>{body}</Txt>}
    {action && <View style={{ alignSelf: 'stretch', marginTop: 6 }}>{action}</View>}
  </Appear>;
}

export function Stat({ label, value, tone = 'card', index = 0 }: { label: string; value: string; tone?: 'card' | 'olive' | 'clay' | 'muted'; index?: number }) {
  return <Appear index={index} style={{ flexGrow: 1, flexBasis: 140 }}>
    <Card tone={tone} style={{ marginBottom: 0 }}>
      <Txt variant="caption">{label}</Txt>
      <Txt variant="h2" style={{ marginTop: 4 }}>{value}</Txt>
    </Card>
  </Appear>;
}

export function Loading() {
  return <View style={{ padding: 40 }}><ActivityIndicator color={palette.olive} /></View>;
}

// ---------- tabs ----------

// Custom bar so tab order follows the in-app language (OS RTL flipping is off).
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { row } = useCopy();
  return <SafeAreaView edges={['bottom']} style={[styles.bar, { flexDirection: row }]}>
    {state.routes.map((route, index) => {
      const { options } = descriptors[route.key];
      const focused = state.index === index;
      const color = focused ? palette.olive : palette.secondary;
      const label = String(options.title ?? route.name);
      return <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: focused }}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }} style={styles.barItem}>
        <View>
          {options.tabBarIcon?.({ focused, color, size: 22 })}
          {!!options.tabBarBadge && <View style={styles.barBadge}><Text style={styles.barBadgeText}>{options.tabBarBadge}</Text></View>}
        </View>
        <Text style={[styles.barText, { color }]} numberOfLines={1}>{label}</Text>
      </Pressable>;
    })}
  </SafeAreaView>;
}

export const tabIcon = (name: IconName) => function TabIcon({ color, size }: { color: ColorValue; size: number }) {
  return <Ionicons name={name} size={size} color={color as string} />;
};

// Reanimated CSS transitions: run on the UI thread.
const motion = css.create({
  pressable: { transform: [{ scale: 1 }], transitionProperty: 'transform', transitionDuration: '120ms', transitionTimingFunction: EASE_OUT },
  pressed: { transform: [{ scale: 0.97 }] },
  choice: {
    minHeight: 46, borderRadius: 13, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
    transitionProperty: ['backgroundColor', 'borderColor'], transitionDuration: '180ms', transitionTimingFunction: EASE_OUT,
  },
  choiceOn: { backgroundColor: palette.olivePale, borderColor: palette.olive },
});

const styles = StyleSheet.create({
  safe: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: palette.paper },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  logo: { backgroundColor: palette.olive, alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'center', gap: 12, marginBottom: 18, minHeight: 44 },
  iconButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.line },
  card: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: 20, padding: 16, marginBottom: 14 },
  button: { minHeight: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, gap: 8 },
  buttonText: { fontSize: 16, fontWeight: '800' },
  choices: { gap: 8, marginBottom: 8 },
  choiceText: { color: palette.secondary, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 18, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, justifyContent: 'center' },
  chipOn: { backgroundColor: palette.olive, borderColor: palette.olive },
  chipText: { fontSize: 13, fontWeight: '800', color: palette.secondary },
  field: { marginBottom: 14 },
  input: { borderWidth: 1, borderColor: palette.line, borderRadius: 13, minHeight: 50, paddingHorizontal: 14, paddingVertical: 12, color: palette.ink, backgroundColor: palette.paper, fontSize: 15 },
  error: { color: palette.error, backgroundColor: palette.errorPale, padding: 12, borderRadius: 12, fontSize: 13, fontWeight: '700', marginBottom: 12, overflow: 'hidden', textAlign: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 99, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '800' },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 40, paddingHorizontal: 10 },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: palette.olivePale, justifyContent: 'center', alignItems: 'center' },
  bar: { borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.paper, paddingTop: 6, width: '100%', maxWidth: 640, alignSelf: 'center' },
  barItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 54, gap: 3 },
  barText: { fontSize: 11, fontWeight: '700' },
  barBadge: { position: 'absolute', top: -4, right: -10, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: palette.clay, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  barBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
});
