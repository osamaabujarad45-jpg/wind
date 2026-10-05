// Web stand-in for the slice of Reanimated the app uses (SPEC-web-bundle.md part 2): browsers already run CSS
// animations off the main thread, so this maps the same props onto CSS and keeps ~450 kB of Reanimated out of the
// web bundle. Native keeps the real library through motion.native.ts.
import { StyleSheet, View, type ViewProps } from 'react-native';

type Step = { opacity?: number; transform?: Record<string, number>[] };
type Keyframes = Record<string, Step>;

const css2 = (step: Step) => {
  const parts: string[] = [];
  if (step.opacity !== undefined) parts.push(`opacity:${step.opacity}`);
  if (step.transform) parts.push(`transform:${step.transform.map(t => Object.entries(t).map(([k, v]) =>
    `${k}(${v}${k.startsWith('translate') ? 'px' : ''})`).join(' ')).join(' ')}`);
  return parts.join(';');
};

// One @keyframes rule per distinct keyframes object, injected on first use.
const names = new Map<string, string>();
let sheet: CSSStyleSheet | undefined;
function keyframesName(frames: Keyframes) {
  const key = JSON.stringify(frames);
  let name = names.get(key);
  if (!name) {
    name = `wind-motion-${names.size}`;
    names.set(key, name);
    if (!sheet) {
      const el = document.createElement('style');
      el.dataset.motion = '';
      document.head.appendChild(el);
      sheet = el.sheet!;
    }
    sheet.insertRule(`@keyframes ${name}{${Object.entries(frames).map(([at, step]) => `${at}{${css2(step)}}`).join('')}}`, sheet.cssRules.length);
  }
  return name;
}

type AnyStyle = unknown;
// Swap keyframes objects for injected names; registered StyleSheet styles and everything else pass through untouched.
function webStyle(style: AnyStyle): AnyStyle {
  if (Array.isArray(style)) return style.map(webStyle);
  if (style && typeof style === 'object' && typeof (style as { animationName?: unknown }).animationName === 'object')
    return { ...style, animationName: keyframesName((style as { animationName: Keyframes }).animationName) };
  return style;
}

/** Entering preset: keyframes plus chainable duration/delay, like Reanimated's builders. */
class Preset {
  constructor(readonly frames: Keyframes, readonly ms = 300, readonly wait = 0) {}
  duration(ms: number) { return new Preset(this.frames, ms, this.wait); }
  delay(ms: number) { return new Preset(this.frames, this.ms, ms); }
  get style() {
    return { animationName: keyframesName(this.frames), animationDuration: `${this.ms}ms`, animationDelay: `${this.wait}ms`,
      animationTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)', animationFillMode: 'both' };
  }
}
export const FadeIn = new Preset({ from: { opacity: 0 }, to: { opacity: 1 } });
export const FadeInDown = new Preset({ from: { opacity: 0, transform: [{ translateY: 25 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } });
export const FadeInUp = new Preset({ from: { opacity: 0, transform: [{ translateY: -25 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } });
export const ZoomIn = new Preset({ from: { transform: [{ scale: 0 }] }, to: { transform: [{ scale: 1 }] } });
// ponytail: exit and layout animations are skipped on web (a view leaves instantly, a list reflows without gliding).
// The splash fade that matters is done with a plain CSS animation in _layout.tsx.
export const FadeOut = new Preset({ from: { opacity: 1 }, to: { opacity: 0 } });
export const LinearTransition = { duration: (_ms: number) => undefined };

type Props = ViewProps & { entering?: Preset; exiting?: unknown; layout?: unknown; style?: AnyStyle };
function AnimatedView({ entering, exiting: _exit, layout: _layout, style, ...rest }: Props) {
  return <View {...rest} style={[entering?.style, webStyle(style)] as ViewProps['style']} />;
}
export default { View: AnimatedView };

export const cubicBezier = (x1: number, y1: number, x2: number, y2: number) => `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;

// CSS transitions: react-native-web wants CSS property names in transitionProperty.
const kebab = (p: string) => p.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
export const css = {
  create: <T extends Record<string, object>>(styles: T): T => StyleSheet.create(Object.fromEntries(Object.entries(styles).map(([k, v]) => {
    const p = (v as { transitionProperty?: string | string[] }).transitionProperty;
    return [k, p ? { ...v, transitionProperty: (Array.isArray(p) ? p : [p]).map(kebab).join(', ') } : v];
  })) as T),
};

const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Read once, like Reanimated's hook. */
export const useReducedMotion = () => reduced;
