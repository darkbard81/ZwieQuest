import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AccountAdmin, forgetAccount } from '../src/admin.js';
function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT UNIQUE,created_at INTEGER);
    CREATE TABLE admin_accounts(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE sessions(user_id TEXT REFERENCES users(id), marker TEXT);
    CREATE TABLE account_state(user_id TEXT PRIMARY KEY,body TEXT);
    CREATE TABLE user_events(user_id TEXT,seq INTEGER,body TEXT);
    CREATE TABLE requests(user_id TEXT,id TEXT,body TEXT);
    INSERT INTO users VALUES('owner','fixture_owner',1),('target','fixture_target',2),('other','fixture_other',3);
    INSERT INTO admin_accounts VALUES('owner');
    INSERT INTO sessions VALUES('target','mock'),('other','mock');
    INSERT INTO account_state VALUES('target','{}'),('other','{}');
    INSERT INTO user_events VALUES('target',1,'{}'),('other',1,'{}');
    INSERT INTO requests VALUES('target','mock','{}'),('other','mock','{}');`);
  return { db, admin: new AccountAdmin(db) };
}
test('metadata only; ordinary or missing actors cannot list/delete; self and mismatched confirmation blocked', () => {
  const {db,admin}=setup();
  try {
    const list=admin.list('owner');assert.equal(list.length,3);
    assert.deepEqual(Object.keys(list[0]).sort(),['id','username','createdAt','isAdmin','hasCharacter'].sort());
    for(const id of ['other','missing']){assert.throws(()=>admin.list(id),e=>e.status===403);assert.throws(()=>admin.remove(id,'target','fixture_target'),e=>e.status===403);}
    assert.throws(()=>admin.remove('owner','owner','fixture_owner'),e=>e.status===409);
    assert.throws(()=>admin.remove('owner','target','wrong'),e=>e.status===409);
    assert.throws(()=>admin.remove('owner','missing','fixture_target'),e=>e.status===404);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n,3);
  } finally {db.close();}
});
test('one account and all linked records removed atomically; other fixtures retained', () => {
  const {db,admin}=setup();
  try {
    assert.equal(admin.remove('owner','target','fixture_target').id,'target');
    for(const table of ['sessions','account_state','user_events','requests']){
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id='target'`).get().n,0);
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id='other'`).get().n,1);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n,2);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{db.close();}
});
test('failed deletion rolls back every related table', () => {
  const {db,admin}=setup();
  try {
    db.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON users WHEN OLD.id='target' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END;");
    assert.throws(()=>admin.remove('owner','target','fixture_target'),/fixture rollback/);
    for(const table of ['sessions','account_state','user_events','requests'])assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id='target'`).get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n,3);
  }finally{db.close();}
});
test('deleted account is removed from scheduler, sessions and streams without touching others',()=>{
 let ended=0;const one={end(){ended++}},other={end(){throw Error('Other stream closed')}};
 const state={games:new Map([['target',{}],['other',{}]]),clients:new Map([[one,{id:'target'}],[other,{id:'other'}]]),presence:new Map([['a',{userId:'target'}],['b',{userId:'other'}]]),commandRates:new Map([['target',{}],['other',{}]])};
 forgetAccount('target',state);assert.equal(ended,1);for(const key of Object.keys(state))assert.equal(state[key].size,1);
 assert.ok(state.games.has('other'));assert.ok(state.clients.has(other));
});
