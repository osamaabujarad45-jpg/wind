import { Tabs } from 'expo-router/js-tabs';
import { useApi } from '../../api';
import { TabBar, tabIcon, useCopy } from '../../ui';

export default function AdminTabs() {
  const { c } = useCopy();
  const { data } = useApi<{ pendingDrivers: number; pendingSubscriptions: number }>('/admin/stats', 10_000);
  return <Tabs tabBar={props => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
    <Tabs.Screen name="index" options={{ title: c.dashboard, tabBarIcon: tabIcon('stats-chart-outline') }} />
    <Tabs.Screen name="orders" options={{ title: c.allOrders, tabBarIcon: tabIcon('receipt-outline') }} />
    <Tabs.Screen name="users" options={{ title: c.users, tabBarIcon: tabIcon('people-outline'), tabBarBadge: data?.pendingDrivers || undefined }} />
    <Tabs.Screen name="cash" options={{ title: c.cashTab, tabBarIcon: tabIcon('cash-outline') }} />
    <Tabs.Screen name="subscriptions" options={{ title: c.subscriptions, tabBarIcon: tabIcon('sparkles-outline'), tabBarBadge: data?.pendingSubscriptions || undefined }} />
    <Tabs.Screen name="settings" options={{ title: c.settings, tabBarIcon: tabIcon('settings-outline') }} />
  </Tabs>;
}
