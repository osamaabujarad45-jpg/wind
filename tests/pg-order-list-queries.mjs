// T43.2 on PostgreSQL: the same per-page query budget and list/single equivalence, with dispatch, ride and scope rows.
import {freshPostgres,selectRuntime} from './pg-support.mjs';
const pg=await freshPostgres('order_queries');await pg.database.close();selectRuntime(pg.schema);
await import('./order-list-queries.test.mjs');
