import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SessionProvider, useSession } from '../session';
import { Button, Empty, palette, useCopy } from '../ui';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return <SessionProvider>
    <StatusBar style="dark" />
    <Routes />
  </SessionProvider>;
}

function Routes() {
  const { ready, offline, me, refresh } = useSession();
  const { c } = useCopy();
  useEffect(() => { if (ready) SplashScreen.hideAsync(); }, [ready]);
  if (!ready) return null;
  if (offline) return <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: palette.paper }}>
    <Empty icon="cloud-offline-outline" title={c.offline} body={c.offlineDesc} action={<Button title={c.retry} onPress={refresh} />} />
  </View>;
  const role = me?.user.role;
  // Each role only has its own screens; landing on another role's route redirects to the first allowed one.
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.paper } }}>
    <Stack.Protected guard={!me}>
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
    </Stack.Protected>
  </Stack>;
}
