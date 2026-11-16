// Shop delivery: the shops a customer can order from (SRS DLV-01). A closed shop stays listed, says "Closed" in words and
// cannot be opened, so people learn its hours instead of meeting a broken tile (ONE-13 applies to the whole line, not one shop).
import { router } from 'expo-router';
import { useApi } from '../../api';
import { city, type Merchant } from '../../model';
import { useCart, cartGoods } from '../../shop-cart';
import { Badge, Button, Card, Empty, ErrorText, fill, Header, Loading, palette, Press, Row, Screen, tones, Txt, useCopy } from '../../ui';

export default function ShopList() {
  const { c, language, money } = useCopy();
  const { data, error, reload } = useApi<{ town: string | null; merchants: Merchant[] }>('/shop/merchants', 60_000);
  const cart = useCart();
  if (!data) return <Screen><Header title={c.shop} back /><Loading failed={!!error} onRetry={reload} /></Screen>;
  const footer = cart ? <Button title={fill(c.shopViewCart, { shop: cart.merchantName, total: money(cartGoods(cart) / 100) })} icon="basket-outline"
    onPress={() => router.push('/shop/cart')} /> : undefined;
  return <Screen onRefresh={reload} footer={footer}>
    <Header title={c.shop} back subtitle={data.town ? fill(c.shopPilotTown, { town: city(data.town as never)[language] }) : undefined} />
    {error && <ErrorText>{error}</ErrorText>}
    {!data.merchants.length && <Empty icon="storefront-outline" title={c.shopNone} body={c.shopNoneBody} />}
    {data.merchants.map(m => <Press key={m.id} disabled={!m.open} onPress={() => router.push(`/shop/${m.id}`)}
      accessibilityLabel={[m.name, c[`shopCat_${m.category}`], m.open ? c.shopOpen : c.shopClosed, fill(c.shopMinimum, { r: money(m.minOrderAgorot / 100) }),
        fill(c.shopDeliveryFee, { r: money(m.deliveryFeeAgorot / 100) })].join('، ')}>
      <Card style={!m.open && { opacity: 0.7 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="title" style={{ flex: 1 }}>{m.name}</Txt>
          <Badge label={m.open ? c.shopOpen : c.shopClosed} tone={m.open ? tones.olive : tones.clay} icon={m.open ? 'checkmark-circle-outline' : 'time-outline'} />
        </Row>
        <Txt variant="caption" style={{ marginTop: 4 }}>{`${c[`shopCat_${m.category}`]} · ${city(m.city)[language]}`}</Txt>
        <Txt variant="caption" style={{ marginTop: 4, color: palette.ink }}>
          {[fill(c.shopMinimum, { r: money(m.minOrderAgorot / 100) }), fill(c.shopDeliveryFee, { r: money(m.deliveryFeeAgorot / 100) }),
            fill(c.shopPrepTime, { n: m.prepMinutes })].join(' · ')}</Txt>
      </Card>
    </Press>)}
  </Screen>;
}
