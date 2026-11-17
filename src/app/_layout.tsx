import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { useReducedMotion } from '../motion';
import { Intro, INTRO_MS } from '../intro';
import { DriverWorkProvider } from '../driver-work';
import { SessionProvider, useSession } from '../session';
import { Button, Card, Empty, fill, palette, Screen, Txt, useCopy } from '../ui';
import { city, orderCode } from '../model';
import { statusText, useFormat } from '../parts';

SplashScreen.preventAutoHideAsync();

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

function Routes() {
  const { ready, offline, offlineSummary, me, onboarded, refresh } = useSession();
  const { c, language, rtl } = useCopy();
  const { time } = useFormat();
  if (!ready) return null;
  const summary = !me || (offlineSummary && me.user.status === 'active' && me.user.id === offlineSummary.actorId && me.user.role === offlineSummary.role)
    ? offlineSummary : null;
  if (offline) return <Screen>
    <Empty icon="cloud-offline-outline" title={c.offline} body={c.offlineDesc} action={<Button title={c.retry} onPress={refresh} />} />
    {!!summary?.orders.length && <Card>
      <Txt variant="h2" header>{c.offlineSavedTitle}</Txt>
      <Txt>{c.offlineSavedWarning}</Txt>
      <Txt variant="caption">{fill(c.offlineSavedAt, { time: time(summary.savedAt) })}</Txt>
      {summary.orders.map(order => <View key={order.id} style={{ marginTop: 12 }}>
        <Txt variant="title">{`${orderCode(order.id)}, ${c[order.service]}`}</Txt>
        <Txt>{city(order.pickupCity)[language]} {rtl ? '←' : '→'} {city(order.dropoffCity)[language]}</Txt>
        <Txt variant="caption">{statusText(c, order, summary.role === 'driver')}</Txt>
      </View>)}
    </Card>}
  </Screen>;
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
