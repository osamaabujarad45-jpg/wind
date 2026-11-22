import { useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { useApi } from '../../api';
import { useSession } from '../../session';
import { SideRail, TabBar, tabIcon, useCopy, WideContext } from '../../ui';

export default function AdminTabs() {
  const { c, rtl } = useCopy();
  // Design system v2: Wind Control on a desktop or tablet gets the side rail on the reading-start side; phones keep bottom tabs.
  const wide = useWindowDimensions().width >= 1024;
  const { me } = useSession();
  const shop = !!me?.capabilities?.enabledServices?.includes('shop');
  const { data } = useApi<{ pendingDrivers: number; pendingSubscriptions: number; openSupport?: number | null }>('/admin/stats', 10_000);
  return <WideContext.Provider value={wide}><Tabs tabBar={props => wide ? <SideRail {...props} title={`${c.brand} · ${c.admin}`} /> : <TabBar {...props} />}
    screenOptions={{ headerShown: false, tabBarPosition: wide ? (rtl ? 'right' : 'left') : 'bottom' }}>
    <Tabs.Screen name="index" options={{ title: c.dashboardTab, tabBarIcon: tabIcon('stats-chart-outline') }} />
    <Tabs.Screen name="orders" options={{ title: c.allOrders, tabBarIcon: tabIcon('receipt-outline') }} />
    <Tabs.Screen name="users" options={{ title: c.usersTab, tabBarIcon: tabIcon('people-outline'), tabBarBadge: data?.pendingDrivers || undefined }} />
    {/* openSupport is null for staff without the support scope: the tab appears only once the stats say they have it */}
    <Tabs.Screen name="support" options={{ title: c.supportInbox, tabBarIcon: tabIcon('chatbubbles-outline'), tabBarBadge: data?.openSupport || undefined,
      href: data && data.openSupport != null ? undefined : null }} />
    <Tabs.Screen name="cash" options={{ title: c.cashTab, tabBarIcon: tabIcon('cash-outline') }} />
    <Tabs.Screen name="merchants" options={{ title: c.adminShops, tabBarIcon: tabIcon('storefront-outline'), href: shop ? undefined : null }} />
    <Tabs.Screen name="subscriptions" options={{ title: c.subscriptions, tabBarIcon: tabIcon('sparkles-outline'), tabBarBadge: data?.pendingSubscriptions || undefined }} />
    <Tabs.Screen name="settings" options={{ title: c.settings, tabBarIcon: tabIcon('settings-outline') }} />
  </Tabs></WideContext.Provider>;
}
