// X-01: OS text scale stays on up to Android's largest step (2.0). Layouts use minHeight/wrap so they grow with it.
// Only fixed-size chrome (tab labels, badge counts, map labels) keeps a lower cap, set where it is used.
export const maxScale = 2;
// Past this scale numberOfLines would clip important text, so it is dropped and the text wraps (rows are minHeight/flexShrink).
export const wrapAbove = 1.35;
export const linesFor = (n: number | undefined, fontScale: number) => fontScale > wrapAbove ? undefined : n;
