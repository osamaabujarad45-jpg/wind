// Wind Control · Approvals: every decision waiting on staff in one place (owner brief 22 Nov: a desktop admin view to manage
// the app, support messages and user approvals). Captains and plan requests are decided here with the same calls and
// confirmations as the Users and Plans tabs; a shop needs its fees and commission set first, so its row opens the Shops tab.
import { useContext, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { api, useApi } from '../../api';
import { city, isCity, type Merchant, type Subscription, type User } from '../../model';
import { useFormat } from '../../parts';
import { useSession } from '../../session';
import { Badge, Button, Card, confirm, Empty, ErrorText, fill, haptic, Header, Loading, Row, Screen, Section, tones, Txt, useCopy, WideContext } from '../../ui';

export default function Approvals() {
  const { c, err, money, language } = useCopy();
  const { date } = useFormat();
  const { me } = useSession();
  const shop = !!me?.capabilities?.enabledServices?.includes('shop');
  // On a desktop the decision buttons keep a readable width instead of spanning the page.
  const wide = useContext(WideContext);
  const actions = wide ? { marginTop: 12, maxWidth: 520 } : { marginTop: 12 };
  const drivers = useApi<User[]>('/admin/users?q=&role=driver', 30_000);
  const plans = useApi<Subscription[]>('/admin/subscriptions', 30_000);
  const shops = useApi<{ merchants: Merchant[] }>(shop ? '/admin/merchants?status=pending' : null, 30_000);
  const stats = useApi<{ pendingDrivers: number; pendingSubscriptions: number }>('/admin/stats', 30_000);
  const list = useRef<ScrollView>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState('');

  // Oldest request first: whoever has waited longest is answered first.
  const waitingDrivers = (drivers.data ?? []).filter(u => u.status === 'pending').sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const waitingPlans = (plans.data ?? []).filter(s => s.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  const waitingShops = (shops.data?.merchants ?? []).filter(m => m.status === 'pending');
  const ready = !!drivers.data && !!plans.data;
  const loadError = drivers.error ?? plans.error;
  // The lists are capped at 200 rows: say so when the count is larger, instead of hiding the rest.
  const moreDrivers = Math.max(0, (stats.data?.pendingDrivers ?? 0) - waitingDrivers.length);
  const morePlans = Math.max(0, (stats.data?.pendingSubscriptions ?? 0) - waitingPlans.length);
  const reload = async () => { await Promise.all([drivers.reload(), plans.reload(), stats.reload(), ...(shop ? [shops.reload()] : [])]); };
  const town = (place: string) => isCity(place) ? city(place)[language] : place;

  async function decide(key: string, path: string, body: object) {
    if (busy) return;
    setBusy(key); setFailure('');
    try { await api(path, body); haptic.success(); }
    catch (e) { haptic.error(); setFailure(err(e)); list.current?.scrollTo({ y: 0 }); } // another admin may have decided it first: the reload shows what happened
    finally { setBusy(null); await reload(); }
  }
  const approveDriver = (u: User) => confirm(fill(c.approvalConfirm, { name: u.name }),
    () => void decide(`driver${u.id}`, `/admin/users/${u.id}/approve`, {}), c.approve, c.cancel);
  // A-03, as on the Plans tab: the decision names who, which plan and how much before it is sent.
  const decidePlan = (s: Subscription, action: 'activate' | 'reject') => confirm(
    fill(action === 'activate' ? c.subActivateReview : c.subRejectReview, { n: s.userName ?? '', p: s.plan === 'plus' ? c.plusTitle : c.proTitle, a: money(s.price) }),
    () => void decide(`plan${s.id}${action}`, `/admin/subscriptions/${s.id}`, { action }), action === 'activate' ? c.activate : c.reject, c.cancel);

  const total = waitingDrivers.length + waitingPlans.length + waitingShops.length;
  return <Screen onRefresh={reload} scrollRef={list}>
    {/* Plans has no phone tab: its link stays here whatever is pending */}
    <Header title={c.approvalsTitle} right={<Button title={c.approvalsAllPlans} variant="ghost" size="sm" onPress={() => router.navigate('/admin/subscriptions')} />} />
    <ErrorText>{failure || (loadError ? err(loadError) : '')}</ErrorText>
    {!ready ? <Loading failed={!!loadError} onRetry={reload} /> : total === 0 ? <Empty icon="checkmark-done-outline" title={c.approvalsNone} /> : <View style={{ gap: 8 }}>
      {waitingDrivers.length > 0 && <>
        <Section title={`${c.pendingDrivers} · ${waitingDrivers.length}`} action={c.approvalsAllUsers} onAction={() => router.navigate('/admin/users')} />
        {moreDrivers > 0 && <Txt variant="caption">{fill(c.approvalsMore, { n: moreDrivers })}</Txt>}
        {waitingDrivers.map(u => <Card key={`d${u.id}`}>
          <Row gap={8} style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="title">{u.name}</Txt>
              <Txt variant="caption" style={{ writingDirection: 'ltr' }}>{[u.phone, u.plate].filter(Boolean).join(' · ')}</Txt>
              {u.createdAt != null && <Txt variant="caption">{fill(c.approvalsSince, { date: date(u.createdAt) })}</Txt>}
            </View>
            {u.vehicle && <Badge label={c[u.vehicle]} tone={tones.muted} />}
          </Row>
          <Row gap={8} style={actions}>
            <View style={{ flex: 1 }}><Button title={c.approve} label={`${c.approve}: ${u.name}`} loading={busy === `driver${u.id}`} disabled={!!busy} onPress={() => approveDriver(u)} /></View>
          </Row>
        </Card>)}
      </>}
      {waitingPlans.length > 0 && <>
        <Section title={`${c.pendingSubs} · ${waitingPlans.length}`} />
        {morePlans > 0 && <Txt variant="caption">{fill(c.approvalsMore, { n: morePlans })}</Txt>}
        {waitingPlans.map(s => <Card key={`p${s.id}`}>
          <Txt variant="title">{s.userName} · {s.plan === 'plus' ? c.plusTitle : c.proTitle}</Txt>
          <Txt variant="caption" style={{ writingDirection: 'ltr' }}>{s.userPhone}</Txt>
          <Txt variant="caption">{`${money(s.price)} · ${fill(c.approvalsSince, { date: date(s.createdAt) })}`}</Txt>
          <Row gap={8} style={actions}>
            <View style={{ flex: 1 }}><Button title={c.activate} label={`${c.activate}: ${s.userName ?? ''}`} loading={busy === `plan${s.id}activate`} disabled={!!busy} onPress={() => decidePlan(s, 'activate')} /></View>
            <View style={{ flex: 1 }}><Button title={c.reject} label={`${c.reject}: ${s.userName ?? ''}`} variant="danger" loading={busy === `plan${s.id}reject`} disabled={!!busy} onPress={() => decidePlan(s, 'reject')} /></View>
          </Row>
        </Card>)}
      </>}
      {shop && shops.error && !shops.data && <ErrorText>{err(shops.error)}</ErrorText>}
      {waitingShops.length > 0 && <>
        <Section title={`${c.approvalsShops} · ${waitingShops.length}`} />
        {waitingShops.map(m => <Card key={`s${m.id}`}>
          <Txt variant="title">{m.name}</Txt>
          <Txt variant="caption">{town(m.city)}</Txt>
          <Row gap={8} style={actions}>
            <View style={{ flex: 1 }}><Button title={c.approvalsShopTerms} label={`${c.approvalsShopTerms}: ${m.name}`} variant="outline" icon="storefront-outline" onPress={() => router.navigate('/admin/merchants')} /></View>
          </Row>
        </Card>)}
      </>}
    </View>}
  </Screen>;
}
