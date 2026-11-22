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

type Message = { id: number; fromStaff: boolean; mine: boolean; body: string; createdAt: number };
type Thread = { thread: { id: number; status: 'open' | 'closed'; orderId: number | null } | null; messages: Message[] };

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
  const requestId = useRef<string | null>(null);

  const thread = data?.thread ?? null;
  const linked = thread?.status === 'open' ? thread.orderId : null;
  const offerOrder = orderId != null && linked == null;

  async function send() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true); setFailure('');
    requestId.current ??= newRequestId();
    try {
      const reply = await api<Thread>('/support/messages', { body, requestId: requestId.current, ...(offerOrder && attach ? { orderId } : {}) });
      setData(reply);
      setDraft('');
      requestId.current = null;
      haptic.success();
    } catch (e) {
      haptic.error();
      setFailure(err(e)); // the draft and its request id stay: Send again replays safely
    } finally { setBusy(false); }
  }

  const composer = <View style={{ gap: 8 }}>
    {offerOrder && <Press accessibilityRole="checkbox" accessibilityState={{ checked: attach }} onPress={() => setAttach(!attach)} style={styles.attach}>
      <Row gap={8}>
        <View style={[styles.box, attach && styles.boxOn]}>{attach && <Txt variant="micro" style={{ color: palette.onFill }}>✓</Txt>}</View>
        <Txt variant="label" style={{ flex: 1 }}>{fill(c.supportAttachOrder, { order: `W-${String(orderId).padStart(5, '0')}` })}</Txt>
      </Row>
    </Press>}
    <Field label={c.supportMessage} value={draft} onChangeText={value => { setDraft(value); requestId.current = null; }} placeholder={c.supportPlaceholder} multiline maxLength={1000} />
    <Button title={c.supportSend} icon="send" onPress={send} loading={busy} disabled={!draft.trim()} />
    <ErrorText>{failure}</ErrorText>
  </View>;

  return <Screen onRefresh={reload} footer={composer}>
    <Header title={c.supportInbox} back />
    <Txt style={{ marginBottom: 12 }}>{c.supportIntro}</Txt>
    {linked != null && <Txt variant="caption" style={{ marginBottom: 8 }}>{fill(c.supportAboutOrder, { order: `W-${String(linked).padStart(5, '0')}` })}</Txt>}
    {!data ? (error ? <ErrorText>{err(error)}</ErrorText> : <Loading />) : <Card>
      {data.messages.length === 0 ? <Txt variant="caption">{c.supportEmpty}</Txt> : <View style={{ gap: 8 }}>
        {data.messages.map(m => <View key={m.id} accessible style={[styles.bubble, {
          alignSelf: m.mine === rtl ? 'flex-start' : 'flex-end', backgroundColor: m.mine ? palette.olivePale : palette.muted }]}>
          {m.fromStaff && <Txt variant="micro" style={{ color: palette.olive }}>{c.supportFromWind}</Txt>}
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
