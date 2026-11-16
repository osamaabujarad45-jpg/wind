// The shop delivery flow on PostgreSQL (migration 33): the same assertions as tests/shop-flow.test.mjs.
import {freshPostgres,selectRuntime} from './pg-support.mjs';
const pg=await freshPostgres('shop');await pg.database.close();selectRuntime(pg.schema);
await import('./shop-flow.test.mjs');
