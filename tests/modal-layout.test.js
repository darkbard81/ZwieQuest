import test from 'node:test';
import assert from 'node:assert/strict';
import { modalSafeBounds, initModalViewport } from '../public/modal-layout.js';

test('iPad landscape/portrait, phone and desktop use supplied insets once', () => {
  for (const layout of [{width:1133,height:744},{width:744,height:1133},{width:390,height:844},{width:1440,height:900}]) {
    assert.deepEqual(modalSafeBounds(layout), {left:0,top:0,...layout});
    assert.deepEqual(modalSafeBounds(layout, layout, {top:24,bottom:20,left:31,right:7}),
      {left:31,top:24,width:layout.width-38,height:layout.height-44});
  }
});
test('keyboard and panned visual viewport intersect safe edges without duplicate inset subtraction', () => {
  const layout={width:1133,height:744}, safe={top:24,bottom:20,left:31,right:7};
  assert.deepEqual(modalSafeBounds(layout,{width:1133,height:400},safe),{left:31,top:24,width:1095,height:376});
  assert.deepEqual(modalSafeBounds(layout,{offsetTop:100,offsetLeft:50,width:900,height:400},safe),{left:50,top:100,width:900,height:400});
  assert.deepEqual(modalSafeBounds(layout,{width:1133,height:700,offsetTop:24},safe),{left:31,top:24,width:1095,height:700});
  const empty=modalSafeBounds({width:20,height:20},{width:20,height:20},{left:30,right:30,top:30,bottom:30});
  assert.equal(empty.width,0);assert.equal(empty.height,0);
});
test('viewport events update modal bounds, preserve pinch zoom and leave main viewport styles untouched', () => {
  const props=new Map(), events=new Map(), visualEvents=new Map(); let callback;
  const root={clientWidth:1133,style:{setProperty:(k,v)=>props.set(k,v)}};
  const visual={width:1133,height:744,offsetTop:0,offsetLeft:0,scale:1,
    addEventListener:(k,v)=>visualEvents.set(k,v),removeEventListener:k=>visualEvents.delete(k)};
  const win={innerHeight:744,visualViewport:visual,getComputedStyle:()=>({getPropertyValue:k=>({'--safe-top':'24px','--safe-bottom':'20px','--safe-left':'31px','--safe-right':'7px'}[k])}),
    addEventListener:(k,v)=>events.set(k,v),removeEventListener:k=>events.delete(k),cancelAnimationFrame(){},requestAnimationFrame(fn){callback=fn;return 1;}};
  const dispose=initModalViewport(win,root);
  assert.equal(props.get('--modal-safe-height'),'700px');assert.equal(props.get('--modal-safe-width'),'1095px');
  visual.height=400;visualEvents.get('resize')();callback();assert.equal(props.get('--modal-safe-height'),'376px');
  visual.offsetTop=80;visualEvents.get('scroll')();callback();assert.equal(props.get('--modal-safe-top'),'80px');
  root.clientWidth=744;win.innerHeight=1133;Object.assign(visual,{width:744,height:1133,offsetTop:0});events.get('orientationchange')();callback();
  assert.equal(props.get('--modal-safe-width'),'706px');assert.equal(props.get('--modal-safe-height'),'1089px');
  visual.scale=2;visual.height=200;visualEvents.get('resize')();callback();assert.equal(props.get('--modal-safe-height'),'1089px');
  assert.ok([...props.keys()].every(k=>k.startsWith('--modal-safe-')));
  dispose();assert.equal(events.size,0);assert.equal(visualEvents.size,0);
});
