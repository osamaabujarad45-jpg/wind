import type { User } from '../../src/model.ts';

type Register = (method: string, path: string, handler: (ctx: { user: User }) => Promise<unknown>) => unknown;

/** Process-local observations only: reading status never makes an upstream request. */
export function registerRoutingStatusRoutes(route: Register, read: () => object, authorize: (user: User) => void) {
  route('GET', '/api/admin/routing', async ({ user }) => { authorize(user); return read(); });
}
