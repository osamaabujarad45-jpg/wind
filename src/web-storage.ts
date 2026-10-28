// Web key-value storage. Pure: the storage comes in as a getter, so node tests drive the same code the browser runs.
// Best-effort by default (a blocked or full storage reads as empty and drops the write). A required call lets the error out,
// so a caller that must read or save a value (a pending command receipt) fails closed instead of guessing.
export type WebStore = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const safe = <T>(fn: () => T): T | null => {
  try { return fn(); } catch { return null; }
};

export function webGet(store: WebStore, key: string, required = false): string | null {
  return required ? store().getItem(key) : safe(() => store().getItem(key));
}

export function webSet(store: WebStore, key: string, value: string | null, required = false): void {
  const write = () => value === null ? store().removeItem(key) : store().setItem(key, value);
  if (required) write();
  else safe(write);
}
