import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { validPassword } from '../public/password-policy.js';
const derive = promisify(scrypt), hash = value => createHash('sha256').update(value).digest('hex');
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export class LocalAuth {
  constructor(db, secure = false) {
    this.db = db; this.secure = secure;
    db.exec('CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);');
    db.exec('CREATE TABLE IF NOT EXISTS admin_accounts(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE);');
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  }
  isAdmin(id) { return !!this.db.prepare('SELECT 1 FROM admin_accounts WHERE user_id=?').get(id); }
  publicUser(u) { return u ? { id: u.id, username: u.username, isAdmin: this.isAdmin(u.id) } : null; }
  async register(username, password) {
    if (typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,24}$/.test(username)) throw Error('아이디는 영문·숫자·밑줄 3~24자로 입력하세요.');
    if (!validPassword(password)) throw Error('비밀번호는 숫자 6자리로 입력하세요.');
    username = username.toLowerCase(); const salt = randomBytes(16).toString('hex');
    const passwordHash = (await derive(password, salt, 64, options)).toString('hex'), id = randomUUID();
    try { this.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id, username, salt, passwordHash, Date.now()); }
    catch (e) { if (e.message.includes('UNIQUE')) throw Error('이미 사용 중인 아이디입니다.'); throw e; }
    return this.publicUser({ id, username });
  }
  async login(username, password) {
    if (typeof username !== 'string' || !validPassword(password)) throw Error('아이디 또는 비밀번호가 올바르지 않습니다.');
    const user = this.db.prepare('SELECT * FROM users WHERE username=?').get(username.toLowerCase());
    const candidate = await derive(password, user?.salt || '0'.repeat(32), 64, options);
    if (!user || !timingSafeEqual(candidate, Buffer.from(user.password_hash, 'hex'))) throw Error('아이디 또는 비밀번호가 올바르지 않습니다.');
    return this.publicUser(user);
  }
  issue(user, res) {
    const token = randomBytes(32).toString('hex');
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token), user.id, Date.now() + 7 * 86400000);
    res.setHeader('Set-Cookie', `zwie_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${this.secure ? '; Secure' : ''}`);
  }
  resolve(req) {
    const token = req.headers.cookie?.match(/(?:^|; )zwie_session=([a-f0-9]{64})(?:;|$)/)?.[1]; if (!token) return null;
    const sessionHash = hash(token);
    const u = this.db.prepare('SELECT users.id,users.username,sessions.expires_at FROM users JOIN sessions ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').get(sessionHash, Date.now());
    return u ? { ...this.publicUser(u), sessionHash, expiresAt: u.expires_at } : null;
  }
  revoke(user, res) { if (user) this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(user.sessionHash); res.setHeader('Set-Cookie', `zwie_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${this.secure ? '; Secure' : ''}`); }
}
