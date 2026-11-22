// One shop's catalogue (DLV-01). Weighed items say "estimate" and step by 250 g; counted ones by one. Adding from a second
// shop asks before the cart is cleared (DLV-02).
import { router, useLocalSearchParams } from 'expo-router';
import { useApi } from '../../api';
import type { Merchant, MerchantItem } from '../../model';
import { cartGoods, clearCart, otherShop, qtyOf, setQuantity, useCart } from '../../shop-cart';
import { QtyControl, todayHours } from '../../shop-ui';
import { View } from 'react-native';
import { Button, Card, confirm, Empty, fill, Header, IconButton, Loading, Row, Screen, Section, Txt, useCopy } from '../../ui';
import { useTheme } from '../../theme-context';

export default function ShopStore() {
  const { palette } = useTheme();
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
    {!m.open && <Card tone="warn"><Txt>{c.shopClosedBody}</Txt>{!!todayHours(m, c) && <Txt style={{ marginTop: 4, fontWeight: '700' }}>{todayHours(m, c)}</Txt>}</Card>}
    {!data.items.length && <Empty icon="basket-outline" title={c.shopNoItems} />}
    {sections.map(section => <Card key={section}>
      <Section title={section} />
      {data.items.filter(i => i.section === section).map(item => {
        const qty = qtyOf(mine, item.id);
        const name = language === 'ar' ? item.nameAr : item.nameEn;
        // Grocery-row pattern (design review 17 Nov): the name in ink, the price as the bold figure, a round "+" instead of a pill
        // that was the loudest thing on the screen. A weighed price says it is an estimate until the shop weighs it.
        return <Row key={item.id} style={{ justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: palette.line }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt style={{ color: palette.ink, fontWeight: '600' }}>{name}</Txt>
            <Txt style={{ color: palette.ink, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {item.byWeight ? `${fill(c.shopPerKg, { r: money(item.priceAgorot / 100) })} ${c.shopEstimateShort}` : money(item.priceAgorot / 100)}
            </Txt>
          </View>
          {/* A first tap adds 1 kg or one piece, the usual buy; the stepper then moves by 250 g or one. */}
          {qty === 0
            ? <IconButton icon="add" tone="forest" disabled={!m.open} label={fill(c.shopAddItem, { item: name })} onPress={() => change(item, 1000)} />
            : <QtyControl item={item} qtyMilli={qty} name={name} onChange={q => change(item, q)} />}
        </Row>;
      })}
    </Card>)}
  </Screen>;
}
