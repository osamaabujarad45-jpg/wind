// One shop's catalogue (DLV-01). Weighed items say "estimate" and step by 250 g; counted ones by one. Adding from a second
// shop asks before the cart is cleared (DLV-02).
import { router, useLocalSearchParams } from 'expo-router';
import { useApi } from '../../api';
import type { Merchant, MerchantItem } from '../../model';
import { cartGoods, clearCart, otherShop, qtyOf, setQuantity, useCart } from '../../shop-cart';
import { QtyControl, todayHours } from '../../shop-ui';
import { Button, Card, confirm, Empty, fill, Header, Loading, palette, Row, Screen, Section, Txt, useCopy } from '../../ui';

export default function ShopStore() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, language, money } = useCopy();
  const { data, error, reload } = useApi<{ merchant: Merchant; items: MerchantItem[] }>(`/shop/merchants/${Number(id)}`, 60_000);
  const cart = useCart();
  if (!data) return <Screen><Header title={c.shop} back /><Loading failed={!!error} onRetry={reload} /></Screen>;
  const m = data.merchant;
  const shopInfo = { merchantId: m.id, merchantName: m.name, city: m.city, minOrderAgorot: m.minOrderAgorot, deliveryFeeAgorot: m.deliveryFeeAgorot, serviceFeeAgorot: m.serviceFeeAgorot };
  const change = (item: MerchantItem, qty: number) => {
    if (otherShop(m.id)) confirm(fill(c.shopClearCart, { shop: cart!.merchantName }), () => { clearCart(); setQuantity(shopInfo, item, qty); }, c.shopClearYes, c.cancel);
    else setQuantity(shopInfo, item, qty);
  };
  const sections = [...new Set(data.items.map(i => i.section))];
  const mine = cart?.merchantId === m.id ? cart : null;
  const goods = cartGoods(mine);
  const footer = mine ? <Button title={fill(c.shopViewCart, { shop: m.name, total: money(goods / 100) })} icon="basket-outline" onPress={() => router.push('/shop/cart')} /> : undefined;
  return <Screen onRefresh={reload} footer={footer}>
    <Header title={m.name} back subtitle={[m.open ? c.shopOpen : c.shopClosed, fill(c.shopMinimum, { r: money(m.minOrderAgorot / 100) }),
      fill(c.shopDeliveryFee, { r: money(m.deliveryFeeAgorot / 100) })].join(' · ')} />
    {!m.open && <Card tone="clay"><Txt>{c.shopClosedBody}</Txt>{!!todayHours(m, c) && <Txt style={{ marginTop: 4, fontWeight: '700' }}>{todayHours(m, c)}</Txt>}</Card>}
    {!data.items.length && <Empty icon="basket-outline" title={c.shopNoItems} />}
    {sections.map(section => <Card key={section}>
      <Section title={section} />
      {data.items.filter(i => i.section === section).map(item => {
        const qty = qtyOf(mine, item.id);
        const name = language === 'ar' ? item.nameAr : item.nameEn;
        return <Row key={item.id} style={{ justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: palette.line }}>
          <Txt style={{ flex: 1 }}>
            {name}{'\n'}
            <Txt variant="caption">{item.byWeight ? fill(c.shopPerKg, { r: money(item.priceAgorot / 100) }) : money(item.priceAgorot / 100)}</Txt>
          </Txt>
          {qty === 0
            ? <Button title={c.shopAdd} size="sm" variant="soft" icon="add" disabled={!m.open} label={fill(c.shopAddItem, { item: name })}
              onPress={() => change(item, item.byWeight ? 1000 : 1000)} />
            : <QtyControl item={item} qtyMilli={qty} name={name} onChange={q => change(item, q)} />}
        </Row>;
      })}
    </Card>)}
  </Screen>;
}
