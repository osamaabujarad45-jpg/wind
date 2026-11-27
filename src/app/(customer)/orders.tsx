import { useState } from 'react';
import { router } from 'expo-router';
import { isOpen, type Service } from '../../model';
import { bookingService, personalServices, type PersonalService } from '../../personal-services';
import { MoreOrders, OrderRow, useOrders } from '../../parts';
import { useSession } from '../../session';
import { Button, Choices, Empty, ErrorText, FilterChips, Header, Loading, Screen, useCopy } from '../../ui';

const orderLine = (service: Service): PersonalService => service === 'parcel' || service === 'freight' ? 'send' : service;

export default function Orders() {
  const { c, err } = useCopy();
  const { me } = useSession();
  const { data, error, reload, more } = useOrders('/orders', 10_000);
  const [period, setPeriod] = useState<'current' | 'past'>('current');
  const [selectedService, setService] = useState<PersonalService | 'all'>('all');
  const labels = { ride: c.personalRide, send: c.personalSend, shop: c.personalShop };
  const periodOrders = data?.filter(order => isOpen(order) === (period === 'current'));
  const enabled = me?.capabilities?.enabledServices ?? ['parcel'];
  const existingLines = new Set(periodOrders?.map(order => orderLine(order.service)));
  const lines = personalServices.filter(line => bookingService(line, enabled) || existingLines.has(line));
  const service = selectedService !== 'all' && lines.includes(selectedService) ? selectedService : 'all';
  const visible = service === 'all' ? periodOrders : periodOrders?.filter(order => orderLine(order.service) === service);
  return <Screen onRefresh={reload}>
    <Header title={c.orders} />
    <Choices tabs label={c.orders} items={[{ key: 'current', label: c.personalCurrent }, { key: 'past', label: c.personalPast }]}
      value={period} onChange={setPeriod} />
    {lines.length > 0 && <FilterChips label={c.personalServices} items={[{ key: 'all', label: c.all }, ...lines.map(key => ({ key, label: labels[key] }))]}
      value={service} onChange={setService} />}
    <ErrorText>{error && err(error)}</ErrorText>
    {!visible ? <Loading failed={!!error} onRetry={reload} /> : <>
      {visible.length > 0 ? visible.map((order, i) => <OrderRow key={order.id} order={order} index={i} />)
        : <Empty icon="receipt-outline" title={service !== 'all' ? c.noOrdersFilter : period === 'current' ? c.personalNoCurrent : c.personalNoPast}
          action={period === 'current' && service === 'all' ? <Button title={c.home} onPress={() => router.navigate('/')} /> : undefined} />}
      {period === 'past' && <MoreOrders more={more} />}
    </>}
  </Screen>;
}
