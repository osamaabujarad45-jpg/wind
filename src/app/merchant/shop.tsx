import { Redirect } from 'expo-router';
import { useApi } from '../../api';
import { MerchantHours, MerchantControls, MerchantStatement, merchantStatus, useMerchantStatement } from '../../merchant-settings';
import type { Merchant } from '../../model';
import { useSession } from '../../session';
import { Header, Loading, Screen, useCopy } from '../../ui';

export default function ShopSettings() {
  const { me } = useSession();
  const { c } = useCopy();
  const shop = me?.accountProfile?.mode === 'shop';
  const { data, error, reload } = useApi<{ merchant: Merchant | null }>(shop ? '/merchant' : null);
  const merchant = data?.merchant;
  const statement = useMerchantStatement(!!merchant && merchant.status !== 'pending');
  if (!shop) return <Redirect href="/merchant" />;
  if (!merchant) return <Screen><Header title={c.merchantMode} /><Loading failed={!!error} onRetry={reload} /></Screen>;

  return <Screen onRefresh={() => Promise.all([reload(), statement.reload()])}>
    <Header title={merchant.name} subtitle={merchantStatus(merchant, c)} />
    {merchant.status !== 'pending' && <MerchantControls merchant={merchant} reload={reload} />}
    <MerchantHours merchant={merchant} reload={reload} />
    {merchant.status !== 'pending' && <MerchantStatement {...statement} />}
  </Screen>;
}
