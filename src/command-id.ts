/** Retry identity, never a credential or proof secret. */
export function newRequestId(): string {
  const platform = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  if (platform) return platform.call(globalThis.crypto);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const n = Math.floor(Math.random() * 16);
    return (c === 'x' ? n : (n & 3) | 8).toString(16);
  });
}
