import type { PendingDeadlineWake } from './deadline-wake';

type IO = {
  revision: () => number;
  active: () => boolean;
  read: () => Promise<PendingDeadlineWake | null>;
  reconcile: () => Promise<void>;
  acknowledge: (wake: PendingDeadlineWake) => Promise<void>;
};

/** Coalesce duplicate wakes; only an active, unchanged session can acknowledge fresh reads. */
export function createDeadlineReconciler(io: IO) {
  let running: Promise<void> | null = null;
  return () => {
    if (running) return running;
    const revision = io.revision();
    const valid = () => io.active() && revision === io.revision();
    running = (async () => {
      if (!valid()) return;
      const wake = await io.read();
      if (!wake || !valid()) return;
      await io.reconcile();
      if (valid()) await io.acknowledge(wake);
    })().finally(() => { running = null; });
    return running;
  };
}
