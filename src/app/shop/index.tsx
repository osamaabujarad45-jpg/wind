// Shop delivery: the shops a customer can order from (SRS DLV-01). A closed shop stays listed, says "Closed" in words with
// today's hours, and can still be opened to browse; placing an order is refused until it opens (ONE-13 applies to the whole line).
import { router } from 'expo-router';
import { useApi } from '../../api';
import { city, type Merchant } from '../../model';
import { useCart, cartGoods } from '../../shop-cart';
import { todayHours } from '../../shop-ui';
import { Badge, Button, Card, Empty, ErrorText, fill, Header, Loading, Press, Row, Screen, Txt, useCopy } from '../../ui';
import { useTheme } from '../../theme-context';

export default function ShopList() {
  const { palette, tones } = useTheme();
  const { c, language, money } = useCopy();
  const { data, error, reload } = useApi<{ town: string | null; merchants: Merchant[] }>('/shop/merchants', 60_000);
  const cart = useCart();
  if (!data) return <Screen><Header title={c.shop} back /><Loading failed={!!error} onRetry={reload} /></Screen>;
  const today = (m: Merchant) => todayHours(m, c);
  const footer = cart ? <Button title={fill(c.shopViewCart, { shop: cart.merchantName, total: money(cartGoods(cart) / 100) })} icon="basket-outline"
    onPress={() => router.push('/shop/cart')} /> : undefined;
  return <Screen onRefresh={reload} footer={footer}>
    <Header title={c.shop} back subtitle={data.town ? fill(c.shopPilotTown, { town: city(data.town as never)[language] }) : undefined} />
    {error && <ErrorText>{error}</ErrorText>}
    {!data.merchants.length && <Empty icon="storefront-outline" title={c.shopNone} body={c.shopNoneBody} />}
    {data.merchants.map(m => <Press key={m.id} onPress={() => router.push(`/shop/${m.id}`)}
      accessibilityLabel={[m.name, c[`shopCat_${m.category}`], m.open ? c.shopOpen : c.shopClosed, today(m), fill(c.shopMinimum, { r: money(m.minOrderAgorot / 100) }),
        fill(c.shopDeliveryFee, { r: money(m.deliveryFeeAgorot / 100) })].filter(Boolean).join('، ')}>
      <Card>{/* full opacity: a 0.7 wash dropped the closed shop's text to about 3:1; the Closed badge and hours already say it */}
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="title" style={{ flex: 1 }}>{m.name}</Txt>
          <Badge label={m.open ? c.shopOpen : c.shopClosed} tone={m.open ? tones.olive : tones.warn} icon={m.open ? 'checkmark-circle-outline' : 'time-outline'} />
        </Row>
        <Txt variant="caption" style={{ marginTop: 4 }}>{`${c[`shopCat_${m.category}`]} · ${city(m.city)[language]}`}</Txt>
        <Txt variant="caption" style={{ marginTop: 4, color: palette.ink }}>
          {[fill(c.shopMinimum, { r: money(m.minOrderAgorot / 100) }), fill(c.shopDeliveryFee, { r: money(m.deliveryFeeAgorot / 100) }),
            fill(c.shopPrepTime, { n: m.prepMinutes })].join(' · ')}</Txt>
        {today(m) && <Txt variant="caption" style={{ marginTop: 2 }}>{today(m)}</Txt>}
      </Card>
    </Press>)}
  </Screen>;
}
