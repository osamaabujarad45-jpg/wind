import { Tabs } from 'expo-router/js-tabs';
import { useProfileUpdates } from '../../profile-switch';
import { TabBar, tabIcon, useCopy } from '../../ui';

export default function CustomerTabs() {
  const { c } = useCopy();
  const updates = useProfileUpdates();
  return <Tabs tabBar={props => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
    <Tabs.Screen name="index" options={{ title: c.home, tabBarIcon: tabIcon('home-outline') }} />
    <Tabs.Screen name="orders" options={{ title: c.orders, tabBarIcon: tabIcon('receipt-outline') }} />
    <Tabs.Screen name="account" options={{ title: c.account, tabBarIcon: tabIcon('person-outline'), tabBarBadge: updates || undefined }} />
  </Tabs>;
}
