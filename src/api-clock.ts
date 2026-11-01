let offset = 0;
/** Server clock minus device clock. Long-held responses cannot reliably estimate skew. */
export const serverOffset = () => offset;
export function noteServerDate(date: string | null, now = Date.now(), roundTripMs = 0) {
  const server = date ? Date.parse(date) : NaN;
  if (Number.isFinite(server) && roundTripMs <= 5_000) offset = Math.abs(server - now) > 5_000 + roundTripMs ? server - now : 0;
}
