// Road status: crowd-reported checkpoint conditions (SPEC-road-status.md). Everyone signed in reads it;
// active drivers and administrators report; administrators choose which checkpoints are listed.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AccessibilityInfo, View } from 'react-native';
import { api, useApi } from '../api';
import { cities, city, type CityId, type Road } from '../model';
import { useSession } from '../session';
import { Badge, Button, Card, confirm, Empty, ErrorText, Field, fill, haptic, Header, Loading, palette, Press, Row, Screen, Txt, useCopy } from '../ui';

const roadTone = { open: { bg: palette.olivePale, fg: palette.olive }, slow: { bg: palette.clayPale, fg: palette.clayInk }, closed: { bg: '#F6D9D4', fg: '#9A2A1C' } } as const;

export default function Roads() {
  const { me } = useSession();
  const { c, err, language, row } = useCopy();
  const { data, error, reload, setData } = useApi<Road[]>('/roads', 60_000);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState('');
  const [draft, setDraft] = useState<{ name: string; cities: CityId[] }>({ name: '', cities: [] });
  const [now, setNow] = useState(Date.now);
  useFocusEffect(useCallback(() => { // report ages stay current while the screen is open
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []));
  const isAdmin = me?.user.role === 'admin';
  const canReport = isAdmin || (me?.user.role === 'driver' && me.user.status === 'active');

  async function send(key: string, path: string, body: object, done?: string) {
    setBusy(key); setFailure('');
    try {
      setData(await api<Road[]>(path, body)); haptic.success();
      if (done) AccessibilityInfo.announceForAccessibility(done);
      return true;
    } catch (e) { haptic.error(); setFailure(err(e)); return false; } finally { setBusy(null); }
  }
  const ago = (ms: number) => { const m = Math.max(1, Math.round((now - ms) / 60_000)); return m < 60 ? fill(c.agoMinutes, { n: m }) : fill(c.agoHours, { n: Math.round(m / 60) }); };

  return <Screen onRefresh={reload}>
    <Header title={c.roads} back />
    <Txt variant="caption" style={{ marginBottom: 12 }}>{c.roadsIntro}</Txt>
    <ErrorText>{(error && err(error)) || failure}</ErrorText>
    {canReport && <Field label={c.roadNote} value={note} onChangeText={setNote} maxLength={120} disabled={!!busy} />}
    {!data ? <Loading /> : data.length === 0 ? <Empty icon="trail-sign-outline" title={c.noRoads} body={isAdmin ? c.noRoadsAdmin : undefined} />
      : data.map(road => <Card key={road.id}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Txt variant="title">{road.name}</Txt>
            <Txt variant="caption">{road.cities.map(id => city(id)[language]).join(' · ')}</Txt>
          </View>
          <Badge label={road.status ? c[`road_${road.status}`] : c.roadUnknown} tone={road.status ? roadTone[road.status] : { bg: palette.muted, fg: palette.secondary }} />
        </Row>
        {road.reportedAt && <Txt variant="caption" style={{ marginTop: 6 }}>{`${ago(road.reportedAt)} · ${fill(c.roadAgreeing, { n: road.agreeing })}`}</Txt>}
        {!!road.note && <Txt style={{ marginTop: 4 }}>{road.note}</Txt>}
        {canReport && <Row gap={8} style={{ marginTop: 10, flexWrap: 'wrap' }}>
          {(['open', 'slow', 'closed'] as const).map(status => <View key={status} style={{ flexGrow: 1, flexBasis: 90 }}>
            <Button title={c[`road_${status}`]} variant={status === 'open' ? 'soft' : 'outline'} loading={busy === `${road.id}${status}`} disabled={!!busy}
              onPress={() => send(`${road.id}${status}`, `/roads/${road.id}/report`, { status, note: note.trim() }, c.roadReported).then(ok => ok && setNote(''))} />
          </View>)}
        </Row>}
        {isAdmin && <Button title={c.roadRemove} variant="ghost" size="sm" disabled={!!busy}
          onPress={() => confirm(fill(c.roadRemoveConfirm, { name: road.name }), () => send(`rm${road.id}`, `/admin/roads/${road.id}/remove`, {}))} />}
      </Card>)}

    {isAdmin && <Card tone="muted">
      <Txt variant="title" style={{ marginBottom: 8 }}>{c.roadAdd}</Txt>
      <Field label={c.roadName} value={draft.name} onChangeText={name => setDraft(d => ({ ...d, name }))} maxLength={80} disabled={!!busy} />
      <Txt variant="label" style={{ marginBottom: 6 }}>{c.roadCities}</Txt>
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {cities.map(item => {
          const on = draft.cities.includes(item.id);
          return <Press key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={item[language]}
            disabled={!on && draft.cities.length >= 3}
            onPress={() => setDraft(d => ({ ...d, cities: on ? d.cities.filter(x => x !== item.id) : [...d.cities, item.id] }))}
            style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, justifyContent: 'center', backgroundColor: on ? palette.forest : palette.card }}>
            <Txt variant="label" style={{ color: on ? '#FFFFFF' : palette.ink }}>{item[language]}</Txt>
          </Press>;
        })}
      </View>
      <Button title={c.roadAdd} icon="add-circle-outline" loading={busy === 'add'} disabled={!!busy || draft.name.trim().length < 3 || !draft.cities.length}
        onPress={() => send('add', '/admin/roads', { name: draft.name.trim(), cities: draft.cities }).then(ok => ok && setDraft({ name: '', cities: [] }))} />
    </Card>}
  </Screen>;
}
