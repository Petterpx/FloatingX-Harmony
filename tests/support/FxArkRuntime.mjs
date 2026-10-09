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
