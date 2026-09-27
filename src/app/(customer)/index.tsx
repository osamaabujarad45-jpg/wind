import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApi } from '../../api';
import { activeStatuses, services, type Order } from '../../model';
import { OrderRow, PlanCard, ServiceIcon } from '../../parts';
import { useSession } from '../../session';
import { Appear, Card, fill, Logo, palette, Press, Row, Screen, Txt, useCopy } from '../../ui';

export default function Home() {
  const { me } = useSession();
  const { c, rtl } = useCopy();
  const { data, reload } = useApi<Order[]>('/orders', 10_000);
  const active = (data ?? []).filter(o => o.status === 'searching' || activeStatuses.includes(o.status));

  return <Screen onRefresh={reload}>
    <Row gap={12} style={{ marginBottom: 22 }}>
      <Logo />
      <View style={{ flex: 1 }}>
        <Txt variant="h2">{fill(c.hello, { name: me?.user.name.split(' ')[0] ?? '' })}</Txt>
        <Txt variant="caption">{c.tagline}</Txt>
      </View>
    </Row>

    {active.length > 0 && <>
      <Txt variant="h2" style={{ marginBottom: 12 }}>{c.activeOrder}</Txt>
      {active.map((order, i) => <OrderRow key={order.id} order={order} index={i} />)}
    </>}

    <Txt variant="h2" style={{ marginBottom: 12 }}>{c.servicesTitle}</Txt>
    {services.map((service, i) => <Appear key={service} index={i + 1}>
      <Press accessibilityLabel={c[service]} onPress={() => router.push({ pathname: '/book', params: { service } })}>
        <Card>
          <Row gap={14}>
            <ServiceIcon service={service} size={54} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="title">{c[service]}</Txt>
              <Txt variant="caption">{c[`${service}Desc`]}</Txt>
            </View>
            <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={20} color={palette.olive} />
          </Row>
        </Card>
      </Press>
    </Appear>)}

    {!me?.plan && <PlanCard />}
  </Screen>;
}
