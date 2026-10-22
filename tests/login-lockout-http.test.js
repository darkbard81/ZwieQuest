import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:net';

test('HTTP login returns 429/Retry-After, denies correct password during persisted lock, permits expired lock', { timeout: 30000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zwiequest-lock-http-'));
  let child, base, output = '';
  async function start() {
    const probe = createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['src/server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: base, DATA_DIR: dir }, stdio: ['ignore','pipe','pipe'] });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error(output || 'server start timeout')), 10000);
      child.once('error', e => { clearTimeout(timeout); reject(e); });
      child.stdout.on('data', data => { output += data; if (output.includes('ZwieQuest ready:')) { clearTimeout(timeout); resolve(); } });
      child.stderr.on('data', data => { output += data; });
      child.once('exit', () => { clearTimeout(timeout); reject(Error(output)); });
    });

  }
  async function stop() { if (!child || child.exitCode !== null) return; const exited = new Promise(r => child.once('exit', r)); child.kill('SIGTERM'); await exited; child = null; output = ''; }
  async function request(path, password) {
    const r = await fetch(base + path, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'http_lock_fixture', password }) });
    return { status: r.status, retry: Number(r.headers.get('retry-after')), body: await r.json(), cookie: r.headers.get('set-cookie') };
  }
  try {
    await start(); assert.equal((await request('/api/auth/register', '012345')).status, 200);
    for (let i = 0; i < 4; i++) assert.equal((await request('/api/auth/login', '999999')).status, 400);
    const fifth = await request('/api/auth/login', '999999'); assert.equal(fifth.status, 429); assert.equal(fifth.retry, 300); assert.equal(fifth.body.retryAfter, 300); assert.match(fifth.body.error, /300초/); assert.equal(fifth.cookie, null);
    const retry = await request('/api/auth/login', '012345'); assert.equal(retry.status, 429); assert.equal(retry.cookie, null);
    await stop(); await start(); assert.equal((await request('/api/auth/login', '012345')).status, 429);
    await stop();
    const db = new DatabaseSync(join(dir, 'zwiequest.sqlite'));
    db.prepare('UPDATE login_attempts SET locked_until=?').run(Date.now() - 1); db.close();
    await start(); const success = await request('/api/auth/login', '012345'); assert.equal(success.status, 200); assert.ok(success.cookie);
  } finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
});
