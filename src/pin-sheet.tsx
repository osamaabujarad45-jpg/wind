// Full-height map sheet with a fixed centre pin (booking pickup/drop-off, checkpoint positions on Roads).
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Point } from './model';
import { PinMap } from './route-map';
import { Button, palette, Txt, useCopy } from './ui';

// Full-height sheet: drag the map under a fixed pin, then confirm. The landmark field stays the human address.
export default function PinSheet({ title, hint, start, onClose, onConfirm }: { title: string; hint?: string; start: Point; onClose: () => void; onConfirm: (point: Point) => void }) {
  const { c } = useCopy();
  const [point, setPoint] = useState<Point>({ latitude: start.latitude, longitude: start.longitude });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false); // a map that never showed must not confirm a pin nobody saw
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
    <Pressable style={styles.shade} onPress={onClose} accessibilityLabel={c.cancel} />
    <SafeAreaView edges={['bottom']} style={[styles.sheet, { maxHeight: '92%' }]} accessibilityViewIsModal>
      <View style={styles.grip} />
      <Txt variant="h2" style={{ marginBottom: 4 }}>{title}</Txt>
      <Txt variant="caption" style={{ marginBottom: 10 }}>{hint ?? c.pinHint}</Txt>
      <View style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
        <PinMap center={start} onChange={setPoint} onReady={() => { setReady(true); setFailed(false); }} onFail={() => { setReady(false); setFailed(true); }} height={360} />
      </View>
      {failed ? <Txt variant="caption" style={{ marginBottom: 12 }}>{c.pinUnavailable}</Txt>
        : <Button title={c.confirmPin} icon="checkmark" disabled={!ready} reason={c.pin_wait} onPress={() => { if (ready) onConfirm(point); }} />}
      <Button title={c.cancel} variant="ghost" onPress={onClose} />
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  shade: { flex: 1, backgroundColor: '#0E1F1966' },
  sheet: { backgroundColor: palette.paper, paddingHorizontal: 16, paddingTop: 8, borderTopLeftRadius: 22, borderTopRightRadius: 22, width: '100%', maxWidth: 640, alignSelf: 'center' },
  grip: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: palette.line, marginBottom: 12 },
});
