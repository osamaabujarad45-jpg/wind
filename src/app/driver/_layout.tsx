import { Tabs } from 'expo-router/js-tabs';
import { useProfileUpdates } from '../../profile-switch';
import { TabBar, tabIcon, useCopy } from '../../ui';

export default function DriverTabs() {
  const { c } = useCopy();
  const updates = useProfileUpdates();
  return <Tabs tabBar={props => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
    <Tabs.Screen name="index" options={{ title: c.jobs, tabBarIcon: tabIcon('flash-outline') }} />
    <Tabs.Screen name="trips" options={{ title: c.trips, tabBarIcon: tabIcon('navigate-outline') }} />
    <Tabs.Screen name="earnings" options={{ title: c.earnings, tabBarIcon: tabIcon('wallet-outline') }} />
    <Tabs.Screen name="account" options={{ title: c.account, tabBarIcon: tabIcon('person-outline'), tabBarBadge: updates || undefined }} />
  </Tabs>;
}
