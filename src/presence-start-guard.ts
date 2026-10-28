/** Fence permission prompts and provider checks against lifecycle and assignment changes. */
export function createPresenceStartGuard() {
  let revision = 0;
  return {
    snapshot: () => revision,
    invalidate: () => { revision++; },
    allows: (snapshot: number, state: { foreground: boolean; known: boolean; hasOrder: boolean }) =>
      snapshot === revision && state.foreground && state.known && !state.hasOrder,
  };
}
