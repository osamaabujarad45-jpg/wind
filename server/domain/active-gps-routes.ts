export function registerActiveGpsRoutes<H>(route: (method: string, path: string, handler: H) => void, handler: H) {
  route('POST', '/api/location/session', handler);
}
