/** Public geometry uses vp in every scope. */
export interface FxPoint { x: number; y: number; }
export interface FxSize { width: number; height: number; }
export interface FxInsets { left: number; top: number; right: number; bottom: number; }
export interface FxBounds { minX: number; maxX: number; minY: number; maxY: number; }
export interface FxViewport { size: FxSize; insets: FxInsets; }
export interface FxProjection {
  position: FxPoint;
  visibleSize: FxSize;
  contentOffset: FxPoint;
}

export enum FxGravity {
  TOP_LEFT = 'top-left', TOP_CENTER = 'top-center', TOP_RIGHT = 'top-right',
  CENTER_LEFT = 'center-left', CENTER = 'center', CENTER_RIGHT = 'center-right',
  BOTTOM_LEFT = 'bottom-left', BOTTOM_CENTER = 'bottom-center', BOTTOM_RIGHT = 'bottom-right'
}
export enum FxEdgeAdsorb {
  LEFT = 'left', RIGHT = 'right', TOP = 'top', BOTTOM = 'bottom',
  LEFT_RIGHT = 'left-right', TOP_BOTTOM = 'top-bottom'
}
export enum FxDisplayMode { Normal = 'normal', ClickOnly = 'click-only', DisplayOnly = 'display-only' }
export enum FxAnimationCurve {
  LINEAR = 'linear', EASE = 'ease', EASE_IN = 'ease-in', EASE_OUT = 'ease-out', EASE_IN_OUT = 'ease-in-out'
}
export interface FxAnimationConfig {
  enabled: boolean;
  durationMs: number;
  curve: FxAnimationCurve;
}
export enum FxEdge { NONE = 'none', LEFT = 'left', RIGHT = 'right', TOP = 'top', BOTTOM = 'bottom' }
/** Version 1 stores logical full-content coordinates, never the clipped window position. */
export interface FxPositionRecord {
  version: number;
  position: FxPoint;
  viewport: FxSize;
  edge: FxEdge;
}
