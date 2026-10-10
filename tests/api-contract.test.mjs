import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadScopePlatform, loadAppPlatforms, loadSystemAdapter, AppWindow, ScopeContext } from './support/FxArkRuntime.mjs';
const require=createRequire(import.meta.url);const ts=require('typescript');
const nodes=[];const native={created:[],permissionReads:[],displayReads:[],grant:-1};
loadScopePlatform();const {FxWindowHost}=loadAppPlatforms();loadSystemAdapter(native);
const Module=require('node:module');const original=Module._load;
Module._load=function(name,...args){if(name==='@ohos.arkui.node')return {FrameNode:class{constructor(){this.commonEvent={setOnSizeChange(){}};}getMeasuredSize(){return {width:0,height:0};}addComponentContent(node){this.node=node;}dispose(){}},NodeContent:class{addFrameNode(frame){this.frame=frame;}removeFrameNode(){this.frame=undefined;}},ComponentContent:class{constructor(context,builder,params){this.params=params;this.updates=[];nodes.push(this);}update(params){this.params=params;this.updates.push(params);}dispose(){this.disposed=true;}}};return original.call(this,name,...args);};
for(const file of ['component/FxContent','scope/FxHostBinding','FloatingX']){const destination=path.resolve('work/core',file+'.js');fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,ts.transpileModule(fs.readFileSync('floatingx/src/main/ets/'+file+'.ets','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText);}
const {FloatingX}=require('../work/core/FloatingX.js');const {FxContent}=require('../work/core/component/FxContent.js');const {FxConfig}=require('../work/core/core/FxConfig.js');const {FxController}=require('../work/core/core/FxController.js');const {FakePlatform,deferred}=await import('./support/FxFakes.mjs');
Module._load=original;
const content=()=>new FxContent({builder:()=>{}}, {label:'first'}, {width:50,height:50});
const host=async()=>FxWindowHost.create({getMainWindow:async()=>new AppWindow()});

test('public options fail synchronously before native access; constructor and import remain lazy',async()=>{
 assert.throws(()=>FloatingX.installApp({tag:'',host:undefined,content:content(),config:new FxConfig()}),{code:'INVALID_CONFIG'});
 assert.throws(()=>FloatingX.installSystem({tag:'sys',context:undefined,content:content(),size:{width:50,height:50},config:new FxConfig()}),{code:'INVALID_CONFIG'});
 assert.throws(()=>FloatingX.createScope({content:content(),config:new FxConfig({}) ,storage:{namespace:'',key:'a',storage:{}}}),{code:'INVALID_CONFIG'});
 const scope=FloatingX.createScope({content:content(),config:new FxConfig()});
 const sys=FloatingX.installSystem({tag:'lazy-system',context:{},content:content(),size:{width:50,height:50},config:new FxConfig()});
 assert.deepEqual(native.permissionReads,[]);assert.deepEqual(native.created,[]);assert.deepEqual(nodes,[]);
 await scope.cancel();await sys.cancel();
});
test('shared app/system tags, typed handles, defensive tag copy and cancel registry release',async()=>{
 const h=await host();const item=FloatingX.installApp({tag:'shared',host:h,content:content(),config:new FxConfig()});
 assert.throws(()=>FloatingX.installSystem({tag:'shared',context:{},content:content(),size:{width:50,height:50},config:new FxConfig()}),{code:'DUPLICATE_TAG'});
 assert.equal(FloatingX.control('shared'),item);assert.equal(FloatingX.isInstalled('shared'),true);
 FloatingX.getAllTags().push('forged');assert.deepEqual(FloatingX.getAllTags(),['shared']);
 const scope=FloatingX.createScope({content:content(),config:new FxConfig()});assert.deepEqual(FloatingX.getAllTags(),['shared']);
 await item.cancel();assert.equal(FloatingX.controlOrNull('shared'),undefined);assert.throws(()=>FloatingX.control('shared'),{code:'NOT_INSTALLED'});
 await scope.cancel();await h.dispose();
});
test('actual facade and content adapter suppress late content commit when cancel wins',async()=>{
 const source=content();const control=FloatingX.createScope({content:source,config:new FxConfig()});
 const platform=require('../work/core/scope/FxHostBinding.js').scopeHostBinding(control).platform;platform.mountHost(new ScopeContext(),source);platform.layoutHost({width:300,height:300});await control.show();
 const node=nodes.at(-1);const updating=control.updateContent({label:'late'});await control.cancel();
 await assert.rejects(updating,{code:'DESTROYED'});assert.deepEqual(node.updates,[]);assert.equal(node.disposed,true);
 for(const action of [()=>control.show(),()=>control.hide(),()=>control.move(1,2),()=>control.moveByVector(1,2),()=>control.updateConfig(new FxConfig()),()=>control.updateContent({label:'dead'}),()=>control.clearPosition()])await assert.rejects(action(),{code:'DESTROYED'});
});
test('scope show before mount is stable hidden and retained intent resumes after layout',async()=>{
 const source=content();const control=FloatingX.createScope({content:source,config:new FxConfig()});await control.show();assert.equal(control.isShow(),false);assert.equal(control.getState(),'idle');
 const platform=require('../work/core/scope/FxHostBinding.js').scopeHostBinding(control).platform;platform.mountHost(new ScopeContext(),source);platform.layoutHost({width:300,height:300});await control.show();assert.equal(control.isShow(),true);await control.cancel();
});
test('async event callback rejection is sanitized, does not undo success or recursively emit ERROR',async()=>{
 const platform=new FakePlatform();const logged=[];const events=[];let controller;
 controller=new FxController(platform,new FxConfig(),event=>{events.push(event.type);if(event.type==='show')return controller.hide().then(()=>{throw Error('secret business payload');});if(event.type==='hide')return controller.cancel();},{error:error=>logged.push(error)});
 await controller.show();await new Promise(resolve=>setImmediate(resolve));await controller.cancel();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(controller.getState(),'destroyed');assert.deepEqual(events.filter(e=>e==='error'),[]);assert.equal(logged.length,1);assert.equal(logged[0].code,'EVENT_CALLBACK_FAILED');assert.equal(logged[0].message.includes('secret'),false);
});
test('content update retains original native mount and leaves installation untouched',async()=>{
 const source=content();const control=FloatingX.createScope({content:source,config:new FxConfig()});
 const platform=require('../work/core/scope/FxHostBinding.js').scopeHostBinding(control).platform;
 platform.mountHost(new ScopeContext(),source);platform.layoutHost({width:300,height:300});await control.show();
 const node=nodes.at(-1);await control.updateContent({label:'updated'});assert.equal(nodes.at(-1),node);assert.equal(node.params.label,'updated');assert.equal(node.disposed,undefined);await control.cancel();
});
test('reentrant async callback returning canceled hide rejection is caught once without error loop',async()=>{
 const events=[];const logs=[];let control;
 control=new FxController(new FakePlatform(),new FxConfig(),event=>{events.push(event.type);if(event.type==='show')return control.cancel().then(()=>control.hide());},{error:error=>logs.push(error)});
 await control.show();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(control.getState(),'destroyed');assert.deepEqual(events,['show','destroy']);assert.deepEqual(logs.map(e=>e.code),['EVENT_CALLBACK_FAILED']);
});
test('public uninstallAll preserves every tag failure and releases all handles',async()=>{
 FloatingX.setLogger({error(){}});
 const windows=[new AppWindow(),new AppWindow()];const hosts=await Promise.all(windows.map(w=>FxWindowHost.create({getMainWindow:async()=>w})));
 const items=hosts.map((h,i)=>FloatingX.installApp({tag:'batch-'+i,host:h,content:content(),config:new FxConfig()}));await Promise.all(items.map(c=>c.show()));
 windows.forEach((w,i)=>{w.overlay.removeComponentContent=()=>{throw Object.assign(Error('native secret'),{code:80+i});};});
 await assert.rejects(FloatingX.uninstallAll(),error=>{assert.equal(error.code,'UNINSTALL_FAILED');assert.deepEqual(error.failures.map(f=>[f.tag,f.error.platformCode]),[['batch-0',80],['batch-1',81]]);return true;});
 assert.deepEqual(FloatingX.getAllTags(),[]);assert.deepEqual(items.map(c=>c.getState()),['destroyed','destroyed']);await Promise.all(hosts.map(h=>h.dispose()));FloatingX.setLogger(undefined);
});
test('content constructor rejects invalid builder and size before native allocation',()=>{
 assert.throws(()=>new FxContent(undefined,{label:'bad'},{width:50,height:50}),{code:'INVALID_CONFIG'});
 assert.throws(()=>new FxContent({builder:()=>{}},{label:'bad'},{width:0,height:50}),{code:'INVALID_CONFIG'});
 assert.throws(()=>new FxContent({builder:()=>{}},null,{width:50,height:50}),{code:'INVALID_CONFIG'});
});
test('system fallback uses installed system tag storage key and exposes actual app scope',async()=>{
 const window=new AppWindow();const h=await FxWindowHost.create({getMainWindow:async()=>window});const keys=[];const events=[];
 FloatingX.setLogger({error(){}});
 const item=FloatingX.installSystem({tag:'stored-system',context:{},content:content(),size:{width:50,height:50},config:new FxConfig(),fallback:{host:h},
 storage:{namespace:'test',storage:{async load(key){keys.push(['load',key]);},async save(key){keys.push(['save',key]);},async clear(key){keys.push(['clear',key]);}}},events:e=>{events.push(e);}});
 assert.equal(native.permissionReads.length,0);await item.show();
 const layer=[...window.overlay.nodes][0];layer.platform.layoutHost({width:300,height:300});await item.show();
 assert.equal(item.isShow(),true);await item.move(10,15);await item.clearPosition();
 assert.equal(events.find(e=>e.error)?.actualScope,'app');assert.equal(events.find(e=>e.type==='show').actualScope,'app');
 assert.deepEqual([...new Set(keys.map(k=>k[1]))],['fx1:4:test6:system13:stored-system']);
 await item.cancel();await h.dispose();FloatingX.setLogger(undefined);
});
