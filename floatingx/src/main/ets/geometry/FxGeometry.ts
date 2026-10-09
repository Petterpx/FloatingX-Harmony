import { FxConfig } from '../core/FxConfig';
import { FxError } from '../core/FxError';
import { FxPoint, FxSize, FxBounds, FxViewport, FxProjection, FxGravity, FxEdgeAdsorb,
  FxEdge, FxPositionRecord } from '../core/FxTypes';

export interface FxGeometryInput {
  viewport: FxViewport;
  content: FxSize;
  config: FxConfig;
}

function finite(value: number, field: string, code: string = 'INVALID_GEOMETRY'): void {
  if (!Number.isFinite(value)) throw new FxError(code, field + ' must be finite');
}
function positive(value: number, field: string, code: string = 'INVALID_GEOMETRY'): void {
  finite(value, field, code);
  if (value <= 0) throw new FxError(code, field + ' must be positive');
}
function nonnegative(value: number, field: string): void {
  finite(value, field);
  if (value < 0) throw new FxError('INVALID_GEOMETRY', field + ' must not be negative');
}
function validatePoint(point: FxPoint, code: string = 'INVALID_GEOMETRY'): void {
  finite(point.x, 'position.x', code); finite(point.y, 'position.y', code);
}
function validateSize(size: FxSize, code: string = 'INVALID_GEOMETRY'): void {
  positive(size.width, 'width', code); positive(size.height, 'height', code);
}
function validateBounds(limits: FxBounds): void {
  finite(limits.minX, 'minX'); finite(limits.maxX, 'maxX');
  finite(limits.minY, 'minY'); finite(limits.maxY, 'maxY');
  if (limits.minX > limits.maxX || limits.minY > limits.maxY) {
    throw new FxError('INVALID_GEOMETRY', 'Bounds must not be reversed');
  }
}

/** Oversized content deterministically anchors at the leading inset + margin. */
export function bounds(input: FxGeometryInput): FxBounds {
  input.config.validate();
  validateSize(input.viewport.size); validateSize(input.content);
  const insets = input.viewport.insets;
  nonnegative(insets.left, 'insets.left'); nonnegative(insets.top, 'insets.top');
  nonnegative(insets.right, 'insets.right'); nonnegative(insets.bottom, 'insets.bottom');
  const margin = input.config.margin;
  const minX = insets.left + margin.left;
  const minY = insets.top + margin.top;
  const result: FxBounds = {
    minX: minX,
    maxX: Math.max(minX, input.viewport.size.width - insets.right - margin.right - input.content.width),
    minY: minY,
    maxY: Math.max(minY, input.viewport.size.height - insets.bottom - margin.bottom - input.content.height)
  };
  validateBounds(result);
  return result;
}

export function clamp(point: FxPoint, limits: FxBounds): FxPoint {
  validatePoint(point); validateBounds(limits);
  const result: FxPoint = {
    x: Math.max(limits.minX, Math.min(limits.maxX, point.x)),
    y: Math.max(limits.minY, Math.min(limits.maxY, point.y))
  };
  return result;
}

/** Explicit coordinates, including (0,0), win over gravity; offset applies to either choice. */
export function initial(input: FxGeometryInput): FxPoint {
  const limits = bounds(input);
  let x = limits.minX;
  let y = limits.minY;
  const position = input.config.position;
  if (position !== undefined) {
    x = position.x; y = position.y;
  } else {
    const gravity = input.config.gravity;
    if (gravity === FxGravity.TOP_CENTER || gravity === FxGravity.CENTER || gravity === FxGravity.BOTTOM_CENTER) {
      x = limits.minX + (limits.maxX - limits.minX) / 2;
    } else if (gravity === FxGravity.TOP_RIGHT || gravity === FxGravity.CENTER_RIGHT || gravity === FxGravity.BOTTOM_RIGHT) {
      x = limits.maxX;
    }
    if (gravity === FxGravity.CENTER_LEFT || gravity === FxGravity.CENTER || gravity === FxGravity.CENTER_RIGHT) {
      y = limits.minY + (limits.maxY - limits.minY) / 2;
    } else if (gravity === FxGravity.BOTTOM_LEFT || gravity === FxGravity.BOTTOM_CENTER || gravity === FxGravity.BOTTOM_RIGHT) {
      y = limits.maxY;
    }
  }
  const shifted: FxPoint = { x: x + input.config.offset.x, y: y + input.config.offset.y };
  return clamp(shifted, limits);
}

/** Released coordinates always become legal; rebound controls the adapter's animation, not legality. */
export function settle(point: FxPoint, input: FxGeometryInput): FxPoint {
  const limits = bounds(input);
  const result = clamp(point, limits);
  if (!input.config.adsorb) return result;
  switch (input.config.edgeAdsorb) {
    case FxEdgeAdsorb.LEFT: result.x = limits.minX; break;
    case FxEdgeAdsorb.RIGHT: result.x = limits.maxX; break;
    case FxEdgeAdsorb.TOP: result.y = limits.minY; break;
    case FxEdgeAdsorb.BOTTOM: result.y = limits.maxY; break;
    case FxEdgeAdsorb.LEFT_RIGHT:
      result.x = result.x - limits.minX <= limits.maxX - result.x ? limits.minX : limits.maxX;
      break;
    case FxEdgeAdsorb.TOP_BOTTOM:
      result.y = result.y - limits.minY <= limits.maxY - result.y ? limits.minY : limits.maxY;
      break;
  }
  return result;
}

function selectedEdge(point: FxPoint, limits: FxBounds, direction: FxEdgeAdsorb): FxEdge {
  switch (direction) {
    case FxEdgeAdsorb.LEFT: return point.x === limits.minX ? FxEdge.LEFT : FxEdge.NONE;
    case FxEdgeAdsorb.RIGHT: return point.x === limits.maxX ? FxEdge.RIGHT : FxEdge.NONE;
    case FxEdgeAdsorb.TOP: return point.y === limits.minY ? FxEdge.TOP : FxEdge.NONE;
    case FxEdgeAdsorb.BOTTOM: return point.y === limits.maxY ? FxEdge.BOTTOM : FxEdge.NONE;
    case FxEdgeAdsorb.LEFT_RIGHT:
      if (point.x === limits.minX) return FxEdge.LEFT;
      return point.x === limits.maxX ? FxEdge.RIGHT : FxEdge.NONE;
    case FxEdgeAdsorb.TOP_BOTTOM:
      if (point.y === limits.minY) return FxEdge.TOP;
      return point.y === limits.maxY ? FxEdge.BOTTOM : FxEdge.NONE;
  }
}

/** Native position and hit region describe only the visible slice; logical point stays full-sized. */
export function project(point: FxPoint, input: FxGeometryInput): FxProjection {
  const limits = bounds(input);
  const position = clamp(point, limits);
  const visibleSize: FxSize = { width: input.content.width, height: input.content.height };
  const contentOffset: FxPoint = { x: 0, y: 0 };
  const result: FxProjection = { position: position, visibleSize: visibleSize, contentOffset: contentOffset };
  if (!input.config.halfHide || input.config.halfHideRatio === 0) return result;
  const edge = selectedEdge(position, limits, input.config.edgeAdsorb);
  const hiddenWidth = input.content.width * input.config.halfHideRatio;
  const hiddenHeight = input.content.height * input.config.halfHideRatio;
  switch (edge) {
    case FxEdge.LEFT:
      visibleSize.width -= hiddenWidth; contentOffset.x = -hiddenWidth; break;
    case FxEdge.RIGHT:
      visibleSize.width -= hiddenWidth; position.x += hiddenWidth; break;
    case FxEdge.TOP:
      visibleSize.height -= hiddenHeight; contentOffset.y = -hiddenHeight; break;
    case FxEdge.BOTTOM:
      visibleSize.height -= hiddenHeight; position.y += hiddenHeight; break;
  }
  validatePoint(position); validateSize(visibleSize);
  return result;
}

function relative(value: number, oldMin: number, oldMax: number, newMin: number, newMax: number): number {
  if (oldMin === newMin && oldMax === newMax) return Math.max(newMin, Math.min(newMax, value));
  if (oldMin === oldMax) return newMin;
  const fraction = Math.max(0, Math.min(1, (value - oldMin) / (oldMax - oldMin)));
  return newMin + fraction * (newMax - newMin);
}

/**
 * Reconstructs the old range using current content/insets/margins, scales its relative coordinates,
 * then reapplies the stored edge. Version 1 has no historical content/inset data; exact historical
 * ratios cannot be recovered after those values change. The final point is always legal.
 */
export function restore(record: FxPositionRecord, input: FxGeometryInput): FxPoint {
  if (!record || record.version !== 1 || !record.position || !record.viewport) {
    throw new FxError('INVALID_POSITION_RECORD', 'Unsupported position record');
  }
  validatePoint(record.position, 'INVALID_POSITION_RECORD');
  validateSize(record.viewport, 'INVALID_POSITION_RECORD');
  const edges: FxEdge[] = [FxEdge.NONE, FxEdge.LEFT, FxEdge.RIGHT, FxEdge.TOP, FxEdge.BOTTOM];
  if (!edges.includes(record.edge)) throw new FxError('INVALID_POSITION_RECORD', 'Unknown stored edge');
  const limits = bounds(input);
  const oldViewport: FxViewport = { size: record.viewport, insets: input.viewport.insets };
  const oldInput: FxGeometryInput = { viewport: oldViewport, content: input.content, config: input.config };
  const oldLimits = bounds(oldInput);
  const result: FxPoint = {
    x: relative(record.position.x, oldLimits.minX, oldLimits.maxX, limits.minX, limits.maxX),
    y: relative(record.position.y, oldLimits.minY, oldLimits.maxY, limits.minY, limits.maxY)
  };
  switch (record.edge) {
    case FxEdge.LEFT: result.x = limits.minX; break;
    case FxEdge.RIGHT: result.x = limits.maxX; break;
    case FxEdge.TOP: result.y = limits.minY; break;
    case FxEdge.BOTTOM: result.y = limits.maxY; break;
  }
  return clamp(result, limits);
}
