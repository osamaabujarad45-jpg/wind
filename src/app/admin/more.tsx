import { router } from 'expo-router';
import { useApi } from '../../api';
import { Header, ListGroup, ListRow, Screen, useCopy } from '../../ui';

// Five persistent destinations stay readable; operational deep links remain direct and discoverable here.
export default function AdminMore() {
  const { c } = useCopy();
  const { data } = useApi<{ pendingSubscriptions: number }>('/admin/stats', 10_000);
  const pending = data?.pendingSubscriptions ?? 0;
  return <Screen>
    <Header title={c.more} />
    <ListGroup>
      <ListRow icon="sparkles-outline" label={c.subscriptions} value={pending ? `${pending} · ${c.pending}` : undefined}
        onPress={() => router.push('/admin/subscriptions')} />
    </ListGroup>
    <ListGroup>
      <ListRow icon="settings-outline" label={c.settings} onPress={() => router.push('/admin/settings')} />
      <ListRow icon="trail-sign-outline" label={c.roads} onPress={() => router.push('/roads')} />
      <ListRow icon="help-circle-outline" label={c.help} onPress={() => router.push('/help')} />
    </ListGroup>
  </Screen>;
}
