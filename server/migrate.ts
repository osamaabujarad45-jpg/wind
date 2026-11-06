import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Persistence, type Row } from './db/persistence.ts';
import { initializePostgres, isolatedSchema, MIGRATION_LOCK } from './db/postgres-schema.ts';

type Table = { name: string; columns: { name: string; type: string; pk: number; notnull: number }[]; keyColumns: string[];
  foreignKeys: { from: string; table: string; to: string }[] };
type Issue = { table: string; key?: string; column?: string; reason: string; code?: string; constraint?: string };
export type Snapshot = { path: string; sha256: string; tables: Table[]; rows: Record<string, Row[]> };
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
// WP08 operational tables are PostgreSQL-only: quotes are 120s-ephemeral and road
// restrictions/policy move only via the operator policy exchange, never snapshot import.
export const NON_LEGACY_TABLES = new Set(['native_push_tokens', 'quotes', 'road_restrictions', 'road_restriction_policy', 'destination_changes', 'dispatch_rounds', 'dispatch_offers', 'assignment_history', 'ride_lifecycle', 'ride_boarding_attempts', 'order_declared_scope', 'custody_records', 'order_scope_checks', 'private_objects', 'private_object_reads', 'ledger_accounts', 'ledger_journals', 'ledger_entries', 'cash_receipts', 'cash_receipt_events','payment_intents','payment_attempts','payment_events','refunds','merchant_cod','merchant_cod_events','support_cases','support_case_events','staff_actions','financial_approvals']);
const NATIVE_PUSH_COLUMNS = ['token_hash','user_id','auth_session_hash','device_hash','platform','expo_push_token','lang','prefs_json','created_at','updated_at','disabled_at'];
// Optional operator CLI history is outside the delivery-data migration contract.
// It stays in the source snapshot; the PostgreSQL API keeps this feature gated.
NON_LEGACY_TABLES.add('opencode_jobs');
// SQLite-only columns carried by the live schema but absent from the Postgres
// snapshot. They stay in the source; the import does not invent a target column.
// T33: PostgreSQL orders carry the commission-rate snapshot, so the import populates it instead of skipping it.
const SQLITE_ONLY_COLUMNS = new Set<string>([]);
const importColumns = (table: Table) => table.columns.filter(c => !SQLITE_ONLY_COLUMNS.has(c.name));
// Sorted at every depth: JSONB reorders nested keys too, so preferences holding quiet hours would never reconcile.
const stable = (value: Row) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const keyOf = (table: Table, row: Row) => hash(table.keyColumns.length
  ? stable(Object.fromEntries(table.keyColumns.map(column => [column,row[column]]))) : stable(row));
export const minor = (amount: number | null) => {
  if (amount === null) return null;
  const result = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(result)) throw new RangeError('Unsafe legacy money');
  return result;
};

/** Online backup produces one consistent SQLite image, including committed WAL pages. No source migration. */
export async function snapshotSqlite(sourcePath: string, snapshotPath: string, freezeWrites = false): Promise<Snapshot> {
  if (resolve(sourcePath) === resolve(snapshotPath) || existsSync(snapshotPath)) throw new Error('Snapshot destination must be a new file');
  mkdirSync(dirname(resolve(snapshotPath)), { recursive: true });
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const freeze = freezeWrites ? new DatabaseSync(sourcePath) : undefined;
  try {
    freeze?.exec('PRAGMA busy_timeout=1000; BEGIN IMMEDIATE');
    await backup(source, snapshotPath);
  } finally { if (freeze?.isTransaction) freeze.exec('ROLLBACK'); freeze?.close(); source.close(); }
  return readSnapshot(snapshotPath);
}

export function readSnapshot(path: string): Snapshot {
  const sqlite = new DatabaseSync(path, { readOnly: true });
  try {
    if (sqlite.prepare('PRAGMA integrity_check').get()!.integrity_check !== 'ok') throw new Error('Snapshot SQLite integrity check failed');
    if (sqlite.prepare('PRAGMA user_version').get()!.user_version !== 3) throw new Error('Snapshot must match the reviewed WP01/WP02 SQLite v3 schema');
    const tables = (sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
      .map(({ name }) => {
        const columns=sqlite.prepare(`PRAGMA table_info(${quote(name)})`).all() as Table['columns'];
        let keyColumns=columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
        if (!keyColumns.length) {
          const unique=sqlite.prepare(`PRAGMA index_list(${quote(name)})`).all() as { name:string; unique:number; partial:number }[];
          for (const index of unique.filter(i=>i.unique && !i.partial).sort((a,b)=>a.name.localeCompare(b.name))) {
            const fields=(sqlite.prepare(`PRAGMA index_info(${quote(index.name)})`).all() as { name:string|null }[]).map(c=>c.name);
            // Nullable/expression/partial unique indexes do not define a total row identity.
            if (fields.length && fields.every(field=>field!==null && columns.some(c=>c.name===field && (c.notnull || c.pk)))) {
              keyColumns=fields as string[];break;
            }
          }
        }
        return {name,columns,keyColumns,foreignKeys:sqlite.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all() as Table['foreignKeys']};
      });
    return { path, sha256: hash(readFileSync(path)), tables,
      rows: Object.fromEntries(tables.map(t => [t.name, sqlite.prepare(`SELECT * FROM ${quote(t.name)}`).all()])) };
  } finally { sqlite.close(); }
}

function preflight(snapshot: Snapshot): Issue[] {
  const issues: Issue[] = [];
  const tableNames = new Set(snapshot.tables.map(t => t.name));
  const parents = new Map<string, Set<unknown>>();
  for (const table of snapshot.tables) for (const fk of table.foreignKeys) if (tableNames.has(fk.table)) {
    const index = `${fk.table}:${fk.to}`;
    if (!parents.has(index)) parents.set(index,new Set(snapshot.rows[fk.table].map(row=>row[fk.to])));
  }
  for (const table of snapshot.tables) {
    const seen = new Set<string>();
    for (const row of snapshot.rows[table.name]) {
      const key = keyOf(table, row);
      if (table.keyColumns.length && seen.has(key)) issues.push({ table: table.name, key, reason: 'duplicate non-null primary/unique key' });
      seen.add(key);
      for (const col of table.columns) if (row[col.name] !== null && col.type === 'INTEGER' && !Number.isSafeInteger(row[col.name]))
        issues.push({ table: table.name, key, column: col.name, reason: 'unsafe integer' });
      for (const fk of table.foreignKeys) if (row[fk.from] !== null && !parents.get(`${fk.table}:${fk.to}`)?.has(row[fk.from]))
        issues.push({ table: table.name, key, column: fk.from, reason: 'foreign key has no matching parent' });
    }
  }
  const active = snapshot.rows.orders?.filter(r => ['assigned','at_pickup','in_transit','on_hold','returning'].includes(r.status)) ?? [];
  const loads = new Map<number, Row[]>();
  for (const row of active) { const load=loads.get(row.driver_id)??[];load.push(row);loads.set(row.driver_id,load); }
  for (const row of active) {
    const load = loads.get(row.driver_id)!;
    if (load.length > 200 || (load.length > 1 && load.some(r => r.service !== 'parcel')))
      issues.push({ table: 'orders', key: keyOf(snapshot.tables.find(t => t.name === 'orders')!, row), reason: 'incompatible legacy active commitments; operator correction required, no coercion' });
  }
  return issues;
}

/** Exact old columns, row keys, financial totals and every open-custody record; reports contain no credential values. */
export async function reconcile(snapshot: Snapshot, database: Persistence) {
  const mismatches: Issue[] = [];
  const tables: Row[] = [];
  for (const table of snapshot.tables) {
    if (NON_LEGACY_TABLES.has(table.name)) continue;
    const columns = importColumns(table);
    const rows = await database.all(`SELECT ${columns.map(c => quote(c.name)).join(',')} FROM ${quote(table.name)}`);
    const group=(values:Row[])=>{
      const grouped=new Map<string,string[]>();
      for(const row of values){const key=keyOf(table,row);const entries=grouped.get(key)??[];entries.push(stable(row));grouped.set(key,entries);}
      for(const entries of grouped.values())entries.sort();
      return grouped;
    };
    const source = group(snapshot.rows[table.name].map(row => Object.fromEntries(columns.map(c => [c.name, row[c.name]])))), target = group(rows);
    for (const [key, value] of source) if (JSON.stringify(target.get(key)) !== JSON.stringify(value)) mismatches.push({ table: table.name, key, reason: target.has(key) ? 'row/multiplicity differs' : 'missing key' });
    for (const key of target.keys()) if (!source.has(key)) mismatches.push({ table: table.name, key, reason: 'unexpected key' });
    tables.push({ table: table.name, keyColumns:table.keyColumns, sourceRows: snapshot.rows[table.name].length, targetRows: rows.length,
      sourceKeys: hash(snapshot.rows[table.name].map(row=>keyOf(table,row)).sort().join('\n')), targetKeys: hash(rows.map(row=>keyOf(table,row)).sort().join('\n')),
      sourceRowsHash: hash(snapshot.rows[table.name].map(stable).sort().join('\n')),
      targetRowsHash: hash(rows.map(stable).sort().join('\n')) });
  }
  // Compared by content: JSONB reorders keys and comes back parsed, and only the hash ever reaches the report.
  const pushRows = (rows: Row[]) => new Map(rows.map(row => [hash(String(row.token_hash)), stable({ ...row, prefs_json: stable(typeof row.prefs_json === 'string' ? JSON.parse(row.prefs_json) : row.prefs_json) })]));
  const pushSource = pushRows(snapshot.rows.native_push_tokens ?? []), pushTarget = pushRows(await database.all(`SELECT ${NATIVE_PUSH_COLUMNS.join(',')} FROM native_push_tokens`));
  for (const [key, value] of pushSource) if (pushTarget.get(key) !== value) mismatches.push({ table: 'native_push_tokens', key, reason: pushTarget.has(key) ? 'row/multiplicity differs' : 'missing key' });
  for (const key of pushTarget.keys()) if (!pushSource.has(key)) mismatches.push({ table: 'native_push_tokens', key, reason: 'unexpected key' });
  tables.push({ table: 'native_push_tokens', keyColumns: ['token_hash'], sourceRows: pushSource.size, targetRows: pushTarget.size,
    sourceKeys: hash([...pushSource.keys()].sort().join('\n')), targetKeys: hash([...pushTarget.keys()].sort().join('\n')) });
  const sum = (rows: Row[], column: string, money = false) => rows.reduce((total, row) => total + BigInt(money ? minor(row[column]) ?? 0 : row[column] ?? 0), 0n).toString();
  const orders = snapshot.rows.orders;
  const cash = snapshot.rows.cash_entries;
  const financial = {
    priceMinor: sum(orders, 'price', true), commissionMinor: sum(orders, 'commission', true), discountMinor: sum(orders, 'discount', true),
    cashCents: sum(cash, 'amount_cents'),
    openRemittanceCents: sum(cash.filter(r => r.status === 'pending'), 'amount_cents'),
    finishedCommissionMinor: sum(orders.filter(r => ['completed','returned'].includes(r.status)), 'commission', true),
    finishedDiscountMinor: sum(orders.filter(r => ['completed','returned'].includes(r.status)), 'discount', true),
  };
  const pgOrders = await database.all('SELECT price_minor,commission_minor,discount_minor,status FROM orders');
  const pgCash = await database.all('SELECT amount_cents,status FROM cash_entries');
  const targetFinancial = {
    priceMinor: sum(pgOrders, 'price_minor'), commissionMinor: sum(pgOrders, 'commission_minor'), discountMinor: sum(pgOrders, 'discount_minor'),
    cashCents: sum(pgCash, 'amount_cents'), openRemittanceCents: sum(pgCash.filter(r => r.status === 'pending'), 'amount_cents'),
    finishedCommissionMinor: sum(pgOrders.filter(r => ['completed','returned'].includes(r.status)), 'commission_minor'),
    finishedDiscountMinor: sum(pgOrders.filter(r => ['completed','returned'].includes(r.status)), 'discount_minor'),
  };
  if (stable(financial) !== stable(targetFinancial)) mismatches.push({ table: 'financial', reason: 'minor-unit totals differ' });
  const obligations: Row[] = [];
  for (const driver of new Set([...orders.map(r => r.driver_id), ...cash.map(r => r.driver_id), ...snapshot.rows.users.filter(r => r.role === 'driver').map(r => r.id)].filter(v => v !== null))) {
    const sourceOrders = orders.filter(r => r.driver_id === driver && ['completed','returned'].includes(r.status));
    const sourceCash = cash.filter(r => r.driver_id === driver);
    const owed = BigInt(sum(sourceOrders, 'commission', true)) - BigInt(sum(sourceOrders, 'discount', true))
      + BigInt(sum(sourceCash.filter(r => r.kind === 'adjustment'), 'amount_cents'))
      - BigInt(sum(sourceCash.filter(r => r.kind === 'remittance' && r.status === 'confirmed'), 'amount_cents'));
    const pg = (await database.one(`SELECT COALESCE((SELECT SUM(COALESCE(commission_minor,0)-COALESCE(discount_minor,0)) FROM orders WHERE driver_id=? AND status IN ('completed','returned')),0)
      +COALESCE((SELECT SUM(amount_cents) FROM cash_entries WHERE driver_id=? AND kind='adjustment'),0)
      -COALESCE((SELECT SUM(amount_cents) FROM cash_entries WHERE driver_id=? AND kind='remittance' AND status='confirmed'),0) owed`, driver, driver, driver))!;
    if (BigInt(pg.owed) !== owed) mismatches.push({ table: 'financial', key: hash(String(driver)), reason: 'driver open obligation differs' });
    obligations.push({ driverKey: hash(String(driver)), owedCents: owed.toString(), targetOwedCents: String(pg.owed),
      pendingCents: sum(sourceCash.filter(r => r.status === 'pending'), 'amount_cents') });
  }
  const openCustody = orders.filter(r => ['assigned','at_pickup','in_transit','on_hold','returning'].includes(r.status)).map(r => r.id).sort((a,b) => a-b);
  const targetCustody = (await database.all("SELECT id FROM orders WHERE status IN ('assigned','at_pickup','in_transit','on_hold','returning') ORDER BY id")).map(r => r.id);
  if (JSON.stringify(openCustody) !== JSON.stringify(targetCustody)) mismatches.push({ table: 'orders', reason: 'open custody differs' });
  return { ok: !mismatches.length, tables, financial, targetFinancial, obligations, openCustodyCount: openCustody.length, mismatches };
}

export async function importSnapshot(snapshot: Snapshot, database: Persistence, schema: string, reportPath?: string) {
  isolatedSchema(schema);
  const errors = preflight(snapshot);
  const rounding: Row[] = [];
  let reconciliation: Awaited<ReturnType<typeof reconcile>> | undefined;
  try {
    await initializePostgres(database, schema);
    await database.migrate(MIGRATION_LOCK, async () => {
      await database.run(`SET LOCAL search_path TO ${schema}, public`);
      const actual = await database.all("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=?", schema);
      for (const table of snapshot.tables) {
        if (NON_LEGACY_TABLES.has(table.name)) continue;
        const columns = actual.filter(c => c.table_name === table.name).map(c => c.column_name);
        if (importColumns(table).some(c => !columns.includes(c.name))) errors.push({ table: table.name, reason: 'unreviewed SQLite schema/column; update migration explicitly' });
        if (columns.length && (await database.one(`SELECT COUNT(*) count FROM ${quote(table.name)}`))!.count) errors.push({ table: table.name, reason: 'target is not empty; never merge or overwrite' });
      }
      const legacyTables = actual.map(r => r.table_name).filter(name => !['schema_migrations','driver_run_resources','service_zone_geometries','command_results','event_sequences','domain_events','outbox','consumer_inbox','event_projection',
        'firebase_resets','eligibility_policy','service_areas','route_permissions','vehicles','driver_eligibility','driver_vehicles','verification_checks','order_requirements','vehicle_runs','capacity_reservations','capacity_stops','eligibility_offers','eligibility_audit','order_approaches',
        'phone_profiles','phone_mappings','phone_aliases','phone_challenges','phone_command_results','phone_rate_windows','phone_provider_budget','phone_audit',
        'driver_presence_sessions','driver_latest_locations','driver_presence_audit','driver_active_gps_sessions','driver_active_gps_session_ids','driver_active_gps_generations','native_push_tokens','quotes','road_restrictions','road_restriction_policy','dispatch_rounds','dispatch_offers','assignment_history','ride_lifecycle','ride_boarding_attempts','order_declared_scope','custody_records','order_scope_checks','private_objects','private_object_reads','ledger_accounts','ledger_journals','ledger_entries','cash_receipts','cash_receipt_events','payment_intents','payment_attempts','payment_events','refunds','merchant_cod','merchant_cod_events','support_cases','support_case_events','staff_actions','financial_approvals'].includes(name));
      for (const name of new Set(legacyTables)) if (!snapshot.tables.some(t => t.name === name)) errors.push({ table: name, reason: 'required legacy table missing from snapshot' });
      if (errors.length) throw new Error('Snapshot preflight failed');
      // Assignment guards lock accounts; insert users before the deferred-reference tables.
      for (const table of [...snapshot.tables].sort((a,b) => Number(b.name === 'users') - Number(a.name === 'users'))) for (const row of snapshot.rows[table.name]) {
        if (NON_LEGACY_TABLES.has(table.name)) continue; // policy seed installed by migration 11; quotes/restrictions are PG-only (see preflight)
        const key = keyOf(table, row);
        await database.run('SAVEPOINT import_row');
        try {
          if (table.name === 'orders') for (const column of ['price','commission','discount']) {
            const amount = row[column]; const cents = minor(amount);
            if (amount !== null && cents! / 100 !== amount) rounding.push({ table: table.name, key, column, legacyAmount: amount, minor: cents });
          }
          const columns = importColumns(table);
          await database.run(`INSERT INTO ${quote(table.name)} (${columns.map(c => quote(c.name)).join(',')}) VALUES(${columns.map(() => '?').join(',')})`, ...columns.map(c => row[c.name]));
        } catch (error) {
          await database.run('ROLLBACK TO SAVEPOINT import_row');
          const e = error as { code?: string; constraint?: string };
          errors.push({ table: table.name, key, reason: 'row rejected; retained source unchanged', code: e.code, constraint: e.constraint });
        }
        await database.run('RELEASE SAVEPOINT import_row');
      }
      // Closed apps hear alerts only through these rows. Not in the generic pass: their sessions must exist first, and
      // prefs_json changes type. A snapshot from before closed-app alerts has none. A rejected row reports its key, never the token.
      for (const row of snapshot.rows.native_push_tokens ?? []) {
        await database.run('SAVEPOINT import_row');
        try {
          await database.run(`INSERT INTO native_push_tokens(${NATIVE_PUSH_COLUMNS.join(',')}) VALUES(?,?,?,?,?,?,?,?::jsonb,?,?,?)`, ...NATIVE_PUSH_COLUMNS.map(c => row[c]));
        } catch (error) {
          await database.run('ROLLBACK TO SAVEPOINT import_row');
          const e = error as { code?: string; constraint?: string };
          errors.push({ table: 'native_push_tokens', key: hash(String(row.token_hash)), reason: 'row rejected; retained source unchanged', code: e.code, constraint: e.constraint });
        }
        await database.run('RELEASE SAVEPOINT import_row');
      }
      if (errors.length) throw new Error('Invalid legacy rows require review');
      await database.run('SET CONSTRAINTS ALL IMMEDIATE');
      await database.run("INSERT INTO driver_run_resources(driver_id) SELECT id FROM users WHERE role='driver' ON CONFLICT DO NOTHING");
      for (const table of snapshot.tables.filter(t => !NON_LEGACY_TABLES.has(t.name) && t.columns.some(c => c.name === 'id' && c.pk)))
        {
          // UUID/singleton keys have no serial sequence; MAX(uuid) would raise 42883.
          const sequence = (await database.one(`SELECT pg_get_serial_sequence(?, 'id') AS sequence`, `${schema}.${table.name}`))?.sequence;
          if (!sequence) continue;
          await database.one(`SELECT setval(?, GREATEST(COALESCE((SELECT MAX(id) FROM ${quote(table.name)}),0),1), EXISTS(SELECT 1 FROM ${quote(table.name)}))`, sequence);
        }
      reconciliation = await reconcile(snapshot, database);
      if (!reconciliation.ok) throw new Error('Import reconciliation failed');
    });
  } catch (error) {
    const code=(error as {code?:unknown}).code;
    if (!errors.length && !reconciliation?.mismatches.length) errors.push({ table: 'import', reason: 'schema/import transaction failed before acceptance',
      ...(typeof code==='string' && /^[0-9A-Z]{5}$/.test(code) ? {code} : {}) });
  }
  const report = { formatVersion: 1, schema, snapshotSha256: snapshot.sha256, ok: !errors.length && reconciliation?.ok === true,
    errors, rounding, reconciliation, runtimeActivated: false, writableSource: 'sqlite' };
  if (reportPath) { mkdirSync(dirname(resolve(reportPath)), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }); }
  return report;
}

if (import.meta.main) {
  const [source, destination, schema, report] = process.argv.slice(2);
  if (!source || !destination || !schema || !report || !process.env.WIND_DATABASE_URL) throw new Error('Usage: WIND_DATABASE_URL=<local test URL> node server/migrate.ts source.sqlite new-snapshot.sqlite wp03_<name> report.json');
  const url = new URL(process.env.WIND_DATABASE_URL);
  if (process.env.NODE_ENV !== 'test' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Only isolated loopback migration rehearsals are enabled');
  // Rehearsals share one migration lock. A concurrent schema setup may legitimately take
  // longer than the short request lock budget; keep this CLI bounded but allow it to finish.
  const database = new Persistence({ connectionString: url.href, pool: { options: `-c search_path=${isolatedSchema(schema)},public` },
    statementTimeoutMs: 30_000, lockTimeoutMs: 30_000 });
  try {
    const result = await importSnapshot(await snapshotSqlite(source, destination, process.argv.includes('--freeze-writes')), database, schema, report);
    console.log(JSON.stringify({ ok: result.ok, schema, report, runtimeActivated: false }));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    mkdirSync(dirname(resolve(report)), { recursive: true });
    const code=(error as {code?:unknown}).code;
    writeFileSync(report,JSON.stringify({ ok:false, schema, errors:[{ reason:'snapshot/import rehearsal failed before reconciliation',
      ...(typeof code==='string' && /^[0-9A-Z]{5}$/.test(code) ? {code} : {}) }], runtimeActivated:false },null,2),{mode:0o600});
    console.error('Migration rehearsal failed; inspect the local error report'); process.exitCode=1;
  } finally { await database.close(); }
}

