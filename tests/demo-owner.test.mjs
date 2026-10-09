import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {deferred} from './support/FxFakes.mjs';
const require=createRequire(import.meta.url);const ts=require('typescript');
const {FxError}=require('../work/core/core/FxError.js');
const root=path.resolve('entry/src/main/ets');const destination=path.resolve('work/demo-owner');
const registry=new Map();const created=[];
class NativeControl {
 state='idle';shows=0;cancellation;gate;
 constructor(tag){this.tag=tag;created.push(this);if(tag)registry.set(tag,this);}
 async show(){if(this.state==='destroyed'||this.state==='destroying')throw new FxError('DESTROYED','cancel');this.shows++;this.state='visible';}
 cancel(){if(this.cancellation)return this.cancellation;this.state='destroying';this.cancellation=(async()=>{if(this.gate)await this.gate.promise;this.state='destroyed';if(registry.get(this.tag)===this)registry.delete(this.tag);})();return this.cancellation;}
}
const fx={
 FxError,FxUninstallError:class extends FxError{},FxConfig:class{constructor(options){Object.assign(this,options);}},FxContent:class{},FxMemoryStorage:class{},FxPreferencesStorage:class{},
 FxGravity:{TOP_LEFT:'tl',TOP_CENTER:'tc',TOP_RIGHT:'tr',CENTER_LEFT:'cl',CENTER:'c',CENTER_RIGHT:'cr',BOTTOM_LEFT:'bl',BOTTOM_CENTER:'bc',BOTTOM_RIGHT:'br'},
 FxEdgeAdsorb:{LEFT:'l',RIGHT:'r',TOP:'t',BOTTOM:'b',LEFT_RIGHT:'lr',TOP_BOTTOM:'tb'},FxAnimationCurve:{EASE:'ease'},FxDisplayMode:{Normal:'normal'},
 FloatingX:{createScope:()=>new NativeControl(),installApp:options=>install(options),installSystem:options=>install(options),setLogger(){},isInstalled:tag=>registry.has(tag),controlOrNull:tag=>registry.get(tag),control:tag=>registry.get(tag),getAllTags:()=>[...registry.keys()],uninstall:async tag=>registry.get(tag)?.cancel()}
};
function install(options){if(registry.has(options.tag))throw new FxError('DUPLICATE_TAG','duplicate');return new NativeControl(options.tag);}
globalThis.wrapBuilder=()=>({});
for(const name of ['scopeContent','multipleContent','systemContent','appContent'])globalThis[name]=()=>{};
globalThis.NavPathStack=class{};
function emit(relative,source){const output=path.join(destination,relative+'.js');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText);return output;}
const Module=require('node:module');const original=Module._load;
Module._load=function(name,...args){if(name==='floatingx')return fx;return original.call(this,name,...args);};
emit('entryability/DemoOwner',fs.readFileSync(path.join(root,'entryability/DemoOwner.ets'),'utf8'));
const classes={};
for(const name of ['ScopeDemo','MultipleDemo','SystemDemo','AppDemo']){
 const source=fs.readFileSync(path.join(root,'pages/'+name+'.ets'),'utf8');
 // Only rendering DSL/decorators are removed. Actual field initializers, factory calls,
 // owner/lifecycle/async methods and even duplicate button callback are production code.
 const componentStart=source.indexOf('@Component');let prefix=source.slice(0,componentStart);const builderStart=prefix.indexOf('@Builder');if(builderStart>=0)prefix=prefix.slice(0,builderStart);
 let body=source.slice(componentStart).replace('@Component','').replace('export struct','export class');
 const renderStart=body.indexOf('  @Builder\n');const buildStart=body.indexOf('  build()');body=body.slice(0,renderStart>=0?renderStart:buildStart);
 body=body.replace(/@(State|LocalStorageLink|Watch)(\([^)]*\))?\s*/g,'');
 if(name==='MultipleDemo'){
  const line=source.split('\n').find(line=>line.includes("Button('重复 tag 错误')"));
  const callback=line.slice(line.indexOf('.onClick(')+9,line.lastIndexOf(')'));
  body+='  triggerDuplicate(): void {const action='+callback+';action();}\n';
 }
 const file=emit('pages/'+name,prefix+body+'}\n');classes[name]=require(file)[name];
}
Module._load=original;
function page(name,appear=true){registry.clear();created.length=0;const instance=new classes[name]();const host={setPage(){},isValid(){return true;}};instance.getUIContext=()=>({getSharedLocalStorage:()=>({get:key=>key==='fxWindowHost'?host:undefined}),getHostContext:()=>({})});if(appear)instance.aboutToAppear?.();return instance;}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('duplicate demonstration clicked first does not create an unowned float',async()=>{
 const p=page('MultipleDemo');p.triggerDuplicate();await tick();assert.deepEqual([...registry.keys()],[]);assert.equal(created.length,0);p.aboutToDisappear();
});
test('duplicate demonstration after uninstall does not recreate an unowned first',async()=>{
 const p=page('MultipleDemo');await p.open();await fx.FloatingX.uninstall('multiple-first');const count=created.length;p.triggerDuplicate();await tick();assert.equal(created.length,count);assert.deepEqual([...registry.keys()],['multiple-second']);p.aboutToDisappear();await tick();assert.equal(registry.size,0);
});
for(const name of ['ScopeDemo','MultipleDemo','SystemDemo']){
 test(name+' exit during deferred cancellation cannot create or show a replacement',async()=>{
  const p=page(name);if(name!=='ScopeDemo')await p.open(false);const old=name==='MultipleDemo'?p.first:p.control;const gate=deferred();old.gate=gate;
  const count=created.length;const replacing=name==='ScopeDemo'?p.place(fx.FxGravity.CENTER):p.open(false);await tick();p.aboutToDisappear();gate.resolve();await replacing;await tick();
  assert.equal(created.length,count);assert.equal(registry.size,0);assert.equal(created.every(c=>c.state==='destroyed'),true);
 });
 test(name+' concurrent replacements retain only the latest owned instance',async()=>{
  const p=page(name);if(name!=='ScopeDemo')await p.open(false);const old=name==='MultipleDemo'?p.first:p.control;const gate=deferred();old.gate=gate;
  const count=created.length;const first=name==='ScopeDemo'?p.place(fx.FxGravity.TOP_LEFT):p.open(false);const second=name==='ScopeDemo'?p.place(fx.FxGravity.BOTTOM_RIGHT):p.open(false);await tick();gate.resolve();const outcomes=await Promise.allSettled([first,second]);
  assert.equal(outcomes.every(o=>o.status==='fulfilled'),true);assert.equal(created.length,count+(name==='MultipleDemo'?2:1));p.aboutToDisappear();await tick();assert.equal(registry.size,0);assert.equal(created.every(c=>c.state==='destroyed'),true);
 });
}
test('AppDemo ready callback before appear or after exit never allocates a page float',async()=>{
 const p=page('AppDemo',false);p.ready=true;p.hostReady();assert.equal(created.length,0);p.aboutToAppear();assert.equal(created.length,1);p.aboutToDisappear();await tick();p.hostReady();assert.equal(created.length,1);assert.equal(registry.size,0);assert.equal(created[0].state,'destroyed');
});
test('page owner cancels an allocation if a factory synchronously exits the page',async()=>{
 registry.clear();created.length=0;const {DemoPageOwner}=require('../work/demo-owner/entryability/DemoOwner.js');const owner=new DemoPageOwner();owner.activate();
 await owner.replace([()=>{const control=new NativeControl('late');owner.close();return control;}],()=>assert.fail('must not publish after exit'));
 assert.equal(registry.size,0);assert.equal(created[0].state,'destroyed');assert.equal(created[0].shows,0);
});
test('page owner owns and releases partial factory success when the next factory fails',async()=>{
 registry.clear();created.length=0;const {DemoPageOwner}=require('../work/demo-owner/entryability/DemoOwner.js');const owner=new DemoPageOwner();owner.activate();
 await assert.rejects(owner.replace([()=>new NativeControl('first'),()=>{throw new FxError('DUPLICATE_TAG','second failed');}],()=>assert.fail('cannot publish partial allocation')),{code:'DUPLICATE_TAG'});
 assert.equal(registry.size,0);assert.equal(created[0].state,'destroyed');assert.equal(created[0].shows,0);
 await owner.replace([()=>new NativeControl('retry')],()=>{});await owner.close();assert.equal(registry.size,0);
});
