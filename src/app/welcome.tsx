import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '../session';
import { InstallLink } from '../install-link';
import { Button, Card, Logo, Press, Row, Txt, useCopy } from '../ui';
import { themedStyles, useTheme } from '../theme-context';

export default function Welcome() {
  const { palette } = useTheme();
  const styles = useStyles();
  const { finishOnboarding, language, setLanguage } = useSession();
  const { c, rtl } = useCopy();

  return <SafeAreaView style={styles.safe}>
    <Row gap={12} style={styles.header}>
      <Logo size={36} decorative />
      <Txt variant="h2" style={{ flex: 1 }}>{c.brand}</Txt>
      <Press accessibilityLabel={c.language} onPress={() => setLanguage(language === 'ar' ? 'en' : 'ar')} style={styles.language}>
        <Txt variant="label">{c.language}</Txt>
      </Press>
    </Row>
    <ScrollView contentContainerStyle={styles.body}>
      <Card style={styles.card}>
        <View style={styles.map} aria-hidden>
          <View style={styles.street} />
          <View style={styles.crossStreet} />
          <Row style={styles.route} gap={12}>
            <View style={styles.start} />
            <View style={styles.path} />
            <Ionicons name="location" size={34} color={palette.clay} style={{ transform: [{ rotate: rtl ? '-14deg' : '14deg' }] }} />
          </Row>
        </View>
        <Txt variant="h1" header center>{c.welcomeTitle}</Txt>
        <Txt center>{c.welcomeBody}</Txt>
        <Button title={c.continue} onPress={finishOnboarding} />
      </Card>
      <InstallLink />
    </ScrollView>
  </SafeAreaView>;
}

const useStyles = themedStyles(palette => StyleSheet.create({
  safe: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: palette.paper },
  header: { paddingVertical: 12, paddingHorizontal: 20 },
  language: { paddingHorizontal: 14, minHeight: 44, minWidth: 44, borderRadius: 22, justifyContent: 'center', backgroundColor: palette.card },
  body: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 16 },
  card: { gap: 16, padding: 18 },
  map: { minHeight: 146, overflow: 'hidden', borderRadius: 16, justifyContent: 'center', backgroundColor: palette.mapWash },
  street: { position: 'absolute', top: '23%', left: -12, right: -12, height: 16, transform: [{ rotate: '-12deg' }], backgroundColor: palette.card },
  crossStreet: { position: 'absolute', bottom: '21%', left: -12, right: -12, height: 16, transform: [{ rotate: '8deg' }], backgroundColor: palette.card },
  route: { paddingHorizontal: '14%' },
  start: { width: 20, height: 20, borderRadius: 10, backgroundColor: palette.olive, borderWidth: 3, borderColor: palette.card },
  path: { flex: 1, borderTopWidth: 4, borderStyle: 'dashed', borderColor: palette.olive },
}));
