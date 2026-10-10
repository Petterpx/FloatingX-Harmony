import { FxPlatform, FxScope, FxEvent, FxEventType, FxEventCallback } from '../core/FxPlatform';
import { FxController } from '../core/FxController';
import { FxConfig } from '../core/FxConfig';
import { FxError } from '../core/FxError';
import { FxPoint, FxSize, FxProjection, FxDisplayMode, FxAnimationCurve } from '../core/FxTypes';
import { FxGeometryInput, initial, clamp, bounds, project } from '../geometry/FxGeometry';
import { FxAnimation } from '../component/FxAnimation';
import { FxNativeWindow, FxWindowFactory, FxSystemView } from './FxNativeWindow';
export interface FxFrameClock { now(): number; wait(): Promise<void>; cancel(): void; }
class FxNativeClock implements FxFrameClock {
  private timer: number = -1; private finish?: () => void;
  now(): number { return Date.now(); }
  wait(): Promise<void> { return new Promise<void>((resolve) => {this.finish=resolve; this.timer=setTimeout(() => {this.finish=undefined;resolve();},16);}); }
  cancel(): void {clearTimeout(this.timer);const finish=this.finish;this.finish=undefined;if(finish!==undefined)finish();}
}
export interface FxFallbackPlatform extends FxPlatform {bindController?(controller: FxController): void;getGeometry?(): FxGeometryInput;}
export type FxFallbackFactory = () => FxFallbackPlatform;
/** Permission/capability strategy and transactional native projection; no SDK access in constructor. */
export class FxSystemPlatform implements FxPlatform {
  actualScope: FxScope = FxScope.SYSTEM;
  private factory: FxWindowFactory; private input: FxGeometryInput;
  private fallbackFactory?: FxFallbackFactory; private fallback?: FxFallbackPlatform;
  private onEvent?: FxEventCallback; private native?: FxNativeWindow; private view?: FxSystemView;
  private controller?: FxController; private releaseNative?: () => void; private releaseFallback?: () => void;
  private listeners: ((type: FxEventType) => void)[] = [];
  private position: FxPoint = {x:0,y:0}; private projection: FxProjection;
  private positioned: boolean = false; private destroyed: boolean = false;
  private tail: Promise<void> = Promise.resolve(); private animation: FxAnimation = new FxAnimation(); private clock: FxFrameClock;
  private pendingFrame?: FxPoint; private frameRunning: boolean = false;
  constructor(factory: FxWindowFactory, input: FxGeometryInput, fallbackFactory?: FxFallbackFactory, onEvent?: FxEventCallback, clock: FxFrameClock = new FxNativeClock()) {
    this.factory=factory;this.input={viewport:input.viewport,content:input.content,config:input.config===undefined?new FxConfig():input.config.copy()};
    this.fallbackFactory=fallbackFactory;this.onEvent=onEvent;this.clock=clock;this.projection=project(initial(this.input),this.input);
  }
  bindController(controller: FxController): void {this.controller=controller;if(this.view!==undefined)this.view.bindController(controller);}
  attachView(view: FxSystemView): void {if(this.destroyed)return;this.view=view;if(this.controller!==undefined)view.bindController(this.controller);this.lifecycle(FxEventType.ATTACH);}
  detachView(): void {this.view=undefined;this.lifecycle(FxEventType.DETACH);}
  subscribeLifecycle(listener: (type: FxEventType) => void): () => void {this.listeners.push(listener);return () => {const i=this.listeners.indexOf(listener);if(i>=0)this.listeners.splice(i,1);};}
  isHostVisible(): boolean {return !this.destroyed && (this.fallback===undefined || this.fallback.isHostVisible===undefined || this.fallback.isHostVisible());}
  isReadyToShow(): boolean {return this.fallback!==undefined ? this.fallback.isReadyToShow===undefined || this.fallback.isReadyToShow():this.native!==undefined && (!this.native.requiresView || this.view!==undefined);}
  getPosition(): FxPoint {return this.fallback!==undefined && this.fallback.getPosition!==undefined ? this.fallback.getPosition():{x:this.position.x,y:this.position.y};}
  getGeometry(): FxGeometryInput {return this.fallback!==undefined && this.fallback.getGeometry!==undefined?this.fallback.getGeometry():this.input;}
  getProjection(): FxProjection {return this.projection;}
  async create(): Promise<void> {
    this.assertAlive();if(this.native!==undefined || this.fallback!==undefined)return;
    try {
      await this.factory.checkAccess();this.assertAlive();this.native=await this.factory.create();this.assertAlive();
      this.releaseNative=this.native.subscribe(() => {this.cancelAnimations();this.observe(this.move(this.position,false));});
      await this.native.load(this);await this.native.setBackground('#00000000');
      await this.native.setTouchable(this.input.config.displayMode!==FxDisplayMode.DisplayOnly);
      await this.enqueueNative(async () => {await this.projectNative(initial(this.input));this.positioned=false;});
    } catch(error) {
      const cause=error as Error;await this.cleanupNative();
      if(!this.destroyed && this.fallbackFactory!==undefined && cause instanceof FxError && (cause.code==='PERMISSION_DENIED'||cause.code==='CAPABILITY_UNSUPPORTED')) {
        this.fallback=this.fallbackFactory();this.actualScope=FxScope.APP;
        if(this.controller!==undefined && this.fallback.bindController!==undefined)this.fallback.bindController(this.controller);
        if(this.fallback.subscribeLifecycle!==undefined)this.releaseFallback=this.fallback.subscribeLifecycle((type: FxEventType) => this.lifecycle(type));
        await this.fallback.create();
        const event: FxEvent={type:FxEventType.ERROR,position:this.getPosition(),actualScope:FxScope.APP,error:cause as FxError};
        if(this.onEvent!==undefined)this.onEvent(event);else if(this.controller!==undefined)this.controller.reportError(cause as Error);
        return;
      }
      throw cause as Error;
    }
  }
  async applyConfig(config: FxConfig): Promise<void> {
    this.assertAlive();if(this.fallback!==undefined){await this.fallback.applyConfig(config);this.input.config=config.copy();return;}
    const next=config.copy();this.cancelAnimations();
    await this.enqueueNative(async () => {
      this.assertAlive();const previous=this.input.config;this.input.config=next;
      try {await this.requireNative().setTouchable(next.displayMode!==FxDisplayMode.DisplayOnly);await this.projectNative(this.positioned?clamp(this.position,bounds(this.input)):initial(this.input));if(this.view!==undefined)await this.view.applyConfig(next);}
      catch(error){this.input.config=previous;try{await this.requireNative().setTouchable(previous.displayMode!==FxDisplayMode.DisplayOnly);}catch(_){}throw error as Error;}
    });
  }
  async show(): Promise<void> {this.assertAlive();if(this.fallback!==undefined)return this.fallback.show();if(this.view!==undefined)await this.view.show();try{await this.requireNative().show();}catch(error){if(this.view!==undefined)await this.view.hide();throw error as Error;}}
  async hide(): Promise<void> {this.cancelAnimations();if(this.fallback!==undefined)return this.fallback.hide();if(this.native!==undefined){await this.native.hide();if(this.view!==undefined)await this.view.hide();}}
  async move(point: FxPoint, animate: boolean): Promise<FxPoint> {
    this.pendingFrame=undefined;this.clock.cancel();return this.runMove(point,animate);
  }
  private async runMove(point: FxPoint, animate: boolean): Promise<FxPoint> {
    this.assertAlive();if(this.fallback!==undefined)return this.fallback.move(point,animate);
    const token=this.animation.begin();const target=clamp(point,bounds(this.input));const start=this.getPosition();const startTime=this.clock.now();
    const duration=animate && this.input.config.animation.enabled ? this.input.config.animation.durationMs:0;
    do {
      if(!this.animation.isCurrent(token))return this.getPosition();
      const fraction=duration===0?1:Math.min(1,(this.clock.now()-startTime)/duration);
      const t=this.curve(fraction);await this.enqueueProjection({x:start.x+(target.x-start.x)*t,y:start.y+(target.y-start.y)*t},token);
      if(fraction===1 || !this.animation.isCurrent(token))break;await this.clock.wait();
    } while(this.animation.isCurrent(token));
    return this.getPosition();
  }
  /** Coalesce drag frames while one native transaction is in flight. Final settle uses awaited move. */
  moveFrame(point: FxPoint): void {
    this.pendingFrame=point;if(this.frameRunning)return;this.frameRunning=true;
    this.observe(this.drainFrames().finally(() => {this.frameRunning=false;if(this.pendingFrame!==undefined && !this.destroyed)this.moveFrame(this.pendingFrame);}));
  }
  private async drainFrames(): Promise<void> {while(this.pendingFrame!==undefined && !this.destroyed){const point=this.pendingFrame;this.pendingFrame=undefined;await this.runMove(point,false);}}
  cancelAnimations(): void {this.animation.cancel();this.clock.cancel();this.pendingFrame=undefined;if(this.view!==undefined)this.view.cancelAnimations();if(this.fallback!==undefined && this.fallback.cancelAnimations!==undefined)this.fallback.cancelAnimations();}
  layoutContent(size: FxSize): void {
    if(this.destroyed || size.width<=0 || size.height<=0 || size.width===this.input.content.width && size.height===this.input.content.height)return;
    const next: FxSize={width:size.width,height:size.height};this.cancelAnimations();
    this.observe(this.enqueueNative(async () => {
      if(this.destroyed)return;const previous=this.input.content;this.input.content=next;
      try{await this.projectNative(this.position);}catch(error){this.input.content=previous;throw error as Error;}
    }));
  }
  reportError(error: Error): void {if(this.controller!==undefined)this.controller.reportError(error);}
  async destroy(): Promise<void> {
    if(this.destroyed)return;this.destroyed=true;this.cancelAnimations();
    try {if(this.fallback!==undefined)await this.fallback.destroy();else {await this.tail;await this.cleanupNative();}}
    finally {if(this.releaseFallback!==undefined)this.releaseFallback();this.releaseFallback=undefined;this.controller=undefined;this.listeners=[];this.fallback=undefined;}
  }
  private enqueueProjection(point: FxPoint, token: number): Promise<void> {
    return this.enqueueNative(async () => {if(!this.destroyed && this.animation.isCurrent(token))await this.projectNative(point,token);});
  }
  private enqueueNative(operation: () => Promise<void>): Promise<void> {
    const run=this.tail.then(operation);this.tail=run.then(()=>{},()=>{});return run;
  }
  private async projectNative(point: FxPoint, token?: number): Promise<void> {
    const native=this.requireNative();const viewport=native.getViewport();if(!Number.isFinite(viewport.density)||viewport.density<=0)throw new FxError('INVALID_GEOMETRY','Invalid target display density');
    this.input.viewport={size:viewport.size,insets:viewport.insets};const logical=clamp(point,bounds(this.input));const projection=project(logical,this.input);const d=viewport.density;
    const size: FxSize={width:Math.round(projection.visibleSize.width*d),height:Math.round(projection.visibleSize.height*d)};
    const previous=native.getRect();
    try {
      await native.resize(size);
      let actual=await native.movePx({x:Math.round(projection.position.x*d),y:Math.round(projection.position.y*d)});
      if((actual.width<=0 || actual.height<=0) && native.prepareGeometry!==undefined) {
        await native.prepareGeometry();actual=native.getRect();
      }
      if(this.destroyed || token!==undefined && !this.animation.isCurrent(token)) {
        if(previous.width>0 && previous.height>0) {await native.resize({width:previous.width,height:previous.height});await native.movePx({x:previous.x,y:previous.y});}return;
      }
      if(actual.width!==size.width||actual.height!==size.height)throw new FxError('CAPABILITY_UNSUPPORTED','Native window cannot represent requested visible slice');
      this.position={x:logical.x+(actual.x/d-projection.position.x),y:logical.y+(actual.y/d-projection.position.y)};
      this.positioned=true;this.projection={position:{x:actual.x/d,y:actual.y/d},visibleSize:projection.visibleSize,contentOffset:projection.contentOffset};
      if(this.view!==undefined)this.view.adoptPosition(this.position);
    } catch(error) {
      if(this.cancelIfTerminated(native))throw error as Error;
      // Restore the actual native rectangle; keep the last successful logical projection.
      try {if(previous.width>0 && previous.height>0) {await native.resize({width:previous.width,height:previous.height});await native.movePx({x:previous.x,y:previous.y});}}catch(rollback){this.cancelIfTerminated(native);throw rollback as Error;}
      throw error as Error;
    }
  }
  private cancelIfTerminated(native: FxNativeWindow): boolean {
    if(native.terminated!==true)return false;
    // Mark public state terminal now; queued cleanup must not be awaited inside its own transaction.
    if(this.controller!==undefined)this.controller.cancel().catch((failure: Error) => this.reportError(failure));
    else this.destroy().catch((failure: Error) => this.reportError(failure));
    return true;
  }
  private async cleanupNative(): Promise<void> {
    const native=this.native;this.native=undefined;const view=this.view;this.view=undefined;
    try {if(native!==undefined)await native.destroy();}
    finally {try{if(view!==undefined)await view.destroy();}finally{if(this.releaseNative!==undefined)this.releaseNative();this.releaseNative=undefined;if(native!==undefined)this.lifecycle(FxEventType.DETACH);}}
  }
  private curve(t: number): number {switch(this.input.config.animation.curve){case FxAnimationCurve.LINEAR:return t;case FxAnimationCurve.EASE_IN:return t*t;case FxAnimationCurve.EASE_OUT:return 1-(1-t)*(1-t);default:return t*t*(3-2*t);}}
  private requireNative(): FxNativeWindow {if(this.native===undefined)throw new FxError('NO_HOST','System window is not created');return this.native;}
  private assertAlive(): void {if(this.destroyed)throw new FxError('DESTROYED','System platform is destroyed');}
  private lifecycle(type: FxEventType): void {for(let i=0;i<this.listeners.length;i++)this.listeners[i](type);}
  private observe(promise: Promise<void> | Promise<FxPoint>): void {promise.catch((error: Error) => this.reportError(error));}
}
