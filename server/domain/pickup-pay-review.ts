import type { User } from '../../src/model.ts';
import type { Row } from '../db/persistence.ts';

type Handler = (ctx: { user: User; params: string[]; body: Row }) => Promise<unknown>;
type Register = (method: string, path: string, handler: Handler) => unknown;
export function registerPickupPayRoutes(route: Register, decide: Handler) {
  route('POST', '/api/admin/orders/:id/pickup-pay-review', decide);
}
