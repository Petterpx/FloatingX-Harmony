import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {allowsPage,copyPagePolicy}=require('../work/core/app/FxPageFilter.js');
test('unknown page is denied only by whitelist',()=>{
 assert.equal(allowsPage({mode:'whitelist',names:[]}),false);
 assert.equal(allowsPage({mode:'blacklist',names:['Home']}),true);
});
test('page policies use exact names including case and whitespace',()=>{
 const p={mode:'whitelist',names:['Home']}; assert.equal(allowsPage(p,'Home'),true);
 for(const name of ['home',' Home','Home/detail']) assert.equal(allowsPage(p,name),false);
 assert.equal(allowsPage({mode:'blacklist',names:['Home']},'Home'),false);
});
test('copied page policy is unaffected by caller array changes',()=>{
 const names=['Home']; const p=copyPagePolicy({mode:'whitelist',names}); names.push('Secret'); names[0]='Other';
 assert.deepEqual(p.names,['Home']); assert.equal(allowsPage(p,'Secret'),false);
});
