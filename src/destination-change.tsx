import { useState } from 'react';
import { View } from 'react-native';
import { api } from './api';
import { cities, city, servedCity, type CityId, type DestinationChange, type Order, type Point } from './model';
import PinSheet from './pin-sheet';
import { canPin } from './route-map';
import { Button, Card, confirm, ErrorText, Field, FilterChips, fill, Row, Txt, useCopy } from './ui';

type Props = { order: Order; customer: boolean; driver: boolean; now: number; onChange: (order: Order) => void };

/** A proposal is never an order update until its assigned driver accepts it. */
export function DestinationChangeCard({ order, customer, driver, now, onChange }: Props) {
  const { c, language, money, err } = useCopy();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<CityId>(order.dropoffCity);
  const [note, setNote] = useState('');
  const [point, setPoint] = useState<Point | null>(null);
  const [pin, setPin] = useState(false);
  const [preview, setPreview] = useState<{ quote: DestinationChange; updatedAt: number } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const pending = order.destinationChange;
  const change = pending ?? preview?.quote;
  const expired = !!change && change.expiresAt <= now;
  const stale = !!preview && preview.updatedAt !== order.updatedAt;
  const endpoint = `/orders/${order.id}/destination`;

  async function requestQuote() {
    if (busy || !note.trim()) return;
    setBusy('quote'); setError('');
    try {
      const quote = await api<DestinationChange>(`${endpoint}/quote`, { city: selected, note, point });
      setPreview({ quote, updatedAt: order.updatedAt });
    } catch (e) { setError(err(e)); }
    finally { setBusy(''); }
  }
  async function command(action: 'propose' | 'decision' | 'withdraw', id: string, decision?: 'accept' | 'decline') {
    if (busy) return;
    setBusy(action); setError('');
    try {
      const updated = await api<Order>(`${endpoint}/${action}`, { id, ...(decision && { decision }) });
      onChange(updated); setPreview(null); setEditing(false);
    } catch (e) { setError(err(e)); }
    finally { setBusy(''); }
  }

  if ((!customer && !driver) || !['assigned', 'at_pickup', 'in_transit'].includes(order.status)) return null;
  if (!pending && !customer) return null;
  if (customer && !order.canChangeDestination && !pending) return <Card><Txt variant="title">{c.changeDestination}</Txt>
    <Txt variant="caption">{c.changeDestinationUnavailable}</Txt></Card>;

  const edit = () => { setPreview(null); setError(''); };
  return <Card>
    <Txt variant="title" header>{c.changeDestination}</Txt>
    <Txt variant="caption" style={{ marginTop: 4 }}>{pending ? customer ? c.destinationWaiting : c.destinationDriverRequest : c.changeDestinationIntro}</Txt>
    {change && <View style={{ gap: 4, marginTop: 10 }} accessibilityLiveRegion="polite">
      <Txt>{`${city(change.city)[language]}, ${change.note}`}</Txt>
      <Txt variant="title">{fill(c.destinationReview, { old: money(change.oldPrice - change.oldDiscount), next: money(change.price - change.discount) })}</Txt>
      {(change.oldDiscount > 0 || change.discount > 0) && <Txt variant="caption">{fill(c.destinationGross, { old: money(change.oldPrice), next: money(change.price) })}</Txt>}
      {driver && <Txt variant="caption">{fill(c.destinationEarnings, { amount: money(change.price - change.commission) })}</Txt>}
      <Txt variant="caption">{c.destinationCash}</Txt>
      {change.road.estimated && <Txt variant="caption">{c.destinationEstimated}</Txt>}
      {(change.road.slow.length > 0 || change.road.closed.length > 0) && <Txt variant="caption">{fill(c.destinationRoads, { names: [...change.road.slow, ...change.road.closed].join(language === 'ar' ? '، ' : ', ') })}</Txt>}
      {(expired || stale) && <Txt variant="caption">{c.destinationExpired}</Txt>}
    </View>}
    {!pending && customer && !editing && <View style={{ marginTop: 10 }}><Button title={c.changeDestination} variant="outline" onPress={() => setEditing(true)} /></View>}
    {!pending && customer && editing && <View style={{ marginTop: 10, gap: 8 }}>
      <FilterChips items={cities.map(item => ({ key: item.id, label: item[language] }))} value={selected} label={c.changeDestination}
        disabled={!!busy} onChange={value => { setSelected(value); setPoint(null); edit(); }} />
      <Field label={c.destinationLandmark} value={note} onChangeText={value => { setNote(value); edit(); }} maxLength={200} disabled={!!busy} />
      {canPin && <Button title={point ? c.destinationPinSet : c.destinationPin} variant="outline" disabled={!!busy} reason={c.wait_busy} onPress={() => setPin(true)} />}
      <Button title={c.destinationQuote} variant="outline" loading={busy === 'quote'} disabled={!!busy || !note.trim()} reason={busy ? c.wait_busy : c.fieldRequired} onPress={requestQuote} />
      {preview && <Button title={c.destinationRequest} loading={busy === 'propose'} disabled={!!busy || expired || stale} reason={busy ? c.wait_busy : c.destinationExpired}
        onPress={() => command('propose', preview.quote.id)} />}
      <Button title={c.cancel} variant="ghost" disabled={!!busy} reason={c.wait_busy} onPress={() => { setEditing(false); edit(); }} />
    </View>}
    {pending && customer && <View style={{ marginTop: 10 }}><Button title={c.destinationWithdraw} variant="outline" loading={busy === 'withdraw'} disabled={!!busy || expired}
      reason={busy ? c.wait_busy : c.destinationExpired} onPress={() => command('withdraw', pending.id)} /></View>}
    {pending && driver && <Row gap={8} style={{ marginTop: 10 }}>
      <Button title={c.destinationAccept} loading={busy === 'decision'} disabled={!!busy || expired} reason={busy ? c.wait_busy : c.destinationExpired}
        onPress={() => confirm(fill(c.destinationAcceptConfirm, { city: city(pending.city)[language] }), () => command('decision', pending.id, 'accept'), c.destinationAccept, c.cancel)} />
      <Button title={c.destinationDecline} variant="outline" disabled={!!busy || expired} reason={busy ? c.wait_busy : c.destinationExpired}
        onPress={() => command('decision', pending.id, 'decline')} />
    </Row>}
    <ErrorText>{error}</ErrorText>
    {pin && <PinSheet title={c.destinationPin} start={point ?? city(selected)} onClose={() => setPin(false)} onConfirm={next => {
      const near = servedCity(next);
      if (!near) setError(c.pinOutsideArea);
      else { setSelected(near); setPoint(next); edit(); }
      setPin(false);
    }} />}
  </Card>;
}
