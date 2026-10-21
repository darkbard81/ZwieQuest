import { EQUIPMENT_CATALOG } from './equipment.js';
export const DROP_WEIGHTS = Object.freeze({ weaponWeight:1, armorWeight:1, charmWeight:1, skillWeight:1 });
export const DEFAULT_PROBABILITIES = Object.freeze({ battlePercent: 20, treasurePercent: 5, passPercent: 75, dropPercent: EQUIPMENT_CATALOG.dropPercent, ...DROP_WEIGHTS });
export function validateProbabilities(value) {
  const keys = Object.keys(DEFAULT_PROBABILITIES);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k => !Number.isInteger(value[k]) || value[k] < 0 || value[k] > 100)) throw Object.assign(Error('확률은 0~100 사이의 정수여야 합니다.'), { status: 400 });
  if (value.battlePercent + value.treasurePercent + value.passPercent !== 100) throw Object.assign(Error('전투·보물·통과 확률의 합계는 100%여야 합니다.'), { status: 400 });
  if (!Object.keys(DROP_WEIGHTS).some(k=>value[k]>0)) throw Object.assign(Error('획득 종류 비율은 하나 이상 0보다 커야 합니다.'), { status:400 });
  return Object.freeze(Object.fromEntries(keys.map(k => [k, value[k]])));
}
// All accounts share this durable configuration; per-account resets never change it.
export class ProbabilitySettings {
  constructor(db) {
    this.db = db;
    db.exec('CREATE TABLE IF NOT EXISTS probability_settings(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,body TEXT NOT NULL,updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS probability_requests(user_id TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(user_id,id));');
    db.prepare('INSERT OR IGNORE INTO probability_settings VALUES(1,0,?,0)').run(JSON.stringify(DEFAULT_PROBABILITIES));
  }
  read() {
    const row = this.db.prepare('SELECT * FROM probability_settings WHERE id=1').get();
    return { revision: row.revision, probabilities: validateProbabilities({ ...DROP_WEIGHTS, ...JSON.parse(row.body) }), updatedAt: row.updated_at };
  }
  update(userId, input) {
    const probabilities = validateProbabilities(input.probabilities);
    if (!Number.isSafeInteger(input.revision) || input.revision < 0 || typeof input.requestId !== 'string' || !/^[\w-]{8,100}$/.test(input.requestId)) throw Object.assign(Error('설정 버전과 요청 ID가 필요합니다.'), { status: 400 });
    const body = JSON.stringify({ revision: input.revision, probabilities });
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const prior = this.db.prepare('SELECT body FROM probability_requests WHERE user_id=? AND id=?').get(userId, input.requestId);
      const current = this.read();
      if (prior) {
        if (prior.body !== body) throw Object.assign(Error('이미 사용한 요청 ID입니다. 다시 불러온 후 확정하세요.'), { status: 409 });
        this.db.exec('COMMIT'); return { ...current, duplicate: true };
      }
      if (input.revision !== current.revision) throw Object.assign(Error('다른 관리자가 확률을 변경했습니다. 다시 불러온 후 확정하세요.'), { status: 409 });
      const result = { revision: current.revision + 1, probabilities, updatedAt: Date.now() };
      this.db.prepare('UPDATE probability_settings SET revision=?,body=?,updated_at=? WHERE id=1').run(result.revision, JSON.stringify(probabilities), result.updatedAt);
      this.db.prepare('INSERT INTO probability_requests VALUES(?,?,?)').run(userId, input.requestId, body);
      this.db.exec('COMMIT'); return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}

export function rollDropSlot(rng, probabilities = {}) {
  const entries=Object.entries(DROP_WEIGHTS).map(([key,value])=>[key.replace('Weight',''), probabilities[key] ?? value]);
  const total=entries.reduce((sum,[,weight])=>sum+weight,0);
  if (!Number.isSafeInteger(total) || total<=0) throw Error('Invalid drop weights');
  let roll=rng(total);
  for(const [slot,weight] of entries){if(roll<weight)return slot;roll-=weight;}
  throw Error('Invalid drop roll');
}
