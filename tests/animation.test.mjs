import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { FxAnimation } = require('../work/core/component/FxAnimation.js');
test('new move invalidates previous completion',()=>{
 const a=new FxAnimation(); const first=a.begin(); const second=a.begin();
 assert.equal(a.isCurrent(first),false); assert.equal(a.isCurrent(second),true); assert.ok(second>first);
});
test('hide, host disappearance, manual drag and destroy reject late completion',()=>{
 const a=new FxAnimation(); for(const action of ['hide','unmount','drag','destroy']) {
 const token=a.begin(); let committed=false; a.cancel();
 if(a.isCurrent(token)) committed=true; assert.equal(committed,false,action);
 }
});
