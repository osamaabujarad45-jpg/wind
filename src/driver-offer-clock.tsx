import { useEffect } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { fill, Txt, useCopy } from './ui';

export function OfferClock({ seconds, focused }: { seconds: number; focused: boolean }) {
  const { c } = useCopy();
  const clock = seconds === 0 ? c.dispatchExpired : fill(c.dispatchOfferClock, { n: seconds });
  const announcement = seconds > 5 ? fill(c.dispatchOfferTimeAtMost, { n: Math.ceil(seconds / 10) * 10 })
    : seconds > 0 ? fill(c.dispatchOfferTimeAtMost, { n: 5 }) : clock; // one warning before expiry, not five
  useEffect(() => {
    if (focused && Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(announcement);
  }, [announcement, focused]);
  return <View style={{ marginTop: 8 }}>
    <Txt variant="label">{clock}</Txt>
    {Platform.OS === 'web' && <View accessibilityLiveRegion="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
      {focused && <Txt>{announcement}</Txt>}
    </View>}
  </View>;
}
