// One-off proof: an existing database with the old NOT NULL security_events.order_id is rebuilt
// in place, and the upgraded table accepts an account-level audit row (order_id NULL).
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeSqlite } from '../../server/db/sqlite-schema.ts';

const path = join(mkdtempSync(join(tmpdir(), 'wind-audit-')), 'old.db');
let db = new DatabaseSync(path);
initializeSqlite(db);
// Rebuild the table back to the shipped shape so the migration branch sees a real legacy database.
db.exec(`PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;
  DROP TABLE security_events;
  CREATE TABLE security_events (
    id INTEGER PRIMARY KEY, actor_id INTEGER NOT NULL REFERENCES users(id), order_id INTEGER NOT NULL REFERENCES orders(id),
    action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL);
  COMMIT; PRAGMA foreign_keys=ON;`);
db.close();

db = new DatabaseSync(path);
initializeSqlite(db);
const column = db.prepare('PRAGMA table_info(security_events)').all().find(c => c.name === 'order_id');
assert.equal(column.notnull, 0, 'order_id is nullable after the migration');
db.prepare("INSERT INTO users(phone,name,password,role,status,created_at) VALUES('0599000001','Synthetic','x','admin','active',1)").run();
db.prepare("INSERT INTO security_events(actor_id,order_id,action,created_at) VALUES(1,NULL,'SUPPORT_PASSWORD_RESET',2)").run();
assert.equal(db.prepare("SELECT order_id FROM security_events WHERE action='SUPPORT_PASSWORD_RESET'").get().order_id, null);
db.close();
console.log('audit migration: legacy table rebuilt and account-level row accepted');
