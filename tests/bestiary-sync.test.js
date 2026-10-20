import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBestiarySync } from '../public/bestiary-sync.js';
import { initBestiary } from '../public/bestiary-view.js';
import { Game } from '../src/game.js';
import { eligibleVariations } from '../src/monsters.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
function journalDOM(t) {
  const nodes = new Map();
  const element = () => ({ innerHTML:'', textContent:'', hidden:false, open:false, style:{setProperty(){}}, setAttribute(){}, contains(){return false;}, showModal(){this.open=true;}, close(){this.open=false;}, querySelector(selector){ if (!nodes.has(selector)) nodes.set(selector,element()); return nodes.get(selector); } });
  const document = {body:{append(){}},createElement:element,activeElement:null};
  const previous = globalThis.document; globalThis.document=document;
  t.after(()=>{ if(previous===undefined)delete globalThis.document;else globalThis.document=previous; });
  const panel=element();return {view:initBestiary(panel),nodes};
}
test('opening the journal recovers a missed harpy encounter and victory in the grid and detail',async t=>{
 const {view,nodes}=journalDOM(t),g=new Game(config,null,()=>0);g.create({name:'도감',appearanceId:'warrior'});
 const before=g.snapshot();before.version=1;
 const pool=eligibleVariations('village'),index=pool.findIndex(({variation})=>variation.id==='blunt_harpy');let call=0;g.rng=()=>call++===0?index:0;
 g.beginBattle();g.reward('victory');g.state.version=2;const after=g.snapshot();
 const sync=createBestiarySync(view,async()=>({state:after}));sync.update(before);
 assert.doesNotMatch(nodes.get('#bestiary-grid').innerHTML,/blunt_harpy/);
 await sync.refresh();
 assert.match(nodes.get('#bestiary-grid').innerHTML,/data-variation="blunt_harpy"/);assert.equal(nodes.get('#bestiary-count').textContent,'1종 조우');
 nodes.get('#bestiary-grid').onclick({target:{closest:()=>({dataset:{variation:'blunt_harpy'}})}});
 assert.match(nodes.get('#bestiary-detail').innerHTML,/조우 1회 · 처치 1회/);
});
test('refreshes coalesce and a late pre-victory response cannot remove new records',async()=>{
 const request=deferred(),rendered=[];let calls=0;
 const sync=createBestiarySync({update:s=>rendered.push(s)},()=>{calls++;return request.promise;});
 sync.update({progressId:'a',version:1,bestiary:{}});
 const first=sync.refresh();assert.equal(sync.refresh(),first);await Promise.resolve();assert.equal(calls,1);
 const latest={progressId:'a',version:3,bestiary:{harpy:{defeats:1}}};sync.update(latest);
 request.resolve({state:{progressId:'a',version:2,bestiary:{}}});await first;assert.equal(rendered.at(-1),latest);
});
test('logout and account reset discard in-flight journal responses',async()=>{
 for(const next of [null,{progressId:'reset',version:1,bestiary:{}}]){
  const request=deferred(),rendered=[],sync=createBestiarySync({update:s=>rendered.push(s)},()=>request.promise);
  sync.update({progressId:'old',version:10,bestiary:{}});const pending=sync.refresh();sync.update(next);
  request.resolve({state:{progressId:'old',version:11,bestiary:{harpy:{}}}});await pending;assert.equal(rendered.at(-1),next);
 }
});
test('a failed refresh can be retried',async()=>{
 let calls=0;const sync=createBestiarySync({update(){}},async()=>{if(++calls===1)throw Error('offline');return {state:{progressId:'a',version:2,bestiary:{}}};});
 sync.update({progressId:'a',version:1,bestiary:{}});await assert.rejects(sync.refresh(),/offline/);await sync.refresh();assert.equal(calls,2);
});
