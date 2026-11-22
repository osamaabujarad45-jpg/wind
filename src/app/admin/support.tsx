// Wind Control · Support (SPEC-support-inbox.md): every conversation people start in the app, with the person and their
// order beside it, a reply box, close/reopen, and tags that roll up into improvements. On a desktop (WideContext) the
// list and the open conversation sit side by side; on a phone the conversation replaces the list until Back.
import { useContext, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, useApi } from '../../api';
import { newRequestId } from '../../command-id';
import { useFormat } from '../../parts';
import {
  Badge, Button, Card, Empty, ErrorText, Field, FilterChips, fill, haptic, Header, Loading, palette, Press, Row, Screen, tones, Txt, useCopy, WideContext,
} from '../../ui';

const TAGS = ['checkpoints', 'eta', 'pricing', 'captain', 'app_bug', 'payment', 'safety', 'other'] as const;
type Tag = typeof TAGS[number];
type Person = { id: number; name: string; role: string; phone: string; orders?: number };
type Message = { id: number; fromStaff: boolean; mine: boolean; body: string; createdAt: number };
type Row_ = { id: number; status: 'open' | 'closed'; orderId: number | null; tags: Tag[]; updatedAt: number; person: Person; waiting: boolean;
  last: { body: string; fromStaff: boolean; createdAt: number } | null };
type Detail = { id: number; status: 'open' | 'closed'; tags: Tag[]; person: Person; messages: Message[];
  order: { id: number; service: string; status: string; from: string; to: string; captain: string | null } | null };
const code = (id: number) => `W-${String(id).padStart(5, '0')}`;

export default function AdminSupport() {
  const { c, err, row } = useCopy();
  const wide = useContext(WideContext);
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [selected, setSelected] = useState<number | null>(null);
  const list = useApi<Row_[]>(`/admin/support?status=${status}`, 20_000);

  const inbox = <View>
    <FilterChips label={c.supportInbox} value={status} onChange={value => { setStatus(value); setSelected(null); }}
      items={[{ key: 'open', label: c.supportOpen }, { key: 'closed', label: c.supportClosed }]} />
    {!list.data ? (list.error ? <ErrorText>{err(list.error)}</ErrorText> : <Loading />)
      : list.data.length === 0 ? <Empty icon="chatbubbles-outline" title={c.supportNone} />
      : <View style={{ gap: 8 }}>{list.data.map(t => <Press key={t.id} onPress={() => setSelected(t.id)}
        accessibilityLabel={`${t.person.name}. ${t.last?.body ?? ''}`} style={[styles.row, t.id === selected && styles.rowOn]}>
        <Row gap={8} style={{ justifyContent: 'space-between' }}>
          <Txt variant="title" numberOfLines={1} style={{ flex: 1 }}>{t.person.name}</Txt>
          {t.waiting && <Badge label={c.supportWaiting} tone={tones.warn} icon="time-outline" />}
        </Row>
        <Txt variant="micro">{[c[t.person.role as 'customer'] ?? t.person.role, t.orderId != null ? code(t.orderId) : null].filter(Boolean).join(' · ')}</Txt>
        {t.last && <Txt variant="caption" numberOfLines={2}>{t.last.body}</Txt>}
      </Press>)}</View>}
  </View>;

  const conversation = selected != null && <Conversation key={selected} id={selected} onBack={wide ? undefined : () => setSelected(null)} onChanged={list.reload} />;

  if (wide) return <Screen onRefresh={list.reload}>
    <Header title={c.supportInbox} />
    <View style={[styles.split, { flexDirection: row }]}>
      <View style={styles.listPane}>{inbox}</View>
      <View style={styles.threadPane}>{conversation || <Card tone="muted"><Txt>{c.supportNone}</Txt></Card>}</View>
    </View>
  </Screen>;
  return <Screen onRefresh={list.reload}>
    {conversation || <><Header title={c.supportInbox} />{inbox}</>}
  </Screen>;
}

function Conversation({ id, onBack, onChanged }: { id: number; onBack?: () => void; onChanged: () => unknown }) {
  const { c, err, rtl } = useCopy();
  const { stamp } = useFormat();
  const { data, error, setData } = useApi<Detail>(`/admin/support/${id}`, 15_000);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState('');
  const requestId = useRef<string | null>(null);

  async function act(name: string, path: string, body: object = {}) {
    setBusy(name); setFailure('');
    try { setData(await api<Detail>(path, body)); haptic.success(); onChanged(); return true; }
    catch (e) { haptic.error(); setFailure(err(e)); return false; }
    finally { setBusy(null); }
  }
  async function reply(text = draft) {
    const body = text.trim();
    if (!body) return;
    requestId.current ??= newRequestId();
    if (await act('reply', `/admin/support/${id}/reply`, { body, requestId: requestId.current })) { requestId.current = null; if (text === draft) setDraft(''); }
  }
  const toggleTag = (tag: Tag) => data && act('tags', `/admin/support/${id}/tags`,
    { tags: data.tags.includes(tag) ? data.tags.filter(t => t !== tag) : [...data.tags, tag] });

  if (!data) return error ? <ErrorText>{err(error)}</ErrorText> : <Loading />;
  return <View style={{ gap: 12 }}>
    <Header title={data.person.name} subtitle={`${c[data.person.role as 'customer'] ?? data.person.role} · ${fill(c.supportOrders, { n: data.person.orders ?? 0 })}`} back={false}
      right={onBack && <Button title={c.back} variant="ghost" size="sm" onPress={onBack} />} />
    <Txt variant="label" selectable style={{ writingDirection: 'ltr', textAlign: rtl ? 'right' : 'left' }}>{data.person.phone}</Txt>
    {data.order && <Card tone="muted">
      <Row gap={8} style={{ justifyContent: 'space-between' }}>
        <Txt variant="title">{code(data.order.id)} · {data.order.from} → {data.order.to}</Txt>
        <Badge label={c[data.order.status as 'completed'] ?? data.order.status} status={data.order.status as never} />
      </Row>
      {data.order.captain && <Txt variant="caption">{data.order.captain}</Txt>}
    </Card>}
    <Card>
      <View style={{ gap: 8 }}>{data.messages.map(m => <View key={m.id} style={[styles.bubble, {
        alignSelf: m.fromStaff === rtl ? 'flex-start' : 'flex-end', backgroundColor: m.fromStaff ? palette.olivePale : palette.muted }]}>
        {m.fromStaff && <Txt variant="micro" style={{ color: palette.olive }}>{c.supportFromWind}</Txt>}
        <Txt selectable style={{ color: palette.ink }}>{m.body}</Txt>
        <Txt variant="micro">{stamp(m.createdAt)}</Txt>
      </View>)}</View>
    </Card>
    <Row gap={8} style={{ flexWrap: 'wrap' }}>
      <Button title={c.supportQuickDelay} variant="outline" size="sm" disabled={!!busy} onPress={() => reply(c.supportQuickDelayText)} />
      <Button title={c.supportQuickCall} variant="outline" size="sm" disabled={!!busy} onPress={() => reply(c.supportQuickCallText)} />
    </Row>
    <Field label={c.supportReply} value={draft} onChangeText={value => { setDraft(value); requestId.current = null; }} placeholder={c.supportReplyPlaceholder} multiline maxLength={1000} />
    <Row gap={8}>
      <View style={{ flex: 1 }}><Button title={c.supportSend} icon="send" loading={busy === 'reply'} disabled={!draft.trim() || !!busy} onPress={() => reply()} /></View>
      {data.status === 'open'
        ? <Button title={c.supportClose} variant="outline" icon="checkmark" loading={busy === 'close'} disabled={!!busy} onPress={() => act('close', `/admin/support/${id}/close`)} />
        : <Button title={c.supportReopen} variant="outline" loading={busy === 'reopen'} disabled={!!busy} onPress={() => act('reopen', `/admin/support/${id}/reopen`)} />}
    </Row>
    <ErrorText>{failure}</ErrorText>
    <Txt variant="label">{c.supportTags}</Txt>
    <Row gap={8} style={{ flexWrap: 'wrap' }}>{TAGS.map(tag => <Press key={tag} accessibilityRole="checkbox" accessibilityState={{ checked: data.tags.includes(tag) }}
      onPress={() => toggleTag(tag)} disabled={!!busy} style={[styles.tag, data.tags.includes(tag) && styles.tagOn]}>
      <Txt variant="label" style={{ color: data.tags.includes(tag) ? palette.onFill : palette.ink }}>{c[`tag_${tag}`]}</Txt>
    </Press>)}</Row>
  </View>;
}

const styles = StyleSheet.create({
  split: { gap: 16, alignItems: 'flex-start' },
  listPane: { width: 340 },
  threadPane: { flex: 1, minWidth: 0 },
  row: { backgroundColor: palette.card, borderRadius: 14, padding: 12, gap: 2, minHeight: 44 },
  rowOn: { backgroundColor: palette.olivePale },
  bubble: { maxWidth: '85%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  tag: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: palette.field, backgroundColor: palette.card, justifyContent: 'center' },
  tagOn: { backgroundColor: palette.forest, borderColor: palette.forest },
});
