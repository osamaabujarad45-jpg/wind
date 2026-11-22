// Wind Control · Support (SPEC-support-inbox.md): every conversation people start in the app, with the person and their
// order beside it, a reply box, close/reopen, and tags that roll up into improvements. On a desktop (WideContext) the
// list and the open conversation sit side by side; on a phone the conversation replaces the list until Back.
import { useContext, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, useApi } from '../../api';
import { newRequestId } from '../../command-id';
import { city, isCity } from '../../model';
import { useFormat } from '../../parts';
import {
  Badge, Button, Card, Empty, ErrorText, Field, FilterChips, fill, haptic, Header, Loading, Press, Row, Screen, Txt, useCopy, WideContext,
} from '../../ui';
import { themedStyles, useTheme } from '../../theme-context';

const TAGS = ['checkpoints', 'eta', 'pricing', 'captain', 'app_bug', 'payment', 'safety', 'other'] as const;
type Tag = typeof TAGS[number];
type Person = { id: number; name: string; role: string; phone: string; orders?: number };
type Message = { id: number; fromStaff: boolean; mine: boolean; body: string; orderId: number | null; createdAt: number };
type Row_ = { id: number; status: 'open' | 'closed'; orderId: number | null; tags: Tag[]; updatedAt: number; person: Person; waiting: boolean;
  order: { id: number; service: string; status: string; from: string; to: string } | null;
  last: { body: string; fromStaff: boolean; createdAt: number } | null };
type Detail = { id: number; status: 'open' | 'closed'; orderId: number | null; tags: Tag[]; person: Person; messages: Message[]; more: boolean;
  order: { id: number; service: string; status: string; from: string; to: string; captain: string | null } | null };
const code = (id: number) => `W-${String(id).padStart(5, '0')}`;

export default function AdminSupport() {
  const { palette, tones } = useTheme();
  const styles = useStyles();
  const { c, err, row, rtl, language } = useCopy();
  const wide = useContext(WideContext);
  const town = (place: string) => isCity(place) ? city(place)[language] : place;
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [tag, setTag] = useState<Tag | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const query = `status=${status}${tag ? `&tag=${tag}` : ''}`;
  // "More conversations" widens one window (100 more each time) that every poll re-reads whole; each filter keeps its own.
  const [limits, setLimits] = useState<Record<string, number>>({});
  const limit = limits[query] ?? 100;
  const list = useApi<Row_[]>(`/admin/support?${query}&limit=${limit}`, 20_000);
  // While a wider window loads, keep showing the rows already on screen for this filter instead of a spinner.
  const [kept, setKept] = useState<{ query: string; rows: Row_[]; limit: number } | null>(null);
  const held = kept?.query === query ? kept : null;
  const rows = list.data ?? held?.rows ?? null;
  // Judged on the window actually on screen: a failed wider load keeps the button, and a retry asks for the same page again.
  const shownLimit = list.data ? limit : held?.limit ?? limit;
  const full = !!rows && rows.length === shownLimit;
  const loadMore = () => {
    if (rows) setKept({ query, rows, limit: shownLimit });
    setLimits(current => ({ ...current, [query]: shownLimit + 100 }));
  };
  // Improvements: what people raised in conversations active over the last 30 days. A theme filters the list.
  const themes = useApi<{ tag: Tag; count: number }[]>(`/admin/support/tags?status=${status}`, 60_000);

  const inbox = <View>
    <FilterChips label={c.supportInbox} value={status} onChange={value => { setStatus(value); setTag(null); setSelected(null); }}
      items={[{ key: 'open', label: c.supportOpen }, { key: 'closed', label: c.supportClosed }]} />
    {(tag != null || !!themes.data?.some(t => t.count > 0)) && <View style={{ gap: 6, marginBottom: 10 }}>
      <Txt variant="label">{status === 'open' ? c.supportImprovements : c.supportImprovementsClosed}</Txt>
      {/* the active theme stays as a chip even when its count drops to zero, so the filter can always be cleared */}
      <Row gap={6} style={{ flexWrap: 'wrap' }}>{(themes.data ?? []).filter(t => t.count > 0 || t.tag === tag).map(t => <Press key={t.tag} accessibilityRole="checkbox"
        accessibilityState={{ checked: tag === t.tag }} onPress={() => { setTag(tag === t.tag ? null : t.tag); setSelected(null); }}
        style={[styles.tag, tag === t.tag && styles.tagOn]}>
        <Txt variant="label" style={{ color: tag === t.tag ? palette.onFill : palette.ink }}>{`${c[`tag_${t.tag}`]} · ${t.count}`}</Txt>
      </Press>)}</Row>
    </View>}
    {!rows ? (list.error ? <ErrorText>{err(list.error)}</ErrorText> : <Loading />)
      : rows.length === 0 ? <Empty icon="chatbubbles-outline" title={c.supportNone} />
      : <View style={{ gap: 8 }}>{list.error && !list.data && <ErrorText>{err(list.error)}</ErrorText>}{rows.map(t => <Press key={t.id} onPress={() => setSelected(t.id)} accessibilityRole="button"
        accessibilityLabel={[t.person.name, t.waiting ? c.supportWaiting : null, t.id === selected ? c.supportSelected : null, t.last?.body].filter(Boolean).join('. ')}
        style={[styles.row, t.id === selected && styles.rowOn]}>
        <Row gap={8} style={{ justifyContent: 'space-between' }}>
          <Txt variant="title" numberOfLines={1} style={{ flex: 1 }}>{t.person.name}</Txt>
          {t.waiting && <Badge label={c.supportWaiting} tone={tones.warn} icon="time-outline" />}
        </Row>
        <Txt variant="micro">{[c[t.person.role as 'customer'] ?? t.person.role,
          t.order ? `${code(t.order.id)} · ${town(t.order.from)} ${rtl ? '←' : '→'} ${town(t.order.to)}` : null].filter(Boolean).join(' · ')}</Txt>
        {t.last && <Txt variant="caption" numberOfLines={2}>{t.last.body}</Txt>}
      </Press>)}
      {full && (shownLimit < 1000 ? <Button title={c.supportMoreConversations} variant="ghost" size="sm" onPress={loadMore} />
        : <Txt variant="caption">{c.supportListCap}</Txt>)}</View>}
  </View>;

  const changed = async () => { await Promise.all([list.reload(), themes.reload()]); };
  const conversation = selected != null && <Conversation key={selected} id={selected} onBack={wide ? undefined : () => setSelected(null)} onChanged={changed} />;

  if (wide) return <Screen onRefresh={changed}>
    <Header title={c.supportInbox} />
    <View style={[styles.split, { flexDirection: row }]}>
      <View style={styles.listPane}>{inbox}</View>
      <View style={styles.threadPane}>{conversation || <Card tone="muted"><Txt>{c.supportNone}</Txt></Card>}</View>
    </View>
  </Screen>;
  return <Screen onRefresh={changed}>
    {conversation || <><Header title={c.supportInbox} />{inbox}</>}
  </Screen>;
}

function Conversation({ id, onBack, onChanged }: { id: number; onBack?: () => void; onChanged: () => unknown }) {
  const { palette } = useTheme();
  const styles = useStyles();
  const { c, err, rtl, language } = useCopy();
  const { stamp } = useFormat();
  const { data, error, setData, reload } = useApi<Detail>(`/admin/support/${id}`, 15_000);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState('');
  const [older, setOlder] = useState<{ messages: Message[]; more: boolean } | null>(null);
  const requestId = useRef<string | null>(null);
  const town = (place: string) => isCity(place) ? city(place)[language] : place;

  async function act(name: string, path: string, body: object = {}) {
    setBusy(name); setFailure('');
    try { setData(await api<Detail>(path, body)); haptic.success(); onChanged(); return true; }
    catch (e) {
      haptic.error(); setFailure(err(e));
      if ((e as { status?: number })?.status === 409) void reload(); // a new message or a newer conversation: show it now
      return false;
    }
    finally { setBusy(null); }
  }
  async function reply() {
    const sent = draft;
    const body = sent.trim();
    if (!body) return;
    requestId.current ??= newRequestId();
    if (await act('reply', `/admin/support/${id}/reply`, { body, requestId: requestId.current })) {
      requestId.current = null;
      setDraft(current => current === sent ? '' : current); // keep anything typed while it was sending
    }
  }
  // A quick reply fills the box to check and adjust before sending; it never claims something on its own.
  const quick = (text: string) => { setDraft(text); requestId.current = null; };
  const toggleTag = (tag: Tag) => data && act('tags', `/admin/support/${id}/tags`,
    { tags: data.tags.includes(tag) ? data.tags.filter(t => t !== tag) : [...data.tags, tag] });

  if (!data) return error ? <ErrorText>{err(error)}</ErrorText> : <Loading />;
  const latest = data.messages;
  const shown = older ? [...older.messages.filter(m => !latest.some(l => l.id === m.id)), ...latest] : latest;
  const more = older ? older.more : data.more;
  async function loadEarlier() {
    if (!shown.length) return;
    try {
      const page = await api<Detail>(`/admin/support/${id}?before=${shown[0]!.id}`);
      setOlder({ messages: [...page.messages, ...(older?.messages ?? [])], more: page.more });
    } catch (e) { setFailure(err(e)); }
  }
  return <View style={{ gap: 12 }}>
    <Header title={data.person.name} subtitle={`${c[data.person.role as 'customer'] ?? data.person.role} · ${fill(c.supportOrders, { n: data.person.orders ?? 0 })}`} back={false}
      right={onBack && <Button title={c.back} variant="ghost" size="sm" onPress={onBack} />} />
    <Txt variant="label" selectable style={{ writingDirection: 'ltr', textAlign: rtl ? 'right' : 'left' }}>{data.person.phone}</Txt>
    {data.order && <Card tone="muted">
      <Row gap={8} style={{ justifyContent: 'space-between' }}>
        <Txt variant="title" style={{ flex: 1 }}>{code(data.order.id)} · {town(data.order.from)} {rtl ? '←' : '→'} {town(data.order.to)}</Txt>
        <Badge label={c[data.order.status as 'completed'] ?? data.order.status} status={data.order.status as never} />
      </Row>
      {data.order.captain && <Txt variant="caption">{data.order.captain}</Txt>}
    </Card>}
    <Card>
      {more && <Button title={c.supportEarlier} variant="ghost" size="sm" onPress={loadEarlier} />}
      <View style={{ gap: 8 }}>{shown.map(m => <View key={m.id} accessible style={[styles.bubble, {
        alignSelf: m.fromStaff === rtl ? 'flex-start' : 'flex-end', backgroundColor: m.fromStaff ? palette.olivePale : palette.muted }]}>
        {m.fromStaff && <Txt variant="micro" style={{ color: palette.olive }}>{c.supportFromWind}</Txt>}
        {m.orderId != null && m.orderId !== data.orderId && <Txt variant="micro">{fill(c.supportAboutOrder, { order: code(m.orderId) })}</Txt>}
        <Txt selectable style={{ color: palette.ink }}>{m.body}</Txt>
        <Txt variant="micro">{stamp(m.createdAt)}</Txt>
      </View>)}</View>
    </Card>
    <Row gap={8} style={{ flexWrap: 'wrap' }}>
      <Button title={c.supportQuickDelay} variant="outline" size="sm" disabled={!!busy} onPress={() => quick(c.supportQuickDelayText)} />
      <Button title={c.supportQuickCall} variant="outline" size="sm" disabled={!!busy} onPress={() => quick(c.supportQuickCallText)} />
    </Row>
    <Field label={c.supportReply} value={draft} onChangeText={value => { setDraft(value); requestId.current = null; }} placeholder={c.supportReplyPlaceholder} multiline maxLength={1000} />
    <Row gap={8}>
      <View style={{ flex: 1 }}><Button title={c.supportSend} icon="send" loading={busy === 'reply'} disabled={!draft.trim() || !!busy} onPress={reply} /></View>
      {data.status === 'open'
        ? <Button title={c.supportClose} variant="outline" icon="checkmark" loading={busy === 'close'} disabled={!!busy}
          onPress={() => act('close', `/admin/support/${id}/close`, { seen: latest.at(-1)?.id ?? 0 })} />
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

const useStyles = themedStyles(palette => StyleSheet.create({
  split: { gap: 16, alignItems: 'flex-start' },
  listPane: { width: 340 },
  threadPane: { flex: 1, minWidth: 0 },
  row: { backgroundColor: palette.card, borderRadius: 14, padding: 12, gap: 2, minHeight: 44 },
  rowOn: { backgroundColor: palette.olivePale },
  bubble: { maxWidth: '85%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  tag: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: palette.field, backgroundColor: palette.card, justifyContent: 'center' },
  tagOn: { backgroundColor: palette.forest, borderColor: palette.forest },
}));
