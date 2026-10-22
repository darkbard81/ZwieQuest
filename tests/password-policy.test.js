import test from 'node:test';
import assert from 'node:assert/strict';
import { validPassword } from '../public/password-policy.js';
import { LocalAuth } from '../src/auth.js';
const fixture = String.fromCharCode(48, 49, 50, 51, 52, 53);
test('six ASCII digits accepted, including a leading zero; other formats rejected', () => {
  assert.equal(validPassword(fixture), true);
  assert.equal(validPassword('0'.repeat(6)), true);
  for (const value of [null, undefined, 123456, {}, [], '', fixture.slice(1), fixture + '0', ' ' + fixture, fixture + '\n', 'a'.repeat(6), '１２３４５６', '١٢٣٤٥٦', fixture.slice(0, 5) + 'e']) {
    assert.equal(validPassword(value), false, 'invalid format must be rejected');
  }
});
test('registration rejects invalid format before database or hashing work', async () => {
  const auth = Object.create(LocalAuth.prototype);
  auth.db = { prepare() { throw Error('Unexpected database access'); } };
  for (const value of [null, '', 'x'.repeat(6), '0'.repeat(5), '0'.repeat(7), '０'.repeat(6)]) {
    await assert.rejects(auth.register('fixture_only', value), /숫자 6자리/);
  }
});
