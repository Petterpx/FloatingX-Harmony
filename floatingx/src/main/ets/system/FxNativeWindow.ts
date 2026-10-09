import { FxPoint, FxSize, FxViewport, FxProjection } from '../core/FxTypes';
import { FxGeometryInput } from '../geometry/FxGeometry';
import { FxConfig } from '../core/FxConfig';
import { FxController } from '../core/FxController';
export interface FxNativeViewport extends FxViewport { density: number; }
export interface FxNativeRect extends FxPoint, FxSize {}
/** Fresh page UIContext owns this optional view bridge. Native pixel operations stay below it. */
export interface FxSystemView {
  bindController(controller: FxController): void;
  applyConfig(config: FxConfig): Promise<void>;
  show(): Promise<void>; hide(): Promise<void>; destroy(): Promise<void>;
  cancelAnimations(): void;
  adoptPosition(point: FxPoint): void;
}
export interface FxSystemOwner {
  cancelAnimations(): void;
  move(point: FxPoint, animate: boolean): Promise<FxPoint>;
  moveFrame(point: FxPoint): void;
  getPosition(): FxPoint;
  getGeometry(): FxGeometryInput;
  getProjection(): FxProjection;
  attachView(view: FxSystemView): void;
  detachView(): void;
  layoutContent(size: FxSize): void;
  reportError(error: Error): void;
}
export interface FxNativeWindow {
  readonly requiresView?: boolean;
  load(owner: FxSystemOwner): Promise<void>;
  show(): Promise<void>; hide(): Promise<void>; destroy(): Promise<void>;
  resize(size: FxSize): Promise<void>;
  setTouchable(touchable: boolean): Promise<void>; setBackground(color: string): Promise<void>;
  movePx(point: FxPoint): Promise<FxNativeRect>;
  getViewport(): FxNativeViewport; getRect(): FxNativeRect;
  subscribe(listener: () => void): () => void;
}
export interface FxWindowFactory { checkAccess(): Promise<void>; create(): Promise<FxNativeWindow>; }
