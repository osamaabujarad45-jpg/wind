// Persistence gate executes the same policy and HTTP cases against a real isolated PostgreSQL schema.
process.env.WIND_PRIORITY_TEST_POSTGRES = '1';
await import('./parcel-priority.test.mjs');
