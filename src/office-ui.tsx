// SHIP-19 (D-5): support's side of returned goods kept at the Wind office: record the receipt, then one ending.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { api, useApi } from './api';
import { orderCode } from './model';
import { useFormat } from './parts';
import { Button, Card, Check, confirm, ErrorText, Field, fill, Loading, Press, Row, Section, Txt, useCopy } from './ui';

/** Minute clock for hold deadlines: read in an effect, never during render. */
function useMinute() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  return now;
}

type Office = { receivedAt: number; perishable: boolean; until: number; closed: null | { action: 'collected' | 'donated' | 'destroyed'; at: number } };

/** Support records custody from the returned order. */
export function OfficePanel({ orderId, shop }: { orderId: number; shop: boolean }) {
  const { c, err } = useCopy();
  const { time } = useFormat();
  const { data, error, reload, setData } = useApi<{ office: Office | null; canReceive?: boolean }>(`/admin/orders/${orderId}/office`);
  const [note, setNote] = useState('');
  const [perishable, setPerishable] = useState(false);
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState('');
  const now = useMinute();
  if (!data) return <Loading failed={!!error} onRetry={reload} />;
  const office = data.office;
  if (!office && data.canReceive === false) return null;
  async function act(action: 'received' | 'collected' | 'donated' | 'destroyed') {
    setBusy(action); setFailure('');
    try {
      setData(await api<{ office: Office }>(`/admin/orders/${orderId}/office`, { action, note: note.trim(), ...(action === 'received' && { perishable }) }));
      setNote('');
    } catch (e) { setFailure(err(e)); }
    finally { setBusy(''); }
  }
  const noted = note.trim().length >= 5;
  return <Card>
    <Txt variant="title" header style={{ marginBottom: 6 }}>{c.officeTitle}</Txt>
    {!office ? <View style={{ gap: 4 }}>
      <Txt variant="caption">{shop ? c.officeShopIntro : c.officeIntro}</Txt>
      <Check checked={perishable} onChange={setPerishable} label={c.officePerishable} disabled={!!busy} />
      <Field label={c.officeNote} value={note} onChangeText={setNote} maxLength={300} disabled={!!busy} />
      <Button title={c.officeReceive} icon="business-outline" variant="outline" loading={busy === 'received'} disabled={!!busy || !noted}
        reason={c.officeNoteNeeded} onPress={() => act('received')} />
    </View> : office.closed ? <Txt>{fill(shop && office.closed.action === 'collected' ? c.officeShopCollectedAt : c[`officeClosed_${office.closed.action}`], { t: time(office.closed.at) })}</Txt>
      : <View style={{ gap: 6 }}>
        <Txt>{fill(c.officeKept, { from: time(office.receivedAt), t: time(office.until) })}</Txt>
        {office.perishable && <Txt variant="caption">{c.officePerishableKept}</Txt>}
        <Field label={c.officeNote} value={note} onChangeText={setNote} maxLength={300} disabled={!!busy} />
        <Button title={shop ? c.officeShopCollected : c.officeCollected} icon="person-outline" variant="soft" loading={busy === 'collected'} disabled={!!busy} onPress={() => act('collected')} />
        {/* Donating or destroying someone's goods waits for the hold to end and always says why. */}
        {(['donated', 'destroyed'] as const).map(a => <Button key={a} title={c[`officeEnd_${a}`]} variant={a === 'destroyed' ? 'ghost' : 'outline'} size="sm"
          loading={busy === a} disabled={!!busy || now < office.until || !noted}
          reason={now < office.until ? fill(c.officeHoldRunning, { t: time(office.until) }) : c.officeNoteNeeded}
          onPress={() => confirm(c[`officeConfirm_${a}`], () => act(a), c[`officeEnd_${a}`], c.no)} />)}
      </View>}
    <ErrorText>{failure}</ErrorText>
  </Card>;
}

/** The office shelf on the admin dashboard: goods waiting, the ones past their hold first. Hidden when empty. */
export function OfficeShelf() {
  const { c } = useCopy();
  const { time } = useFormat();
  const { data } = useApi<{ items: (Office & { orderId: number })[] }>('/admin/office', 60_000);
  const now = useMinute();
  if (!data?.items.length) return null;
  return <View style={{ marginBottom: 14 }}>
    <Section title={fill(c.officeShelf, { n: data.items.length })} />
    {data.items.map(item => {
      const over = now >= item.until;
      const line = over ? c.officeOverdue : fill(c.officeUntil, { t: time(item.until) });
      return <Press key={item.orderId} onPress={() => router.push(`/order/${item.orderId}`)} accessibilityLabel={`${orderCode(item.orderId)}، ${line}`}>
        <Card tone={over ? 'clay' : 'card'} style={{ marginBottom: 8 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label" style={{ writingDirection: 'ltr' }}>{orderCode(item.orderId)}</Txt>
            <Txt variant="caption">{line}</Txt>
          </Row>
        </Card>
      </Press>;
    })}
  </View>;
}
