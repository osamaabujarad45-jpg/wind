import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { RecoverySlot } from './protected-recovery';

export type PendingDeadlineWake = { scope: string; id: string };
// `declare class ... extends` is required: `NativeModule<T>` used as a type is the constructor,
// so an intersection would drop the inherited EventEmitter members such as addListener.
declare class DeadlineModule extends NativeModule<{ onWake: () => void }> {
  put(scope: string, slot: RecoverySlot, identity: number, lifetime: number): Promise<void>;
  cancel(scope: string, slot: RecoverySlot): Promise<void>;
  clear(): Promise<void>;
  pending(): Promise<PendingDeadlineWake | null>;
  acknowledge(scope: string, id: string): Promise<void>;
}

// A rebuilt Android binary owns alarms. Expo Go, web and iOS retain foreground recovery.
const native = Platform.OS === 'android' ? requireOptionalNativeModule<DeadlineModule>('WindDeadlineWake') : null;
export const deadlineWake = {
  update: async (scope: string, slot: RecoverySlot, expiresAt: number | null, remaining: number) => {
    if (expiresAt === null) await native?.cancel(scope, slot);
    else await native?.put(scope, slot, expiresAt, remaining);
  },
  clear: async () => { await native?.clear(); },
  pending: async () => await native?.pending() ?? null,
  acknowledge: async (wake: PendingDeadlineWake) => { await native?.acknowledge(wake.scope, wake.id); },
  subscribe: (listener: () => void) => native?.addListener('onWake', listener),
};
