// Match the native splash's first frame while session and theme restoration finish.
import { StyleSheet, View } from 'react-native';
import { Logo, palette, useCopy } from './ui';

export const TILE = 120; // keep equal to expo-splash-screen "imageWidth" in app.json

export function Intro() {
  const { c } = useCopy();
  return <View style={styles.fill} accessibilityLabel={c.brand}>
    <Logo size={TILE} />
  </View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: palette.paper, alignItems: 'center', justifyContent: 'center' },
});
