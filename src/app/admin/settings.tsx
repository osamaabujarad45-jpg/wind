import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { api, useApi } from '../../api';
import { fractionSettings, invalidSetting, typedNumber, type Settings, defaultSettings } from '../../model';
import { PasswordCard, useFormat } from '../../parts';
import { useSession } from '../../session';
import { Badge, Button, Card, Choices, confirm, ErrorText, Field, fill, haptic, Header, IconButton, ListGroup, Loading, palette, Row, Screen, Txt, useCopy } from '../../ui';
import { router } from 'expo-router';

const groups: { title: 'pricing' | 'discounts' | 'plans' | 'cashLimits' | 'shopTimers'; keys: (keyof Settings)[] }[] = [
  { title: 'pricing', keys: ['parcelPrice', 'parcelLarge', 'pickupPayPerKm', 'rideBase', 'ridePerKm', 'freightBase', 'freightPerKm', 'freightLarge', 'loadingHelp', 'perMinute', 'nightExtra'] },
  // sharedDiscount is not offered: pooling is off, so a shared fare never happens (the server refuses shared bookings).
  { title: 'discounts', keys: ['plusDiscount', 'commission', 'proCommission'] },
  { title: 'plans', keys: ['plusPrice', 'proPrice'] },
  { title: 'cashLimits', keys: ['driverCashCap', 'orderCashCeiling'] },
  // ADM-06: shown only while the shop line is on.
  { title: 'shopTimers', keys: ['shopAgreeLimit', 'shopAcceptMinutes', 'shopConsentMinutes', 'shopNoCaptainMinutes', 'shopDispatchLeadMinutes', 'shopHandoverMinutes'] },
];
const unitless = (key: keyof Settings) => key.endsWith('Minutes'); // the label names the unit

const toText = (settings: Settings) => Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, String(v)]));

type SettingsResponse = { settings: Omit<Settings, 'pickupPayPerKm'>; pickupPayPerKm: number };
const payrollSettings = ({ settings, pickupPayPerKm }: SettingsResponse): Settings => ({ ...settings, pickupPayPerKm });

export default function AdminSettings() {
  const { c } = useCopy();
  const { me } = useSession();
  const { data, error, reload } = useApi<SettingsResponse>('/me?payroll=1');
  // The form opens at once from the session's settings. Payroll arrives as a separate field older builds never see;
  // it fills untouched inputs in place, so a slow response cannot wipe what the admin already typed (R3-12).
  if (!data && !me?.settings) return <Screen><Header title={c.settings} /><Loading failed={!!error} onRetry={reload} /></Screen>;
  return <AdminSettingsForm initial={{ ...defaultSettings, ...(me?.settings ?? {}) }} payroll={data ?? null} />;
}

function AdminSettingsForm({ initial, payroll }: { initial: Settings; payroll: SettingsResponse | null }) {
  const { me, refresh, signOut, language, setLanguage } = useSession();
  const { c, err } = useCopy();
  const [values, setValues] = useState(() => toText(initial));
  // Keys this admin has typed into since the server last confirmed the form. Only these are reviewed and sent:
  // comparing text against the mount value would miss a reversal (12 → 10 looks unedited when 10 was loaded).
  const [touched, setTouched] = useState<Partial<Record<keyof Settings, true>>>({});
  // What the server last confirmed. A failed save clears it: a lost reply may hide a committed write,
  // so the next comparison reads /me first instead of trusting an old copy.
  const [baseline, setBaseline] = useState<Settings | null>(initial);
  const [busy, setBusy] = useState(false);
  const payrollApplied = useRef(false);
  const touchedRef = useRef(touched);
  // payrollSettings() is a new object every render; apply the first payload once, and only onto keys not yet typed.
  useEffect(() => {
    if (!payroll || payrollApplied.current) return;
    payrollApplied.current = true;
    const next = payrollSettings(payroll);
    const typed = touchedRef.current;
    setValues(current => {
      const merged = toText(next);
      for (const key of Object.keys(typed) as (keyof Settings)[]) merged[key] = current[key];
      return merged;
    });
    setBaseline(current => current ? next : current); // a failed save left this unknown: do not invent a baseline
  }, [payroll]);
  const inFlight = useRef(false); // a confirm built before this render must not send a second write
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [bad, setBad] = useState(''); // the setting the server would refuse: its own field says so

  // The write carries exactly the keys the admin reviewed, so a concurrent edit to any other key survives.
  // `expected` is the value each of those keys had in the review: the server refuses the write if another admin
  // has changed one of them since, so a review never overwrites a change it did not show.
  async function commit(patch: Record<string, number>, expected: Record<string, number>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      // The reply is the server's settings after this write: it becomes the comparison baseline.
      const saved = payrollSettings(await api<SettingsResponse>('/admin/settings?payroll=1', { ...patch, expected }, 'POST'));
      payrollApplied.current = true; // The save response supersedes the initial payroll request.
      setBaseline(saved);
      setValues(toText(saved));
      setTouched({});
      touchedRef.current = {};
      await refresh();
      haptic.success();
      setBad('');
      setMessage(c.saved);
    } catch (e) {
      setBaseline(null); // A lost reply may hide a committed change; refresh before comparing again.
      haptic.error();
      setError(err(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // After a failed save the last server state is unknown, so read /me directly. The session refresh
  // swallows network errors, which is why it cannot stand in for this read.
  async function currentSettings(): Promise<Settings> {
    if (baseline) return baseline;
    setBusy(true);
    try {
      const settings = payrollSettings(await api<SettingsResponse>('/me?payroll=1'));
      setBaseline(settings);
      return settings;
    } finally { setBusy(false); }
  }

  async function save() {
    if (busy || inFlight.current) return;
    setError('');
    setMessage('');
    // Catch it on the screen that can name the field, instead of letting the server
    // store a 0 or a mistyped 2000 that only shows up on the next customer's quote.
    const numbers = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim() ? typedNumber(v) : NaN]));
    const invalid = invalidSetting(numbers);
    if (invalid) {
      haptic.error();
      setBad(String(invalid));
      setError(fill(c.set_invalid, { field: c[`set_${invalid}`] }));
      return;
    }
    const before = await currentSettings().catch(e => { setError(err(e)); return null; });
    if (!before) return;
    // Only fields this admin edited, and only where the server differs, are shown and sent. A field left
    // alone never goes out, so another admin's edit to it survives even after a lost reply.
    const keys = (Object.keys(numbers) as (keyof Settings)[]).filter(key => touched[key] && numbers[key] !== before[key]);
    if (!keys.length) { setMessage(c.saved); return; }
    // Shown the way the field shows it (percent for rates, ₪ for money), so the review reads like the form.
    const shown = (key: keyof Settings, value: number) => fractionSettings.includes(key) ? `${Math.round(value * 100)}%` : unitless(key) ? String(value) : `${value} ₪`;
    const changes = keys.map(key => `${c[`set_${key}`]}: ${shown(key, before[key])} → ${shown(key, numbers[key])}`);
    const patch = Object.fromEntries(keys.map(key => [key, numbers[key]]));
    const expected = Object.fromEntries(keys.map(key => [key, before[key]]));
    confirm(fill(c.settingsReview, { changes: changes.join('\n') }), () => void commit(patch, expected), c.save, c.cancel);
  }

  return <Screen>
    <Header title={c.settings} right={<IconButton icon="trail-sign-outline" label={c.roads} tone="muted" onPress={() => router.push('/roads')} />} />
    {groups.filter(group => group.title !== 'shopTimers' || me?.capabilities?.enabledServices?.includes('shop')).map(group => <Card key={group.title}>
      <Txt variant="h2" style={{ marginBottom: 4 }}>{c[group.title]}</Txt>
      {group.title === 'discounts' && <Txt variant="caption" style={{ marginBottom: 10 }}>{c.percentNote}</Txt>}
      {group.keys.map(key => <Field key={key} keyboardType="decimal-pad" disabled={busy}
        label={`${c[`set_${key}`]}${fractionSettings.includes(key) ? ` (${Math.round(typedNumber(values[key]) * 100) || 0}%)` : unitless(key) ? '' : ' ₪'}`}
        error={bad === key ? fill(c.set_invalid, { field: c[`set_${key}`] }) : undefined}
        value={values[key]} onChangeText={text => { setValues(v => ({ ...v, [key]: text })); touchedRef.current = { ...touchedRef.current, [key]: true }; setTouched(touchedRef.current); setMessage(''); if (bad === key) setBad(''); }} />)}
    </Card>)}
    <Promos />
    <ErrorText>{error}</ErrorText>
    {!!message && <Txt center style={{ marginBottom: 10, fontWeight: '800' }}>{message}</Txt>}
    <View style={{ gap: 10 }}>
      <Button title={c.save} icon="save-outline" onPress={save} loading={busy} />
      <Button title={c.language} icon="language-outline" variant="soft" onPress={() => setLanguage(language === 'ar' ? 'en' : 'ar')} />
      <ListGroup><PasswordCard /></ListGroup>
      <Button title={c.logout} icon="log-out-outline" variant="outline" onPress={() => confirm(c.logoutConfirm, () => { void signOut().catch(e => setError(err(e))); }, c.logout, c.no)} />
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
  const [stopError, setStopError] = useState<{ id: number; message: string } | null>(null);
  const set = (key: keyof typeof blank) => (v: string) => { setForm(f => ({ ...f, [key]: v })); setError(''); setStopError(null); setMessage(''); };
  async function create() {
    setBusy(true); setError(''); setStopError(null); setMessage('');
    try {
      await api('/admin/promos', { code: form.code.trim(), amount: typedNumber(form.amount), maxUses: typedNumber(form.maxUses), days: typedNumber(form.days), firstOrderOnly: form.firstOrderOnly });
      haptic.success(); setForm(blank); setMessage(c.promoCreated); reload();
    } catch (e) { haptic.error(); setError(err(e)); } finally { setBusy(false); }
  }
  const stop = (p: Promo) => confirm(c.promoDeactivateConfirm, () => { setError(''); setStopError(null); api(`/admin/promos/${p.id}/deactivate`, {}).then(() => { haptic.success(); reload(); })
    .catch(e => setStopError({ id: p.id, message: err(e) })); }, c.promoDeactivate, c.no);
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
        {stopError?.id === p.id && <ErrorText>{stopError.message}</ErrorText>}
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
      <Button title={c.promoCreate} icon="add-circle-outline" variant="soft" loading={busy} disabled={!form.code.trim()} reason={c.promo_need_code} onPress={create} />
    </View>
  </Card>;
}
