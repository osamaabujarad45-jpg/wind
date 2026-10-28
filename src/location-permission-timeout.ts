// Expo's web permission request waits for a position, which a browser may never
// deliver. A timed-out attempt must not keep an Accept button busy forever.
export async function boundedPermission<T>(request: () => Promise<T>, timeoutMs = 15_000): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request(), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
