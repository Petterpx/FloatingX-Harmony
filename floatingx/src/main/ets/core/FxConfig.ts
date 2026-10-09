import { FxError } from './FxError';
import { FxPoint, FxInsets, FxGravity, FxEdgeAdsorb, FxDisplayMode, FxAnimationConfig, FxAnimationCurve } from './FxTypes';

export interface FxConfigOptions {
  position?: FxPoint;
  gravity?: FxGravity;
  offset?: FxPoint;
  margin?: FxInsets;
  displayMode?: FxDisplayMode;
  adsorb?: boolean;
  edgeAdsorb?: FxEdgeAdsorb;
  rebound?: boolean;
  halfHide?: boolean;
  halfHideRatio?: number;
  animation?: FxAnimationConfig;
  clickIntervalMs?: number;
}

function requireFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) throw new FxError('INVALID_CONFIG', field + ' must be finite');
}
function requireNonnegative(value: number, field: string): void {
  requireFinite(value, field);
  if (value < 0) throw new FxError('INVALID_CONFIG', field + ' must not be negative');
}
function requireBoolean(value: boolean, field: string): void {
  if (typeof value !== 'boolean') throw new FxError('INVALID_CONFIG', field + ' must be boolean');
}

/** Owns nested option copies. copy() revalidates modifications before handing them to a controller. */
export class FxConfig {
  position?: FxPoint;
  gravity: FxGravity;
  offset: FxPoint;
  margin: FxInsets;
  displayMode: FxDisplayMode;
  adsorb: boolean;
  edgeAdsorb: FxEdgeAdsorb;
  rebound: boolean;
  halfHide: boolean;
  halfHideRatio: number;
  animation: FxAnimationConfig;
  clickIntervalMs: number;

  constructor(options: FxConfigOptions = {}) {
    if (options.position !== undefined) this.position = { x: options.position.x, y: options.position.y };
    this.gravity = options.gravity === undefined ? FxGravity.TOP_LEFT : options.gravity;
    this.offset = options.offset === undefined ? { x: 0, y: 0 } : { x: options.offset.x, y: options.offset.y };
    this.margin = options.margin === undefined ? { left: 0, top: 0, right: 0, bottom: 0 } :
      { left: options.margin.left, top: options.margin.top, right: options.margin.right, bottom: options.margin.bottom };
    this.displayMode = options.displayMode === undefined ? FxDisplayMode.Normal : options.displayMode;
    this.adsorb = options.adsorb === undefined ? true : options.adsorb;
    this.edgeAdsorb = options.edgeAdsorb === undefined ? FxEdgeAdsorb.LEFT_RIGHT : options.edgeAdsorb;
    this.rebound = options.rebound === undefined ? true : options.rebound;
    this.halfHide = options.halfHide === undefined ? false : options.halfHide;
    this.halfHideRatio = options.halfHideRatio === undefined ? 0.5 : options.halfHideRatio;
    this.animation = options.animation === undefined ? { enabled: false, durationMs: 300, curve: FxAnimationCurve.EASE } :
      { enabled: options.animation.enabled, durationMs: options.animation.durationMs, curve: options.animation.curve };
    this.clickIntervalMs = options.clickIntervalMs === undefined ? 300 : options.clickIntervalMs;
    this.validate();
  }

  validate(): void {
    if (this.position !== undefined) {
      requireFinite(this.position.x, 'position.x'); requireFinite(this.position.y, 'position.y');
    }
    requireFinite(this.offset.x, 'offset.x'); requireFinite(this.offset.y, 'offset.y');
    requireNonnegative(this.margin.left, 'margin.left'); requireNonnegative(this.margin.top, 'margin.top');
    requireNonnegative(this.margin.right, 'margin.right'); requireNonnegative(this.margin.bottom, 'margin.bottom');
    requireBoolean(this.adsorb, 'adsorb'); requireBoolean(this.rebound, 'rebound'); requireBoolean(this.halfHide, 'halfHide');
    requireFinite(this.halfHideRatio, 'halfHideRatio');
    if (this.halfHideRatio < 0 || this.halfHideRatio > 0.9) throw new FxError('INVALID_CONFIG', 'halfHideRatio must be in 0..0.9');
    requireNonnegative(this.clickIntervalMs, 'clickIntervalMs');
    requireBoolean(this.animation.enabled, 'animation.enabled');
    requireNonnegative(this.animation.durationMs, 'animation.durationMs');
    const gravities: FxGravity[] = [FxGravity.TOP_LEFT, FxGravity.TOP_CENTER, FxGravity.TOP_RIGHT,
      FxGravity.CENTER_LEFT, FxGravity.CENTER, FxGravity.CENTER_RIGHT,
      FxGravity.BOTTOM_LEFT, FxGravity.BOTTOM_CENTER, FxGravity.BOTTOM_RIGHT];
    const directions: FxEdgeAdsorb[] = [FxEdgeAdsorb.LEFT, FxEdgeAdsorb.RIGHT, FxEdgeAdsorb.TOP,
      FxEdgeAdsorb.BOTTOM, FxEdgeAdsorb.LEFT_RIGHT, FxEdgeAdsorb.TOP_BOTTOM];
    const modes: FxDisplayMode[] = [FxDisplayMode.Normal, FxDisplayMode.ClickOnly, FxDisplayMode.DisplayOnly];
    const curves: FxAnimationCurve[] = [FxAnimationCurve.LINEAR, FxAnimationCurve.EASE, FxAnimationCurve.EASE_IN,
      FxAnimationCurve.EASE_OUT, FxAnimationCurve.EASE_IN_OUT];
    if (!gravities.includes(this.gravity)) throw new FxError('INVALID_CONFIG', 'Unknown gravity');
    if (!directions.includes(this.edgeAdsorb)) throw new FxError('INVALID_CONFIG', 'Unknown edgeAdsorb');
    if (!modes.includes(this.displayMode)) throw new FxError('INVALID_CONFIG', 'Unknown displayMode');
    if (!curves.includes(this.animation.curve)) throw new FxError('INVALID_CONFIG', 'Unknown animation curve');
  }

  copy(): FxConfig {
    const options: FxConfigOptions = {
      position: this.position, gravity: this.gravity, offset: this.offset, margin: this.margin,
      displayMode: this.displayMode, adsorb: this.adsorb, edgeAdsorb: this.edgeAdsorb, rebound: this.rebound,
      halfHide: this.halfHide, halfHideRatio: this.halfHideRatio, animation: this.animation,
      clickIntervalMs: this.clickIntervalMs
    };
    return new FxConfig(options);
  }
}
