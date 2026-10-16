import http from 'node:http';
import { readFileSync, mkdirSync, chmodSync, existsSync, createReadStream } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Game, THEMES } from './game.js';
import { LocalAuth } from './auth.js';
import { AccountAdmin, forgetAccount } from './admin.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'config.json')));
const port = Number(process.env.PORT || 4317), host = process.env.HOST || '127.0.0.1';
const origin = process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`;
const allowedOrigins = new Set([origin, ...(host === '127.0.0.1' ? [`http://localhost:${port}`] : [])]);
if (host !== '127.0.0.1' && !origin.startsWith('https://')) throw Error('외부 제공 시 HTTPS PUBLIC_ORIGIN과 TLS 프록시가 필요합니다.');
const dataDir = process.env.DATA_DIR || join(root, 'data'); mkdirSync(dataDir, { recursive: true, mode: 0o700 });
chmodSync(dataDir, 0o700);
const db = new DatabaseSync(join(dataDir, 'zwiequest.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS account_state(user_id TEXT PRIMARY KEY,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS user_events(user_id TEXT NOT NULL,seq INTEGER NOT NULL,at INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(user_id,seq)); CREATE TABLE IF NOT EXISTS requests(user_id TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(user_id,id));');
const auth = new LocalAuth(db, origin.startsWith('https://'));
const accountAdmin = new AccountAdmin(db);
const games = new Map(db.prepare('SELECT * FROM account_state').all().map(r => [r.user_id, new Game(config, JSON.parse(r.body))]));
const clients = new Map(), presence = new Map(), commandRates = new Map();
let lastTick = performance.now(), lastPersist = performance.now(), lastBroadcast = 0, stopping = false;
function getGame(id) { if (!games.has(id)) games.set(id, new Game(config)); return games.get(id); }
function mode(id) { return [...presence.values()].some(p => p.userId === id && Date.now() - p.at < config.presenceGraceMs) ? 'ONLINE' : 'OFFLINE'; }
function rate(id) { return mode(id) === 'ONLINE' ? config.onlineRate : config.offlineRate; }
const logs = id => db.prepare('SELECT body FROM user_events WHERE user_id=? ORDER BY seq DESC LIMIT 80').all(id).map(r => JSON.parse(r.body));
function payload(id) { return { state: getGame(id).snapshot(), logs: logs(id), mode: mode(id), rate: rate(id), serverTime: Date.now(), config: { onlineRate: config.onlineRate, offlineRate: config.offlineRate, stepsPerRun: config.stepsPerRun }, themes: THEMES }; }
function commit(id, command) {
  const game = getGame(id); db.exec('BEGIN IMMEDIATE');
  try {
    if (game.state) { game.state.version++; db.prepare('INSERT INTO account_state VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET body=excluded.body').run(id, JSON.stringify(game.state)); }
    for (const e of game.events) db.prepare('INSERT INTO user_events VALUES(?,?,?,?)').run(id, e.seq, e.at, JSON.stringify(e));
    if (command) db.prepare('INSERT INTO requests VALUES(?,?,?)').run(id, command.id, JSON.stringify(command.result));
    if (game.state?.eventSeq > 6000) db.prepare('DELETE FROM user_events WHERE user_id=? AND seq < ?').run(id, game.state.eventSeq - 5000);
    db.exec('COMMIT'); game.events = [];
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
function broadcast(id) {
  let line;
  for (const [res, u] of clients) if (u.id === id) {
    if (u.expiresAt <= Date.now() || !presence.has(u.sessionHash + ':' + u.clientId) || Date.now() - presence.get(u.sessionHash + ':' + u.clientId).at >= config.presenceGraceMs) { res.end(); clients.delete(res); continue; }
    line ||= `data: ${JSON.stringify(payload(id))}\n\n`; res.write(line);
  }
}
function tick() {
  const now = performance.now(), dt = now - lastTick; lastTick = now;
  const persist = now - lastPersist >= 1000, emit = now - lastBroadcast >= 1000;
  for (const [id, game] of games) {
    const old = game.state ? structuredClone(game.state) : null;
    try { const until = Math.max(0, ...[...presence.values()].filter(p => p.userId === id).map(p => p.at + config.presenceGraceMs)); const onlineMs = Math.max(0, Math.min(dt, until - (Date.now() - dt))); const effectiveRate = dt > 0 ? (onlineMs * config.onlineRate + (dt - onlineMs) * config.offlineRate) / dt : rate(id); const changed = game.tick(dt, effectiveRate); if (changed || persist) commit(id); if (changed || emit) broadcast(id); }
    catch (e) { game.state = old; game.events = []; console.error('Tick failed:', e.message); }
  }
  for (const [key, p] of presence) if (Date.now() - p.at > config.presenceGraceMs) presence.delete(key);
  if (persist) lastPersist = now; if (emit) lastBroadcast = now;
}
const timer = setInterval(tick, 200);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
function endSession(u) { for (const [res, c] of clients) if (c.sessionHash === u.sessionHash) { res.end(); clients.delete(res); } for (const [key, p] of presence) if (p.sessionHash === u.sessionHash) presence.delete(key); }
const server = http.createServer(async (req, res) => {
 try {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'");
  const url = new URL(req.url, origin);
  if (![...allowedOrigins].some(o => new URL(o).host === req.headers.host)) return json(res, 403, { error: '허용되지 않은 호스트입니다.' });
  if (url.pathname === '/api/health') return json(res, 200, { ok: true });
  let user = auth.resolve(req);
  if (url.pathname === '/api/auth/me' && req.method === 'GET') return json(res, 200, { user: auth.publicUser(user) });
  if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/') && !user) return json(res, 401, { error: '로그인이 필요합니다.' });
  if (url.pathname === '/api/admin/accounts' && req.method === 'GET') {
    try { return json(res, 200, { accounts: accountAdmin.list(user.id) }); }
    catch (e) { if (e.status) return json(res, e.status, { error: e.message }); throw e; }
  }
  if (url.pathname === '/api/state' && req.method === 'GET') return json(res, 200, payload(user.id));
  if (url.pathname === '/api/events' && req.method === 'GET') {
    const clientId = url.searchParams.get('clientId'); if (!clientId || clientId.length > 80) return json(res, 400, { error: 'clientId가 필요합니다.' });
    tick(); res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    clients.set(res, { ...user, clientId }); res.write(`data: ${JSON.stringify(payload(user.id))}\n\n`); req.on('close', () => { tick(); clients.delete(res); }); return;
  }
  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    if (!allowedOrigins.has(req.headers.origin)) return json(res, 403, { error: '허용되지 않은 요청 출처입니다.' });
    if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'JSON 요청이 필요합니다.' });
    let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 8192) return json(res, 413, { error: '요청이 너무 큽니다.' }); }
    let cmd; try { cmd = JSON.parse(raw); } catch { return json(res, 400, { error: '잘못된 요청입니다.' }); }
    if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return json(res, 400, { error: '잘못된 요청입니다.' });
    // Body reading can yield while another administrator deletes this account.
    user = auth.resolve(req);
    if (url.pathname === '/api/auth/register' || url.pathname === '/api/auth/login') {
      try {
        const u = url.pathname.endsWith('register') ? await auth.register(cmd.username, cmd.password) : await auth.login(cmd.username, cmd.password);
        if (user) { tick(); endSession(user); auth.revoke(user, res); }
        auth.issue(u, res); return json(res, 200, { user: u });
      } catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (url.pathname === '/api/auth/logout') { if (user) { tick(); endSession(user); } auth.revoke(user, res); return json(res, 200, { ok: true }); }
    if (!user) return json(res, 401, { error: '로그인이 필요합니다.' });
    if (url.pathname === '/api/admin/delete-account') {
      try {
        const deleted = accountAdmin.remove(user.id, cmd.userId, cmd.confirmUsername);
        forgetAccount(deleted.id, { games, clients, presence, commandRates });
        return json(res, 200, { ok: true, username: deleted.username });
      } catch (e) { if (e.status) return json(res, e.status, { error: e.message }); throw e; }
    }
    if (url.pathname === '/api/presence') {
      if (typeof cmd.clientId !== 'string' || cmd.clientId.length > 80) return json(res, 400, { error: 'Invalid client' });
      tick(); const key = user.sessionHash + ':' + cmd.clientId;
      if (cmd.active === false) presence.delete(key); else presence.set(key, { userId: user.id, sessionHash: user.sessionHash, at: Date.now() });
      broadcast(user.id); return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/command') {
      const budget = commandRates.get(user.id) || { second: 0, count: 0 }, second = Math.floor(Date.now() / 1000);
      if (budget.second !== second) { budget.second = second; budget.count = 0; } budget.count++; commandRates.set(user.id, budget);
      if (budget.count > 20) return json(res, 429, { error: '잠시 후 다시 시도하세요.' });
      if (typeof cmd.requestId !== 'string' || !/^[\w-]{8,100}$/.test(cmd.requestId)) return json(res, 400, { error: '요청 ID가 필요합니다.' });
      const prev = db.prepare('SELECT body FROM requests WHERE user_id=? AND id=?').get(user.id, cmd.requestId);
      if (prev) return json(res, 200, { ...JSON.parse(prev.body), duplicate: true, ...payload(user.id) });
      tick(); const game = getGame(user.id), old = structuredClone(game.state);
      try { game.command(cmd); const result = { ok: true }; commit(user.id, { id: cmd.requestId, result }); broadcast(user.id); return json(res, 200, { ...result, ...payload(user.id) }); }
      catch (e) { game.state = old; game.events = []; return json(res, 409, { error: e.message, ...payload(user.id) }); }
    }
  }
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  let pathname; try { pathname = decodeURIComponent(url.pathname); } catch { return json(res, 400, { error: 'Bad path' }); }
  const publicRoot = join(root, 'public'), file = resolve(publicRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(publicRoot + '/') || !existsSync(file)) return json(res, 404, { error: 'Not found' });
  res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=3600' : 'no-cache');
  const stream = createReadStream(file); stream.on('error', () => { if (!res.headersSent) res.writeHead(404); res.end(); }); stream.pipe(res);
 } catch (e) { console.error('Request failed:', e.message); if (!res.headersSent) json(res, 500, { error: '서버 오류가 발생했습니다.' }); else res.end(); }
});
server.listen(port, host, () => console.log(`ZwieQuest ready: ${origin}\nSave: ${join(dataDir, 'zwiequest.sqlite')}`));
function shutdown() { if (stopping) return; stopping = true; clearInterval(timer); tick(); for (const id of games.keys()) commit(id); for (const res of clients.keys()) res.end(); server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 1500).unref(); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
