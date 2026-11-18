// WP-02: the admin card that places a stuck order on a chosen driver, or moves one that nothing has been collected on yet.
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useApi } from './api';
import { newRequestId } from './booking';
import { isolate, type Order } from './model';
import { Button, Card, Field, Loading, Txt, confirm, fill, useCopy } from './ui';

type Candidate = { id: number; name: string; phone: string; vehicle: string | null; plate: string | null; eligible: boolean; reason: string | null };
type Act = (key: string, path: string, body?: object, after?: () => void) => Promise<void>;

export function AdminAssign({ order, busy, act }: { order: Order; busy: boolean; act: Act }) {
  const { c, rtl } = useCopy();
  const words = c as Record<string, string | undefined>;
  const reassign = order.status !== 'searching';
  const { data, error, reload } = useApi<Candidate[]>(`/admin/orders/${order.id}/assignable-drivers`);
  const [picked, setPicked] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const chosen = data?.find(d => d.id === picked && d.eligible);
  const ready = !!chosen && reason.trim().length >= 5;
  const submit = () => {
    if (!chosen) return;
    const key = `${order.id}:${chosen.id}:${reason.trim()}`; // one request id per identical attempt, so a lost answer replays
    if (attempt.current?.key !== key) attempt.current = { key, id: newRequestId() };
    setDone(false);
    confirm(fill(c.assignConfirm, { name: chosen.name }), () => act('assign', `/admin/orders/${order.id}/assign`,
      { driverId: chosen.id, reason: reason.trim(), requestId: attempt.current!.id, expectedStatus: order.status, expectedDriverId: order.driverId ?? null },
      () => { attempt.current = null; setPicked(null); setReason(''); setDone(true); reload(); }), reassign ? c.reassignAction : c.assignAction, c.no);
  };
  return <Card tone="clay">
    <Txt variant="title">{reassign ? c.reassignTitle : c.assignTitle}</Txt>
    <Txt variant="caption" style={{ marginTop: 4, marginBottom: 12 }}>{reassign ? c.reassignHint : c.assignHint}</Txt>
    {done && <Txt variant="caption" style={{ marginBottom: 12 }}>{c.assignDone}</Txt>}
    {!data ? <Loading failed={!!error} onRetry={reload} /> : data.length === 0 ? <Txt variant="caption">{c.assignNoDrivers}</Txt>
      : <View style={{ gap: 8, marginBottom: 12 }}>
        {data.map(d => <Button key={d.id} size="sm" variant={picked === d.id ? 'primary' : 'outline'} icon="car-outline"
          title={`${rtl ? '\u200f' : '\u200e'}${isolate(d.name)} · ${(d.vehicle && words[d.vehicle]) || d.vehicle || ''}`} trailing={d.plate ?? undefined}
          disabled={!!busy || !d.eligible} reason={`${c.assignBlockedPrefix} ${(d.reason && words[`assign_no_${d.reason}`]) || d.reason || ''}`}
          onPress={() => setPicked(d.id)} />)}
      </View>}
    <Field label={c.proofResetReason} value={reason} maxLength={500} disabled={!!busy} onChangeText={setReason} />
    <Button title={reassign ? c.reassignAction : c.assignAction} variant="outline" icon="swap-horizontal-outline" loading={busy}
      disabled={busy || !ready} reason={busy ? c.wait_busy : !chosen ? c.assignPick : c.reason_min5} onPress={submit} />
  </Card>;
}
