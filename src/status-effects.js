import { readFileSync } from 'node:fs';
import { enemyActionSpeed } from './action-speed.js';
export const STATUS_CATALOG = JSON.parse(readFileSync(new URL('../data-templates/status-effects.json', import.meta.url), 'utf8'));
export const statusDefinition = id => STATUS_CATALOG.statuses.find(s => s.id === id);
export function initializeStatuses(b) { if (b) { b.statuses ||= { hero: [], enemy: [] }; b.statuses.hero ||= []; b.statuses.enemy ||= []; b.enemySkillUseCounts ||= {}; for (const actor of ['hero','enemy']) for (const effect of b.statuses[actor]) effect.durationMs ||= effect.remainingMs; } }
export function modifiers(b, actor) {
  const out = { healingReceived: 1, hostileDurationMultiplier: 1, debuffDurationMultiplier: 1, buffDecayRate: 1, actionTimeMultiplier: 1 };
  for (const s of b?.statuses?.[actor] || []) {
    if (s.remainingMs <= 0) continue;
    const m = s.id === 'mirrored-image' ? { DEF: s.bonus } : statusDefinition(s.id)?.modifiers || {};
    for (const [k, v] of Object.entries(m)) {
      if (k.startsWith('period')) continue;
      if (typeof v === 'boolean') out[k] ||= v;
      else if (k in { healingReceived:1,hostileDurationMultiplier:1,debuffDurationMultiplier:1,buffDecayRate:1,actionTimeMultiplier:1 }) out[k] *= v;
      else out[k] = (out[k] || 0) + v;
    }
  }
  return out;
}
export const durationMs = (base, intellect) => Math.round(base * Math.max(STATUS_CATALOG.duration.minimumMultiplier, 1 + (intellect || 0) * STATUS_CATALOG.duration.intelligenceRate));
export const resolveDurationMultiplier = resolve => Math.max(STATUS_CATALOG.duration.resolveMinimumMultiplier, 1 - (resolve || 0) * STATUS_CATALOG.duration.resolveReductionRate);
export function applyStatus(b, actor, id, baseMs, source, sourceActor = actor, resistance = {}, sourceSkillId = null, targetStats = {}) {
  initializeStatuses(b);
  let def = statusDefinition(id);
  if (!def) throw Error(`Unknown status: ${id}`);
  const target = modifiers(b, actor), caster = modifiers(b, sourceActor), list = b.statuses[actor];
  let tier = def.tier;
  if (def.polarity === 'buff' && def.attribute !== 'RES') tier += target.inspirationBonus || 0;
  if (def.polarity === 'debuff') tier += (def.attribute !== 'RES' ? target.afflictionBonus || 0 : 0) + (resistance.weakness?.[def.attribute] || 0) - (resistance.resistance?.[def.attribute] || 0);
  // Resistance immunity resolves before cancellation; an immune application never lands.
  if (tier <= 0) return { applied: false, reason: 'immune' };
  tier = Math.min(3, tier);
  def = STATUS_CATALOG.statuses.find(s => s.attribute === def.attribute && s.polarity === def.polarity && s.tier === tier);
  const index = list.findIndex(s => statusDefinition(s.id)?.attribute === def.attribute);
  const old = list[index], oldDef = statusDefinition(old?.id);
  if (oldDef && oldDef.polarity !== def.polarity) { list.splice(index, 1); return { applied:false, cancelled:true, id:def.id }; }
  if (oldDef?.tier > def.tier) return { applied:false, reason:'stronger' };
  // Snapshot the recipient before this application; negative Resolve extends hostile effects.
  const resolveMultiplier = resolveDurationMultiplier(targetStats.RES);
  const remainingMs = durationMs(baseMs, source.INT) * (def.polarity === 'debuff' ? resolveMultiplier * caster.debuffDurationMultiplier * target.hostileDurationMultiplier : 1);
  if (oldDef?.tier === def.tier) { if (remainingMs > old.remainingMs) { old.remainingMs = remainingMs; old.durationMs = remainingMs; old.sourceSkillId = sourceSkillId; } return { applied:true, id:def.id }; }
  const entry = { id:def.id, remainingMs, durationMs:remainingMs, sourceSkillId, ...(def.modifiers.periodMs ? { tickRemainingMs:def.modifiers.periodMs } : {}) };
  if (index >= 0) list[index] = entry; else list.push(entry);
  return { applied:true, id:def.id };
}
export function applyMirror(b, actor, baseMs, source) {
  initializeStatuses(b); const list=b.statuses[actor], old=list.find(s=>s.id==='mirrored-image');
  const time=durationMs(baseMs,source.INT);
  if(old){if(time>old.remainingMs){old.remainingMs=time;old.durationMs=time;}old.sourceSkillId='mirrored-image';old.bonus=30;} else list.push({id:'mirrored-image',remainingMs:time,durationMs:time,sourceSkillId:'mirrored-image',bonus:30});
}
export const polarityOf = s => s.id === 'mirrored-image' ? 'buff' : statusDefinition(s.id)?.polarity;
export function clearStatuses(b,actor,polarity) { initializeStatuses(b); const old=b.statuses[actor]; b.statuses[actor]=old.filter(s=>polarityOf(s)!==polarity); return old.length-b.statuses[actor].length; }
export function consumeMirror(b,actor) { const list=b.statuses?.[actor]||[], s=list.find(s=>s.id==='mirrored-image'); if(s){s.bonus-=10;if(s.bonus<=0)list.splice(list.indexOf(s),1);} }
export function nextStatusEvent(b) {
  let wait=Infinity;
  for(const actor of ['hero','enemy']) {const rate=modifiers(b,actor).buffDecayRate;for(const s of b.statuses?.[actor]||[]){wait=Math.min(wait,s.remainingMs/(polarityOf(s)==='buff'?rate:1),s.tickRemainingMs??Infinity);}}
  return Math.max(0,wait);
}
export function advanceStatuses(b,elapsed) {
  // Both decay rates are snapshotted before mutation, including the Resolve status itself.
  const rates={hero:modifiers(b,'hero').buffDecayRate,enemy:modifiers(b,'enemy').buffDecayRate};
  for(const actor of ['hero','enemy'])for(const s of b.statuses?.[actor]||[]){s.remainingMs-=elapsed*(polarityOf(s)==='buff'?rates[actor]:1);if(s.tickRemainingMs!=null)s.tickRemainingMs-=elapsed;}
}
export function resolveStatusEvents(b) {
  const events=[];
  for(const actor of ['hero','enemy']) {
    const list=b.statuses?.[actor]||[];
    // Expiry wins a tie with a periodic tick, so an expired effect never fires.
    for(const s of list)if(s.remainingMs>1e-7 && s.tickRemainingMs<=1e-7){const d=statusDefinition(s.id);events.push({actor,type:d.modifiers.periodType,amount:d.modifiers.periodAmount});s.tickRemainingMs+=d.modifiers.periodMs;}
    if(b.statuses)b.statuses[actor]=list.filter(s=>s.remainingMs>1e-7);
  }
  return events;
}
export function convertHit(hit, outgoing, incoming, rng) {
  let tier=hit.tier;
  const chance=p=>p>0 && rng(1000000)<Math.round(p*1000000);
  const combined=(a=0,b=0)=>1-(1-a)*(1-b);
  if(tier===2 && chance(incoming.incomingHitToGraze||0))tier=1;
  else if(tier===1 && chance(combined(outgoing.outgoingGrazeToHit,incoming.incomingGrazeToHit)))tier=2;
  else if(tier===2 && chance(combined(outgoing.outgoingHitToCrit,incoming.incomingHitToCrit)))tier=3;
  return {...hit,tier,label:['빗나감','스침','명중','치명타'][tier],multiplier:[0,.5,1,1.5][tier],originalTier:hit.tier};
}
export function effectiveEnemy(enemy,b,config) {
  if(!enemy)return null;
  const m=modifiers(b,'enemy'),out={...enemy};
  for(const key of ['STR','CON','DEX','PER','INT','RES'])out[key]=(enemy[key]||0)+(m[key]||0);
  for(const [key,delta] of Object.entries({ACC:m.PER||0,DEF:m.RES||0,REF:2*((m.DEX||0)+(m.PER||0)),FOR:2*((m.STR||0)+(m.CON||0)),WIL:2*((m.INT||0)+(m.RES||0)),AR:0,PEN:0}))out[key]=(enemy[key]||0)+delta+(m[key]||0);
  const base=enemy.statusHpBase ?? ((enemy.maxHp||enemy.hp)/Math.max(.05,1+.05*(enemy.CON||0)));
  // Apply the difference of fully rounded HP formulas, preserving flat gear HP.
  // Adding a rounded delta to an already rounded baseline loses 1 HP for odd CON.
  const hpAt = con => Math.floor(base * (100 + 5 * con) / 100);
  out.maxHp=Math.max(1,(enemy.maxHp||enemy.hp)+hpAt(out.CON)-hpAt(enemy.CON||0));
  Object.assign(out,enemyActionSpeed(out,config));out.actionIntervalMs*=m.actionTimeMultiplier;out.actionSpeed/=m.actionTimeMultiplier;
  return out;
}
export function statusViews(b, actor, resolveSkill = () => null) {
  const decayRate = modifiers(b, actor).buffDecayRate;
  return (b?.statuses?.[actor] || []).map(s => {
    const d = statusDefinition(s.id), source = resolveSkill(s.sourceSkillId);
    const fallback = d?.polarity === 'buff'
      ? {STR:'might-inspiration',CON:'constitution-inspiration',DEX:'dexterity-inspiration',PER:'perception-inspiration',INT:'intellect-inspiration',RES:'resolve-inspiration'}[d.attribute]
      : {STR:'staggering-blow',CON:'weakening-strike',DEX:s.id==='hobbled'?'hamstring':'binding-strike',PER:'eye-gouge',INT:'mind-fog',RES:'dread-whisper'}[d?.attribute];
    return { ...s, durationMs:s.durationMs || s.remainingMs, decayRate:polarityOf(s)==='buff'?decayRate:1,
      sourceSkillName:source?.name || null, iconPath:source?.iconPath || `/assets/skills/${fallback || 'mirrored-image'}-v1.webp`,
      name:d?.name || '반사된 형상', englishName:d?.englishName || 'Mirrored Image',
      description:d?.description || '회피 +30, 피격 명중·치명타마다 보너스 −10', attribute:d?.attribute, polarity:polarityOf(s), tier:d?.tier || 1 };
  });
}
