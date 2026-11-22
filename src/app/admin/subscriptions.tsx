import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { api, useApi } from '../../api';
import type { Subscription } from '../../model';
import { useFormat } from '../../parts';
import { Appear, Badge, Button, Card, confirm, Empty, ErrorText, fill, haptic, Header, Loading, Row, Screen, tones, Txt, useCopy } from '../../ui';

export default function Subscriptions() {
  const { c, money, err } = useCopy();
  const { date } = useFormat();
  const { data, error, reload } = useApi<Subscription[]>('/admin/subscriptions', 30_000);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const list = useRef<ScrollView>(null);
  const fail = (message: string) => { setActionError(message); list.current?.scrollTo({ y: 0 }); };

  async function decide(sub: Subscription, action: 'activate' | 'reject') {
    setBusy(`${sub.id}${action}`);
    setActionError('');
    try {
      await api(`/admin/subscriptions/${sub.id}`, { action });
      haptic.success();
      await reload();
    } catch (e) {
      fail(err(e));
      await reload(); // another admin may have decided it while the confirmation was open
    }
    setBusy(null);
  }

  // A-03: a decision names who, which plan and how much before it is sent; activation is the admin confirming payment arrived.
  // A stacked second confirmation (two quick taps) can only send a decision the server's CAS already refuses.
  const review = (sub: Subscription, action: 'activate' | 'reject') => confirm(
    fill(action === 'activate' ? c.subActivateReview : c.subRejectReview, { n: sub.userName ?? '', p: sub.plan === 'plus' ? c.plusTitle : c.proTitle, a: money(sub.price) }),
    () => void decide(sub, action), action === 'activate' ? c.activate : c.reject, c.cancel);

  return <Screen onRefresh={reload} scrollRef={list}>
    <Header title={c.subscriptions} />
    <ErrorText>{actionError || (error && err(error))}</ErrorText>
    {!data ? <Loading failed={!!error} onRetry={reload} /> : data.length === 0 ? <Empty icon="sparkles-outline" title={c.noSubscriptions} />
      : data.map((sub, i) => {
        return <Appear key={sub.id} index={i}>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="title">{sub.userName} · {sub.plan === 'plus' ? c.plusTitle : c.proTitle}</Txt>
                <Txt variant="caption">{sub.userPhone} · {money(sub.price)} · {date(sub.createdAt)}</Txt>
                {sub.status === 'active' && sub.endsAt && <Txt variant="caption">{fill(c.subActive, { date: date(sub.endsAt) })}</Txt>}
              </View>
              {!(sub.status === 'active' && sub.endsAt) && <Badge label={c[sub.status]} tone={sub.status === 'active' ? tones.olive : sub.status === 'pending' ? tones.warn : tones.muted} />}{/* "active until" below already says it */}
            </Row>
            {sub.status === 'pending' && <Row gap={8} style={{ marginTop: 12 }}>
              {/* T22: while any decision is in flight both controls wait — the server CAS makes the loser
                  a 409 anyway, and the UI never invites the second tap. */}
              <View style={{ flex: 1 }}><Button title={c.activate} loading={busy === `${sub.id}activate`} disabled={busy !== null} onPress={() => review(sub, 'activate')} /></View>
              <View style={{ flex: 1 }}><Button title={c.reject} variant="danger" loading={busy === `${sub.id}reject`} disabled={busy !== null} onPress={() => review(sub, 'reject')} /></View>
            </Row>}
          </Card>
        </Appear>;
      })}
  </Screen>;
}
