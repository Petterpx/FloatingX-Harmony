import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadScopePlatform,loadAppPlatforms,AppWindow,ScopeContent} from './support/FxArkRuntime.mjs';
const require=createRequire(import.meta.url); loadScopePlatform();
const {FxWindowHost,FxAppPlatform}=loadAppPlatforms();
const {FxConfig}=require('../work/core/core/FxConfig.js'); const {FxController}=require('../work/core/core/FxController.js');
async function setup(policy={mode:'blacklist',names:['Blocked']}) {
 const win=new AppWindow(); const host=await FxWindowHost.create({getMainWindow:async()=>win});
 const source=new ScopeContent(); const p=new FxAppPlatform(host,source,policy); const events=[];
 const c=new FxController(p,new FxConfig({adsorb:false}),e=>events.push(e),{error(){}}); p.bindController(c);await c.show();p.layoutHost({width:300,height:500});await c.setHostVisible(p.isHostVisible());
 return {win,host,source,p,c,events};
}
test('app eligibility preserves user hide and restores wanted show across pages and foreground',async()=>{
 const s=await setup();await s.c.show();assert.equal(s.c.isShow(),true);
 await s.c.hide();s.host.setPage('Allowed');await s.c.setHostVisible(s.p.isHostVisible());assert.equal(s.c.isShow(),false);
 await s.c.show();s.host.setPage('Blocked');await s.c.setHostVisible(s.p.isHostVisible());assert.equal(s.c.isShow(),false);
 s.host.setPage('Allowed');await s.c.setHostVisible(s.p.isHostVisible());assert.equal(s.c.isShow(),true);
 s.win.emit('windowEvent',2);await s.c.setHostVisible(s.p.isHostVisible());assert.equal(s.c.isShow(),false);
 s.host.setPage('Other');await s.c.setHostVisible(s.p.isHostVisible());assert.equal(s.c.isShow(),false);
 s.win.emit('windowEvent',1);await s.c.setHostVisible(s.p.isHostVisible());assert.equal(s.c.isShow(),true);
 assert.ok(s.events.every(e=>e.actualScope==='app'));await s.host.dispose();
});
test('window hosts remain independent and disposal removes only owned layer',async()=>{
 const a=await setup();const b=await setup();const business={};a.win.overlay.nodes.add(business);
 await a.c.show();await b.c.show();a.host.setPage('Blocked');await a.c.setHostVisible(a.p.isHostVisible());
 assert.equal(b.c.isShow(),true);await a.host.dispose();assert.equal(a.host.isValid(),false);assert.equal(a.c.getState(),'destroyed');
 assert.deepEqual([...a.win.overlay.nodes],[business]);assert.equal(a.win.overlay.disposals,1);assert.equal(a.source.disposals,1);
 assert.deepEqual(a.win.offCalls.sort(),['avoidAreaChange','windowEvent','windowSizeChange']);await b.host.dispose();
});
test('late factory after stage destruction cannot subscribe or create host',async()=>{
 const win=new AppWindow();let resolve;let valid=true;const creating=FxWindowHost.create({getMainWindow:()=>new Promise(r=>resolve=r)},()=>valid);
 valid=false;resolve(win);await assert.rejects(creating,{code:'NO_HOST'});assert.equal(win.callbacks.size,0);
});
test('dispose invalidates synchronously, late layout cannot revive and native remove failure still clears listeners',async()=>{
 const s=await setup();await s.c.show();s.win.overlay.removeComponentContent=()=>{throw Error('remove failure');};
 const disposing=s.host.dispose();assert.equal(s.host.isValid(),false);s.p.layoutHost({width:400,height:600});
 await assert.rejects(disposing);assert.equal(s.c.getState(),'destroyed');assert.equal(s.win.callbacks.size,0);assert.equal(s.win.overlay.disposals,1);assert.equal(s.source.disposals,1);
});
test('physical attach cannot override denied page or background eligibility',async()=>{
 const s=await setup({mode:'whitelist',names:['Allowed']});await s.c.show();assert.equal(s.c.isShow(),false);
 await s.p.create();await s.c.setHostVisible(s.p.isHostVisible());assert.equal(s.c.isShow(),false);
 s.win.emit('windowEvent',2);s.host.setPage('Allowed');await s.c.setHostVisible(s.p.isHostVisible());assert.equal(s.c.isShow(),false);
 await s.host.dispose();
});
test('controller reads combined platform eligibility on physical attach',async()=>{
 let attachment;const p={actualScope:'app',isHostVisible:()=>false,subscribeLifecycle:f=>{attachment=f;return ()=>{};},async create(){},async show(){},async hide(){},async move(p){return p;},async applyConfig(){},async destroy(){}};
 const c=new FxController(p,new FxConfig());await c.show();attachment('attach');for(let i=0;i<10;i++)await Promise.resolve();assert.equal(c.isShow(),false);await c.cancel();
});
test('first show retains intent until asynchronous transparent overlay layout arrives',async()=>{
 const win=new AppWindow();const host=await FxWindowHost.create({getMainWindow:async()=>win});
 const source=new ScopeContent();const p=new FxAppPlatform(host,source);const c=new FxController(p,new FxConfig());p.bindController(c);
 await c.show();assert.equal(c.isShow(),false);assert.equal(source.mounts.length,1);assert.equal(win.overlay.nodes.size,1);
 p.layoutHost({width:300,height:500});await c.setHostVisible(p.isHostVisible());assert.equal(c.isShow(),true);assert.equal(source.mounts.length,1);await host.dispose();
});
test('constructor and binding defer native overlay work until first show',async()=>{
 const win=new AppWindow();const host=await FxWindowHost.create({getMainWindow:async()=>win});const source=new ScopeContent();
 const p=new FxAppPlatform(host,source);const c=new FxController(p,new FxConfig());p.bindController(c);
 assert.equal(win.overlay.nodes.size,0);assert.equal(source.mounts.length,0);await c.show();assert.equal(c.isShow(),false);assert.equal(win.overlay.nodes.size,1);await host.dispose();
});
test('core waits for readiness before geometry configuration and visible commit',async()=>{
 let ready=false;const calls=[];const p={isHostVisible:()=>true,isReadyToShow:()=>ready,async create(){calls.push('create');},async applyConfig(){calls.push('config');},async show(){calls.push('show');},async hide(){},async move(p){return p;},async destroy(){}};
 const c=new FxController(p,new FxConfig());await c.show();assert.equal(c.isShow(),false);assert.deepEqual(calls,['create']);ready=true;await c.setHostVisible(true);assert.deepEqual(calls,['create','config','show']);await c.cancel();
});
test('hide or page denial before first layout preserves current desire and eligibility',async()=>{
 const win=new AppWindow();const host=await FxWindowHost.create({getMainWindow:async()=>win});const p=new FxAppPlatform(host,new ScopeContent(),{mode:'blacklist',names:['Blocked']});const c=new FxController(p,new FxConfig());p.bindController(c);
 await c.show();assert.equal(c.getState(),'hidden');await c.hide();p.layoutHost({width:300,height:500});await c.setHostVisible(p.isHostVisible());assert.equal(c.isShow(),false);
 await c.show();host.setPage('Blocked');p.layoutHost({width:400,height:600});await c.setHostVisible(p.isHostVisible());assert.equal(c.isShow(),false);await host.dispose();
});
test('cancel before asynchronous first layout releases layer and late callback cannot mount',async()=>{
 const win=new AppWindow();const host=await FxWindowHost.create({getMainWindow:async()=>win});const source=new ScopeContent();const p=new FxAppPlatform(host,source);const c=new FxController(p,new FxConfig());p.bindController(c);
 await c.show();await c.cancel();p.layoutHost({width:300,height:500});assert.equal(c.getState(),'destroyed');assert.equal(win.overlay.nodes.size,0);assert.equal(source.disposals,1);await host.dispose();
});
test('native hide failure preserves last successful native visibility',async()=>{
 const s=await setup();s.win.overlay.hideComponentContent=()=>{throw Error('hide failure');};
 await assert.rejects(s.c.hide());assert.equal(s.c.isShow(),true);assert.equal(s.p.getSnapshot().visible,true);await s.host.dispose();
});
test('app reuses storage geometry: restore before visibility, drag frames save only on release',async()=>{
 const win=new AppWindow();const host=await FxWindowHost.create({getMainWindow:async()=>win});const p=new FxAppPlatform(host,new ScopeContent());const c=new FxController(p,new FxConfig({adsorb:false}));p.bindController(c);const saves=[];
 c.bindPositionStorage({namespace:'app',key:'position',storage:{async load(){return {version:1,position:{x:20,y:40},viewport:{width:300,height:500},edge:'none'};},async save(k,v){saves.push(v);},async clear(){}}},()=>p.getGeometry());
 await c.show();assert.equal(c.isShow(),false);p.layoutHost({width:300,height:500});await c.setHostVisible(true);assert.equal(c.getX(),20);assert.equal(c.getY(),40);
 const touch=(type,x,y,t)=>({type,changedTouches:[{id:1,windowX:x,windowY:y}],timestamp:t*1000000});p.handleTouch(touch(0,100,100,0));p.handleTouch(touch(2,130,150,20));assert.equal(saves.length,0);p.handleTouch(touch(1,130,150,40));for(let i=0;i<8;i++)await Promise.resolve();assert.equal(saves.length,1);assert.deepEqual(saves[0].position,{x:50,y:90});await host.dispose();
});
test('host releases every own listener even if native off fails and callbacks arrive late',async()=>{
 const s=await setup();const late=s.win.callbacks.get('windowEvent');const original=s.win.off.bind(s.win);s.win.off=(name,callback)=>{original(name,callback);if(name==='windowEvent')throw Error('off failure');};
 await assert.rejects(s.host.dispose());late(1);s.p.layoutHost({width:999,height:999});assert.equal(s.win.callbacks.size,0);assert.equal(s.c.getState(),'destroyed');assert.equal(s.win.overlay.nodes.size,0);
});
test('configuration and programmatic move before layout wait for measured geometry and save once ready',async()=>{
 const win=new AppWindow();const host=await FxWindowHost.create({getMainWindow:async()=>win});const p=new FxAppPlatform(host,new ScopeContent());const c=new FxController(p,new FxConfig({adsorb:false}));p.bindController(c);const saves=[];
 c.bindPositionStorage({namespace:'app',key:'earlymove',storage:{async load(){return {version:1,position:{x:3,y:4},viewport:{width:300,height:500},edge:'none'};},async save(k,v){saves.push(v);},async clear(){}}},()=>p.getGeometry());
 await c.show();await c.updateConfig(new FxConfig({adsorb:false,position:{x:10,y:20}}));await c.move(70,90);assert.equal(saves.length,0);assert.equal(c.getX(),70);assert.equal(c.getY(),90);
 p.layoutHost({width:300,height:500});await c.setHostVisible(true);assert.equal(c.getX(),70);assert.equal(c.getY(),90);assert.equal(saves.length,1);assert.deepEqual(saves[0].viewport,{width:300,height:500});await host.dispose();
});
test('throwing invalidation subscriber cannot skip later subscribers or any owned disposal',async()=>{
 const s=await setup();const otherSource=new ScopeContent();const otherPlatform=new FxAppPlatform(s.host,otherSource);const other=new FxController(otherPlatform,new FxConfig());otherPlatform.bindController(other);await other.show();otherPlatform.layoutHost({width:300,height:500});await other.setHostVisible(true);
 const firstFailure=new Error('first invalidation subscriber');const secondFailure=new Error('second invalidation subscriber');let later=0;
 s.host.subscribe(()=>{throw firstFailure;});s.host.subscribe(()=>{throw secondFailure;});s.host.subscribe(()=>{later++;});
 let disposal;assert.doesNotThrow(()=>{disposal=s.host.dispose();});assert.equal(s.host.isValid(),false);assert.equal(later,1);
 await assert.rejects(disposal,error=>{assert.equal(error,firstFailure);return true;});
 assert.equal(s.c.getState(),'destroyed');assert.equal(other.getState(),'destroyed');assert.equal(s.source.disposals,1);assert.equal(otherSource.disposals,1);assert.equal(s.win.overlay.nodes.size,0);assert.equal(s.win.callbacks.size,0);
 assert.deepEqual(s.win.offCalls.sort(),['avoidAreaChange','windowEvent','windowSizeChange']);
});
test('reentrant dispose returns established promise and cleanup is attempted exactly once',async()=>{
 const s=await setup();let reentered;let calls=0;
 s.host.subscribe(()=>{calls++;if(calls===1)reentered=s.host.dispose();});
 const disposal=s.host.dispose();assert.equal(reentered,disposal);await disposal;
 assert.equal(s.host.dispose(),disposal);assert.equal(calls,1);assert.equal(s.c.getState(),'destroyed');assert.equal(s.source.disposals,1);assert.equal(s.win.overlay.disposals,1);assert.equal(s.win.offCalls.length,3);
});

test('real app adapter retains right edge and relative y through live overlay resize',async()=>{
 const s=await setup();await s.c.updateConfig(new FxConfig({edgeAdsorb:'right',halfHide:true}));await s.c.move(250,225);
 s.p.layoutHost({width:500,height:300});assert.deepEqual(s.p.getPosition(),{x:450,y:125});assert.equal(s.p.getSnapshot().projection.visibleSize.width,25);
 s.p.layoutHost({width:300,height:500});assert.deepEqual(s.p.getPosition(),{x:250,y:225});await s.host.dispose();
});
