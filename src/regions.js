import { readFileSync } from 'node:fs';

export function validateRegions(regions) {
  if (!regions || typeof regions !== 'object' || Array.isArray(regions) || !Object.hasOwn(regions, 'village')) throw Error('Missing village region');
  for (const [id, region] of Object.entries(regions)) {
    if (!/^[a-z][a-z0-9_-]*$/.test(id) || ['pub', 'icons', '__proto__', 'constructor', 'prototype'].includes(id) || !region) throw Error(`Invalid region ID: ${id}`);
    for (const key of ['name', 'subtitle', 'tag']) if (typeof region[key] !== 'string' || !region[key].trim()) throw Error(`Invalid region ${key}: ${id}`);
    for (const key of ['canvas', 'route']) if (typeof region[key] !== 'string' || !/^\/assets\/[a-zA-Z0-9/_?.=&-]+$/.test(region[key]) || region[key].includes('..')) throw Error(`Invalid region ${key}: ${id}`);
    if (!Number.isSafeInteger(region.depth) || region.depth < 1) throw Error(`Invalid region depth: ${id}`);
    if (!Number.isSafeInteger(region.deadEnds) || region.deadEnds < 0) throw Error(`Invalid region deadEnds: ${id}`);
    if (!Array.isArray(region.exits) || new Set(region.exits).size !== region.exits.length || region.exits.some(target => !Object.hasOwn(regions, target) || target === id)) throw Error(`Invalid region exits: ${id}`);
    if (region.boss !== null && (typeof region.boss !== 'string' || !region.boss.trim())) throw Error(`Invalid region boss: ${id}`);
    if (region.bossMonsterId !== undefined && (!region.boss || typeof region.bossMonsterId !== 'string' || !/^[a-z0-9_-]+$/.test(region.bossMonsterId))) throw Error(`Invalid region bossMonsterId: ${id}`);
    if ((region.allowedDamageTypes !== undefined && (!Array.isArray(region.allowedDamageTypes) || !region.allowedDamageTypes.length || new Set(region.allowedDamageTypes).size !== region.allowedDamageTypes.length || region.allowedDamageTypes.some(type => typeof type !== 'string' || !type)))) throw Error(`Invalid region allowedDamageTypes: ${id}`);
    if (region.excludedDamageTypes !== undefined && (!Array.isArray(region.excludedDamageTypes) || new Set(region.excludedDamageTypes).size !== region.excludedDamageTypes.length || region.excludedDamageTypes.some(type => typeof type !== 'string' || !type))) throw Error(`Invalid region excludedDamageTypes: ${id}`);
    const terminals = region.deadEnds + region.exits.length + (region.boss ? 1 : 0);
    if (!terminals || region.depth < Math.ceil(Math.log2(terminals + terminals % 2))) throw Error(`Region depth cannot fit destinations: ${id}`);
    if (!Number.isSafeInteger(region.minLevel) || !Number.isSafeInteger(region.maxLevel) || region.minLevel < 1 || region.maxLevel < region.minLevel) throw Error(`Invalid region levels or damage types: ${id}`);
  }
  return regions;
}

// Stable IDs preserve saved routes, exploration and checkpoints.
export const REGIONS = validateRegions(JSON.parse(readFileSync(new URL('../data-templates/regions.json', import.meta.url))));

export function publicRegions(regions = REGIONS) {
  return Object.fromEntries(Object.entries(regions).map(([id, { name, subtitle, tag, canvas, route, depth, minLevel, maxLevel }]) =>
    [id, { name, subtitle, tag, canvas, route, depth, minLevel, maxLevel }]));
}
