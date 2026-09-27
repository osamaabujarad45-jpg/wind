import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DarbnaProvider } from '../state';
import { palette } from '../ui';

export default function Layout() {
  return <DarbnaProvider>
    <StatusBar style="dark" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.paper } }} />
  </DarbnaProvider>;
}
