import { useState } from 'react';
import { View } from 'react-native';
import { api, useApi } from '../../api';
import type { Subscription } from '../../model';
import { useFormat } from '../../parts';
import { Appear, Badge, Button, Card, Empty, ErrorText, fill, haptic, Header, Loading, Row, Screen, tones, Txt, useCopy } from '../../ui';

export default function Subscriptions() {
  const { c, money, err } = useCopy();
  const { date } = useFormat();
  const { data, error, reload } = useApi<Subscription[]>('/admin/subscriptions', 30_000);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  async function decide(sub: Subscription, action: 'activate' | 'reject') {
    setBusy(`${sub.id}${action}`);
    setActionError('');
    try {
      await api(`/admin/subscriptions/${sub.id}`, { action });
      haptic.success();
      await reload();
    } catch (e) {
      setActionError(err(e));
    }
    setBusy(null);
  }

  return <Screen onRefresh={reload}>
    <Header title={c.subscriptions} />
    <ErrorText>{actionError || (error && err(error))}</ErrorText>
    {!data ? <Loading failed={!!error} onRetry={reload} /> : data.length === 0 ? <Empty icon="sparkles-outline" title={c.nothingHere} />
      : data.map((sub, i) => {
        return <Appear key={sub.id} index={i}>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="title">{sub.userName} · {sub.plan === 'plus' ? c.plusTitle : c.proTitle}</Txt>
                <Txt variant="caption">{sub.userPhone} · {money(sub.price)} · {date(sub.createdAt)}</Txt>
                {sub.status === 'active' && sub.endsAt && <Txt variant="caption">{fill(c.subActive, { date: date(sub.endsAt) })}</Txt>}
              </View>
              {!(sub.status === 'active' && sub.endsAt) && <Badge label={c[sub.status]} tone={sub.status === 'active' ? tones.olive : sub.status === 'pending' ? tones.clay : tones.muted} />}{/* "active until" below already says it */}
            </Row>
            {sub.status === 'pending' && <Row gap={8} style={{ marginTop: 12 }}>
              {/* T22: while any decision is in flight both controls wait — the server CAS makes the loser
                  a 409 anyway, and the UI never invites the second tap. */}
              <View style={{ flex: 1 }}><Button title={c.activate} loading={busy === `${sub.id}activate`} disabled={busy !== null} onPress={() => decide(sub, 'activate')} /></View>
              <View style={{ flex: 1 }}><Button title={c.reject} variant="danger" loading={busy === `${sub.id}reject`} disabled={busy !== null} onPress={() => decide(sub, 'reject')} /></View>
            </Row>}
          </Card>
        </Appear>;
      })}
  </Screen>;
}
