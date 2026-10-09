import window from '@ohos.window';
import { UIContext, OverlayManager } from '@ohos.arkui.UIContext';
import { ComponentContent } from '@ohos.arkui.node';
import { FxController } from '../core/FxController';
import { FxError } from '../core/FxError';
import { FxViewport, FxSize } from '../core/FxTypes';

/** One loaded WindowStage. No process-global window or overlay operations. */
export class FxWindowHost {
  readonly uiContext: UIContext;
  readonly overlay: OverlayManager;
  private mainWindow: window.Window;
  private valid: boolean = true;
  private foreground: boolean;
  private page?: string;
  private listeners: (() => void)[] = [];
  private controllers: FxController[] = [];
  private disposal?: Promise<void>;
  private measured: FxSize = {width:1,height:1};
  private windowEvent: (event: window.WindowEventType) => void = (event) => {
    if(!this.valid) return;
    if(event===window.WindowEventType.WINDOW_SHOWN) this.foreground=true;
    else if(event===window.WindowEventType.WINDOW_HIDDEN) this.foreground=false;
    this.notify();
  };
  private sizeEvent: (size: window.Size) => void = (_size) => { this.notify(); };
  private avoidEvent: (area: window.AvoidAreaOptions) => void = (_area) => { this.notify(); };
  private constructor(mainWindow: window.Window) {
    this.mainWindow=mainWindow; this.uiContext=mainWindow.getUIContext(); this.overlay=this.uiContext.getOverlayManager();
    this.foreground=mainWindow.isWindowShowing();
  }
  /** Caller guard covers stage destruction while getMainWindow awaits. Call after loadContent completes. */
  static async create(stage: window.WindowStage, valid: () => boolean = () => true): Promise<FxWindowHost> {
    const mainWindow=await stage.getMainWindow();
    if(!valid()) throw new FxError('NO_HOST','WindowStage was destroyed during host creation');
    const host=new FxWindowHost(mainWindow);
    try {
      mainWindow.on('windowEvent',host.windowEvent); mainWindow.on('windowSizeChange',host.sizeEvent); mainWindow.on('avoidAreaChange',host.avoidEvent);
      return host;
    } catch(error) { await host.dispose(); throw error as Error; }
  }
  isValid(): boolean { return this.valid; }
  isForeground(): boolean { return this.valid && this.foreground; }
  getPage(): string | undefined { return this.page; }
  getViewport(): FxViewport {
    // Overlay follows Page safe area. Its measured content box is the origin; do not add window insets again.
    return {size:{width:this.measured.width,height:this.measured.height},insets:{left:0,top:0,right:0,bottom:0}};
  }
  measure(size: FxSize): void { if(this.valid && size.width>0 && size.height>0) this.measured={width:size.width,height:size.height}; }
  setPage(name: string): void { if(this.valid) { this.page=name; this.notify(); } }
  subscribe(listener: () => void): () => void {
    if(!this.valid) throw new FxError('NO_HOST','Window host is disposed');
    this.listeners.push(listener);
    return () => { const i=this.listeners.indexOf(listener); if(i>=0) this.listeners.splice(i,1); };
  }
  bind(controller: FxController): () => void {
    if(!this.valid) throw new FxError('NO_HOST','Window host is disposed');
    this.controllers.push(controller);
    return () => { const i=this.controllers.indexOf(controller); if(i>=0) this.controllers.splice(i,1); };
  }
  add<T extends Object>(content: ComponentContent<T>): void { if(!this.valid) throw new FxError('NO_HOST','Window host is disposed'); this.overlay.addComponentContent(content); }
  show<T extends Object>(content: ComponentContent<T>): void { if(this.valid) this.overlay.showComponentContent(content); }
  hide<T extends Object>(content: ComponentContent<T>): void { this.overlay.hideComponentContent(content); }
  remove<T extends Object>(content: ComponentContent<T>): void { this.overlay.removeComponentContent(content); }
  dispose(): Promise<void> {
    if(this.disposal!==undefined) return this.disposal;
    this.valid=false; this.foreground=false; // Synchronous invalidation precedes every asynchronous cleanup.
    this.notify();
    const controllers=this.controllers.slice(); this.controllers=[];
    this.disposal=this.cleanup(controllers); return this.disposal;
  }
  private async cleanup(controllers: FxController[]): Promise<void> {
    let failure: Error | undefined;
    try {
      for(let i=0;i<controllers.length;i++) { try { await controllers[i].cancel(); } catch(error) { if(failure===undefined) failure=error as Error; } }
    } finally {
      // Each listener release runs even when a previous native off throws.
      try { this.mainWindow.off('windowEvent',this.windowEvent); } catch(error) { if(failure===undefined) failure=error as Error; }
      try { this.mainWindow.off('windowSizeChange',this.sizeEvent); } catch(error) { if(failure===undefined) failure=error as Error; }
      try { this.mainWindow.off('avoidAreaChange',this.avoidEvent); } catch(error) { if(failure===undefined) failure=error as Error; }
      this.listeners=[];
    }
    if(failure!==undefined) throw failure;
  }
  private notify(): void { const listeners=this.listeners.slice(); for(let i=0;i<listeners.length;i++) listeners[i](); }
}
