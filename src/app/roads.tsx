// Road status: crowd-reported checkpoint conditions (SPEC-road-status.md). Everyone signed in reads it;
// active drivers and administrators report; administrators choose which checkpoints are listed.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AccessibilityInfo, View } from 'react-native';
import { api, useApi } from '../api';
import { cities, city, type CityId, type Point, type Road } from '../model';
import PinSheet from '../pin-sheet';
import { canPin } from '../route-map';
import { useSession } from '../session';
import { Badge, Button, Card, confirm, Empty, ErrorText, Field, fill, haptic, Header, Loading, palette, Press, Row, Screen, Txt, useCopy } from '../ui';

const roadTone = { open: { bg: palette.olivePale, fg: palette.olive }, slow: { bg: palette.clayPale, fg: palette.clayInk }, closed: { bg: palette.errorPale, fg: palette.error } } as const;

export default function Roads() {
  const { me } = useSession();
  const { c, err, language, row } = useCopy();
  const { data, error, reload, setData } = useApi<Road[]>('/roads', 60_000);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState('');
  const [draft, setDraft] = useState<{ name: string; cities: CityId[]; point?: Point }>({ name: '', cities: [] });
  // Pin sheet: an existing checkpoint (its id) or the new one being added ('draft').
  const [pinFor, setPinFor] = useState<{ id: number | 'draft'; start: Point } | null>(null);
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
  const ago = (ms: number) => { const m = Math.max(1, Math.round((now - ms) / 60_000)); return m < 60 ? fill(c.agoMinutes, { n: m }) : fill(c.agoHours, { n: Math.floor(m / 60) }); };

  return <Screen onRefresh={reload}>
    <Header title={c.roads} back />
    <Txt variant="caption" style={{ marginBottom: 12 }}>{c.roadsIntro}</Txt>
    <ErrorText>{(error && err(error)) || failure}</ErrorText>
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
            <Button title={fill(c.roadReportAs, { s: c[`road_${status}`] })} label={fill(c.roadReportLabel, { name: road.name, s: c[`road_${status}`] })}
              variant={status === 'open' ? 'soft' : 'outline'} loading={busy === `${road.id}${status}`} disabled={!!busy}
              onPress={() => send(`${road.id}${status}`, `/roads/${road.id}/report`, { status }, c.roadReported)} />
          </View>)}
        </Row>}
        {isAdmin && <Txt variant="caption" style={{ marginTop: 8, color: road.point ? palette.olive : palette.clayInk }}>{road.point ? c.roadPlaced : c.roadUnplaced}</Txt>}
        {isAdmin && canPin && <Button title={road.point ? c.roadMove : c.roadPlace} icon="location-outline" variant="ghost" size="sm" disabled={!!busy}
          loading={busy === `pin${road.id}`} onPress={() => setPinFor({ id: road.id, start: road.point ?? city(road.cities[0]) })} />}
        {isAdmin && <Button title={c.roadRemove} variant="ghost" size="sm" disabled={!!busy}
          onPress={() => confirm(fill(c.roadRemoveConfirm, { name: road.name }), () => send(`rm${road.id}`, `/admin/roads/${road.id}/remove`, {}, c.roadRemoved))} />}
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
      {canPin && <Button title={draft.point ? c.roadMove : c.roadPlace} icon="location-outline" variant="soft" disabled={!!busy || !draft.cities.length}
        onPress={() => setPinFor({ id: 'draft', start: draft.point ?? city(draft.cities[0]) })} />}
      {!!draft.point && <Txt variant="caption" style={{ marginBottom: 8, color: palette.olive }}>{c.roadPlaced}</Txt>}
      <Button title={c.roadAdd} icon="add-circle-outline" loading={busy === 'add'} disabled={!!busy || draft.name.trim().length < 3 || !draft.cities.length}
        onPress={() => send('add', '/admin/roads', { name: draft.name.trim(), cities: draft.cities, ...(draft.point && { point: draft.point }) })
          .then(ok => ok && setDraft({ name: '', cities: [] }))} />
    </Card>}
    {pinFor && <PinSheet title={c.roadPinTitle} hint={c.roadPinHint} start={pinFor.start} onClose={() => setPinFor(null)} onConfirm={point => {
      const target = pinFor.id;
      setPinFor(null);
      if (target === 'draft') setDraft(d => ({ ...d, point }));
      else void send(`pin${target}`, `/admin/roads/${target}/place`, { point }, c.roadPlaceDone);
    }} />}
  </Screen>;
}
