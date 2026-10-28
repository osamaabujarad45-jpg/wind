import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Persistence } from '../server/db/persistence.ts';
import { driverStatistics } from '../server/domain/statistics.ts';
import { freshPostgres } from './pg-support.mjs';
for(const backend of ['sqlite','postgres']){
  const sqlite=backend==='sqlite'?new DatabaseSync(':memory:'):undefined;
  const pg=backend==='postgres'?await freshPostgres('memo'):undefined;
  const database=pg?.database??new Persistence({sqlite});
  try{
    // Temporary tables keep the test independent of API fixture hooks and foreign-key setup.
    if(backend==='sqlite')sqlite.exec('CREATE TABLE orders(id INTEGER PRIMARY KEY,driver_id INTEGER,status TEXT,rating INTEGER,price_rating INTEGER)');
    else await database.run('CREATE TABLE memo_orders(id BIGINT PRIMARY KEY,driver_id BIGINT,status TEXT,rating BIGINT,price_rating BIGINT)');
    const table=backend==='sqlite'?'orders':'memo_orders';
    const reader={memo:database.memo.bind(database),one:(sql,...p)=>database.one(sql.replaceAll('FROM orders',`FROM ${table}`),...p)};
    await database.run(`INSERT INTO ${table}(id,driver_id,status,rating,price_rating) VALUES(1,1,'completed',3,4)`);
    const stats=()=>driverStatistics(reader,1,"'completed','returned'");
    const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
    const updated=gate(),release=gate();let outside;
    const rollback=database.scope(async()=>{
      assert.equal((await stats()).rating,3);
      const first=stats(),second=stats();assert.equal(await first,await second,'same request reuses aggregate value');
      await database.exec('BEGIN');
      await database.run(`UPDATE ${table} SET rating=5 WHERE id=1`);
      assert.equal((await stats()).rating,5,'write invalidates memo');
      updated.resolve();await release.promise;
      await database.exec('ROLLBACK');
      assert.equal((await stats()).rating,3,'rollback invalidates transaction value');
    });
    await updated.promise;
    if(backend==='postgres')outside=await database.scope(stats);
    release.resolve();await rollback;
    if(outside)assert.equal(outside.rating,3,'another owner cannot see cached uncommitted stats');
    await database.scope(async()=>{
      assert.equal((await stats()).rating,3);
      await database.run(`UPDATE ${table} SET rating=2 WHERE id=1`);
      assert.equal((await stats()).rating,2,'nontransactional write invalidates memo');
    });
    assert.equal((await database.scope(stats)).rating,2,'next request reads committed state');
    console.log(`${backend}: request aggregate reuse, write/begin/rollback invalidation, owner isolation passed`);
  }finally{await database.close();sqlite?.close();}
}
