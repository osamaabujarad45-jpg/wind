// Driver jobs, Uber Driver pattern: an online strip, then offer cards that lead with what the driver
// earns, the route spine, what the job carries, and one accept button.
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api, SUPPORT_URL, useApi } from '../../api';
import { canTake, cities, city, commissionOn, distanceKm, ltr, offerRange, type CityId, type Order } from '../../model';
import { useDriverWork } from '../../driver-work';
import { RouteLine, ServiceIcon, useFormat } from '../../parts';
import { useSession } from '../../session';
import { Button, Card, Empty, ErrorText, Field, FilterChips, fill, haptic, IconButton, Header, Loading, palette, Press, Pulse, Row, Screen, Txt, useCopy } from '../../ui';

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
  const [offering, setOffering] = useState<{ id: number; text: string } | null>(null); // the open "offer your price" form
  const rate = me?.plan === 'pro' ? me.settings.proCommission : me?.settings.commission ?? 0;
  const located = work.tracking === 'sharing';
  const locating = work.tracking === 'starting';
  const carrying = work.orders;
  const assigned = carrying.length > 0;
  // Parcels stack up; a ride or freight load is exclusive (SPEC-parcel-standard.md).
  const blocked = (order: Order) => !canTake(carrying, order.service);

  async function accept(order: Order) {
    if (busy !== null || blocked(order) || !work.known) return;
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

  // Driver offers (SPEC-driver-offers.md): any whole price in the band around the recommendation; the customer chooses.
  async function offer(order: Order, price: number) {
    if (busy !== null || blocked(order) || !work.known) return;
    setBusy(order.id);
    setActionError('');
    try {
      // An accepted offer is an assignment: location sharing must be ready, exactly as for Accept.
      if (!await work.prepareTracking()) {
        haptic.error();
        setActionError(c.locationOff);
        return;
      }
      await api<Order>(`/jobs/${order.id}/offer`, { price });
      haptic.success();
      setOffering(null);
      reload();
    } catch (e) { haptic.error(); setActionError(err(e)); reload(); } finally { setBusy(null); }
  }

  // Destination filter (SPEC-driver-destination.md): only jobs dropping off in that city, for 3 hours.
  async function head(target: CityId | 'any') {
    setActionError('');
    try { await api('/driver/heading', { city: target === 'any' ? null : target }); await refresh(); reload(); }
    catch (e) { haptic.error(); setActionError(err(e)); }
  }

  async function enableTracking() {
    try {
      if (permission?.canAskAgain === false && !permission.granted) await Linking.openSettings();
      else if (!await work.prepareTracking()) setActionError(c.locationOff);
    } catch { setActionError(c.locationOff); }
  }

  if (!active) return <Screen onRefresh={refresh}>
    {/* Without a configured support line there is nothing to contact: promise the call-back admins are now alerted for (SPEC-pending-driver-help.md). */}
    <Empty icon="shield-checkmark-outline" title={c.pendingTitle} body={SUPPORT_URL ? c.pendingDesc : fill(c.pendingCallBack, { phone: ltr(me?.user.phone ?? '') })}
      action={SUPPORT_URL ? <Button title={c.whatsappSupport} icon="logo-whatsapp" variant="soft" onPress={() => { void Linking.openURL(SUPPORT_URL!); }} /> : undefined} />
  </Screen>;

  return <Screen onRefresh={async () => { await Promise.all([reload(), work.reload()]); }}>
    <Header title={c.jobs} right={<IconButton icon="trail-sign-outline" label={c.roads} tone="muted" onPress={() => router.push('/roads')} />} />

    <Card tone="forest" style={{ paddingVertical: 12 }}>
      <Row gap={10}>
        <Pulse color={palette.lime} size={9} />
        <View style={{ flex: 1 }}>
          <Txt variant="title" style={{ color: palette.onFill }}>{c.online}</Txt>
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

    <Txt variant="label" style={{ marginTop: 4 }}>{c.headingTo}</Txt>
    <FilterChips items={[{ key: 'any' as const, label: c.headingAny }, ...cities.map(x => ({ key: x.id, label: x[language] }))]}
      value={me?.user.heading?.city ?? 'any'} onChange={key => { void head(key); }} />
    {me?.user.heading && <Txt variant="caption" style={{ marginTop: -6, marginBottom: 6 }}>{fill(c.headingUntil, { city: city(me.user.heading.city)[language], t: time(me.user.heading.until) })}</Txt>}

    {/* gap keeps the shortcut from reading as the first offer's header */}
    {carrying.length === 1 && <View style={{ marginBottom: 14 }}><Button title={c.activeOrder} variant="soft" icon="navigate-outline" onPress={() => router.push(`/order/${carrying[0]!.id}`)} /></View>}
    {carrying.length > 1 && <View style={{ marginBottom: 14 }}><Button title={fill(c.carryingParcels, { n: carrying.length })} variant="soft" icon="cube-outline" onPress={() => router.push('/driver/trips')} /></View>}
    <ErrorText>{actionError || ((error || work.error) && err(error || work.error))}</ErrorText>

    {!data ? <Loading /> : data.length === 0
      ? <Empty icon="hourglass-outline" title={c.noJobs} body={c.noJobsDesc} />
      : data.map(order => {
        const earn = order.price - commissionOn(order.price, rate);
        // The road km the price used; fixed-price orders (Souq, old apps) only have the city-centre estimate.
        const km = order.routeKm != null ? `${order.routeKm}` : `≈ ${distanceKm(city(order.pickupCity), city(order.dropoffCity))}`;
        // Native layout animation can retain a removed assignment panel's offset.
        return <View key={order.id}>
          <Card>
            <Row gap={10} style={{ marginBottom: 12 }}>
              <ServiceIcon service={order.service} size={38} />
              <View style={{ flex: 1 }}>
                <Txt variant="title">{c[order.service]}</Txt>
                <Txt variant="caption">{/* same rule as OrderRow: only shared, the exception, is marked */}{order.shared ? `${c.shared} · ` : ''}{order.pickupCity === order.dropoffCity ? c.sameCity : `${km} ${c.km}`}</Txt>
                {order.customerStats && <Txt variant="caption">{order.customerStats.trips ? [order.customerStats.rating != null && fill(c.customerStars, { r: order.customerStats.rating }),
                  fill(c.tripsCount, { n: order.customerStats.trips })].filter(Boolean).join(' · ') : c.newCustomer}</Txt>}
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
            <RouteLine from={city(order.pickupCity)[language]} to={city(order.dropoffCity)[language]} fromNote={order.pickupNote} toNote={order.dropoffNote} ride={order.service === 'ride'} />
            {!!order.detail && <Row gap={6} style={styles.note}>
              <Ionicons name="document-text-outline" size={14} color={palette.secondary} />
              <Txt variant="caption" numberOfLines={2} style={{ flex: 1 }}>{order.detail}</Txt>
            </Row>}
            {order.myOffer && <Row gap={6} style={styles.note}>
              <Ionicons name="hourglass-outline" size={14} color={palette.olive} />
              <Txt variant="label" style={{ flex: 1 }}>{fill(c.yourOffer, { p: money(order.myOffer.price) })}</Txt>
            </Row>}
            {offering?.id === order.id && order.recommendedPrice != null && (() => {
              const [lo, hi] = offerRange(order.recommendedPrice), n = Number(offering.text);
              const ok = Number.isInteger(n) && n >= lo && n <= hi;
              return <View style={{ marginTop: 12 }}>
                <Field label={`${c.offerPrice} (₪)`} icon="cash-outline" keyboardType="number-pad" value={offering.text} maxLength={4}
                  onChangeText={text => setOffering({ id: order.id, text: text.replace(/\D/g, '') })}
                  error={offering.text && !ok ? fill(c.offerRange, { lo: money(lo), hi: money(hi) }) : undefined} />
                <Txt variant="caption" style={{ marginBottom: 8 }}>{fill(c.recommendedIs, { p: money(order.recommendedPrice) })} · {fill(c.offerRange, { lo: money(lo), hi: money(hi) })}</Txt>
                <Button title={fill(c.sendOffer, { p: ok ? money(n) : '' })} icon="paper-plane-outline" variant="soft"
                  onPress={() => offer(order, n)} loading={busy === order.id} disabled={!ok || busy !== null || blocked(order) || !work.known} />
              </View>;
            })()}
            <View style={{ marginTop: 12, gap: 8 }}>
              <Button title={order.recommendedPrice != null ? fill(c.acceptAt, { p: money(order.price) }) : c.accept} icon="checkmark-circle-outline"
                onPress={() => accept(order)} loading={busy === order.id && offering?.id !== order.id} disabled={busy !== null || blocked(order) || !work.known} />
              {order.recommendedPrice != null && offering?.id !== order.id && <Button title={c.offerPrice} icon="pricetags-outline" variant="ghost"
                disabled={busy !== null || blocked(order)} onPress={() => setOffering({ id: order.id, text: String(order.myOffer?.price ?? order.recommendedPrice) })} />}
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
