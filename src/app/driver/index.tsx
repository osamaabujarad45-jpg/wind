import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { api, useApi } from '../../api';
import { commissionOn, type Order } from '../../model';
import { OrderRow } from '../../parts';
import { useSession } from '../../session';
import { Button, Empty, ErrorText, haptic, Header, Loading, palette, Press, Pulse, Row, Screen, Txt, useCopy } from '../../ui';

export default function Jobs() {
  const { me, refresh } = useSession();
  const { c, money, err } = useCopy();
  const active = me?.user.status === 'active';
  const { data, error, reload } = useApi<Order[]>(active ? '/jobs' : null, 8000);
  const [permission, requestPermission] = Location.useForegroundPermissions();
  const [busy, setBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const rate = me?.plan === 'pro' ? me.settings.proCommission : me?.settings.commission ?? 0;
  const located = !!permission?.granted;

  async function accept(order: Order) {
    setBusy(order.id);
    setActionError('');
    try {
      await api(`/jobs/${order.id}/accept`, {});
      haptic.success();
      router.push(`/order/${order.id}`);
    } catch (e) {
      haptic.error();
      setActionError(err(e));
      reload();
    }
    setBusy(null);
  }

  if (!active) return <Screen onRefresh={refresh}>
    <Empty icon="shield-checkmark-outline" title={c.pendingTitle} body={c.pendingDesc} />
  </Screen>;

  return <Screen onRefresh={reload}>
    <Header title={c.jobs} right={<Pulse color={palette.olive} size={10} />} />
    <Press accessibilityLabel={located ? c.sharingLocation : c.locationOff} onPress={located ? undefined : requestPermission}>
      <Row gap={8} style={{ backgroundColor: located ? palette.olivePale : palette.clayPale, borderRadius: 14, padding: 12, marginBottom: 14 }}>
        <Ionicons name={located ? 'locate' : 'location-outline'} size={18} color={located ? palette.olive : palette.clay} />
        <Txt variant="caption" style={{ flex: 1, fontWeight: '700', color: located ? palette.olive : palette.clay }}>
          {located ? c.sharingLocation : c.locationOff}
        </Txt>
      </Row>
    </Press>
    <ErrorText>{actionError || (error && err(error))}</ErrorText>
    {!data ? <Loading /> : data.length === 0
      ? <Empty icon="hourglass-outline" title={c.noJobs} body={c.noJobsDesc} />
      : data.map((order, i) => {
        const earn = order.price - commissionOn(order.price, rate);
        return <OrderRow key={order.id} order={order} index={i} amount={earn}
          footer={<View style={{ gap: 6 }}>
            {!!order.detail && <Txt variant="caption" numberOfLines={2}>{order.detail}</Txt>}
            <Button title={`${c.accept} · ${c.youEarn} ${money(earn)}`} onPress={() => accept(order)} loading={busy === order.id} />
          </View>} />;
      })}
  </Screen>;
}
