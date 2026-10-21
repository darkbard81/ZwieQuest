import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { Game } from '../src/game.js';
import { sortInventory } from '../public/inventory-order.js';
import { treasureCardHTML } from '../public/treasure-view.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const buy = g => g.command({ type: 'BUY_TREASURE', treasureId: 'welcome-title', price: -999, gold: 999 });
test('free collectible is opt-in, account-owned, idempotent and survives character changes and restore', () => {
 const g = new Game(config, null, () => 0);
 assert.equal(g.state.inventory.length, 0); assert.equal(g.snapshot().treasureOffers[0].price, 0);
 assert.throws(() => g.command({ type: 'BUY_TREASURE', treasureId: 'forged', price: 0 }), /보물/);
 buy(g); const item = g.state.inventory[0], seq = g.state.eventSeq;
 assert.equal(item.name, '환영합니다'); assert.equal(item.slot, 'treasure'); assert.equal(g.state.gold, 0); assert.deepEqual(g.snapshot().treasureOffers, []);
 buy(g); assert.equal(g.state.eventSeq, seq); assert.equal(g.state.inventory.length, 1);
 g.create({ name: '첫째', appearanceId: 'warrior' }); const first = g.character;
 const second = g.create({ name: '둘째', appearanceId: 'wizard' }); g.selectCharacter(second.id);
 assert.equal(sortInventory(g.snapshot(), 'treasure', true)[0].id, item.id);
 g.retireCharacter(first.id, first.name); assert.ok(g.state.inventory.some(i => i.id === item.id));
 const restored = new Game(config, JSON.parse(JSON.stringify(g.state)), () => 0); buy(restored);
 assert.equal(restored.state.inventory.filter(i => i.slot === 'treasure').length, 1); assert.equal(restored.state.gold, 0); assert.deepEqual(restored.snapshot().treasureOffers, []);
});
test('collectible cannot equip or sell and never enters bulk sale or combat stats', () => {
 const g = new Game(config, null, () => 0); g.create({ name: '시험', appearanceId: 'warrior' });
 const stats = g.snapshot().combatStats; buy(g); const item = g.state.inventory.find(i => i.slot === 'treasure');
 for (const type of ['SELL', 'EQUIP', 'UNEQUIP']) assert.throws(() => g.command({ type, characterId: g.character.id, itemId: item.id }), /소장품/);
 assert.deepEqual(g.snapshot().combatStats, stats); item.gradeId = 'normal';
 assert.ok(!g.normalSaleItems().includes(item)); g.command({ type: 'SELL_NORMAL' }); assert.ok(g.state.inventory.includes(item));
 g.beginBattle(); const battle = structuredClone(g.state.battle); buy(g); assert.deepEqual(g.state.battle, battle);
});
test('treasure cards separate the free offer from the owned chest viewer', () => {
 const g = new Game(config); const offer = treasureCardHTML(g.snapshot().treasureOffers[0], false);
 assert.match(offer, /구입 0 G/); assert.match(offer, /icon chest/); assert.doesNotMatch(offer, /data-open-treasure/);
 buy(g); const card = treasureCardHTML(g.state.inventory[0]); assert.match(card, /data-open-treasure/); assert.match(card, /소장 중/); assert.doesNotMatch(card, /BUY_TREASURE|data-action="SELL"|data-action="EQUIP"/);
});
test('HTTP purchase enforces account isolation, duplicate retries, restart persistence and no client price authority', { timeout: 20000 }, async () => {
 const dir = mkdtempSync('/tmp/zwie-treasure-test-'), probe = createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise(r => probe.close(r)); const base = `http://127.0.0.1:${port}`;
 let child; const pause = ms => new Promise(r => setTimeout(r, ms));
 async function start() { child = spawn(process.execPath, ['src/server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, HOST:'127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: base, DATA_DIR: dir }, stdio: 'ignore' }); for (let n=0;n<80;n++) { try { if ((await fetch(base+'/api/health')).ok) return; } catch {} await pause(50); } throw Error('test server start failed'); }
 async function stop() { if (!child || child.exitCode !== null) return; const c=child; child=null; const done=new Promise(r=>c.once('exit',r)); c.kill('SIGTERM'); await done; }
 async function req(path, body, cookie='') { const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})}); return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}; }
 try {
  await start(); const command = {type:'BUY_TREASURE',treasureId:'welcome-title',price:-10000,requestId:randomUUID()}; assert.equal((await req('/api/command',command)).status,401);
  const a=await req('/api/auth/register',{username:'treasure_alpha',password:'123456'}), b=await req('/api/auth/register',{username:'treasure_beta',password:'123456'}); assert.equal(a.status,200);assert.equal(b.status,200);
  const [x,y]=await Promise.all([req('/api/command',command,a.cookie),req('/api/command',{...command,requestId:randomUUID()},a.cookie)]);assert.equal(x.status,200);assert.equal(y.status,200);
  assert.equal((await req('/api/command',command,a.cookie)).body.duplicate,true);
  let saved=(await req('/api/state',null,a.cookie)).body.state;assert.equal(saved.inventory.length,1);assert.equal(saved.gold,0);assert.equal(saved.treasureOffers.length,0);
  const other=(await req('/api/state',null,b.cookie)).body.state;assert.equal(other.inventory.length,0);assert.equal(other.treasureOffers.length,1);
  assert.equal((await req('/api/command',{type:'SELL',itemId:saved.inventory[0].id,requestId:randomUUID()},b.cookie)).status,409);
  await stop();await start();saved=(await req('/api/state',null,a.cookie)).body.state;assert.equal(saved.inventory[0].slot,'treasure');assert.equal(saved.gold,0);assert.equal(saved.treasureOffers.length,0);
 } finally { await stop();rmSync(dir,{recursive:true,force:true}); }
});
