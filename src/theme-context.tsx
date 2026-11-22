// Design system v2: Day and Night for the whole app. Day by default; captains go Night after sunset (afterDark), and a Day,
// Night or Automatic choice is saved on this device (Account offers it to captains until every screen reads the theme).
// The swap is instant, with no animated transition, so reduced motion has nothing to stop and the new theme reads at once.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, type ViewStyle } from 'react-native';
import { storage } from './storage';
import { useSession } from './session';
import { afterDark, colors, journeyState, resolveTheme, themeChoices, type ThemeChoice, lines, palettes, shadows, stateLook, type Colors, type JourneyState, type Palette, type StateLook, type ThemeName } from './theme';
import type { OrderStatus } from './model';

export { themeChoices, type ThemeChoice } from './theme';
const THEME_KEY = 'theme';

/** Everything a screen colours itself with, for one theme. */
export interface ThemeKit {
  name: ThemeName;
  palette: Palette;
  colors: Colors;
  lines: (typeof lines)[ThemeName];
  /** The look of each journey state; statusTone maps every order status onto it. */
  stateLook: Record<JourneyState, StateLook>;
  statusTone: Record<OrderStatus, StateLook>;
  /** Badge pairs that are not journey states (roles, promos, shop open). */
  tones: ReturnType<typeof tonesFor>;
  shadow: ViewStyle;
  sheetShadow: ViewStyle;
}
export interface Theme extends ThemeKit {
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
  /** The saved choice has been read: the launch intro stays up until then, so a saved Night never opens on a Day frame. */
  ready: boolean;
}

const tonesFor = (p: Palette) => ({
  olive: { bg: p.olivePale, fg: p.olive },
  blue: { bg: p.bluePale, fg: p.blue }, muted: { bg: p.muted, fg: p.secondary },
  error: { bg: p.errorPale, fg: p.error }, warn: { bg: p.warnPale, fg: p.warn },
  shop: { bg: p.shopPale, fg: p.shop },
});

const kit = (name: ThemeName): ThemeKit => ({
  name, palette: palettes[name], colors: colors[name], lines: lines[name], stateLook: stateLook[name],
  statusTone: Object.fromEntries((Object.entries(journeyState) as [OrderStatus, JourneyState][])
    .map(([status, state]) => [status, stateLook[name][state]])) as Record<OrderStatus, StateLook>,
  tones: tonesFor(palettes[name]),
  shadow: { boxShadow: shadows[name].card }, sheetShadow: { boxShadow: shadows[name].sheet },
});
export const themeKits: Record<ThemeName, ThemeKit> = { day: kit('day'), night: kit('night') };

const ThemeContext = createContext<Theme>({ ...themeKits.day, choice: 'auto', setChoice: () => {}, ready: true });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  const captain = me?.user.role === 'driver';
  const [choice, setChoiceState] = useState<ThemeChoice>('auto');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    storage.get(THEME_KEY).then(saved => { if (live && themeChoices.includes(saved as ThemeChoice)) setChoiceState(saved as ThemeChoice); })
      .catch(() => {}).finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  // Whether the sun is down, kept current all the time (a minute timer, and the return to the app, since timers sleep in the
  // background): turning Automatic on or a captain signing in then uses the time now, not the time of launch. An unchanged
  // value is no re-render.
  const [dark, setDark] = useState(() => afterDark(Date.now()));
  useEffect(() => {
    const check = () => setDark(afterDark(Date.now()));
    const timer = setInterval(check, 60_000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') check(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, []);
  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    void storage.set(THEME_KEY, next).catch(() => {});
  }, []);
  const name = resolveTheme(choice, captain, dark);
  const value = useMemo<Theme>(() => ({ ...themeKits[name], choice, setChoice, ready }), [name, choice, setChoice, ready]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
export const usePalette = () => useContext(ThemeContext).palette;

/**
 * A module-level style sheet per theme: `const useStyles = themedStyles(palette => StyleSheet.create({...}))`, then
 * `const styles = useStyles()` in the component. Each theme's sheet is built once, the first time it is used.
 */
export function themedStyles<T>(make: (palette: Palette, theme: ThemeKit) => T): () => T {
  const cache: Partial<Record<ThemeName, T>> = {};
  return function useThemedStyles() {
    const theme = useContext(ThemeContext);
    return cache[theme.name] ??= make(theme.palette, themeKits[theme.name]);
  };
}
