import { useState } from 'react';
import { View } from 'react-native';
import { api, useApi } from '../../api';
import { fractionSettings, typedNumber, type Settings } from '../../model';
import { PasswordCard, useFormat } from '../../parts';
import { useSession } from '../../session';
import { Badge, Button, Card, Choices, confirm, ErrorText, Field, fill, haptic, Header, IconButton, ListGroup, palette, Row, Screen, Txt, useCopy } from '../../ui';
import { router } from 'expo-router';

const groups: { title: 'pricing' | 'discounts' | 'plans'; keys: (keyof Settings)[] }[] = [
  { title: 'pricing', keys: ['parcelPrice', 'parcelLarge', 'rideBase', 'ridePerKm', 'freightBase', 'freightPerKm', 'freightLarge', 'loadingHelp', 'perMinute', 'nightExtra'] },
  // sharedDiscount is not offered: pooling is off, so a shared fare never happens (the server refuses shared bookings).
  { title: 'discounts', keys: ['plusDiscount', 'commission', 'proCommission'] },
  { title: 'plans', keys: ['plusPrice', 'proPrice'] },
];

export default function AdminSettings() {
  const { me, refresh, signOut, language, setLanguage } = useSession();
  const { c, err } = useCopy();
  const [values, setValues] = useState(() => Object.fromEntries(Object.entries(me!.settings).map(([k, v]) => [k, String(v)])));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/admin/settings', Object.fromEntries(Object.entries(values).map(([k, v]) => [k, typedNumber(v)])));
      await refresh();
      haptic.success();
      setMessage(c.saved);
    } catch (e) {
      haptic.error();
      setError(err(e));
    }
    setBusy(false);
  }

  return <Screen>
    <Header title={c.settings} right={<IconButton icon="trail-sign-outline" label={c.roads} tone="muted" onPress={() => router.push('/roads')} />} />
    {groups.map(group => <Card key={group.title}>
      <Txt variant="h2" style={{ marginBottom: 4 }}>{c[group.title]}</Txt>
      {group.title === 'discounts' && <Txt variant="caption" style={{ marginBottom: 10 }}>{c.percentNote}</Txt>}
      {group.keys.map(key => <Field key={key} keyboardType="decimal-pad"
        label={`${c[`set_${key}`]}${fractionSettings.includes(key) ? ` (${Math.round(typedNumber(values[key]) * 100) || 0}%)` : ' ₪'}`}
        value={values[key]} onChangeText={text => setValues(v => ({ ...v, [key]: text }))} />)}
    </Card>)}
    <Promos />
    <ErrorText>{error}</ErrorText>
    {!!message && <Txt center style={{ marginBottom: 10, fontWeight: '800' }}>{message}</Txt>}
    <View style={{ gap: 10 }}>
      <Button title={c.save} icon="save-outline" onPress={save} loading={busy} />
      <Button title={c.language} icon="language-outline" variant="soft" onPress={() => setLanguage(language === 'ar' ? 'en' : 'ar')} />
      <ListGroup><PasswordCard /></ListGroup>
      <Button title={c.logout} icon="log-out-outline" variant="danger" onPress={() => confirm(c.logoutConfirm, signOut, c.logout, c.no)} />
    </View>
  </Screen>;
}

type Promo = { id: number; code: string; amount: number; maxUses: number; uses: number; expiresAt: number; firstOrderOnly: boolean; active: boolean; live: boolean };
const blank = { code: '', amount: '10', maxUses: '100', days: '30', firstOrderOnly: false };

// Promo codes (SPEC-promo-codes.md): fixed shekel discounts Wind funds through the driver cash ledger.
function Promos() {
  const { c, money, err } = useCopy();
  const { date } = useFormat();
  const { data, error: loadError, reload } = useApi<Promo[]>('/admin/promos');
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const set = (key: keyof typeof blank) => (v: string) => { setForm(f => ({ ...f, [key]: v })); setError(''); setMessage(''); };
  async function create() {
    setBusy(true); setError(''); setMessage('');
    try {
      await api('/admin/promos', { code: form.code.trim(), amount: typedNumber(form.amount), maxUses: typedNumber(form.maxUses), days: typedNumber(form.days), firstOrderOnly: form.firstOrderOnly });
      haptic.success(); setForm(blank); setMessage(c.promoCreated); reload();
    } catch (e) { haptic.error(); setError(err(e)); } finally { setBusy(false); }
  }
  const stop = (p: Promo) => confirm(c.promoDeactivateConfirm, () => api(`/admin/promos/${p.id}/deactivate`, {}).then(() => { haptic.success(); reload(); })
    .catch(e => setError(err(e))), c.promoDeactivate, c.no);
  return <Card>
    <Txt variant="h2" style={{ marginBottom: 4 }}>{c.promos}</Txt>
    <Txt variant="caption" style={{ marginBottom: 10 }}>{c.promosHint}</Txt>
    {!!loadError && <ErrorText>{err(loadError)}</ErrorText>}
    {data?.length === 0 && <Txt variant="caption" style={{ marginBottom: 10 }}>{c.noPromos}</Txt>}
    {data?.map(p => <Row key={p.id} gap={8} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: palette.hair }}>
      <View style={{ flex: 1 }}>
        <Row gap={8}><Txt variant="title">{`${p.code} · ${money(p.amount)}`}</Txt>
          <Badge label={p.live ? c.promoActive : p.active ? c.promoExpired : c.promoEnded} status={p.live ? 'completed' : 'cancelled'} /></Row>
        <Txt variant="micro">{fill(c.promoUses, { n: p.uses, max: p.maxUses, t: date(p.expiresAt) })}{p.firstOrderOnly ? ` · ${c.promoFirstOnly}` : ''}</Txt>
      </View>
      {p.live && <IconButton icon="pause-circle-outline" tone="muted" label={`${c.promoDeactivate} ${p.code}`} onPress={() => stop(p)} />}
    </Row>)}
    <View style={{ marginTop: 12 }}>
      <Field label={c.promoCode} icon="pricetag-outline" value={form.code} onChangeText={set('code')} placeholder="WELCOME10" maxLength={16} />
      <Field label={c.promoAmount} keyboardType="number-pad" value={form.amount} onChangeText={set('amount')} maxLength={3} />
      <Field label={c.promoMaxUses} keyboardType="number-pad" value={form.maxUses} onChangeText={set('maxUses')} maxLength={5} />
      <Field label={c.promoDays} keyboardType="number-pad" value={form.days} onChangeText={set('days')} maxLength={2} />
      <Txt variant="label" style={{ marginBottom: 6 }}>{c.promoFirstOnly}</Txt>
      <Choices items={[{ key: 'no', label: c.no }, { key: 'yes', label: c.yes }]} value={form.firstOrderOnly ? 'yes' : 'no'} onChange={k => setForm(f => ({ ...f, firstOrderOnly: k === 'yes' }))} />
      <ErrorText>{error}</ErrorText>
      {!!message && <View accessibilityLiveRegion="polite"><Txt variant="caption" style={{ marginBottom: 8 }}>{message}</Txt></View>}
      <Button title={c.promoCreate} icon="add-circle-outline" variant="soft" loading={busy} disabled={!form.code.trim()} onPress={create} />
    </View>
  </Card>;
}
