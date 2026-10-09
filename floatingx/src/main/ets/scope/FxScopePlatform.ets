import { UIContext } from '@ohos.arkui.UIContext';
import { Content } from '@ohos.arkui.node';
import { FxPlatform, FxScope, FxEventType } from '../core/FxPlatform';
import { FxController } from '../core/FxController';
import { FxConfig } from '../core/FxConfig';
import { FxError } from '../core/FxError';
import { FxPoint, FxSize, FxViewport, FxProjection, FxDisplayMode, FxAnimationCurve } from '../core/FxTypes';
import { FxGeometryInput, initial, clamp, bounds, settle, project } from '../geometry/FxGeometry';
import { FxContentSource, FxContentMount } from '../component/FxContent';
import { FxTouch, FxPointer, FxTouchResult } from '../component/FxTouch';
import { FxAnimation } from '../component/FxAnimation';

export interface FxDragArea { x: number; y: number; width: number; height: number; }
export interface FxInteractions {
  dragArea?: FxDragArea;
  onClick?: () => void | Promise<void>;
  onLongPress?: () => void | Promise<void>;
  onDrag?: (position: FxPoint) => void | Promise<void>;
}
export class FxScopeSnapshot {
  content?: Content;
  visible: boolean = false;
  opacity: number = 1;
  config: FxConfig = new FxConfig();
  projection: FxProjection = { position:{x:0,y:0}, visibleSize:{width:1,height:1}, contentOffset:{x:0,y:0} };
  size: FxSize = {width:1,height:1};
}
/** Local adapter owns no global window. Coordinates refer to the measured host content area. */
export class FxScopePlatform implements FxPlatform {
  readonly actualScope: FxScope = FxScope.SCOPE;
  private controller?: FxController;
  private managesHostVisibility: boolean = true;
  private source?: FxContentSource;
  private mount?: FxContentMount;
  private context?: UIContext;
  private created: boolean = false;
  private attached: boolean = false;
  private destroyed: boolean = false;
  private positioned: boolean = false;
  private hostReady: boolean = false;
  private snapshot: FxScopeSnapshot = new FxScopeSnapshot();
  private position: FxPoint = {x:0,y:0};
  private viewport: FxViewport = {size:{width:1,height:1},insets:{left:0,top:0,right:0,bottom:0}};
  private listeners: (() => void)[] = [];
  private lifecycleListeners: ((type: FxEventType) => void)[] = [];
  private animation: FxAnimation = new FxAnimation();
  private finishAnimation?: () => void;
  private interactionGeneration: number = 0;
  private touch: FxTouch = new FxTouch('Normal',8,300,500);
  private primary?: FxPointer;
  private dragged: boolean = false;
  private longPressTimer: number = -1;
  interactions: FxInteractions;
  constructor(interactions: FxInteractions = {}) { this.interactions=interactions; }
  bindController(controller: FxController, managesHostVisibility: boolean = true): void { this.controller = controller; this.managesHostVisibility=managesHostVisibility; }
  getSnapshot(): FxScopeSnapshot { return this.snapshot; }
  getGeometry(): FxGeometryInput { return {viewport:this.viewport,content:this.snapshot.size,config:this.snapshot.config}; }
  getPosition(): FxPoint { return {x:this.position.x,y:this.position.y}; }
  isHostVisible(): boolean { return this.context !== undefined && this.hostReady; }
  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => { const i=this.listeners.indexOf(listener); if(i>=0) this.listeners.splice(i,1); };
  }
  subscribeLifecycle(listener: (type: FxEventType) => void): () => void {
    this.lifecycleListeners.push(listener);
    return () => { const i=this.lifecycleListeners.indexOf(listener); if(i>=0) this.lifecycleListeners.splice(i,1); };
  }
  mountHost(context: UIContext, source: FxContentSource): void {
    if(this.destroyed) return;
    if(this.context !== undefined) throw new FxError('INVALID_CONFIG','Scope adapter already has a host');
    this.context=context; this.source=source; this.snapshot.size={width:source.size.width,height:source.size.height};
    this.hostReady=false;
    // Wait for positive measured layout before restoring or showing.
  }
  layoutHost(size: FxSize): void {
    if(this.destroyed || size.width<=0 || size.height<=0) return;
    this.cancelAnimations(); this.cancelTouch();
    this.viewport.size={width:size.width,height:size.height};
    this.hostReady=true;
    if(this.created) this.attachContent();
    if(this.positioned) this.position=clamp(this.position,bounds(this.getGeometry()));
    this.refresh();
    if(this.controller !== undefined && this.managesHostVisibility) this.controller.setHostVisible(true).catch(() => {});
  }
  layoutContent(size: FxSize): void {
    if(size.width<=0 || size.height<=0 || (size.width===this.snapshot.size.width && size.height===this.snapshot.size.height)) return;
    this.cancelAnimations(); this.cancelTouch(); this.snapshot.size={width:size.width,height:size.height};
    if(this.positioned) this.position=clamp(this.position,bounds(this.getGeometry())); this.refresh();
  }
  unmountHost(): void {
    this.cancelAnimations(); this.cancelTouch(); this.snapshot.visible=false;
    this.context=undefined; this.hostReady=false;
    if(this.attached) { this.attached=false; this.lifecycle(FxEventType.DETACH); }
    if(this.controller !== undefined && this.managesHostVisibility) this.controller.setHostVisible(false).catch(() => {});
    try { this.releaseContent(); }
    catch(error) { if(this.controller!==undefined) this.controller.reportError(error as Error); }
    finally { this.source=undefined; this.refresh(); }
  }
  async create(): Promise<void> {
    this.assertAlive();
    if(this.context===undefined) throw new FxError('NO_HOST','Scope host is not mounted');
    this.created=true; this.attachContent();
  }
  async applyConfig(config: FxConfig): Promise<void> {
    this.cancelAnimations(); this.cancelTouch(); this.snapshot.config=config.copy();
    this.touch=new FxTouch(config.displayMode,8,config.clickIntervalMs,500);
    this.position=this.positioned ? clamp(this.position,bounds(this.getGeometry())) : initial(this.getGeometry());
    this.positioned=true; this.refresh();
  }
  async show(): Promise<void> {
    this.assertAlive(); if(this.context===undefined) return;
    this.snapshot.visible=true; this.snapshot.opacity=this.snapshot.config.animation.enabled ? 0:1; this.refresh();
    await this.animate(() => { this.snapshot.opacity=1; this.refresh(); },this.snapshot.config.animation.enabled);
  }
  async hide(beforeHidden?: () => void): Promise<void> {
    const visible=this.snapshot.visible; const opacity=this.snapshot.opacity;
    this.cancelAnimations(); this.cancelTouch();
    await this.animate(() => { this.snapshot.opacity=0; this.refresh(); },this.snapshot.config.animation.enabled);
    try { if(beforeHidden!==undefined) beforeHidden(); }
    catch(error) { this.snapshot.visible=visible; this.snapshot.opacity=opacity; this.refresh(); throw error as Error; }
    this.snapshot.visible=false; this.refresh();
  }
  async move(point: FxPoint, animate: boolean): Promise<FxPoint> {
    this.assertAlive(); const target=clamp(point,bounds(this.getGeometry()));
    await this.animate(() => { this.position=target; this.positioned=true; this.refresh(); },animate);
    return this.getPosition();
  }
  async destroy(): Promise<void> {
    this.cancelAnimations(); this.cancelTouch(); this.snapshot.visible=false;
    if(this.attached) { this.attached=false; this.lifecycle(FxEventType.DETACH); }
    try { this.releaseContent(); }
    finally {
      this.created=false; this.destroyed=true; this.context=undefined; this.hostReady=false; this.source=undefined;
      this.refresh(); this.listeners=[]; this.lifecycleListeners=[]; this.controller=undefined;
    }
  }
  cancelAnimations(): void {
    this.interactionGeneration++;
    this.animation.cancel();
    const finish=this.finishAnimation; this.finishAnimation=undefined; if(finish!==undefined) finish();
  }
  handleTouch(event: TouchEvent): void {
    if(this.snapshot.config.displayMode===FxDisplayMode.DisplayOnly) return;
    if(event.type===TouchType.Cancel) { const wasDragged=this.dragged; this.cancelTouch(); if(wasDragged) this.settleDrag(); return; }
    const changes=event.changedTouches;
    for(let i=0;i<changes.length;i++) {
      const native=changes[i];
      const pointer: FxPointer={id:native.id,x:native.windowX,y:native.windowY,timeMs:event.timestamp/1000000};
      if(event.type===TouchType.Down) {
        if(this.primary!==undefined) continue;
        this.cancelAnimations(); this.primary=pointer; this.dragged=false;
        this.touch.down(pointer,this.position);
        this.longPressTimer=setTimeout(() => {
          if(this.primary===undefined) return;
          const current=this.primary;
          this.deliver(this.touch.move({id:current.id,x:current.x,y:current.y,timeMs:pointer.timeMs+500}));
        },500);
      } else if(event.type===TouchType.Move) {
        if(this.primary!==undefined && pointer.id===this.primary.id) this.primary=pointer;
        this.deliver(this.touch.move(pointer));
      } else if(event.type===TouchType.Up) {
        const primary=this.primary!==undefined && pointer.id===this.primary.id;
        const result=this.touch.up(pointer);
        if(primary && result.kind==='end' && (result.position.x!==this.position.x || result.position.y!==this.position.y)) {
          this.position=result.position; this.dragged=true; this.refresh();
        }
        this.deliver(result);
        if(primary) { const wasDragged=this.dragged; this.cancelTouch(); if(wasDragged) this.settleDrag(); }
      }
    }
  }
  cancelTouch(): void { this.touch.cancel(); this.primary=undefined; clearTimeout(this.longPressTimer); this.longPressTimer=-1; this.dragged=false; }
  private deliver(result: FxTouchResult): void {
    try {
      if(result.kind==='drag') {
        this.dragged=true; clearTimeout(this.longPressTimer); this.position=result.position; this.refresh();
        if(this.interactions.onDrag!==undefined) {
          const callback=this.interactions.onDrag; this.runCallback(() => callback(this.getPosition()));
        }
      } else if(result.kind==='click' && this.interactions.onClick!==undefined) this.runCallback(this.interactions.onClick);
      else if(result.kind==='longPress' && this.interactions.onLongPress!==undefined) this.runCallback(this.interactions.onLongPress);
    } catch(error) { if(this.controller!==undefined) this.controller.reportError(error as Error); }
  }
  private runCallback(callback: () => void | Promise<void>): void {
    const result=callback(); if(result!==undefined) this.observe(result as Promise<void>);
  }
  private settleDrag(): void {
    const target=settle(this.position,this.getGeometry());
    const generation=this.controller===undefined ? -1:this.controller.getGeneration();
    const completed=this.move(target,this.snapshot.config.animation.enabled && this.snapshot.config.rebound);
    const interaction=this.interactionGeneration;
    this.observe(completed.then(async () => {
      if(this.controller!==undefined && this.controller.getGeneration()===generation && this.context!==undefined && this.interactionGeneration===interaction) await this.controller.savePosition();
    }));
  }
  private animate(change: () => void, enabled: boolean): Promise<void> {
    this.cancelAnimations(); const token=this.animation.begin(); const context=this.context;
    if(!enabled || context===undefined || this.snapshot.config.animation.durationMs===0) { change(); return Promise.resolve(); }
    return new Promise<void>((resolve) => {
      this.finishAnimation=resolve;
      const curve=this.snapshot.config.animation.curve;
      let nativeCurve=Curve.Ease;
      if(curve===FxAnimationCurve.LINEAR) nativeCurve=Curve.Linear;
      else if(curve===FxAnimationCurve.EASE_IN) nativeCurve=Curve.EaseIn;
      else if(curve===FxAnimationCurve.EASE_OUT) nativeCurve=Curve.EaseOut;
      else if(curve===FxAnimationCurve.EASE_IN_OUT) nativeCurve=Curve.EaseInOut;
      context.animateTo({duration:this.snapshot.config.animation.durationMs,curve:nativeCurve,onFinish:() => {
        if(!this.animation.isCurrent(token)) return;
        this.finishAnimation=undefined; resolve();
      }},() => { if(this.animation.isCurrent(token)) change(); });
    });
  }
  private attachContent(): void {
    if(this.mount!==undefined || this.context===undefined || this.source===undefined) return;
    this.mount=this.source.create(this.context); this.snapshot.content=this.mount.content; this.attached=true;
    this.refresh(); this.lifecycle(FxEventType.ATTACH);
  }
  private releaseContent(): void {
    const mount=this.mount; this.mount=undefined; this.snapshot.content=undefined;
    if(mount!==undefined) mount.dispose();
  }
  private refresh(): void {
    if(this.positioned) this.snapshot.projection=project(this.position,this.getGeometry());
    for(let i=0;i<this.listeners.length;i++) this.listeners[i]();
  }
  private lifecycle(type: FxEventType): void { for(let i=0;i<this.lifecycleListeners.length;i++) this.lifecycleListeners[i](type); }
  private observe(result: Promise<void>): void { result.catch((error: Error) => { if(this.controller!==undefined) this.controller.reportError(error); }); }
  private assertAlive(): void { if(this.destroyed) throw new FxError('DESTROYED','Scope platform is destroyed'); }
}
