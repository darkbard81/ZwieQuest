import test from 'node:test';
import assert from 'node:assert/strict';
import { initAdminSettings } from '../public/admin-settings.js';
function fixture(t) {
 const nodes=new Map();
 const element=()=>({innerHTML:'',value:'',hidden:false,disabled:false,handlers:{},classList:{toggle(){}},setAttribute(){},append(){},insertBefore(){},replaceChildren(){},focus(){},showModal(){},close(){},addEventListener(name,fn){this.handlers[name]=fn;},querySelector(selector){if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);}});
 const doc=element();doc.body=element();doc.createElement=tag=>{const node=element();if(tag==='table')node.tBodies=[element()];return node;};
 const old=globalThis.document;globalThis.document=doc;t.after(()=>{if(old===undefined)delete globalThis.document;else globalThis.document=old;});
 return {nodes,doc};
}
test('map reset button confirms the current account and submits its captured progress and unique request',async t=>{
 const {nodes,doc}=fixture(t),calls=[],results=[];let current={progressId:'before'};
 const user={id:'admin',username:'owner',isAdmin:true};
 initAdminSettings({getUser:()=>user,getState:()=>current,onReset:r=>results.push(r),api:async(path,body)=>{calls.push({path,body});return path==='/api/admin/accounts'?{accounts:[]}:{state:{progressId:'after'}};}});
 nodes.get('#admin-reset-maps').onclick();assert.equal(nodes.get('#admin-delete-title').textContent,'owner 지도·체크포인트를 초기화할까요?');
 assert.match(nodes.get('#admin-confirm-description').textContent,/캐릭터·성장·현재 HP·장비·금화·도감은 유지/);
 assert.equal(nodes.get('#admin-delete').disabled,true);
 const input=nodes.get('#admin-confirm-name');input.value='wrong';input.handlers.input({target:input});assert.equal(nodes.get('#admin-delete').disabled,true);
 input.value='owner';input.handlers.input({target:input});assert.equal(nodes.get('#admin-delete').disabled,false);
 current={progressId:'newer'};await nodes.get('#admin-confirm').onsubmit({preventDefault(){}});
 assert.equal(calls[0].path,'/api/command');assert.equal(calls[0].body.type,'ADMIN_RESET_MAPS');assert.equal(calls[0].body.confirmUsername,'owner');assert.equal(calls[0].body.progressId,'before');assert.match(calls[0].body.requestId,/^[\w-]{8,100}$/);assert.equal(calls[0].body.userId,undefined);assert.equal(results.length,1);
 assert.match(nodes.get('#admin-status').textContent,/지도·체크포인트를 초기화/);
});
test('cancelled map reset sends no request and a failed submission reuses its request ID',async t=>{
 const {nodes}=fixture(t),calls=[];
 initAdminSettings({getUser:()=>({id:'admin',username:'owner',isAdmin:true}),getState:()=>({progressId:'p'}),api:async(path,body)=>{calls.push(body);throw Error('network');}});
 nodes.get('#admin-reset-maps').onclick();nodes.get('#admin-cancel').onclick();assert.equal(calls.length,0);assert.equal(nodes.get('#admin-confirm').hidden,true);
 nodes.get('#admin-reset-maps').onclick();nodes.get('#admin-confirm-name').value='owner';
 await nodes.get('#admin-confirm').onsubmit({preventDefault(){}});await nodes.get('#admin-confirm').onsubmit({preventDefault(){}});
 assert.equal(calls.length,2);assert.equal(calls[0].requestId,calls[1].requestId);assert.equal(nodes.get('#admin-status').textContent,'network');
});
