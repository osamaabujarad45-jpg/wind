// Help & support: FAQ, contact, privacy. Open to everyone, signed in or not (store requirement).
// /help?topic=password opens that answer directly (linked from "Forgot password?" on sign-in).
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from '../motion';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { PRIVACY_URL, SUPPORT_URL } from '../api';
import { ltr } from '../model';
import { InstallLink } from '../install-link';
import { useSession } from '../session';
import { Appear, Button, Card, Header, palette, Row, Screen, Txt, useCopy } from '../ui';

const topics = ['price', 'code', 'recipient', 'cancel', 'pay', 'password', 'driver', 'delete'] as const;
type Topic = typeof topics[number];

export default function Help() {
  const { topic, order } = useLocalSearchParams<{ topic?: string; order?: string }>();
  const { c } = useCopy();
  const { me } = useSession();
  // a customer's own account is never a driver's (each role signs up apart), so 'when is a driver account activated' was not their question
  const shown = me?.user.role === 'customer' ? topics.filter(t => t !== 'driver') : topics;
  // A topic the reader may not see (the driver question for a customer) opens nothing.
  const [open, setOpen] = useState<Topic | null>(topics.includes(topic as Topic) && (shown as readonly Topic[]).includes(topic as Topic) ? topic as Topic : null);
  const orderRef = typeof order === 'string' && /^W-\d+$/.test(order) ? order : undefined;

  return <Screen>
    <Header title={c.help} back />
    {orderRef && <Txt variant="caption" style={{ marginBottom: 8 }}>{c.receiptNo}: {ltr(orderRef)}</Txt>}

    {/* the button already says "contact support"; the titled card only frames the no-line note */}
    <Appear>
      {SUPPORT_URL
        ? <Button title={c.support} icon={SUPPORT_URL.startsWith('mailto:') ? 'mail-outline' : 'chatbubble-outline'} onPress={() => Linking.openURL(orderRef && SUPPORT_URL!.startsWith('https://wa.me/') ? `${SUPPORT_URL}?text=${encodeURIComponent(`${c.brand} · ${orderRef}`)}` : SUPPORT_URL!)} />
        : <Card tone="olive">
          <Row gap={12} style={{ marginBottom: 12 }}>
            <View style={styles.icon}><Ionicons name="chatbubbles-outline" size={22} color={palette.olive} /></View>
            <Txt variant="title" style={{ flex: 1 }}>{c.contactUs}</Txt>
          </Row>
          <Txt variant="caption">{c.noSupportLine}</Txt>
        </Card>}
    </Appear>

    <Txt variant="h2" style={{ marginVertical: 12 }}>{c.faq}</Txt>
    <Card style={{ paddingVertical: 4 }}>
      {shown.map((key, i) => {
        const expanded = open === key;
        return <Animated.View key={key} layout={LinearTransition.duration(200)} style={[styles.item, i === shown.length - 1 && { borderBottomWidth: 0 }]}>
          <Pressable accessibilityRole="button" aria-expanded={expanded} accessibilityLabel={c[`q_${key}`]}
            onPress={() => setOpen(expanded ? null : key)}>
            <Row gap={10} style={{ minHeight: 52 }}>
              <Txt variant="title" style={{ flex: 1, fontSize: 15 }}>{c[`q_${key}`]}</Txt>
              <Ionicons name={expanded ? 'remove' : 'add'} size={20} color={palette.olive} />
            </Row>
          </Pressable>
          {expanded && <Animated.View entering={FadeIn.duration(220)} style={{ paddingBottom: 14 }}>
            <Txt>{c[`a_${key}`]}</Txt>
          </Animated.View>}
        </Animated.View>;
      })}
    </Card>

    <Button title={c.privacy} icon="shield-checkmark-outline" variant="soft" onPress={() => Linking.openURL(PRIVACY_URL)} />
    <InstallLink />
  </Screen>;
}

const styles = StyleSheet.create({
  icon: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center' },
  item: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
});
