import { Stack } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useSession } from '../../session';
import { TabBar, tabIcon, useCopy } from '../../ui';

export default function MerchantLayout() {
  const { me } = useSession();
  const { c } = useCopy();
  if (me?.accountProfile?.mode !== 'shop') return <Stack screenOptions={{ headerShown: false }} />;

  return <Tabs backBehavior="history" tabBar={props => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
    <Tabs.Screen name="index" options={{ title: c.orders, tabBarIcon: tabIcon('receipt-outline') }} />
    <Tabs.Screen name="catalogue" options={{ title: c.shopItems, tabBarIcon: tabIcon('pricetags-outline') }} />
    <Tabs.Screen name="shop" options={{ title: c.merchantMode, tabBarIcon: tabIcon('storefront-outline') }} />
    <Tabs.Screen name="account" options={{ title: c.account, tabBarIcon: tabIcon('person-outline') }} />
    <Tabs.Screen name="order/[id]" options={{ href: null }} />
  </Tabs>;
}
