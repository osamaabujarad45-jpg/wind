import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { FastShipProvider } from '../state';
import { palette } from '../ui';

export default function Layout() {
  return <FastShipProvider>
    <StatusBar style="dark" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.paper } }} />
  </FastShipProvider>;
}
