// First-launch welcome: three short slides, then sign in. Shown once per device (session.onboarded).
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, useReducedMotion, ZoomIn } from '../motion';
import { Ionicons } from '@expo/vector-icons';
import { ServiceIcon } from '../parts';
import { useSession } from '../session';
import { InstallLink } from '../install-link';
import { Button, fill, haptic, Logo, palette, Press, Row, Txt, useCopy } from '../ui';

const SLIDES = 5;

export default function Welcome() {
  const { finishOnboarding, language, setLanguage } = useSession();
  const { c } = useCopy();
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();
  const last = index === SLIDES - 1;
  // Read model/provider info from public env (Expo) or fallback to known values.
  const T3_MODEL = (process.env.EXPO_PUBLIC_T3_MODEL ?? process.env.ZRO_MODEL ?? 'deepseek-v4.1-flash') as string;
  const T3_PROVIDER = (process.env.EXPO_PUBLIC_T3_PROVIDER ?? process.env.ZRO_PROVIDER_NAME ?? 'moonmath') as string;
  const OPENCODE_MODEL = (process.env.EXPO_PUBLIC_OPENCODE_MODEL ?? T3_MODEL) as string;
  const OPENCODE_PROVIDER = (process.env.EXPO_PUBLIC_OPENCODE_PROVIDER ?? T3_PROVIDER) as string;

  const title = [c.ob1Title, c.ob2Title, c.ob3Title, 'T3 model', 'OpenCode model'][index];
  const body = [c.ob1Body, c.ob2Body, c.ob3Body, `${T3_MODEL} (provider: ${T3_PROVIDER})`, `${OPENCODE_MODEL} (provider: ${OPENCODE_PROVIDER})`][index];

  return <SafeAreaView style={styles.safe}>
    <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
      <Row gap={10}>
        <Logo size={32} />
        <Txt variant="h2">{c.brand}</Txt>
      </Row>
      <Row gap={8}>
        <Press accessibilityLabel={c.language} onPress={() => setLanguage(language === 'ar' ? 'en' : 'ar')} style={styles.pill}>
          <Txt variant="label">{c.language}</Txt>
        </Press>
        {!last && <Press accessibilityLabel={c.skip} onPress={finishOnboarding} style={styles.pill}>
          <Txt variant="label" style={{ color: palette.secondary }}>{c.skip}</Txt>
        </Press>}
      </Row>
    </Row>

    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
      <Animated.View key={`art-${index}`} entering={reduced ? undefined : FadeIn.duration(320)} style={styles.art}>
        {index === 0 && <ServicesArt />}
        {index === 1 && <PriceArt label={c.ob2Save} />}
        {index === 2 && <HandoverArt label={c.ob3Code} steps={[c.assigned, c.in_transit, c.completed]} />}
        {index === 3 && <T3Art model={T3_MODEL} provider={T3_PROVIDER} />}
        {index === 4 && <OpenCodeArt model={OPENCODE_MODEL} provider={OPENCODE_PROVIDER} />}
      </Animated.View>
      <Animated.View key={`text-${index}-${language}`} entering={reduced ? undefined : FadeInDown.duration(320).delay(80)} style={{ gap: 10 }}>
        <Txt variant="h1" center>{title}</Txt>
        <Txt center style={{ fontSize: 15, lineHeight: 23 }}>{body}</Txt>
      </Animated.View>
    </ScrollView>

    <View style={styles.footer}>
      <Row gap={8} style={{ justifyContent: 'center' }}>
        {Array.from({ length: SLIDES }, (_, i) => <Pressable key={i} accessibilityRole="radio" style={styles.slideKey}
          accessibilityLabel={fill(c.stepOf, { n: i + 1, total: SLIDES })} aria-checked={i === index}
          onPress={() => setIndex(i)}>
          <View style={[styles.dot, i === index && styles.dotOn]} />
        </Pressable>)}
      </Row>
      <Button title={last ? c.start : c.next} icon={last ? 'flash-outline' : undefined}
        onPress={() => { haptic.tap(); if (last) finishOnboarding(); else setIndex(index + 1); }} />
      <InstallLink />
    </View>
  </SafeAreaView>;
}

// Parcel is the launch service; additional services appear after operator approval.
function ServicesArt() {
  return <View style={{ alignItems: 'center', gap: 22 }}>
    <ServiceIcon service="parcel" size={80} />
    <Road />
  </View>;
}

function PriceArt({ label }: { label: string }) {
  const { c, row } = useCopy();
  return <View style={{ alignItems: 'center', gap: 18 }}>
    <Ionicons name="receipt-outline" size={64} color={palette.olive} />
    <View style={[styles.saveBadge, { flexDirection: row }]}>
      <Ionicons name="pricetag" size={16} color={palette.onFill} />
      <Text style={styles.saveText}>{label}</Text>
    </View>
    <Txt variant="caption">{c.cash}</Txt>
  </View>;
}

// Slide 3: status steps and the 4-digit handover code.
function HandoverArt({ label, steps }: { label: string; steps: string[] }) {
  const reduced = useReducedMotion();
  return <View style={{ width: 270, gap: 14 }}>
    <View style={styles.panel}>
      {steps.map((step, i) => <Animated.View key={step} entering={reduced ? undefined : FadeInDown.duration(280).delay(100 + i * 110)}>
        <Row gap={10} style={{ paddingVertical: 5 }}>
          <View style={[styles.stepDot, i < 2 && { backgroundColor: palette.olive }]}>
            {i < 2 && <Ionicons name="checkmark" size={12} color={palette.onFill} />}
          </View>
          <Txt variant={i < 2 ? 'title' : 'body'} style={{ flex: 1, fontSize: 14 }}>{step}</Txt>
        </Row>
      </Animated.View>)}
    </View>
    <Animated.View entering={reduced ? undefined : ZoomIn.duration(320).delay(460)} style={[styles.panel, { backgroundColor: palette.clayPale, borderColor: palette.clayPale }]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="title">{label}</Txt>
        <Text style={styles.code}>4827</Text>
      </Row>
    </Animated.View>
  </View>;
}

function T3Art({ model, provider }: { model: string; provider: string }) {
  return <View style={{ alignItems: 'center', gap: 18 }}>
    <Ionicons name="cog-outline" size={64} color={palette.blue} />
    <View style={{ alignItems: 'center' }}>
      <Txt variant="title">T3 model</Txt>
      <Txt variant="body">{model}</Txt>
      <Txt variant="caption" style={{ marginTop: 6 }}>{`provider: ${provider}`}</Txt>
    </View>
  </View>;
}

function OpenCodeArt({ model, provider }: { model: string; provider: string }) {
  return <View style={{ alignItems: 'center', gap: 18 }}>
    <Ionicons name="code-slash" size={64} color={palette.olive} />
    <View style={{ alignItems: 'center' }}>
      <Txt variant="title">OpenCode model</Txt>
      <Txt variant="body">{model}</Txt>
      <Txt variant="caption" style={{ marginTop: 6 }}>{`provider: ${provider}`}</Txt>
    </View>
  </View>;
}

// Origin (olive) to destination (terracotta), following reading direction.
function Road() {
  const { rtl } = useCopy();
  return <View style={{ width: 260, height: 14, justifyContent: 'center' }}>
    <View style={{ height: 4, borderRadius: 2, backgroundColor: palette.line }} />
    <View style={[styles.end, { [rtl ? 'right' : 'left']: 0, backgroundColor: palette.olive }]} />
    <View style={[styles.end, { [rtl ? 'left' : 'right']: 0, backgroundColor: palette.clay }]} />
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: palette.paper },
  pill: { paddingHorizontal: 14, minHeight: 44, borderRadius: 22, justifyContent: 'center', backgroundColor: palette.card },
  body: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 16, gap: 30 },
  art: { minHeight: 220, borderRadius: 22, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 4px 14px rgba(14,31,25,0.06)' },
  footer: { paddingHorizontal: 20, paddingBottom: 16, gap: 18 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.line },
  dotOn: { width: 24, backgroundColor: palette.olive },
  slideKey: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  saveBadge: { alignItems: 'center', gap: 8, backgroundColor: palette.forest, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 99 },
  saveText: { color: palette.onFill, fontSize: 16, fontWeight: '900' },
  panel: { backgroundColor: palette.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: palette.line },
  stepDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  code: { fontSize: 28, fontWeight: '900', color: palette.clayInk, letterSpacing: 6, writingDirection: 'ltr' },
  end: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
});
