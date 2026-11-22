// The theme context for tests that load a screen with mocked imports: the real Day (or Night) tokens from src/theme.ts,
// without React. `themeModules('./')` returns the module map entries for a file in src/, `('../')` for one in src/app/.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const theme = require('../src/theme.ts');

export function themeKit(name = 'day') {
  const { colors, journeyState, lines, palettes, shadows, stateLook } = theme;
  const p = palettes[name];
  return {
    name, palette: p, colors: colors[name], lines: lines[name], stateLook: stateLook[name],
    statusTone: Object.fromEntries(Object.entries(journeyState).map(([status, state]) => [status, stateLook[name][state]])),
    tones: { olive: { bg: p.olivePale, fg: p.olive }, blue: { bg: p.bluePale, fg: p.blue }, muted: { bg: p.muted, fg: p.secondary },
      error: { bg: p.errorPale, fg: p.error }, warn: { bg: p.warnPale, fg: p.warn }, shop: { bg: p.shopPale, fg: p.shop } },
    shadow: { boxShadow: shadows[name].card }, sheetShadow: { boxShadow: shadows[name].sheet },
  };
}

export function themeContextMock(name = 'day') {
  const kit = themeKit(name);
  return {
    themeChoices: theme.themeChoices, themeKits: { day: themeKit('day'), night: themeKit('night') },
    useTheme: () => ({ ...kit, choice: 'auto', setChoice() {} }), usePalette: () => kit.palette,
    themedStyles: make => () => make(kit.palette, kit),
  };
}

export const themeModules = (prefix, name = 'day') => ({ [`${prefix}theme-context`]: themeContextMock(name), [`${prefix}theme`]: theme });
