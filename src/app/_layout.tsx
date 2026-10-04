import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { FadeOut, useReducedMotion } from 'react-native-reanimated';
import { Intro, INTRO_MS } from '../intro';
import { DriverWorkProvider } from '../driver-work';
import { SessionProvider, useSession } from '../session';
import { Button, Empty, palette, useCopy } from '../ui';

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
function IntroOverlay() {
  const { ready } = useSession();
  const reduced = useReducedMotion();
  const [played, setPlayed] = useState(false);
  const hidden = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => setPlayed(true), reduced ? 0 : INTRO_MS);
    return () => clearTimeout(timer);
  }, [reduced]);
  if (played && ready) return null;
  return <Animated.View exiting={FadeOut.duration(280)} style={StyleSheet.absoluteFill}
    onLayout={() => { if (!hidden.current) { hidden.current = true; SplashScreen.hideAsync(); } }}>
    <Intro />
  </Animated.View>;
}

function Routes() {
  const { ready, offline, me, onboarded, refresh } = useSession();
  const { c } = useCopy();
  if (!ready) return null;
  if (offline) return <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: palette.paper }}>
    <Empty icon="cloud-offline-outline" title={c.offline} body={c.offlineDesc} action={<Button title={c.retry} onPress={refresh} />} />
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
