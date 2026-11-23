// Animated intro played once per launch, straight after the native splash.
// Its first frame is the native splash (same tile, same size, same place), so there is no jump: the tile catches the wind
// and tilts in depth, the destination dot drops into the ring, then the tile rises and the name appears.
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cubicBezier, useReducedMotion } from './motion';
import { headingFont, logoDotStyle, LogoGust, logoMark, maxScale, palette, useCopy } from './ui';

export const INTRO_MS = 1600;
export const TILE = 120; // keep equal to expo-splash-screen "imageWidth" in app.json

const EASE = cubicBezier(0.23, 1, 0.32, 1);
const u = TILE / 100;

export function Intro() {
  const { c } = useCopy();
  const still = useReducedMotion(); // reduced motion: hold the splash frame, no movement

  return <View style={styles.fill} accessibilityLabel={c.brand}>
    <Animated.View style={[styles.stage, !still && {
      animationName: { from: { transform: [{ translateY: 0 }] }, to: { transform: [{ translateY: -44 }] } },
      animationDuration: '520ms', animationDelay: '820ms', animationTimingFunction: EASE, animationFillMode: 'both',
    }]}>
      {/* A gust: the tile turns in depth and settles back, flat again before it rises. */}
      <Animated.View style={[styles.tile, !still && {
        animationName: {
          '0%': { transform: [{ perspective: 600 }, { rotateY: '0deg' }, { rotateX: '0deg' }] },
          '45%': { transform: [{ perspective: 600 }, { rotateY: '-24deg' }, { rotateX: '8deg' }] },
          '100%': { transform: [{ perspective: 600 }, { rotateY: '0deg' }, { rotateX: '0deg' }] },
        },
        animationDuration: '700ms', animationDelay: '100ms', animationTimingFunction: 'ease-in-out', animationFillMode: 'both',
      }]}>
        <LogoGust size={TILE} />
        <Animated.View style={[logoDotStyle(TILE), !still && {
          animationName: {
            '0%': { transform: [{ translateY: 0 }, { scale: 1 }] }, '40%': { transform: [{ translateY: -12 * u }, { scale: 0.8 }] },
            '75%': { transform: [{ translateY: 2 * u }, { scale: 1.08 }] }, '100%': { transform: [{ translateY: 0 }, { scale: 1 }] },
          },
          animationDuration: '560ms', animationDelay: '380ms', animationTimingFunction: 'ease-in-out', animationFillMode: 'both',
        }]} />
      </Animated.View>
      <Animated.View style={[styles.words, !still && {
        animationName: { from: { opacity: 0, transform: [{ translateY: 14 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } },
        animationDuration: '460ms', animationDelay: '900ms', animationTimingFunction: EASE, animationFillMode: 'both',
      }, still && { opacity: 0 }]}>
        <Text maxFontSizeMultiplier={maxScale} style={styles.brand}>{c.brand}</Text>
        <Text maxFontSizeMultiplier={maxScale} style={styles.tagline}>{c.tagline}</Text>
      </Animated.View>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: palette.paper, alignItems: 'center', justifyContent: 'center' },
  stage: { width: TILE, height: TILE },
  tile: { width: TILE, height: TILE, borderRadius: TILE * logoMark.radius, backgroundColor: palette.forest, overflow: 'hidden' },
  words: { position: 'absolute', top: TILE + 22, left: (TILE - 320) / 2, width: 320, alignItems: 'center', gap: 6 },
  brand: { fontSize: 34, lineHeight: 46, fontFamily: headingFont.bold, color: palette.ink, textAlign: 'center' }, // the wordmark face
  tagline: { fontSize: 14, lineHeight: 21, color: palette.secondary, textAlign: 'center', paddingHorizontal: 12 },
});
