import { useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { api, useApi } from './api';
import type { Copy } from './copy';
import { hhmm, minuteFromText, type Merchant } from './model';
import { useSession } from './session';
import { Button, Card, ErrorText, Field, fill, Loading, Row, Section, Stat, Txt, useCopy } from './ui';

type Statement = {
  balanceAgorot: number;
  payableAgorot: number;
  entries: { id: number; orderId: number | null; kind: string; amountAgorot: number; reference: string | null }[];
};
type MerchantSettingsProps = { merchant: Merchant; reload: () => Promise<unknown> };

export function merchantStatus(merchant: Merchant, c: Copy) {
  if (merchant.status === 'pending') return c.merchantPending;
  if (merchant.status === 'paused') return c.merchantLicencePaused;
  if (merchant.pausedNew) return c.merchantPausedNew;
  return merchant.open ? c.shopOpen : c.shopClosed;
}

export function MerchantControls({ merchant, reload }: MerchantSettingsProps) {
  const { me } = useSession();
  const { c, err } = useCopy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shopProfile = me?.accountProfile?.mode === 'shop';

  async function togglePause() {
    setBusy(true); setError('');
    try { await api('/merchant/settings', { paused: !merchant.pausedNew }); await reload(); }
    catch (error) { setError(err(error)); }
    finally { setBusy(false); }
  }

  return <>
    <Button title={merchant.pausedNew ? shopProfile ? c.merchantOpenForOrders : c.merchantResume : c.merchantPause}
      variant={merchant.pausedNew ? 'primary' : 'outline'} loading={busy} onPress={togglePause} />
    <Txt variant="caption" style={{ marginTop: 4, marginBottom: 12 }}>{c.merchantPauseHint}</Txt>
    <ErrorText>{error}</ErrorText>
  </>;
}

export function MerchantHours({ merchant, reload }: MerchantSettingsProps) {
  const [saved, setSaved] = useState(false);
  return <HoursEditor key={JSON.stringify(merchant.hours)} merchant={merchant} saved={saved} onSaved={done => {
    setSaved(done);
    if (done) void reload();
  }} />;
}

function HoursEditor({ merchant, saved, onSaved }: { merchant: Merchant; saved: boolean; onSaved: (done: boolean) => void }) {
  const { c, err } = useCopy();
  const { me } = useSession();
  const first = merchant.hours[0];
  const uniform = !merchant.hours.length || (merchant.hours.length === 7 && new Set(merchant.hours.map(h => h.weekday)).size === 7
    && merchant.hours.every(h => h.openMinute === first.openMinute && h.closeMinute === first.closeMinute));
  const [opens, setOpens] = useState(first ? hhmm(first.openMinute) : '');
  const [closes, setCloses] = useState(first ? hhmm(first.closeMinute) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = minuteFromText(opens), close = minuteFromText(closes);
  const empty = !opens.trim() && !closes.trim();
  const shopProfile = me?.accountProfile?.mode === 'shop';
  const ok = empty ? !shopProfile : (open < 1440 && close >= 0 && open !== close);

  async function save() {
    setBusy(true); setError(''); onSaved(false);
    try {
      await api('/merchant/settings', { hours: empty ? [] : [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, openMinute: open, closeMinute: close })) });
      onSaved(true);
      if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(c.saved);
    } catch (error) { setError(err(error)); }
    finally { setBusy(false); }
  }

  const edit = (set: (value: string) => void) => (value: string) => { set(value); if (saved) onSaved(false); };
  return <Card>
    <Section title={c.merchantHours} />
    <Field label={c.merchantOpens} value={opens} onChangeText={edit(setOpens)} keyboardType="decimal-pad" maxLength={5} />
    <Field label={c.merchantCloses} value={closes} onChangeText={edit(setCloses)} keyboardType="decimal-pad" maxLength={5} onSubmitEditing={ok && !busy ? save : undefined} />
    <Txt variant="caption">{shopProfile ? c.merchantProfileHoursHint : c.merchantHoursHint}</Txt>
    {!uniform && <Txt variant="caption" style={{ marginTop: 4 }}>{c.merchantHoursReplace}</Txt>}
    <Button title={c.merchantSaveHours} size="sm" variant="outline" loading={busy} disabled={!ok} reason={ok ? undefined : c.merchantHoursBad} onPress={save} />
    {saved && <Txt variant="caption" center style={{ marginTop: 6 }}>{c.saved}</Txt>}
    <ErrorText>{error}</ErrorText>
  </Card>;
}

export function useMerchantStatement(enabled: boolean) {
  return useApi<Statement>(enabled ? '/merchant/statement' : null);
}

export function MerchantStatement({ data, error, reload }: ReturnType<typeof useMerchantStatement>) {
  const { c, money, err } = useCopy();
  if (!data) return <Loading failed={!!error} onRetry={reload} />;
  return <>
    <Stat label={c.merchantBalance} value={money(data.balanceAgorot / 100)} index={1}
      detail={fill(c.merchantPayable, { r: money(data.payableAgorot / 100) })} />
    {!!error && <ErrorText>{err(error)}</ErrorText>}
    {!!data.entries.length && <Card>
      <Section title={c.merchantStatement} />
      {data.entries.slice(0, 20).map(e => <Row key={e.id} style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
        <Txt variant="caption" style={{ flex: 1 }}>{[
          (c as Record<string, string>)[`ledger_${e.kind}`] ?? e.kind, e.orderId && `W-${String(e.orderId).padStart(5, '0')}`, e.reference,
        ].filter(Boolean).join(' · ')}</Txt>
        <Txt variant="caption" style={{ writingDirection: 'ltr' }}>{money(e.amountAgorot / 100)}</Txt>
      </Row>)}
    </Card>}
  </>;
}
