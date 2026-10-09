import { FxConfig } from './FxConfig';
import { FxError } from './FxError';
import { FxPoint, FxPositionRecord } from './FxTypes';
import { FxGeometryInput, logicalEdge } from '../geometry/FxGeometry';
import { FxStorageOptions, storageError } from '../storage/FxStorage';
import { FxPositionSession } from '../storage/FxPositionSession';
import { FxPlatform, FxState, FxScope, FxEventType, FxEvent, FxEventCallback, FxLogger } from './FxPlatform';

interface FxNativeError { message: string; code?: number; }
type FxOperation = (events: FxEvent[]) => Promise<void>;

class FxConsoleLogger implements FxLogger {
  error(error: FxError): void { console.error('FloatingX ' + error.code + ': ' + error.message); }
}
class FxMoveRequest {
  x: number;
  y: number;
  relative: boolean;
  animate: boolean;
  completion?: Promise<void>;
  constructor(x: number, y: number, relative: boolean, animate: boolean) {
    this.x = x; this.y = y; this.relative = relative; this.animate = animate;
  }
}

function normalizeError(error: Error, code: string = 'WINDOW_OPERATION_FAILED'): FxError {
  if (error instanceof FxError) return error;
  if (error === null || error === undefined) return new FxError(code, 'Platform operation failed');
  const native = error as FxNativeError;
  const message = typeof native.message === 'string' ? native.message : 'Platform operation failed';
  const platformCode = typeof native.code === 'number' && Number.isFinite(native.code) ? native.code : undefined;
  return new FxError(code, message, platformCode);
}

/** Serial native operations, immediate cancellation, independent user and host intent. */
export class FxController {
  private platform?: FxPlatform;
  private config: FxConfig;
  private onEvent?: FxEventCallback;
  private logger: FxLogger;
  private scope: FxScope;
  private state: FxState = FxState.IDLE;
  private generation: number = 0;
  private created: boolean = false;
  private configured: boolean = false;
  private visible: boolean = false;
  private wanted: boolean = false;
  private hostVisible: boolean = true;
  private position: FxPoint = { x: 0, y: 0 };
  private tail: Promise<void> = Promise.resolve();
  private cancellation?: Promise<void>;
  private pendingMove?: FxMoveRequest;
  private positionSession?: FxPositionSession;
  private geometry?: () => FxGeometryInput;
  private showRequested: boolean = false;
  private restorationDone: boolean = false;
  private attached: boolean = false;
  private releaseLifecycle?: () => void;

  constructor(platform: FxPlatform, config: FxConfig, onEvent?: FxEventCallback, logger?: FxLogger) {
    this.platform = platform;
    this.config = config.copy();
    this.onEvent = onEvent;
    this.logger = logger === undefined ? new FxConsoleLogger() : logger;
    this.scope = platform.actualScope === undefined ? FxScope.SCOPE : platform.actualScope;
    if (platform.isHostVisible !== undefined) this.hostVisible = platform.isHostVisible();
    if (platform.subscribeLifecycle !== undefined) {
      this.releaseLifecycle = platform.subscribeLifecycle((type: FxEventType) => this.lifecycle(type));
    }
  }

  show(): Promise<void> {
    this.showRequested = true;
    const generation = this.generation;
    return this.enqueue(async (events: FxEvent[]) => {
      this.assertAlive(generation);
      this.wanted = true;
      await this.reconcileVisibility(generation, events);
    });
  }

  hide(): Promise<void> {
    this.interruptAnimations();
    const generation = this.generation;
    return this.enqueue(async (events: FxEvent[]) => {
      this.assertAlive(generation);
      this.wanted = false;
      await this.reconcileVisibility(generation, events);
    });
  }

  setHostVisible(visible: boolean): Promise<void> {
    if (this.state === FxState.DESTROYING || this.state === FxState.DESTROYED) return Promise.reject(this.destroyedError());
    if (!visible) this.interruptAnimations();
    // Physical host state is immediate; queued earlier notifications must never resurrect it.
    this.hostVisible = visible;
    const generation = this.generation;
    return this.enqueue(async (events: FxEvent[]) => {
      this.assertAlive(generation);
      await this.reconcileVisibility(generation, events);
    });
  }

  cancel(): Promise<void> {
    if (this.cancellation !== undefined) return this.cancellation;
    this.interruptAnimations();
    this.generation++;
    if (this.positionSession !== undefined) this.positionSession.close();
    this.wanted = false;
    this.state = FxState.DESTROYING;
    this.cancellation = this.enqueue(async (events: FxEvent[]) => {
      try {
        if ((this.created || this.releaseLifecycle !== undefined) && this.platform !== undefined) await this.platform.destroy();
        if (this.visible && this.releaseLifecycle !== undefined) events.push(this.event(FxEventType.HIDE));
        if (this.attached) events.push(this.event(FxEventType.DETACH));
        events.push(this.event(FxEventType.DESTROY));
      } finally {
        if (this.releaseLifecycle !== undefined) this.releaseLifecycle();
        this.releaseLifecycle = undefined;
        this.attached = false;
        this.created = false;
        this.configured = false;
        this.visible = false;
        this.pendingMove = undefined;
        this.positionSession = undefined;
        this.geometry = undefined;
        this.platform = undefined;
        this.state = FxState.DESTROYED;
      }
    }, undefined, true);
    // Detach callback references after the final destroy/error notification.
    this.cancellation.then(() => { this.onEvent = undefined; }, () => { this.onEvent = undefined; });
    return this.cancellation;
  }

  move(x: number, y: number, animate: boolean = false): Promise<void> {
    return this.queueMove(x, y, false, animate);
  }

  moveByVector(x: number, y: number, animate: boolean = false): Promise<void> {
    return this.queueMove(x, y, true, animate);
  }

  updateConfig(config: FxConfig): Promise<void> {
    let snapshot: FxConfig;
    try { snapshot = config.copy(); } catch (error) { return Promise.reject(normalizeError(error as Error)); }
    const generation = this.generation;
    return this.enqueue(async (events: FxEvent[]) => {
      this.assertAlive(generation);
      if (this.created) {
        await this.requirePlatform().applyConfig(snapshot.copy());
        this.assertAlive(generation);
      }
      this.config = snapshot;
      if (this.created) this.configured = true;
      if (this.created) this.readPosition();
      events.push(this.event(FxEventType.CONFIG));
    });
  }

  /** Internal installation binding. Keys use the scope at installation and never change on fallback. */
  bindPositionStorage(options: FxStorageOptions, geometry: () => FxGeometryInput): void {
    if (this.showRequested || this.created || this.positionSession !== undefined ||
      this.state === FxState.DESTROYING || this.state === FxState.DESTROYED) {
      throw new FxError('INVALID_CONFIG', 'Position storage must be bound once before showing');
    }
    const scoped: FxStorageOptions = { namespace: options.namespace, key: options.key,
      storage: options.storage, scope: this.scope };
    this.positionSession = new FxPositionSession(scoped, (error: FxError) => {
      this.dispatch([this.event(FxEventType.ERROR, error)]);
    });
    this.geometry = geometry;
  }

  /** Drag adapters update logical readback during frames, then call this once on drag end. */
  async savePosition(): Promise<void> {
    if (this.positionSession === undefined || this.state === FxState.DESTROYING || this.state === FxState.DESTROYED) return;
    try {
      this.readPosition();
      const input = this.geometryInput();
      const edge = logicalEdge(this.position, input);
      const record: FxPositionRecord = { version: 1,
        position: { x: this.position.x, y: this.position.y },
        viewport: { width: input.viewport.size.width, height: input.viewport.size.height }, edge: edge };
      await this.positionSession.save(record);
    } catch (error) { this.dispatch([this.event(FxEventType.ERROR, storageError(error as Error))]); }
  }

  clearPosition(): Promise<void> {
    return this.positionSession === undefined ? Promise.resolve() : this.positionSession.clear();
  }

  private geometryInput(): FxGeometryInput {
    if (this.geometry === undefined) throw new FxError('INVALID_GEOMETRY', 'Position storage requires geometry');
    const input = this.geometry();
    return { viewport: input.viewport, content: input.content, config: this.config };
  }

  getX(): number { this.readPositionSafely(); return this.position.x; }
  getY(): number { this.readPositionSafely(); return this.position.y; }
  isShow(): boolean { return this.visible; }
  getState(): FxState { return this.state; }
  getGeneration(): number { return this.generation; }

  private async reconcileVisibility(generation: number, events: FxEvent[]): Promise<void> {
    const shouldShow = this.wanted && this.hostVisible;
    if (!shouldShow) {
      if (this.visible) {
        await this.requirePlatform().hide();
        this.visible = false;
        this.refreshState();
        this.assertAlive(generation);
        events.push(this.event(FxEventType.HIDE));
      }
      return;
    }
    if (this.visible) return;
    this.state = FxState.SHOWING;
    try {
      const platform = this.requirePlatform();
      if (!this.created) {
        await platform.create();
        // Even a canceled successful create owns a native resource until cleanup.
        this.created = true;
        this.assertAlive(generation);
      }
      if (!this.configured) {
        await platform.applyConfig(this.config.copy());
        this.assertAlive(generation);
        this.configured = true;
        this.readPosition();
      }
      if (!this.restorationDone && this.positionSession !== undefined) {
        let point: FxPoint | undefined;
        try { point = await this.positionSession.restore(this.geometryInput()); }
        catch (error) { this.dispatch([this.event(FxEventType.ERROR, storageError(error as Error))]); }
        this.assertAlive(generation);
        this.restorationDone = true;
        if (point !== undefined) {
          try {
            const actual = await platform.move(point, false);
            this.assertAlive(generation);
            this.validatePoint(actual);
            this.position = { x: actual.x, y: actual.y };
          } catch (error) {
            this.assertAlive(generation);
            this.dispatch([this.event(FxEventType.ERROR, storageError(error as Error))]);
          }
        }
      }
      this.assertAlive(generation);
      if (!this.hostVisible) return;
      await platform.show();
      this.assertAlive(generation);
      if (!this.hostVisible) { await platform.hide(); return; }
      this.visible = true;
      this.assertAlive(generation);
      this.readPosition();
      events.push(this.event(FxEventType.SHOW));
    } finally { this.refreshState(); }
  }

  private queueMove(x: number, y: number, relative: boolean, animate: boolean): Promise<void> {
    if (this.state === FxState.DESTROYING || this.state === FxState.DESTROYED) return Promise.reject(this.destroyedError());
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return Promise.reject(new FxError('INVALID_GEOMETRY', 'Move coordinates must be finite'));
    }
    this.interruptAnimations();
    if (this.positionSession !== undefined) this.positionSession.markUserMove();
    const pending = this.pendingMove;
    if (pending !== undefined && pending.completion !== undefined) {
      pending.x = relative ? pending.x + x : x;
      pending.y = relative ? pending.y + y : y;
      if (!relative) pending.relative = false;
      pending.animate = animate;
      return pending.completion;
    }
    const request = new FxMoveRequest(x, y, relative, animate);
    const generation = this.generation;
    this.pendingMove = request;
    request.completion = this.enqueue(async (events: FxEvent[]) => {
      if (this.pendingMove === request) this.pendingMove = undefined;
      this.assertAlive(generation);
      this.readPosition();
      const point: FxPoint = {
        x: request.relative ? this.position.x + request.x : request.x,
        y: request.relative ? this.position.y + request.y : request.y
      };
      this.validatePoint(point);
      if (this.created) {
        const actual = await this.requirePlatform().move(point, request.animate);
        this.assertAlive(generation);
        this.validatePoint(actual);
        this.position = { x: actual.x, y: actual.y };
      } else {
        this.position = { x: point.x, y: point.y };
        this.config.position = { x: point.x, y: point.y };
      }
      await this.savePosition();
      this.assertAlive(generation);
      events.push(this.event(FxEventType.MOVE));
    }, request);
    return request.completion;
  }

  private enqueue(operation: FxOperation, move?: FxMoveRequest, cleanup: boolean = false): Promise<void> {
    if (move === undefined) this.pendingMove = undefined;
    const generation = this.generation;
    const events: FxEvent[] = [];
    const diagnostics: FxError[] = [];
    const result = this.tail.then(() => operation(events)).catch((error: Error) => {
      this.refreshState();
      const normalized = normalizeError(error);
      const canceled = !cleanup && (generation !== this.generation ||
        this.state === FxState.DESTROYING || this.state === FxState.DESTROYED);
      // Native failures remain diagnosable, while stale ordinary operations have
      // one stable cancellation outcome. Cleanup retains its own destroy error.
      if (canceled && normalized.code !== 'DESTROYED') diagnostics.push(normalized);
      const outcome = canceled ? this.destroyedError() : normalized;
      events.push(this.event(FxEventType.ERROR, outcome));
      throw outcome;
    });
    // Recover the queue before dispatching user code. No callback is awaited.
    this.tail = result.then(() => {}, () => {});
    return result.then(() => { this.dispatch(events, diagnostics); }, (error: Error) => {
      this.dispatch(events, diagnostics); throw error;
    });
  }

  /** Internal asynchronous UI callback failures share the controller error channel. */
  reportError(error: Error): void { this.dispatch([this.event(FxEventType.ERROR, normalizeError(error))]); }

  private interruptAnimations(): void {
    if (this.platform !== undefined && this.platform.cancelAnimations !== undefined) this.platform.cancelAnimations();
  }
  private lifecycle(type: FxEventType): void {
    if (this.state === FxState.DESTROYING || this.state === FxState.DESTROYED) return;
    if (type === FxEventType.ATTACH && !this.attached) {
      this.attached = true; this.hostVisible = true;
      this.dispatch([this.event(FxEventType.ATTACH)]);
      this.setHostVisible(true).catch(() => {});
    } else if (type === FxEventType.DETACH && this.attached) {
      this.interruptAnimations();
      this.attached = false; this.hostVisible = false;
      const events: FxEvent[] = [];
      if (this.visible) { this.visible = false; events.push(this.event(FxEventType.HIDE)); }
      events.push(this.event(FxEventType.DETACH));
      this.refreshState(); this.dispatch(events);
    }
  }

  private assertAlive(generation: number): void {
    if (generation !== this.generation || this.state === FxState.DESTROYING || this.state === FxState.DESTROYED) {
      throw this.destroyedError();
    }
  }
  private destroyedError(): FxError { return new FxError('DESTROYED', 'Controller has been canceled'); }
  private requirePlatform(): FxPlatform {
    if (this.platform === undefined) throw this.destroyedError();
    return this.platform;
  }
  private refreshState(): void {
    if (this.state === FxState.DESTROYING || this.state === FxState.DESTROYED) return;
    this.state = this.visible ? FxState.VISIBLE : (this.created ? FxState.HIDDEN : FxState.IDLE);
  }
  private validatePoint(point: FxPoint): void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new FxError('INVALID_GEOMETRY', 'Platform position must be finite');
  }
  private readPosition(): void {
    if (!this.created || this.platform === undefined || this.platform.getPosition === undefined) return;
    const point = this.platform.getPosition();
    this.validatePoint(point);
    this.position = { x: point.x, y: point.y };
  }
  private readPositionSafely(): void {
    if (this.state === FxState.DESTROYING || this.state === FxState.DESTROYED) return;
    try { this.readPosition(); } catch (error) { this.log(normalizeError(error as Error)); }
  }
  private event(type: FxEventType, error?: FxError): FxEvent {
    const scope = this.platform === undefined || this.platform.actualScope === undefined ? this.scope : this.platform.actualScope;
    this.scope = scope;
    return { type, position: { x: this.position.x, y: this.position.y }, actualScope: scope, error };
  }
  private dispatch(events: FxEvent[], diagnostics: FxError[] = []): void {
    for (let i = 0; i < diagnostics.length; i++) this.log(diagnostics[i]);
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.error !== undefined && event.error.code !== 'DESTROYED') this.log(event.error);
      if (this.onEvent !== undefined) {
        try { this.onEvent(event); } catch (error) { this.log(normalizeError(error as Error, 'EVENT_CALLBACK_FAILED')); }
      }
    }
  }
  private log(error: FxError): void {
    try { this.logger.error(error); } catch (_) { /* User logging cannot affect lifecycle cleanup. */ }
  }
}
