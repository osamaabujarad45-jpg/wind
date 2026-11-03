// "Where to?": pickup and destination fields over instant suggestions from the server's Palestine place index, with saved
// and recent places first. Works offline for towns and saved places. The fallback asks OpenStreetMap's wider search.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, errorCode } from './api';
import { city, cities, servedCity, type CityId, type Places, type Point } from './model';
import { searchPlaces, type MapHit } from './place-search';
import { Button, ErrorText, haptic, IconButton, palette, Press, Txt, useCopy, type IconName } from './ui';

export type TripPlace = { city: CityId; point: Point | null; note: string };
export type TripField = 'pickup' | 'dropoff';
type Hit = MapHit & { kind?: string };

const kindIcons: Record<string, IconName> = { town: 'business-outline', area: 'map-outline', health: 'medkit-outline', education: 'school-outline', worship: 'moon-outline', food: 'restaurant-outline',
  bank: 'card-outline', fuel: 'car-outline', transit: 'bus-outline', shop: 'bag-outline', junction: 'git-network-outline', street: 'trail-sign-outline', poi: 'location-outline' };

function Row({ icon, title, detail, onPress, onForget }: { icon: IconName; title: string; detail?: string; onPress: () => void; onForget?: () => void }) {
  const { c, row, align } = useCopy();
  return <View style={[styles.rowWrap, { flexDirection: row }]}>
    <Press containerStyle={{ flex: 1 }} accessibilityLabel={detail ? `${title}, ${detail}` : title} onPress={onPress} style={[styles.row, { flexDirection: row }]}>
      <View style={styles.rowIcon}><Ionicons name={icon} size={17} color={palette.secondary} /></View>
      <View style={{ flex: 1 }}>
        <Txt variant="title" numberOfLines={1} style={{ textAlign: align }}>{title}</Txt>
        {!!detail && <Txt variant="micro" numberOfLines={1} style={{ textAlign: align }}>{detail}</Txt>}
      </View>
    </Press>
    {onForget && <IconButton icon="trash-outline" tone="muted" label={`${c.forgetPlace}: ${title}`} onPress={onForget} />}
  </View>;
}

export function TripSearch({ field, onField, pickupText, dropoffText, near, places, locating, locationError, onPick, onMap, onLocate, onClose, onForget }: {
  field: TripField; onField: (field: TripField) => void;
  pickupText: string; dropoffText: string; near: Point | null; places: Places;
  locating: boolean; locationError?: string;
  onPick: (field: TripField, place: TripPlace) => void; onMap: (field: TripField) => void; onLocate: () => void; onClose: () => void; onForget: (id: number) => void;
}) {
  const { c, language, row, rtl, align } = useCopy();
  const [query, setQuery] = useState({ pickup: '', dropoff: '' });
  const term = query[field].trim();
  const [answer, setAnswer] = useState<{ term: string; field: TripField; hits: Hit[]; failed?: boolean } | null>(null);
  const [wider, setWider] = useState<{ term: string; hits: Hit[] | null; failed?: string } | null>(null);
  const inputs = useRef<Record<TripField, TextInput | null>>({ pickup: null, dropoff: null });
  useEffect(() => { inputs.current[field]?.focus(); }, [field]);
  const nearText = near ? `&near=${near.latitude.toFixed(4)},${near.longitude.toFixed(4)}` : '';
  useEffect(() => {
    if (!term) return;
    let live = true;
    const timer = setTimeout(() => {
      api<{ hits: Hit[] }>(`/places/suggest?q=${encodeURIComponent(term)}&lang=${language}${nearText}`)
        .then(r => { if (live) setAnswer({ term, field, hits: r.hits }); })
        .catch(() => { if (live) setAnswer({ term, field, hits: [], failed: true }); });
    }, 120);
    return () => { live = false; clearTimeout(timer); };
  }, [term, field, language, nearText]);
  const shown = answer?.term === term && answer.field === field ? answer : null;
  const saved = term ? searchPlaces(term, places.saved).choices.filter(p => p.saved) : [];
  // Towns from the app's own list only when the server cannot answer, so search never comes up empty offline.
  const offlineTowns = term && shown?.failed ? searchPlaces(term).choices.filter(p => !p.saved) : [];
  const pick = (place: TripPlace) => { haptic.tap(); setQuery(q => ({ ...q, [field]: '' })); onPick(field, place); };
  const pickHit = (hit: Hit) => {
    const point = { latitude: hit.latitude, longitude: hit.longitude }, near_ = servedCity(point);
    if (near_) pick({ city: near_, point, note: hit.name });
  };
  const wide = wider?.term === term ? wider : null;
  const searchWider = () => {
    setWider({ term, hits: null });
    api<{ hits: Hit[] }>(`/places/search?q=${encodeURIComponent(term)}&lang=${language}${nearText}`)
      .then(r => setWider(w => w?.term === term ? { term, hits: r.hits } : w))
      .catch(e => setWider(w => w?.term === term ? { term, hits: [], failed: errorCode(e) === 'too_many_attempts' ? c.err_too_many_attempts : c.searchMapFailed } : w));
  };
  const placeName = (label: string, note: string) => label === 'other' || label === 'recent' ? note : c[`place_${label as 'home' | 'work'}`];
  const input = (which: TripField, placeholder: string, value: string) => <TextInput ref={r => { inputs.current[which] = r; }}
    accessibilityLabel={which === 'pickup' ? c.pickup : c.dropoff}
    value={query[which]} placeholder={value || placeholder} placeholderTextColor={value ? palette.ink : palette.faint} onFocus={() => onField(which)} maxLength={100}
    onChangeText={text => setQuery(q => ({ ...q, [which]: text }))} returnKeyType="search" autoCorrect={false}
    style={[styles.input, { textAlign: align, writingDirection: rtl ? 'rtl' : 'ltr' }, field === which && styles.inputOn, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />;
  return <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
    <View style={[styles.top, { flexDirection: row }]}>
      <IconButton icon={rtl ? 'arrow-forward' : 'arrow-back'} label={c.back} tone="muted" onPress={onClose} />
      <View style={{ flex: 1 }}>
        <View style={[styles.fieldRow, { flexDirection: row }]}>
          <View style={styles.dot} />
          {input('pickup', c.whereFrom, pickupText)}
        </View>
        <View style={[styles.fieldRow, { flexDirection: row, marginTop: 8 }]}>
          <View style={styles.square} />
          {input('dropoff', c.whereTo, dropoffText)}
        </View>
      </View>
    </View>
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
      {field === 'pickup' && <Press accessibilityLabel={c.useLocation} onPress={onLocate} disabled={locating} style={[styles.row, styles.rowLine, { flexDirection: row }]}>
        <View style={[styles.rowIcon, { backgroundColor: palette.olivePale }]}>{locating ? <ActivityIndicator size="small" color={palette.olive} /> : <Ionicons name="navigate" size={17} color={palette.olive} />}</View>
        <Txt variant="title" style={{ flex: 1, textAlign: align }}>{locating ? c.locating : c.useLocation}</Txt>
      </Press>}
      {!!locationError && <Txt variant="caption" style={{ marginBottom: 8, textAlign: align }}>{locationError}</Txt>}
      <Row icon="pin-outline" title={c.setOnMap} onPress={() => { haptic.tap(); onMap(field); }} />
      {!term && <>
        {places.saved.map(p => <Row key={`s${p.id}`} icon={p.label === 'home' ? 'home-outline' : p.label === 'work' ? 'briefcase-outline' : 'star-outline'} title={placeName(p.label, p.note)}
          detail={p.label === 'other' ? city(p.city)[language] : `${city(p.city)[language]} · ${p.note}`} onPress={() => pick({ city: p.city, point: null, note: p.note })} onForget={() => onForget(p.id)} />)}
        {places.recent.map((p, i) => <Row key={`r${i}`} icon="time-outline" title={p.note} detail={city(p.city)[language]} onPress={() => pick({ city: p.city, point: null, note: p.note })} />)}
        {!places.saved.length && !places.recent.length && cities.map(item => <Row key={item.id} icon="business-outline" title={item[language]} onPress={() => pick({ city: item.id, point: null, note: '' })} />)}
      </>}
      {saved.map(p => <Row key={p.key} icon="star-outline" title={p.note} detail={city(p.city)[language]} onPress={() => pick({ city: p.city, point: null, note: p.note })} />)}
      {shown?.hits.map((hit, i) => <Row key={`${i}:${hit.latitude},${hit.longitude}`} icon={kindIcons[hit.kind ?? 'poi'] ?? 'location-outline'} title={hit.name} detail={hit.detail} onPress={() => pickHit(hit)} />)}
      {offlineTowns.map(p => <Row key={p.key} icon="business-outline" title={city(p.city)[language]} onPress={() => pick({ city: p.city, point: null, note: '' })} />)}
      {!!term && !shown && <View style={styles.wait}><ActivityIndicator color={palette.olive} /></View>}
      {!!term && !!shown && !shown.failed && !shown.hits.length && !saved.length && <Txt variant="caption" center style={{ marginVertical: 12 }}>{c.searchMapNone}</Txt>}
      {shown?.failed && <Txt variant="caption" center style={{ marginVertical: 12 }}>{c.searchOffline}</Txt>}
      {wide?.hits?.map((hit, i) => <Row key={`w${i}:${hit.latitude},${hit.longitude}`} icon="location-outline" title={hit.name} detail={hit.detail} onPress={() => pickHit(hit)} />)}
      <ErrorText>{wide?.failed}</ErrorText>
      {term.length >= 3 && !!shown && !shown.failed && shown.hits.length < 4 && (!wide || !!wide.failed) &&
        <View style={{ marginTop: 10 }}><Button title={c.searchMap.replace('{q}', () => term)} icon="map-outline" variant="outline" onPress={searchWider} /></View>}
      {wide && !wide.hits && <View style={styles.wait}><ActivityIndicator color={palette.olive} /></View>}
      {(shown?.hits.length ?? 0) > 0 && <Txt variant="micro" style={{ marginTop: 12, textAlign: align }}>{c.mapCredit}</Txt>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: palette.paper },
  top: { gap: 10, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, backgroundColor: palette.card, boxShadow: '0px 2px 10px rgba(14,31,25,0.08)' },
  fieldRow: { alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: palette.forest, backgroundColor: palette.card },
  square: { width: 12, height: 12, borderRadius: 2, backgroundColor: palette.forest },
  input: { flex: 1, minHeight: 44, borderRadius: 10, paddingHorizontal: 12, backgroundColor: palette.paper, fontSize: 16, fontWeight: '600', color: palette.ink },
  inputOn: { backgroundColor: palette.muted },
  rowWrap: { alignItems: 'center', gap: 4, borderBottomWidth: 1, borderBottomColor: palette.hair },
  row: { alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: palette.hair },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: palette.muted, alignItems: 'center', justifyContent: 'center' },
  wait: { paddingVertical: 16, alignItems: 'center' },
});
