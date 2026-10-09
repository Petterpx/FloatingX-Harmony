import common from '@ohos.app.ability.common';
import { FxController } from './core/FxController';
import { FxRegistry } from './core/FxRegistry';
import { FxError } from './core/FxError';
import { FxConfig } from './core/FxConfig';
import { FxState, FxEventType, FxEventCallback, FxLogger, FxPlatform, FxScope } from './core/FxPlatform';
import { FxSize } from './core/FxTypes';
import { FxContent } from './component/FxContent';
import { FxScopePlatform, FxInteractions } from './scope/FxScopePlatform';
import { bindScopeHost, releaseScopeHost } from './scope/FxHostBinding';
import { FxAppPlatform } from './app/FxAppPlatform';
import { FxWindowHost } from './app/FxWindowHost';
import { FxPagePolicy, copyPagePolicy } from './app/FxPageFilter';
import { FxSystemPlatform, FxFallbackFactory } from './system/FxSystemPlatform';
import { FxNativeWindowFactory } from './system/FxWindowAdapter';
import { FxStorage, positionStorageKey } from './storage/FxStorage';
import { FxGeometryInput } from './geometry/FxGeometry';

export interface FxControlHandle {
  show(): Promise<void>; hide(): Promise<void>; cancel(): Promise<void>;
  move(x: number,y: number,animate?: boolean): Promise<void>;
  moveByVector(x: number,y: number,animate?: boolean): Promise<void>;
  updateConfig(config: FxConfig): Promise<void>; clearPosition(): Promise<void>;
  getX(): number; getY(): number; isShow(): boolean; getState(): FxState;
}
export interface FxInstallStorageOptions { namespace: string; storage: FxStorage; }
export interface FxScopeStorageOptions extends FxInstallStorageOptions { key: string; }
interface FxContentOptions<T extends Object> {
  content: FxContent<T>; config: FxConfig; events?: FxEventCallback; interactions?: FxInteractions;
}
export interface FxScopeOptions<T extends Object> extends FxContentOptions<T> { storage?: FxScopeStorageOptions; }
export interface FxAppOptions<T extends Object> extends FxContentOptions<T> {
  tag: string; host: FxWindowHost; pagePolicy?: FxPagePolicy; storage?: FxInstallStorageOptions;
}
export interface FxSystemFallback { host: FxWindowHost; pagePolicy?: FxPagePolicy; }
export interface FxSystemOptions<T extends Object> extends FxContentOptions<T> {
  tag: string; context: common.UIAbilityContext; size: FxSize; fallback?: FxSystemFallback; storage?: FxInstallStorageOptions;
}
/** Retain the factory result to update content without erasing its parameter type. */
export class FxControl<T extends Object> implements FxControlHandle {
  private controller: FxController; private content: FxContent<T>;
  private release: () => void;
  constructor(controller: FxController, content: FxContent<T>, release: () => void) {
    this.controller=controller;this.content=content;this.release=release;
  }
  show(): Promise<void> { return this.controller.show(); }
  hide(): Promise<void> { return this.controller.hide(); }
  async cancel(): Promise<void> { try { await this.controller.cancel(); } finally { this.release();releaseScopeHost(this); } }
  move(x: number,y: number,animate: boolean = false): Promise<void> { return this.controller.move(x,y,animate); }
  moveByVector(x: number,y: number,animate: boolean = false): Promise<void> { return this.controller.moveByVector(x,y,animate); }
  updateConfig(config: FxConfig): Promise<void> { return this.controller.updateConfig(config); }
  clearPosition(): Promise<void> { return this.controller.clearPosition(); }
  async updateContent(params: T): Promise<void> {
    const generation=this.controller.getGeneration();
    const alive=() => generation===this.controller.getGeneration() && this.controller.getState()!==FxState.DESTROYING && this.controller.getState()!==FxState.DESTROYED;
    if(!alive()) throw new FxError('DESTROYED','FloatingX control has been destroyed');
    await this.content.update(params,alive);
    if(!alive()) throw new FxError('DESTROYED','Content update was canceled');
  }
  getX(): number { return this.controller.getX(); } getY(): number { return this.controller.getY(); }
  isShow(): boolean { return this.controller.isShow(); } getState(): FxState { return this.controller.getState(); }
}
const registry: FxRegistry=new FxRegistry();
const controls: Map<string,FxControlHandle>=new Map();
let logger: FxLogger | undefined;
function validate<T extends Object>(options: FxScopeOptions<T>): FxConfig {
  if(options===undefined || options===null || !(options.content instanceof FxContent) || !(options.config instanceof FxConfig)) throw new FxError('INVALID_CONFIG','Content and config are required');
  if(options.events!==undefined && typeof options.events!=='function')throw new FxError('INVALID_CONFIG','Events must be a callback');
  const size=options.content.size;
  if(size===undefined || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width<=0 || size.height<=0) throw new FxError('INVALID_CONFIG','Content size must be positive vp');
  if(options.storage!==undefined) {
    positionStorageKey(options.storage);
    if(options.storage.storage===undefined || typeof options.storage.storage.load!=='function' || typeof options.storage.storage.save!=='function' || typeof options.storage.storage.clear!=='function') throw new FxError('INVALID_CONFIG','Storage must provide load/save/clear');
  }
  return options.config.copy();
}
function installationOptions<T extends Object>(options: FxContentOptions<T>, tag: string, storage?: FxInstallStorageOptions): FxScopeOptions<T> {
  if(options===undefined || options===null)throw new FxError('INVALID_CONFIG','Options are required');
  return {content:options.content,config:options.config,events:options.events,interactions:options.interactions,
    storage:storage===undefined?undefined:{namespace:storage.namespace,key:tag,storage:storage.storage}};
}
function validateTag(tag: string): void {
  if(typeof tag!=='string' || tag.trim().length===0) throw new FxError('INVALID_CONFIG','A nonempty tag is required');
  if(registry.controlOrNull(tag)!==undefined) throw new FxError('DUPLICATE_TAG','Float tag is already installed');
}
function make<T extends Object>(options: FxScopeOptions<T>, config: FxConfig, platform: FxPlatform, geometry: () => FxGeometryInput, tag?: string): FxControl<T> {
  let control: FxControl<T>;
  const release=() => { if(tag!==undefined && controls.get(tag)===control) { controls.delete(tag);registry.unregister(tag,controller); } };
  const controller=new FxController(platform,config,(event) => {
    if(event.type===FxEventType.DESTROY) {release();releaseScopeHost(control);}
    if(options.events!==undefined)return options.events(event);
  },logger);
  control=new FxControl<T>(controller,options.content,release);
  if(options.storage!==undefined)controller.bindPositionStorage(options.storage,geometry);
  if(platform instanceof FxAppPlatform)platform.bindController(controller);
  else if(platform instanceof FxSystemPlatform)platform.bindController(controller);
  else if(platform instanceof FxScopePlatform) {platform.bindController(controller);bindScopeHost(control,{controller:controller,content:options.content,platform:platform});}
  if(tag!==undefined) {registry.register(tag,controller);controls.set(tag,control);}
  return control;
}
/** Factories validate immediately; native resource and access checks begin at show. */
export class FloatingX {
  static createScope<T extends Object>(options: FxScopeOptions<T>): FxControl<T> {
    const config=validate(options);const platform=new FxScopePlatform(options.interactions);
    return make(options,config,platform,() => platform.getGeometry());
  }
  static installApp<T extends Object>(options: FxAppOptions<T>): FxControl<T> {
    if(options===undefined || options===null)throw new FxError('INVALID_CONFIG','Options are required');
    const scoped=installationOptions(options,options.tag,options.storage);
    const config=validate(scoped);validateTag(options.tag);
    if(options.host===undefined || !options.host.isValid())throw new FxError('NO_HOST','A loaded WindowHost is required');
    const platform=new FxAppPlatform(options.host,options.content,options.pagePolicy,options.interactions);
    return make(scoped,config,platform,() => platform.getGeometry(),options.tag);
  }
  static installSystem<T extends Object>(options: FxSystemOptions<T>): FxControl<T> {
    if(options===undefined || options===null)throw new FxError('INVALID_CONFIG','Options are required');
    const scoped=installationOptions(options,options.tag,options.storage);
    const config=validate(scoped);validateTag(options.tag);
    if(options.context===undefined || options.context===null || options.size===undefined || !Number.isFinite(options.size.width) || !Number.isFinite(options.size.height) || options.size.width<=0 || options.size.height<=0)throw new FxError('INVALID_CONFIG','System context and positive size are required');
    let fallback: FxFallbackFactory | undefined;
    if(options.fallback!==undefined) {
      const selected=options.fallback;
      if(selected.host===undefined || !selected.host.isValid())throw new FxError('NO_HOST','Fallback requires a loaded WindowHost');
      const policy=copyPagePolicy(selected.pagePolicy===undefined?{mode:'blacklist',names:[]}:selected.pagePolicy);
      fallback=() => new FxAppPlatform(selected.host,options.content,policy,options.interactions);
    }
    const source=options.content;
    const input: FxGeometryInput={viewport:{size:{width:options.size.width,height:options.size.height},insets:{left:0,top:0,right:0,bottom:0}},content:{width:options.size.width,height:options.size.height},config:config};
    const platform=new FxSystemPlatform(new FxNativeWindowFactory(options.context,source,options.interactions),input,fallback);
    return make(scoped,config,platform,() => platform.getGeometry(),options.tag);
  }
  static control(tag: string): FxControlHandle { const control=controls.get(tag);if(control===undefined)throw new FxError('NOT_INSTALLED','Float tag is not installed');return control; }
  static controlOrNull(tag: string): FxControlHandle | undefined { return controls.get(tag); }
  static isInstalled(tag: string): boolean { return controls.has(tag); }
  static getAllTags(): string[] { return registry.getAllTags(); }
  static uninstall(tag: string): Promise<void> { return registry.uninstall(tag); }
  static uninstallAll(): Promise<void> { return registry.uninstallAll(); }
  static setLogger(value: FxLogger | undefined): void { logger=value; }
}
