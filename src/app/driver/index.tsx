// Driver jobs, Uber Driver pattern: an online strip, then offer cards that lead with what the driver
// earns, the route spine, what the job carries, and one accept button.
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api, useApi } from '../../api';
import { city, commissionOn, distanceKm, type Order } from '../../model';
import { useDriverWork } from '../../driver-work';
import { RouteLine, ServiceIcon, useFormat } from '../../parts';
import { useSession } from '../../session';
import { Button, Card, Empty, ErrorText, fill, haptic, IconButton, Header, Loading, palette, Press, Pulse, Row, Screen, Tip, Txt, useCopy } from '../../ui';

export default function Jobs() {
  const { me, refresh } = useSession();
  const { c, money, err, language, rtl } = useCopy();
  const { time } = useFormat();
  const active = me?.user.status === 'active';
  const { data, error, reload } = useApi<Order[]>(active ? '/jobs' : null, 8000);
  const work = useDriverWork();
  const { permission } = work;
  const [busy, setBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const rate = me?.plan === 'pro' ? me.settings.proCommission : me?.settings.commission ?? 0;
  const located = work.tracking === 'sharing';
  const locating = work.tracking === 'starting';
  const currentOrder = work.order;
  const assigned = !!currentOrder;

  async function accept(order: Order) {
    if (busy !== null || assigned || !work.known) return;
    setBusy(order.id);
    setActionError('');
    try {
      if (!await work.prepareTracking()) {
        haptic.error();
        setActionError(c.locationOff);
        return;
      }
      work.update(await api<Order>(`/jobs/${order.id}/accept`, {}));
      haptic.success();
      router.push(`/order/${order.id}`);
    } catch (e) {
      haptic.error();
      setActionError(err(e));
      reload();
    } finally { setBusy(null); }
  }

  async function enableTracking() {
    try {
      if (permission?.canAskAgain === false && !permission.granted) await Linking.openSettings();
      else if (!await work.prepareTracking()) setActionError(c.locationOff);
    } catch { setActionError(c.locationOff); }
  }

  if (!active) return <Screen onRefresh={refresh}>
    <Empty icon="shield-checkmark-outline" title={c.pendingTitle} body={c.pendingDesc} />
  </Screen>;

  return <Screen onRefresh={async () => { await Promise.all([reload(), work.reload()]); }}>
    <Header title={c.jobs} right={<IconButton icon="trail-sign-outline" label={c.roads} tone="muted" onPress={() => router.push('/roads')} />} />

    <Card tone="forest" style={{ paddingVertical: 12 }}>
      <Row gap={10}>
        <Pulse color={palette.lime} size={9} />
        <View style={{ flex: 1 }}>
          <Txt variant="title" style={{ color: '#FFFFFF' }}>{c.online}</Txt>
          <Txt variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>{c.onlineNote}</Txt>
        </View>
      </Row>
      {assigned && work.known && <Press accessibilityLabel={located ? c.sharingLocation : c.locationOff} onPress={() => { void enableTracking(); }}>
        <Row gap={8} style={[styles.location, { backgroundColor: located ? 'rgba(211,242,122,0.14)' : palette.clayPale }]}>
          <Ionicons name={located ? 'locate' : 'location-outline'} size={16} color={located ? palette.lime : palette.clayInk} />
          <Txt variant="caption" style={{ flex: 1, fontWeight: '700', color: located ? palette.lime : palette.clayInk }}>
            {located ? c.sharingLocation : locating ? c.locationStarting : c.locationOff}
          </Txt>
        </Row>
      </Press>}
    </Card>

    {currentOrder && <Button title={c.activeOrder} variant="soft" icon="navigate-outline" onPress={() => router.push(`/order/${currentOrder.id}`)} />}
    <Tip id="driver-earn" icon="trending-up-outline" title={c.tipDriverTitle} body={c.tipDriverBody} />
    <ErrorText>{actionError || ((error || work.error) && err(error || work.error))}</ErrorText>

    {!data ? <Loading /> : data.length === 0
      ? <Empty icon="hourglass-outline" title={c.noJobs} body={c.noJobsDesc} />
      : data.map(order => {
        const earn = order.price - commissionOn(order.price, rate);
        const km = distanceKm(city(order.pickupCity), city(order.dropoffCity));
        // Native layout animation can retain a removed assignment panel's offset.
        return <View key={order.id}>
          <Card>
            <Row gap={10} style={{ marginBottom: 12 }}>
              <ServiceIcon service={order.service} size={38} />
              <View style={{ flex: 1 }}>
                <Txt variant="title">{c[order.service]}</Txt>
                <Txt variant="caption">{order.shared ? c.shared : c.private} · {order.pickupCity === order.dropoffCity ? c.sameCity : `≈ ${km} ${c.km}`}</Txt>
              </View>
              <View style={{ alignItems: rtl ? 'flex-start' : 'flex-end' }}>
                <Txt variant="micro">{c.earnLabel}</Txt>
                <Txt variant="h2" style={{ color: palette.olive }}>{money(earn)}</Txt>
              </View>
            </Row>
            {order.discount > 0 && <Row gap={6} style={[styles.note, { marginTop: 0, marginBottom: 10 }]}>
              <Ionicons name="cash-outline" size={15} color={palette.olive} />
              <Txt variant="label" style={{ flex: 1 }}>{fill(c.collectCash, { p: money(order.price - order.discount) })}</Txt>
            </Row>}
            {order.scheduledFor && <Row gap={6} style={[styles.note, { marginTop: 0, marginBottom: 10 }]}>
              <Ionicons name="calendar-outline" size={14} color={palette.olive} />
              <Txt variant="label" style={{ flex: 1 }}>{fill(c.pickupAt, { t: time(order.scheduledFor) })}</Txt>
            </Row>}
            <RouteLine from={city(order.pickupCity)[language]} to={city(order.dropoffCity)[language]} fromNote={order.pickupNote} toNote={order.dropoffNote} />
            {!!order.detail && <Row gap={6} style={styles.note}>
              <Ionicons name="document-text-outline" size={14} color={palette.secondary} />
              <Txt variant="caption" numberOfLines={2} style={{ flex: 1 }}>{order.detail}</Txt>
            </Row>}
            <View style={{ marginTop: 12 }}>
              <Button title={c.accept} icon="checkmark-circle-outline" onPress={() => accept(order)} loading={busy === order.id} disabled={busy !== null || assigned || !work.known} />
            </View>
          </Card>
        </View>;
      })}
  </Screen>;
}

const styles = StyleSheet.create({
  location: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 10 },
  note: { alignItems: 'flex-start', marginTop: 10, backgroundColor: palette.muted, borderRadius: 10, padding: 8 },
});
