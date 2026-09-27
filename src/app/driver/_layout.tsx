import { useEffect } from 'react';
import * as Location from 'expo-location';
import { Tabs } from 'expo-router/js-tabs';
import { api } from '../../api';
import { useSession } from '../../session';
import { TabBar, tabIcon, useCopy } from '../../ui';

export default function DriverTabs() {
  const { me } = useSession();
  const { c } = useCopy();
  useShareLocation(me?.user.status === 'active');
  return <Tabs tabBar={props => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
    <Tabs.Screen name="index" options={{ title: c.jobs, tabBarIcon: tabIcon('flash-outline') }} />
    <Tabs.Screen name="trips" options={{ title: c.trips, tabBarIcon: tabIcon('navigate-outline') }} />
    <Tabs.Screen name="earnings" options={{ title: c.earnings, tabBarIcon: tabIcon('wallet-outline') }} />
    <Tabs.Screen name="account" options={{ title: c.account, tabBarIcon: tabIcon('person-outline') }} />
  </Tabs>;
}

// ponytail: foreground-only tracking (app open). Background tracking needs expo-task-manager plus
// "always" location permission and store review justification; add it when drivers run navigation apps on top.
function useShareLocation(enabled: boolean) {
  const [permission] = Location.useForegroundPermissions();
  const granted = !!permission?.granted;
  useEffect(() => {
    if (!enabled || !granted) return;
    let subscription: Location.LocationSubscription | undefined;
    let stopped = false;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 30 },
      ({ coords }) => { api('/location', { latitude: coords.latitude, longitude: coords.longitude }).catch(() => {}); })
      .then(sub => { if (stopped) sub.remove(); else subscription = sub; })
      .catch(() => {});
    return () => { stopped = true; subscription?.remove(); };
  }, [enabled, granted]);
}
