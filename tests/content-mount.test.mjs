import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);const ts=require('typescript');
const native={nodes:[],frames:[],slots:[],calls:[],fail:new Set()};
function call(name){native.calls.push(name);if(native.fail.has(name))throw Error(name+' failed');}
class ComponentContent {constructor(_ctx,_builder,params){this.params=params;native.nodes.push(this);}update(p){this.params=p;}dispose(){call('node.dispose');}}
class FrameNode {constructor(){this.measured={width:0,height:0};native.frames.push(this);this.commonEvent={setOnSizeChange:callback=>{call('size.observe');this.sizeCallback=callback;}};}getChildrenCount(){return this.children?.length??0;}getChild(i){return this.children[i];}setMeasuredSize(size){this.measured=size;}getMeasuredSize(){return this.measured;}addComponentContent(node){call('frame.add');this.node=node;}dispose(){call('frame.dispose');}}
class NodeContent {constructor(){native.slots.push(this);}addFrameNode(frame){call('slot.add');this.frame=frame;}removeFrameNode(frame){if(this.frame!==undefined)assert.equal(frame,this.frame);call('slot.remove');this.frame=undefined;}}
const destination=new URL('../work/core/component/FxContentMount.js',import.meta.url);fs.mkdirSync(new URL('.',destination),{recursive:true});
fs.writeFileSync(destination,ts.transpileModule(fs.readFileSync(new URL('../floatingx/src/main/ets/component/FxContent.ets',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText);
const Module=require('node:module');const original=Module._load;
Module._load=function(name,...args){if(name==='@ohos.arkui.node')return {ComponentContent,FrameNode,NodeContent};return original.call(this,name,...args);};
const {FxContent,contentSource}=require(destination.pathname);Module._load=original;
function source(){native.fail.clear();native.calls=[];return new FxContent({builder(){}},{label:'old'},{width:50,height:50});}
test('ContentSlot receives a mounted NodeContent bridge while typed updates keep original builder node',async()=>{
 const s=source();const m=contentSource(s).create({vp2px:v=>v,px2vp:p=>p});const node=native.nodes.at(-1);
 assert.ok(m.content instanceof NodeContent);assert.equal(m.content.frame.node,node);
 await s.update({label:'updated'});assert.equal(m.content.frame.node,node);assert.equal(node.params.label,'updated');
 m.dispose();assert.deepEqual(native.calls,['frame.add','slot.add','size.observe','size.observe','slot.remove','frame.dispose','node.dispose']);
 const releases=native.calls.length;m.dispose();assert.equal(native.calls.length,releases);
 await s.update({label:'after disposal'});assert.equal(node.params.label,'updated');
});
for(const stage of ['size.observe','slot.remove','frame.dispose','node.dispose'])test('mount cleanup attempts every release when '+stage+' throws',async()=>{
 const s=source();const m=contentSource(s).create({vp2px:v=>v,px2vp:p=>p});const node=native.nodes.at(-1);native.fail.add(stage);
 assert.throws(()=>m.dispose(),new RegExp(stage.replace('.','\\.')+' failed'));
 assert.deepEqual(native.calls.slice(-3),['slot.remove','frame.dispose','node.dispose']);
 await s.update({label:'late'});assert.equal(node.params.label,'old');
});
for(const stage of ['frame.add','slot.add','size.observe'])test('failed '+stage+' mount releases partial native allocation and can retry',()=>{
 const s=source();native.fail.add(stage);assert.throws(()=>contentSource(s).create({vp2px:v=>v,px2vp:p=>p}),new RegExp(stage.replace('.','\\.')+' failed'));
 assert.ok(native.calls.includes('frame.dispose'));assert.ok(native.calls.includes('node.dispose'));
 native.fail.clear();const m=contentSource(s).create({vp2px:v=>v,px2vp:p=>p});assert.ok(m.content instanceof NodeContent);m.dispose();
});
test('private frame measures full content under clipped constraints and observes resize in the owning UIContext',()=>{
 const s=source();const m=contentSource(s).create({vp2px:v=>v*2,px2vp:p=>p/2});const frame=native.frames.at(-1);const child={size:{width:100,height:100},measure(constraint){this.constraint=constraint;},getMeasuredSize(){return this.size;}};
 frame.children=[child];const sizes=[];m.observeSize(size=>sizes.push(size));
 frame.onMeasure({minSize:{width:0,height:0},maxSize:{width:50,height:100},percentReference:{width:50,height:100}});frame.sizeCallback();
 assert.deepEqual(child.constraint.percentReference,{width:100,height:100});assert.deepEqual(sizes,[{width:50,height:50}]);
 child.size={width:160,height:80};frame.onMeasure({minSize:{width:0,height:0},maxSize:{width:50,height:100},percentReference:{width:50,height:100}});frame.sizeCallback();
 assert.deepEqual(m.measure(),{width:80,height:40});assert.deepEqual(sizes.at(-1),{width:80,height:40});
 const late=frame.sizeCallback;m.dispose();assert.equal(frame.sizeCallback,undefined);late();assert.equal(sizes.length,2);assert.equal(m.measure(),undefined);
});
test('percentage root uses stable containing block through repeated full, clipped and restored layouts',()=>{
 const s=source();const m=contentSource(s).create({vp2px:v=>v*4,px2vp:p=>p/4});const frame=native.frames.at(-1);
 const child={size:{width:0,height:0},measure(c){this.size={width:c.percentReference.width*.5,height:c.percentReference.height*.5};},getMeasuredSize(){return this.size;}};frame.children=[child];
 for(const width of [200,200,100,100,200,200]){frame.onMeasure({minSize:{width:0,height:0},maxSize:{width,height:200},percentReference:{width,height:200}});assert.deepEqual(m.measure(),{width:25,height:25});}
 child.measure=function(){this.size={width:280,height:160};};frame.onMeasure({maxSize:{width:100,height:200}});assert.deepEqual(m.measure(),{width:70,height:40});
 child.measure=function(){this.size={width:120,height:80};};frame.onMeasure({maxSize:{width:100,height:200}});assert.deepEqual(m.measure(),{width:30,height:20});m.dispose();
});
