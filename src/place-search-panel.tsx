// Local place search panel (T16). Presentation only, like driver-presence-card: it proposes a hit and reports
// it only on the explicit Confirm tap, while the parent owns the booking. No Google Places request exists here,
// so the panel keeps working with no connection. A confirmed pin is never moved by a search tap.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { city, type SavedPlace } from './model';
import { confirmPlace, proposePlace, searchPlaces, type PlaceCandidate, type PlaceChoice } from './place-search';
import { Button, Card, ErrorText, Field, fill, palette, Press, Row, Txt, useCopy } from './ui';

/** Strings this panel needs beyond src/copy.ts; the parent supplies them until the copy keys land. */
export type PlaceSearchText = {
  label: string; // search field label
  empty: string; // nothing typed yet
  offline: string; // no connection: existing local choices only
  pinKept: string; // the proposal keeps the confirmed pin
  pinCleared: string; // confirming moves to another city and drops the confirmed pin
  apply: string; // confirm the proposed place
};

type Props = {
  saved: SavedPlace[];
  selected?: PlaceCandidate | null; // the accepted place; its pin is what a proposal must not move
  online?: boolean;
  outside?: boolean; // the parent's pin step rejected a point outside the served area
  text: PlaceSearchText;
  onConfirm: (place: PlaceCandidate) => void;
  onQuery?: (term: string) => void; // lets an embedding sheet hide its saved-places block while typing
};

export function PlaceSearch({ saved, selected = null, online = true, outside = false, text, onConfirm, onQuery }: Props) {
  const { c, language } = useCopy();
  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState<PlaceChoice | null>(null);
  const term = query.trim();
  const result = searchPlaces(query, saved, online);
  const proposal = choice && proposePlace(selected, choice);
  const name = (item: PlaceChoice) => item.saved
    ? item.saved.label === 'other' ? item.saved.note : c[`place_${item.saved.label}`]
    : city(item.city)[language];
  const detail = (item: PlaceChoice) => !item.saved ? city(item.city)[language === 'ar' ? 'en' : 'ar']
    : item.saved.label === 'other' ? city(item.city)[language] : `${city(item.city)[language]}, ${item.saved.note}`;

  return <View style={styles.panel}>
    <Field label={text.label} value={query} onChangeText={value => { setQuery(value); setChoice(null); onQuery?.(value.trim()); }} icon="search" />
    {!term && <Txt variant="caption" style={styles.note}>{text.empty}</Txt>}
    {!online && <Txt variant="caption" style={styles.note}>{text.offline}</Txt>}
    <ErrorText>{outside ? c.pinOutsideArea : undefined}</ErrorText>
    {!!term && !result.choices.length && <Txt variant="caption" center style={styles.note}>{c.noCities}</Txt>}
    {/* The list itself is not a live region: a count says how much changed without repeating every row. */}
    {!!term && !!result.choices.length && <View accessibilityLiveRegion="polite">
      <Txt variant="micro" style={styles.note}>{fill(c.placeResults, { n: result.choices.length })}</Txt>
    </View>}
    {result.choices.map(item => <Press key={item.key} accessibilityLabel={`${name(item)}, ${detail(item)}`} onPress={() => setChoice(item)}>
      <Row gap={8} style={styles.row}>
        <View style={styles.text}>
          <Txt variant="title" numberOfLines={1}>{name(item)}</Txt>
          <Txt variant="micro" numberOfLines={1}>{detail(item)}</Txt>
        </View>
      </Row>
    </Press>)}
    {proposal && choice && <Card tone="olive" style={styles.proposal}>
      <View accessibilityLiveRegion="polite">
        <Txt variant="title">{name(choice)}</Txt>
        <Txt variant="caption">{detail(choice)}</Txt>
        {!!selected?.point && <Txt variant="caption" style={styles.note}>{proposal.keptPin ? text.pinKept : text.pinCleared}</Txt>}
      </View>
      <Row gap={8} style={styles.note}>
        <Button title={text.apply} icon="checkmark" onPress={() => { const place = confirmPlace(proposal); setChoice(null); onConfirm(place); }} />
        <Button title={c.cancel} variant="outline" onPress={() => setChoice(null)} />
      </Row>
    </Card>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: 4 },
  note: { marginTop: 8 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.hair },
  text: { flex: 1 },
  proposal: { marginTop: 10, gap: 4 },
});
