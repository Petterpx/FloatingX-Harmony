import { FxConfig } from './FxConfig';
import { FxError } from './FxError';
import { FxPoint } from './FxTypes';

export enum FxScope { SCOPE = 'scope', APP = 'app', SYSTEM = 'system' }
export enum FxState {
  IDLE = 'idle', SHOWING = 'showing', VISIBLE = 'visible', HIDDEN = 'hidden',
  DESTROYING = 'destroying', DESTROYED = 'destroyed'
}
export enum FxEventType {
  ATTACH = 'attach', DETACH = 'detach', SHOW = 'show', HIDE = 'hide', MOVE = 'move', CONFIG = 'config', DESTROY = 'destroy', ERROR = 'error'
}
export interface FxEvent {
  type: FxEventType;
  position: FxPoint;
  actualScope: FxScope;
  error?: FxError;
}
export type FxEventCallback = (event: FxEvent) => void;
export interface FxLogger { error(error: FxError): void; }

/** A rejecting operation must leave its last successful native state intact.
 * create owns rollback of partial allocations when it rejects. destroy must
 * release adapter-owned listeners/content in finally, even if native release fails.
 */
export interface FxPlatform {
  readonly actualScope?: FxScope;
  create(): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  move(point: FxPoint, animate: boolean): Promise<FxPoint>;
  applyConfig(config: FxConfig): Promise<void>;
  destroy(): Promise<void>;
  /** Logical vp position after native clamping, initial placement or host layout. */
  getPosition?(): FxPoint;
  /** Actual resource attachment, independent of user show intent. */
  subscribeLifecycle?(listener: (type: FxEventType) => void): () => void;
  isHostVisible?(): boolean;
  /** Optional second gate: create may attach an invisible root before native layout. */
  isReadyToShow?(): boolean;
  /** Must resolve interrupted native animation promises; called before queueing hide/cancel/move. */
  cancelAnimations?(): void;
}
