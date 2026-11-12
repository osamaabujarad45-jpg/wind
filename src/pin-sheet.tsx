// Full-height map sheet with a fixed centre pin (booking pickup/drop-off, checkpoint positions on Roads).
import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Point } from './model';
import { pickupErrorKey } from './customer-location';
import { PinMap } from './route-map';
import { Button, palette, sheetShadow, Txt, useCopy } from './ui';
import { useReducedMotion } from './motion';
import { mapReadyMs } from './runtime-config';

// Full-height sheet: drag the map under a fixed pin, then confirm. The landmark field stays the human address.
export default function PinSheet({ title, hint, unavailable, start, onClose, onConfirm, onLocate, autoLocate = false }: {
  title: string; hint?: string; unavailable?: string; start: Point; onClose: () => void; onConfirm: (point: Point) => void;
  onLocate?: (signal: AbortSignal, canRequest: boolean) => Promise<Point>; autoLocate?: boolean;
}) {
  const { c } = useCopy();
  const still = useReducedMotion();
  const { height } = useWindowDimensions();
  const [point, setPoint] = useState<Point>({ latitude: start.latitude, longitude: start.longitude });
  const dragged = useRef(false);
  const request = useRef<AbortController | null>(null);
  const shown = useRef(start);
  const cameraTarget = useRef<Point | null>(null);
  const [positioning, setPositioning] = useState(false);
  const locateCallback = useRef(onLocate);
  useEffect(() => { locateCallback.current = onLocate; });
  const [locating, setLocating] = useState(autoLocate);
  const [locationError, setLocationError] = useState('');
  const [selected, setSelected] = useState(!autoLocate);
  useEffect(() => {
    if (!positioning || locating) return;
    const target = cameraTarget.current;
    const timer = setTimeout(() => {
      if (!target || cameraTarget.current !== target) return;
      cameraTarget.current = null; setPositioning(false); setSelected(false); setLocationError(c.pinPositionFailed);
    }, mapReadyMs());
    return () => clearTimeout(timer);
  }, [positioning, locating, c.pinPositionFailed]);
  async function locate(canRequest = true) {
    if (!locateCallback.current) return;
    request.current?.abort();
    const next = new AbortController(); request.current = next;
    const before = selected; // a failed retry gives back the pin the user already had
    setLocating(true); setLocationError(''); setSelected(false);
    try {
      const found = await locateCallback.current(next.signal, canRequest);
      if (!next.signal.aborted) {
        cameraTarget.current = Math.abs(shown.current.latitude - found.latitude) + Math.abs(shown.current.longitude - found.longitude) > 0.000001 ? found : null;
        setPositioning(!!cameraTarget.current); setPoint(found); setSelected(true);
      }
    } catch (error) {
      if (!next.signal.aborted) setSelected(before);
      if (!next.signal.aborted) setLocationError(error instanceof Error && error.message === 'prompt' ? '' : c[pickupErrorKey(error)]);
    } finally { if (!next.signal.aborted) setLocating(false); }
  }
  const firstLocate = useRef(locate);
  useEffect(() => {
    if (autoLocate) void firstLocate.current(false);
    return () => { request.current?.abort(); setLocating(false); };
  }, [autoLocate]);
  useEffect(() => { if (!dragged.current) setPoint({ latitude: start.latitude, longitude: start.longitude }); }, [start.latitude, start.longitude]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false); // a map that never showed must not confirm a pin nobody saw
  return <Modal visible transparent animationType={still ? 'none' : 'slide'} onRequestClose={onClose}>
    <Pressable style={styles.shade} onPress={onClose} accessibilityLabel={c.cancel} />
    <SafeAreaView edges={['bottom']} style={[styles.sheet, sheetShadow, { maxHeight: '92%' }]} accessibilityViewIsModal>
      <ScrollView style={{ flexShrink: 1 }}>
      <View style={styles.grip} />
      <Txt variant="h2" style={{ marginBottom: 4 }}>{title}</Txt>
      <Txt variant="caption" style={{ marginBottom: 10 }}>{hint ?? c.pinSheetHint}</Txt>
      <View style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
        <PinMap center={point} onChange={next => {
          const target = cameraTarget.current;
          if (target && Math.abs(target.latitude - next.latitude) + Math.abs(target.longitude - next.longitude) > 0.000001) return;
          cameraTarget.current = null; shown.current = next; setPositioning(false); setPoint(next);
        }} onGesture={() => {
          dragged.current = true; request.current?.abort(); cameraTarget.current = null; setPositioning(false); setLocating(false); setLocationError(''); setSelected(true);
        }} onLoading={() => { setReady(false); setFailed(false); }} onReady={() => { setReady(true); setFailed(false); }} onFail={() => { setReady(false); setFailed(true); }} height={Math.min(360, Math.max(150, height * 0.45))} />
      </View>
      {onLocate && <>
        <Txt variant="caption" style={{ marginBottom: 8 }}>{c.locationPurpose}</Txt>
        <Button title={locating ? c.locating : c.useLocation} icon="locate" variant="soft" loading={locating} disabled={locating} onPress={() => { void locate(); }} />
      </>}
      {!!locationError && <View accessibilityLiveRegion="polite"><Txt variant="caption" style={{ marginBottom: 12 }}>{locationError}</Txt></View>}
      {Platform.OS !== 'web' && [c.locationPermissionBlocked, c.locationInaccurate, c.locationServicesDisabled].includes(locationError) &&
        <Button title={c.presence_open_settings} variant="ghost" onPress={() => { void (Platform.OS === 'android' && locationError === c.locationServicesDisabled ? Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS') : Linking.openSettings()).catch(() => setLocationError(c.locationSettingsFailed)); }} />}
      {failed ? <Txt variant="caption" style={{ marginBottom: 12 }}>{unavailable ?? c.pinSheetUnavailable}</Txt>
        : <Button title={c.confirmPin} icon="checkmark" disabled={!ready || locating || positioning || !selected} reason={locating ? c.locating : !selected ? c.locationChooseOnMap : c.pin_wait} onPress={() => { if (ready && !locating && !positioning && selected) onConfirm(point); }} />}
      <Button title={c.cancel} variant="ghost" onPress={onClose} />
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  shade: { flex: 1, backgroundColor: palette.shade },
  sheet: { backgroundColor: palette.paper, paddingHorizontal: 16, paddingTop: 8, borderTopLeftRadius: 22, borderTopRightRadius: 22, width: '100%', maxWidth: 640, alignSelf: 'center' },
  grip: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: palette.dash, marginBottom: 12 },
});
