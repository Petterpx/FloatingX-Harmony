import window from '@ohos.window';
import display from '@ohos.display';
import abilityAccessCtrl from '@ohos.abilityAccessCtrl';
import bundleManager from '@ohos.bundle.bundleManager';
import common from '@ohos.app.ability.common';
import { UIContext } from '@ohos.arkui.UIContext';
import { FxError } from '../core/FxError';
import { FxConfig } from '../core/FxConfig';
import { FxController } from '../core/FxController';
import { FxPoint, FxSize } from '../core/FxTypes';
import { FxContentSource } from '../component/FxContent';
import { FxScopePlatform, FxScopeSnapshot, FxInteractions, FxScopeBoundary } from '../scope/FxScopePlatform';
import { FxNativeWindow, FxWindowFactory, FxNativeViewport, FxNativeRect, FxSystemOwner, FxSystemView } from './FxNativeWindow';

class FxSystemPageEntry {
  readonly owner: FxSystemOwner;readonly source: FxContentSource;readonly interactions: FxInteractions;
  constructor(owner: FxSystemOwner, source: FxContentSource, interactions: FxInteractions) {this.owner=owner;this.source=source;this.interactions=interactions;}
}
/** Only typed lookup is public; registry mutation/lifetime remains adapter-owned. */
const pageEntries: Map<string,FxSystemPageEntry> = new Map();
export class FxSystemPageRegistry {
  static find(id: string): FxSystemPageEntry | undefined {return pageEntries.get(id);}
}
/** View movement calls strategy.move, which calls native.movePx; native never calls view.move. */
class FxSystemBoundary implements FxScopeBoundary {
  displayPointers: boolean = true;
  private owner: FxSystemOwner;
  constructor(owner: FxSystemOwner) {this.owner=owner;}
  move(point: FxPoint, animate: boolean): Promise<FxPoint> {return this.owner.move(point,animate);}
  moveFrame(point: FxPoint): void {this.owner.moveFrame(point);}
}
export class FxSystemPageView implements FxSystemView {
  private engine: FxScopePlatform;
  interactions: FxInteractions;
  private owner: FxSystemOwner;
  private releaseContentSize?: () => void;
  private contentSize: FxSize;
  constructor(owner: FxSystemOwner, context: UIContext, source: FxContentSource, interactions: FxInteractions) {
    this.owner=owner;
    this.contentSize={width:owner.getGeometry().content.width,height:owner.getGeometry().content.height};
    this.interactions=interactions;this.engine=new FxScopePlatform(interactions,new FxSystemBoundary(owner));
    this.releaseContentSize=this.engine.subscribe(() => {
      const size=this.engine.getSnapshot().size;
      if(size.width===this.contentSize.width && size.height===this.contentSize.height)return;
      this.contentSize={width:size.width,height:size.height};this.owner.layoutContent(this.contentSize);
    });
    this.engine.mountHost(context,source);this.engine.layoutHost(owner.getGeometry().viewport.size,owner.getGeometry().viewport.insets);
  }
  async create(): Promise<void> {await this.engine.create();this.owner.attachView(this);}
  bindController(controller: FxController): void {this.engine.bindController(controller,false);}
  subscribe(listener: () => void): () => void {return this.engine.subscribe(listener);}
  getSnapshot(): FxScopeSnapshot {
    const input=this.engine.getSnapshot();const result=new FxScopeSnapshot();
    result.content=input.content;result.visible=input.visible;result.opacity=input.opacity;result.config=input.config;result.size=input.size;
    const projection=this.owner.getProjection();result.projection={position:{x:0,y:0},visibleSize:projection.visibleSize,contentOffset:projection.contentOffset};return result;
  }
  layoutContent(size: FxSize): void {this.engine.layoutContent(size);}
  handleTouch(event: TouchEvent): void {if(event.type===TouchType.Down && !this.engine.hasPrimaryPointer())this.owner.cancelAnimations();this.engine.handleTouch(event);}
  async applyConfig(config: FxConfig): Promise<void> {this.engine.layoutHost(this.owner.getGeometry().viewport.size,this.owner.getGeometry().viewport.insets);await this.engine.applyConfig(config);this.adoptPosition(this.owner.getPosition());}
  show(): Promise<void> {return this.engine.show();} hide(): Promise<void> {return this.engine.hide();}
  async destroy(): Promise<void> {
    if(this.releaseContentSize!==undefined)this.releaseContentSize();this.releaseContentSize=undefined;
    try{await this.engine.destroy();}finally{this.owner.detachView();}
  }
  cancelAnimations(): void {this.engine.cancelAnimations();this.engine.cancelTouch();}
  adoptPosition(point: FxPoint): void {
    const target=this.owner.getGeometry().viewport;const current=this.engine.getGeometry().viewport;
    if(target.size.width!==current.size.width || target.size.height!==current.size.height || target.insets.left!==current.insets.left || target.insets.top!==current.insets.top || target.insets.right!==current.insets.right || target.insets.bottom!==current.insets.bottom) {
      this.engine.layoutHost(target.size,target.insets);
    }
    this.engine.adoptPosition(point);
  }
}
interface FxWindowError extends Error {code?: number;}
/** A single in-flight native transaction owns its deadline and exact event listener. */
class FxRectReadback {
  readonly promise: Promise<FxNativeRect>;
  release: () => void = () => {};
  private resolve: (rect: FxNativeRect) => void = (_rect: FxNativeRect) => {};
  private reject: (error: FxError) => void = (_error: FxError) => {};
  private timer: number = -1;
  private finished: boolean = false;
  constructor() {
    this.promise=new Promise<FxNativeRect>((resolve,reject) => {this.resolve=resolve;this.reject=reject;});
    // Observe rejection immediately, even when the API throws before the wait starts.
    this.promise.catch(() => {});
    this.timer=setTimeout(() => this.fail(new FxError('CAPABILITY_UNSUPPORTED','Native rectangle change was not confirmed within one second')),1000);
  }
  isPending(): boolean {return !this.finished;}
  complete(rect: FxNativeRect): void {if(!this.finish())return;const resolve=this.resolve;this.clear();resolve(rect);}
  fail(error: FxError): void {if(!this.finish())return;const reject=this.reject;this.clear();reject(error);}
  private finish(): boolean {if(this.finished)return false;this.finished=true;clearTimeout(this.timer);this.timer=-1;return true;}
  private clear(): void {this.resolve=(_rect: FxNativeRect) => {};this.reject=(_error: FxError) => {};}
}
class FxWindowAdapter implements FxNativeWindow {
  readonly requiresView: boolean = true;
  private native: window.Window;private id: string;private source: FxContentSource;private interactions: FxInteractions;
  private touchable: boolean = true;private focusable: boolean = false;private hidden: boolean = false;
  private prepared: boolean = false;
  private disposed: boolean = false;
  private readbacks: FxRectReadback[] = [];
  private confirmed?: FxNativeRect;
  constructor(native: window.Window, id: string, source: FxContentSource, interactions: FxInteractions) {this.native=native;this.id=id;this.source=source;this.interactions=interactions;this.focusable=native.getWindowProperties().focusable;}
  async load(owner: FxSystemOwner): Promise<void> {
    pageEntries.set(this.id,new FxSystemPageEntry(owner,this.source,this.interactions));
    const storage: LocalStorage=new LocalStorage();storage.setOrCreate<string>('fxSystemInstanceId',this.id);
    await this.native.loadContentByName('FloatingXSystemPage',storage);
  }
  async prepareGeometry(): Promise<void> {
    if(this.disposed)throw new FxError('DESTROYED','Native window is released');
    if(this.prepared)return;
    // Target resize/move already succeeded. Only the transparent, input-disabled surface
    // is shown to commit its initially deferred rect; the content stays Hidden.
    this.hidden=true;
    try {
      await this.native.setWindowTouchable(false);await this.native.setWindowFocusable(false);
      const before=this.getRect();
      if(before.width<=0 || before.height<=0)await this.readTransaction(window.RectChangeReason.UNDEFINED,() => this.native.showWindow());
      else {await this.native.showWindow();this.confirmed=before;}
      if(this.disposed)throw new FxError('DESTROYED','Native window is released');
      this.prepared=true;
    } catch(error) {
      if(error instanceof FxError)throw error;
      const native=error as FxWindowError;
      throw new FxError(native.code===201?'PERMISSION_DENIED':native.code===801?'CAPABILITY_UNSUPPORTED':'WINDOW_OPERATION_FAILED',native.message,native.code);
    }
  }
  async show(): Promise<void> {
    const previous=this.native.getWindowProperties();
    try {await this.native.setWindowTouchable(this.touchable);await this.native.setWindowFocusable(this.touchable && this.focusable);await this.native.showWindow();this.hidden=false;this.prepared=true;}
    catch(error) {await this.restoreInteraction(previous.touchable,previous.focusable);throw error as Error;}
  }
  async hide(): Promise<void> {
    const previous=this.native.getWindowProperties();
    try {await this.native.setWindowTouchable(false);await this.native.setWindowFocusable(false);this.hidden=true;}
    catch(error) {await this.restoreInteraction(previous.touchable,previous.focusable);throw error as Error;}
  }
  private async restoreInteraction(touchable: boolean, focusable: boolean): Promise<void> {try{await this.native.setWindowTouchable(touchable);}finally{await this.native.setWindowFocusable(focusable);}}
  async destroy(): Promise<void> {
    if(this.disposed)return;this.disposed=true;
    const readbacks=this.readbacks;this.readbacks=[];let failure: Error | undefined;
    for(let i=0;i<readbacks.length;i++) {
      readbacks[i].fail(new FxError('DESTROYED','Native window is released'));
      try {readbacks[i].release();} catch(error) {if(failure===undefined)failure=error as Error;}
    }
    try {await this.native.destroyWindow();} catch(error) {if(failure===undefined)failure=error as Error;}
    finally {pageEntries.delete(this.id);}
    if(failure!==undefined)throw failure;
  }
  async resize(size: FxSize): Promise<void> {
    if(!this.prepared) {await this.native.resize(size.width,size.height);return;}
    const before=this.getRect();if(before.width===size.width && before.height===size.height)return;
    await this.readTransaction(window.RectChangeReason.UNDEFINED,() => this.native.resize(size.width,size.height));
  }
  async setTouchable(value: boolean): Promise<void> {
    const previous=this.native.getWindowProperties();
    try {await this.native.setWindowTouchable(this.hidden?false:value);await this.native.setWindowFocusable(!this.hidden && value && this.focusable);this.touchable=value;}
    catch(error){await this.restoreInteraction(previous.touchable,previous.focusable);throw error as Error;}
  }
  async setBackground(color: string): Promise<void> {this.native.setWindowBackgroundColor(color);}
  async movePx(point: FxPoint): Promise<FxNativeRect> {
    if(this.disposed)throw new FxError('DESTROYED','Native window is released');
    if(!this.prepared) {await this.native.moveWindowTo(point.x,point.y);return this.readProperties();}
    const before=this.getRect();if(before.x===point.x && before.y===point.y)return before;
    return this.readTransaction(window.RectChangeReason.MOVE,() => this.native.moveWindowTo(point.x,point.y));
  }
  private async readTransaction(reason: window.RectChangeReason, operation: () => Promise<void>): Promise<FxNativeRect> {
    const before=this.getRect();const wait=new FxRectReadback();this.readbacks.push(wait);let subscribed=false;let submitted=false;let completed=false;
    const changed=(event: window.RectChangeOptions) => {
      if(this.disposed || !submitted || !wait.isPending())return;
      if(reason===window.RectChangeReason.MOVE && event.reason!==window.RectChangeReason.MOVE)return;
      if(reason===window.RectChangeReason.UNDEFINED && event.reason!==window.RectChangeReason.UNDEFINED && event.rect.width===before.width && event.rect.height===before.height)return;
      const rect=event.rect;
      if(!Number.isFinite(rect.left) || !Number.isFinite(rect.top) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width<=0 || rect.height<=0)return;
      const actual: FxNativeRect={x:rect.left,y:rect.top,width:rect.width,height:rect.height};
      this.confirmed=actual;wait.complete(actual);
    };
    wait.release=() => {if(subscribed){subscribed=false;this.native.off('windowRectChange',changed);}};
    try {
      try {this.native.on('windowRectChange',changed);subscribed=true;}
      catch(error) {const native=error as FxWindowError;throw new FxError(native.code===801?'CAPABILITY_UNSUPPORTED':'WINDOW_OPERATION_FAILED',native.message,native.code);}
      submitted=true;await operation();const actual=await wait.promise;
      if(this.disposed)throw new FxError('DESTROYED','Native window is released');
      completed=true;return actual;
    } finally {
      if(submitted && !completed)this.confirmed=undefined;
      wait.fail(new FxError('DESTROYED','Native rectangle transaction is released'));
      try {wait.release();} finally {const index=this.readbacks.indexOf(wait);if(index>=0)this.readbacks.splice(index,1);}
    }
  }
  private readProperties(): FxNativeRect {const rect=this.native.getWindowProperties().windowRect;return {x:rect.left,y:rect.top,width:rect.width,height:rect.height};}
  getRect(): FxNativeRect {return this.confirmed===undefined ? this.readProperties():{x:this.confirmed.x,y:this.confirmed.y,width:this.confirmed.width,height:this.confirmed.height};}
  getViewport(): FxNativeViewport {
    const id=this.native.getWindowProperties().displayId;
    if(id===undefined)throw new FxError('CAPABILITY_UNSUPPORTED','Target window display id unavailable');
    const target=display.getDisplayByIdSync(id);const density=target.densityPixels;
    return {size:{width:target.width/density,height:target.height/density},insets:{left:0,top:0,right:0,bottom:0},density:density};
  }
  subscribe(listener: () => void): () => void {
    const changed=() => {this.confirmed=undefined;listener();};display.on('change',changed);
    return () => {display.off('change',changed);};
  }
}
let instanceSequence: number = 0;
/** SYSTEM_FLOAT_WINDOW is system_grant; checking never requests a user permission dialog. */
export class FxNativeWindowFactory implements FxWindowFactory {
  private context: common.UIAbilityContext;private source: FxContentSource;private interactions: FxInteractions;
  constructor(context: common.UIAbilityContext, source: FxContentSource, interactions: FxInteractions = {}) {this.context=context;this.source=source;this.interactions=interactions;}
  async checkAccess(): Promise<void> {
    try {
      const info=await bundleManager.getBundleInfoForSelf(bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
      const status=await abilityAccessCtrl.createAtManager().checkAccessToken(info.appInfo.accessTokenId,'ohos.permission.SYSTEM_FLOAT_WINDOW');
      if(status!==abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED)throw new FxError('PERMISSION_DENIED','SYSTEM_FLOAT_WINDOW is not granted; commercial HarmonyOS V5 restricts this permission to approved 2in1 scenarios');
    } catch(error) {if(error instanceof FxError)throw error;const native=error as FxWindowError;throw new FxError(native.code===201?'PERMISSION_DENIED':native.code===801?'CAPABILITY_UNSUPPORTED':'WINDOW_OPERATION_FAILED',native.message,native.code);}
  }
  async create(): Promise<FxNativeWindow> {
    const id='FloatingXSystem_'+(++instanceSequence).toString();
    let allocated: window.Window | undefined;
    try {allocated=await window.createWindow({name:id,windowType:window.WindowType.TYPE_FLOAT,ctx:this.context});return new FxWindowAdapter(allocated,id,this.source,this.interactions);}
    catch(error) {
      if(allocated!==undefined) {
        try{await allocated.destroyWindow();}
        catch(cleanup){const native=cleanup as FxWindowError;throw new FxError('WINDOW_OPERATION_FAILED',native.message,native.code);}
      }
      const native=error as FxWindowError;if(native.code===201)throw new FxError('PERMISSION_DENIED',native.message,native.code);if(native.code===801)throw new FxError('CAPABILITY_UNSUPPORTED',native.message,native.code);throw new FxError('WINDOW_OPERATION_FAILED',native.message,native.code);
    }
  }
}
