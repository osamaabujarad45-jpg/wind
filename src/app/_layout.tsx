import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationTheme, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import Animated, { useReducedMotion } from '../motion';
import { Intro } from '../intro';
import { DriverWorkProvider } from '../driver-work';
import { SessionProvider, useSession } from '../session';
import { SUPPORT_URL, UPDATE_URL } from '../api';
import { clientUpdateRequired, subscribeClientUpdate } from '../api-client';
import { syncNativePushNavigation } from '../native-push';
import { Button, Card, Empty, fill, Txt, useCopy } from '../ui';
import { useFormat } from '../parts';
import { city, orderCode } from '../model';
import { statusText } from '../copy';
import type { OfflineSummary } from '../offline-summary';
import { ThemeProvider, useTheme } from '../theme-context';

SplashScreen.preventAutoHideAsync();
// Native builds embed the heading fonts (expo-font plugin in app.json); the web loads them separately.
if (Platform.OS === 'web') Font.loadAsync({
  'ReadexPro-Bold': require('../../assets/fonts/ReadexPro-Bold.ttf'),
  'ReadexPro-SemiBold': require('../../assets/fonts/ReadexPro-SemiBold.ttf'),
}).catch(() => { /* headings fall back to the system font at regular weight: still the largest, darkest text on screen */ });

export default function RootLayout() {
  return <SessionProvider><ThemeProvider>
    <ThemedStatusBar />
    <DriverWorkRoutes />
    <IntroOverlay />
  </ThemeProvider></SessionProvider>;
}

// Dark status bar icons on Day, light ones on Night.
function ThemedStatusBar() {
  return <StatusBar style={useTheme().name === 'night' ? 'light' : 'dark'} />;
}

function DriverWorkRoutes() {
  const { me } = useSession();
  const actor = me?.user.role === 'driver' && me.user.status === 'active' ? me.user.id : 'idle';
  return <DriverWorkProvider key={actor}><Routes /></DriverWorkProvider>;
}

// Keep the splash frame through startup, then let the resolved screen accept input immediately.
const FADE_MS = 180;
function IntroOverlay() {
  const session = useSession(), theme = useTheme();
  const ready = session.ready && theme.ready;
  const reduced = useReducedMotion();
  const [gone, setGone] = useState(false);
  const [laidOut, setLaidOut] = useState(false);
  const leaving = ready && laidOut && !reduced;
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);
  if (gone || (ready && laidOut && reduced)) return null;
  // A CSS fade rather than an exit animation, so the web build (no Reanimated, see motion.tsx) fades too.
  return <Animated.View pointerEvents={ready ? 'none' : 'auto'} aria-hidden={ready} style={[StyleSheet.absoluteFill, leaving && {
    animationName: { from: { opacity: 1 }, to: { opacity: 0 } }, animationDuration: `${FADE_MS}ms`, animationFillMode: 'forwards',
  }]}
    onLayout={() => { if (!laidOut) { setLaidOut(true); SplashScreen.hide(); } }}>
    <Intro />
  </Animated.View>;
}

// Read-only: the orders this account last saw, so an offline launch is not a dead end. Nothing here acts until
// the server answers again.
function OfflineOrders({ summary }: { summary: OfflineSummary }) {
  const { c, language, rtl } = useCopy();
  const { time } = useFormat();
  return <Card tone="muted" style={{ marginTop: 16 }}>
    <Txt variant="caption">{fill(c.offlineSaved, { t: time(summary.savedAt) })}</Txt>
    <Txt variant="caption">{c.offlineSavedWarning}</Txt>
    {summary.orders.map(order => <View key={order.id} style={{ marginTop: 10 }}>
      <Txt variant="title">{city(order.pickupCity)[language]} {rtl ? '←' : '→'} {city(order.dropoffCity)[language]}</Txt>
      <Txt variant="caption">{orderCode(order.id)}, {statusText(c, order, summary.role === 'driver')}</Txt>
    </View>)}
  </Card>;
}

function Routes() {
  const { palette } = useTheme();
  const { ready, offline, offlineSummary, me, onboarded, refresh } = useSession();
  const { c } = useCopy();
  const mustUpdate = useSyncExternalStore(subscribeClientUpdate, clientUpdateRequired);
  const rootKey = useRootNavigationState()?.key;
  const canOpenNotification = ready && !offline && !mustUpdate && !!rootKey;
  useEffect(() => {
    syncNativePushNavigation(canOpenNotification, me);
    return () => syncNativePushNavigation(false, null);
  }, [canOpenNotification, me]);
  // The server refused this build (426): nothing else works, so nothing else is shown.
  if (mustUpdate) return <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: palette.paper }}>
    <Empty icon="cloud-download-outline" title={c.updateRequired} body={c.updateRequiredDesc} action={Platform.OS === 'web'
      ? <Button title={c.updateRequiredWeb} onPress={() => window.location.reload()} />
      : <View style={{ gap: 10, alignSelf: 'stretch' }}>
        {UPDATE_URL && <Button title={c.updateRequired} icon="cloud-download-outline" onPress={() => { void Linking.openURL(UPDATE_URL!); }} />}
        {SUPPORT_URL && <Button title={c.support} icon="chatbubble-outline" variant="ghost" onPress={() => { void Linking.openURL(SUPPORT_URL!); }} />}
      </View>} />
  </View>;
  if (!ready) return null;
  const summary = !me || (offlineSummary && me.user.status === 'active' && me.user.id === offlineSummary.actorId && me.user.role === offlineSummary.role)
    ? offlineSummary : null;
  if (offline) return <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: palette.paper }}>
    <Empty icon="cloud-offline-outline" title={c.offline} body={c.offlineDesc} action={<Button title={c.retry} onPress={refresh} />} />
    {!!summary?.orders.length && <OfflineOrders summary={summary} />}
  </View>;
  const role = me?.user.role;
  // Each role only has its own screens; landing on another role's route redirects to the first allowed one.
  return <NavigationThemed><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.paper } }}>
    <Stack.Protected guard={!me && !onboarded}>
      <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
    </Stack.Protected>
    <Stack.Protected guard={!me && onboarded}>
      <Stack.Screen name="auth" options={{ animation: 'fade' }} />
    </Stack.Protected>
    <Stack.Protected guard={role === 'customer'}>
      <Stack.Screen name="(customer)" />
      <Stack.Screen name="book" />
      {/* Shop delivery and merchant mode: the same customer account (MER-05). */}
      <Stack.Screen name="shop/index" />
      <Stack.Screen name="shop/[id]" />
      <Stack.Screen name="shop/cart" />
      <Stack.Screen name="merchant/index" />
      <Stack.Screen name="merchant/order/[id]" />
      <Stack.Screen name="merchant/catalogue" />
    </Stack.Protected>
    <Stack.Protected guard={role === 'driver'}>
      <Stack.Screen name="driver" />
    </Stack.Protected>
    <Stack.Protected guard={role === 'admin'}>
      <Stack.Screen name="admin" />
    </Stack.Protected>
    <Stack.Protected guard={!!me}>
      <Stack.Screen name="order/[id]" />
      <Stack.Screen name="receipt/[id]" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="roads" />
    </Stack.Protected>
    {/* Reachable signed in or out: store review requires support before sign-in. */}
    <Stack.Screen name="help" />
    {/* A shared trip link opens for anyone, signed in or not. */}
    <Stack.Screen name="track/[token]" />
  </Stack></NavigationThemed>;
}

// The navigators paint their own ground (tab scenes, transitions) from the navigation theme: without it a Night screen showed
// the library's light grey behind it.
function NavigationThemed({ children }: { children: React.ReactNode }) {
  const { name, palette } = useTheme();
  // Day keeps the library theme as it was; Night takes the Night palette.
  const value = useMemo(() => name === 'night' ? { ...DarkTheme, dark: true, colors: { ...DarkTheme.colors, primary: palette.forest,
    background: palette.paper, card: palette.card, text: palette.ink, border: palette.hair, notification: palette.warn } } : DefaultTheme, [name, palette]);
  return <NavigationTheme value={value}>{children}</NavigationTheme>;
}
