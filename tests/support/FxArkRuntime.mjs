import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
/** Execute production non-component .ets classes with only the SDK native node boundary substituted.
 * This is host behavioral coverage, not ArkTS or device acceptance. Genuine SDK build is separate. */
export function loadScopePlatform() {
 const root=path.resolve(import.meta.dirname,'../..');
 const source=path.join(root,'floatingx/src/main/ets/scope/FxScopePlatform.ets');
 const destination=path.join(root,'work/core/scope/FxScopePlatform.js');
 fs.mkdirSync(path.dirname(destination),{recursive:true});
 fs.writeFileSync(destination,ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText);
 globalThis.Curve={Ease:'ease',Linear:'linear',EaseIn:'in',EaseOut:'out',EaseInOut:'inout'};
 globalThis.TouchType={Down:0,Up:1,Move:2,Cancel:3};
 return require(destination).FxScopePlatform;
}
export class ScopeContext {
 finishes=[];
 animateTo(options,change) { change(); this.finishes.push(options.onFinish); }
}
export class ScopeContent {
 size={width:50,height:50}; mounts=[]; disposals=0;
 create(context) { this.mounts.push(context); return {content:{},dispose:()=>{this.disposals++;}}; }
}
export function loadAppPlatforms() {
 const root=path.resolve(import.meta.dirname,'../..');
 for(const file of ['FxWindowHost','FxAppPlatform']) {
  const destination=path.join(root,'work/core/app',file+'.js'); fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.writeFileSync(destination,ts.transpileModule(fs.readFileSync(path.join(root,'floatingx/src/main/ets/app',file+'.ets'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText);
 }
 const Module=require('node:module'); const original=Module._load;
 Module._load=function(name,...args) {
  if(name==='@ohos.window') return {default:{WindowEventType:{WINDOW_SHOWN:1,WINDOW_HIDDEN:2}}};
  if(name==='./FxAppFloatLayer') return {FxAppLayerParams:class {constructor(platform,revision){this.platform=platform;this.revision=revision;}},createAppLayer:(context,platform)=>({update(){},dispose(){context.overlay.disposals++;}})};
  return original.call(this,name,...args);
 };
 try { return {...require(path.join(root,'work/core/app/FxWindowHost.js')),...require(path.join(root,'work/core/app/FxAppPlatform.js'))}; }
 finally { Module._load=original; }
}
export class AppWindow {
 callbacks=new Map(); offCalls=[];
 overlay={nodes:new Set(),operations:[],disposals:0,addComponentContent(node){this.nodes.add(node);this.operations.push('add');},showComponentContent(node){if(!this.nodes.has(node))throw Error('not owned');this.operations.push('show');},hideComponentContent(node){this.operations.push('hide');},removeComponentContent(node){this.nodes.delete(node);this.operations.push('remove');}};
 context=Object.assign(new ScopeContext(),{overlay:this.overlay,getOverlayManager:()=>this.overlay});
 getUIContext(){return this.context;}
 isWindowShowing(){return true;}
 on(name,callback){this.callbacks.set(name,callback);}
 off(name,callback){this.offCalls.push(name);this.callbacks.delete(name);}
 emit(name,value){this.callbacks.get(name)?.(value);}
}
export function loadSystemAdapter(nativeBoundary) {
 loadScopePlatform();
 const root=path.resolve(import.meta.dirname,'../..');const destination=path.join(root,'work/core/system/FxWindowAdapter.js');fs.mkdirSync(path.dirname(destination),{recursive:true});
 fs.writeFileSync(destination,ts.transpileModule(fs.readFileSync(path.join(root,'floatingx/src/main/ets/system/FxWindowAdapter.ets'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText);
 const Module=require('node:module');const original=Module._load;
 Module._load=function(name,...args){
  if(name==='@ohos.window')return {default:{WindowType:{TYPE_FLOAT:8},createWindow:async config=>{nativeBoundary.created.push(config);return nativeBoundary.window;}}};
  if(name==='@ohos.display')return {default:{getDisplayByIdSync:id=>{nativeBoundary.displayReads.push(id);return nativeBoundary.display;},on:(_name,listener)=>{nativeBoundary.displayListener=listener;},off:()=>{nativeBoundary.displayListener=undefined;}}};
  if(name==='@ohos.abilityAccessCtrl')return {default:{GrantStatus:{PERMISSION_GRANTED:0},createAtManager:()=>({checkAccessToken:async(...args)=>{nativeBoundary.permissionReads.push(args);if(nativeBoundary.accessError)throw nativeBoundary.accessError;return nativeBoundary.grant;}})}};
  if(name==='@ohos.bundle.bundleManager')return {default:{BundleFlag:{GET_BUNDLE_INFO_WITH_APPLICATION:1},getBundleInfoForSelf:async()=>({appInfo:{accessTokenId:123}})}};
  return original.call(this,name,...args);
 };
 globalThis.LocalStorage=class{data=new Map();setOrCreate(k,v){this.data.set(k,v);}get(k){return this.data.get(k);}};
 delete require.cache[destination];
 try{return require(destination);}finally{Module._load=original;}
}
