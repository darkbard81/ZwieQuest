export class AdminError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export class AccountAdmin {
  constructor(db) { this.db = db; }
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
