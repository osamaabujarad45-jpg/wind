// Full-height map sheet with a fixed centre pin (booking pickup/drop-off, checkpoint positions on Roads).
import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { latinDigits, type Point } from './model';
import { MERCATOR_LATITUDE_LIMIT } from './map-math';
import { pickupErrorKey } from './customer-location';
import { PinMap } from './route-map';
import { Button, Field, palette, Txt, useCopy } from './ui';
import { useReducedMotion } from './motion';
import { effectiveRuntime } from './runtime-config';

function validPinPoint(point: Point) {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= MERCATOR_LATITUDE_LIMIT && Math.abs(point.longitude) <= 180;
}

export function parsePinCoordinates(latitude: string, longitude: string): Point | null {
  const decimal = (text: string) => {
    const normalized = latinDigits(text.trim()).replace(/[٫,]/g, '.');
    return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized) ? Number(normalized) : NaN;
  };
  const point = { latitude: decimal(latitude), longitude: decimal(longitude) };
  // Every renderer uses Mercator tiles; polar coordinates would be silently clamped to a different point.
  return validPinPoint(point) ? point : null;
}

// Full-height sheet: drag the map under a fixed pin, then confirm. The landmark field stays the human address.
export default function PinSheet({ title, hint, start, onClose, onConfirm, onLocate, autoLocate = false }: {
  title: string; hint?: string; start: Point; onClose: () => void; onConfirm: (point: Point) => void;
  onLocate?: (signal: AbortSignal, canRequest: boolean) => Promise<Point>; autoLocate?: boolean;
}) {
  const { c, row } = useCopy();
  const still = useReducedMotion();
  const [readyTimeout] = useState(() => effectiveRuntime().values.mapReadyTimeoutMs);
  const { height } = useWindowDimensions();
  const [point, setPoint] = useState<Point>({ latitude: start.latitude, longitude: start.longitude });
  const [coordinates, setCoordinates] = useState({ latitude: String(start.latitude), longitude: String(start.longitude) });
  const draft = useRef(coordinates);
  const dirty = useRef(false);
  const [editing, setEditing] = useState(false);
  const [coordinateError, setCoordinateError] = useState(false);
  const [zoom, setZoom] = useState(16);
  const gesture = useRef(false);
  const dragged = useRef(false);
  const request = useRef<AbortController | null>(null);
  const shown = useRef(start);
  const cameraTarget = useRef<Point | null>(null);
  const [positioning, setPositioning] = useState<Point | null>(null);
  const locateCallback = useRef(onLocate);
  useEffect(() => { locateCallback.current = onLocate; });
  const [locating, setLocating] = useState(autoLocate);
  const [locationError, setLocationError] = useState('');
  const [selected, setSelected] = useState(!autoLocate);
  const selection = useRef(!autoLocate);
  const available = useRef(false);
  function select(value: boolean) { selection.current = value; setSelected(value); }
  function readCoordinates(next: Point) {
    if (!dirty.current) { draft.current = { latitude: String(next.latitude), longitude: String(next.longitude) }; setCoordinates(draft.current); }
  }
  function editCoordinate(key: 'latitude' | 'longitude', value: string) {
    dirty.current = true; dragged.current = true; gesture.current = false;
    request.current?.abort(); cameraTarget.current = null; setPositioning(null); setLocating(false); select(false); setLocationError('');
    draft.current = { ...draft.current, [key]: value }; setCoordinates(draft.current); setEditing(true); setCoordinateError(false);
  }
  function previewCoordinates() {
    const next = parsePinCoordinates(draft.current.latitude, draft.current.longitude);
    if (!next) { setCoordinateError(true); return; }
    request.current?.abort(); dragged.current = true; dirty.current = false; gesture.current = false;
    setEditing(false); setCoordinateError(false); setLocating(false); setLocationError('');
    cameraTarget.current = Math.abs(shown.current.latitude - next.latitude) + Math.abs(shown.current.longitude - next.longitude) > 0.000001 ? next : null;
    setPositioning(cameraTarget.current); setPoint(next); select(true); readCoordinates(next);
  }
  useEffect(() => {
    if (!positioning || locating) return;
    const timer = setTimeout(() => {
      if (cameraTarget.current !== positioning) return;
      cameraTarget.current = null; setPositioning(null); selection.current = false; setSelected(false); setLocationError(c.pinPositionFailed);
    }, readyTimeout);
    return () => clearTimeout(timer);
  }, [positioning, locating, readyTimeout, c.pinPositionFailed]);
  async function locate(canRequest = true) {
    if (!locateCallback.current) return;
    request.current?.abort();
    const next = new AbortController(); request.current = next;
    dirty.current = false; gesture.current = false; setEditing(false); setCoordinateError(false);
    cameraTarget.current = null; setPositioning(null);
    setLocating(true); setLocationError(''); select(false);
    try {
      const found = await locateCallback.current(next.signal, canRequest);
      if (!next.signal.aborted) {
        if (!validPinPoint(found)) throw new Error('inaccurate');
        cameraTarget.current = Math.abs(shown.current.latitude - found.latitude) + Math.abs(shown.current.longitude - found.longitude) > 0.000001 ? found : null;
        setPositioning(cameraTarget.current); setPoint(found); select(true); readCoordinates(found);
      }
    } catch (error) {
      if (!next.signal.aborted) setLocationError(error instanceof Error && error.message === 'prompt' ? '' : c[pickupErrorKey(error)]);
    } finally { if (!next.signal.aborted) setLocating(false); }
  }
  const firstLocate = useRef(locate);
  useEffect(() => {
    if (autoLocate) void firstLocate.current(false);
    return () => { available.current = false; request.current?.abort(); setLocating(false); };
  }, [autoLocate]);
  useEffect(() => { if (!dragged.current) { setPoint({ latitude: start.latitude, longitude: start.longitude }); readCoordinates(start); } }, [start.latitude, start.longitude]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false); // a map that never showed must not confirm a pin nobody saw
  return <Modal visible transparent animationType={still ? 'none' : 'slide'} onRequestClose={onClose}>
    <Pressable style={styles.shade} onPress={onClose} accessibilityRole="button" accessibilityLabel={c.cancel} />
    <SafeAreaView edges={['bottom']} style={[styles.sheet, { maxHeight: '92%' }]} accessibilityViewIsModal>
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
      <View style={styles.grip} />
      <Txt variant="h2" header style={{ marginBottom: 4 }}>{title}</Txt>
      <Txt variant="caption" style={{ marginBottom: 10 }}>{hint ?? c.pinHint}</Txt>
      <View style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
        <PinMap center={point} zoom={zoom} onZoomChange={setZoom} onChange={next => {
          if (!validPinPoint(next)) return;
          const target = cameraTarget.current;
          if (target && Math.abs(target.latitude - next.latitude) + Math.abs(target.longitude - next.longitude) > 0.000001) return;
          cameraTarget.current = null; shown.current = next; setPositioning(null); setPoint(next);
          readCoordinates(next);
          if (gesture.current && !dirty.current) { gesture.current = false; select(true); }
        }} onGesture={() => {
          dragged.current = true; gesture.current = true; request.current?.abort(); cameraTarget.current = null; setPositioning(null); setLocating(false); setLocationError(''); select(false);
        }} onLoading={() => { available.current = false; setReady(false); setFailed(false); }} onReady={() => { available.current = true; setReady(true); setFailed(false); }} onFail={() => { available.current = false; setReady(false); setFailed(true); }} height={Math.min(360, Math.max(150, height * 0.45))} />
      </View>
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <Button title={c.pinZoomIn} icon="add" variant="outline" disabled={!ready || locating || !!positioning || zoom >= 18} onPress={() => setZoom(value => Math.min(18, value + 1))} />
        <Button title={c.pinZoomOut} icon="remove" variant="outline" disabled={!ready || locating || !!positioning || zoom <= 2} onPress={() => setZoom(value => Math.max(2, value - 1))} />
      </View>
      <Txt variant="caption" style={{ marginBottom: 8 }}>{c.pinCoordinateHint}</Txt>
      <Field label={c.pinLatitude} value={coordinates.latitude} onChangeText={value => editCoordinate('latitude', value)} error={coordinateError ? c.pinCoordinateInvalid : undefined} />
      <Field label={c.pinLongitude} value={coordinates.longitude} onChangeText={value => editCoordinate('longitude', value)} error={coordinateError ? c.pinCoordinateInvalid : undefined} onSubmitEditing={previewCoordinates} />
      <Button title={c.pinPreview} variant="soft" onPress={previewCoordinates} />
      {onLocate && <>
        <Txt variant="caption" style={{ marginBottom: 8 }}>{c.locationPurpose}</Txt>
        <Button title={locating ? c.locating : c.useLocation} icon="locate" variant="soft" loading={locating} disabled={locating} onPress={() => { void locate(); }} />
      </>}
      {!!locationError && <View accessibilityLiveRegion="polite"><Txt variant="caption" style={{ marginBottom: 12 }}>{locationError}</Txt></View>}
      {Platform.OS !== 'web' && [c.locationPermissionBlocked, c.locationInaccurate, c.locationServicesDisabled].includes(locationError) &&
        <Button title={c.presence_open_settings} variant="ghost" onPress={() => { void Linking.openSettings().catch(() => setLocationError(c.locationSettingsFailed)); }} />}
      {failed ? <Txt variant="caption" style={{ marginBottom: 12 }}>{c.pinUnavailable}</Txt>
        : <Button title={c.confirmPin} icon="checkmark" disabled={!ready || locating || !!positioning || !selected || editing} reason={editing ? c.pinCoordinatePending : locating ? c.locating : !selected ? c.locationChooseOnMap : c.pin_wait} onPress={() => { if (available.current && selection.current && !cameraTarget.current && !dirty.current && !gesture.current && validPinPoint(shown.current)) onConfirm(shown.current); }} />}
      <Button title={c.cancel} variant="ghost" onPress={onClose} />
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  shade: { flex: 1, backgroundColor: '#0E1F1966' },
  sheet: { backgroundColor: palette.paper, paddingHorizontal: 16, paddingTop: 8, borderTopLeftRadius: 22, borderTopRightRadius: 22, width: '100%', maxWidth: 640, alignSelf: 'center' },
  grip: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: palette.line, marginBottom: 12 },
});
