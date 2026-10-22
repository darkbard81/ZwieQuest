import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicRegions } from '../src/regions.js';
import { REGIONS as browserRegions, loadRegions } from '../public/regions.js';

test('public region API and browser loader work before login without exposing destinations', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zwiequest-region-http-'));
  const port = 58000 + Math.floor(Math.random() * 5000), base = `http://127.0.0.1:${port}`;
  const originalFetch = globalThis.fetch;
  const child = spawn(process.execPath, ['src/server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: base, DATA_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw Error(output);
      try { if ((await originalFetch(base + '/api/health')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready, output);
    const response = await originalFetch(base + '/api/regions');
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), publicRegions());
    assert.equal((await originalFetch(base + '/api/state')).status, 401);
    globalThis.fetch = (path, options) => originalFetch(new URL(path, base), options);
    assert.equal(await loadRegions(), browserRegions);
    assert.deepEqual(browserRegions, publicRegions());
    assert.ok(Object.values(browserRegions).every(region => region.depth === 10));
  } finally {
    globalThis.fetch = originalFetch;
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
