import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { FxTouch } = require('../work/core/component/FxTouch.js');
const p = (id,x,y,timeMs) => ({id,x,y,timeMs});
test('only primary pointer controls drag and termination', () => {
 const t = new FxTouch('Normal',8,300,500);
 t.down(p(1,10,10,0),{x:40,y:50}); t.down(p(2,200,200,10));
 assert.equal(t.move(p(2,220,220,20)).kind,'none');
 assert.equal(t.up(p(2,220,220,30)).kind,'none');
 assert.deepEqual(t.move(p(1,30,40,40)),{kind:'drag',position:{x:60,y:80}});
 assert.equal(t.up(p(1,30,40,50)).kind,'end');
});
test('cancel never becomes a click',()=>{
 const t=new FxTouch('Normal',8,300,500); t.down(p(1,0,0,0));
 assert.equal(t.cancel().kind,'end'); assert.equal(t.up(p(1,0,0,20)).kind,'none');
});
test('threshold inclusive tap and click interval use supplied time',()=>{
 const t=new FxTouch('Normal',8,300,500);
 t.down(p(1,0,0,0)); assert.equal(t.up(p(1,8,0,20)).kind,'click');
 t.down(p(1,0,0,50)); assert.equal(t.up(p(1,0,0,100)).kind,'end');
 t.down(p(1,0,0,320)); assert.equal(t.up(p(1,0,0,330)).kind,'click');
});
test('long press is emitted once and excludes click and later drag',()=>{
 const t=new FxTouch('Normal',8,300,500); t.down(p(1,0,0,0));
 assert.equal(t.move(p(1,0,0,500)).kind,'longPress');
 assert.equal(t.move(p(1,100,0,600)).kind,'none');
 assert.equal(t.up(p(1,100,0,700)).kind,'end');
});
test('drag before long press deadline excludes long press and click',()=>{
 const t=new FxTouch('Normal',8,300,500); t.down(p(1,0,0,0));
 assert.equal(t.move(p(1,9,0,50)).kind,'drag');
 assert.equal(t.move(p(1,10,0,600)).kind,'drag'); assert.equal(t.up(p(1,10,0,700)).kind,'end');
});
test('ClickOnly cancels displaced taps without moving; DisplayOnly ignores everything',()=>{
 const t=new FxTouch('ClickOnly',8,300,500); t.down(p(1,0,0,0));
 assert.equal(t.move(p(1,100,0,20)).kind,'none'); assert.equal(t.up(p(1,100,0,50)).kind,'end');
 t.down(p(1,0,0,300)); assert.equal(t.up(p(1,0,0,350)).kind,'click');
 const d=new FxTouch('DisplayOnly',8,300,500); assert.equal(d.down(p(1,0,0,0)).kind,'none');
 assert.equal(d.up(p(1,0,0,600)).kind,'none'); assert.equal(d.cancel().kind,'none');
});
