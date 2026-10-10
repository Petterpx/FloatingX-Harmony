import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {FakeWindowFactory, systemGeometry, FakePlatform, deferred} from './support/FxFakes.mjs';
const require=createRequire(import.meta.url);
const {FxSystemPlatform}=require('../work/core/system/FxSystemPlatform.js');
const {FxError}=require('../work/core/core/FxError.js');
const {FxConfig}=require('../work/core/core/FxConfig.js');
const {FxEdgeAdsorb}=require('../work/core/core/FxTypes.js');
test('permission rejection does not silently downgrade',async()=>{const f=new FakeWindowFactory('denied');const p=new FxSystemPlatform(f,systemGeometry());await assert.rejects(p.create(),{code:'PERMISSION_DENIED'});assert.equal(f.createCount,0);});
test('capability rejection and lazy constructor',async()=>{const f=new FakeWindowFactory('unsupported');const p=new FxSystemPlatform(f,systemGeometry());assert.equal(f.checkCount,0);await assert.rejects(p.create(),{code:'CAPABILITY_UNSUPPORTED'});assert.equal(f.createCount,0);});
test('explicit fallback preserves original cause and does not allocate until requested',async()=>{const f=new FakeWindowFactory('denied');const app=new FakePlatform();app.actualScope='app';let count=0;const events=[];const p=new FxSystemPlatform(f,systemGeometry(),()=>{count++;return app;},e=>events.push(e));assert.equal(count,0);await p.create();assert.equal(count,1);assert.equal(p.actualScope,'app');assert.equal(events[0].error.code,'PERMISSION_DENIED');});
test('partially created windows are destroyed before fallback; cleanup failure rejects fallback',async()=>{for(const failure of [false,true]){const f=new FakeWindowFactory();f.native.errors.set('load',new FxError('CAPABILITY_UNSUPPORTED','route unavailable'));if(failure)f.native.errors.set('destroy',Error('cleanup failed'));let count=0;const p=new FxSystemPlatform(f,systemGeometry(),()=>{assert.ok(f.native.calls.includes('destroy'));count++;return new FakePlatform();});if(failure){await assert.rejects(p.create(),/cleanup failed/);assert.equal(count,0);}else{await p.create();assert.equal(count,1);}}});
test('ordinary load error never falls back and releases partial resource',async()=>{const f=new FakeWindowFactory();f.native.errors.set('load',Error('load failed'));let count=0;const p=new FxSystemPlatform(f,systemGeometry(),()=>{count++;return new FakePlatform();});await assert.rejects(p.create(),/load failed/);assert.equal(count,0);assert.equal(f.native.calls.at(-1),'destroy');});
test('explicit size, density conversion and actual readback',async()=>{for(const density of [2,3]){const f=new FakeWindowFactory();f.native.viewport.density=density;const p=new FxSystemPlatform(f,systemGeometry());await p.create();await p.applyConfig(new FxConfig({adsorb:false,position:{x:0,y:0}}));assert.deepEqual(f.native.sizes.at(-1),{width:50*density,height:50*density});f.native.correction={x:2,y:3};assert.deepEqual(await p.move({x:10,y:10},false),{x:10+2/density,y:10+3/density});assert.deepEqual(f.native.moves.at(-1),{x:10*density,y:10*density});}});
test('density changes reproject vp and DisplayOnly is native untouchable',async()=>{const f=new FakeWindowFactory();const p=new FxSystemPlatform(f,systemGeometry());await p.create();await p.applyConfig(new FxConfig({adsorb:false,displayMode:'display-only'}));f.native.viewport.density=3;await p.move({x:10,y:10},false);assert.deepEqual(f.native.moves.at(-1),{x:30,y:30});assert.equal(f.native.touchable,false);});
test('four half hidden edges keep logical size and native clipping separate',async()=>{for(const [edge,point,size,offset,native]of [[FxEdgeAdsorb.LEFT,{x:0,y:20},{width:25,height:50},{x:-25,y:0},{x:0,y:20}],[FxEdgeAdsorb.RIGHT,{x:250,y:20},{width:25,height:50},{x:0,y:0},{x:275,y:20}],[FxEdgeAdsorb.TOP,{x:20,y:0},{width:50,height:25},{x:0,y:-25},{x:20,y:0}],[FxEdgeAdsorb.BOTTOM,{x:20,y:450},{width:50,height:25},{x:0,y:0},{x:20,y:475}]]){const f=new FakeWindowFactory();const p=new FxSystemPlatform(f,systemGeometry());await p.create();await p.applyConfig(new FxConfig({position:point,halfHide:true,edgeAdsorb:edge}));assert.deepEqual(p.getProjection().visibleSize,size);assert.deepEqual(p.getProjection().contentOffset,offset);assert.deepEqual(f.native.moves.at(-1),native);assert.deepEqual(p.getPosition(),point);assert.deepEqual(p.getGeometry().content,{width:50,height:50});await p.applyConfig(new FxConfig({position:point,halfHide:false,edgeAdsorb:edge}));assert.deepEqual(f.native.sizes.at(-1),{width:50,height:50});}});
test('unsupported native size rejects and restores last successful projection',async()=>{const f=new FakeWindowFactory();const p=new FxSystemPlatform(f,systemGeometry());await p.create();await p.applyConfig(new FxConfig({adsorb:false,position:{x:20,y:20}}));await p.move({x:0,y:20},false);f.native.sizeCorrection=1;await assert.rejects(p.applyConfig(new FxConfig({halfHide:true,edgeAdsorb:FxEdgeAdsorb.LEFT,position:{x:0,y:20}})),{code:'CAPABILITY_UNSUPPORTED'});assert.deepEqual(p.getPosition(),{x:0,y:20});});
test('move failure preserves state and is not fallback; destroy attempts release finally',async()=>{const f=new FakeWindowFactory();const p=new FxSystemPlatform(f,systemGeometry());await p.create();await p.applyConfig(new FxConfig({adsorb:false,position:{x:20,y:20}}));f.native.errors.set('move',Error('move failed'));await assert.rejects(p.move({x:40,y:40},false),/move failed/);assert.deepEqual(p.getPosition(),{x:20,y:20});f.native.errors.delete('move');f.native.errors.set('destroy',Error('destroy failed'));await assert.rejects(p.destroy(),/destroy failed/);assert.equal(f.native.releaseCount,1);assert.equal(p.isHostVisible(),false);});
class TestClock {time=0; gate; now(){return this.time;} wait(){this.gate=deferred();return this.gate.promise;} advance(ms){this.time+=ms;this.gate?.resolve();this.gate=undefined;} cancel(){this.gate?.resolve();this.gate=undefined;}}
test('native animation advances actual frames and cancellation cannot commit stale readback',async()=>{const f=new FakeWindowFactory();const clock=new TestClock();const p=new FxSystemPlatform(f,systemGeometry(),undefined,undefined,clock);await p.create();await p.applyConfig(new FxConfig({adsorb:false,position:{x:0,y:0},animation:{enabled:true,durationMs:100,curve:'linear'}}));const motion=p.move({x:100,y:100},true);for(let i=0;i<8;i++)await Promise.resolve();clock.advance(50);for(let i=0;i<8;i++)await Promise.resolve();assert.deepEqual(f.native.moves.at(-1),{x:50,y:50});p.cancelAnimations();await motion;const last=f.native.moves.length;clock.advance(100);await Promise.resolve();assert.equal(f.native.moves.length,last);assert.deepEqual(p.getPosition(),{x:50,y:50});});
test('controller cancel during native allocation destroys once without showing',async()=>{const {FxController}=require('../work/core/core/FxController.js');const f=new FakeWindowFactory();const gate=deferred();const original=f.create.bind(f);f.create=async()=>{await gate.promise;return original();};const p=new FxSystemPlatform(f,systemGeometry());const controller=new FxController(p,new FxConfig(),undefined,{error(){}});p.bindController(controller);const showing=controller.show();const observed=assert.rejects(showing,{code:'DESTROYED'});await Promise.resolve();await Promise.resolve();const canceled=controller.cancel();gate.resolve();await observed;await canceled;assert.equal(f.native.calls.filter(x=>x==='destroy').length,1);assert.ok(!f.native.calls.includes('show'));});
test('system eligibility persists when main app is backgrounded and destroy clears delayed native frame',async()=>{const f=new FakeWindowFactory();const p=new FxSystemPlatform(f,systemGeometry());await p.create();assert.equal(p.isHostVisible(),true);await p.show();await p.destroy();assert.equal(p.isHostVisible(),false);assert.equal(f.native.calls.filter(x=>x==='destroy').length,1);});
import {loadSystemAdapter,ScopeContent,ScopeContext} from './support/FxArkRuntime.mjs';
function nativeBoundary(){const boundary={grant:0,created:[],permissionReads:[],displayReads:[],display:{width:600,height:1000,densityPixels:2},view:undefined};boundary.window={properties:{displayId:42,focusable:true,touchable:true,windowRect:{left:0,top:0,width:100,height:100}},operations:[],failures:new Map(),getWindowProperties(){return {...this.properties,windowRect:{...this.properties.windowRect}};},async invoke(name){this.operations.push(name);if(this.failures.has(name)){const error=this.failures.get(name);this.failures.delete(name);throw error;}},async setWindowTouchable(value){await this.invoke('touchable');this.properties.touchable=value;},async setWindowFocusable(value){await this.invoke('focusable');this.properties.focusable=value;},async showWindow(){await this.invoke('show');},async destroyWindow(){await this.invoke('destroy');},setWindowBackgroundColor(value){this.operations.push('background');this.background=value;},async resize(width,height){await this.invoke('resize');this.properties.windowRect.width=width;this.properties.windowRect.height=height;},async moveWindowTo(x,y){await this.invoke('move');this.properties.windowRect.left=x;this.properties.windowRect.top=y;},async loadContentByName(name,storage){await this.invoke('load');boundary.route=name;boundary.storage=storage;const entry=boundary.api.FxSystemPageRegistry.find(storage.get('fxSystemInstanceId'));boundary.view=new boundary.api.FxSystemPageView(entry.owner,new ScopeContext(),entry.source,entry.interactions);await boundary.view.create();}};boundary.window.callbacks=new Map();boundary.window.on=(name,fn)=>boundary.window.callbacks.set(name,fn);boundary.window.off=(name,fn)=>{if(boundary.window.callbacks.get(name)===fn)boundary.window.callbacks.delete(name);};boundary.window.emitRect=reason=>boundary.window.callbacks.get('windowRectChange')?.({reason,rect:{...boundary.window.properties.windowRect}});const resize=boundary.window.resize;boundary.window.resize=async(w,h)=>{await resize.call(boundary.window,w,h);boundary.window.emitRect(0);};const move=boundary.window.moveWindowTo;boundary.window.moveWindowTo=async(x,y)=>{await move.call(boundary.window,x,y);boundary.window.emitRect(3);};boundary.window.getUIContext=()=>new ScopeContext();boundary.api=loadSystemAdapter(boundary);return boundary;}
test('real native adapter checks access token lazily and packages named route with per-instance storage',async()=>{const b=nativeBoundary();const source=new ScopeContent();const f=new b.api.FxNativeWindowFactory({},source);assert.equal(b.permissionReads.length,0);await f.checkAccess();assert.deepEqual(b.permissionReads,[[123,'ohos.permission.SYSTEM_FLOAT_WINDOW']]);const p=new FxSystemPlatform(f,systemGeometry());await p.create();assert.equal(b.route,'FloatingXSystemPage');assert.match(b.storage.get('fxSystemInstanceId'),/^FloatingXSystem_/);assert.deepEqual(b.displayReads,[42]);assert.equal(source.mounts.length,1);assert.equal(b.window.background,'#00000000');await p.destroy();assert.equal(b.api.FxSystemPageRegistry.find(b.storage.get('fxSystemInstanceId')),undefined);assert.equal(source.disposals,1);});
test('API12 hidden system surface is invisible, non-touchable and non-focusable; show restores target properties',async()=>{const b=nativeBoundary();const p=new FxSystemPlatform(new b.api.FxNativeWindowFactory({},new ScopeContent()),systemGeometry());await p.create();await p.applyConfig(new FxConfig({adsorb:false}));await p.show();await p.hide();assert.equal(b.view.getSnapshot().visible,false);assert.equal(b.window.properties.touchable,false);assert.equal(b.window.properties.focusable,false);await p.show();assert.equal(b.window.properties.touchable,true);assert.equal(b.window.properties.focusable,true);await p.applyConfig(new FxConfig({displayMode:'display-only'}));await p.hide();await p.show();assert.equal(b.window.properties.touchable,false);assert.equal(b.window.properties.focusable,false);await p.destroy();});
test('hide native property failure rejects and restores visible interaction state',async()=>{const b=nativeBoundary();const p=new FxSystemPlatform(new b.api.FxNativeWindowFactory({},new ScopeContent()),systemGeometry());await p.create();await p.applyConfig(new FxConfig());await p.show();b.window.failures.set('focusable',Error('focus failure'));await assert.rejects(p.hide(),/focus failure/);assert.equal(b.window.properties.touchable,true);assert.equal(b.window.properties.focusable,true);assert.equal(b.view.getSnapshot().visible,true);await p.destroy();});
test('system drag consumes display vp despite moving local coordinates and saves only final native readback',async()=>{const {FxController}=require('../work/core/core/FxController.js');const b=nativeBoundary();const p=new FxSystemPlatform(new b.api.FxNativeWindowFactory({},new ScopeContent()),systemGeometry());const saved=[];const controller=new FxController(p,new FxConfig({adsorb:false,position:{x:10,y:10}}),undefined,{error(){}});p.bindController(controller);controller.bindPositionStorage({namespace:'tests',key:'system',storage:{async load(){},async save(key,record){saved.push({key,record});},async clear(){}}},()=>p.getGeometry());await controller.show();const event=(type,displayX,windowX)=>({type,timestamp:1000000,changedTouches:[{id:1,displayX,displayY:100,windowX,windowY:0}]});b.view.handleTouch(event(TouchType.Down,100,0));b.view.handleTouch(event(TouchType.Move,120,0));for(let i=0;i<15;i++)await Promise.resolve();assert.equal(p.getPosition().x,30);assert.equal(saved.length,0);b.view.handleTouch(event(TouchType.Up,140,-20));for(let i=0;i<25;i++)await Promise.resolve();assert.equal(p.getPosition().x,50);assert.equal(saved.length,1);assert.equal(saved[0].record.position.x,50);assert.match(saved[0].key,/system/);await controller.cancel();});
test('new system pointer cancels native animation and cannot resume older frame',async()=>{const b=nativeBoundary();const clock=new TestClock();const p=new FxSystemPlatform(new b.api.FxNativeWindowFactory({},new ScopeContent()),systemGeometry(),undefined,undefined,clock);await p.create();await p.applyConfig(new FxConfig({adsorb:false,animation:{enabled:true,durationMs:100,curve:'linear'}}));const moving=p.move({x:100,y:100},true);for(let i=0;i<8;i++)await Promise.resolve();b.view.handleTouch({type:TouchType.Down,timestamp:1000000,changedTouches:[{id:1,displayX:100,displayY:100,windowX:0,windowY:0}]});clock.advance(100);await moving;assert.deepEqual(p.getPosition(),{x:0,y:0});await p.destroy();});
test('secondary system pointer cannot reset the shared primary gesture',async()=>{const b=nativeBoundary();const p=new FxSystemPlatform(new b.api.FxNativeWindowFactory({},new ScopeContent()),systemGeometry());await p.create();await p.applyConfig(new FxConfig({adsorb:false,position:{x:10,y:10}}));const event=(type,id,x)=>({type,timestamp:1000000,changedTouches:[{id,displayX:x,displayY:100,windowX:0,windowY:0}]});b.view.handleTouch(event(TouchType.Down,1,100));b.view.handleTouch(event(TouchType.Down,2,1000));b.view.handleTouch(event(TouchType.Move,1,120));for(let i=0;i<20;i++)await Promise.resolve();assert.equal(p.getPosition().x,30);await p.destroy();});
test('native access checks classify only actual permission or capability errors as fallback-eligible',async()=>{for(const [code,expected]of [[201,'PERMISSION_DENIED'],[801,'CAPABILITY_UNSUPPORTED'],[16000050,'WINDOW_OPERATION_FAILED']]){const b=nativeBoundary();b.accessError=Object.assign(Error('access API failed'),{code});const f=new b.api.FxNativeWindowFactory({},new ScopeContent());await assert.rejects(f.checkAccess(),{code:expected,platformCode:code});}});

test('configuration waits for and supersedes an in-flight native projection without rollback corruption',async()=>{
 const f=new FakeWindowFactory();const p=new FxSystemPlatform(f,systemGeometry());await p.create();await p.applyConfig(new FxConfig({adsorb:false,position:{x:0,y:20}}));
 const started=deferred();const gate=deferred();const original=f.native.movePx.bind(f.native);let gated=true;
 f.native.movePx=async point=>{if(gated){gated=false;started.resolve();await gate.promise;}return original(point);};
 const moving=p.move({x:0,y:30},false);await started.promise;
 let configured=false;const configuring=p.applyConfig(new FxConfig({adsorb:false,halfHide:true,edgeAdsorb:FxEdgeAdsorb.LEFT})).then(()=>{configured=true;});
 for(let i=0;i<10;i++)await Promise.resolve();const committedBeforeOldNativeFinished=configured;gate.resolve();
 const results=await Promise.allSettled([moving,configuring]);
 assert.equal(committedBeforeOldNativeFinished,false);assert.ok(results.every(result=>result.status==='fulfilled'));
 assert.equal(p.getProjection().visibleSize.width,25);assert.equal(f.native.getRect().width,25);assert.deepEqual(p.getPosition(),{x:0,y:20});await p.destroy();
});
test('display density and viewport change refresh shared drag release bounds',async()=>{
 const b=nativeBoundary();const p=new FxSystemPlatform(new b.api.FxNativeWindowFactory({},new ScopeContent()),systemGeometry());await p.create();await p.applyConfig(new FxConfig({adsorb:false,position:{x:10,y:10}}));
 b.display.width=1500;b.display.densityPixels=3;b.displayListener(42);for(let i=0;i<20;i++)await Promise.resolve();assert.equal(p.getGeometry().viewport.size.width,500);
 const event=(type,x)=>({type,timestamp:1000000,changedTouches:[{id:1,displayX:x,displayY:100,windowX:0,windowY:0}]});
 b.view.handleTouch(event(TouchType.Down,100));b.view.handleTouch(event(TouchType.Move,490));for(let i=0;i<20;i++)await Promise.resolve();assert.equal(p.getPosition().x,400);
 b.view.handleTouch(event(TouchType.Up,490));for(let i=0;i<30;i++)await Promise.resolve();assert.equal(p.getPosition().x,400);assert.equal(b.window.properties.windowRect.left,1200);await p.destroy();
});
test('post-allocation adapter failure destroys native window before allowing fallback',async()=>{
 for(const code of [16000050,801]){
  const b=nativeBoundary();b.window.getWindowProperties=()=>{throw Object.assign(Error('properties failed'),{code});};let fallbacks=0;
  const p=new FxSystemPlatform(new b.api.FxNativeWindowFactory({},new ScopeContent()),systemGeometry(),()=>{assert.equal(b.window.operations.filter(x=>x==='destroy').length,1);fallbacks++;return new FakePlatform();});
  if(code===801){await p.create();assert.equal(fallbacks,1);}else{await assert.rejects(p.create(),{code:'WINDOW_OPERATION_FAILED',platformCode:code});assert.equal(fallbacks,0);}
  assert.equal(b.window.operations.filter(x=>x==='destroy').length,1);await p.destroy();
 }
});
test('failed cleanup after adapter construction failure prohibits fallback even for native capability codes',async()=>{
 const b=nativeBoundary();b.window.getWindowProperties=()=>{throw Object.assign(Error('properties failed'),{code:801});};b.window.failures.set('destroy',Object.assign(Error('constructor cleanup failed'),{code:801}));let fallbacks=0;
 const p=new FxSystemPlatform(new b.api.FxNativeWindowFactory({},new ScopeContent()),systemGeometry(),()=>{fallbacks++;return new FakePlatform();});
 await assert.rejects(p.create(),{code:'WINDOW_OPERATION_FAILED',platformCode:801});assert.equal(fallbacks,0);assert.equal(b.window.operations.filter(x=>x==='destroy').length,1);
});
test('changed viewport insets feed shared nearest-edge settlement before native projection',async()=>{
 const b=nativeBoundary();const f=new FakeWindowFactory();const p=new FxSystemPlatform(f,systemGeometry());await p.create();
 const view=new b.api.FxSystemPageView(p,new ScopeContext(),new ScopeContent(),{});await view.create();await p.applyConfig(new FxConfig({position:{x:30,y:20},adsorb:true,edgeAdsorb:FxEdgeAdsorb.LEFT_RIGHT}));
 f.native.viewport.size={width:500,height:500};f.native.viewport.insets={left:30,top:5,right:40,bottom:20};await p.move({x:30,y:20},false);
 const event=(type,x)=>({type,timestamp:1000000,changedTouches:[{id:1,displayX:x,displayY:100,windowX:0,windowY:0}]});
 view.handleTouch(event(TouchType.Down,100));view.handleTouch(event(TouchType.Move,292));for(let i=0;i<20;i++)await Promise.resolve();assert.equal(p.getPosition().x,222);
 view.handleTouch(event(TouchType.Up,292));for(let i=0;i<30;i++)await Promise.resolve();assert.equal(p.getPosition().x,410);await p.destroy();
});
test('superseded native move restores its last rectangle if the queued configuration fails',async()=>{
 const f=new FakeWindowFactory();const p=new FxSystemPlatform(f,systemGeometry());await p.create();await p.applyConfig(new FxConfig({adsorb:false,position:{x:0,y:20}}));
 const started=deferred();const gate=deferred();const original=f.native.movePx.bind(f.native);let gated=true;
 f.native.movePx=async point=>{if(gated){gated=false;started.resolve();await gate.promise;}return original(point);};
 const moving=p.move({x:0,y:30},false);await started.promise;f.native.errors.set('touchable',Error('config touchability failed'));
 const configuring=p.applyConfig(new FxConfig({halfHide:true,edgeAdsorb:FxEdgeAdsorb.LEFT}));const rejected=assert.rejects(configuring,/config touchability failed/);gate.resolve();await moving;await rejected;
 assert.deepEqual(p.getPosition(),{x:0,y:20});assert.equal(f.native.getRect().y,20);await p.destroy();
});

test('system view reports measured full content to native owner, never clipped area or late disposed resize',async()=>{
 const b=nativeBoundary();const source=new ScopeContent();let full={width:50,height:50};let observer;
 source.create=()=>({content:{},measure:()=>full,observeSize:callback=>{observer=callback;},dispose(){}});
 const input=systemGeometry();const reported=[];
 const owner={getGeometry:()=>input,getProjection:()=>({position:{x:0,y:0},visibleSize:{width:25,height:50},contentOffset:{x:-25,y:0}}),attachView(){},detachView(){},layoutContent(size){reported.push({...size});input.content={...size};}};
 const view=new b.api.FxSystemPageView(owner,new ScopeContext(),source,{});await view.create();
 view.layoutContent({width:25,height:50});assert.deepEqual(input.content,{width:50,height:50});assert.deepEqual(reported,[]);
 full={width:80,height:60};observer(full);assert.deepEqual(input.content,full);assert.deepEqual(reported,[full]);
 await view.destroy();observer({width:99,height:99});assert.deepEqual(reported,[full]);
});

function deferredWindowRect() {
 const b=nativeBoundary();let ready=false;const target={left:0,top:0,width:0,height:0};
 b.window.getWindowProperties=()=>({...b.window.properties,windowRect:ready?{...target}:{left:0,top:0,width:0,height:0}});
 b.window.resize=async(width,height)=>{await b.window.invoke('resize');if(width<=0||height<=0)throw Object.assign(Error('invalid zero rollback'),{code:401});target.width=width;target.height=height;if(ready)b.window.callbacks.get('windowRectChange')?.({reason:0,rect:{...target}});};
 b.window.moveWindowTo=async(x,y)=>{await b.window.invoke('move');target.left=x;target.top=y;if(ready)b.window.callbacks.get('windowRectChange')?.({reason:3,rect:{...target}});};
 b.window.showWindow=async()=>{await b.window.invoke('show');ready=true;b.window.callbacks.get('windowRectChange')?.({reason:3,rect:{...target}});};
 return b;
}
test('first hidden native rectangle is prepared after requested geometry without marking content visible or restoring interaction early',async()=>{
 const b=deferredWindowRect();const p=new FxSystemPlatform(new b.api.FxNativeWindowFactory({},new ScopeContent()),systemGeometry());
 await p.create();assert.deepEqual(b.window.getWindowProperties().windowRect,{left:0,top:0,width:100,height:100});
 assert.equal(b.view.getSnapshot().visible,false);assert.equal(b.window.properties.touchable,false);assert.equal(b.window.properties.focusable,false);
 const requested=b.window.operations.indexOf('move');assert.ok(requested>=0 && requested<b.window.operations.indexOf('show'));
 await p.applyConfig(new FxConfig({adsorb:false}));assert.equal(b.window.properties.touchable,false);assert.equal(b.window.properties.focusable,false);
 await p.show();assert.equal(b.view.getSnapshot().visible,true);assert.equal(b.window.properties.touchable,true);assert.equal(b.window.properties.focusable,true);await p.destroy();
});
test('native preparation failure retains original code and releases allocated window, page, view and listener',async()=>{
 const b=deferredWindowRect();const source=new ScopeContent();b.window.failures.set('show',Object.assign(Error('native ready failure'),{code:997}));
 const p=new FxSystemPlatform(new b.api.FxNativeWindowFactory({},source),systemGeometry());
 await assert.rejects(p.create(),{code:'WINDOW_OPERATION_FAILED',platformCode:997,message:'native ready failure'});
 assert.equal(b.window.operations.filter(x=>x==='destroy').length,1);assert.equal(source.disposals,1);assert.equal(b.displayListener,undefined);
 assert.equal(b.api.FxSystemPageRegistry.find(b.storage.get('fxSystemInstanceId')),undefined);
});
test('invalid initial zero rectangle is never rolled back and cannot mask unsupported readback with parameter error',async()=>{
 const f=new FakeWindowFactory();const originalRect=f.native.getRect.bind(f.native);const originalResize=f.native.resize.bind(f.native);const sizes=[];
 f.native.getRect=()=>({...originalRect(),width:0,height:0});
 f.native.resize=async size=>{sizes.push({...size});if(size.width<=0 || size.height<=0)throw Object.assign(Error('invalid rollback'),{code:401});await originalResize(size);};
 f.native.movePx=async()=>f.native.getRect();
 const p=new FxSystemPlatform(f,systemGeometry());await assert.rejects(p.create(),{code:'CAPABILITY_UNSUPPORTED'});assert.deepEqual(sizes,[{width:50,height:50}]);assert.equal(f.native.releaseCount,1);
});

async function waitingNativeRect() {
 const b=nativeBoundary();const events=[];let current={left:0,top:0,width:100,height:100};let pending={...current};
 b.window.getWindowProperties=()=>({...b.window.properties,windowRect:{...current}});
 b.window.moveWindowTo=async(x,y)=>{await b.window.invoke('move');pending={...current,left:x,top:y};};
 const on=b.window.on;b.window.on=(name,callback)=>{events.push(callback);on(name,callback);};
 const native=await new b.api.FxNativeWindowFactory({},new ScopeContent()).create();await native.prepareGeometry();
 return {b,native,events,commit(rect=pending,reason=3){current={...rect};events.at(-1)({reason,rect:{...rect}});}};
}
test('prepared move waits matching actual rectangle event; stale resize and late old getters cannot commit',async()=>{
 const f=await waitingNativeRect();let settled=false;const moving=f.native.movePx({x:40,y:50}).then(rect=>{settled=true;return rect;});
 for(let i=0;i<5;i++)await Promise.resolve();assert.equal(settled,false);assert.equal(f.events.length,1);
 f.commit({left:0,top:0,width:100,height:100},0);await Promise.resolve();assert.equal(settled,false);
 f.commit();assert.deepEqual(await moving,{x:40,y:50,width:100,height:100});assert.equal(f.b.window.callbacks.size,0);await f.native.destroy();
});
test('destroy cancels rectangle wait and removes exact listener; late event stays inert',async()=>{
 const f=await waitingNativeRect();const moving=f.native.movePx({x:40,y:50});const rejected=assert.rejects(moving,{code:'DESTROYED'});rejected.catch(()=>{});
 for(let i=0;i<5;i++)await Promise.resolve();await f.native.destroy();await rejected;assert.equal(f.b.window.callbacks.size,0);f.commit();assert.equal(f.b.window.operations.filter(x=>x==='destroy').length,1);
});
test('rectangle deadline clears timer/listener and late actual event cannot revive wait',async()=>{
 const f=await waitingNativeRect();const set=globalThis.setTimeout,clear=globalThis.clearTimeout;let deadline;let cleared=0;
 globalThis.setTimeout=(callback,ms)=>{assert.equal(ms,1000);deadline=callback;return 1234;};globalThis.clearTimeout=handle=>{assert.equal(handle,1234);cleared++;};
 try {const moving=f.native.movePx({x:40,y:50});const rejected=assert.rejects(moving,{code:'CAPABILITY_UNSUPPORTED'});rejected.catch(()=>{});for(let i=0;i<5;i++)await Promise.resolve();deadline();await rejected;assert.equal(cleared,1);assert.equal(f.b.window.callbacks.size,0);f.commit();assert.equal(cleared,1);}
 finally {globalThis.setTimeout=set;globalThis.clearTimeout=clear;await f.native.destroy();}
});
test('confirmed no-op does not wait and platform clamping returns actual event coordinates',async()=>{
 const f=await waitingNativeRect();assert.deepEqual(await f.native.movePx({x:0,y:0}),{x:0,y:0,width:100,height:100});assert.equal(f.events.length,0);
 const moving=f.native.movePx({x:40,y:50});for(let i=0;i<5;i++)await Promise.resolve();f.commit({left:35,top:45,width:100,height:100});assert.deepEqual(await moving,{x:35,y:45,width:100,height:100});await f.native.destroy();
});
test('missing rectangle event capability rejects before submitting prepared movement',async()=>{
 const f=await waitingNativeRect();f.b.window.on=()=>{throw Object.assign(Error('unsupported'),{code:801});};await assert.rejects(f.native.movePx({x:40,y:50}),{code:'CAPABILITY_UNSUPPORTED',platformCode:801});assert.equal(f.b.window.operations.includes('move'),false);await f.native.destroy();
});

test('controller cancel during hidden preparation never shows business content and destroys the late native surface once',async()=>{
 const b=deferredWindowRect();const gate=deferred();const entered=deferred();const show=b.window.showWindow;
 b.window.showWindow=async()=>{entered.resolve();await gate.promise;await show();};
 const source=new ScopeContent();const p=new FxSystemPlatform(new b.api.FxNativeWindowFactory({},source),systemGeometry());
 const {FxController}=require('../work/core/core/FxController.js');const controller=new FxController(p,new FxConfig(),undefined,{error(){}});p.bindController(controller);
 const showing=controller.show();const rejected=assert.rejects(showing,{code:'DESTROYED'});rejected.catch(()=>{});
 await entered.promise;assert.equal(b.view.getSnapshot().visible,false);
 const cancel=controller.cancel();gate.resolve();await rejected;await cancel;
 assert.equal(b.window.operations.filter(x=>x==='show').length,1);assert.equal(b.window.operations.filter(x=>x==='destroy').length,1);assert.equal(source.disposals,1);assert.equal(controller.isShow(),false);
});
test('genuine permission error from preparation is cleaned before explicitly requested app fallback',async()=>{
 const b=deferredWindowRect();const source=new ScopeContent();b.window.failures.set('show',Object.assign(Error('permission denied'),{code:201}));let fallbackCount=0;
 const app=new FakePlatform();app.actualScope='app';
 const p=new FxSystemPlatform(new b.api.FxNativeWindowFactory({},source),systemGeometry(),()=>{assert.ok(b.window.operations.includes('destroy'));fallbackCount++;return app;});
 await p.create();assert.equal(p.actualScope,'app');assert.equal(fallbackCount,1);assert.equal(source.disposals,1);await p.destroy();
});

test('initial deferred event is consumed by preparation; formal show cannot replace confirmed movement with a stale getter',async()=>{
 const b=deferredWindowRect();const raw=b.window.getWindowProperties;let stale=true;
 b.window.getWindowProperties=()=>{const properties=raw();return {...properties,windowRect:stale?{left:0,top:0,width:0,height:0}:properties.windowRect};};
 const native=await new b.api.FxNativeWindowFactory({},new ScopeContent()).create();await native.resize({width:100,height:100});await native.movePx({x:0,y:0});
 await native.prepareGeometry();assert.deepEqual(native.getRect(),{x:0,y:0,width:100,height:100});
 assert.deepEqual(await native.movePx({x:70,y:350}),{x:70,y:350,width:100,height:100});
 await native.show();assert.deepEqual(native.getRect(),{x:70,y:350,width:100,height:100});await native.destroy();
});
test('deadline bounds a never-settling native call even after early rectangle; destroys unsafe window and ignores late completion',async()=>{
 const f=await waitingNativeRect();const gate=deferred();f.b.window.moveWindowTo=async()=>{await f.b.window.invoke('move');await gate.promise;};
 const set=globalThis.setTimeout,clear=globalThis.clearTimeout;let deadline,cleared=0;
 globalThis.setTimeout=(callback)=>{deadline=callback;return 1234;};globalThis.clearTimeout=()=>cleared++;
 try {let settled=false;const moving=f.native.movePx({x:40,y:50}).finally(()=>{settled=true;});const rejected=assert.rejects(moving,{code:'CAPABILITY_UNSUPPORTED'});rejected.catch(()=>{});
  for(let i=0;i<5;i++)await Promise.resolve();f.commit({left:40,top:50,width:100,height:100});assert.equal(settled,false);assert.equal(cleared,0,'early event must not clear overall deadline');
  deadline();for(let i=0;i<15;i++)await Promise.resolve();assert.equal(settled,true,'deadline must win pending native API');await rejected;assert.equal(f.b.window.callbacks.size,0);assert.equal(f.b.window.operations.filter(x=>x==='destroy').length,1);
  await assert.rejects(f.native.movePx({x:60,y:70}),{code:'DESTROYED'});gate.resolve();for(let i=0;i<10;i++)await Promise.resolve();f.commit({left:99,top:99,width:100,height:100});assert.notDeepEqual(f.native.getRect(),{x:99,y:99,width:100,height:100});await f.native.destroy();assert.equal(f.b.window.operations.filter(x=>x==='destroy').length,1);
 } finally {globalThis.setTimeout=set;globalThis.clearTimeout=clear;gate.resolve();await f.native.destroy();}
});
test('direct destruction wins pending native API without falsely completing pending native destruction',async()=>{
 const f=await waitingNativeRect();const moveGate=deferred(),destroyGate=deferred();f.b.window.moveWindowTo=()=>moveGate.promise;f.b.window.destroyWindow=async()=>{await f.b.window.invoke('destroy');await destroyGate.promise;};
 const moving=f.native.movePx({x:40,y:50});let rejected=false;const rejection=assert.rejects(moving,{code:'DESTROYED'}).then(()=>{rejected=true;});
 for(let i=0;i<5;i++)await Promise.resolve();let destroyed=false;const closing=f.native.destroy().then(()=>{destroyed=true;});const closingAgain=f.native.destroy();for(let i=0;i<10;i++)await Promise.resolve();assert.equal(rejected,true);assert.equal(destroyed,false);assert.equal(f.b.window.callbacks.size,0);
 destroyGate.resolve();await Promise.all([closing,closingAgain,rejection]);moveGate.resolve();f.commit();assert.equal(f.b.window.operations.filter(x=>x==='destroy').length,1);
});
test('public cancel proceeds after deadline aborts pending native movement',async()=>{
 const b=nativeBoundary();const p=new FxSystemPlatform(new b.api.FxNativeWindowFactory({},new ScopeContent()),systemGeometry());const {FxController}=require('../work/core/core/FxController.js');const controller=new FxController(p,new FxConfig({adsorb:false,position:{x:0,y:0}}),undefined,{error(){}});p.bindController(controller);await controller.show();
 const gate=deferred();b.window.moveWindowTo=()=>gate.promise;const set=globalThis.setTimeout,clear=globalThis.clearTimeout;let deadline;globalThis.setTimeout=(callback)=>{deadline=callback;return 1234;};globalThis.clearTimeout=()=>{};
 try {const moving=controller.move(40,50,false);moving.catch(()=>{});for(let i=0;i<20&&!deadline;i++)await Promise.resolve();let cancelled=false;const cancel=controller.cancel().then(()=>{cancelled=true;});deadline();for(let i=0;i<50;i++)await Promise.resolve();assert.equal(cancelled,true,'cancel must leave native tail');await cancel;await assert.rejects(moving);assert.equal(controller.getState(),'destroyed');assert.equal(b.window.callbacks.size,0);assert.equal(b.window.operations.filter(x=>x==='destroy').length,1);gate.resolve();
 }finally {globalThis.setTimeout=set;globalThis.clearTimeout=clear;gate.resolve();await controller.cancel();}
});
test('unconfirmed native operation automatically terminates public control; later changes cannot revive it and late rejection is observed',async()=>{
 const b=nativeBoundary();const p=new FxSystemPlatform(new b.api.FxNativeWindowFactory({},new ScopeContent()),systemGeometry());const {FxController}=require('../work/core/core/FxController.js');const controller=new FxController(p,new FxConfig({adsorb:false,position:{x:0,y:0}}),undefined,{error(){}});p.bindController(controller);await controller.show();
 const gate=deferred();b.window.moveWindowTo=()=>gate.promise;const set=globalThis.setTimeout,clear=globalThis.clearTimeout;let deadline;globalThis.setTimeout=(callback)=>{deadline=callback;return 1234;};globalThis.clearTimeout=()=>{};
 try {const moving=controller.move(40,50,false);const rejection=assert.rejects(moving,{code:'DESTROYED'});rejection.catch(()=>{});for(let i=0;i<30&&!deadline;i++)await Promise.resolve();assert.ok(deadline);deadline();for(let i=0;i<70;i++)await Promise.resolve();await rejection;await controller.cancel();assert.equal(controller.getState(),'destroyed');assert.equal(controller.isShow(),false);
  await assert.rejects(controller.show(),{code:'DESTROYED'});await assert.rejects(controller.move(60,70),{code:'DESTROYED'});await assert.rejects(controller.updateConfig(new FxConfig()),{code:'DESTROYED'});assert.equal(b.window.operations.filter(x=>x==='destroy').length,1);assert.equal(b.window.callbacks.size,0);gate.reject(Object.assign(Error('late native rejection'),{code:997}));for(let i=0;i<10;i++)await Promise.resolve();assert.equal(b.window.operations.filter(x=>x==='destroy').length,1);
 }finally {globalThis.setTimeout=set;globalThis.clearTimeout=clear;gate.resolve();await controller.cancel();}
});
test('native transaction error remains original even if event listener cleanup fails',async()=>{
 const f=await waitingNativeRect();const original=Object.assign(Error('native move failed'),{code:997});f.b.window.moveWindowTo=async()=>{throw original;};f.b.window.off=()=>{throw Error('listener cleanup failed');};await assert.rejects(f.native.movePx({x:40,y:50}),error=>error===original);await f.native.destroy();
});
test('unprepared geometry calls have an API deadline without awaiting impossible pre-show rectangle events',async()=>{
 for(const name of ['resize','moveWindowTo']){const b=nativeBoundary();const native=await new b.api.FxNativeWindowFactory({},new ScopeContent()).create();const gate=deferred();b.window[name]=()=>gate.promise;const set=globalThis.setTimeout,clear=globalThis.clearTimeout;let deadline;globalThis.setTimeout=callback=>{deadline=callback;return 1234;};globalThis.clearTimeout=()=>{};
  try {const operation=name==='resize'?native.resize({width:100,height:100}):native.movePx({x:10,y:10});const rejection=assert.rejects(operation,{code:'CAPABILITY_UNSUPPORTED'});rejection.catch(()=>{});deadline();for(let i=0;i<20;i++)await Promise.resolve();await rejection;assert.equal(native.terminated,true);assert.equal(b.window.callbacks.size,0);await native.destroy();assert.equal(b.window.operations.filter(x=>x==='destroy').length,1);gate.resolve();}
  finally {globalThis.setTimeout=set;globalThis.clearTimeout=clear;gate.resolve();await native.destroy();}
 }
});
test('rollback deadline after ordinary move failure terminates public control and cannot revive the retired window',async()=>{
 const b=nativeBoundary();const p=new FxSystemPlatform(new b.api.FxNativeWindowFactory({},new ScopeContent()),systemGeometry());const {FxController}=require('../work/core/core/FxController.js');const controller=new FxController(p,new FxConfig({adsorb:false,position:{x:0,y:0}}),undefined,{error(){}});p.bindController(controller);await controller.show();
 const late=deferred();let calls=0;b.window.moveWindowTo=async(x,y)=>{await b.window.invoke('move');if(++calls===1){b.window.properties.windowRect.left=x;b.window.properties.windowRect.top=y;throw Object.assign(Error('ordinary move failure after partial native movement'),{code:997});}await late.promise;};
 const set=globalThis.setTimeout,clear=globalThis.clearTimeout;let deadline;globalThis.setTimeout=callback=>{deadline=callback;return 1234;};globalThis.clearTimeout=()=>{};
 try {const moving=controller.move(40,50);const rejection=assert.rejects(moving,{code:'DESTROYED'});rejection.catch(()=>{});for(let i=0;i<50&&calls<2;i++)await Promise.resolve();assert.equal(calls,2,'ordinary failure must reach actual rollback call');deadline();for(let i=0;i<70;i++)await Promise.resolve();assert.equal(controller.getState(),'destroyed');assert.equal(controller.isShow(),false);assert.equal(p.isReadyToShow(),false);await rejection;
  await assert.rejects(controller.show(),{code:'DESTROYED'});await assert.rejects(controller.move(60,70),{code:'DESTROYED'});await assert.rejects(controller.updateConfig(new FxConfig()),{code:'DESTROYED'});await controller.cancel();assert.equal(b.window.callbacks.size,0);assert.equal(b.window.operations.filter(x=>x==='destroy').length,1);late.resolve();for(let i=0;i<10;i++)await Promise.resolve();assert.equal(b.window.operations.filter(x=>x==='destroy').length,1);
 }finally {globalThis.setTimeout=set;globalThis.clearTimeout=clear;late.resolve();await controller.cancel();}
});
