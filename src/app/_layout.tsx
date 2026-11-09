import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import Animated, { useReducedMotion } from '../motion';
import { Intro, INTRO_MS } from '../intro';
import { DriverWorkProvider } from '../driver-work';
import { SessionProvider, useSession } from '../session';
import { SUPPORT_URL, UPDATE_URL } from '../api';
import { clientUpdateRequired, subscribeClientUpdate } from '../api-client';
import { Button, Card, Empty, fill, palette, Txt, useCopy } from '../ui';
import { useFormat } from '../parts';
import { city, orderCode } from '../model';
import { statusText } from '../copy';
import type { OfflineSummary } from '../offline-summary';

SplashScreen.preventAutoHideAsync();
// Native builds embed the heading fonts (expo-font plugin in app.json); the web loads them while the intro plays.
if (Platform.OS === 'web') Font.loadAsync({
  'ReadexPro-Bold': require('../../assets/fonts/ReadexPro-Bold.ttf'),
  'ReadexPro-SemiBold': require('../../assets/fonts/ReadexPro-SemiBold.ttf'),
}).catch(() => { /* headings fall back to the system font */ });

export default function RootLayout() {
  return <SessionProvider>
    <StatusBar style="dark" />
    <DriverWorkRoutes />
    <IntroOverlay />
  </SessionProvider>;
}

function DriverWorkRoutes() {
  const { me } = useSession();
  const actor = me?.user.role === 'driver' && me.user.status === 'active' ? me.user.id : 'idle';
  return <DriverWorkProvider key={actor}><Routes /></DriverWorkProvider>;
}

// Covers the app from the native splash until the intro has played and the session is loaded,
// then fades away over whatever screen the session resolved to.
const FADE_MS = 280;
function IntroOverlay() {
  const { ready } = useSession();
  const reduced = useReducedMotion();
  const [played, setPlayed] = useState(false);
  const [gone, setGone] = useState(false);
  const hidden = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => setPlayed(true), reduced ? 0 : INTRO_MS);
    return () => clearTimeout(timer);
  }, [reduced]);
  const leaving = played && ready;
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);
  if (gone) return null;
  // A CSS fade rather than an exit animation, so the web build (no Reanimated, see motion.tsx) fades too.
  return <Animated.View pointerEvents={leaving ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, leaving && {
    animationName: { from: { opacity: 1 }, to: { opacity: 0 } }, animationDuration: `${FADE_MS}ms`, animationFillMode: 'forwards' }]}
    onLayout={() => { if (!hidden.current) { hidden.current = true; SplashScreen.hideAsync(); } }}>
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
  const { ready, offline, offlineSummary, me, onboarded, refresh } = useSession();
  const { c } = useCopy();
  const mustUpdate = useSyncExternalStore(subscribeClientUpdate, clientUpdateRequired);
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
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.paper } }}>
    <Stack.Protected guard={!me && !onboarded}>
      <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
    </Stack.Protected>
    <Stack.Protected guard={!me && onboarded}>
      <Stack.Screen name="auth" options={{ animation: 'fade' }} />
    </Stack.Protected>
    <Stack.Protected guard={role === 'customer'}>
      <Stack.Screen name="(customer)" />
      <Stack.Screen name="book" />
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
  </Stack>;
}
