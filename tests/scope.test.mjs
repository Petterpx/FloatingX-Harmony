import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadScopePlatform,ScopeContext,ScopeContent } from './support/FxArkRuntime.mjs';
const require=createRequire(import.meta.url);
const {FxConfig}=require('../work/core/core/FxConfig.js');
const {FxController}=require('../work/core/core/FxController.js');
const FxScopePlatform=loadScopePlatform();
const touch=(type,id,x,y,timeMs)=>({type,changedTouches:[{id,windowX:x,windowY:y}],timestamp:timeMs*1000000});
async function setup(options={},interactions={}) {
 const platform=new FxScopePlatform(interactions); const events=[];
 const config=new FxConfig({adsorb:false,...options});
 const controller=new FxController(platform,config,e=>events.push(e.type),{error() {}});
 const content=new ScopeContent(); const context=new ScopeContext(); platform.bindController(controller);
 platform.mountHost(context,content); platform.layoutHost({width:300,height:500});
 await controller.show(); return {platform,controller,events,context,content,config};
}
test('real scope adapter waits for measured host, remounts fresh nodes and retains hidden intent',async()=>{
 const p=new FxScopePlatform(); const c=new FxController(p,new FxConfig()); p.bindController(c);
 await c.show(); assert.equal(c.isShow(),false);
 const source=new ScopeContent(); const first=new ScopeContext(); p.mountHost(first,source);
 await c.show(); assert.equal(c.isShow(),false);
 p.layoutHost({width:300,height:500}); await c.show(); assert.equal(c.isShow(),true);
 await c.hide(); p.unmountHost(); await c.setHostVisible(false);
 p.mountHost(new ScopeContext(),source); p.layoutHost({width:300,height:500}); await c.setHostVisible(true);
 assert.equal(c.isShow(),false); assert.equal(source.mounts.length,2); assert.equal(source.disposals,1);
 await c.cancel(); assert.equal(source.disposals,2);
});
test('absolute touch frames preserve logical vp, save once after settlement and suppress dragged click',async()=>{
 let clicks=0; const s=await setup({position:{x:10,y:20}},{onClick:()=>clicks++});
 const saves=[];
 const p=new FxScopePlatform({onClick:()=>clicks++}); const c=new FxController(p,new FxConfig({position:{x:10,y:20},adsorb:false})); p.bindController(c);
 c.bindPositionStorage({namespace:'scope',key:'drag',storage:{async load(){},async save(k,v){saves.push(v);},async clear(){}}},()=>p.getGeometry());
 p.mountHost(new ScopeContext(),new ScopeContent()); p.layoutHost({width:300,height:500}); await c.show();
 p.handleTouch(touch(0,1,100,100,0)); p.handleTouch(touch(2,1,120,130,20));
 p.handleTouch(touch(2,1,140,150,40)); assert.deepEqual(p.getPosition(),{x:50,y:70}); assert.equal(saves.length,0);
 p.handleTouch(touch(1,1,140,150,60)); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
 assert.equal(saves.length,1); assert.equal(clicks,0); assert.deepEqual(saves[0].position,{x:50,y:70});
 await c.cancel(); await s.controller.cancel();
});
test('manual drag interruption of settle animation cannot save its stale completion',async()=>{
 const p=new FxScopePlatform(); const c=new FxController(p,new FxConfig({adsorb:true,animation:{enabled:true,durationMs:300,curve:'ease'}}));
 p.bindController(c); const saves=[];
 c.bindPositionStorage({namespace:'scope',key:'cancel',storage:{async load(){},async save(k,v){saves.push(v);},async clear(){}}},()=>p.getGeometry());
 const context=new ScopeContext(); p.mountHost(context,new ScopeContent()); p.layoutHost({width:300,height:500});
 const showing=c.show(); for(let i=0;i<12;i++) await Promise.resolve(); context.finishes.shift()(); await showing;
 p.handleTouch(touch(0,1,0,0,0)); p.handleTouch(touch(2,1,50,50,50)); p.handleTouch(touch(1,1,50,50,70));
 p.handleTouch(touch(0,1,100,100,100)); for(let i=0;i<8;i++) await Promise.resolve();
 assert.equal(saves.length,0); context.finishes.shift()(); assert.equal(saves.length,0);
 p.unmountHost(); await c.cancel();
});
test('content resize clamps legal position and half-hide projection keeps logical full position',async()=>{
 const s=await setup({position:{x:250,y:400},halfHide:true,edgeAdsorb:'right'});
 assert.equal(s.platform.getSnapshot().projection.visibleSize.width,25);
 assert.equal(s.controller.getX(),250);
 s.platform.layoutContent({width:100,height:100}); assert.equal(s.controller.getX(),200);
 s.platform.layoutHost({width:150,height:200}); assert.equal(s.controller.getX(),50); assert.equal(s.controller.getY(),100);
 await s.controller.cancel();
});
test('hide interrupts real adapter animation and stale native finish cannot revive visibility',async()=>{
 const s=await setup(); s.config.animation.enabled=true; await s.controller.updateConfig(s.config);
 const moving=s.controller.move(100,100,true); for(let i=0;i<6;i++) await Promise.resolve();
 const hiding=s.controller.hide(); await moving; for(let i=0;i<12;i++) await Promise.resolve();
 assert.equal(s.context.finishes.length,2); s.context.finishes[0](); s.context.finishes[1]();
 await Promise.all([moving,hiding]); assert.equal(s.controller.isShow(),false); await s.controller.cancel();
});

test('unmount before queued initial show prevents create and keeps show intent',async()=>{
 const p=new FxScopePlatform(); const events=[]; const c=new FxController(p,new FxConfig(),e=>events.push(e.type),{error(){}}); p.bindController(c);
 const source=new ScopeContent(); p.mountHost(new ScopeContext(),source); p.layoutHost({width:300,height:500});
 const showing=c.show(); p.unmountHost(); await showing; assert.equal(c.isShow(),false); assert.equal(source.mounts.length,0);
 p.mountHost(new ScopeContext(),source); p.layoutHost({width:300,height:500}); await c.setHostVisible(true);
 assert.equal(c.isShow(),true); assert.deepEqual(events,['attach','show']); await c.cancel();
});

test('cancel before first create releases mounted host and prevents remount resurrection',async()=>{
 const p=new FxScopePlatform(); const c=new FxController(p,new FxConfig()); p.bindController(c);
 const source=new ScopeContent(); p.mountHost(new ScopeContext(),source); await c.cancel();
 p.mountHost(new ScopeContext(),source); assert.equal(p.isHostVisible(),false);
 assert.equal(p.getSnapshot().content,undefined);
});
test('final primary up coordinate is included in drag settlement',async()=>{
 const s=await setup({position:{x:10,y:20}});
 s.platform.handleTouch(touch(0,1,100,100,0)); s.platform.handleTouch(touch(2,1,120,120,20));
 s.platform.handleTouch(touch(1,1,160,170,40)); await Promise.resolve();
 assert.deepEqual(s.platform.getPosition(),{x:70,y:90}); await s.controller.cancel();
});

test('async interaction callback rejection is captured once in controller error channel',async()=>{
 const p=new FxScopePlatform({onClick:async()=>{throw new Error('click failure');}}); const errors=[];
 const c=new FxController(p,new FxConfig(),e=>{if(e.error) errors.push(e.error);},{error(){}}); p.bindController(c);
 p.mountHost(new ScopeContext(),new ScopeContent()); p.layoutHost({width:300,height:500}); await c.show();
 p.handleTouch(touch(0,1,0,0,0)); p.handleTouch(touch(1,1,0,0,20)); for(let i=0;i<4;i++) await Promise.resolve();
 assert.equal(errors.length,1); assert.equal(errors[0].message,'click failure'); await c.cancel();
});

test('native content dispose failure still releases platform-owned host and snapshot references',async()=>{
 const p=new FxScopePlatform(); const c=new FxController(p,new FxConfig(),undefined,{error(){}}); p.bindController(c);
 p.mountHost(new ScopeContext(),{size:{width:50,height:50},create(){return {content:{},dispose(){throw new Error('native dispose');}};}});
 p.layoutHost({width:300,height:500}); await c.show(); await assert.rejects(c.cancel(),{code:'WINDOW_OPERATION_FAILED'});
 assert.equal(p.isHostVisible(),false); assert.equal(p.getSnapshot().content,undefined);
});

test('unmount captures native dispose error and releases source for remount',async()=>{
 const p=new FxScopePlatform(); const errors=[]; const c=new FxController(p,new FxConfig(),e=>{if(e.error)errors.push(e.error);},{error(){}});p.bindController(c);
 p.mountHost(new ScopeContext(),{size:{width:50,height:50},create(){return {content:{},dispose(){throw new Error('unmount dispose');}};}});
 p.layoutHost({width:300,height:500}); await c.show(); assert.doesNotThrow(()=>p.unmountHost());
 assert.equal(errors.length,1); p.mountHost(new ScopeContext(),new ScopeContent()); p.layoutHost({width:300,height:500});
 await c.setHostVisible(true); assert.equal(c.isShow(),true); await c.cancel();
});
