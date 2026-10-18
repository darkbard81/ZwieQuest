export class AdminError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export class AccountAdmin {
  constructor(db) {
    this.db = db;
    db.exec('CREATE TABLE IF NOT EXISTS account_resets(actor_id TEXT NOT NULL,request_id TEXT NOT NULL,target_id TEXT NOT NULL,PRIMARY KEY(actor_id,request_id));');
  }
  requireAdmin(actorId) {
    if (!this.db.prepare('SELECT 1 FROM admin_accounts JOIN users ON users.id=admin_accounts.user_id WHERE user_id=?').get(actorId)) {
      throw new AdminError(403, '관리자만 계정을 관리할 수 있습니다.');
    }
  }
  list(actorId) {
    this.requireAdmin(actorId);
    return this.db.prepare(`SELECT u.id,u.username,u.created_at AS createdAt,
      EXISTS(SELECT 1 FROM admin_accounts a WHERE a.user_id=u.id) AS isAdmin,
      EXISTS(SELECT 1 FROM account_state s WHERE s.user_id=u.id) AS hasCharacter
      FROM users u ORDER BY u.created_at,u.username`).all()
      .map(row => ({ ...row, isAdmin: !!row.isAdmin, hasCharacter: !!row.hasCharacter }));
  }
  reset(actorId, targetId, confirmUsername, requestId, makeReplacement) {
    this.requireAdmin(actorId);
    if (typeof targetId !== 'string' || typeof confirmUsername !== 'string' || typeof requestId !== 'string' || !/^[\w-]{8,100}$/.test(requestId)) throw new AdminError(400, '초기화할 계정과 확인 아이디, 요청 ID가 필요합니다.');
    const target = this.db.prepare('SELECT id,username FROM users WHERE id=?').get(targetId);
    if (!target) throw new AdminError(404, '존재하지 않는 계정입니다.');
    if (target.username !== confirmUsername) throw new AdminError(409, '확인 아이디가 일치하지 않습니다.');
    const previous = this.db.prepare('SELECT target_id FROM account_resets WHERE actor_id=? AND request_id=?').get(actorId, requestId);
    if (previous) {
      if (previous.target_id !== targetId) throw new AdminError(409, '이미 다른 계정에 사용한 요청 ID입니다.');
      return { target, duplicate: true };
    }
    if (!this.db.prepare('SELECT 1 FROM account_state WHERE user_id=?').get(targetId)) throw new AdminError(409, '초기화할 모험가가 없습니다.');
    const replacement = makeReplacement();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const table of ['user_events', 'requests']) this.db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(targetId);
      this.db.prepare('UPDATE account_state SET body=? WHERE user_id=?').run(JSON.stringify(replacement.state), targetId);
      for (const event of replacement.events) this.db.prepare('INSERT INTO user_events(user_id,seq,at,body) VALUES(?,?,?,?)').run(targetId, event.seq, event.at, JSON.stringify(event));
      this.db.prepare('INSERT INTO account_resets VALUES(?,?,?)').run(actorId, requestId, targetId);
      this.db.exec('COMMIT');
      replacement.events = [];
      return { target, replacement, duplicate: false };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  remove(actorId, targetId, confirmUsername) {
    this.requireAdmin(actorId);
    if (typeof targetId !== 'string' || typeof confirmUsername !== 'string') throw new AdminError(400, '삭제할 계정과 확인 아이디를 입력하세요.');
    if (actorId === targetId) throw new AdminError(409, '현재 로그인한 관리자 계정은 삭제할 수 없습니다.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const target = this.db.prepare('SELECT id,username FROM users WHERE id=?').get(targetId);
      if (!target) throw new AdminError(404, '이미 삭제되었거나 존재하지 않는 계정입니다.');
      if (target.username !== confirmUsername) throw new AdminError(409, '확인 아이디가 일치하지 않습니다.');
      if (this.db.prepare('SELECT 1 FROM admin_accounts WHERE user_id=?').get(targetId)
        && this.db.prepare('SELECT COUNT(*) AS n FROM admin_accounts').get().n <= 1) throw new AdminError(409, '마지막 관리자 계정은 삭제할 수 없습니다.');
      for (const table of ['sessions', 'account_state', 'user_events', 'requests', 'admin_accounts']) {
        this.db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(targetId);
      }
      this.db.prepare('DELETE FROM account_resets WHERE actor_id=? OR target_id=?').run(targetId, targetId);
      this.db.prepare('DELETE FROM users WHERE id=?').run(targetId);
      this.db.exec('COMMIT'); return target;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
// Drop live state immediately after a successful transaction, so ticks cannot recreate it.
export function forgetAccount(id, { games, clients, presence, commandRates }) {
  games.delete(id); commandRates.delete(id);
  for (const [key, value] of presence) if (value.userId === id) presence.delete(key);
  for (const [res, value] of clients) if (value.id === id) { clients.delete(res); res.end(); }
}
