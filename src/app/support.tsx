// Message Wind support in the app (SPEC-support-inbox.md, owner decision 22 Nov 2026). Open to every signed-in role.
// One conversation at a time: the server opens one on the first message and closes it when support is done.
// A draft keeps one request id until it is sent, so a resend after a lost reply is replayed, never posted twice.
import { useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, useApi } from '../api';
import { newRequestId } from '../command-id';
import { useFormat } from '../parts';
import { Button, Card, ErrorText, Field, fill, haptic, Header, Loading, palette, Press, Row, Screen, Txt, useCopy } from '../ui';

type Message = { id: number; fromStaff: boolean; mine: boolean; body: string; orderId: number | null; createdAt: number };
type Thread = { thread: { id: number; status: 'open' | 'closed'; orderId: number | null } | null; messages: Message[]; more: boolean };
const code = (id: number) => `W-${String(id).padStart(5, '0')}`;

export default function SupportScreen() {
  const { c, err, rtl } = useCopy();
  const { stamp } = useFormat();
  const params = useLocalSearchParams<{ order?: string }>();
  const orderId = params.order && /^\d+$/.test(params.order) ? Number(params.order) : undefined;
  const { data, error, reload, setData } = useApi<Thread>('/support/thread', 15_000);
  const [draft, setDraft] = useState('');
  const [attach, setAttach] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  // Earlier pages, kept apart from the polled latest page; they belong to one conversation.
  const [older, setOlder] = useState<{ thread: number; messages: Message[]; more: boolean } | null>(null);
  const requestId = useRef<string | null>(null);

  const thread = data?.thread ?? null;
  const linked = thread?.status === 'open' ? thread.orderId : null;
  // Offer the order from the help entry unless the open conversation is already about it.
  const offerOrder = orderId != null && linked !== orderId;
  const earlier = older && older.thread === thread?.id ? older : null;
  const latest = data?.messages ?? [];
  const shown = earlier ? [...earlier.messages.filter(m => !latest.some(l => l.id === m.id)), ...latest] : latest;
  const more = earlier ? earlier.more : !!data?.more;

  async function loadEarlier() {
    if (!thread || !shown.length) return;
    try {
      const page = await api<Thread>(`/support/thread?before=${shown[0]!.id}`);
      setOlder({ thread: thread.id, messages: [...page.messages, ...(earlier?.messages ?? [])], more: page.more });
    } catch (e) { setFailure(err(e)); }
  }

  async function send() {
    const sent = draft;
    const body = sent.trim();
    if (!body || busy) return;
    setBusy(true); setFailure('');
    requestId.current ??= newRequestId();
    const withOrder = offerOrder && attach;
    try {
      const reply = await api<Thread>('/support/messages', { body, requestId: requestId.current, ...(withOrder ? { orderId } : {}) });
      setData(reply);
      setDraft(current => current === sent ? '' : current); // keep anything typed while it was sending
      requestId.current = null;
      haptic.success();
    } catch (e) {
      haptic.error();
      // The order could not be linked (not one of theirs any more): untick it so Send goes through without it.
      // The request id stays: if the first send was saved after all, the resend replays it instead of posting twice.
      if (withOrder && (e as { status?: number })?.status === 404) { setAttach(false); setFailure(c.supportOrderDropped); }
      else setFailure(err(e)); // the draft and its request id stay: Send again replays safely
    } finally { setBusy(false); }
  }

  const composer = <View style={{ gap: 8 }}>
    {offerOrder && <Press accessibilityRole="checkbox" accessibilityState={{ checked: attach }} onPress={() => setAttach(!attach)} style={styles.attach}>
      <Row gap={8}>
        <View style={[styles.box, attach && styles.boxOn]}>{attach && <Txt variant="micro" style={{ color: palette.onFill }}>✓</Txt>}</View>
        <Txt variant="label" style={{ flex: 1 }}>{fill(c.supportAttachOrder, { order: code(orderId) })}</Txt>
      </Row>
    </Press>}
    <Field label={c.supportMessage} value={draft} onChangeText={value => { setDraft(value); requestId.current = null; }} placeholder={c.supportPlaceholder} multiline maxLength={1000} />
    <Button title={c.supportSend} icon="send" onPress={send} loading={busy} disabled={!draft.trim()} />
    <ErrorText>{failure}</ErrorText>
  </View>;

  return <Screen onRefresh={reload} footer={composer}>
    <Header title={c.supportInbox} back />
    <Txt style={{ marginBottom: 12 }}>{c.supportIntro}</Txt>
    {linked != null && <Txt variant="caption" style={{ marginBottom: 8 }}>{fill(c.supportAboutOrder, { order: code(linked) })}</Txt>}
    {!data ? (error ? <ErrorText>{err(error)}</ErrorText> : <Loading />) : <Card>
      {more && <Button title={c.supportEarlier} variant="ghost" size="sm" onPress={loadEarlier} />}
      {shown.length === 0 ? <Txt variant="caption">{c.supportEmpty}</Txt> : <View style={{ gap: 8 }}>
        {shown.map(m => <View key={m.id} accessible style={[styles.bubble, {
          alignSelf: m.mine === rtl ? 'flex-start' : 'flex-end', backgroundColor: m.mine ? palette.olivePale : palette.muted }]}>
          {m.fromStaff && <Txt variant="micro" style={{ color: palette.olive }}>{c.supportFromWind}</Txt>}
          {m.orderId != null && m.orderId !== thread?.orderId && <Txt variant="micro">{fill(c.supportAboutOrder, { order: code(m.orderId) })}</Txt>}
          <Txt selectable style={{ color: palette.ink }}>{m.body}</Txt>
          <Txt variant="micro">{stamp(m.createdAt)}</Txt>
        </View>)}
      </View>}
      {thread?.status === 'closed' && <Txt variant="caption" style={{ marginTop: 10 }}>{c.supportClosedNote}</Txt>}
    </Card>}
    <Button title={c.supportOtherWays} variant="ghost" icon="call-outline" onPress={() => router.push('/help')} />
  </Screen>;
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '85%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  attach: { minHeight: 44, justifyContent: 'center' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: palette.field, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: palette.forest, borderColor: palette.forest },
});
