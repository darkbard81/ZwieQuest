import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// Server-owned templates. Generated item snapshots, not templates, are persisted.
export function validateCatalog(c) {
  const fail = message => { throw Error(`Invalid equipment catalog: ${message}`); };
  if (!Number.isInteger(c.rulesVersion) || c.rulesVersion < 1) fail('rulesVersion');
  const normalTypes = Object.keys(c.damageTypes).filter(t => t !== 'raw');
  if (normalTypes.length !== 7 || !c.damageTypes.raw) fail('damage types');
  for (const k of ['dropPercent', 'weaponSpecialPercent', 'armorSpecialPercent']) if (!Number.isFinite(c[k]) || c[k] < 0 || c[k] > 100) fail(k);
  if (![c.saleBase, c.saleGradeStep].every(v => Number.isInteger(v) && v >= 0)) fail('sale values');
  const ids = new Set();
  for (const g of c.grades) {
    if (ids.has(g.id)) fail('duplicate grade'); ids.add(g.id);
    if (![g.weight, g.damageRate, g.ACC, g.PEN, g.AR].every(Number.isFinite) || g.weight <= 0 || !Number.isInteger(g.weight) || g.damageRate < 0) fail('grade values');
  }
  if (c.grades.length !== 5) fail('five grades required');
  ids.clear();
  for (const t of [...c.weapons, ...c.armors]) {
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(t.id) || ids.has(t.id)) fail('template id'); ids.add(t.id);
    if (t.slot === 'weapon') {
      if (t.classId != null) fail('equipment must not restrict class');
      if (!['DEF', 'FOR', 'REF', 'WIL'].includes(t.hitDefense)) fail('weapon hit defense');
      if (!Array.isArray(t.damageTypes) || t.damageTypes.length < 1 || t.damageTypes.length > 3 || new Set(t.damageTypes).size !== t.damageTypes.length || t.damageTypes.some(d => !c.damageTypes[d])) fail('weapon types');
      if (t.damageTypes.includes('raw')) {
        if (t.damageTypes.length !== 1 || !Number.isInteger(t.fixedDamage) || t.fixedDamage < 0 || t.damageMin != null || t.damageMax != null || t.PEN != null) fail('raw must be fixed and exclusive');
      } else if (![t.damageMin, t.damageMax, t.ACC, t.PEN].every(Number.isInteger) || t.damageMin < 0 || t.damageMax < t.damageMin) fail('weapon range');
    } else if (t.slot === 'armor') {
      if (!Number.isInteger(t.DEX) || t.DEX > 0 || t.DEX < -3) fail('armor DEX');
      if (!Number.isInteger(t.AR) || t.AR < 0 || !t.typeModifiers || Object.keys(t.typeModifiers).length > 2 || Object.entries(t.typeModifiers).some(([k, v]) => !normalTypes.includes(k) || !Number.isInteger(v) || v >= 0)) fail('armor values');
    } else fail('slot');
  }
  if (!Array.isArray(c.specialResistanceRange) || c.specialResistanceRange.length !== 2 || !c.specialResistanceRange.every(Number.isInteger) || c.specialResistanceRange[0] < 1 || c.specialResistanceRange[1] < c.specialResistanceRange[0]) fail('resistance range');
  return c;
}
const freeze = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') freeze(v); }); return Object.freeze(o); };
export const EQUIPMENT_CATALOG = freeze(validateCatalog(JSON.parse(readFileSync(new URL('../data-templates/equipment.json', import.meta.url), 'utf8'))));
export const DAMAGE_NAMES = Object.fromEntries(Object.entries(EQUIPMENT_CATALOG.damageTypes).map(([id, t]) => [id, t.name]));
export const chance = (rng, percent) => rng(10000) < Math.round(percent * 100);
export function rollGrade(rng, catalog = EQUIPMENT_CATALOG) {
  let pick = rng(catalog.grades.reduce((sum, g) => sum + g.weight, 0));
  for (const grade of catalog.grades) { pick -= grade.weight; if (pick < 0) return grade; }
  throw Error('Invalid grade random roll');
}
export function generateEquipment({ slot, classId, rng, gradeId, templateId, specials = true, catalog = EQUIPMENT_CATALOG }) {
  const templates = (slot === 'weapon' ? catalog.weapons : slot === 'armor' ? catalog.armors : []);
  const t = templateId ? templates.find(t => t.id === templateId) : templates[rng(templates.length)];
  if (!t) throw Error('Unknown or unavailable equipment template');
  // Grade is chosen before any grade bonuses or independent special option.
  const g = gradeId ? catalog.grades.find(g => g.id === gradeId) : rollGrade(rng, catalog);
  if (!g) throw Error('Unknown equipment grade');
  const tier = catalog.grades.indexOf(g);
  const item = { id: randomUUID(), templateId: t.id, rulesVersion: catalog.rulesVersion, slot, gradeId: g.id, tier, rarity: g.name, name: t.name,
    iconPath: `/assets/equipment/${t.id}-v1.png`, value: catalog.saleBase + tier * catalog.saleGradeStep, stats: {}, special: null };
  const types = Object.keys(catalog.damageTypes).filter(d => d !== 'raw');
  if (slot === 'weapon') {
    item.hitDefense = t.hitDefense; item.damageTypes = [...t.damageTypes];
    const raw = t.damageTypes.includes('raw');
    item.stats.ACC = (t.ACC || 0) + g.ACC;
    if (raw) item.fixedDamage = t.fixedDamage;
    else { item.damageMin = t.damageMin; item.damageMax = t.damageMax; item.damageRate = g.damageRate; item.stats.PEN = t.PEN + g.PEN; }
    if (!raw && specials && item.damageTypes.length < 3 && chance(rng, catalog.weaponSpecialPercent)) {
      const available = types.filter(d => !item.damageTypes.includes(d));
      const type = available[rng(available.length)]; item.damageTypes.push(type);
      item.special = { type, kind: 'damage-type' }; item.name = `${catalog.damageTypes[type].prefix} ${item.name}`;
    }
  } else {
    item.stats.AR = t.AR + g.AR; item.stats.DEX = t.DEX; item.dexRulesVersion = 2; item.typeModifiers = { ...t.typeModifiers };
    if (specials && chance(rng, catalog.armorSpecialPercent)) {
      const available = types.filter(d => !(d in item.typeModifiers)), type = available[rng(available.length)];
      const [min, max] = catalog.specialResistanceRange, amount = min + rng(max - min + 1);
      item.typeModifiers[type] = amount; item.special = { type, amount, kind: 'resistance' };
      item.name += ` - ${catalog.damageTypes[type].name}저항`;
    }
  }
  return item;
}
export function rollWeaponDamage(weapon, rng) {
  return weapon.damageMin + rng(weapon.damageMax - weapon.damageMin + 1);
}

// Old classId metadata remains stored for compatibility, but is never an equip gate.
export function weaponDefense(item) {
  if (!item) return 'DEF';
  return item.hitDefense || EQUIPMENT_CATALOG.weapons.find(t => t.id === item.templateId)?.hitDefense || (item.icon === 'staff' ? 'WIL' : 'DEF');
}
export function migrateArmorDEX(inventory) {
  for (const item of inventory) if (item.slot === 'armor' && !(item.dexRulesVersion >= 2)) {
    item.stats.DEX = EQUIPMENT_CATALOG.armors.find(t => t.id === item.templateId)?.DEX || 0;
    item.dexRulesVersion = 2;
  }
}
