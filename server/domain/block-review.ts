// DRV-17 / SRS §2.1 block review route. The handler stays in main.ts beside the courier block it reviews; this file only
// declares the boundary, so the installed main.ts route inventory stays frozen and the additive inventory lists it.
type Register = (method: string, path: string, handler: (ctx: { user: any; params: string[]; body: any }) => Promise<unknown>) => unknown;
export function registerBlockReviewRoutes(route: Register, decide: (ctx: { user: any; params: string[]; body: any }) => Promise<unknown>) {
  route('POST', '/api/admin/orders/:id/block-review', decide);
}
