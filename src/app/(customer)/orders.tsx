import { router } from 'expo-router';
import { View } from 'react-native';
import { MoreOrders, OrderRow, useOrders } from '../../parts';
import { useSession } from '../../session';
import { Button, Empty, ErrorText, Header, Loading, Screen, Txt, useCopy } from '../../ui';

export default function Orders() {
  const { c, err } = useCopy();
  const { me } = useSession();
  const { data, error, reload, more } = useOrders('/orders', 10_000);
  // No orders yet: a way into the first one and what to expect, instead of a lone "Home" (product audit, 21 Nov).
  const service = me?.capabilities?.enabledServices?.includes('ride') ? 'ride' : 'parcel';
  return <Screen onRefresh={reload}>
    <Header title={c.orders} />
    <ErrorText>{error && err(error)}</ErrorText>
    {!data ? <Loading failed={!!error} onRetry={reload} /> : data.length === 0
      ? <Empty icon="receipt-outline" title={c.noOrders} body={c.noOrdersDesc} action={<View style={{ gap: 10, alignSelf: 'stretch' }}>
        {[c.guideStepPlace, c.guideStepPrice, c.guideStepCash].map((step, i) => <Txt key={i} variant="caption">{`${i + 1}. ${step}`}</Txt>)}
        <Button title={c.guideStart} onPress={() => router.push({ pathname: '/book', params: { service } })} />
      </View>} />
      : <>{data.map((order, i) => <OrderRow key={order.id} order={order} index={i} />)}<MoreOrders more={more} /></>}
  </Screen>;
}
