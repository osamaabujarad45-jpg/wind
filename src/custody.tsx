// SHIP-10: who has held a parcel, and when, for the sender and support. Fetched only when opened: it is history, not live state.
import { useState } from 'react';
import { View } from 'react-native';
import { useApi } from './api';
import { useFormat } from './parts';
import { Button, Card, fill, Loading, Row, Txt, useCopy } from './ui';
import { useTheme } from './theme-context';

type Step = { at: number; kind: string; by: 'sender' | 'driver' | 'support'; reason?: string; driver?: string; until?: number; attempt?: number };

export function CustodyChain({ orderId }: { orderId: number }) {
  const { c } = useCopy();
  const [open, setOpen] = useState(false);
  if (!open) return <Button title={c.custodyShow} icon="time-outline" variant="ghost" size="sm" onPress={() => setOpen(true)} />;
  return <Card><Txt variant="title" header style={{ marginBottom: 8 }}>{c.custodyTitle}</Txt><Steps orderId={orderId} /></Card>;
}

function Steps({ orderId }: { orderId: number }) {
  const { palette } = useTheme();
  const { c } = useCopy();
  const { time } = useFormat();
  const { data, error, reload } = useApi<{ steps: Step[] }>(`/orders/${orderId}/custody`);
  if (!data) return <Loading failed={!!error} onRetry={reload} />;
  const words = c as Record<string, string | undefined>;
  return <View style={{ gap: 10 }}>
    {data.steps.map((s, i) => {
      // An unknown kind or reason from a newer server still shows as a dated step instead of a raw code.
      const what = words[`custody_${s.kind}`] ?? c.custodyStep;
      const why = s.reason ? words[`reason_${s.reason}`] ?? words[`pickup_${s.reason}`] ?? words[`custodyDecision_${s.reason}`] : undefined;
      return <Row key={`${s.at}-${i}`} gap={10} style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: i === data.steps.length - 1 ? palette.olive : palette.dash }} />
        <View style={{ flex: 1 }}>
          <Txt variant="label">{s.driver ? `${what} · ${s.driver}` : what}</Txt>
          {!!why && <Txt variant="caption">{s.attempt ? fill(c.custodyAttempt, { n: String(s.attempt) }) : why}</Txt>}
          {s.until != null && <Txt variant="caption">{fill(c.officeUntil, { t: time(s.until) })}</Txt>}
          <Txt variant="micro">{`${time(s.at)} · ${c[`custodyBy_${s.by}`]}`}</Txt>
        </View>
      </Row>;
    })}
  </View>;
}
