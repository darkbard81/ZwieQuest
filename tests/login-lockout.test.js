import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalAuth } from '../src/auth.js';

const password = '012345', wrong = '999999';
const rejected = async promise => { try { await promise; assert.fail('Expected login rejection'); } catch (e) { if (e.code === 'ERR_ASSERTION') throw e; return e; } };
const locked = e => { assert.equal(e.status, 429); assert.equal(e.code, 'LOGIN_LOCKED'); assert.ok(e.retryAfter > 0); };

test('fifth failure locks; restart retains deadline; correct password cannot bypass; exact expiry resets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zwiequest-login-lock-')), file = join(dir, 'auth.sqlite');
  let now = 1000000, db = new DatabaseSync(file), auth = new LocalAuth(db, false, () => now);
  try {
    const user = await auth.register('lock_fixture', password);
    for (let n = 0; n < 4; n++) assert.equal((await rejected(auth.login('LOCK_fixture', wrong))).status, undefined);
    const fifth = await rejected(auth.login('lock_fixture', wrong)); locked(fifth); assert.equal(fifth.retryAfter, 300);
    const deadline = db.prepare('SELECT locked_until FROM login_attempts').get().locked_until;
    now += 1000;
    const retry = await rejected(auth.login('lock_fixture', password)); locked(retry); assert.equal(retry.retryAfter, 299);
    assert.equal(db.prepare('SELECT locked_until FROM login_attempts').get().locked_until, deadline);
    db.close(); db = new DatabaseSync(file); auth = new LocalAuth(db, false, () => now);
    locked(await rejected(auth.login('lock_fixture', password)));
    now = deadline - 1; assert.equal((await rejected(auth.login('lock_fixture', password))).retryAfter, 1);
    now = deadline; assert.equal((await auth.login('lock_fixture', password)).id, user.id);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM login_attempts').get().n, 0);
    assert.equal(auth.loginQueues.size, 0);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('success clears consecutive failures; expired lock starts with failure one', async () => {
  const db = new DatabaseSync(':memory:'); let now = 1000000;
  const auth = new LocalAuth(db, false, () => now);
  try {
    await auth.register('reset_fixture', password);
    for (let i = 0; i < 4; i++) await rejected(auth.login('reset_fixture', wrong));
    await auth.login('reset_fixture', password);
    for (let i = 0; i < 4; i++) assert.equal((await rejected(auth.login('reset_fixture', wrong))).status, undefined);
    locked(await rejected(auth.login('reset_fixture', wrong)));
    now += 300000;
    assert.equal((await rejected(auth.login('reset_fixture', wrong))).status, undefined);
    assert.equal(db.prepare('SELECT failures FROM login_attempts').get().failures, 1);
  } finally { db.close(); }
});

test('concurrent failures cannot lose counts or allow a queued correct password through', async () => {
  const db = new DatabaseSync(':memory:'), auth = new LocalAuth(db);
  try {
    await auth.register('race_fixture', password);
    const attempts = Array.from({ length: 10 }, (_, n) => rejected(auth.login(n % 2 ? 'RACE_fixture' : 'race_fixture', wrong)));
    attempts.push(rejected(auth.login('race_fixture', password)));
    const errors = await Promise.all(attempts);
    assert.deepEqual(errors.map(e => e.status ?? 400), [400,400,400,400,429,429,429,429,429,429,429]);
    assert.equal(db.prepare('SELECT failures FROM login_attempts').get().failures, 5);
    assert.equal(auth.loginQueues.size, 0);
  } finally { db.close(); }
});

test('unknown names have identical errors and lock timing; malformed passwords count; accounts remain independent', async () => {
  const db = new DatabaseSync(':memory:'), auth = new LocalAuth(db, false, () => 1000000);
  try {
    await auth.register('known_fixture', password);
    await auth.register('other_fixture', password);
    for (let i = 0; i < 5; i++) {
      const a = await rejected(auth.login('known_fixture', 'bad-format'));
      const b = await rejected(auth.login('unknown_fixture', 'bad-format'));
      assert.deepEqual([a.message,a.status,a.retryAfter], [b.message,b.status,b.retryAfter]);
      if (i === 4) locked(a);
    }
    locked(await rejected(auth.login('known_fixture', password)));
    await auth.login('other_fixture', password);
    await assert.rejects(auth.login({}, password), /아이디 또는 비밀번호/);
    await assert.rejects(auth.login('x'.repeat(25), password), /아이디 또는 비밀번호/);
  } finally { db.close(); }
});
