// Without Web Locks (native, or an older browser) one app process still runs one holder of a lock at a time: two screen
// instances that share a saved record wait for each other (Sol R17-M2). Another process is not covered here. A holder
// that rejects or throws never blocks the next one. Dependency-free so a Node test can exercise it (Haiku r17 N7c).
const chains = new Map<string, Promise<unknown>>();
export function inProcess<T>(lock: string, run: () => Promise<T>): Promise<T> {
  const next = (chains.get(lock) ?? Promise.resolve()).then(run, run);
  chains.set(lock, next.catch(() => undefined));
  return next;
}
