// Wind Control on a phone: five tabs (Wind design system, TabBar). The rest live here; a desktop shows them in its side rail.
import { router } from 'expo-router';
import { useSession } from '../../session';
import { Header, ListGroup, ListRow, Screen, useCopy } from '../../ui';

export default function AdminMore() {
  const { c } = useCopy();
  const { me } = useSession();
  const shop = !!me?.capabilities?.enabledServices?.includes('shop');
  return <Screen>
    <Header title={c.moreTab} />
    <ListGroup>
      <ListRow icon="people-outline" label={c.usersTab} onPress={() => router.navigate('/admin/users')} />
      <ListRow icon="cash-outline" label={c.cashTab} onPress={() => router.navigate('/admin/cash')} />
      {shop && <ListRow icon="storefront-outline" label={c.adminShops} onPress={() => router.navigate('/admin/merchants')} />}
      <ListRow icon="sparkles-outline" label={c.subscriptions} onPress={() => router.navigate('/admin/subscriptions')} />
      <ListRow icon="settings-outline" label={c.settings} onPress={() => router.navigate('/admin/settings')} />
    </ListGroup>
  </Screen>;
}
