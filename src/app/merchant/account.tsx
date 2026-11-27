import { Redirect } from 'expo-router';
import { AccountScreen } from '../../parts';
import { useSession } from '../../session';

export default function ShopAccount() {
  const { me } = useSession();
  return me?.accountProfile?.mode === 'shop' ? <AccountScreen /> : <Redirect href="/merchant" />;
}
